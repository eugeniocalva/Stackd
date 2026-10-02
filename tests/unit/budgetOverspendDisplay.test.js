// 1.0.1 (BUG-13) — Goals (BudgetView) list rows: a rollover deficit is signed
// and coloured like an expense, the usage label shows the REAL percentage
// (the bar alone stays capped at 100%), an over-budget row says "Over by €X",
// and float dust never produces a "-€0.00 rollover" or "Over by €0.00".
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

const boot = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    StackdHydrateIcons: vi.fn()
  };
  global.localStorage = global.window.localStorage;
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
  executeFile('views.js');
  Store().init();
  Store().state.currency = 'EUR';
  Store().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
  BudgetView().currentBudgetFilter = 'expense';
  BudgetView().editCategoryId = null;
};

const accId = () => Store().getState().accounts[0].id;

const budget = (categoryId, amount, extra = {}) =>
  Store().dispatch('SAVE_BUDGET', { categoryId, amount, startDate: '', endDate: null, isCumulative: false, ...extra });

const spend = (categoryId, amount, date) => {
  Store().state.transactions.push({
    id: `sp-${++uuid}`, accountId: accId(), categoryId,
    type: 'expense', amount, date, createdAt: '2026-01-01T00:00:00.000Z'
  });
  Store()._budgetSpendIdx = null; // pushed outside dispatch: drop the lazy index
};

/** The rendered list row for one category id. */
const rowFor = (html, catId) => {
  const start = html.indexOf(`data-id="${catId}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('budget-cat-row', start + 20);
  return html.slice(start, next === -1 ? undefined : next);
};

const render = (month) =>
  BudgetView().renderList({ ...Store().getState(), activeMonthFilter: month || null });

describe('BudgetView overspend & rollover display (1.0.1 BUG-13)', () => {
  beforeEach(boot);
  afterEach(() => { vi.useRealTimers(); });

  it('(a) signs a rollover deficit and paints it in the expense colour', () => {
    // Cumulative €10 from September, €15.99 spent in September → October
    // carries -€5.99 (the report's Entertainment case).
    budget('cat_entertainment', 10, { isCumulative: true, startDate: '2026-09' });
    spend('cat_entertainment', 15.99, '2026-09-12');
    spend('cat_entertainment', 15.99, '2026-10-03');
    const row = rowFor(render('2026-10'), 'cat_entertainment');
    expect(row).toContain('-€5.99 rollover');
    expect(row).toContain('background: var(--color-expense-bg); color: var(--color-expense-text);');
    expect(row).not.toMatch(/>€5\.99 rollover/);
    // €15.99 of €4.01 → the real usage, and how much over.
    expect(row).toContain('>399%</div>');
    expect(row).toContain('Over by €11.98');
    expect(row).toContain('width: 100%');
  });

  it('(b) keeps a surplus rollover neutral with a + sign', () => {
    budget('cat_entertainment', 10, { isCumulative: true, startDate: '2026-09' });
    const row = rowFor(render('2026-10'), 'cat_entertainment');
    expect(row).toContain('+€10.00 rollover');
    expect(row).toContain('background: var(--bg-surface-sunken); color: var(--text-secondary);');
    expect(row).not.toContain('Over by');
  });

  it('(c) shows the real overspend percentage while the bar stays capped', () => {
    budget('cat_transport', 40);
    spend('cat_transport', 78, '2026-09-08');
    const row = rowFor(render('2026-09'), 'cat_transport');
    expect(row).toContain('>195%</div>');
    expect(row).not.toContain('>100%</div>');
    expect(row).toContain('width: 100%');
    expect(row).toContain('Over by €38.00');
    expect(row).toContain('color: var(--color-expense-val)');
  });

  it('(d) says nothing about overspend under (or exactly at) the limit', () => {
    budget('cat_groceries', 300);
    budget('cat_transport', 40);
    spend('cat_groceries', 50, '2026-10-02');
    spend('cat_transport', 40, '2026-10-02');
    const html = render('2026-10');
    const groceries = rowFor(html, 'cat_groceries');
    expect(groceries).toContain('>17%</div>');
    expect(groceries).toContain('€50.00');
    expect(groceries).not.toContain('Over by');
    const transport = rowFor(html, 'cat_transport');
    expect(transport).toContain('>100%</div>');
    expect(transport).not.toContain('Over by');
  });

  it('(e) shows — instead of 0% when the effective limit is not positive', () => {
    // €10/month from August, €30 spent in August → September limit 10-20 = -10.
    budget('cat_entertainment', 10, { isCumulative: true, startDate: '2026-08' });
    spend('cat_entertainment', 30, '2026-08-10');
    spend('cat_entertainment', 5, '2026-09-10');
    const row = rowFor(render('2026-09'), 'cat_entertainment');
    expect(row).toContain('>—</div>');
    expect(row).not.toContain('>0%</div>');
    expect(row).toContain('Over by €15.00');
    expect(row).toContain('-€20.00 rollover');
    expect(row).toContain('width: 0%');
  });

  it('(f) ignores float dust in the carryover and the overspend', () => {
    budget('cat_groceries', 100);
    const real = Store().getBudgetForMonth.bind(Store());
    Store().getBudgetForMonth = (catId, ym) => (catId === 'cat_groceries'
      ? { allocated: 100, spent: 100.0000000000001, carryover: -1e-15, finalLimit: 100 }
      : real(catId, ym));
    const row = rowFor(render('2026-10'), 'cat_groceries');
    expect(row).not.toContain('rollover');
    expect(row).not.toContain('Over by');
    expect(row).toContain('>100%</div>');
  });

  it('localizes the over-by line and the percentage (Italian)', () => {
    executeFile('i18n/it.js');
    global.window.I18n.setLang('it');
    budget('cat_transport', 40);
    spend('cat_transport', 78.5, '2026-09-08');
    const row = rowFor(render('2026-09'), 'cat_transport');
    const pct = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 0 }).format(78.5 / 40);
    expect(row).toContain(`>${pct}</div>`);
    expect(row).toContain('Sforato di');
  });
});
