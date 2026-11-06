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
//   - rules: { id, family, group, minTier, nameKey, compute(facts, state) } → an
//     item { score, figure, tone, dir?, head, body, href, filters?, viz? } or
//     null. `head`/`body` are built here from escaped params (plain text,
//     no markup in the dictionary), `figure` comes from Store formatters.
//     `family` is the page section; `group` is the catalogue family (plan
//     §4.2: spending, budgets, cashflow…) — the Home widget shows at most one
//     item per group (P2).
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
  // One O(T) walk feeds every rule (plan §5.3). Counted rows follow the
  // aggregate rule; P3 adds, from the same walk:
  //   - monthIncome / monthExpense per month (counted rows);
  //   - mtdExpense, and prevSameDays = last month's spend up to today's day
  //     number (spendPace), prevExpenseRows;
  //   - budget[categoryId] = { fixed, linear }: this month's budget spend by
  //     Goals' row rules (paid, primary, no transfer legs, future rows too),
  //     split into what is already fixed (recurring or dated after today) and
  //     what is spent at a running pace (one-off rows up to today);
  //   - upcoming: paid-flag expenses dated in the next 7 days (as the
  //     forecast counts them), primary currency, no transfer legs;
  //   - overdue: expenses still marked unpaid dated today or earlier, in any
  //     currency (a count, never a sum).
  // Nothing dated before its account opened counts anywhere.
  _facts(state) {
    const S = window.Store;
    const today = S._todayYMD();
    const ym = today.slice(0, 7);
    const [y, m, d] = today.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const prevYm = S._localYMD(new Date(y, m - 2, 1)).slice(0, 7);
    const weekEnd = S._localYMD(new Date(y, m - 1, d + 7));
    let rows = 0;
    let mtdExpense = 0;
    let prevSameDays = 0;
    let prevExpenseRows = 0;
    const monthRows = {};
    const monthIncome = {};
    const monthExpense = {};
    const budget = {};
    const upcoming = [];
    const overdue = [];
    (state.transactions || []).forEach(tx => {
      const isExp = tx.type === 'expense';
      if (!isExp && tx.type !== 'income') return;
      if (!tx.date) return;
      if (S._isTxBeforeOpeningDate(tx)) return;
      if (isExp && tx.isPaid === false && tx.date <= today) overdue.push(tx);
      if (tx.transferRef) return;
      if (tx.isPaid === false) return;
      if (!S._isPrimaryAccount(tx.accountId)) return;
      const mo = tx.date.slice(0, 7);
      const amount = Number(tx.amount) || 0;
      if (isExp && tx.categoryId && mo === ym) {
        const b = budget[tx.categoryId] || (budget[tx.categoryId] = { fixed: 0, linear: 0 });
        if (tx.recurrence || tx.date > today) b.fixed += amount;
        else b.linear += amount;
      }
      if (tx.date > today) {
        if (isExp && tx.date <= weekEnd) upcoming.push(tx);
        return;
      }
      rows++;
      monthRows[mo] = (monthRows[mo] || 0) + 1;
      if (isExp) {
        monthExpense[mo] = (monthExpense[mo] || 0) + amount;
        if (mo === ym) mtdExpense += amount;
        if (mo === prevYm) {
          prevExpenseRows++;
          if (Number(tx.date.slice(8, 10)) <= d) prevSameDays += amount;
        }
      } else {
        monthIncome[mo] = (monthIncome[mo] || 0) + amount;
      }
    });
    const completeMonths = Object.keys(monthRows)
      .filter(mo => mo < ym && monthRows[mo] >= this.MONTH_MIN_ROWS).length;
    let tier = 1;
    if (rows < this.STARTER_ROWS) tier = 0;
    else if (completeMonths >= this.TIER_MONTHS[4]) tier = 4;
    else if (completeMonths >= this.TIER_MONTHS[3]) tier = 3;
    else if (completeMonths >= this.TIER_MONTHS[2]) tier = 2;
    return {
      today, ym, prevYm, weekEnd, day: d, daysInMonth, rows, completeMonths, tier,
      monthRows, monthIncome, monthExpense, mtdExpense, prevSameDays, prevExpenseRows,
      budget, upcoming, overdue
    };
  },

  // Every budget with a limit this month, read the way Goals reads it
  // (getBudgetForMonth: the month's limit plus any rollover), with a
  // projection for the month's end: what is already fixed (recurring and
  // future rows) plus the one-off spend so far run on at its daily pace.
  // A rent paid on the 1st is not "6× over by the 5th". Memoized per facts.
  _budgetStatus(facts, state) {
    if (facts._budgetStatus) return facts._budgetStatus;
    const S = window.Store;
    const out = [];
    const seen = new Set();
    (state.budgets || []).forEach(b => {
      if (!b || !b.categoryId || seen.has(b.categoryId)) return;
      seen.add(b.categoryId);
      const r = S.getBudgetForMonth(b.categoryId, facts.ym);
      if (!(r.allocated > 0)) return; // no limit this month (or a deleted budget)
      const cat = (state.categories || []).find(c => c.id === b.categoryId);
      if (!cat) return;
      const part = facts.budget[b.categoryId] || { fixed: 0, linear: 0 };
      const projected = part.fixed + (part.linear / facts.day) * facts.daysInMonth;
      const limit = r.finalLimit;
      const over = r.spent > limit;
      out.push({
        id: b.categoryId, name: cat.name, spent: r.spent, limit, projected, over,
        risk: !over && facts.day >= 5 && limit > 0 && projected >= limit * 1.05,
        onTrack: !over && projected <= limit
      });
    });
    facts._budgetStatus = out;
    return out;
  },

  _monthName(ymStr) {
    const [yy, mm] = ymStr.split('-').map(Number);
    return new Date(yy, mm - 1, 1).toLocaleDateString(window.Store.getLocale(), { month: 'long' });
  },

  _goals(facts) {
    return [['SET_MONTH_FILTER', facts.ym]]; // Goals opens on this month
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
      group: 'bank',
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
      group: 'bank',
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
      group: 'cashflow',
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
      group: 'spending',
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
      group: 'cashflow',
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
      group: 'balance',
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
    },

    // ── 1.2.2 (HG-7 P3): batch 1 ────────────────────────────────────────────
    {
      // A budget already past its limit this month (Goals' own figures).
      // One item: the budget furthest over, the rest counted in the detail.
      id: 'budgetOver',
      family: 'attention',
      group: 'budgets',
      minTier: 0,
      nameKey: 'insight.name.budgetOver',
      compute(facts, state) {
        const I = window.Insights;
        const list = I._budgetStatus(facts, state).filter(b => b.over)
          .sort((a, b) => (b.spent - b.limit) - (a.spent - a.limit) || a.name.localeCompare(b.name));
        if (!list.length) return null;
        const top = list[0];
        const more = list.length - 1;
        return {
          score: 85,
          figure: I._money(top.spent - top.limit),
          tone: 'bad',
          head: I._t('insight.budgetOver.head', { name: top.name }),
          body: I._t('insight.budgetOver.body', { spent: I._money(top.spent), limit: I._money(top.limit) })
            + (more ? ' ' + window.I18n.t('insight.budgetOver.more', { count: more }) : ''),
          href: '#budget',
          actions: I._goals(facts),
          params: { name: top.name, over: top.spent - top.limit, count: list.length }
        };
      }
    },
    {
      // Expenses still marked unpaid on or after their date. A count in any
      // currency; History opens on the range from the oldest one to today.
      id: 'overdueUnpaid',
      family: 'attention',
      group: 'unpaid',
      minTier: 0,
      nameKey: 'insight.name.unpaid',
      compute(facts) {
        const n = facts.overdue.length;
        if (!n) return null;
        const oldest = facts.overdue.reduce((min, tx) => (tx.date < min ? tx.date : min), facts.today);
        return {
          score: 80,
          figure: String(n),
          tone: 'bad',
          head: window.I18n.t('insight.unpaid.head', { count: n }),
          body: window.I18n.t('insight.unpaid.body', { count: n }),
          href: '#transactions',
          filters: { page: 'history', filters: { period: { type: 'custom', value: '', start: oldest, end: facts.today }, types: ['expense'] }, replace: true },
          params: { count: n, oldest }
        };
      }
    },
    {
      // Spending pace: this month so far against last month by the same day.
      id: 'spendPace',
      family: 'month',
      group: 'spending',
      minTier: 2,
      nameKey: 'insight.name.pace',
      compute(facts) {
        if (facts.day < 3 || facts.prevExpenseRows < 5 || !(facts.prevSameDays > 0)) return null;
        const delta = ((facts.mtdExpense - facts.prevSameDays) / facts.prevSameDays) * 100;
        if (Math.abs(delta) < 10) return null;
        const I = window.Insights;
        const less = delta < 0;
        return {
          variant: less ? 'less' : 'more',
          score: 60 + Math.min(35, Math.round(Math.abs(delta))),
          figure: window.Store.formatPercent(delta, { digits: 0, signed: true }),
          tone: less ? 'good' : 'bad',
          dir: less ? 'down' : 'up',
          head: window.I18n.t(less ? 'insight.pace.less' : 'insight.pace.more'),
          body: I._t('insight.pace.body', { now: I._money(facts.mtdExpense), then: I._money(facts.prevSameDays) }),
          href: '#analytics',
          filters: { page: 'analytics', filters: {}, replace: true },
          viz: {
            type: 'bars',
            parts: [
              { label: window.I18n.t('insight.pace.thisMonth'), value: facts.mtdExpense, color: less ? 'var(--color-income-text)' : 'var(--color-expense-text)' },
              { label: window.I18n.t('insight.pace.lastMonth'), value: facts.prevSameDays, color: 'var(--text-tertiary)' }
            ]
          },
          params: { delta, now: facts.mtdExpense, then: facts.prevSameDays }
        };
      }
    },
    {
      // A budget on course to pass its limit (it is not over yet).
      id: 'budgetAtRisk',
      family: 'month',
      group: 'budgets',
      minTier: 1,
      nameKey: 'insight.name.budgetRisk',
      compute(facts, state) {
        const I = window.Insights;
        const list = I._budgetStatus(facts, state).filter(b => b.risk)
          .sort((a, b) => (b.projected / b.limit) - (a.projected / a.limit) || a.name.localeCompare(b.name));
        if (!list.length) return null;
        const top = list[0];
        const more = list.length - 1;
        const used = (top.spent / top.limit) * 100;
        const daysLeft = facts.daysInMonth - facts.day;
        const overrun = Math.round((top.projected / top.limit - 1) * 100);
        return {
          score: 70 + Math.min(25, overrun),
          figure: I._pct(used),
          tone: '',
          head: I._t('insight.budgetRisk.head', { name: top.name }),
          body: I._t('insight.budgetRisk.body', { pct: I._pct(used), count: daysLeft })
            + ' ' + I._t('insight.budgetRisk.pace', { amount: I._money(top.projected), limit: I._money(top.limit) })
            + (more ? ' ' + window.I18n.t('insight.budgetRisk.more', { count: more }) : ''),
          href: '#budget',
          actions: I._goals(facts),
          viz: { type: 'budget', used: Math.min(1, top.spent / top.limit), today: facts.day / facts.daysInMonth },
          params: { name: top.name, used, projected: top.projected, limit: top.limit }
        };
      }
    },
    {
      // Every budget set to end the month within its limit.
      id: 'budgetsOnTrack',
      family: 'month',
      group: 'budgets',
      minTier: 1,
      nameKey: 'insight.name.budgetsOk',
      compute(facts, state) {
        if (facts.day < 10) return null;
        const list = window.Insights._budgetStatus(facts, state);
        if (list.length < 2 || !list.every(b => b.onTrack)) return null;
        return {
          score: 40,
          figure: window.I18n.t('insight.budgetsOk.figure', { n: list.length, total: list.length }),
          tone: 'good',
          head: window.I18n.t('insight.budgetsOk.head'),
          body: window.I18n.t('insight.budgetsOk.body'),
          href: '#budget',
          actions: window.Insights._goals(facts),
          params: { count: list.length }
        };
      }
    },
    {
      // The week ahead: scheduled expenses in the next 7 days.
      id: 'upcomingWeek',
      family: 'month',
      group: 'upcoming',
      minTier: 1,
      nameKey: 'insight.name.upcoming',
      compute(facts, state) {
        const list = facts.upcoming;
        if (!list.length) return null;
        const S = window.Store;
        const I = window.Insights;
        const total = list.reduce((s, tx) => s + (Number(tx.amount) || 0), 0);
        const big = list.reduce((a, b) => ((Number(b.amount) || 0) > (Number(a.amount) || 0) ? b : a));
        const cat = (state.categories || []).find(c => c.id === big.categoryId);
        const name = cat ? cat.name : window.I18n.t('common.uncategorized');
        const date = new Date(`${big.date}T12:00:00`).toLocaleDateString(S.getLocale(), { weekday: 'long', day: 'numeric', month: 'long' }); // long: a short form ends in an abbreviation dot ('nov.') that doubles the sentence's own
        const balance = (state.accounts || []).filter(a => S._isPrimaryAccount(a.id))
          .reduce((s, a) => s + S.getAccountBalance(a.id), 0);
        const [yy, mm, dd] = facts.today.split('-').map(Number);
        return {
          score: 55 + (balance > 0 && total > balance * 0.25 ? 10 : 0),
          figure: I._money(total),
          tone: '',
          head: window.I18n.t('insight.upcoming.head', { count: list.length }),
          body: I._t('insight.upcoming.body', { name, amount: I._money(Number(big.amount) || 0), date }),
          href: '#transactions',
          filters: {
            page: 'history',
            filters: { period: { type: 'custom', value: '', start: S._localYMD(new Date(yy, mm - 1, dd + 1)), end: facts.weekEnd }, types: ['expense'] },
            replace: true
          },
          params: { count: list.length, total }
        };
      }
    },
    {
      // Last month's savings rate: what was kept out of what came in.
      id: 'savingsRate',
      family: 'trends',
      group: 'cashflow',
      minTier: 2,
      nameKey: 'insight.name.savings',
      compute(facts) {
        const p = facts.prevYm;
        const income = facts.monthIncome[p] || 0;
        if ((facts.monthRows[p] || 0) < window.Insights.MONTH_MIN_ROWS || !(income > 0)) return null;
        const I = window.Insights;
        const expense = facts.monthExpense[p] || 0;
        const rate = ((income - expense) / income) * 100;
        const kept = rate >= 0;
        const month = I._monthName(p);
        return {
          variant: kept ? 'kept' : 'over',
          score: 45 + (kept ? 0 : 15),
          figure: I._pct(rate),
          tone: kept ? 'good' : 'bad',
          head: I._t(kept ? 'insight.savings.kept' : 'insight.savings.over', { month, pct: I._pct(rate) }),
          body: I._t('insight.savings.body', { income: I._money(income), expense: I._money(expense) }),
          href: '#analytics',
          filters: { page: 'analytics', filters: { period: { type: 'month', value: `${p}-01`, start: '', end: '' } }, replace: true },
          params: { rate, income, expense, month }
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
          group: rule.group || rule.id,
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

  // The ranked items only (tests read this).
  compute(state) {
    return this.analyze(state).items;
  },

  // 1.2.2 (HG-7 P2): the widget's picks — ranked order (attention first),
  // at most one item per catalogue family (no two budget rows).
  top(items, n) {
    const seen = new Set();
    const out = [];
    for (const item of items || []) {
      if (out.length >= n) break;
      if (seen.has(item.group)) continue;
      seen.add(item.group);
      out.push(item);
    }
    return out;
  },

  // Opens what an insight is about: its filters first, so the destination
  // shows the rows it talks about, then its screen.
  open(item, href) {
    if (item && item.filters) window.Store.dispatch('UPDATE_FILTERS', item.filters);
    if (item && Array.isArray(item.actions)) item.actions.forEach(([type, payload]) => window.Store.dispatch(type, payload));
    window.Router.navigate(href || (item && item.href) || '#insights');
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
    if (!viz) return '';
    // 1.2.2 (HG-7 P3): pace bars (this month vs last month by the same day)
    // and a budget bar with a "today" tick. aria-hidden like the split bar:
    // the detail line carries the same numbers in words.
    if (viz.type === 'bars' && viz.parts && viz.parts.length) {
      const max = Math.max(...viz.parts.map(p => p.value), 1);
      const rows = viz.parts.map(p => `
          <span class="insight-bars-row">
            <span class="insight-bars-label">${this._esc(p.label)}</span>
            <span class="insight-bars-track"><span style="width: ${Math.max(2, Math.round((p.value / max) * 100))}%; background: ${this._esc(p.color)};"></span></span>
            <span class="insight-bars-value">${this._esc(this._money(p.value))}</span>
          </span>`).join('');
      return `<span class="insight-viz insight-bars" aria-hidden="true">${rows}</span>`;
    }
    if (viz.type === 'budget') {
      const used = Math.round(Math.max(0, Math.min(1, viz.used)) * 100);
      const today = Math.round(Math.max(0, Math.min(1, viz.today)) * 100);
      return `
        <span class="insight-viz insight-budgetbar" aria-hidden="true">
          <span class="insight-budgetbar-track"><span class="insight-budgetbar-fill" style="width: ${used}%;"></span><span class="insight-budgetbar-tick" style="left: ${today}%;"></span></span>
          <span class="insight-budgetbar-today" style="left: ${Math.min(90, Math.max(10, today))}%;">${window.I18n.t('insight.viz.today')}</span>
        </span>`;
    }
    if (viz.type !== 'split' || !viz.parts || !viz.parts.length) return '';
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
        this.open(byId[a.dataset.insight], a.getAttribute('href'));
      });
    });
    const starter = root.querySelector('.insight-starter-btn');
    if (starter) {
      starter.addEventListener('click', (e) => {
        e.preventDefault();
        window.Router.navigate('#add');
      });
    }
  },

  // ── Home widget (1.2.2 HG-7 P2, plan §3.3) ────────────────────────────────
  // registry.insights in widgets.js delegates here, so the page and the
  // widget share one engine and one daily rotation. Opt-in only: no seed, no
  // migration. Small = the top item (attention first) and the card opens the
  // page; large = the top three, one per family, each opening its own screen,
  // plus "All insights". Amounts mask on Home like every Home surface
  // (formatCurrency → Store.isMoneyMasked); percentages stay.
  _widgetItems: {},

  // The small card shows the arrow; the rows leave it out so every figure
  // fits the one column (the sign and the colour still say the direction).
  _widgetFigure(item, withArrow) {
    const arrow = withArrow && item.dir ? `<i data-lucide="${item.dir === 'up' ? 'arrow-up-right' : 'arrow-down-right'}" class="insight-arrow" aria-hidden="true"></i>` : '';
    const long = String(item.figure).length > 7 ? ' widget-insight-figure--long' : '';
    return `<span class="widget-insight-figure${this._toneClass(item)}${long}">${arrow}${this._esc(item.figure)}</span>`;
  },

  renderWidget(instance, state) {
    const large = instance.size === 'large';
    // A preview card in the Add-widget sheet is a picture, not a control.
    const preview = String(instance.id || '').indexOf('__preview__') === 0;
    const tab = preview ? ' tabindex="-1"' : '';
    const res = this.analyze(state);
    const page = (cls, inner) => `<a class="widget-insight${cls}" href="#insights" data-insight-open="page"${tab}>${inner}</a>`;

    if (res.tier === 0) {
      this._widgetItems[instance.id] = [];
      const done = Math.min(res.facts.rows, this.STARTER_ROWS);
      return page(' widget-insight--starter', `
        <span class="widget-insight-head">${window.I18n.t('insights.starter.head')}</span>
        <span class="insight-progress insight-progress--wide" aria-hidden="true"><span style="width: ${Math.round((done / this.STARTER_ROWS) * 100)}%;"></span></span>
        <span class="widget-insight-body">${window.I18n.t('insights.starter.progress', { done, total: this.STARTER_ROWS })}</span>`);
    }

    const picks = this.top(res.items, large ? 3 : 1);
    this._widgetItems[instance.id] = picks;
    if (!picks.length) {
      return page(' widget-insight--quiet', `
        <span class="widget-insight-head">${window.I18n.t('insights.quiet.head')}</span>
        <span class="widget-insight-body">${window.I18n.t('insights.quiet.body')}</span>`);
    }

    if (!large) {
      const item = picks[0];
      return page('', `${this._widgetFigure(item, true)}<span class="widget-insight-head widget-insight-head--clamp">${item.head}</span>`);
    }

    const rows = picks.map(item => `
      <li>
        <a class="widget-insight-row" href="${this._esc(item.href)}" data-insight="${this._esc(item.id)}"${tab}>
          ${this._widgetFigure(item)}
          <span class="widget-insight-head">${item.head}</span>
          ${this._chevron()}
        </a>
      </li>`).join('');
    return `
      <div class="widget-insights">
        <ul class="widget-insight-list" role="list">${rows}</ul>
        <a class="widget-insight-all" href="#insights" data-insight-open="page"${tab}><span>${window.I18n.t('widget.insights.all')}</span>${this._chevron()}</a>
      </div>`;
  },

  attachWidget(instance, card) {
    card.addEventListener('click', (e) => {
      // Edit mode: a tap is for the edit chrome, never a navigation (the
      // links must not follow their href either).
      if (window.Store.getState().widgetEditMode) {
        if (e.target && e.target.closest && e.target.closest('a')) e.preventDefault();
        return;
      }
      e.preventDefault();
      const a = e.target && e.target.closest ? e.target.closest('a[data-insight]') : null;
      if (a) {
        const item = (this._widgetItems[instance.id] || []).find(i => i.id === a.dataset.insight);
        this.open(item, a.getAttribute('href'));
        return;
      }
      // the rest of the card (and "All insights") opens the page
      window.Router.navigate('#insights');
    });
  }
};
