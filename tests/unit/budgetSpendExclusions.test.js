// 1.0.2 (BUG-55) — budget spend follows the same row rules as every other
// aggregate. Store._categoryMonthSpend (the single source of a budget's
// `spent` and of every past month's cumulative remainder) used to count
// unpaid rows, transfer legs and rows dated before their account opened, so
// Goals and the Home budgets widget showed €65 against €40 everywhere else.
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

let uuid = 0;
const Store = () => global.window.Store;
const BudgetView = () => global.window.Views.BudgetView;
const W = () => global.window.Widgets;

const boot = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); // 2026-10-15 12:00 local
  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    StackdHydrateIcons: vi.fn()
  };
  global.localStorage = global.window.localStorage;
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]'); // no seeded 'latest' widget
  global.document = {
    getElementById: vi.fn(() => null),
    body: { appendChild: vi.fn(), querySelector: vi.fn() },
    createElement: () => ({
      className: '', id: '', innerHTML: '', style: {},
      classList: { add: vi.fn(), remove: vi.fn() },
      querySelector: vi.fn(), querySelectorAll: vi.fn(() => []),
      appendChild: vi.fn(), remove: vi.fn()
    })
  };

  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  executeFile('views.js');
  Store().init();
  // BEFORE ADD_ACCOUNT: an account in another currency is excluded from budgets.
  Store().dispatch('SET_CURRENCY', 'EUR');
  Store().dispatch('ADD_ACCOUNT', { name: 'Main Checking', openingBalance: 1000, openingDate: '2026-09-01' });
  BudgetView().currentBudgetFilter = 'expense';
  BudgetView().editCategoryId = null;

  const acc = mainId();
  Store().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: acc, categoryId: 'cat_groceries', date: '2026-10-02' });
  Store().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 25, accountId: acc, categoryId: 'cat_groceries', date: '2026-10-03', isPaid: false });
  Store().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 30, accountId: acc, categoryId: 'cat_groceries', date: '2026-08-20' });
  Store().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 100, startDate: '', endDate: null, isCumulative: false });
};

const mainId = () => Store().getState().accounts.find(a => a.name === 'Main Checking').id;
const unpaidRow = () => Store().getState().transactions.find(t => t.amount === 25);
const spent = (ym) => Store().getBudgetForMonth('cat_groceries', ym).spent;

/** The rendered Goals list row for one category id. */
const rowFor = (html, catId) => {
  const start = html.indexOf(`data-id="${catId}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('budget-cat-row', start + 20);
  return html.slice(start, next === -1 ? undefined : next);
};

describe('Budget spend exclusions (1.0.2 BUG-55)', () => {
  beforeEach(boot);
  afterEach(() => { vi.useRealTimers(); });

  it('(a) unpaid rows are not spend', () => {
    expect(spent('2026-10')).toBe(40);
  });

  it('(b) rows dated before the account opened are not spend', () => {
    expect(spent('2026-08')).toBe(0);
  });

  it('(c) the cumulative rollover uses the same figures', () => {
    Store().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 100, isCumulative: true, startDate: '2026-08' });
    const oct = Store().getBudgetForMonth('cat_groceries', '2026-10');
    expect(oct.spent).toBe(40);
    expect(oct.carryover).toBe(200);  // Aug (pre-opening) 100 + Sep 100
    expect(oct.finalLimit).toBe(300);
    expect(Store().getBudgetForMonth('cat_groceries', '2026-09').carryover).toBe(100);
  });

  it('(d) the index follows dispatch (paid toggle, opening-date edit)', () => {
    expect(spent('2026-10')).toBe(40);
    Store().dispatch('TOGGLE_TRANSACTION_PAID', { id: unpaidRow().id });
    expect(spent('2026-10')).toBe(65);
    Store().dispatch('TOGGLE_TRANSACTION_PAID', { id: unpaidRow().id });
    expect(spent('2026-10')).toBe(40);
    expect(spent('2026-08')).toBe(0);
    Store().dispatch('UPDATE_ACCOUNT', { id: mainId(), openingDate: '2026-08-01' });
    expect(spent('2026-08')).toBe(30);
  });

  it('(e) the opening-date rule is per account', () => {
    Store().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, openingDate: '2026-07-01' });
    const cash = Store().getState().accounts.find(a => a.name === 'Cash').id;
    Store().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12, accountId: cash, categoryId: 'cat_groceries', date: '2026-08-05' });
    expect(spent('2026-08')).toBe(12);
  });

  it('(f) Goals: the row, its percentage and Total Spent read €40.00', () => {
    const html = BudgetView().renderList({ ...Store().getState(), activeMonthFilter: '2026-10' });
    const row = rowFor(html, 'cat_groceries');
    expect(row).toContain('€40.00');
    expect(row).toMatch(/class="budget-used-pct"[^>]*>40%</);
    const total = html.slice(html.indexOf(window.I18n.t('budget.totalSpent')));
    expect(total).toMatch(/<strong>€40\.00<\/strong>/);
    expect(html).not.toContain('€65.00');
  });

  it('(g) Home budgets widget reads €40.00 of €100.00', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'budgets', size: 'large' });
    const list = Store().getState().homeWidgets;
    const instance = list[list.length - 1];
    const html = W().registry.budgets.render(instance, Store().getState());
    expect(html).toContain('€40.00');
    expect(html).toContain('of €100.00 budgeted');
    expect(html).toContain('40%');
    expect(html).not.toContain('€65.00');
  });

  it('(h) agrees with the budget editor hint (getCategoryMonthlyAverage)', () => {
    const avg = Store().getCategoryMonthlyAverage('cat_groceries', 6);
    expect(avg).toMatchObject({ currentMonth: true, average: 40 });
    expect(avg.average).toBe(spent('2026-10'));
  });

  it('(h2) the editor hint also leaves out other-currency accounts (v1.02)', () => {
    Store().dispatch('ADD_ACCOUNT', { name: 'US', openingBalance: 0, openingDate: '2026-01-01', currency: 'USD' });
    const us = Store().getState().accounts.find(a => a.name === 'US').id;
    expect(Store()._isPrimaryAccount(us)).toBe(false);
    // Month-to-date fallback ("So far this month you spent …").
    Store().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 50, accountId: us, categoryId: 'cat_groceries', date: '2026-10-03' });
    expect(spent('2026-10')).toBe(40);
    expect(Store().getCategoryMonthlyAverage('cat_groceries', 6)).toMatchObject({ currentMonth: true, average: 40 });
    // Trailing-average path (whole past months).
    Store().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 20, accountId: mainId(), categoryId: 'cat_groceries', date: '2026-09-10' });
    Store().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 70, accountId: us, categoryId: 'cat_groceries', date: '2026-09-12' });
    Store().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 90, accountId: us, categoryId: 'cat_groceries', date: '2026-07-12' });
    expect(spent('2026-09')).toBe(20);
    const avg = Store().getCategoryMonthlyAverage('cat_groceries', 6);
    expect(avg).toEqual({ average: 20, months: 1 });
    expect(avg.average).toBe(spent('2026-09'));
  });

  it('(i) transfer legs are not spend, even with a category (CSV restore)', () => {
    Store().state.transactions.push({
      id: 'leg-1', type: 'expense', amount: 15, date: '2026-10-05', accountId: mainId(),
      categoryId: 'cat_groceries', transferRef: 'r1', createdAt: '2026-10-05T10:00:00.000Z'
    });
    Store()._budgetSpendIdx = null; // pushed outside dispatch: drop the lazy index
    expect(spent('2026-10')).toBe(40);
  });
});
