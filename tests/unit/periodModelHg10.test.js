// 1.2.2 (HG-10 P1, docs/period-picker-plan.md §0): the period model behind the
// new period picker, with no visible change yet.
// - Month and year periods are anchored on their first day (BUG-64): on the
//   29th-31st ‹ stalled (31 Oct − 1 month = 1 Oct), › skipped February, and
//   "vs last month" compared a month with itself.
// - Store.stepPeriod: a new object; a custom range steps by its length, whole
//   months by whole months.
// - The sort is a preference: the ?account= replace keeps the saved one.
// - A selection keeps only rows History lists.
// - Store.periodLabel (absolute names) and Store.currentPeriodLike (the
//   "back to now" target).
import { describe, it, expect, afterEach, vi } from 'vitest';
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
const boot = (iso) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
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
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js'].forEach(executeFile);
  global.window.Router = { navigate: vi.fn() };
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', 'EUR');
  return global.window.Store;
};

afterEach(() => { vi.useRealTimers(); });

const period = (S, page = 'history') => S.getState()[page === 'history' ? 'historyFilters' : 'analyticsFilters'].period;

describe('month and year anchors (BUG-64)', () => {
  it('a month set on the 31st is anchored on the 1st, so ‹ reaches September in one tap', () => {
    const S = boot('2026-10-31T12:00:00');
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'month', value: '2026-10-31', start: '', end: '' } } });
    expect(period(S).value).toBe('2026-10-01');
    S.dispatch('NAVIGATE_PERIOD', { offset: -1, page: 'history' });
    expect(period(S)).toMatchObject({ type: 'month', value: '2026-09-01' });
  });

  it('› from 31 January lands on February, not March', () => {
    const S = boot('2027-01-31T12:00:00');
    S.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { period: { type: 'month', value: '2027-01-31', start: '', end: '' } } });
    S.dispatch('NAVIGATE_PERIOD', { offset: 1, page: 'analytics' });
    expect(period(S, 'analytics').value).toBe('2027-02-01');
  });

  it('even a period that slipped in unanchored steps from its 1st', () => {
    const S = boot('2026-12-31T12:00:00');
    S.getState().historyFilters.period = { type: 'month', value: '2026-12-31', start: '', end: '' };
    S.dispatch('NAVIGATE_PERIOD', { offset: -1, page: 'history' });
    expect(period(S).value).toBe('2026-11-01');
  });

  it('a year is anchored on 1 January; the clear and the ?account= replace anchor too', () => {
    const S = boot('2026-10-31T12:00:00');
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'year', value: '2026-10-31', start: '', end: '' } } });
    expect(period(S).value).toBe('2026-01-01');
    S.dispatch('CLEAR_ALL_FILTERS', { page: 'history' });
    expect(period(S)).toMatchObject({ type: 'month', value: '2026-10-01' });
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: [] }, replace: true });
    expect(period(S).value).toBe('2026-10-01');
  });

  it('"vs last month" compares with the month before, from any anchor', () => {
    const S = boot('2026-10-31T12:00:00');
    S.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { period: { type: 'month', value: '2026-10-31', start: '', end: '' } } });
    expect(S._getPreviousPeriod(period(S, 'analytics')).value).toBe('2026-09-01');
  });
});

describe('Store.stepPeriod', () => {
  it('returns a new object, so a stepped page is a new filters object', () => {
    const S = boot('2026-11-07T12:00:00');
    const before = S.getState().historyFilters;
    const p0 = before.period;
    S.dispatch('NAVIGATE_PERIOD', { offset: -1, page: 'history' });
    expect(S.getState().historyFilters).not.toBe(before);
    expect(period(S)).not.toBe(p0);
    expect(p0.value).toBe('2026-11-01'); // the old one untouched
  });

  it('a custom range steps by its own length, both ways', () => {
    const S = boot('2026-11-07T12:00:00');
    const r = { type: 'custom', value: '', start: '2026-10-09', end: '2026-10-23' };
    expect(S.stepPeriod(r, -1)).toMatchObject({ start: '2026-09-24', end: '2026-10-08' });
    expect(S.stepPeriod(r, 1)).toMatchObject({ start: '2026-10-24', end: '2026-11-07' });
    const one = { type: 'custom', value: '', start: '2026-11-07', end: '2026-11-07' };
    expect(S.stepPeriod(one, 1)).toMatchObject({ start: '2026-11-08', end: '2026-11-08' });
  });

  it('a range of whole months steps by whole months', () => {
    const S = boot('2026-11-07T12:00:00');
    const q = { type: 'custom', value: '', start: '2026-10-01', end: '2026-12-31' };
    expect(S.stepPeriod(q, 1)).toMatchObject({ start: '2027-01-01', end: '2027-03-31' });
    expect(S.stepPeriod(q, -1)).toMatchObject({ start: '2026-07-01', end: '2026-09-30' });
    const feb = { type: 'custom', value: '', start: '2027-02-01', end: '2027-02-28' };
    expect(S.stepPeriod(feb, 1)).toMatchObject({ start: '2027-03-01', end: '2027-03-31' });
  });

  it('a custom range on a page steps through NAVIGATE_PERIOD', () => {
    const S = boot('2026-11-07T12:00:00');
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'custom', value: '', start: '2026-10-09', end: '2026-10-23' } } });
    S.dispatch('NAVIGATE_PERIOD', { offset: 1, page: 'history' });
    expect(period(S)).toMatchObject({ type: 'custom', start: '2026-10-24', end: '2026-11-07' });
  });

  it('a year steps by a year; the legacy day and week by 1 and 7 days', () => {
    const S = boot('2026-11-07T12:00:00');
    expect(S.stepPeriod({ type: 'year', value: '2026-01-01' }, -1).value).toBe('2025-01-01');
    expect(S.stepPeriod({ type: 'week', value: '2026-11-04' }, 1).value).toBe('2026-11-11');
    expect(S.stepPeriod({ type: 'today', value: '2026-11-07' }, -1).value).toBe('2026-11-06');
  });
});

