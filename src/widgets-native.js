// 1.2.2 (HG-15, docs/phone-widgets-plan.md WG-1): the snapshot the phone's
// Home Screen widgets draw (iOS WidgetKit, Android AppWidget). The widgets run
// no JavaScript and cannot read localStorage, so the app hands them one small
// JSON file of finished, formatted, translated figures. Every figure comes
// from the same function the matching Home card uses (window.Widgets.registry
// data builders, Store.computeBalanceSeries), so the aggregate rules
// (exclude-never-convert, no unpaid or pre-opening rows, MTD vs EOM) hold
// without being written twice. Loaded after widgets.js.
//
// One way only: nothing here reads a widget's file back. The native plugin
// (Capacitor.Plugins.StackdWidgets, WG-3) writes the file and asks the system
// to redraw; until it exists every write is a no-op.
window.StackdWidgets = {
  VERSION: 1,
  UPCOMING_DAYS: 35,   // dated rows, so a widget rolls day by day on its own
  MAX_UPCOMING: 20,
  MAX_ACCOUNTS: 12,
  MAX_BUDGETS: 3,
  CURVE_RANGE: '1m',
  DEBOUNCE_MS: 2000,

  last: null,          // the last snapshot built (inspection / tests)
  _lastHash: null,     // of the last snapshot written
  _timer: null,
  _started: false,

  // Plain text for a native Text view: no control characters, bounded.
  _clip(value, max) {
    // code points, not a regex: C0/C1 controls and the two line separators
    const s = Array.from(String(value == null ? '' : value)).map(ch => {
      const c = ch.codePointAt(0);
      return (c < 32 || (c >= 127 && c < 160) || c === 8232 || c === 8233) ? ' ' : ch;
    }).join('').trim();
    const n = max || 60;
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  },

  _icon(name, fallback) {
    const S = window.Store;
    return (typeof name === 'string' && S.isSafeIcon && S.isSafeIcon(name)) ? name : (fallback || 'circle');
  },

  _color(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '';
  },

  // A figure as text. Hidden balances (HG-4) masks every amount the same way
  // Home does — sign + symbol + mask — whatever screen the app is on, since
  // a widget is never "another screen". { plain: true } keeps formatCurrency
  // from reading the active view.
  _money(state, amount, ccy, opts) {
    const S = window.Store;
    const v = Number(amount) || 0;
    const signed = !!(opts && opts.signed);
    const sign = v < 0 ? '-' : (signed && v > 0 ? '+' : '');
    if (state.privacy && state.privacy.hide === true) {
      return `${sign}${S.currencyPrefix(ccy || state.currency)}${S.MONEY_MASK}`; // 1.3.0 (PL-2)
    }
    const s = S.formatCurrency(Math.abs(v), ccy, { plain: true });
    return sign + s;
  },

  _trend(v) {
    return v > 0 ? 'up' : (v < 0 ? 'down' : 'flat');
  },

  // A registry data builder on a throwaway instance. Its pass memo is swapped
  // out for the call, so a Home render in progress keeps its own entries and
  // nothing of ours outlives the build.
  _withMemo(build) {
    const W = window.Widgets;
    const saved = W._passMemo;
    W._passMemo = {};
    try { return build(); } finally { W._passMemo = saved; }
  },

  _instance(type, size, config) {
    return { id: '__native__:' + type, type, size: size || 'large', config: config || {} };
  },

  _labels() {
    const t = (k, p) => this._clip(window.I18n.t(k, p), 40);
    return {
      accounts: t('widget.balances.title'),
      total: t('widget.balances.total'),
      incomeExpense: t('widget.netflow.title'),
      income: t('form.income'),
      expense: t('charts.expenses'),
      net: t('widget.native.net'),
      eom: t('widget.eomCaption'),
      categories: t('widget.categories.title'),
      budgets: t('widget.budget.title'),
      upcoming: t('widget.upcoming.title'),
      curve: t('widget.native.balance'),
      range: t('dash.range.1m'),
      today: t('period.today'),
      tomorrow: t('widget.native.tomorrow'),
      open: t('widget.native.open'),
      expenseBtn: t('form.expense'),
      incomeBtn: t('form.income'),
      transferBtn: t('common.transfer'),
      noAccounts: t('widget.balances.empty'),
      nothingMonth: t('widget.empty.nothingMonth'),
      noSpending: t('widget.empty.noSpending'),
      noBudgets: t('widget.empty.noBudgets'),
      nothingScheduled: t('widget.empty.nothingScheduled', { count: this.UPCOMING_DAYS })
    };
  },

  // W1: Account balances — Home's total (every primary-currency account) and
  // the accounts in the user's order, each in its own currency.
  _accounts(state) {
    const S = window.Store;
    const def = window.Widgets.registry.accountBalances;
    const data = def._data(this._instance('accountBalances'), state);
    const all = S.orderedAccounts(state.accounts || []);
    const rows = all.slice(0, this.MAX_ACCOUNTS).map(acc => {
      const balance = S.getAccountBalance(acc.id);
      return {
        name: this._clip(acc.name, 40),
        icon: this._icon(acc.icon, 'wallet'),
        color: this._color(acc.color),
        text: this._money(state, balance, acc.currency),
        trend: this._trend(balance),
        other: !!(acc.currency && acc.currency !== state.currency)
      };
    });
    return {
      total: { text: this._money(state, data.total, data.currency), trend: this._trend(data.total) },
      accounts: rows,
      accountCount: all.length,
      // "+N more" for the rows a widget leaves out is counted natively from
      // accountCount (4 fit on a wide card, more on Android's bigger ones);
      // both plural forms travel as templates with {n} for the native side.
      moreOne: this._clip(window.I18n.t('widget.native.more.one', { count: '{n}' }), 30),
      moreOther: this._clip(window.I18n.t('widget.native.more.other', { count: '{n}' }), 30)
    };
  },

  // W2: Income vs Expenses — the current month to END of month, as the Home
  // card (incomeExpense, v0.94 EOM side).
  _month(state) {
    const W = window.Widgets;
    const inst = this._instance('incomeExpense');
    const buckets = W.registry.incomeExpense._buckets(inst) || [];
    const cur = buckets[buckets.length - 1];
    if (!cur || (cur.income === 0 && cur.expense === 0)) return null;
    const ccy = window.Store.aggregateSelection([]).currency;
    const peak = Math.max(cur.income, cur.expense) || 1;
    return {
      title: this._clip(cur.label, 30),
      incomeText: this._money(state, cur.income, ccy),
      expenseText: this._money(state, cur.expense, ccy),
      netText: this._money(state, cur.net, ccy, { signed: true }),
      netTrend: this._trend(cur.net),
      incomeBar: Math.round((cur.income / peak) * 1000) / 1000,
      expenseBar: Math.round((cur.expense / peak) * 1000) / 1000
    };
  },

  // W3: Categories — this month's spending SO FAR (MTD, the Home card's
  // side), folded to ≤ 6 slices with the CategoryPalette colours.
  _categories(state) {
    const W = window.Widgets;
    const data = W.registry.categories._data(this._instance('categories')) || [];
    if (data.length === 0) return null;
    const ccy = window.Store.aggregateSelection([]).currency;
    const total = data.reduce((s, d) => s + d.amount, 0);
    return {
      spentText: this._money(state, total, ccy),
      slices: data.map(d => ({
        name: this._clip(d.name, 30),
        icon: this._icon(d.icon, 'circle'),
        color: this._color(d._color) || '#64748b',
        share: total > 0 ? Math.round((d.amount / total) * 1000) / 1000 : 0,
        text: this._money(state, d.amount, ccy)
      }))
    };
  },

  // W4: Budget goals — this month's budgets as the Home card reads them
  // (getBudgetForMonth, most at risk first), the 3 closest to their limit.
  _budgets(state) {
    const S = window.Store;
    const def = window.Widgets.registry.budgets;
    const rows = def._rows(this._instance('budgets'), state);
    if (!rows.length) return null;
    const { limit, spent } = def._totals(rows);
    const pctText = (sp, lim) => {
      const overC = Math.round((sp - lim) * 100);
      if (lim > 0) return S.formatPercent((sp / lim) * 100);
      return overC > 0 ? window.I18n.t('budget.overBy', { amount: this._money(state, overC / 100) }) : '—';
    };
    const ratio = (sp, lim) => {
      if (lim > 0) return Math.round(Math.min(sp / lim, 1) * 1000) / 1000;
      return Math.round((sp - lim) * 100) > 0 ? 1 : 0;
    };
    return {
      spentText: this._money(state, spent),
      limitText: this._money(state, limit),
      ofText: this._clip(window.I18n.t('widget.budget.ofBudgeted', { amount: this._money(state, limit) }), 40),
      ratio: ratio(spent, limit),
      pctText: this._clip(pctText(spent, limit), 24),
      over: Math.round((spent - limit) * 100) > 0,
      rows: rows.slice(0, this.MAX_BUDGETS).map(r => ({
        name: this._clip(r.cat.name, 30),
        icon: this._icon(r.cat.icon, 'circle'),
        ratio: ratio(r.bdg.spent, r.bdg.finalLimit),
        pctText: this._clip(pctText(r.bdg.spent, r.bdg.finalLimit), 24),
        over: Math.round((r.bdg.spent - r.bdg.finalLimit) * 100) > 0
      }))
    };
  },

  // W5: Upcoming — the Home card's rows (scheduled series members and
  // untracked loan instalments after today, one row per transfer), over the
  // next 35 days and WITH their dates: the widget hides the days that have
  // passed and names Today / Tomorrow itself.
  _upcoming(state) {
    const S = window.Store;
    const def = window.Widgets.registry.upcoming;
    const inst = this._instance('upcoming', 'large', { accountIds: [], horizonDays: String(this.UPCOMING_DAYS) });
    const { txs, loanRows } = def._matches(inst, state);
    const merged = [...def._dedupe(txs), ...loanRows]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, this.MAX_UPCOMING);
    const cats = state.categories || [];
    const accs = state.accounts || [];
    const debtCat = cats.find(c => c.id === 'cat_debt');
    return merged.map(row => {
      const dayText = new Date(`${row.date}T12:00:00`).toLocaleDateString(S.getLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
      if (row.isLoan) {
        return {
          date: row.date, dayText: this._clip(dayText, 24),
          name: this._clip(row.name, 40), icon: this._icon(debtCat && debtCat.icon, 'landmark'),
          text: '-' + this._money(state, Math.abs(row.amount)), kind: 'expense'
        };
      }
      const cat = cats.find(c => c.id === row.categoryId);
      const acc = accs.find(a => a.id === row.accountId);
      const kind = row.transferRef ? 'transfer' : (row.type === 'expense' ? 'expense' : 'income');
      const name = cat ? cat.name : window.I18n.t(row.transferRef ? 'common.transfer' : 'common.uncategorized');
      return {
        date: row.date, dayText: this._clip(dayText, 24),
        name: this._clip(name, 40),
        icon: row.transferRef ? 'arrow-up-down' : this._icon(cat && cat.icon, 'receipt'),
        text: (row.type === 'expense' ? '-' : '+') + this._money(state, Math.abs(row.amount), acc && acc.currency),
        kind
      };
    });
  },

  // W6: Balance curve — every primary-currency account over the last month,
  // Home's curve (computeBalanceSeries), as 0–1 points; the total is today's.
  _curve(state) {
    const S = window.Store;
    const series = S.computeBalanceSeries({ range: this.CURVE_RANGE, accountIds: [], categoryIds: [] });
    const pts = (series && series.points) || [];
    if (pts.length < 2) return null;
    const values = pts.map(p => p.balance);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const first = values[0];
    const lastV = values[values.length - 1];
    const diff = Math.round((lastV - first) * 100) / 100;
    const ccy = S.aggregateSelection([]).currency;
    const pct = first !== 0 ? (diff / Math.abs(first)) * 100 : null;
    return {
      range: this.CURVE_RANGE,
      totalText: this._money(state, lastV, ccy),
      changeText: this._money(state, diff, ccy, { signed: true }),
      pctText: pct === null ? '' : S.formatPercent(pct, { digits: 1, signed: true }),
      trend: this._trend(diff),
      points: values.map(v => span > 0 ? Math.round(((v - min) / span) * 1000) / 1000 : 0.5)
    };
  },

  // The whole snapshot (docs/phone-widgets-plan.md §4). A pure read of state.
  buildSnapshot(state) {
    const S = window.Store;
    const st = state || S.getState();
    const now = new Date();
    const masked = !!(st.privacy && st.privacy.hide === true);
    const base = {
      v: this.VERSION,
      generatedAt: now.getTime(),
      day: S._todayYMD(),
      masked,
      updatedText: this._clip(window.I18n.t('widget.native.updated', {
        time: now.toLocaleString(S.getLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      }), 40),
      labels: this._labels()
    };
    if (!(st.accounts || []).length) return { ...base, empty: true };
    return this._withMemo(() => ({
      ...base,
      empty: false,
      ...this._accounts(st),
      month: this._month(st),
      categories: this._categories(st),
      budgets: this._budgets(st),
      upcoming: this._upcoming(st),
      curve: this._curve(st)
    }));
  },

  // FNV-1a over the content that matters: the build time is left out, so an
  // unchanged ledger never spends the system's widget reload budget.
  _hash(snap) {
    const copy = { ...snap };
    delete copy.generatedAt;
    delete copy.updatedText;
    const s = JSON.stringify(copy);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  },

  _plugin() {
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    const p = cap.Plugins && cap.Plugins.StackdWidgets;
    return p && typeof p.write === 'function' ? p : null;
  },

  // Builds and, when it changed, hands the snapshot to the plugin. Returns a
  // promise of true when a write was sent. Never throws: a widget is a
  // nicety, never a reason for the app to fail.
  async sync(opts) {
    clearTimeout(this._timer);
    this._timer = null;
    const plugin = this._plugin();
    if (!plugin) return false;
    // 1.3.0 (PL-3, security review 2026-11-13): nothing reaches the widgets
    // while App lock is up — a change made under the lock screen must never
    // become readable on the home screen. The widgets keep their last
    // snapshot; AppLock syncs again on unlock.
    if (window.AppLock && typeof window.AppLock.isLocked === 'function' && window.AppLock.isLocked()) return false;
    try {
      const snap = this.buildSnapshot();
      this.last = snap;
      const hash = this._hash(snap);
      if (!(opts && opts.force) && hash === this._lastHash) return false;
      await plugin.write({ json: JSON.stringify(snap) });
      this._lastHash = hash;
      return true;
    } catch (e) {
      return false;
    }
  },

  schedule() {
    if (!this._plugin()) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { this.sync(); }, this.DEBOUNCE_MS);
  },

  // ── WG-2: a tap on a widget ────────────────────────────────────────────
  // Every tap arrives as stackd://open?to=<target>[&type=…|&day=…]: iOS
  // widgetURL / Link and Android PendingIntents through Capacitor's
  // appUrlOpen / getLaunchUrl, the iOS Quick add buttons through the
  // plugin's takePending() (an App Intent stores the URL, then opens the app).
  // The targets are a fixed list; anything else opens Home. Nothing from the
  // URL reaches markup or a route string unchecked.
  ADD_TYPES: ['expense', 'income', 'transfer'],

  _isDay(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, d] = v.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  },

  _query(url) {
    const q = {};
    const i = url.indexOf('?');
    if (i === -1) return q;
    url.slice(i + 1).split('#')[0].split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (!k) return;
      try { q[decodeURIComponent(k)] = decodeURIComponent(v || ''); } catch (e) { /* a broken escape is ignored */ }
    });
    return q;
  },

  // → { path, actions: [[type, payload]…] } for a widget URL, null for any
  // other URL (a bank return, a Universal Link) so its owner handles it.
  parseOpenUrl(url) {
    if (typeof url !== 'string' || !/^stackd:\/\/open(?:[/?#]|$)/i.test(url)) return null;
    const q = this._query(url);
    const S = window.Store;
    const today = S._todayYMD();
    switch (q.to) {
      case 'add':
        return { path: this.ADD_TYPES.includes(q.type) ? `#add?type=${q.type}` : '#add', actions: [] };
      case 'analytics':
        return {
          path: '#analytics',
          actions: [['UPDATE_FILTERS', { page: 'analytics', filters: { period: { type: 'month', value: today, start: '', end: '' } } }]]
        };
      case 'budget':
        return { path: '#budget', actions: [['SET_MONTH_FILTER', today.slice(0, 7)]] };
      case 'history': {
        if (!this._isDay(q.day)) return { path: '#transactions', actions: [] };
        return {
          path: '#transactions',
          actions: [['UPDATE_FILTERS', {
            page: 'history',
            filters: { period: { type: 'custom', value: '', start: q.day, end: q.day }, categories: [], types: [], accounts: [], tags: [] }
          }]]
        };
      }
      default:
        return { path: '#dashboard', actions: [] };
    }
  },

  // Opens a widget URL. Returns true when it was one (handled), false
  // otherwise. A fresh entry over the current screen, so Back returns there.
  openUrl(url) {
    const target = this.parseOpenUrl(url);
    if (!target) return false;
    try {
      target.actions.forEach(([type, payload]) => window.Store.dispatch(type, payload));
      const cur = window.location ? window.location.hash : '';
      if (cur === target.path) window.Router.handleRouteChange();
      else window.Router.navigate(target.path);
    } catch (e) { /* a widget tap never breaks the app */ }
    return true;
  },

  // iOS Quick add: the App Intent left its URL in the App Group.
  async consumePending() {
    const cap = window.Capacitor;
    const p = cap && cap.Plugins && cap.Plugins.StackdWidgets;
    if (!p || typeof p.takePending !== 'function') return false;
    try {
      const r = await p.takePending();
      return !!(r && r.url && this.openUrl(r.url));
    } catch (e) {
      return false;
    }
  },

  // Called once from main.js after the first render. Only a native build with
  // the plugin listens at all; the web build does nothing.
  start() {
    if (this._started || !this._plugin()) return;
    this._started = true;
    window.Store.subscribe(() => this.schedule());
    // Leaving the app writes at once (the debounce may not get to run), and
    // coming back catches a new day and a Quick add tap waiting for us.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._takeSoon();
      this.sync();
    });
    this._takeSoon();
    this.sync({ force: true });
  },

  // iOS runs the Quick add intent around the moment the app comes forward,
  // not always before it: look now and once more shortly after.
  _takeSoon() {
    this.consumePending().then((opened) => {
      if (!opened) setTimeout(() => { this.consumePending(); }, 900);
    });
  }
};
