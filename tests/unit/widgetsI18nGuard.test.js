// 1.0.1 (BUG-09) — pseudo-locale render guard for the Home widgets.
//
// i18n.test.js only checks dictionary parity, so an English literal that never
// became a key is invisible to it. This guard renders EVERY widget type at
// every size (plus each config panel and the live 50/30/20 hint) with:
//   - I18n.t stubbed to '§'          → every translated string is one glyph,
//   - I18n.locale stubbed to 'ja-JP' → Intl dates/numbers carry no Latin letters,
//   - all user data renamed to '★'   → category/account/loan names are inert,
// then strips tags/entities and fails on any run of 2+ Latin letters left in
// the visible text or in aria-label / title / placeholder / alt values.
// A new widget, or a new literal in an existing one, must go through t().
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const makeLocalStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
};

const makeChartStub = () => {
  const created = [];
  const Chart = function (canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.destroy = () => {};
    created.push(this);
  };
  Chart.getChart = () => null;
  Chart._created = created;
  return Chart;
};

const LOAN_CONFIG = {
  type: 'mortgage',
  principal: 111000,
  duration: 30,
  durationUnit: 'years',
  annualRate: 4.05,
  firstPaymentDate: '2026-07-01',
  amortization: 'french'
};

let uuid = 0;
const Store = () => global.window.Store;
const W = () => global.window.Widgets;

const boot = (pseudo = true) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    document: { documentElement: { setAttribute: () => {}, classList: { add: () => {}, remove: () => {} } } }
  };
  global.localStorage = global.window.localStorage;
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');

  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  global.window.Chart = makeChartStub();
  Store().init();
  Store().state.currency = 'EUR';
  Store().dispatch('ADD_ACCOUNT', { name: '★', openingBalance: 1000, openingDate: '2020-01-01' });
  Store().dispatch('ADD_ACCOUNT', { name: '★', openingBalance: 50, openingDate: '2020-01-01' });
  const [a1, a2] = Store().getState().accounts.map(a => a.id);

  const row = (r) => ({
    id: `tx-${++uuid}`, accountId: a1, categoryId: 'cat_groceries', type: 'expense',
    createdAt: '2026-01-01T00:00:00.000Z', ...r
  });
  Store().state.transactions.push(
    // last month and this month, both directions (savings/netflow/netWorth)
    row({ type: 'income', categoryId: 'cat_salary', amount: 3000, date: '2026-05-02' }),
    row({ amount: 900, date: '2026-05-10' }),
    row({ type: 'income', categoryId: 'cat_salary', amount: 2500, date: '2026-06-01' }),
    row({ amount: 120.5, date: '2026-06-03' }),
    row({ amount: 80, categoryId: 'cat_dining', date: '2026-06-05' }),
    row({ amount: 45, categoryId: 'cat_transport', date: '2026-06-06' }),
    row({ amount: 33, categoryId: null, date: '2026-06-07' }),                     // uncategorized
    // a transfer pair (latest widget transfer label)
    row({ id: 'tr-out', amount: 10, categoryId: null, transferRef: 'tr-in', date: '2026-06-08' }),
    row({ id: 'tr-in', type: 'income', accountId: a2, amount: 10, categoryId: null, transferRef: 'tr-out', date: '2026-06-08' }),
    // a future recurring member inside the 30-day horizon (upcoming widget)
    row({ amount: 60, categoryId: 'cat_utilities', date: '2026-06-25',
      recurrence: { seriesId: 's1', interval: 1, frequency: 'months', startDate: '2026-06-25', endDate: '2027-01-01' } }),
    row({ type: 'income', categoryId: 'cat_salary', amount: 70, date: '2026-06-28',
      recurrence: { seriesId: 's2', interval: 1, frequency: 'months', startDate: '2026-06-28', endDate: '2027-01-01' } })
  );

  // 6 budgets (so the "+N more" overflow renders), one overspent.
  const cats = ['cat_groceries', 'cat_dining', 'cat_transport', 'cat_shopping', 'cat_health', 'cat_utilities'];
  cats.forEach((c, i) => Store().dispatch('SAVE_BUDGET', {
    categoryId: c, amount: i === 0 ? 100 : 200 + i, startDate: '', endDate: null, isCumulative: false
  }));

  // An active, untracked loan with a payment inside the horizon.
  Store().dispatch('ADD_LOAN', { name: '★', kind: 'active', config: LOAN_CONFIG });

  // All user data inert.
  Store().state.categories.forEach(c => { c.name = '★'; });
  Store().state.accounts.forEach(a => { a.name = '★'; });
  Store().state.loans.forEach(l => { l.name = '★'; });

  // Pseudo-locale: every key is one glyph, every Intl output Latin-free.
  if (pseudo) {
    global.window.I18n.t = () => '§';
    global.window.I18n.locale = () => 'ja-JP';
  }
};

