// v0.72 Phase 5 — the 50/30/20 budget widget (docs/home-widgets-plan.md §5.3):
// needs/wants partition by config, planned-vs-actual income basis, savings as
// actual money left, and the fallback when the split doesn't total 100.
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

const pad = (n) => String(n).padStart(2, '0');
const thisMonth = (day) => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`;
};
const dateOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

let uuid = 0;

const boot = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));

  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} })
  };
  global.localStorage = global.window.localStorage;
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');

  executeFile('db.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  global.window.Store.init();
  global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
};

afterEach(() => { vi.useRealTimers(); });

const Store = () => global.window.Store;
const W = () => global.window.Widgets;

const seed = (rows) => {
  const accId = Store().getState().accounts[0].id;
  Store().state.transactions.push(...rows.map((r, i) => ({
    id: `tx-${i}-${Math.random()}`,
    accountId: accId,
    categoryId: r.categoryId || 'cat_groceries',
    type: r.type || 'expense',
    amount: r.amount,
    date: r.date,
    createdAt: '2026-01-01T00:00:00.000Z'
  })));
};

const renderOne = (config) => {
  Store().dispatch('ADD_HOME_WIDGET', { type: 'fiftyThirtyTwenty', size: 'large', config });
  const list = Store().getState().homeWidgets;
  const instance = list[list.length - 1];
  return { instance, html: W().registry.fiftyThirtyTwenty.render(instance, Store().getState()) };
};

describe('50/30/20 widget', () => {
  beforeEach(boot);

  it('is large-only and configurable', () => {
    const def = W().registry.fiftyThirtyTwenty;
    expect(def.sizes).toEqual(['large']);
    expect(def.hasConfig).toBe(true);
  });

  it('shows an empty state without any income basis', () => {
    const { html } = renderOne({});
    expect(html).toContain('Add income this month');
  });

  it('partitions spending: Needs categories vs everything else as Wants', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 2000, date: thisMonth(1) },
      { categoryId: 'cat_rent', amount: 600, date: thisMonth(2) },       // needs
      { categoryId: 'cat_groceries', amount: 200, date: thisMonth(3) },  // needs
      { categoryId: 'cat_dining', amount: 150, date: thisMonth(4) }      // unassigned → wants
    ]);
    const { html } = renderOne({ needsCategoryIds: ['cat_rent', 'cat_groceries'] });
    // Needs 800/1000, Wants 150/600, Savings actual 2000-950=1050 / 400
    expect(html).toContain('$800.00 / $1,000.00');
    expect(html).toContain('$150.00 / $600.00');
    expect(html).toContain('$1,050.00 / $400.00');
  });

  it('sizes targets from planned income but keeps savings as ACTUAL money left', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 1200, date: thisMonth(1) },
      { amount: 300, date: thisMonth(2) }
    ]);
    const { html } = renderOne({ plannedIncome: 3000, needsCategoryIds: ['cat_groceries'] });
    expect(html).toContain('of $3,000.00 planned income');
    expect(html).toContain('$300.00 / $1,500.00');   // needs vs 50% of planned
    // savings actual = 1200 - 300 = 900, target = 20% of planned = 600
    expect(html).toContain('$900.00 / $600.00');
  });

  it('falls back to actual income when no planned income is set', () => {
    seed([{ type: 'income', categoryId: 'cat_salary', amount: 1000, date: thisMonth(1) }]);
    const { html } = renderOne({});
    expect(html).toContain('of $1,000.00 actual income');
    expect(html).toContain('$0.00 / $500.00'); // needs target = 50% of 1000
  });

  it('marks an over-cap Needs bar red and an on-target Savings bar green', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 1000, date: thisMonth(1) },
      { categoryId: 'cat_rent', amount: 700, date: thisMonth(2) }  // needs cap = 500 → over
    ]);
    const { html } = renderOne({ needsCategoryIds: ['cat_rent'] });
    expect(html).toContain('var(--color-expense)');       // over-cap needs
    // savings actual 300 >= target 200 → green
    expect(html).toContain('var(--color-income)');
  });

  it('shows negative savings red and clamps its bar at zero width', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 100, date: thisMonth(1) },
      { amount: 400, date: thisMonth(2) }
    ]);
    const { html } = renderOne({});
    expect(html).toContain('-$300.00 / $20.00');
    expect(html).toContain('width: 0%');
    expect(html).not.toContain('width: -');
  });

  it('falls back to 50/30/20 when the split does not total 100, and says so', () => {
    seed([{ type: 'income', categoryId: 'cat_salary', amount: 1000, date: thisMonth(1) }]);
    const { html } = renderOne({ pctNeeds: 70, pctWants: 40, pctSavings: 20 }); // 130
    expect(html).toContain('using 50/30/20 (fix the split)');
    expect(html).toContain('$0.00 / $500.00'); // needs target from the fallback 50%
  });

  it('accepts a custom split that does total 100', () => {
    seed([{ type: 'income', categoryId: 'cat_salary', amount: 1000, date: thisMonth(1) }]);
    const { html } = renderOne({ pctNeeds: 60, pctWants: 20, pctSavings: 20 });
    expect(html).not.toContain('fix the split');
    expect(html).toContain('Needs 60%');
    expect(html).toContain('$0.00 / $600.00');
  });

  it('is month-to-date: scheduled future rows do not count as spent', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 1000, date: thisMonth(1) },
      { amount: 100, date: thisMonth(2) },
      { amount: 777, date: dateOffset(3) }   // later this month, not yet spent
    ]);
    const { html } = renderOne({});
    expect(html).not.toContain('777');
    // savings = 1000 - 100, unaffected by the scheduled row
    expect(html).toContain('$900.00');
  });

  it('hints at picking Needs categories until some are assigned', () => {
    seed([{ type: 'income', categoryId: 'cat_salary', amount: 1000, date: thisMonth(1) }]);
    expect(renderOne({}).html).toContain('pick your Needs categories');
    expect(renderOne({ needsCategoryIds: ['cat_rent'] }).html).not.toContain('pick your Needs categories');
  });

  describe('config panel', () => {
    it('renders income, split inputs, a sum hint and All-less category chips', () => {
      const html = W().registry.fiftyThirtyTwenty.renderConfig(
        { plannedIncome: null, pctNeeds: 50, pctWants: 30, pctSavings: 20, needsCategoryIds: [] },
        Store().getState());
      expect(html).toContain('data-fifty-income');
      expect(html.match(/data-fifty-pct/g)).toHaveLength(3);
      expect(html).toContain('fifty-sum-hint');
      expect(html).toContain('data-config-multi="needsCategoryIds"');
      // Empty needsCategoryIds means "none assigned", never "all" — no All chip.
      expect(html).not.toContain('__all__');
      expect(html).not.toContain('data-config-multi="accountIds"');
    });

    it('parses inputs into numbers without rerendering (focus preservation)', () => {
      let draft = { plannedIncome: null, pctNeeds: 50, pctWants: 30, pctSavings: 20, needsCategoryIds: [] };
      let rerenders = 0;
      const ctx = {
        getConfig: () => draft,
        setConfig: (patch) => { draft = { ...draft, ...patch }; },
        rerender: () => { rerenders++; }
      };
      const listeners = {};
      const fakeInput = (dataset) => ({
        dataset, value: '',
        addEventListener: (ev, fn) => { listeners[dataset.fiftyPct || 'income'] = fn; }
      });
      const incomeEl = fakeInput({});
      const needsEl = fakeInput({ fiftyPct: 'pctNeeds' });
      const root = {
        querySelector: (sel) => sel === '[data-fifty-income]' ? incomeEl : null,
        querySelectorAll: (sel) => sel === '[data-fifty-pct]' ? [needsEl] : []
      };
      W().registry.fiftyThirtyTwenty.attachConfig(root, ctx);

      incomeEl.value = '2500.50';
      listeners.income();
      expect(draft.plannedIncome).toBe(2500.5);

      incomeEl.value = '';
      listeners.income();
      expect(draft.plannedIncome).toBeNull();   // empty = auto

      needsEl.value = '55';
      listeners.pctNeeds();
      expect(draft.pctNeeds).toBe(55);

      expect(rerenders).toBe(0);   // typing must never rebuild the panel
    });
  });
});

describe('phase 5 gallery', () => {
  beforeEach(boot);

  it('pins the full eight-type gallery order', () => {
    expect(W().listTypes().map(t => t.type)).toEqual(
      ['latest', 'incomeExpense', 'categories', 'netWorth', 'savings', 'upcoming', 'budgets', 'fiftyThirtyTwenty']
    );
  });
});
