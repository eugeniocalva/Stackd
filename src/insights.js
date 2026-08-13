// insights.js — Smart Insights dashboard section (v0.84, docs/refactor-plan.md P6).
//
// window.Insights renders up to three rule-based insight cards between the
// Wallets rail and the widget area on the home dashboard. Every figure is
// computed on-device from the store — NO network calls, matching the app's
// privacy-first stance ("smart" here means heuristics, not a remote model).
//
// Load order: after widgets.js (whose month-to-date helpers it reuses) and
// before views.js (DashboardView delegates to renderSection/attachSection,
// mirroring the v0.72 Widgets contract). Loaded via <script defer> in
// index.html; editing this file means bumping its ?v= there.
//
// Correctness trap documented in home-widgets-plan.md §8b: anything built on
// getFilteredTransactions MUST use Widgets._monthToDateFilters, or fully
// materialised future occurrences of recurring series count as money already
// spent. The month-end outlook rule is the deliberate exception — it reuses
// computeBalanceForecast, whose EOM cutoff includes scheduled rows because a
// projection is the whole point (same math as the dashboard header).

window.Insights = {

  // ── Sentence table ────────────────────────────────────────────────────────
  // Every user-facing sentence lives in this ONE table so a future i18n pass
  // swaps a single object (P8). The color-coded value is a separate field
  // from the sentence, so translation never fights word order. Params arrive
  // pre-escaped from _renderCard.
  STRINGS: {
    // v0.90 P8e: the sentence lives in the dictionary (it carries the <strong>
    // markup, so params stay plain text and _renderCard's escape-then-assemble
    // ordering is unchanged); `value` is a formatted figure, never prose.
    accountConcentration: (p) => ({
      text: window.I18n.t('insight.accountConcentration', p),
      value: `${p.pct}%`
    }),
    accountBalanced: (p) => ({
      text: window.I18n.t('insight.accountBalanced', p),
      value: `${p.pct}%`
    }),
    topSpendingHigh: (p) => ({
      text: window.I18n.t('insight.topSpendingHigh', p),
      value: `${p.pct}%`
    }),
    topSpending: (p) => ({
      text: window.I18n.t('insight.topSpending', p),
      value: `${p.pct}%`
    }),
    onTrackSave: (p) => ({
      text: window.I18n.t('insight.onTrackSave', p),
      value: `+${p.amount}`
    }),
    shortfall: (p) => ({
      text: window.I18n.t('insight.shortfall', p),
      value: p.amount
    }),
    incomeSource: (p) => ({
      text: window.I18n.t('insight.incomeSource', p),
      value: `${p.pct}%`
    })
  },

  // ── Rules ─────────────────────────────────────────────────────────────────
  // Each rule returns { stringId, icon, iconColor?, tone, params } or null
  // when its data is insufficient (fresh installs naturally show fewer or no
  // cards). tone: 'income' | 'expense' | 'neutral' → value color class.
  rules: [
    {
      // 1) Money placement: how concentrated the positive balances are.
      id: 'accountMix',
      priority: 1,
      compute(state) {
        const accounts = state.accounts || [];
        const balances = accounts
          .map(a => ({ name: a.name, bal: window.Store.getAccountBalance(a.id) }))
          .filter(x => x.bal > 0); // negative balances would push shares past 100%
        const total = balances.reduce((s, x) => s + x.bal, 0);
        // "Spread it" is noise unless at least two accounts actually hold
        // money — a checking + drained/negative credit-card pair must not
        // read as "100% concentration" (review finding, v0.84).
        if (balances.length < 2 || total <= 0) return null;
        const top = balances.slice().sort((a, b) => b.bal - a.bal)[0];
        const pct = Math.round((top.bal / total) * 100);
        return {
          stringId: pct >= 60 ? 'accountConcentration' : 'accountBalanced',
          icon: 'wallet',
          tone: pct >= 60 ? 'neutral' : 'income',
          params: { pct, name: top.name }
        };
      }
    },
    {
      // 2) Spending: the top expense category's share of month-to-date spend.
      id: 'topSpending',
      priority: 2,
      compute() {
        const filters = window.Widgets._monthToDateFilters({});
        const dist = window.Store.computeCategoryDistribution(filters, 'expense');
        if (!dist.length || !(dist[0].amount > 0)) return null;
        const top = dist[0];
        const pct = Math.round(top.percentage);
        return {
          stringId: pct >= 40 ? 'topSpendingHigh' : 'topSpending',
          icon: top.icon || 'pie-chart',
          iconColor: top.color,
          tone: 'expense',
          params: { pct, name: top.name }
        };
      }
    },
    {
      // 3) Month-end outlook: projected savings (or shortfall) at EOM — the
      // exact computeBalanceForecast figure the dashboard header shows.
      id: 'monthOutlook',
      priority: 3,
      compute() {
        // Gate on the forecast's OWN inputs, not just MTD actuals: on day 1 of
        // a month a recurring-only user has zero MTD activity but real
        // scheduled rows — the projection is live and must not flicker away
        // at every month boundary (review finding, v0.84).
        const summary = window.Store.computeAnalyticalSummary(window.Widgets._monthToDateFilters({}));
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const eom = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(lastDay)}`;
        const upcoming = window.Store.computeUpcomingImpact(eom);
        const hasActuals = summary && (summary.income > 0 || summary.expense > 0);
        const hasScheduled = upcoming && upcoming.count > 0;
        if (!hasActuals && !hasScheduled) return null;
        const forecast = window.Store.computeBalanceForecast([]);
        if (!forecast || typeof forecast.eomAbsDiff !== 'number' || !isFinite(forecast.eomAbsDiff)) return null;
        const amt = forecast.eomAbsDiff;
        // Exact break-even carries no signal — treat like the other rules'
        // insufficient-data case rather than calling $0.00 "put aside".
        if (amt === 0) return null;
        const month = new Date().toLocaleDateString(window.Store.getLocale(), { month: 'long' }); // v0.87 P8b
        return {
          stringId: amt >= 0 ? 'onTrackSave' : 'shortfall',
          icon: amt >= 0 ? 'trending-up' : 'trending-down',
          tone: amt >= 0 ? 'income' : 'expense',
          params: { month, amount: window.Store.formatCurrency(amt) }
        };
      }
    },
    {
      // 4) Income mix: only fires when one source dominates; usually trimmed
      // by the top-3 slice unless an earlier rule had no data.
      id: 'incomeSource',
      priority: 4,
      compute() {
        const filters = window.Widgets._monthToDateFilters({});
        const dist = window.Store.computeCategoryDistribution(filters, 'income');
        if (!dist.length || !(dist[0].amount > 0)) return null;
        const top = dist[0];
        const pct = Math.round(top.percentage);
        if (pct < 50) return null;
        return {
          stringId: 'incomeSource',
          icon: top.icon || 'hand-coins',
          iconColor: top.color,
          tone: 'income',
          params: { pct, name: top.name }
        };
      }
    }
  ],

  // Run every rule, drop the nulls, keep priority order, show at most three.
  // Per-rule try/catch mirrors Widgets._renderCard's containment: one broken
  // rule must never take the dashboard down.
  compute(state) {
    const out = [];
    this.rules
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .forEach(rule => {
        try {
          const res = rule.compute(state);
          if (res) out.push(res);
        } catch (err) {
          console.error(`Insights: rule "${rule.id}" failed`, err);
        }
      });
    return out.slice(0, 3);
  },

  _esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  _renderCard(card) {
    try {
      const template = this.STRINGS[card.stringId];
      if (!template) return '';
      // Escape params BEFORE sentence assembly — names are user input.
      const safeParams = {};
      Object.keys(card.params || {}).forEach(k => { safeParams[k] = this._esc(card.params[k]); });
      const s = template(safeParams);
      const toneClass = card.tone === 'income' ? 'text-income'
        : card.tone === 'expense' ? 'text-expense' : '';
      const iconStyle = card.iconColor ? ` style="color: ${this._esc(card.iconColor)};"` : '';
      return `
        <div class="insight-card card card-elevated touch-target" data-insight="${this._esc(card.stringId)}"
             role="button" tabindex="0" aria-label="${window.I18n.t('insight.cardAria', { value: s.value, text: s.text.replace(/<[^>]+>/g, '') })}">
          <div class="insight-icon"${iconStyle}><i data-lucide="${this._esc(card.icon)}"></i></div>
          <span class="insight-value ${toneClass}">${s.value}</span>
          <span class="insight-text">${s.text}</span>
        </div>`;
    } catch (err) {
      console.error('Insights: card render failed', err);
      return '';
    }
  },

  // ── Section contract (consumed by DashboardView) ──────────────────────────
  renderSection(state) {
    let cards = [];
    try {
      cards = this.compute(state);
    } catch (err) {
      console.error('Insights: compute failed', err);
      return '';
    }
    if (!cards.length) return ''; // fresh installs keep a clean dashboard
    return `
      <div class="insights-section" id="insights-section">
        <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1);">
          <p class="section-title" style="margin-bottom: 0;">${window.I18n.t('insight.section')}</p>
          <i data-lucide="sparkles" style="width: 14px; height: 14px; color: var(--text-secondary);" aria-hidden="true"></i>
        </div>
        <div class="insights-list">
          ${cards.map(c => this._renderCard(c)).join('')}
        </div>
      </div>`;
  },

  attachSection(root) {
    root.querySelectorAll('.insight-card').forEach(el => {
      el.addEventListener('click', () => {
        window.Router.navigate('#analytics');
      });
    });
  }
};