describe('the sort is a preference', () => {
  it('the ?account= replace keeps History\'s saved sort', () => {
    const S = boot('2026-11-07T12:00:00');
    S.dispatch('ADD_ACCOUNT', { id: 'acc_a', name: 'A', openingBalance: 0, openingDate: '2020-01-01' });
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { sortOrder: 'desc' } });
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: ['acc_a'] }, replace: true });
    expect(S.getState().historyFilters).toMatchObject({ sortOrder: 'desc', accounts: ['acc_a'], tags: [] });
  });
});

describe('a selection keeps only listed rows', () => {
  it('stepping away drops the rows History no longer lists', () => {
    const S = boot('2026-11-07T12:00:00');
    S.dispatch('ADD_ACCOUNT', { id: 'acc_a', name: 'A', openingBalance: 0, openingDate: '2020-01-01' });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 5, accountId: 'acc_a', categoryId: 'cat_groceries', date: '2026-11-03' });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 7, accountId: 'acc_a', categoryId: 'cat_groceries', date: '2026-10-20' });
    const nov = S.getState().transactions.find(t => t.date === '2026-11-03').id;
    S.dispatch('TOGGLE_SELECTION_MODE', { active: true });
    S.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: nov });
    expect(S.getState().selectedTransactionIds).toEqual([nov]);
    S.dispatch('NAVIGATE_PERIOD', { offset: -1, page: 'history' });
    expect(S.getState().selectedTransactionIds).toEqual([]);
    S.dispatch('NAVIGATE_PERIOD', { offset: 1, page: 'history' });
    S.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: nov });
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { types: ['expense'] } }); // still listed
    expect(S.getState().selectedTransactionIds).toEqual([nov]);
  });
});

describe('labels and the back-to-now target', () => {
  it('names a period absolutely', () => {
    const S = boot('2026-11-07T12:00:00');
    expect(S.periodLabel({ type: 'month', value: '2026-11-01' })).toBe('November 2026');
    expect(S.periodLabel({ type: 'year', value: '2026-01-01' })).toBe('2026');
    expect(S.periodLabel({ type: 'custom', start: '2026-10-09', end: '2026-10-23' })).toMatch(/^Oct 9\s?[–-]\s?23, 2026$/);
    expect(S.periodLabel({ type: 'custom', start: '2026-11-07', end: '2026-11-07' })).toBe('Nov 7, 2026');
    expect(S.periodLabel({ type: 'custom', start: '', end: '' })).toBe('Custom Range');
  });

  it('back to now: none on the current period; a year to this year; anything else to this month', () => {
    const S = boot('2026-11-07T12:00:00');
    expect(S.currentPeriodLike({ type: 'month', value: '2026-11-01' })).toBeNull();
    expect(S.currentPeriodLike({ type: 'month', value: '2026-10-01' })).toMatchObject({ type: 'month', value: '2026-11-01' });
    expect(S.currentPeriodLike({ type: 'year', value: '2025-01-01' })).toMatchObject({ type: 'year', value: '2026-01-01' });
    expect(S.currentPeriodLike({ type: 'custom', start: '2026-09-01', end: '2026-09-30' })).toMatchObject({ type: 'month', value: '2026-11-01' });
    expect(S.currentPeriodLike({ type: 'custom', start: '2026-11-01', end: '2026-11-30' })).toBeNull();
  });
});