/** Visible text plus the human-facing attribute values of an HTML string. */
const humanText = (html) => {
  const attrs = [];
  html.replace(/\s(aria-label|title|placeholder|alt)="([^"]*)"/g, (m, name, val) => { attrs.push(val); return m; });
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ');
  return [text, ...attrs].join(' ');
};

// The Store's category-distribution label for uncategorized rows is owned by
// the 1.0.1 forms unit (BUG-08), which also adds the 'common.uncategorized'
// key. Until that key exists the label is tolerated; once it exists the guard
// is strict again and fails if the store still hard-codes the English word.
const pendingLiterals = () =>
  (global.window.I18n.dicts.en && global.window.I18n.dicts.en['common.uncategorized'] != null) ? [] : ['Uncategorized'];

const leaks = (html) => {
  const pending = pendingLiterals();
  const found = (humanText(html).match(/[A-Za-z]{2,}/g) || []).filter(w => !pending.includes(w));
  return [...new Set(found)];
};

const instanceFor = (type, size, config) => ({ id: `guard-${type}-${size}`, type, size, config: config || {}, createdAt: '' });

describe('no hard-coded English in widget output (1.0.1 BUG-09 guard)', () => {
  beforeEach(() => boot(true));
  afterEach(() => { vi.useRealTimers(); });

  it('the pseudo-locale really is Latin-free for formatted values', () => {
    expect(leaks(Store().formatCurrency(-1234.5))).toEqual([]);
    expect(leaks(Store().formatPercent(-59.9, { digits: 1, signed: true }))).toEqual([]);
    expect(leaks(new Date(2026, 5, 20, 12).toLocaleDateString(Store().getLocale(), { month: 'short', day: 'numeric' }))).toEqual([]);
    // ...and the guard itself does catch a literal.
    expect(leaks('<span class="x">of §</span>')).toEqual(['of']);
  });

  const CONFIGS = {
    fiftyThirtyTwenty: [
      { plannedIncome: 2000, pctNeeds: 50, pctWants: 30, pctSavings: 20 },
      { plannedIncome: 2000, pctNeeds: 70, pctWants: 40, pctSavings: 20 } // 130% → fallback label
    ],
    upcoming: [{ horizonDays: '30' }, { horizonDays: '7' }],
    categories: [{ direction: 'expense' }, { direction: 'income' }],
    budgets: [{ mode: 'all' }]
  };

  it('renders every registry type × size × config without a leaked literal', () => {
    const types = Object.keys(W().registry);
    expect(types.length).toBeGreaterThanOrEqual(8);
    const report = [];
    for (const type of types) {
      const def = W().registry[type];
      for (const size of def.sizes) {
        for (const config of (CONFIGS[type] || [{}])) {
          W()._passMemo = {};
          const instance = instanceFor(type, size, config);
          // def.render directly (not _renderCard) so a throw fails the test
          // instead of hiding behind the 'load failed' placeholder.
          const html = def.render(instance, Store().getState());
          const bad = leaks(html);
          if (bad.length) report.push(`${type}/${size} ${JSON.stringify(config)}: ${bad.join(', ')}`);
          // Caption getters too.
          if (def.caption) {
            const cap = typeof def.caption === 'function' ? def.caption(instance) : def.caption;
            const capBad = leaks(String(cap || ''));
            if (capBad.length) report.push(`${type}/${size} caption: ${capBad.join(', ')}`);
          }
        }
      }
    }
    expect(report).toEqual([]);
  });

  it('exercises the data paths it means to guard (not just empty states)', () => {
    const t = global.window.I18n.t;
    const keys = [];
    global.window.I18n.t = (k) => { keys.push(k); return '§'; };
    const r = W().registry;
    W()._passMemo = {};
    r.upcoming.render(instanceFor('upcoming', 'large', { horizonDays: '30' }), Store().getState());
    r.budgets.render(instanceFor('budgets', 'large', {}), Store().getState());
    r.savings.render(instanceFor('savings', 'small', {}), Store().getState());
    r.netWorth.render(instanceFor('netWorth', 'small', {}), Store().getState());
    r.incomeExpense.render(instanceFor('incomeExpense', 'small', {}), Store().getState());
    r.fiftyThirtyTwenty.render(instanceFor('fiftyThirtyTwenty', 'large', CONFIGS.fiftyThirtyTwenty[1]), Store().getState());
    r.latest.render(instanceFor('latest', 'large', {}), Store().getState());
    global.window.I18n.t = t;
    for (const k of [
      'widget.upcoming.loanSub', 'widget.upcoming.netImpact', 'widget.budget.moreInGoals',
      'widget.budget.ofBudgeted', 'widget.savings.vsMonth', 'dash.vsStartOfMonth',
      'widget.netflow.net', 'widget.netflow.in', 'widget.netflow.out',
      'widget.fifty.baseLabelFallback', 'common.transfer'
    ]) {
      expect(keys).toContain(k);
    }
  });

  it('renders the dashboard section (titles, captions, edit chrome) without a leaked literal', () => {
    Object.keys(W().registry).forEach(type => {
      W().registry[type].sizes.forEach(size => {
        Store().dispatch('ADD_HOME_WIDGET', { type, size, config: (CONFIGS[type] || [{}])[0] });
      });
    });
    const state = { ...Store().getState(), widgetEditMode: true };
    expect(leaks(W().renderSection(state))).toEqual([]);
    expect(leaks(W().renderSection({ ...state, widgetEditMode: false }))).toEqual([]);
  });

  it('renders every config panel without a leaked literal', () => {
    const report = [];
    for (const [type, def] of Object.entries(W().registry)) {
      if (!def.renderConfig) continue;
      for (const config of [def.defaultConfig || {}, ...(CONFIGS[type] || [])]) {
        const html = def.renderConfig({ ...(def.defaultConfig || {}), ...config }, Store().getState());
        const bad = leaks(html);
        if (bad.length) report.push(`${type} ${JSON.stringify(config)}: ${bad.join(', ')}`);
      }
    }
    expect(report).toEqual([]);
  });

  it('keeps the live 50/30/20 sum hint free of literals as the user types', () => {
    let draft = { plannedIncome: 2000, pctNeeds: 50, pctWants: 30, pctSavings: 20 };
    const ctx = {
      getConfig: () => draft,
      setConfig: (patch) => { draft = { ...draft, ...patch }; },
      rerender: () => {}
    };
    const listeners = {};
    const needsEl = {
      dataset: { fiftyPct: 'pctNeeds' }, value: '',
      addEventListener: (ev, fn) => { listeners.needs = fn; }
    };
    const hint = { style: {}, textContent: '' };
    const root = {
      querySelector: (sel) => (sel === '#fifty-sum-hint' ? hint : null),
      querySelectorAll: (sel) => (sel === '[data-fifty-pct]' ? [needsEl] : [])
    };
    W().registry.fiftyThirtyTwenty.attachConfig(root, ctx);
    needsEl.value = '80';
    listeners.needs();
    expect(hint.style.display).toBe('block');
    expect(leaks(hint.textContent)).toEqual([]);
    needsEl.value = '50';
    listeners.needs();
    expect(hint.style.display).toBe('none');
  });
});

