import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-26): endDate / interval / frequency are SERIES-level values. Every
// path that ends a series early (a 'This and future' shorten, deleteFuture,
// Recurrent off, DELETE_LOAN, bulk delete) used to leave the old end on the
// payments it kept; a later scoped edit re-armed from that stale copy and
// brought the deleted payments back. Store, restore and boot cases.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const pin = (y, m, d) => vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));

// The payload shape the AddTransactionView save handler builds, from the
// tapped member's OWN recurrence copy (as recurrenceEditing.test.js does).
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

describe('Recurring series schedule is series-level (1.0.2 BUG-26)', () => {
  let Store;
  let accountId;

  const boot = () => {
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2, 11) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    pin(2026, 10, 15);
    boot();
    Store.dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 5000, openingDate: '2026-01-01' });
    accountId = Store.getState().accounts[0].id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const byDate = (a, b) => a.date.localeCompare(b.date) || (a.type === 'expense' ? -1 : 1);
  const members = (sid) => Store.getState().transactions
    .filter(t => t.recurrence && t.recurrence.seriesId === sid).sort(byDate);
  const armed = (sid) => members(sid).filter(t => t.recurrence.nextDate);
  const at = (sid, date) => members(sid).find(t => t.date === date);
  const addSeries = ({ comment, amount = 50, date, endDate, categoryId = 'cat_rent' }) => {
    Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount, accountId, categoryId, date, comment,
      recurrence: { interval: 1, frequency: 'months', endDate }
    });
    return Store.getState().transactions.find(t => t.comment === comment && t.date === date).recurrence.seriesId;
  };
  const recWith = (tx, patch) => ({
    seriesId: tx.recurrence.seriesId,
    interval: tx.recurrence.interval,
    frequency: tx.recurrence.frequency,
    endDate: tx.recurrence.endDate,
    nextDate: Store._calculateNextRecurrenceDate(patch.date || tx.date, tx.recurrence.interval, tx.recurrence.frequency),
    ...patch
  });

  // ── StreamFlix: the report's repro ────────────────────────────────────────
  describe('a shortened series stays short after a later scoped edit', () => {
    const streamFlix = () => {
      const sid = addSeries({ comment: 'StreamFlix', amount: 12.99, date: '2026-10-20', endDate: '2031-10-20' });
      expect(members(sid)).toHaveLength(61);
      const jan = at(sid, '2027-01-20');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, jan, {
        updateFuture: true, recurrence: recWith(jan, { endDate: '2027-06-30' })
      }));
      expect(members(sid)).toHaveLength(9);
      return sid;
    };

    it("'This and future' amount edit from December keeps the 9 payments", () => {
      const sid = streamFlix();
      const dec = at(sid, '2026-12-20');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, dec, { amount: 13.99, updateFuture: true }));
      const m = members(sid);
      expect(m).toHaveLength(9);
      expect(m[m.length - 1].date).toBe('2027-06-20');
      m.filter(t => t.date >= '2026-12-20').forEach(t => expect(t.amount).toBe(13.99));
      m.filter(t => t.date < '2026-12-20').forEach(t => expect(t.amount).toBe(12.99));
      m.forEach(t => expect(t.recurrence.endDate).toBe('2027-06-30'));
      expect(armed(sid)).toHaveLength(1);
      expect(Store.getSeriesSchedule(sid)).toMatchObject({ endDate: '2027-06-30', live: true, lastDate: '2027-06-20' });
    });

    it("'All' amount edit keeps the 9 payments too", () => {
      const sid = streamFlix();
      const dec = at(sid, '2026-12-20');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, dec, { amount: 13.99, updateAll: true }));
      const m = members(sid);
      expect(m).toHaveLength(9);
      m.forEach(t => expect(t.amount).toBe(13.99));
      expect(armed(sid)).toHaveLength(1);
    });
  });

  // ── restore ───────────────────────────────────────────────────────────────
  it('a restored pre-1.0.2 backup is healed by BATCH_IMPORT_TRANSACTIONS itself', () => {
    const rows = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01'].map(date => ({
      type: 'expense', amount: 50, accountId, categoryId: 'cat_rent', date, comment: 'Old gym',
      recurrence: { seriesId: 'imp-1', interval: 1, frequency: 'months', startDate: '2026-06-01', endDate: '2031-10-20' }
    }));
    Store.dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: rows });
    const m = members('imp-1');
    expect(m).toHaveLength(4);
    m.forEach(t => expect(t.recurrence.endDate).toBe('2026-09-01'));
    expect(armed('imp-1')).toHaveLength(0);
  });

  // ── deleteFuture ──────────────────────────────────────────────────────────
  describe('deleteFuture leaves the survivors ending on their last payment', () => {
    it('a later date move with future scope never brings July/August back', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      expect(members(sid)).toHaveLength(12);
      Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-07-01').id, deleteFuture: true });
      expect(members(sid)).toHaveLength(9);
      members(sid).forEach(t => expect(t.recurrence.endDate).toBe('2027-06-01'));
      expect(armed(sid)).toHaveLength(0);

      const mar = at(sid, '2027-03-01');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, mar, { date: '2027-03-05', updateFuture: true }));
      const m = members(sid);
      expect(m.filter(t => t.date > '2027-06-01')).toEqual([]);
      expect(m.length).toBeLessThanOrEqual(9);
      expect(m.map(t => t.date)).toContain('2027-03-05');
    });

    it('DELETE_LOAN with its future payments: the kept payment ends on its own date; the store floor keeps a later move', () => {
      pin(2026, 10, 3);
      const cfg = {
        type: 'personal', principal: 10000, duration: 48, durationUnit: 'months',
        annualRate: 5, firstPaymentDate: '2026-10-03', amortization: 'french',
        rateChanges: [], earlyRepayments: [], additionalExpenses: []
      };
      const sim = window.LoanEngine.simulate({ ...cfg, computeSavings: false });
      Store.dispatch('ADD_LOAN', { name: 'Car', kind: 'active', config: cfg });
      const loan = Store.getState().loans[Store.getState().loans.length - 1];
      Store.dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId: 'loan-s' });
      Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: sim.schedule[0].paymentC / 100, accountId, categoryId: 'cat_debt', date: '2026-10-03',
        recurrence: { seriesId: 'loan-s', interval: 1, frequency: 'months', endDate: sim.lastPaymentDate }
      });
      expect(members('loan-s')).toHaveLength(48);

      Store.dispatch('DELETE_LOAN', { id: loan.id, deleteFuturePayments: true });
      const kept = members('loan-s');
      expect(kept).toHaveLength(1);
      expect(kept[0].recurrence.endDate).toBe(kept[0].date);

      // moved one day later with its own (series) end: the floor keeps it
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, kept[0], { date: '2026-10-04', updateFuture: true }));
      const after = members('loan-s');
      expect(after).toHaveLength(1);
      expect(after[0].date).toBe('2026-10-04');
      expect(after[0].recurrence.endDate).toBe('2026-10-04');
    });

    it('Recurrent off from January (future scope), then a November move: nothing from January on', () => {
      const sid = addSeries({ comment: 'Gym', amount: 40, date: '2026-10-12', endDate: '2027-09-12' });
      const jan = at(sid, '2027-01-12');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, jan, { recurrence: null, updateFuture: true }));
      const kept = members(sid);
      expect(kept.map(t => t.date)).toEqual(['2026-10-12', '2026-11-12', '2026-12-12']);
      kept.forEach(t => expect(t.recurrence.endDate).toBe('2026-12-12'));

      const nov = at(sid, '2026-11-12');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, nov, { date: '2026-11-14', updateFuture: true }));
      expect(members(sid).filter(t => t.date >= '2027-01-01')).toEqual([]);
    });

    it('a recurring transfer shortened from its 6th pair stays at 6 pairs after an All amount edit', () => {
      Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
      const savings = Store.getState().accounts.find(a => a.name === 'Savings').id;
      Store.dispatch('ADD_TRANSFER', {
        amount: 200, expenseAccountId: accountId, incomeAccountId: savings, date: '2026-10-25', note: 'Auto-save',
        recurrence: { interval: 1, frequency: 'months', endDate: '2027-09-25' }, tags: []
      });
      const sid = Store.getState().transactions.find(t => t.comment === 'Auto-save').recurrence.seriesId;
      expect(members(sid)).toHaveLength(24);

      const sixth = members(sid).find(t => t.date === '2027-03-25' && t.type === 'expense');
      Store.dispatch('UPDATE_TRANSFER', {
        transferRef: sixth.transferRef, amount: 200, expenseAccountId: accountId, incomeAccountId: savings,
        date: sixth.date, note: 'Auto-save', tags: [], updateFuture: true,
        recurrence: recWith(sixth, { endDate: '2027-04-10' })
      });
      expect(members(sid)).toHaveLength(12);

      const second = members(sid).find(t => t.date === '2026-11-25' && t.type === 'expense');
      Store.dispatch('UPDATE_TRANSFER', {
        transferRef: second.transferRef, amount: 250, expenseAccountId: accountId, incomeAccountId: savings,
        date: second.date, note: 'Auto-save', tags: [], updateAll: true,
        recurrence: recWith(second, {}) // its own copy
      });
      const m = members(sid);
      expect(m).toHaveLength(12);
      m.forEach(t => expect(t.recurrence.endDate).toBe('2027-04-10'));
      expect(armed(sid)).toHaveLength(1);
      expect(armed(sid)[0].type).toBe('expense');
      m.forEach(t => expect(t.amount).toBe(250));
    });

    it('DELETE_BULK_TRANSACTIONS deleteFuture: survivors end on their last payment, none armed', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      Store.dispatch('DELETE_BULK_TRANSACTIONS', { ids: [at(sid, '2027-07-01').id], deleteFuture: true });
      const m = members(sid);
      expect(m).toHaveLength(9);
      m.forEach(t => expect(t.recurrence.endDate).toBe('2027-06-01'));
      expect(armed(sid)).toHaveLength(0);
    });

    it('a stray armed PAST member is disarmed by deleteFuture, so nothing regenerates', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      const head = at(sid, '2026-10-01');
      Store.state.transactions.push({
        id: 'stray-sep', type: 'expense', amount: 900, accountId, categoryId: 'cat_rent',
        date: '2026-09-01', time: '12:00:00', comment: 'Rent', createdAt: '2026-09-01T00:00:00.000Z',
        recurrence: { ...head.recurrence, nextDate: '2026-10-01' }
      });
      Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-07-01').id, deleteFuture: true });
      Store._processRecurringTransactions(); // the next pass (any dispatch / boot)
      expect(members(sid).filter(t => t.date > '2027-06-01')).toEqual([]);
      expect(armed(sid)).toHaveLength(0);
    });
  });

  // ── D-U3-2a: 'Only this' never reschedules ────────────────────────────────
  describe("'Only this' keeps the series' schedule (D-U3-2a)", () => {
    it('a changed End Date on a mid payment is ignored; every member keeps the series end', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      const mar = at(sid, '2027-03-01');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, mar, {
        amount: 950, recurrence: recWith(mar, { endDate: '2027-04-30' })
      }));
      const m = members(sid);
      expect(m).toHaveLength(12);
      m.forEach(t => expect(t.recurrence.endDate).toBe('2027-09-01'));
      expect(at(sid, '2027-03-01').amount).toBe(950); // the other edit applied
      expect(at(sid, '2027-04-01').amount).toBe(900);
    });

    it('a LONGER End Date on the armed tail does not grow the series', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      const tail = at(sid, '2027-09-01');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, tail, {
        recurrence: recWith(tail, { endDate: '2028-03-01' })
      }));
      expect(members(sid)).toHaveLength(12);
      expect(Store.getSeriesSchedule(sid).endDate).toBe('2027-09-01');
    });

    it('guard: the last payment moved +5 days with Only this is inert, and a later future amount edit keeps the count', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      const last = at(sid, '2027-09-01');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, last, { date: '2027-09-06' }));
      expect(members(sid)).toHaveLength(12);
      expect(armed(sid)).toHaveLength(1);
      expect(armed(sid)[0].recurrence.endDate).toBe('2027-09-01'); // the series end
      expect(members(sid).filter(t => t.date > '2027-09-06')).toEqual([]);

      const dec = at(sid, '2026-12-01');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, dec, { amount: 950, updateFuture: true }));
      expect(members(sid)).toHaveLength(12);
      expect(at(sid, '2027-09-06').amount).toBe(950);
    });
  });

  // ── boot heal ─────────────────────────────────────────────────────────────
  describe('_healSeriesSchedules at boot', () => {
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
    const shape = (txs) => txs.map(t => `${t.id}|${t.date}|${t.amount}|${t.isPaid}`).sort();

    it('stamps the real schedule on stale 1.0.1 data; ids, dates, amounts and balances unchanged', () => {
      // a stopped series whose kept payments still carry the old end
      const rent = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      Store.state.transactions = Store.state.transactions.filter(t =>
        !(t.recurrence && t.recurrence.seriesId === rent && t.date >= '2027-07-01'));
      Store.state.transactions.forEach(t => {
        if (t.recurrence && t.recurrence.seriesId === rent) delete t.recurrence.nextDate;
      });
      // a live series whose past payments carry another end
      const sf = addSeries({ comment: 'StreamFlix', amount: 12.99, date: '2026-10-20', endDate: '2027-10-20' });
      ['2026-10-20', '2026-11-20'].forEach(d => { at(sf, d).recurrence.endDate = '2031-10-20'; });
      const before = Store.getState().transactions.map(t => ({ ...t }));
      const balance = Store.getAccountBalance(accountId);
      // the stale state a 1.0.1 install holds
      members(rent).forEach(t => expect(t.recurrence.endDate).toBe('2027-09-01'));

      const setItem = rebootOn(snapshot());
      members(rent).forEach(t => expect(t.recurrence.endDate).toBe('2027-06-01'));
      members(sf).forEach(t => expect(t.recurrence.endDate).toBe('2027-10-20'));
      expect(armed(rent)).toHaveLength(0);
      expect(armed(sf)).toHaveLength(1);
      expect(shape(Store.getState().transactions)).toEqual(shape(before));
      expect(Store.getAccountBalance(accountId)).toBe(balance);
      expect(setItem.mock.calls.some(([k]) => k === 'stackd_v1_transactions')).toBe(true);
      // no updatedAt bump: metadata only
      const upd = (txs) => txs.map(t => `${t.id}|${t.updatedAt}`).sort();
      expect(upd(Store.getState().transactions)).toEqual(upd(before));
    });

    it('no-op path (guard): booting on consistent data saves no transactions', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      const before = JSON.stringify(Store.getState().transactions);
      const setItem = rebootOn(snapshot());
      expect(setItem.mock.calls.some(([k]) => k === 'stackd_v1_transactions')).toBe(false);
      expect(JSON.stringify(Store.getState().transactions)).toBe(before);
      expect(members(sid)).toHaveLength(12);
    });

    it('no-op path: _healSeriesSchedules reports nothing on consistent data', () => {
      addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      expect(Store._healSeriesSchedules()).toBe(false);
    });

    it('idempotent: a second pass after a heal finds nothing', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      at(sid, '2026-10-01').recurrence.endDate = '2030-01-01';
      expect(Store._healSeriesSchedules()).toBe(true);
      expect(Store._healSeriesSchedules()).toBe(false);
      members(sid).forEach(t => expect(t.recurrence.endDate).toBe('2027-09-01'));
    });
  });
  // ── review round 1 (spec-r1-U3-R2, regress-r1-U3-RV-2) ───────────────────
  describe("a payment 'Only this' moved past the end of a STOPPED series", () => {
    const stopped = () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-07-01').id, deleteFuture: true });
      expect(members(sid)).toHaveLength(9);
      expect(Store.getSeriesSchedule(sid)).toMatchObject({ endDate: '2027-06-01', live: false });
      return sid;
    };

    it('moving the last payment into July keeps the series end, and a later future move does not grow the series', () => {
      const sid = stopped();
      const jun = at(sid, '2027-06-01');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, jun, {
        date: '2027-07-02', recurrence: recWith(jun, { endDate: '2027-06-01', date: '2027-07-02' })
      }));
      expect(members(sid)).toHaveLength(9);
      expect(Store.getSeriesSchedule(sid)).toMatchObject({ endDate: '2027-06-01', lastDate: '2027-05-01' });
      members(sid).forEach(t => expect(t.recurrence.endDate).toBe('2027-06-01'));

      const mar = at(sid, '2027-03-01');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, mar, {
        date: '2027-03-05', updateFuture: true, recurrence: recWith(mar, { endDate: '2027-06-01', date: '2027-03-05' })
      }));
      const m = members(sid);
      expect(m.length).toBeLessThanOrEqual(9);
      expect(m.filter(t => t.date > '2027-06-01')).toEqual([]);
    });

    it('moving a mid payment to August keeps the series end; a later future move rebuilds nothing past June', () => {
      const sid = stopped();
      const mar = at(sid, '2027-03-01');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, mar, {
        date: '2027-08-15', recurrence: recWith(mar, { date: '2027-08-15' })
      }));
      expect(Store.getSeriesSchedule(sid).endDate).toBe('2027-06-01');
      members(sid).forEach(t => expect(t.recurrence.endDate).toBe('2027-06-01'));

      const apr = at(sid, '2027-04-01');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, apr, {
        date: '2027-04-03', updateFuture: true, recurrence: recWith(apr, { endDate: '2027-06-01', date: '2027-04-03' })
      }));
      const m = members(sid);
      expect(m.length).toBeLessThanOrEqual(9);
      expect(m.filter(t => t.date > '2027-06-01')).toEqual([]);
    });

    it('guard: a stale LATER copy is still healed to the last payment', () => {
      const sid = stopped();
      members(sid).forEach(t => { t.recurrence = { ...t.recurrence, endDate: '2031-10-01' }; });
      expect(Store._healSeriesSchedules()).toBe(true);
      members(sid).forEach(t => expect(t.recurrence.endDate).toBe('2027-06-01'));
    });
  });

  describe('UPDATE_TRANSACTION and UPDATE_TRANSFER classify an at-cap End Date the same way', () => {
    // A series at the default 5-year cap; an End Date past the cap clamps
    // back to the series end, so a 'This and future' amount edit rebuilds
    // nothing on either path: December keeps its id and stays unpaid.
    it('a regular series does not rebuild', () => {
      const sid = addSeries({ comment: 'StreamFlix', amount: 12.99, date: '2026-10-20', endDate: '2031-10-20' });
      expect(members(sid)).toHaveLength(61);
      const decId = at(sid, '2026-12-20').id;
      Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: decId });
      const nov = at(sid, '2026-11-20');
      Store.dispatch('UPDATE_TRANSACTION', formEditPayload(Store, nov, {
        amount: 13.99, updateFuture: true, recurrence: recWith(nov, { endDate: '2032-10-20' })
      }));
      expect(members(sid)).toHaveLength(61);
      const dec = at(sid, '2026-12-20');
      expect(dec.id).toBe(decId);
      expect(dec.isPaid).toBe(false);
      expect(dec.amount).toBe(13.99);
    });

    it('the identical transfer series does not rebuild either', () => {
      Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
      const savings = Store.getState().accounts.find(a => a.name === 'Savings').id;
      Store.dispatch('ADD_TRANSFER', {
        amount: 12.99, expenseAccountId: accountId, incomeAccountId: savings, date: '2026-10-20', note: 'Stash',
        recurrence: { interval: 1, frequency: 'months', endDate: '2031-10-20' }, tags: []
      });
      const sid = Store.getState().transactions.find(t => t.comment === 'Stash').recurrence.seriesId;
      expect(members(sid)).toHaveLength(122);
      const decExp = members(sid).find(t => t.date === '2026-12-20' && t.type === 'expense');
      const decRef = decExp.transferRef;
      Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: decExp.id });
      const nov = members(sid).find(t => t.date === '2026-11-20' && t.type === 'expense');
      Store.dispatch('UPDATE_TRANSFER', {
        transferRef: nov.transferRef, amount: 13.99, expenseAccountId: accountId, incomeAccountId: savings,
        date: nov.date, note: 'Stash', tags: [], updateFuture: true,
        recurrence: recWith(nov, { endDate: '2032-10-20' })
      });
      expect(members(sid)).toHaveLength(122);
      const dec = members(sid).filter(t => t.date === '2026-12-20');
      expect(dec).toHaveLength(2);
      dec.forEach(t => {
        expect(t.transferRef).toBe(decRef);
        expect(t.isPaid).toBe(false);
        expect(t.amount).toBe(13.99);
      });
    });
  });
});
