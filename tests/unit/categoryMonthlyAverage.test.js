import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context (store.test.js pattern)
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// v0.95 (refactor-plan-2 P3.2): Store.getCategoryMonthlyAverage feeds the
// budget form's insight line — trailing 6 whole months, current month
// excluded, averaged over the months that actually had spend.
describe('Store.getCategoryMonthlyAverage (v0.95 P3)', () => {
  const pad = (n) => String(n).padStart(2, '0');
  // Day `d` of the month `offset` months before the current one (offset 1 = last month).
  const monthDay = (offset, d) => {
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(d)}`;
  };

  let S;
  beforeEach(() => {
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
      localStorage: (() => {
        const bag = {};
        return {
          getItem: k => (k in bag ? bag[k] : null),
          setItem: (k, v) => { bag[k] = String(v); },
          removeItem: k => { delete bag[k]; },
        };
      })(),
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    S = global.window.Store;
    S.init();
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0, openingDate: '2020-01-01' });
  });

  const acc = () => S.getState().accounts[0].id;
  const add = (over) => S.dispatch('ADD_TRANSACTION', {
    accountId: acc(), categoryId: 'cat_groceries', type: 'expense', amount: 100,
    date: monthDay(1, 5), tags: [], ...over
  });

  it('averages over the months that actually had spend', () => {
    add({ amount: 100, date: monthDay(1, 5) });
    add({ amount: 50,  date: monthDay(1, 20) });  // same month: 150 total
    add({ amount: 250, date: monthDay(3, 10) });  // second active month
    // months 2, 4, 5, 6 have no spend and must not dilute the average
    const out = S.getCategoryMonthlyAverage('cat_groceries', 6);
    expect(out).toEqual({ average: 200, months: 2 }); // (150 + 250) / 2
  });

  it('ignores the current (partial) month and anything older than the window', () => {
    add({ amount: 999, date: monthDay(0, 1) });   // current month — excluded
    add({ amount: 777, date: monthDay(7, 1) });   // outside the 6-month window
    add({ amount: 120, date: monthDay(2, 8) });
    const out = S.getCategoryMonthlyAverage('cat_groceries', 6);
    expect(out).toEqual({ average: 120, months: 1 });
  });

  it('excludes income, unpaid rows, transfer legs and other categories', () => {
    add({ amount: 300, date: monthDay(1, 5) });                              // counts
    add({ type: 'income', categoryId: 'cat_groceries', amount: 40, date: monthDay(1, 6) });
    add({ amount: 60, isPaid: false, date: monthDay(1, 7) });                // unpaid
    add({ amount: 70, transferRef: 'tr_x', date: monthDay(1, 8) });          // transfer leg
    add({ categoryId: 'cat_dining', amount: 80, date: monthDay(1, 9) });     // other category
    const out = S.getCategoryMonthlyAverage('cat_groceries', 6);
    expect(out).toEqual({ average: 300, months: 1 });
  });

  it('excludes pre-opening-date rows', () => {
    // Fresh account whose opening date is INSIDE the window; earlier spend
    // on that account must not count.
    S.dispatch('ADD_ACCOUNT', { name: 'New', openingBalance: 10, openingDate: monthDay(2, 15) });
    const newId = S.getState().accounts.find(a => a.name === 'New').id;
    S.dispatch('ADD_TRANSACTION', { accountId: newId, categoryId: 'cat_transport', type: 'expense', amount: 500, date: monthDay(4, 5), tags: [] });
    S.dispatch('ADD_TRANSACTION', { accountId: newId, categoryId: 'cat_transport', type: 'expense', amount: 90, date: monthDay(1, 5), tags: [] });
    const out = S.getCategoryMonthlyAverage('cat_transport', 6);
    expect(out).toEqual({ average: 90, months: 1 });
  });

  it('returns null when there is nothing meaningful to show', () => {
    expect(S.getCategoryMonthlyAverage('cat_groceries', 6)).toBe(null); // no history
    expect(S.getCategoryMonthlyAverage('cat_balance', 6)).toBe(null);   // adjustment pseudo-cat
    expect(S.getCategoryMonthlyAverage('', 6)).toBe(null);
    expect(S.getCategoryMonthlyAverage(null, 6)).toBe(null);
  });

  it('falls back to this month so far when ALL data lives in the current month (v0.96)', () => {
    // Day 1 is always <= today, so this stays date-independent.
    add({ amount: 10, date: monthDay(0, 1) });
    add({ amount: 15, date: monthDay(0, 1) });
    expect(S.getCategoryMonthlyAverage('cat_groceries', 6))
      .toEqual({ average: 25, months: 0, currentMonth: true });

    // As soon as a prior month has spend, the real average wins again.
    add({ amount: 40, date: monthDay(2, 5) });
    expect(S.getCategoryMonthlyAverage('cat_groceries', 6))
      .toEqual({ average: 40, months: 1 });
  });

  it('renders through the i18n keys without leaving placeholders', () => {
    const I18n = global.window.I18n;
    const one = I18n.t('budget.avgSpendHint', { amount: '€90.00', count: 1 });
    const other = I18n.t('budget.avgSpendHint', { amount: '€90.00', count: 4 });
    const thisMonth = I18n.t('budget.avgSpendHintThisMonth', { amount: '€90.00' });
    expect(one).toContain('€90.00');
    expect(one).not.toContain('{');
    expect(other).toContain('€90.00');
    expect(other).toContain('4');
    expect(other).not.toContain('{');
    expect(thisMonth).toContain('€90.00');
    expect(thisMonth).not.toContain('{');
  });
});
