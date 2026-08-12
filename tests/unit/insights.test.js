// v0.84 (docs/refactor-plan.md P6) — Smart Insights dashboard section.
// Rule-based, 100% on-device cards: account concentration, top spending
// category (month-to-date), month-end outlook (EOM forecast), income mix.
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
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // June 15 — mid-month

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
  executeFile('insights.js');
  global.window.Store.init();
};

afterEach(() => { vi.useRealTimers(); });

const Store = () => global.window.Store;
const Insights = () => global.window.Insights;

const addAccount = (name, openingBalance) => {
  Store().dispatch('ADD_ACCOUNT', { name, openingBalance, openingDate: '2020-01-01' });
  const accs = Store().getState().accounts;
  return accs[accs.length - 1].id;
};

const addTx = (over) => {
  Store().dispatch('ADD_TRANSACTION', {
    type: 'expense', categoryId: 'cat_groceries', amount: 10,
    accountId: Store().getState().accounts[0].id, date: thisMonth(2), ...over
  });
};

const cardsById = () => {
  const map = {};
  Insights().compute(Store().getState()).forEach(c => { map[c.stringId] = c; });
  return map;
};

describe('Smart Insights rules', () => {
  beforeEach(boot);

  it('renders nothing at all on an empty install', () => {
    expect(Insights().compute(Store().getState())).toEqual([]);
    expect(Insights().renderSection(Store().getState())).toBe('');
  });

  it('account mix: skipped with one account, concentration variant at >=60%', () => {
    addAccount('Only', 1000);
    expect(cardsById().accountConcentration).toBeUndefined();
    expect(cardsById().accountBalanced).toBeUndefined();

    addAccount('Side', 100); // 1000/1100 = 91%
    const c = cardsById().accountConcentration;
    expect(c).toBeDefined();
    expect(c.params.pct).toBe(91);
    expect(c.params.name).toBe('Only');
  });

  it('account mix: balanced variant below 60%, negative balances excluded from the base', () => {
    addAccount('A', 500);
    addAccount('B', 450); // 53% → balanced
    expect(cardsById().accountBalanced.params.pct).toBe(53);

    // A third account deep in the red must not inflate the others' shares.
    const cId = addAccount('C', 0);
    addTx({ accountId: cId, amount: 800, date: thisMonth(1) }); // C at -800
    const c = cardsById().accountBalanced;
    expect(c).toBeDefined();
    expect(c.params.pct).toBe(53); // unchanged: 500/(500+450)
  });

  it('account mix: a funded account next to a drained/negative one is NOT concentration', () => {
    // Review finding (v0.84): checking +5000 with a credit card at -800 used
    // to render "100% of your money sits in Checking — consider spreading".
    const cId1 = addAccount('Checking', 5000);
    const cId2 = addAccount('Card', 0);
    addTx({ accountId: cId2, amount: 800, date: thisMonth(1), categoryId: 'cat_shopping' });
    void cId1;
    expect(cardsById().accountConcentration).toBeUndefined();
    expect(cardsById().accountBalanced).toBeUndefined();
  });

  it('month outlook: fires for a scheduled-only month (no MTD activity yet)', () => {
    // Review finding (v0.84): the old guard used MTD actuals, so a
    // recurring-only user lost the card at every month boundary.
    addAccount('Main', 1000);
    addTx({ amount: 250, date: thisMonth(25) }); // future-dated, nothing spent yet
    const c = cardsById().shortfall; // projects -250 by EOM
    expect(c).toBeDefined();
    expect(c.params.amount).toContain('250');
  });

  it('month outlook: exact break-even is no signal, not "+$0.00 put aside"', () => {
    addAccount('Main', 1000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 500, date: thisMonth(1) });
    addTx({ amount: 500, date: thisMonth(2) });
    expect(cardsById().onTrackSave).toBeUndefined();
    expect(cardsById().shortfall).toBeUndefined();
  });

  it('top spending: month-to-date only, high variant with the trim advice at >=40%', () => {
    addAccount('Main', 2000);
    addTx({ categoryId: 'cat_rent', amount: 700, date: thisMonth(2) });
    addTx({ categoryId: 'cat_groceries', amount: 300, date: thisMonth(3) });
    addTx({ categoryId: 'cat_dining', amount: 990, date: thisMonth(25) }); // scheduled → excluded

    const c = cardsById().topSpendingHigh; // rent 700/1000 = 70%
    expect(c).toBeDefined();
    expect(c.params.pct).toBe(70);
    expect(c.params.name).toBe('Rent');
    expect(c.tone).toBe('expense');
    expect(c.iconColor).toBeTruthy(); // category color rides along
  });

  it('month outlook: positive EOM projection includes scheduled rows and reads as income', () => {
    addAccount('Main', 1000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 900, date: thisMonth(1) });
    addTx({ amount: 100, date: thisMonth(2) });
    addTx({ amount: 200, date: thisMonth(28) }); // scheduled — EOM math counts it

    const c = cardsById().onTrackSave; // 900 - 100 - 200 = +600 by EOM
    expect(c).toBeDefined();
    expect(c.tone).toBe('income');
    expect(c.params.amount).toContain('600');
    expect(c.params.month).toBe('June');
  });

  it('month outlook: shortfall variant when the month projects negative', () => {
    addAccount('Main', 1000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 100, date: thisMonth(1) });
    addTx({ amount: 500, date: thisMonth(2) });

    const c = cardsById().shortfall;
    expect(c).toBeDefined();
    expect(c.tone).toBe('expense');
    expect(c.params.amount).toContain('400');
  });

  it('income mix fires only when one source dominates (>=50%)', () => {
    addAccount('Main', 0);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 800, date: thisMonth(1) });
    addTx({ type: 'income', categoryId: 'cat_freelance', amount: 200, date: thisMonth(2) });
    // Salary at 80% — but the top-3 slice may hide it; check via the raw rule.
    const rule = Insights().rules.find(r => r.id === 'incomeSource');
    const res = rule.compute(Store().getState());
    expect(res).toBeDefined();
    expect(res.params.pct).toBe(80);

    // Three-way split (salary 800 / freelance 750 / investments 600 → top 37%) → null.
    addTx({ type: 'income', categoryId: 'cat_freelance', amount: 550, date: thisMonth(3) });
    addTx({ type: 'income', categoryId: 'cat_investments', amount: 600, date: thisMonth(4) });
    expect(rule.compute(Store().getState())).toBeNull();
  });

  it('caps the section at three cards, in priority order', () => {
    addAccount('A', 900);
    addAccount('B', 100);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 1000, date: thisMonth(1) });
    addTx({ categoryId: 'cat_rent', amount: 400, date: thisMonth(2) });

    const cards = Insights().compute(Store().getState());
    expect(cards).toHaveLength(3); // all four rules fire; incomeSource is sliced off
    expect(cards.map(c => c.stringId)).toEqual(['accountConcentration', 'topSpendingHigh', 'onTrackSave']);
  });

  it('a throwing rule is contained and the other cards still render', () => {
    addAccount('A', 900);
    addAccount('B', 100);
    const original = Insights().rules[1].compute;
    Insights().rules[1].compute = () => { throw new Error('boom'); };
    try {
      const cards = Insights().compute(Store().getState());
      expect(cards.some(c => c.stringId === 'accountConcentration')).toBe(true);
      const html = Insights().renderSection(Store().getState());
      expect(html).toContain('insights-section');
    } finally {
      Insights().rules[1].compute = original;
    }
  });

  it('escapes user-controlled names in the rendered sentences', () => {
    addAccount('<img src=x onerror=alert(1)>', 900);
    addAccount('B', 100);
    const html = Insights().renderSection(Store().getState());
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('renders the section markup with icon, colored value and sentence', () => {
    addAccount('Main', 0);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 500, date: thisMonth(1) });
    addTx({ categoryId: 'cat_rent', amount: 100, date: thisMonth(2) });

    const html = Insights().renderSection(Store().getState());
    expect(html).toContain('id="insights-section"');
    expect(html).toContain('Smart insights');
    expect(html).toContain('data-lucide="sparkles"');
    expect(html).toContain('insight-card');
    expect(html).toContain('text-expense'); // spending value color-coded
    expect(html).toContain('Rent');
  });
});
