// insights.js — Smart Insights (v0.84; 1.2.2 HG-7: its own page).
//
// window.Insights works out rule-based insights from the store, 100 % on the
// device (no network, no model: "smart" means heuristics). Since 1.2.2 (HG-7,
// docs/smart-insights-plan.md) they live on the Insights page (#insights, a
// 5th tab, Views.InsightsView delegates to renderPage/attachPage); Home no
// longer has a fixed section.
//
// Load order: after widgets.js (whose month-to-date helpers it reuses) and
// before views.js. Loaded via <script defer> in index.html; editing this file
// means bumping its ?v= there.
//
// Correctness trap documented in home-widgets-plan.md §8b: anything built on
// getFilteredTransactions MUST use Widgets._monthToDateFilters, or fully
// materialised future occurrences of recurring series count as money already
// spent. The month-end outlook rule is the deliberate exception — it reuses
// computeBalanceForecast, whose EOM cutoff includes scheduled rows because a
// projection is the whole point (same math as the dashboard header).
//
// 1.2.2 (HG-7) model:
//   - facts: one pass over the ledger → the data tier (§5.1). Counted rows
//     follow the aggregate rule: income/expense only, no transfer legs, no
//     unpaid rows, nothing dated after today or before its account opened,
//     primary currency only.
//   - rules: { id, family, minTier, nameKey, compute(facts, state) } → an
//     item { score, figure, tone, dir?, head, body, href, filters?, viz? } or
//     null. `head`/`body` are built here from escaped params (plain text,
//     no markup in the dictionary), `figure` comes from Store formatters.
//   - ranking: attention items first (by score), then insights by score plus
//     a small offset hashed from id + today, so close calls change day to
//     day but never reshuffle within a day.

