import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Replays the exact payload shape the AddTransactionView save handler builds
// (views.js): recurrence rebuilt from the form with a freshly computed nextDate.
const formEditPayload = (Store, tx, overrides = {}) => {
  const rec = tx.recurrence;
  const date = overrides.date || tx.date;
  return {
    id: tx.id,
    type: tx.type,
    amount: Math.abs(tx.amount),
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    date,
    time: undefined,
    comment: tx.comment,
    recurrence: overrides.recurrence !== undefined ? overrides.recurrence : {
      seriesId: rec.seriesId,
      interval: rec.interval,
      frequency: rec.frequency,
      endDate: rec.endDate,
      nextDate: Store._calculateNextRecurrenceDate(date, rec.interval, rec.frequency)
    },
    tags: tx.tags || [],
    updateFuture: false,
    updateAll: false,
    ...overrides
  };
};

describe('Recurring transaction editing (v0.67)', () => {
  let Store;
  let accountId;

  const seriesMembers = (sid) =>
    Store.getState().transactions.filter(t => t.recurrence && t.recurrence.seriesId === sid);

  const createMonthlySeries = () => {
    Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 100,
      accountId,
      categoryId: 'cat_groceries',
      date: '2026-08-15',
      comment: 'Life insurance',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-08-15' }
    });
    const head = Store.getState().transactions.find(t => t.comment === 'Life insurance' && t.date === '2026-08-15');
    return head.recurrence.seriesId;
  };

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

  describe('materialization invariants', () => {
    it('materializes a monthly series fully, one occurrence per month, single generator tail', () => {
      const sid = createMonthlySeries();
      const members = seriesMembers(sid);
      expect(members).toHaveLength(13); // Aug 2026 .. Aug 2027 inclusive
      expect(members.every(t => t.date.endsWith('-15'))).toBe(true);
      expect(members.filter(t => t.recurrence.nextDate)).toHaveLength(1);
      // no duplicate dates
      expect(new Set(members.map(t => t.date)).size).toBe(13);
    });

    it('members do not share recurrence objects (no aliasing)', () => {
      const sid = createMonthlySeries();
      const members = seriesMembers(sid);
      members[0].recurrence.__marker = true;
      expect(members[1].recurrence.__marker).toBeUndefined();
    });

    it('applies the 60-month cap to the live-form recurrence shape (no enabled flag)', () => {
      Store.dispatch('ADD_TRANSACTION', {
        type: 'expense',
        amount: 10,
        accountId,
        categoryId: 'cat_groceries',
        date: '2026-01-15',
        comment: 'Uncapped?',
        recurrence: { interval: 1, frequency: 'years', endDate: '2036-01-15' }
      });
      const head = Store.getState().transactions.find(t => t.comment === 'Uncapped?' && t.date === '2026-01-15');
      expect(head.recurrence.endDate).toBe('2031-01-15');
    });
  });

  describe('editing a single occurrence (scope: only this)', () => {
    it('moves only that occurrence and never spawns a duplicate chain', () => {
      const sid = createMonthlySeries();
      const sept = seriesMembers(sid).find(t => t.date === '2026-09-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, sept, { date: '2026-09-13' }));

      const members = seriesMembers(sid);
      expect(members).toHaveLength(13);
      const dates = members.map(t => t.date).sort();
      expect(dates.filter(d => d.endsWith('-13'))).toEqual(['2026-09-13']);
      expect(dates.filter(d => d.endsWith('-15'))).toHaveLength(12);
      expect(members.filter(t => t.recurrence.nextDate)).toHaveLength(1);
    });

    it('does not change past or future amounts when only this amount is edited', () => {
      const sid = createMonthlySeries();
      const sept = seriesMembers(sid).find(t => t.date === '2026-09-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, sept, { amount: 250 }));

      const members = seriesMembers(sid);
      expect(members).toHaveLength(13);
      expect(members.find(t => t.date === '2026-09-15').amount).toBe(250);
      expect(members.filter(t => t.amount === 100)).toHaveLength(12);
    });
  });

  describe('editing this and future occurrences', () => {
    it('date change shifts future occurrences to the new day and NEVER touches the past', () => {
      const sid = createMonthlySeries();
      const sept = seriesMembers(sid).find(t => t.date === '2026-09-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, sept, { date: '2026-09-13', updateFuture: true }));

      const members = seriesMembers(sid);
      const dates = members.map(t => t.date).sort();
      // Past stays on the 15th
      expect(dates[0]).toBe('2026-08-15');
      // Everything from the edit onward sits on the 13th
      expect(dates.slice(1).every(d => d.endsWith('-13'))).toBe(true);
      // Regenerated chain: Sep 2026 .. Aug 2027 on the 13th → 12 + 1 past
      expect(members).toHaveLength(13);
      expect(members.filter(t => t.recurrence.nextDate)).toHaveLength(1);
    });

    it('amount-only change propagates to future members without moving any date', () => {
      const sid = createMonthlySeries();
      const sept = seriesMembers(sid).find(t => t.date === '2026-09-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, sept, { amount: 300, updateFuture: true }));

      const members = seriesMembers(sid);
      expect(members).toHaveLength(13);
      expect(members.every(t => t.date.endsWith('-15'))).toBe(true);
      expect(members.find(t => t.date === '2026-08-15').amount).toBe(100);
      expect(members.filter(t => t.amount === 300)).toHaveLength(12);
      expect(members.filter(t => t.recurrence.nextDate)).toHaveLength(1);
    });

    it('a no-op save with future scope regenerates nothing (member ids preserved)', () => {
      const sid = createMonthlySeries();
      const before = seriesMembers(sid).map(t => t.id).sort();
      const sept = seriesMembers(sid).find(t => t.date === '2026-09-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, sept, { updateFuture: true }));

      expect(seriesMembers(sid).map(t => t.id).sort()).toEqual(before);
      expect(seriesMembers(sid).filter(t => t.recurrence.nextDate)).toHaveLength(1);
    });

    it('extending the end date via edit is clamped to the 60-month window', () => {
      const sid = createMonthlySeries();
      const head = seriesMembers(sid).find(t => t.date === '2026-08-15');
      const rec = head.recurrence;

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, head, {
        updateFuture: true,
        recurrence: {
          seriesId: rec.seriesId,
          interval: rec.interval,
          frequency: rec.frequency,
          endDate: '2036-08-15', // 120 months out
          nextDate: Store._calculateNextRecurrenceDate(head.date, rec.interval, rec.frequency)
        }
      }));

      const members = seriesMembers(sid);
      expect(members.find(t => t.id === head.id).recurrence.endDate).toBe('2031-08-15');
      expect(members).toHaveLength(61); // Aug 2026 .. Aug 2031 monthly
    });

    it('end-date change regenerates the future up to the new end', () => {
      const sid = createMonthlySeries();
      const sept = seriesMembers(sid).find(t => t.date === '2026-09-15');
      const rec = sept.recurrence;

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, sept, {
        updateFuture: true,
        recurrence: {
          seriesId: rec.seriesId,
          interval: rec.interval,
          frequency: rec.frequency,
          endDate: '2026-12-31',
          nextDate: Store._calculateNextRecurrenceDate(sept.date, rec.interval, rec.frequency)
        }
      }));

      const members = seriesMembers(sid);
      const dates = members.map(t => t.date).sort();
      expect(dates).toEqual(['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15']);
    });
  });

  describe('editing all occurrences', () => {
    it('amount change reaches every member but past dates never move', () => {
      const sid = createMonthlySeries();
      const dec = seriesMembers(sid).find(t => t.date === '2026-12-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, dec, { amount: 175, updateAll: true }));

      const members = seriesMembers(sid);
      expect(members).toHaveLength(13);
      expect(members.every(t => t.amount === 175)).toBe(true);
      expect(members.every(t => t.date.endsWith('-15'))).toBe(true);
    });

    it('date change with all-scope regenerates the future but leaves past dates alone', () => {
      const sid = createMonthlySeries();
      const dec = seriesMembers(sid).find(t => t.date === '2026-12-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, dec, { date: '2026-12-01', amount: 90, updateAll: true }));

      const members = seriesMembers(sid);
      const past = members.filter(t => t.date < '2026-12-01');
      expect(past.map(t => t.date).sort()).toEqual(['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15']);
      expect(past.every(t => t.amount === 90)).toBe(true);
      const future = members.filter(t => t.date >= '2026-12-01');
      expect(future.every(t => t.date.endsWith('-01'))).toBe(true);
    });
  });

  describe('turning recurrence off', () => {
    it('scope only-this detaches one member and leaves the series intact', () => {
      const sid = createMonthlySeries();
      const sept = seriesMembers(sid).find(t => t.date === '2026-09-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, sept, { recurrence: null }));

      expect(seriesMembers(sid)).toHaveLength(12);
      const detached = Store.getState().transactions.find(t => t.id === sept.id);
      expect(detached.recurrence).toBeNull();
      expect(detached.date).toBe('2026-09-15');
    });

    it('scope future stops the series: upcoming occurrences are removed, past kept', () => {
      const sid = createMonthlySeries();
      const sept = seriesMembers(sid).find(t => t.date === '2026-09-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, sept, { recurrence: null, updateFuture: true }));

      const members = seriesMembers(sid);
      expect(members.map(t => t.date)).toEqual(['2026-08-15']);
      const edited = Store.getState().transactions.find(t => t.id === sept.id);
      expect(edited.recurrence).toBeNull();
    });

    it('scope all also unlinks past members without deleting them', () => {
      const sid = createMonthlySeries();
      const sept = seriesMembers(sid).find(t => t.date === '2026-09-15');

      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, sept, { recurrence: null, updateAll: true }));

      expect(seriesMembers(sid)).toHaveLength(0);
      const aug = Store.getState().transactions.find(t => t.comment === 'Life insurance' && t.date === '2026-08-15');
      expect(aug).toBeDefined();
      expect(aug.recurrence).toBeNull();
    });
  });

  describe('recurring transfers', () => {
    const createMonthlyTransfer = () => {
      Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
      const savingsId = Store.getState().accounts.find(a => a.name === 'Savings').id;
      Store.dispatch('ADD_TRANSFER', {
        amount: 50,
        expenseAccountId: accountId,
        incomeAccountId: savingsId,
        date: '2026-08-15',
        note: 'Monthly savings',
        recurrence: { interval: 1, frequency: 'months', endDate: '2026-12-15' }
      });
      const legs = Store.getState().transactions.filter(t => t.comment === 'Monthly savings');
      return legs.find(t => t.recurrence && t.recurrence.seriesId).recurrence.seriesId;
    };

    it('creates the whole series without crashing, two legs per date, one generator', () => {
      const sid = createMonthlyTransfer();
      const legs = seriesMembers(sid);
      expect(legs).toHaveLength(10); // 5 months x 2 legs
      const byDate = {};
      legs.forEach(t => { byDate[t.date] = (byDate[t.date] || 0) + 1; });
      expect(Object.values(byDate).every(n => n === 2)).toBe(true);
      expect(legs.filter(t => t.recurrence.nextDate)).toHaveLength(1);
    });

    it('date edit with future scope regenerates future pairs, past pairs stay', () => {
      const sid = createMonthlyTransfer();
      const septExpense = seriesMembers(sid).find(t => t.date === '2026-09-15' && t.type === 'expense');
      const rec = septExpense.recurrence;

      Store.dispatch('UPDATE_TRANSFER', {
        transferRef: septExpense.transferRef,
        amount: 50,
        expenseAccountId: septExpense.accountId,
        incomeAccountId: Store.getState().accounts.find(a => a.name === 'Savings').id,
        date: '2026-09-10',
        note: 'Monthly savings',
        recurrence: {
          seriesId: rec.seriesId,
          interval: rec.interval,
          frequency: rec.frequency,
          endDate: rec.endDate,
          nextDate: Store._calculateNextRecurrenceDate('2026-09-10', rec.interval, rec.frequency)
        },
        tags: [],
        updateFuture: true
      });

      const legs = seriesMembers(sid);
      const dates = [...new Set(legs.map(t => t.date))].sort();
      expect(dates).toEqual(['2026-08-15', '2026-09-10', '2026-10-10', '2026-11-10', '2026-12-10']);
      const byDate = {};
      legs.forEach(t => { byDate[t.date] = (byDate[t.date] || 0) + 1; });
      expect(Object.values(byDate).every(n => n === 2)).toBe(true);
      expect(legs.filter(t => t.recurrence.nextDate)).toHaveLength(1);
    });

    it('single-occurrence transfer edit does not spawn duplicates', () => {
      const sid = createMonthlyTransfer();
      const septExpense = seriesMembers(sid).find(t => t.date === '2026-09-15' && t.type === 'expense');
      const rec = septExpense.recurrence;

      Store.dispatch('UPDATE_TRANSFER', {
        transferRef: septExpense.transferRef,
        amount: 75,
        expenseAccountId: septExpense.accountId,
        incomeAccountId: Store.getState().accounts.find(a => a.name === 'Savings').id,
        date: '2026-09-15',
        note: 'Monthly savings',
        recurrence: {
          seriesId: rec.seriesId,
          interval: rec.interval,
          frequency: rec.frequency,
          endDate: rec.endDate,
          nextDate: Store._calculateNextRecurrenceDate('2026-09-15', rec.interval, rec.frequency)
        },
        tags: [],
        updateFuture: false
      });

      const legs = seriesMembers(sid);
      expect(legs).toHaveLength(10);
      expect(legs.filter(t => t.date === '2026-09-15' && t.amount === 75)).toHaveLength(2);
      expect(legs.filter(t => t.amount === 50)).toHaveLength(8);
    });
  });

  describe('_calculateNextRecurrenceDate', () => {
    it('is stable across DST boundaries (no one-day drift)', () => {
      expect(Store._calculateNextRecurrenceDate('2027-03-15', 1, 'months')).toBe('2027-04-15');
      expect(Store._calculateNextRecurrenceDate('2026-10-15', 1, 'months')).toBe('2026-11-15');
      // Walk a full year and confirm the day of month never drifts
      let d = '2026-08-15';
      for (let i = 0; i < 12; i++) {
        d = Store._calculateNextRecurrenceDate(d, 1, 'months');
        expect(d.endsWith('-15')).toBe(true);
      }
    });

    it('clamps month-end correctly', () => {
      expect(Store._calculateNextRecurrenceDate('2026-01-31', 1, 'months')).toBe('2026-02-28');
      expect(Store._calculateNextRecurrenceDate('2028-01-31', 1, 'months')).toBe('2028-02-29');
    });

    it('handles days, weeks and years', () => {
      expect(Store._calculateNextRecurrenceDate('2026-03-27', 3, 'days')).toBe('2026-03-30');
      expect(Store._calculateNextRecurrenceDate('2026-10-24', 1, 'weeks')).toBe('2026-10-31');
      expect(Store._calculateNextRecurrenceDate('2026-02-15', 2, 'years')).toBe('2028-02-15');
    });

    it('returns undefined on invalid input instead of throwing', () => {
      expect(Store._calculateNextRecurrenceDate(undefined, 1, 'months')).toBeUndefined();
    });
  });
});
