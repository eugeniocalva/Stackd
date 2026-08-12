// v0.82 rework (docs/refactor-plan.md P4.2): the 50/30/20 widget is a STATIC
// planned-income splitter — no actuals tracking, no Needs-category partition.
// It renders the user-entered planned monthly income divided into three
// amounts, and an empty state until that income is set (no silent fallback to
// actual income). The original v0.72 actuals semantics are intentionally gone.
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
  executeFile('i18n.js');
  executeFile('i18n/en.js');
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

describe('50/30/20 widget (v0.82 static splitter)', () => {
  beforeEach(boot);

  it('is large-only and configurable', () => {
    const def = W().registry.fiftyThirtyTwenty;
    expect(def.sizes).toEqual(['large']);
    expect(def.hasConfig).toBe(true);
  });

  it('shows the setup empty state until a planned income is set', () => {
    const { html } = renderOne({});
    expect(html).toContain('Set your planned monthly income');
  });

  it('never falls back to actual income — the split must be stable', () => {
    // Even with real income this month, no plannedIncome = empty state.
    seed([{ type: 'income', categoryId: 'cat_salary', amount: 1000, date: thisMonth(1) }]);
    const { html } = renderOne({});
    expect(html).toContain('Set your planned monthly income');
    expect(html).not.toContain('$1,000.00');
    expect(html).not.toContain('actual income');
  });

  it('splits the planned income into the three amounts', () => {
    const { html } = renderOne({ plannedIncome: 2000 });
    expect(html).toContain('$2,000.00');
    expect(html).toContain('planned monthly income');
    expect(html).toContain('Needs 50%');
    expect(html).toContain('$1,000.00');
    expect(html).toContain('Wants 30%');
    expect(html).toContain('$600.00');
    expect(html).toContain('Savings 20%');
    expect(html).toContain('$400.00');
  });

  it('renders neutral fills whose width is the percentage itself', () => {
    const { html } = renderOne({ plannedIncome: 2000 });
    expect(html).toContain('width: 50%');
    expect(html).toContain('width: 30%');
    expect(html).toContain('width: 20%');
    expect(html).toContain('var(--color-primary)');
    // No over/under states any more — nothing can be red or amber.
    expect(html).not.toContain('var(--color-expense)');
    expect(html).not.toContain('#f59e0b');
  });

  it('ignores transactions entirely — spending never changes the amounts', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 5000, date: thisMonth(1) },
      { categoryId: 'cat_rent', amount: 4999, date: thisMonth(2) }
    ]);
    const { html } = renderOne({ plannedIncome: 2000 });
    expect(html).not.toContain('4,999');
    expect(html).not.toContain('5,000');
    expect(html).not.toContain('saved so far');
    expect(html).toContain('$1,000.00');
  });

  it('accepts a custom split that totals 100', () => {
    const { html } = renderOne({ plannedIncome: 1000, pctNeeds: 60, pctWants: 20, pctSavings: 20 });
    expect(html).not.toContain('fix the split');
    expect(html).toContain('Needs 60%');
    expect(html).toContain('$600.00');
  });

  it('falls back to 50/30/20 when the split does not total 100, and says so', () => {
    const { html } = renderOne({ plannedIncome: 1000, pctNeeds: 70, pctWants: 40, pctSavings: 20 }); // 130
    expect(html).toContain('using 50/30/20 (fix the split)');
    expect(html).toContain('$500.00'); // needs amount from the fallback 50%
  });

  it('ignores stray needsCategoryIds keys from pre-v0.82 persisted configs', () => {
    const { html } = renderOne({ plannedIncome: 2000, needsCategoryIds: ['cat_rent', 'cat_groceries'] });
    expect(html).toContain('$1,000.00');
    expect(html).not.toContain('pick your Needs categories');
  });

  describe('config panel', () => {
    it('renders income and split inputs with a sum hint — no category chips', () => {
      const html = W().registry.fiftyThirtyTwenty.renderConfig(
        { plannedIncome: null, pctNeeds: 50, pctWants: 30, pctSavings: 20 },
        Store().getState());
      expect(html).toContain('data-fifty-income');
      expect(html.match(/data-fifty-pct/g)).toHaveLength(3);
      expect(html).toContain('fifty-sum-hint');
      // v0.82: the Needs-categories picker is gone with the actuals tracking.
      expect(html).not.toContain('data-config-multi="needsCategoryIds"');
      expect(html).not.toContain('Needs categories');
    });

    it('parses inputs into numbers without rerendering (focus preservation)', () => {
      let draft = { plannedIncome: null, pctNeeds: 50, pctWants: 30, pctSavings: 20 };
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
      expect(draft.plannedIncome).toBeNull();   // empty = unset (empty state)

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