window.Insights = {

  // Page sections, in render order. 'attention' sits right under the
  // highlight card so it is always on the first screen.
  SECTIONS: ['attention', 'month', 'trends', 'accounts', 'tidy'],

  // Data tiers (plan §5.1): tier 0 below STARTER_ROWS counted rows; then by
  // complete calendar months (before this one) with at least
  // MONTH_MIN_ROWS counted rows.
  STARTER_ROWS: 5,
  MONTH_MIN_ROWS: 5,
  TIER_MONTHS: { 2: 1, 3: 3, 4: 12 },

  // ── Facts ─────────────────────────────────────────────────────────────────
  _facts(state) {
    const S = window.Store;
    const today = S._todayYMD();
    const ym = today.slice(0, 7);
    let rows = 0;
    const monthRows = {};
    (state.transactions || []).forEach(tx => {
      if (tx.type !== 'income' && tx.type !== 'expense') return;
      if (tx.transferRef) return;
      if (tx.isPaid === false) return;
      if (!tx.date || tx.date > today) return;
      if (!S._isPrimaryAccount(tx.accountId)) return;
      if (S._isTxBeforeOpeningDate(tx)) return;
      rows++;
      const m = tx.date.slice(0, 7);
      monthRows[m] = (monthRows[m] || 0) + 1;
    });
    const completeMonths = Object.keys(monthRows)
      .filter(m => m < ym && monthRows[m] >= this.MONTH_MIN_ROWS).length;
    let tier = 1;
    if (rows < this.STARTER_ROWS) tier = 0;
    else if (completeMonths >= this.TIER_MONTHS[4]) tier = 4;
    else if (completeMonths >= this.TIER_MONTHS[3]) tier = 3;
    else if (completeMonths >= this.TIER_MONTHS[2]) tier = 2;
    const [y, m, d] = today.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    return { today, ym, day: d, daysInMonth, rows, completeMonths, tier };
  },

  // ── Small helpers ─────────────────────────────────────────────────────────
  _esc(value) {
    return window.I18n.esc(value); // 1.0.2 (BUG-24): one implementation
  },

  // t() with every param escaped first: names are user input, and the
  // dictionary holds no markup, so the result is safe to place as text.
  _t(key, params) {
    const safe = {};
    Object.keys(params || {}).forEach(k => {
      safe[k] = typeof params[k] === 'number' ? params[k] : this._esc(params[k]);
    });
    return window.I18n.t(key, safe);
  },

  _pct(p) { return window.Store.formatPercent(p, { digits: 0 }); },

  _money(amount, signed) {
    const s = window.Store.formatCurrency(amount, null, { whole: true });
    return signed && amount > 0 ? '+' + s : s;
  },

  // "Then A (31 %) and B (16 %)." for the next one or two shares.
  _rest(list, onlyKey) {
    if (list.length >= 2) {
      return this._t('insight.rest.two', { a: list[0].name, pa: this._pct(list[0].pct), b: list[1].name, pb: this._pct(list[1].pct) });
    }
    if (list.length === 1) return this._t('insight.rest.one', { a: list[0].name, pa: this._pct(list[0].pct) });
    return onlyKey ? window.I18n.t(onlyKey) : '';
  },

  // Split-bar data for the highlight card: the top three and the rest.
  _split(parts) {
    const top = parts.slice(0, 3).map(p => ({ label: p.name, pct: p.pct, color: p.color || '#94a3b8' }));
    const rest = parts.slice(3).reduce((s, p) => s + p.pct, 0);
    if (rest > 0.5) top.push({ label: '', pct: rest, color: 'var(--text-tertiary)' });
    return { type: 'split', parts: top };
  },

  // Daily offset 0–8 (FNV-1a of id + day): stable all day, varies by day.
  _rotation(id, today) {
    let h = 2166136261;
    const s = id + '|' + today;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 9;
  },

  _historyFilters(categoryId) {
    return { page: 'history', filters: { categories: [categoryId] }, replace: true };
  },

  // ── Rules ─────────────────────────────────────────────────────────────────
  rules: [
    {
      // v1.08 B4: bank transactions fetched in the background and waiting
      // for review (in memory only — see BankConnect._pending). No network.
      id: 'bankNew',
      family: 'attention',
      minTier: 0,
      nameKey: 'insight.name.bank',
      compute(facts, state) {
        const BC = window.BankConnect;
        if (!BC || !BC.isEnabled(state)) return null;
        const s = BC.pendingSummary(state);
        if (!s.total) return null;
        const I = window.Insights;
        const bank = s.banks.length > 1 ? window.I18n.t('insight.bankSeveral', { count: s.banks.length }) : s.banks[0].name;
        return {
          score: 95,
          figure: String(s.total),
          tone: '',
          head: I._t('insight.bankNew.head', { count: s.total, bank }),
          body: window.I18n.t('insight.bankNew.body'),
          href: '#bank-connect',
          params: { count: s.total, bank }
        };
      }
    },
    {
      // v1.08 B4: a bank consent that expired or expires within 14 days.
      id: 'bankReconnect',
      family: 'attention',
      minTier: 0,
      nameKey: 'insight.name.bank',
      compute(facts, state) {
        const BC = window.BankConnect;
        if (!BC || !BC.isEnabled(state)) return null;
        const I = window.Insights;
        const conns = BC.connections(state);
        const expired = conns.find(c => BC.connectionStatus(state, c) === 'expired');
        if (expired) {
          return {
            variant: 'expired', score: 90, tone: 'bad',
            figure: window.I18n.t('insight.bankExpiredValue'),
            head: I._t('insight.bankExpired.head', { bank: expired.institutionName }),
            body: window.I18n.t('insight.bank.reconnect'),
            href: '#bank-connect',
            params: { bank: expired.institutionName }
          };
        }
        const expiring = conns.find(c => BC.connectionStatus(state, c) === 'expiring');
        if (!expiring) return null;
        const days = Math.max(0, BC.daysUntil(expiring.expiresAt) || 0);
        return {
          variant: 'expiring', score: 85, tone: '',
          figure: window.I18n.t('insight.bankDays', { count: days }),
          head: I._t('insight.bankExpiring.head', { bank: expiring.institutionName }),
          body: window.I18n.t('insight.bank.reconnect'),
          href: '#bank-connect',
          params: { bank: expiring.institutionName, days }
        };
      }
    },
    {
      // Month-end outlook: projected savings (or shortfall) at EOM — the
      // exact computeBalanceForecast figure the dashboard header shows.
      id: 'monthOutlook',
      family: 'month',
      minTier: 1,
      nameKey: 'insight.name.outlook',
      compute() {
        // Gate on the forecast's OWN inputs, not just MTD actuals: on day 1 of
        // a month a recurring-only user has zero MTD activity but real
        // scheduled rows — the projection is live and must not flicker away
        // at every month boundary (review finding, v0.84).
        const S = window.Store;
        const summary = S.computeAnalyticalSummary(window.Widgets._monthToDateFilters({}));
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const eom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`;
        const upcoming = S.computeUpcomingImpact(eom);
        const hasActuals = summary && (summary.income > 0 || summary.expense > 0);
        const hasScheduled = upcoming && upcoming.count > 0;
        if (!hasActuals && !hasScheduled) return null;
        const forecast = S.computeBalanceForecast([]);
        if (!forecast || typeof forecast.eomAbsDiff !== 'number' || !isFinite(forecast.eomAbsDiff)) return null;
        const amt = forecast.eomAbsDiff;
        // Exact break-even carries no signal (was "+$0.00 put aside").
        if (amt === 0) return null;
        const I = window.Insights;
        const month = now.toLocaleDateString(S.getLocale(), { month: 'long' });
        const up = amt > 0;
        return {
          variant: up ? 'up' : 'down',
          score: up ? 50 : 70,
          figure: I._money(amt, true),
          tone: up ? 'good' : 'bad',
          dir: up ? 'up' : 'down',
          head: I._t(up ? 'insight.outlook.up' : 'insight.outlook.down', { month }),
          body: window.I18n.t('insight.outlook.body'),
          href: '#analytics',
          filters: { page: 'analytics', filters: {}, replace: true },
          params: { amount: amt, month }
        };
      }
    },
    {
      // Spending: the top expense category's share of month-to-date spend.
      id: 'topSpending',
      family: 'month',
      minTier: 1,
      nameKey: 'insight.name.topSpending',
      compute() {
        const dist = window.Store.computeCategoryDistribution(window.Widgets._monthToDateFilters({}), 'expense');
        if (!dist.length || !(dist[0].amount > 0)) return null;
        const I = window.Insights;
        const parts = dist.map(d => ({ id: d.id, name: d.name, pct: d.percentage, color: d.color }));
        const top = parts[0];
        return {
          score: top.pct >= 40 ? 50 : 35,
          figure: I._pct(top.pct),
          tone: '',
          head: I._t('insight.topSpending.head', { name: top.name }),
          body: I._rest(parts.slice(1, 3), 'insight.topSpending.only'),
          href: '#transactions',
          filters: I._historyFilters(top.id),
          viz: parts.length > 1 ? I._split(parts) : null,
          params: { name: top.name, pct: top.pct }
        };
      }
    },
    {
      // Income mix: only when one source brings in at least half.
      id: 'incomeSource',
      family: 'month',
      minTier: 1,
      nameKey: 'insight.name.income',
      compute() {
        const dist = window.Store.computeCategoryDistribution(window.Widgets._monthToDateFilters({}), 'income');
        if (!dist.length || !(dist[0].amount > 0)) return null;
        const I = window.Insights;
        const parts = dist.map(d => ({ id: d.id, name: d.name, pct: d.percentage, color: d.color }));
        const top = parts[0];
        if (Math.round(top.pct) < 50) return null;
        return {
          score: 20,
          figure: I._pct(top.pct),
          tone: '',
          head: I._t('insight.income.head', { name: top.name }),
          body: I._rest(parts.slice(1, 3), 'insight.income.only'),
          href: '#transactions',
          filters: I._historyFilters(top.id),
          viz: parts.length > 1 ? I._split(parts) : null,
          params: { name: top.name, pct: top.pct }
        };
      }
    },
    {
      // Money placement: how the positive balances are spread.
      id: 'accountMix',
      family: 'accounts',
      minTier: 1,
      nameKey: 'insight.name.accounts',
      compute(facts, state) {
        const S = window.Store;
        // v1.02: a ratio of balances — only primary-currency accounts count.
        const balances = (state.accounts || [])
          .filter(a => S._isPrimaryAccount(a.id))
          .map(a => ({ id: a.id, name: a.name, color: S.normalizeAccountColor ? S.normalizeAccountColor(a.color) : a.color, bal: S.getAccountBalance(a.id) }))
          .filter(x => x.bal > 0); // negative balances would push shares past 100 %
        const total = balances.reduce((s, x) => s + x.bal, 0);
        // A checking + drained credit-card pair is not "concentration".
        if (balances.length < 2 || total <= 0) return null;
        const I = window.Insights;
        const parts = balances.sort((a, b) => b.bal - a.bal)
          .map(x => ({ name: x.name, pct: (x.bal / total) * 100, color: x.color }));
        const top = parts[0];
        return {
          score: top.pct >= 60 ? 25 : 20,
          figure: I._pct(top.pct),
          tone: '',
          head: I._t(Math.round(top.pct) >= 50 ? 'insight.accounts.most' : 'insight.accounts.largest', { name: top.name }),
          body: I._rest(parts.slice(1, 3), null), // two accounts at least: never empty
          href: '#dashboard',
          viz: I._split(parts),
          params: { name: top.name, pct: top.pct }
        };
      }
    }
  ],

  // ── Ranking ───────────────────────────────────────────────────────────────
  // Every eligible rule (per-rule try/catch: one broken rule must never take
  // the page down), attention first, then insights by score + rotation.
  analyze(state) {
    const facts = this._facts(state);
    const items = [];
    this.rules.forEach(rule => {
      if (rule.minTier > facts.tier) return;
      try {
        const res = rule.compute(facts, state);
        if (!res) return;
        const attention = rule.family === 'attention';
        items.push(Object.assign({}, res, {
          id: rule.id,
          family: rule.family,
          kind: attention ? 'attention' : 'insight',
          nameKey: rule.nameKey,
          rank: (attention ? 1000 : 0) + res.score + (attention ? 0 : this._rotation(rule.id, facts.today))
        }));
      } catch (err) {
        console.error(`Insights: rule "${rule.id}" failed`, err);
      }
    });
    items.sort((a, b) => (b.rank - a.rank) || (a.id < b.id ? -1 : 1));
    const locked = this.rules
      .filter(r => r.family !== 'attention' && r.minTier > facts.tier)
      .map(r => Object.assign({ id: r.id, nameKey: r.nameKey }, this._need(r.minTier, facts)));
    return { facts, tier: facts.tier, items, locked };
  },

  // The ranked items only (the widget and tests read this).
  compute(state) {
    return this.analyze(state).items;
  },

  // What a locked tier still needs, as text + a 0–1 progress.
  _need(minTier, facts) {
    if (minTier <= 1) {
      const done = Math.min(facts.rows, this.STARTER_ROWS);
      return {
        need: this._t('insights.lock.entries', { done, total: this.STARTER_ROWS }),
        progress: done / this.STARTER_ROWS
      };
    }
    const months = this.TIER_MONTHS[minTier];
    const current = Math.min(facts.completeMonths + 1, months);
    const progress = Math.min(0.99, (facts.completeMonths + facts.day / facts.daysInMonth) / months);
    return {
      need: window.I18n.t('insights.lock.months', { count: months, current }),
      progress
    };
  },

  // ── Markup ────────────────────────────────────────────────────────────────
  _toneClass(item) {
    return item.tone === 'good' ? ' insight-figure--good' : (item.tone === 'bad' ? ' insight-figure--bad' : '');
  },

  _chevron() {
    return '<i data-lucide="chevron-right" class="insight-chev" aria-hidden="true"></i>';
  },

  _renderViz(viz) {
    if (!viz || viz.type !== 'split' || !viz.parts.length) return '';
    const bar = viz.parts.map(p =>
      `<span style="flex: ${Math.max(1, Math.round(p.pct))} 1 0; background: ${this._esc(p.color)};"></span>`).join('');
    const legend = viz.parts.filter(p => p.label).map(p =>
      `<span class="insight-legend-item"><span class="insight-swatch" style="background: ${this._esc(p.color)};"></span>${this._esc(p.label)} ${this._pct(p.pct)}</span>`).join('');
    return `<span class="insight-viz" aria-hidden="true"><span class="insight-split">${bar}</span><span class="insight-legend">${legend}</span></span>`;
  },

  _renderHighlight(item) {
    const arrow = item.dir ? `<i data-lucide="${item.dir === 'up' ? 'arrow-up-right' : 'arrow-down-right'}" class="insight-arrow" aria-hidden="true"></i>` : '';
    return `
      <a class="insight-highlight" href="${this._esc(item.href)}" data-insight="${this._esc(item.id)}">
        <span class="insight-eyebrow"><span>${window.I18n.t(item.nameKey)}</span>${this._chevron()}</span>
        <span class="insight-figure insight-figure--lg${this._toneClass(item)}">${arrow}${this._esc(item.figure)}</span>
        <span class="insight-head">${item.head}</span>
        ${this._renderViz(item.viz)}
        <span class="insight-body">${item.body}</span>
      </a>`;
  },

  _renderRow(item) {
    const long = String(item.figure).length > 7 ? ' insight-figure--long' : '';
    return `
      <li>
        <a class="insight-row" href="${this._esc(item.href)}" data-insight="${this._esc(item.id)}">
          <span class="insight-figure${this._toneClass(item)}${long}">${this._esc(item.figure)}</span>
          <span class="insight-text"><span class="insight-head">${item.head}</span><span class="insight-body">${item.body}</span></span>
          ${this._chevron()}
        </a>
      </li>`;
  },

  // A locked insight type. At tier 0 every lock waits on the same 5 entries
  // the starter card already counts, so those rows say what the insight will
  // tell instead of repeating one need and one bar four times.
  _renderLocked(lock, showNeed) {
    const body = showNeed
      ? `<span class="insight-body">${lock.need}</span>
            <span class="insight-progress" aria-hidden="true"><span style="width: ${Math.round(lock.progress * 100)}%;"></span></span>`
      : `<span class="insight-body">${window.I18n.t('insight.desc.' + lock.id)}</span>`;
    return `
      <li>
        <div class="insight-row insight-row--locked" data-locked="${this._esc(lock.id)}">
          <span class="insight-lock" aria-hidden="true"><i data-lucide="lock"></i></span>
          <span class="insight-text">
            <span class="insight-head">${window.I18n.t(lock.nameKey)}</span>
            ${body}
          </span>
        </div>
      </li>`;
  },

  _renderSection(key, inner) {
    const id = `insights-sec-${key}`;
    return `
      <section class="insights-sec" aria-labelledby="${id}">
        <h2 class="section-title insights-sec-title" id="${id}">${window.I18n.t('insights.sec.' + key)}</h2>
        <ul class="insights-group" role="list">${inner}</ul>
      </section>`;
  },

  _renderStarter(facts) {
    const done = Math.min(facts.rows, this.STARTER_ROWS);
    return `
      <div class="insight-highlight insight-starter" id="insights-starter">
        <span class="insight-eyebrow"><span>${window.I18n.t('insights.starter.eyebrow')}</span></span>
        <span class="insight-head">${window.I18n.t('insights.starter.head')}</span>
        <span class="insight-progress insight-progress--wide" aria-hidden="true"><span style="width: ${Math.round((done / this.STARTER_ROWS) * 100)}%;"></span></span>
        <span class="insight-body">${window.I18n.t('insights.starter.progress', { done, total: this.STARTER_ROWS })}</span>
        <a class="btn btn-primary insight-starter-btn" href="#add">${window.I18n.t('insights.starter.cta')}</a>
      </div>`;
  },

  _renderQuiet() {
    return `
      <div class="insight-highlight insight-quiet">
        <span class="insight-head">${window.I18n.t('insights.quiet.head')}</span>
        <span class="insight-body">${window.I18n.t('insights.quiet.body')}</span>
      </div>`;
  },

  // The whole page. analyze() runs once here; attachPage reads this pass's
  // items (render and attach run back to back in one synchronous pass).
  renderPage(state) {
    let res;
    try {
      res = this.analyze(state);
    } catch (err) {
      console.error('Insights: analyze failed', err);
      res = { facts: { rows: 0 }, tier: 0, items: [], locked: [] };
    }
    this._pass = res.items;
    const highlight = res.tier > 0 ? res.items.find(i => i.kind === 'insight') : null;
    let top;
    if (res.tier === 0) top = this._renderStarter(res.facts);
    else if (highlight) top = this._renderHighlight(highlight);
    else if (!res.items.length) top = this._renderQuiet();
    else top = '';
    const sections = this.SECTIONS.map(key => {
      const list = res.items.filter(i => i.family === key && i !== highlight);
      return list.length ? this._renderSection(key, list.map(i => this._renderRow(i)).join('')) : '';
    }).join('');
    const locked = res.locked.length
      ? this._renderSection('locked', res.locked.map(l => this._renderLocked(l, res.tier > 0)).join(''))
      : '';
    return `
      <div id="insights-page" class="container insights-page" style="padding-bottom: 100px;">
        <h1 class="page-header-title" style="margin-top: var(--space-4); margin-bottom: var(--space-1);">${window.I18n.t('insights.title')}</h1><!-- 1.2.2 (HG-7): a tab-level page on the shared title line (HG-3) -->
        <p class="insights-sub">${window.I18n.t('insights.sub')}</p>
        ${top}
        ${sections}
        ${locked}
        <p class="insights-note"><i data-lucide="shield-check" aria-hidden="true"></i><span>${window.I18n.t('insights.note')}</span></p>
      </div>`;
  },

  // Each insight is a real link (keyboard, screen readers). A click applies
  // the insight's filters first, so the destination shows what it is about.
  attachPage(root) {
    const byId = {};
    (this._pass || []).forEach(i => { byId[i.id] = i; });
    root.querySelectorAll('a[data-insight]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const item = byId[a.dataset.insight];
        if (item && item.filters) window.Store.dispatch('UPDATE_FILTERS', item.filters);
        window.Router.navigate(a.getAttribute('href'));
      });
    });
    const starter = root.querySelector('.insight-starter-btn');
    if (starter) {
      starter.addEventListener('click', (e) => {
        e.preventDefault();
        window.Router.navigate('#add');
      });
    }
  }
};
