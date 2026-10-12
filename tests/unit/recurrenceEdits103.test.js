import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.3 (U1) — recurring-series edits in the store:
//  - BUG-135: a type change with 'This and future' / 'All' converts every
//    payment in the scope, not only the tapped one;
//  - BUG-136: Recurrent off with a scope keeps the payments dated today or
//    earlier (unlinked) and removes only the later ones;
//  - BUG-139 (D1): a payment deleted (or unlinked) with 'Only this' stays gone
//    when a later 'This and future' / 'All' edit rebuilds the series;
//  - BUG-99: a transfer's time edit reaches both legs;
//  - the income leg of a recurring transfer converted to Income keeps the
//    series' generator.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const pin = (y, m, d) => vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));

describe('Recurring series edits (1.0.3 U1)', () => {
  let Store;
  let main, savings;

  const txs = () => Store.getState().transactions;
  const members = (sid) => txs().filter(t => t.recurrence && t.recurrence.seriesId === sid)
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  const at = (sid, date, type) => members(sid).find(t => t.date === date && (!type || t.type === type));
  const dates = (sid) => [...new Set(members(sid).map(t => t.date))];
  const armed = (sid) => members(sid).filter(t => t.recurrence.nextDate);
  const byComment = (c) => txs().filter(t => t.comment === c).sort((a, b) => a.date.localeCompare(b.date));

  const addSeries = ({ comment, amount = 100, date, endDate, type = 'expense', categoryId = 'cat_other', interval = 1, frequency = 'months' }) => {
    Store.dispatch('ADD_TRANSACTION', {
      type, amount, accountId: main, categoryId, date, comment,
      recurrence: { interval, frequency, endDate }
    });
    return txs().find(t => t.comment === comment && t.date === date).recurrence.seriesId;
  };
  const addTransferSeries = ({ note, amount = 50, date, endDate, interval = 1, frequency = 'months', time }) => {
    Store.dispatch('ADD_TRANSFER', {
      amount, expenseAccountId: main, incomeAccountId: savings, date, note, time,
      recurrence: { interval, frequency, endDate }, tags: []
    });
    return txs().find(t => t.comment === note && t.date === date && t.type === 'expense').recurrence.seriesId;
  };
  // The payload the AddTransactionView save handler builds (views.js)
  const edit = (tx, over = {}) => {
    const rec = tx.recurrence;
    const date = over.date || tx.date;
    return {
      id: tx.id, type: tx.type, amount: Math.abs(tx.amount), accountId: tx.accountId,
      categoryId: tx.categoryId, date, time: undefined, comment: tx.comment,
      recurrence: over.recurrence !== undefined ? over.recurrence : {
        seriesId: rec.seriesId, interval: rec.interval, frequency: rec.frequency, endDate: rec.endDate,
        nextDate: Store._calculateNextRecurrenceDate(date, rec.interval, rec.frequency)
      },
      tags: tx.tags || [], updateFuture: false, updateAll: false,
      ...over
    };
  };
  const editTransfer = (leg, over = {}) => {
    const rec = leg.recurrence;
    const date = over.date || leg.date;
    const p = {
      transferRef: leg.transferRef, amount: Math.abs(leg.amount), expenseAccountId: main, incomeAccountId: savings,
      date, time: undefined, note: leg.comment,
      recurrence: over.recurrence !== undefined ? over.recurrence : (rec ? {
        seriesId: rec.seriesId, interval: rec.interval, frequency: rec.frequency, endDate: rec.endDate,
        nextDate: Store._calculateNextRecurrenceDate(date, rec.interval, rec.frequency)
      } : null),
      tags: [], updateFuture: false, updateAll: false,
      ...over
    };
    return p;
  };
  const noOrphanLegs = () => {
    const n = {};
    txs().filter(t => t.transferRef).forEach(t => { n[t.transferRef] = (n[t.transferRef] || 0) + 1; });
    Object.values(n).forEach(c => expect(c).toBe(2));
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    pin(2026, 10, 6);
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 11) },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
    Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2500, openingDate: '2026-01-01' });
    Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
    main = Store.getState().accounts.find(a => a.name === 'Main').id;
    savings = Store.getState().accounts.find(a => a.name === 'Savings').id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── BUG-135 ───────────────────────────────────────────────────────────────
  describe('BUG-135: a type change reaches every payment in the scope', () => {
    it("expense → income with 'This and future': the later payments become income, the earlier stay expenses", () => {
      const sid = addSeries({ comment: 'Salary', amount: 1800, date: '2026-10-27', endDate: '2027-03-27' });
      const dec = at(sid, '2026-12-27');
      Store.dispatch('UPDATE_TRANSACTION', edit(dec, { type: 'income', categoryId: 'cat_salary', updateFuture: true }));

      const m = members(sid);
      expect(m).toHaveLength(6);
      m.filter(t => t.date < '2026-12-27').forEach(t => {
        expect(t.type).toBe('expense');
        expect(t.categoryId).toBe('cat_other');
      });
      m.filter(t => t.date >= '2026-12-27').forEach(t => {
        expect(t.type).toBe('income');
        expect(t.categoryId).toBe('cat_salary');
      });
    });

    it("the report's case: 27 Oct switched with 'This and future' puts +€1,800 in every month", () => {
      const sid = addSeries({ comment: 'Salary', amount: 1800, date: '2026-10-27', endDate: '2027-03-27' });
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-10-27'), { type: 'income', categoryId: 'cat_salary', updateFuture: true }));
      expect(members(sid).every(t => t.type === 'income')).toBe(true);
      // 2,500 opening + 6 × 1,800
      expect(Store.getBalanceAtDate('2027-03-31', [main])).toBe(13300);
    });

    it("expense → income with 'All': every payment, past ones too", () => {
      const sid = addSeries({ comment: 'Freelance', amount: 300, date: '2026-11-15', endDate: '2027-04-15' });
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2027-01-15'), { type: 'income', categoryId: 'cat_freelance', updateAll: true }));
      const m = members(sid);
      expect(m).toHaveLength(6);
      m.forEach(t => {
        expect(t.type).toBe('income');
        expect(t.categoryId).toBe('cat_freelance');
      });
    });

    it("income → expense with 'This and future'", () => {
      const sid = addSeries({ comment: 'Gift', amount: 40, date: '2026-10-10', endDate: '2027-01-10', type: 'income', categoryId: 'cat_salary' });
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-11-10'), { type: 'expense', categoryId: 'cat_other', updateFuture: true }));
      expect(members(sid).map(t => `${t.date}:${t.type}`)).toEqual([
        '2026-10-10:income', '2026-11-10:expense', '2026-12-10:expense', '2027-01-10:expense'
      ]);
    });

    it("a type change with a date move ('This and future') rebuilds the later payments with the new type", () => {
      const sid = addSeries({ comment: 'Salary', amount: 1800, date: '2026-10-27', endDate: '2027-03-31' });
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-12-27'), { date: '2026-12-28', type: 'income', categoryId: 'cat_salary', updateFuture: true }));
      const later = members(sid).filter(t => t.date >= '2026-12-28');
      expect(later.map(t => t.date)).toEqual(['2026-12-28', '2027-01-28', '2027-02-28', '2027-03-28']);
      later.forEach(t => expect(t.type).toBe('income'));
      expect(members(sid).filter(t => t.date < '2026-12-28').every(t => t.type === 'expense')).toBe(true);
      expect(armed(sid)).toHaveLength(1);
    });
  });

  // ── BUG-136 ───────────────────────────────────────────────────────────────
  describe('BUG-136: Recurrent off keeps the payments that already happened', () => {
    const gym = () => addSeries({ comment: 'Gym', amount: 12.5, date: '2026-08-03', endDate: '2026-12-28', frequency: 'weeks', categoryId: 'cat_health' });

    it("'This and future' from 10 Aug: 17 Aug–5 Oct stay (unlinked), only the payments after today go", () => {
      const sid = gym();
      expect(members(sid)).toHaveLength(22);
      const aug10 = at(sid, '2026-08-10');
      Store.dispatch('UPDATE_TRANSACTION', edit(aug10, { recurrence: null, updateFuture: true }));

      const rows = byComment('Gym');
      expect(rows.map(t => t.date)).toEqual([
        '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07',
        '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'
      ]);
      rows.filter(t => t.date >= '2026-08-10').forEach(t => expect(t.recurrence).toBeNull());
      expect(members(sid).map(t => t.date)).toEqual(['2026-08-03']);
      expect(armed(sid)).toHaveLength(0);
      // the stopped series ends on its last payment
      expect(Store.getSeriesSchedule(sid).endDate).toBe('2026-08-03');
      // September keeps its 4 payments: 2,500 − 10 × 12.50
      expect(Store.getAccountBalance(main)).toBe(2375);
    });

    it("'All' unlinks every payment up to today and removes only the later ones", () => {
      const sid = gym();
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-08-10'), { recurrence: null, updateAll: true }));
      const rows = byComment('Gym');
      expect(rows).toHaveLength(10);
      expect(rows[rows.length - 1].date).toBe('2026-10-05');
      rows.forEach(t => expect(t.recurrence).toBeNull());
      expect(members(sid)).toHaveLength(0);
    });

    it('a payment dated today counts as booked', () => {
      pin(2026, 10, 5);
      const sid = gym();
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-09-28'), { recurrence: null, updateFuture: true }));
      expect(byComment('Gym').map(t => t.date).slice(-2)).toEqual(['2026-09-28', '2026-10-05']);
      expect(txs().find(t => t.comment === 'Gym' && t.date === '2026-10-05').recurrence).toBeNull();
      expect(byComment('Gym').some(t => t.date > '2026-10-05')).toBe(false);
    });

    it('stopping from a payment after today still removes it and the later ones only', () => {
      const sid = gym();
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-10-19'), { recurrence: null, updateFuture: true }));
      const rows = byComment('Gym');
      expect(rows[rows.length - 1].date).toBe('2026-10-19');
      expect(members(sid).map(t => t.date).slice(-1)).toEqual(['2026-10-12']);
      expect(txs().find(t => t.comment === 'Gym' && t.date === '2026-10-19').recurrence).toBeNull();
    });

    it('transfers: both legs of the past pairs stay (unlinked), later pairs go, no orphan legs', () => {
      const sid = addTransferSeries({ note: 'Sweep', date: '2026-08-03', endDate: '2026-12-28', frequency: 'weeks' });
      const aug10 = at(sid, '2026-08-10', 'expense');
      Store.dispatch('UPDATE_TRANSFER', editTransfer(aug10, { recurrence: null, updateFuture: true }));
      const rows = byComment('Sweep');
      expect(rows).toHaveLength(20); // 10 pairs
      expect([...new Set(rows.map(t => t.date))].slice(-1)).toEqual(['2026-10-05']);
      rows.filter(t => t.date >= '2026-08-10').forEach(t => expect(t.recurrence).toBeNull());
      expect(dates(sid)).toEqual(['2026-08-03']);
      expect(armed(sid)).toHaveLength(0);
      noOrphanLegs();
    });

    it("transfers with 'All': every pair up to today stays, unlinked", () => {
      const sid = addTransferSeries({ note: 'Sweep', date: '2026-08-03', endDate: '2026-12-28', frequency: 'weeks' });
      Store.dispatch('UPDATE_TRANSFER', editTransfer(at(sid, '2026-08-10', 'expense'), { recurrence: null, updateAll: true }));
      const rows = byComment('Sweep');
      expect(rows).toHaveLength(20);
      rows.forEach(t => expect(t.recurrence).toBeNull());
      noOrphanLegs();
    });
  });

  // ── BUG-139 ───────────────────────────────────────────────────────────────
  describe("BUG-139 (D1): a payment deleted with 'Only this' stays gone after a rebuild", () => {
    const rent = (date = '2026-11-01', endDate = '2027-04-01') =>
      addSeries({ comment: 'Rent', amount: 950, date, endDate, categoryId: 'cat_rent' });

    it("the report's case: 1 Jan deleted, 1 Nov moved to 2 Nov with 'This and future' — no 2 Jan", () => {
      const sid = rent();
      Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-01-01').id });
      expect(Store.seriesGapCount(sid, at(sid, '2026-11-01').id)).toBe(1);
      // the form keeps the slot count: 6 slots from 1 Nov → the end moves to 2 Apr
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-11-01'), {
        date: '2026-11-02', updateFuture: true,
        recurrence: { ...at(sid, '2026-11-01').recurrence, endDate: '2027-04-02', nextDate: undefined }
      }));
      expect(dates(sid)).toEqual(['2026-11-02', '2026-12-02', '2027-02-02', '2027-03-02', '2027-04-02']);
      expect(armed(sid)).toHaveLength(1);
      expect(armed(sid)[0].date).toBe('2027-04-02');
    });

    it("'All' keeps the gap too", () => {
      const sid = rent();
      Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-01-01').id });
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-12-01'), { date: '2026-12-02', updateAll: true }));
      expect(dates(sid)).toEqual(['2026-11-01', '2026-12-02', '2027-02-02', '2027-03-02']);
    });

    it('an End Date extension keeps the gap', () => {
      const sid = rent();
      Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-01-01').id });
      const dec = at(sid, '2026-12-01');
      Store.dispatch('UPDATE_TRANSACTION', edit(dec, {
        updateFuture: true, recurrence: { ...dec.recurrence, endDate: '2027-06-01', nextDate: undefined }
      }));
      expect(dates(sid)).toEqual(['2026-11-01', '2026-12-01', '2027-02-01', '2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01']);
    });

    it('a backward move keeps the gap on its shifted slot', () => {
      const sid = rent('2026-11-05', '2027-04-05');
      Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-01-05').id });
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-11-05'), { date: '2026-11-03', updateFuture: true }));
      expect(dates(sid)).toEqual(['2026-11-03', '2026-12-03', '2027-02-03', '2027-03-03', '2027-04-03']);
    });

    it("a payment unlinked with 'Only this' is not duplicated by the rebuild", () => {
      const sid = rent();
      const jan = at(sid, '2027-01-01');
      Store.dispatch('UPDATE_TRANSACTION', edit(jan, { recurrence: null }));
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2026-11-01'), { date: '2026-11-02', updateFuture: true }));
      expect(byComment('Rent').filter(t => t.date.startsWith('2027-01')).map(t => t.date)).toEqual(['2027-01-01']);
      expect(txs().find(t => t.id === jan.id).recurrence).toBeNull();
    });

    it('a payment moved with Only this is not a gap', () => {
      const sid = rent();
      Store.dispatch('UPDATE_TRANSACTION', edit(at(sid, '2027-02-01'), { date: '2027-02-03' }));
      expect(Store.seriesGapCount(sid, at(sid, '2026-11-01').id)).toBe(0);
    });

    it('a frequency change cannot map the gaps: the series is refilled', () => {
      const sid = rent();
      Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-01-01').id });
      const nov = at(sid, '2026-11-01');
      Store.dispatch('UPDATE_TRANSACTION', edit(nov, {
        updateFuture: true, recurrence: { ...nov.recurrence, interval: 2, nextDate: undefined }
      }));
      expect(dates(sid)).toEqual(['2026-11-01', '2027-01-01', '2027-03-01']);
    });

    it('transfers: the deleted pair stays gone (both legs)', () => {
      const sid = addTransferSeries({ note: 'Sweep', date: '2026-11-01', endDate: '2027-04-01' });
      Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-01-01', 'expense').id });
      Store.dispatch('UPDATE_TRANSFER', editTransfer(at(sid, '2026-11-01', 'expense'), { date: '2026-11-02', updateFuture: true }));
      expect(dates(sid)).toEqual(['2026-11-02', '2026-12-02', '2027-02-02', '2027-03-02']);
      expect(members(sid)).toHaveLength(8);
      expect(armed(sid)).toHaveLength(1);
      expect(armed(sid)[0].type).toBe('expense');
      noOrphanLegs();
    });
  });

  // ── BUG-99 ────────────────────────────────────────────────────────────────
  describe("BUG-99: a transfer's time edit reaches both legs", () => {
    it('UPDATE_TRANSFER writes the time on both legs', () => {
      Store.dispatch('ADD_TRANSFER', {
        amount: 100, expenseAccountId: main, incomeAccountId: savings, date: '2026-10-03', time: '07:30:00', note: 'Move', tags: []
      });
      const ref = byComment('Move')[0].transferRef;
      Store.dispatch('UPDATE_TRANSFER', {
        transferRef: ref, amount: 120, expenseAccountId: main, incomeAccountId: savings, date: '2026-10-03', time: '18:00', note: 'Move', tags: []
      });
      const legs = byComment('Move');
      expect(legs).toHaveLength(2);
      legs.forEach(l => {
        expect(l.time).toBe('18:00');
        expect(l.amount).toBe(120);
      });
    });

    it("an undefined time (time input hidden) leaves the legs' time alone", () => {
      Store.dispatch('ADD_TRANSFER', {
        amount: 100, expenseAccountId: main, incomeAccountId: savings, date: '2026-10-03', time: '07:30:00', note: 'Move', tags: []
      });
      const ref = byComment('Move')[0].transferRef;
      Store.dispatch('UPDATE_TRANSFER', {
        transferRef: ref, amount: 120, expenseAccountId: main, incomeAccountId: savings, date: '2026-10-03', time: undefined, note: 'Move', tags: []
      });
      byComment('Move').forEach(l => expect(l.time).toBe('07:30:00'));
    });

    it("'This and future' carries the time to the later pairs", () => {
      const sid = addTransferSeries({ note: 'Sweep', date: '2026-11-01', endDate: '2027-02-01', time: '07:30:00' });
      Store.dispatch('UPDATE_TRANSFER', editTransfer(at(sid, '2026-12-01', 'expense'), { time: '18:00', updateFuture: true }));
      members(sid).forEach(t => expect(t.time).toBe(t.date >= '2026-12-01' ? '18:00' : '07:30:00'));
    });

    it("UPDATE_TRANSACTION on a transfer leg carries the time to its counterpart", () => {
      Store.dispatch('ADD_TRANSFER', {
        amount: 100, expenseAccountId: main, incomeAccountId: savings, date: '2026-10-03', time: '07:30:00', note: 'Move', tags: []
      });
      const exp = byComment('Move').find(t => t.type === 'expense');
      Store.dispatch('UPDATE_TRANSACTION', { id: exp.id, time: '18:00' });
      byComment('Move').forEach(l => expect(l.time).toBe('18:00'));
    });
  });

  // ── verification: the income leg of a recurring transfer → Income ─────────
  describe('converting the income leg of a recurring transfer to Income', () => {
    it("'This and future' keeps one armed member and the series end", () => {
      const sid = addTransferSeries({ note: 'Sweep', date: '2026-11-15', endDate: '2027-03-20' });
      expect(Store.getSeriesSchedule(sid).endDate).toBe('2027-03-20');
      const decIncome = at(sid, '2026-12-15', 'income');
      Store.dispatch('UPDATE_TRANSACTION', {
        ...edit(decIncome, { updateFuture: true }), type: 'income', categoryId: 'cat_salary', convertFromTransfer: true
      });
      const later = members(sid).filter(t => t.date >= '2026-12-15');
      expect(later.map(t => `${t.date}:${t.type}:${t.transferRef || ''}`)).toEqual([
        '2026-12-15:income:', '2027-01-15:income:', '2027-02-15:income:', '2027-03-15:income:'
      ]);
      expect(armed(sid)).toHaveLength(1);
      expect(armed(sid)[0].date).toBe('2027-03-15');
      const sched = Store.getSeriesSchedule(sid);
      expect(sched.live).toBe(true);
      expect(sched.endDate).toBe('2027-03-20');
      noOrphanLegs();
    });
  });
});
