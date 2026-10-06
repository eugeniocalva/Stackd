import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.3 (BUG-51 / BUG-159): monthly series started on the 29th–31st keep their
// day (the month's last day when it is shorter), yearly series from 29 Feb
// fall on 28 Feb and come back to 29 Feb in leap years. recurrence.anchorDay
// is the chain's day; _healSeriesAnchors re-dates the future payments of
// series that already drifted (D4), proof-based and idempotent.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const pin = (y, m, d) => vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The 1.0.2 stepper, verbatim: each payment stepped from the previous one.
const legacyStep = (s, n, f) => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (f === 'months') {
    const od = dt.getDate();
    dt.setMonth(dt.getMonth() + n);
    if (dt.getDate() !== od) dt.setDate(0);
  } else if (f === 'years') dt.setFullYear(dt.getFullYear() + n);
  return fmt(dt);
};

describe('Month-end and leap-day series (1.0.3 BUG-51 / BUG-159)', () => {
  let Store;
  let main, savings;

  const txs = () => Store.getState().transactions;
  const members = (sid) => txs().filter(t => t.recurrence && t.recurrence.seriesId === sid)
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  const dates = (sid) => [...new Set(members(sid).map(t => t.date))];
  const armed = (sid) => members(sid).filter(t => t.recurrence.nextDate);
  const at = (sid, date, type) => members(sid).find(t => t.date === date && (!type || t.type === type));

  const load = () => {
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
  };
  const rebootOn = (stored) => {
    const setItem = vi.fn();
    global.window.localStorage.getItem = (k) => (k in stored ? stored[k] : null);
    global.window.localStorage.setItem = setItem;
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
    return setItem;
  };
  const snapshot = () => ({
    stackd_v1_accounts: JSON.stringify(Store.getState().accounts),
    stackd_v1_transactions: JSON.stringify(Store.getState().transactions)
  });
  const savedTx = (setItem) => setItem.mock.calls.some(([k]) => k === 'stackd_v1_transactions');

  const addSeries = ({ comment, date, endDate, frequency = 'months', interval = 1, type = 'income' }) => {
    Store.dispatch('ADD_TRANSACTION', {
      type, amount: 1800, accountId: main, categoryId: type === 'income' ? 'cat_salary' : 'cat_other', date, comment,
      recurrence: { interval, frequency, endDate }
    });
    return txs().find(t => t.comment === comment && t.date === date).recurrence.seriesId;
  };

  // A series as 1.0.2 stored it: legacy dates, no anchorDay.
  const legacySeries = ({ sid, comment, start, endDate, frequency = 'months', transfer = false }) => {
    const out = [];
    let d = start;
    let n = 0;
    while (d <= endDate && n++ < 200) {
      const rec = { seriesId: sid, interval: 1, frequency, startDate: start, endDate };
      if (transfer) {
        const ref = `${sid}-ref-${n}`;
        out.push({ id: `${sid}-e${n}`, type: 'expense', amount: 50, accountId: main, categoryId: '', date: d, time: '09:00:00', comment, transferRef: ref, tags: [], recurrence: { ...rec }, createdAt: '2026-01-01T00:00:00.000Z' });
        out.push({ id: `${sid}-i${n}`, type: 'income', amount: 50, accountId: savings, categoryId: '', date: d, time: '09:00:00', comment, transferRef: ref, tags: [], recurrence: { ...rec }, createdAt: '2026-01-01T00:00:00.000Z' });
      } else {
        out.push({ id: `${sid}-${n}`, type: 'income', amount: 1800, accountId: main, categoryId: 'cat_salary', date: d, time: '09:00:00', comment, tags: [], recurrence: { ...rec }, createdAt: '2026-01-01T00:00:00.000Z' });
      }
      d = legacyStep(d, 1, frequency);
    }
    const tail = out.filter(t => t.type !== 'income' || !transfer).pop();
    tail.recurrence.nextDate = d;
    Store.state.transactions.push(...out);
    return out;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    pin(2026, 10, 6);
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 11) },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    load();
    Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2500, openingDate: '2026-01-01' });
    Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
    main = Store.getState().accounts.find(a => a.name === 'Main').id;
    savings = Store.getState().accounts.find(a => a.name === 'Savings').id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('the stepper', () => {
    it('steps months from an anchor day', () => {
      expect(Store._calculateNextRecurrenceDate('2026-11-30', 1, 'months', 31)).toBe('2026-12-31');
      expect(Store._calculateNextRecurrenceDate('2027-02-28', 1, 'months', 31)).toBe('2027-03-31');
      expect(Store._calculateNextRecurrenceDate('2027-02-28', 1, 'months', 30)).toBe('2027-03-30');
      expect(Store._calculateNextRecurrenceDate('2027-01-31', 1, 'months', 31)).toBe('2027-02-28');
      expect(Store._calculateNextRecurrenceDate('2027-12-31', 2, 'months', 31)).toBe('2028-02-29');
      expect(Store._calculateNextRecurrenceDate('2027-03-31', -1, 'months', 31)).toBe('2027-02-28');
      expect(Store._calculateNextRecurrenceDate('2027-01-15', -13, 'months')).toBe('2025-12-15');
    });

    it('without an anchor, months behave as before (the base day, clamped)', () => {
      expect(Store._calculateNextRecurrenceDate('2026-01-31', 1, 'months')).toBe('2026-02-28');
      expect(Store._calculateNextRecurrenceDate('2026-02-28', 1, 'months')).toBe('2026-03-28');
    });

    it('BUG-159: years clamp to 28 Feb and come back to 29 Feb with the anchor', () => {
      expect(Store._calculateNextRecurrenceDate('2028-02-29', 1, 'years')).toBe('2029-02-28');
      expect(Store._calculateNextRecurrenceDate('2028-02-29', 4, 'years')).toBe('2032-02-29');
      expect(Store._calculateNextRecurrenceDate('2031-02-28', 1, 'years', 29)).toBe('2032-02-29');
      expect(Store._calculateNextRecurrenceDate('2028-02-29', 5, 'years')).toBe('2033-02-28');
    });

    it('days and weeks ignore the anchor', () => {
      expect(Store._calculateNextRecurrenceDate('2026-10-31', 1, 'weeks', 31)).toBe('2026-11-07');
      expect(Store._calculateNextRecurrenceDate('2026-10-31', 2, 'days', 15)).toBe('2026-11-02');
    });

    it('matches LoanEngine.addMonthsClamped (parity)', () => {
      const starts = ['2026-01-31', '2026-10-30', '2028-02-29', '2027-08-15', '2026-12-29'];
      starts.forEach(s => {
        const day = Number(s.slice(8));
        for (let k = -14; k <= 61; k++) {
          expect(Store._calculateNextRecurrenceDate(s, k, 'months', day)).toBe(window.LoanEngine.addMonthsClamped(s, k, day));
        }
      });
    });

    it('BUG-159: the 60-month cap of a 29 Feb start ends on 28 Feb, not 1 Mar', () => {
      const rec = Store._clampRecurrenceEndDate({ startDate: '2028-02-29', endDate: '2034-01-01' });
      expect(rec.endDate).toBe('2033-02-28');
    });
  });

  describe('new series keep their day', () => {
    it('a salary on 31 Oct falls on 30 Nov, 31 Dec, 31 Jan, 28 Feb, 31 Mar …', () => {
      const sid = addSeries({ comment: 'Salary', date: '2026-10-31', endDate: '2031-10-31' });
      const d = dates(sid);
      expect(d.slice(0, 7)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
      expect(d).toContain('2028-02-29');
      expect(d).toHaveLength(61);
      expect(d.every(x => Number(x.slice(8)) >= 28)).toBe(true);
      members(sid).forEach(t => expect(t.recurrence.anchorDay).toBe(31));
      expect(armed(sid)).toHaveLength(1);
      expect(armed(sid)[0].recurrence.nextDate).toBe('2031-11-30');
    });

    it('BUG-159: a yearly series from 29 Feb 2028', () => {
      const sid = addSeries({ comment: 'Insurance', date: '2028-02-29', endDate: '2033-02-28', frequency: 'years', type: 'expense' });
      expect(dates(sid)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29', '2033-02-28']);
    });

    it('ADD_TRANSFER: both legs keep the 31st', () => {
      Store.dispatch('ADD_TRANSFER', {
        amount: 50, expenseAccountId: main, incomeAccountId: savings, date: '2027-01-31', note: 'Sweep',
        recurrence: { interval: 1, frequency: 'months', endDate: '2027-05-31' }, tags: []
      });
      const sid = txs().find(t => t.comment === 'Sweep').recurrence.seriesId;
      expect(dates(sid)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
      expect(members(sid)).toHaveLength(10);
      members(sid).forEach(t => expect(t.recurrence.anchorDay).toBe(31));
    });

    it("a 'This and future' move to the 31st sets the new anchor (no decay to the 28th)", () => {
      const sid = addSeries({ comment: 'Rent', date: '2026-10-15', endDate: '2027-06-30', type: 'expense' });
      const oct = at(sid, '2026-10-15');
      Store.dispatch('UPDATE_TRANSACTION', {
        id: oct.id, date: '2026-10-31', updateFuture: true,
        recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2027-06-30' }
      });
      expect(dates(sid)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30']);
      members(sid).forEach(t => expect(t.recurrence.anchorDay).toBe(31));
    });

    it("an 'Only this' move keeps the series' anchor", () => {
      const sid = addSeries({ comment: 'Rent', date: '2026-10-31', endDate: '2027-03-31', type: 'expense' });
      const nov = at(sid, '2026-11-30');
      Store.dispatch('UPDATE_TRANSACTION', { id: nov.id, date: '2026-11-27', recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2027-03-31' } });
      expect(txs().find(t => t.id === nov.id).recurrence.anchorDay).toBe(31);
      expect(dates(sid)).toEqual(['2026-10-31', '2026-11-27', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
    });

    it('UPDATE_TRANSFER: a future move to the 30th re-anchors both legs', () => {
      Store.dispatch('ADD_TRANSFER', {
        amount: 50, expenseAccountId: main, incomeAccountId: savings, date: '2026-11-10', note: 'Sweep',
        recurrence: { interval: 1, frequency: 'months', endDate: '2027-04-30' }, tags: []
      });
      const sid = txs().find(t => t.comment === 'Sweep').recurrence.seriesId;
      const leg = at(sid, '2026-11-10', 'expense');
      Store.dispatch('UPDATE_TRANSFER', {
        transferRef: leg.transferRef, amount: 50, expenseAccountId: main, incomeAccountId: savings, date: '2026-11-30',
        note: 'Sweep', tags: [], updateFuture: true,
        recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2027-04-30' }
      });
      expect(dates(sid)).toEqual(['2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28', '2027-03-30', '2027-04-30']);
      members(sid).forEach(t => expect(t.recurrence.anchorDay).toBe(30));
    });

    it('a legacy generator (no anchorDay) on a clamped month-end steps back to its start day', () => {
      // _anchorDayOf: startDate's day when the date is a month-end shorter than it
      expect(Store._anchorDayOf({ startDate: '2026-10-31' }, '2026-11-30')).toBe(31);
      expect(Store._anchorDayOf({ startDate: '2026-10-31' }, '2027-03-28')).toBe(28);
      expect(Store._anchorDayOf({ startDate: '2026-10-31', anchorDay: 30 }, '2027-02-28')).toBe(30);
      expect(Store._anchorDayOf({ startDate: '2026-10-15' }, '2026-11-30')).toBe(30);
    });
  });

  describe('_healSeriesAnchors (D4)', () => {
    it('re-dates the future payments of a drifted salary; the past never moves; idempotent', () => {
      pin(2027, 1, 15);
      legacySeries({ sid: 'sal', comment: 'Salary', start: '2026-10-31', endDate: '2027-10-31' });
      expect(dates('sal').slice(0, 6)).toEqual(['2026-10-31', '2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28', '2027-03-28']);
      const before = members('sal').length;

      const setItem = rebootOn(snapshot());
      expect(savedTx(setItem)).toBe(true);
      expect(dates('sal')).toEqual([
        '2026-10-31', '2026-11-30', '2026-12-30', // dated today or earlier: kept
        '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30',
        '2027-07-31', '2027-08-31', '2027-09-30', '2027-10-31'
      ]);
      expect(members('sal')).toHaveLength(before);
      members('sal').forEach(t => expect(t.recurrence.anchorDay).toBe(31));
      expect(armed('sal')).toHaveLength(1);
      expect(armed('sal')[0].date).toBe('2027-10-31');
      expect(armed('sal')[0].recurrence.nextDate).toBe('2027-11-30');

      const again = rebootOn(snapshot());
      expect(savedTx(again)).toBe(false);
    });

    it('re-dates both legs of a transfer series', () => {
      pin(2027, 1, 15);
      legacySeries({ sid: 'tr', comment: 'Sweep', start: '2026-10-31', endDate: '2027-04-30', transfer: true });
      rebootOn(snapshot());
      expect(dates('tr')).toEqual(['2026-10-31', '2026-11-30', '2026-12-30', '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
      const byDate = {};
      members('tr').forEach(t => { byDate[t.date] = (byDate[t.date] || 0) + 1; });
      Object.values(byDate).forEach(n => expect(n).toBe(2));
      expect(armed('tr')).toHaveLength(1);
      expect(armed('tr')[0].type).toBe('expense');
    });

    it('a yearly 29 Feb series moves its future payments back to 28/29 Feb', () => {
      pin(2029, 6, 1);
      legacySeries({ sid: 'ins', comment: 'Insurance', start: '2028-02-29', endDate: '2033-03-01', frequency: 'years' });
      expect(dates('ins')).toEqual(['2028-02-29', '2029-03-01', '2030-03-01', '2031-03-01', '2032-03-01', '2033-03-01']);
      rebootOn(snapshot());
      expect(dates('ins')).toEqual(['2028-02-29', '2029-03-01', '2030-02-28', '2031-02-28', '2032-02-29', '2033-02-28']);
    });

    it('skips a series it cannot prove (a payment moved by hand) and stamps nothing', () => {
      pin(2027, 1, 15);
      legacySeries({ sid: 'sal', comment: 'Salary', start: '2026-10-31', endDate: '2027-06-30' });
      Store.state.transactions.find(t => t.id === 'sal-6').date = '2027-03-25';
      const snap = snapshot();
      const setItem = rebootOn(snap);
      expect(savedTx(setItem)).toBe(false);
      expect(dates('sal')).toContain('2027-02-28');
      expect(dates('sal')).toContain('2027-04-28');
      members('sal').forEach(t => expect(t.recurrence.anchorDay).toBeUndefined());
    });

    it('leaves series that start before the 29th alone', () => {
      const sid = addSeries({ comment: 'Rent', date: '2026-10-15', endDate: '2027-03-15', type: 'expense' });
      members(sid).forEach(t => { delete t.recurrence.anchorDay; });
      const setItem = rebootOn(snapshot());
      expect(savedTx(setItem)).toBe(false);
      expect(dates(sid).every(d => d.endsWith('-15'))).toBe(true);
    });

    it('runs inside a restore (BATCH_IMPORT_TRANSACTIONS)', () => {
      pin(2027, 1, 15);
      const rows = legacySeries({ sid: 'sal', comment: 'Salary', start: '2026-10-31', endDate: '2027-04-30' });
      Store.state.transactions = Store.state.transactions.filter(t => !rows.includes(t));
      Store.dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: rows.map(t => ({ ...t, recurrence: { ...t.recurrence } })) });
      expect(dates('sal')).toEqual(['2026-10-31', '2026-11-30', '2026-12-30', '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
    });
  });
});
