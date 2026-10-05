import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-36): exclude, never convert — for an EXPLICIT account selection
// too. v1.02 applied the base-currency guard only to an empty list, so an
// explicit Main (EUR) + US Checking (USD) selection summed € and $ 1:1 into a
// € total. Store.aggregateSelection resolves a selection (base wins; no base →
// the largest same-currency group; one currency → as given) and
// aggregatePredicate is what every aggregate filters with.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Mixed-currency selections (1.0.2 BUG-36)', () => {
  let Store;
  let main, us;

  const id = (n) => Store.getState().accounts.find(a => a.name === n).id;
  const monthFilters = (accounts) => ({
    period: { type: 'month', value: '2026-10-04', start: '', end: '' },
    types: [], accounts, categories: [], sortOrder: 'desc'
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    let uid = 0;
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + (++uid) },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    Store = global.window.Store;
    Store.init();
    Store.dispatch('SET_CURRENCY', 'EUR');
    Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2026-09-01' });
    Store.dispatch('ADD_ACCOUNT', { name: 'US Checking', openingBalance: 1000, openingDate: '2026-09-01', currency: 'USD' });
    main = id('Main'); us = id('US Checking');
    Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 50, accountId: main, categoryId: 'cat_groceries', date: '2026-10-02' });
    Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: us, categoryId: 'cat_groceries', date: '2026-10-02' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregateSelection resolves a selection', () => {
    expect(Store.aggregateSelection([])).toEqual({ ids: [], currency: 'EUR', excluded: 1 });
    expect(Store.aggregateSelection([us])).toEqual({ ids: [us], currency: 'USD', excluded: 0 });
    expect(Store.aggregateSelection([main, us])).toEqual({ ids: [main], currency: 'EUR', excluded: 1 });
    expect(Store.aggregateSelection([main, us, 'gone']).excluded).toBe(1);
    expect(Store.aggregateSelection(null)).toEqual({ ids: [], currency: 'EUR', excluded: 1 });

    // no base account in the selection: the largest same-currency group
    Store.dispatch('ADD_ACCOUNT', { name: 'UK Savings', openingBalance: 500, openingDate: '2026-09-01', currency: 'GBP' });
    Store.dispatch('ADD_ACCOUNT', { name: 'US Brokerage', openingBalance: 300, openingDate: '2026-09-01', currency: 'USD' });
    const gbp = id('UK Savings');
    const us2 = id('US Brokerage');
    const big = Store.aggregateSelection([us, us2, gbp]);
    expect(big.currency).toBe('USD');
    expect(big.excluded).toBe(1);
    expect([...big.ids].sort()).toEqual([us, us2].sort());

    // a tie goes to the first of the tied accounts in account order
    const order = Store.getState().accounts.map(a => a.id);
    const first = order.indexOf(us) < order.indexOf(gbp) ? 'USD' : 'GBP';
    const tie = Store.aggregateSelection([us, gbp]);
    expect(tie.currency).toBe(first);
    expect(tie.excluded).toBe(1);
    expect(Store.aggregateSelection([gbp, us]).currency).toBe(first);
  });

  it('aggregatePredicate: [] = base accounts, a single id = that id, a mixed list = the resolved ids', () => {
    const none = Store.aggregatePredicate([]);
    expect(none(main)).toBe(true);
    expect(none(us)).toBe(false);
    expect(none('unknown')).toBe(true); // unknown ids count as base (v1.02)
    const one = Store.aggregatePredicate([us]);
    expect(one(us)).toBe(true);
    expect(one(main)).toBe(false);
    const mixed = Store.aggregatePredicate([main, us]);
    expect(mixed(main)).toBe(true);
    expect(mixed(us)).toBe(false);
  });

  it('isPrimarySelection', () => {
    expect(Store.isPrimarySelection([main])).toBe(true);
    expect(Store.isPrimarySelection([main, us])).toBe(false);
    expect(Store.isPrimarySelection([us])).toBe(false);
    expect(Store.isPrimarySelection([])).toBe(false);
    expect(Store.isPrimarySelection(undefined)).toBe(false);
    // no base-currency account at all
    Store.dispatch('SET_CURRENCY', 'JPY');
    expect(Store.primaryAccountIds()).toEqual([]);
    expect(Store.isPrimarySelection([])).toBe(false);
  });

  it('an explicit mixed list sums only the base-currency accounts', () => {
    expect(Store.getBalanceAtDate('2026-10-31', [main, us])).toBe(1950);
    expect(Store.getBalanceAtDate('2026-10-31', [main])).toBe(1950);
  });

  it('computeBalanceForecast([main, us]) equals computeBalanceForecast([main])', () => {
    const mixed = Store.computeBalanceForecast([main, us]);
    const base = Store.computeBalanceForecast([main]);
    expect(mixed).toEqual(base);
    expect(mixed.todayAbsDiff).toBe(-50);
    expect(mixed.eomAbsDiff).toBe(-50);
  });

  it('computeUpcomingImpact excludes the foreign account from a mixed selection', () => {
    Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 10, accountId: main, categoryId: 'cat_dining', date: '2026-10-20' });
    Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 15, accountId: us, categoryId: 'cat_dining', date: '2026-10-20' });
    expect(Store.computeUpcomingImpact('2026-10-31', [main, us])).toEqual({ count: 1, net: -10 });
    expect(Store.computeUpcomingImpact('2026-10-31', [us])).toEqual({ count: 1, net: -15 });
  });

  it('computeNetFlowData with [main, us] counts only € rows', () => {
    const buckets = Store.computeNetFlowData(monthFilters([main, us]));
    const oct = buckets[buckets.length - 1];
    expect(oct.expense).toBe(50);
    const usOnly = Store.computeNetFlowData(monthFilters([us]));
    expect(usOnly[usOnly.length - 1].expense).toBe(40);
  });

  it('Analytics summary and distribution exclude the foreign account from a mixed selection', () => {
    const f = monthFilters([main, us]);
    expect(Store.computeAnalyticalSummary(f).expense).toBe(50);
    const dist = Store.computeCategoryDistribution(f, 'expense');
    expect(dist).toHaveLength(1);
    expect(dist[0].id).toBe('cat_groceries');
    expect(dist[0].amount).toBe(50);
    expect(Store.getFilteredTransactions('analytics', f)).toHaveLength(1);
  });

  it('pins: History stays a ledger; per-account figures are untouched', () => {
    const rows = Store.getFilteredTransactions('history', monthFilters([main, us]));
    expect(rows.filter(t => t.type === 'expense')).toHaveLength(2);
    expect(Store.getAccountBalance(us)).toBe(960);
    expect(Store.getBalanceAtDate('2026-10-31', [us])).toBe(960);
    expect(Store.getAccountBalance(main)).toBe(1950);
    expect(Store.getGlobalBalance()).toBe(1950);
  });

  it('pin: an all-base selection is unchanged', () => {
    Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 300, openingDate: '2026-09-01' });
    const savings = id('Savings');
    expect(Store.aggregateSelection([main, savings])).toEqual({ ids: [main, savings], currency: 'EUR', excluded: 0 });
    expect(Store.getBalanceAtDate('2026-10-31', [main, savings])).toBe(2250);
  });
});
