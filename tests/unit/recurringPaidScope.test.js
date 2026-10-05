import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-27, D5 / D-U3-1a): paid state is per payment. A 'This and
// future' / 'All' edit never spreads isPaid to the other members of a series:
// only the edited payment (both legs of a tapped transfer pair) takes a flip.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Recurring paid state is per payment (1.0.2 BUG-27)', () => {
  let Store;
  let bank;
  let savings;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0)); // 2026-11-15 noon
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 11) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
    Store.dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 3000, openingDate: '2026-01-01' });
    Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
    bank = Store.getState().accounts.find(a => a.name === 'Bank').id;
    savings = Store.getState().accounts.find(a => a.name === 'Savings').id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const members = (sid) => Store.getState().transactions
    .filter(t => t.recurrence && t.recurrence.seriesId === sid)
    .sort((a, b) => a.date.localeCompare(b.date));
  const rent = () => {
    Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 900, accountId: bank, categoryId: 'cat_rent', date: '2026-11-01', comment: 'Rent',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-10-01' }
    });
    const sid = Store.getState().transactions.find(t => t.comment === 'Rent').recurrence.seriesId;
    expect(members(sid)).toHaveLength(12);
    return sid;
  };
  const at = (sid, date) => members(sid).find(t => t.date === date);

  it("an amount edit with 'All' on an unpaid December leaves every other payment paid", () => {
    const sid = rent();
    const dec = at(sid, '2026-12-01');
    Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: dec.id });
    Store.dispatch('UPDATE_TRANSACTION', { id: dec.id, amount: 950, isPaid: false, updateAll: true });
    const m = members(sid);
    expect(at(sid, '2026-12-01').isPaid).toBe(false);
    m.filter(t => t.date !== '2026-12-01').forEach(t => expect('isPaid' in t).toBe(false));
    m.forEach(t => expect(t.amount).toBe(950));
    // November (paid, at the new amount) is the only row up to today
    expect(Store.getAccountBalance(bank)).toBe(3000 - 950);
  });

  it("the same with 'This and future': January to October stay paid and count", () => {
    const sid = rent();
    const dec = at(sid, '2026-12-01');
    Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: dec.id });
    Store.dispatch('UPDATE_TRANSACTION', { id: dec.id, amount: 950, isPaid: false, updateFuture: true });
    expect(at(sid, '2026-12-01').isPaid).toBe(false);
    members(sid).filter(t => t.date >= '2027-01-01').forEach(t => {
      expect(t.isPaid).toBeUndefined();
      expect(t.amount).toBe(950);
    });
    const jan = Store.getFilteredTransactions('analytics', {
      period: { type: 'custom', start: '2027-01-01', end: '2027-01-31' },
      types: [], accounts: [], categories: [], tags: [], sortOrder: 'desc'
    });
    expect(jan.filter(t => t.comment === 'Rent').map(t => t.amount)).toEqual([950]);
  });

  it("a Paid tick with 'This and future' never clears a later unpaid mark", () => {
    const sid = rent();
    const feb = at(sid, '2027-02-01');
    const apr = at(sid, '2027-04-01');
    Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: feb.id });
    Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: apr.id });
    Store.dispatch('UPDATE_TRANSACTION', { id: feb.id, isPaid: true, updateFuture: true });
    expect(at(sid, '2027-02-01').isPaid).not.toBe(false);
    expect(at(sid, '2027-04-01').isPaid).toBe(false);
  });

  it('a recurring transfer: only the tapped pair takes the unpaid flip', () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 200, expenseAccountId: bank, incomeAccountId: savings, date: '2026-11-25', note: 'Auto-save',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-10-25' }, tags: []
    });
    const sid = Store.getState().transactions.find(t => t.comment === 'Auto-save').recurrence.seriesId;
    expect(members(sid)).toHaveLength(24);
    const decExp = members(sid).find(t => t.date === '2026-12-25' && t.type === 'expense');
    Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: decExp.id });
    Store.dispatch('UPDATE_TRANSFER', {
      transferRef: decExp.transferRef, amount: 250, expenseAccountId: bank, incomeAccountId: savings,
      date: decExp.date, note: 'Auto-save', tags: [], isPaid: false, updateFuture: true
    });
    const unpaid = members(sid).filter(t => t.isPaid === false);
    expect(unpaid).toHaveLength(2);
    unpaid.forEach(t => expect(t.transferRef).toBe(decExp.transferRef));
    members(sid).filter(t => t.date >= '2026-12-25').forEach(t => expect(t.amount).toBe(250));
  });

  it("a flip with 'All' still mirrors on both legs of the tapped pair, and only that pair", () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 200, expenseAccountId: bank, incomeAccountId: savings, date: '2026-11-25', note: 'Auto-save',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-10-25' }, tags: []
    });
    const sid = Store.getState().transactions.find(t => t.comment === 'Auto-save').recurrence.seriesId;
    const jan = members(sid).find(t => t.date === '2027-01-25' && t.type === 'income');
    Store.dispatch('UPDATE_TRANSFER', { transferRef: jan.transferRef, isPaid: false, updateAll: true });
    const pair = members(sid).filter(t => t.transferRef === jan.transferRef);
    expect(pair).toHaveLength(2);
    pair.forEach(t => expect(t.isPaid).toBe(false));
    expect(members(sid).filter(t => t.isPaid === false)).toHaveLength(2);
  });
});
