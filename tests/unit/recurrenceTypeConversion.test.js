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

  it('transfer leg converted to expense with future scope leaves future pairs intact', () => {
    const { expenseLeg, seriesId } = makeRecurringTransfer();

    const before = Store.getState().transactions.filter(t => t.recurrence && t.recurrence.seriesId === seriesId);
    // sanity: Aug..Dec = 5 pairs = 10 legs
    expect(before).toHaveLength(10);
    expect(before.filter(t => t.type === 'income')).toHaveLength(5);

    // Replicates the views.js save handler when the user taps the expense leg,
    // switches the type toggle to "Expense", saves, and picks "This and future":
    // type !== 'transfer'  ->  else-if (isEditSave) branch -> UPDATE_TRANSACTION
    Store.dispatch('UPDATE_TRANSACTION', {
      id: expenseLeg.id,
      type: 'expense',
      amount: 200,
      accountId: bankId,
      categoryId: 'cat_groceries',
      date: '2026-08-10',           // unchanged
      time: undefined,
      comment: 'Monthly savings',
      recurrence: {                  // form rebuilds it, same schedule
        seriesId,
        interval: 1,
        frequency: 'months',
        endDate: '2026-12-10',
        nextDate: Store._calculateNextRecurrenceDate('2026-08-10', 1, 'months')
      },
      tags: [],
      updateFuture: true,
      updateAll: false
    });

    const after = Store.getState().transactions.filter(t => t.recurrence && t.recurrence.seriesId === seriesId);
    const incomeLegs = after.filter(t => t.type === 'income');

    // If the store propagated `type`/`accountId`/`categoryId` onto the income
    // legs of future pairs, the transfer pairs would corrupt into double expenses.
    expect(incomeLegs).toHaveLength(5);
    // Counterpart legs keep their own account (Savings side)
    expect(incomeLegs.every(t => t.accountId === savingsId)).toBe(true);
  });

  it('same conversion with scope only-this leaves the rest of the series intact', () => {
    const { expenseLeg, seriesId } = makeRecurringTransfer();

    Store.dispatch('UPDATE_TRANSACTION', {
      id: expenseLeg.id,
      type: 'expense',
      amount: 200,
      accountId: bankId,
      categoryId: 'cat_groceries',
      date: '2026-08-10',
      time: undefined,
      comment: 'Monthly savings',
      recurrence: {
        seriesId,
        interval: 1,
        frequency: 'months',
        endDate: '2026-12-10',
        nextDate: Store._calculateNextRecurrenceDate('2026-08-10', 1, 'months')
      },
      tags: [],
      updateFuture: false,
      updateAll: false
    });

    const after = Store.getState().transactions.filter(t => t.recurrence && t.recurrence.seriesId === seriesId);
    const incomeLegs = after.filter(t => t.type === 'income');
    // Only the edited leg changed type; the other 9 legs untouched
    expect(incomeLegs).toHaveLength(5);
    expect(after.filter(t => t.type === 'expense')).toHaveLength(5);
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