describe('widget percentages follow the UI language (1.0.1 BUG-09)', () => {
  beforeEach(() => {
    boot(false);
    // Real translations, Italian.
    executeFile('i18n/it.js');
    global.window.I18n.setLang('it');
  });
  afterEach(() => { vi.useRealTimers(); });

  it('savings and netWorth badges use a comma decimal and Italian copy', () => {
    W()._passMemo = {};
    const savings = W().registry.savings.render(instanceFor('savings', 'small', {}), Store().getState());
    const badge = savings.match(/class="widget-delta[^"]*">([^<]*)<\/span>/);
    expect(badge).not.toBeNull();
    expect(badge[1]).toMatch(/^[+-]?\d+,\d%$/);
    expect(savings).not.toMatch(/\d\.\d%/);
    expect(savings).toContain(' vs ');
  });

  it('the categories doughnut tooltip uses the locale percent', () => {
    W()._passMemo = {};
    const instance = instanceFor('categories', 'small', {});
    W().registry.categories.render(instance, Store().getState());
    const card = { addEventListener: () => {}, querySelector: () => ({ id: 'c' }) };
    W().registry.categories.attach(instance, card, Store().getState());
    const chart = global.window.Chart._created[global.window.Chart._created.length - 1];
    const label = chart.config.options.plugins.tooltip.callbacks.label;
    const out = label({ parsed: 1, dataset: { data: [1, 2] } });
    expect(out).toContain('33,3');
    expect(out).not.toContain('33.3');
  });

  it('budgets show the Italian "of … budgeted" line and plural overflow', () => {
    W()._passMemo = {};
    const html = W().registry.budgets.render(instanceFor('budgets', 'large', {}), Store().getState());
    expect(html).toContain('di budget');
    expect(html).toContain('+2 altri in Obiettivi');
    expect(html).not.toContain('budgeted');
  });
});
