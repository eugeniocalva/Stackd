import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Data written by the PRE-v0.67 bugs must not crash or re-duplicate under the
// new engine, and the scope modal must offer a way to repair it.
describe('Recurrence engine vs legacy (pre-v0.67) poisoned data', () => {
  let Store;
  let accountId;

  const seriesMembers = (sid) =>
    Store.getState().transactions.filter(t => t.recurrence && t.recurrence.seriesId === sid);

  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      }
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
    Store.dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 0 });
    accountId = Store.getState().accounts[0].id;
  });

  const craftTx = (date, sid, extraRec = {}, extra = {}) => ({
    id: global.window.crypto.randomUUID(),
    type: 'expense',
    amount: 100,
    accountId,
    categoryId: 'cat_groceries',
    date,
    comment: 'Poisoned',
    tags: [],
    createdAt: new Date().toISOString(),
    recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2026-12-15', ...extraRec },
    ...extra
  });

  it('a duplicate double-chain (one seriesId, two day tracks, two armed tails) stays stable', () => {
    const sid = 'legacy-series';
    const txs = Store.getState().transactions;
    // 15th chain Aug-Dec + 13th chain Sep-Dec, both tails armed — exactly what
    // the old edit bug produced
    ['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15'].forEach(d => txs.push(craftTx(d, sid)));
    txs.push(craftTx('2026-12-15', sid, { nextDate: '2027-01-15' }));
    ['2026-09-13', '2026-10-13', '2026-11-13'].forEach(d => txs.push(craftTx(d, sid)));
    txs.push(craftTx('2026-12-13', sid, { nextDate: '2027-01-13' }));

    const before = seriesMembers(sid).length;
    expect(() => Store._processRecurringTransactions()).not.toThrow();
    // Tails point past endDate — nothing regenerates, nothing duplicates
    expect(seriesMembers(sid)).toHaveLength(before);
  });

  it('legacy transfer pair with BOTH legs armed generates single pairs, not exponential copies', () => {
    const sid = 'legacy-transfer';
    const txs = Store.getState().transactions;
    const ref = 'legacy-ref-1';
    // Post-reload legacy state: separate recurrence objects, both armed
    txs.push(craftTx('2026-08-15', sid, { nextDate: '2026-09-15' }, { transferRef: ref, type: 'expense' }));
    txs.push(craftTx('2026-08-15', sid, { nextDate: '2026-09-15' }, { transferRef: ref, type: 'income' }));

    expect(() => Store._processRecurringTransactions()).not.toThrow();

    const legs = seriesMembers(sid);
    const byDate = {};
    legs.forEach(t => { byDate[t.date] = (byDate[t.date] || 0) + 1; });
    // Every date must have exactly one pair (2 legs) — Aug through Dec
    expect(byDate).toEqual({
      '2026-08-15': 2,
      '2026-09-15': 2,
      '2026-10-15': 2,
      '2026-11-15': 2,
      '2026-12-15': 2
    });
    expect(legs.filter(t => t.recurrence.nextDate)).toHaveLength(1);
  });

  it('"this and future" on the earliest wrong member repairs a poisoned double-chain', () => {
    const sid = 'legacy-series-2';
    const txs = Store.getState().transactions;
    ['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15'].forEach(d => txs.push(craftTx(d, sid)));
    ['2026-09-13', '2026-10-13', '2026-11-13', '2026-12-13'].forEach(d => txs.push(craftTx(d, sid)));

    // Repair path: pick the EARLIEST wrong member (Sep 13), set the correct
    // date, choose "this and future" — everything from that point regenerates
    const sept13 = seriesMembers(sid).find(t => t.date === '2026-09-13');
    Store.dispatch('UPDATE_TRANSACTION', {
      id: sept13.id,
      type: 'expense',
      amount: 100,
      accountId,
      categoryId: 'cat_groceries',
      date: '2026-09-15',
      comment: 'Poisoned',
      recurrence: {
        seriesId: sid,
        interval: 1,
        frequency: 'months',
        endDate: '2026-12-15',
        nextDate: Store._calculateNextRecurrenceDate('2026-09-15', 1, 'months')
      },
      tags: [],
      updateFuture: true
    });

    const members = seriesMembers(sid);
    const dates = members.map(t => t.date).sort();
    // Single clean chain again: no 13th stragglers, no duplicates
    expect(dates).toEqual(['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15']);
    expect(members.filter(t => t.recurrence.nextDate)).toHaveLength(1);
  });

  it('series lacking startDate (all legacy series) still processes and edits cleanly', () => {
    const sid = 'legacy-series-3';
    const txs = Store.getState().transactions;
    txs.push(craftTx('2026-08-15', sid, { nextDate: '2026-09-15' }));

    expect(() => Store._processRecurringTransactions()).not.toThrow();
    const members = seriesMembers(sid);
    expect(members.map(t => t.date).sort()).toEqual(
      ['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15']
    );
  });
});
