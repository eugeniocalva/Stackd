import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// v0.67: type conversions on members of a recurrent series must never corrupt
// the rest of the series — in particular the counterpart legs of transfer pairs.
describe('Recurring series type conversions', () => {
  let Store;
  let bankId;
  let savingsId;

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
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
    Store.dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 0 });
    Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
    bankId = Store.getState().accounts.find(a => a.name === 'Bank').id;
    savingsId = Store.getState().accounts.find(a => a.name === 'Savings').id;
  });

  const makeRecurringTransfer = () => {
    // Exactly what the views.js new-transfer path dispatches
    Store.dispatch('ADD_TRANSFER', {
      amount: 200,
      expenseAccountId: bankId,
      incomeAccountId: savingsId,
      date: '2026-08-10',
      time: undefined,
      note: 'Monthly savings',
      recurrence: {
        seriesId: global.window.StackdDB.generateId(),
        interval: 1,
        frequency: 'months',
        endDate: '2026-12-10',
        nextDate: Store._calculateNextRecurrenceDate('2026-08-10', 1, 'months')
      },
      tags: []
    });
    const legs = Store.getState().transactions.filter(t => t.comment === 'Monthly savings' && t.date === '2026-08-10');
    const expenseLeg = legs.find(t => t.type === 'expense');
    return { expenseLeg, seriesId: expenseLeg.recurrence.seriesId };
  };

  // Replicates the views.js save handler when the user opens a transfer leg,
  // switches the type toggle away from "Transfer" and saves: type !== 'transfer'
  // -> else-if (isEditSave) branch -> UPDATE_TRANSACTION with convertFromTransfer.
  const convert = (leg, overrides = {}) => {
    Store.dispatch('UPDATE_TRANSACTION', {
      id: leg.id,
      type: 'expense',
      convertFromTransfer: true,
      amount: 200,
      accountId: bankId,
      categoryId: 'cat_groceries',
      date: leg.date,                // unchanged
      time: undefined,
      comment: 'Monthly savings',
      recurrence: leg.recurrence ? {  // form rebuilds it, same schedule
        seriesId: leg.recurrence.seriesId,
        interval: 1,
        frequency: 'months',
        endDate: '2026-12-10',
        nextDate: Store._calculateNextRecurrenceDate(leg.date, 1, 'months')
      } : null,
      tags: [],
      updateFuture: false,
      updateAll: false,
      ...overrides
    });
  };

  const seriesMembers = (seriesId) =>
    Store.getState().transactions.filter(t => t.recurrence && t.recurrence.seriesId === seriesId);

  // v0.69: converting a transfer leg deletes the counterpart and unlinks the
  // kept leg. Before, the other account kept a phantom leg forever.
  it('one-off transfer converted to an expense deletes the counterpart leg', () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 200,
      expenseAccountId: bankId,
      incomeAccountId: savingsId,
      date: '2026-08-10',
      note: 'Rainy day',
      tags: []
    });
    const expenseLeg = Store.getState().transactions.find(t => t.comment === 'Rainy day' && t.type === 'expense');

    convert(expenseLeg, { comment: 'Rainy day' });

    const legs = Store.getState().transactions.filter(t => t.comment === 'Rainy day');
    expect(legs).toHaveLength(1);
    expect(legs[0].type).toBe('expense');
    expect(legs[0].accountId).toBe(bankId);
    expect(legs[0].transferRef).toBeFalsy();
    // The phantom leg no longer skews the other account
    expect(Store.getBalanceAtDate('2026-12-31', [savingsId])).toBe(0);
    expect(Store.getBalanceAtDate('2026-12-31', [bankId])).toBe(-200);
  });

  it('the leg the user tapped is the one kept, even converting the income side', () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 200,
      expenseAccountId: bankId,
      incomeAccountId: savingsId,
      date: '2026-08-10',
      note: 'Rainy day',
      tags: []
    });
    const incomeLeg = Store.getState().transactions.find(t => t.comment === 'Rainy day' && t.type === 'income');

    // Tapped the income (Savings) side and saved it as Income. The form shows
    // the "From" account, so that account is what the payload carries.
    convert(incomeLeg, { type: 'income', comment: 'Rainy day' });

    const legs = Store.getState().transactions.filter(t => t.comment === 'Rainy day');
    expect(legs).toHaveLength(1);
    expect(legs[0].id).toBe(incomeLeg.id);
    expect(legs[0].type).toBe('income');
    expect(legs[0].transferRef).toBeFalsy();
    expect(Store.getBalanceAtDate('2026-12-31', [bankId])).toBe(200);
    expect(Store.getBalanceAtDate('2026-12-31', [savingsId])).toBe(0);
  });

  it('transfer leg converted to expense with future scope converts this and later pairs', () => {
    const { expenseLeg, seriesId } = makeRecurringTransfer();

    const before = seriesMembers(seriesId);
    // sanity: Aug..Dec = 5 pairs = 10 legs
    expect(before).toHaveLength(10);
    expect(before.filter(t => t.type === 'income')).toHaveLength(5);

    convert(expenseLeg, { updateFuture: true });

    const after = seriesMembers(seriesId);
    // Every occurrence is Aug or later, so the whole series collapses to
    // 5 single expenses — no orphaned income legs left on Savings.
    expect(after).toHaveLength(5);
    expect(after.filter(t => t.type === 'income')).toHaveLength(0);
    expect(after.every(t => !t.transferRef)).toBe(true);
    expect(after.every(t => t.accountId === bankId && t.categoryId === 'cat_groceries')).toBe(true);
    expect(Store.getBalanceAtDate('2026-12-31', [savingsId])).toBe(0);
    // Still exactly one armed generator
    expect(after.filter(t => t.recurrence.nextDate)).toHaveLength(1);
  });

  it('same conversion with scope only-this leaves the rest of the series as transfers', () => {
    const { expenseLeg, seriesId } = makeRecurringTransfer();

    convert(expenseLeg);

    const after = seriesMembers(seriesId);
    // Only the tapped occurrence lost its counterpart: 4 intact pairs + 1 expense
    expect(after).toHaveLength(9);
    expect(after.filter(t => t.type === 'income')).toHaveLength(4);
    expect(after.filter(t => t.transferRef)).toHaveLength(8);
    const converted = after.find(t => t.id === expenseLeg.id);
    expect(converted.transferRef).toBeFalsy();
    expect(converted.categoryId).toBe('cat_groceries');
    // The counterpart legs still sit on the Savings side, untouched
    expect(after.filter(t => t.type === 'income').every(t => t.accountId === savingsId)).toBe(true);
  });

  it('conversion never restructures past occurrences, not even with scope all', () => {
    const { seriesId } = makeRecurringTransfer();
    const oct = seriesMembers(seriesId).find(t => t.date === '2026-10-10' && t.type === 'expense');

    convert(oct, { updateAll: true });

    const after = seriesMembers(seriesId);
    // Aug + Sep stay transfer pairs; Oct..Dec become single expenses
    const pastLegs = after.filter(t => t.date < '2026-10-10');
    expect(pastLegs).toHaveLength(4);
    expect(pastLegs.every(t => t.transferRef)).toBe(true);
    expect(pastLegs.filter(t => t.type === 'income').every(t => t.accountId === savingsId)).toBe(true);
    expect(pastLegs.every(t => t.categoryId !== 'cat_groceries')).toBe(true);

    const futureLegs = after.filter(t => t.date >= '2026-10-10');
    expect(futureLegs).toHaveLength(3);
    expect(futureLegs.every(t => t.type === 'expense' && !t.transferRef)).toBe(true);
    // Savings keeps only the two past income legs
    expect(Store.getBalanceAtDate('2026-12-31', [savingsId])).toBe(400);
  });

  it('a plain edit of a transfer leg (no conversion flag) still syncs the counterpart', () => {
    const { expenseLeg } = makeRecurringTransfer();

    // e.g. UPDATE_RECURRING_SERIES / tag paths, which never convert
    Store.dispatch('UPDATE_TRANSACTION', { id: expenseLeg.id, amount: 250 });

    const pair = Store.getState().transactions.filter(t => t.transferRef === expenseLeg.transferRef);
    expect(pair).toHaveLength(2);
    expect(pair.every(t => t.amount === 250)).toBe(true);
  });

  it('regular series member converted to transfer with future scope: fresh seriesId, past intact', () => {
    // Seed a regular recurring expense series (views ADD_TRANSACTION shape)
    Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 100,
      accountId: bankId,
      categoryId: 'cat_groceries',
      date: '2026-08-15',
      comment: 'Life insurance',
      recurrence: { interval: 1, frequency: 'months', endDate: '2026-12-15' }
    });
    const head = Store.getState().transactions.find(t => t.comment === 'Life insurance' && t.date === '2026-08-15');
    const oldSeriesId = head.recurrence.seriesId;
    const oct = Store.getState().transactions.find(t => t.recurrence && t.recurrence.seriesId === oldSeriesId && t.date === '2026-10-15');

    // Views conversion path, scope 'future':
    Store.dispatch('DELETE_TRANSACTION', { id: oct.id, deleteFuture: true });
    const newSeriesId = global.window.StackdDB.generateId();
    Store.dispatch('ADD_TRANSFER', {
      amount: 100,
      expenseAccountId: bankId,
      incomeAccountId: savingsId,
      date: '2026-10-15',
      time: undefined,
      note: 'Life insurance',
      recurrence: {
        seriesId: newSeriesId,
        interval: 1,
        frequency: 'months',
        endDate: '2026-12-15',
        nextDate: Store._calculateNextRecurrenceDate('2026-10-15', 1, 'months')
      },
      tags: []
    });

    const oldMembers = Store.getState().transactions.filter(t => t.recurrence && t.recurrence.seriesId === oldSeriesId);
    const newMembers = Store.getState().transactions.filter(t => t.recurrence && t.recurrence.seriesId === newSeriesId);
    console.log('old series dates:', oldMembers.map(t => t.date).sort());
    console.log('new series dates:', [...new Set(newMembers.map(t => t.date))].sort(),
      'legs:', newMembers.length,
      'generators:', newMembers.filter(t => t.recurrence.nextDate).length);

    // Past members (Aug, Sep) survive under the old series
    expect(oldMembers.map(t => t.date).sort()).toEqual(['2026-08-15', '2026-09-15']);
    // New transfer series materializes Oct, Nov, Dec as pairs
    expect([...new Set(newMembers.map(t => t.date))].sort()).toEqual(['2026-10-15', '2026-11-15', '2026-12-15']);
    expect(newMembers).toHaveLength(6);
    expect(newMembers.filter(t => t.recurrence.nextDate)).toHaveLength(1);
  });
});
