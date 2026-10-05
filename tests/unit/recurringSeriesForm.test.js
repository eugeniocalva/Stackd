import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-26 / BUG-27 / BUG-52 / BUG-74) — the transaction form side of the
// recurring-series fixes, through the real AddTransactionView and the real
// RecurringUpdateModal (formValidation.test.js harness):
//  - the End Date / interval / frequency are pre-filled from the SERIES
//    (Store.getSeriesSchedule), never the tapped member's stale copy;
//  - an untouched End Date on a series member never blocks a save;
//  - 'This and future' / 'All' moving a payment later keeps the series' payment
//    count up to its end (D-U3-5a), within the store's 60-month window;
//  - the Paid switch is sent only when flipped, and the scope sheet says what
//    happens to paid state (recUpdate.paidNote / rebuildPaidNote);
//  - an 'Only this' amount change on a loan-linked payment is marked.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let params = {};
let container;

const S = () => global.window.Store;
const $ = (id) => document.getElementById(id);
const accId = (name) => S().getState().accounts.find(a => a.name === name).id;

const boot = (accountNames = ['Main', 'Savings']) => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  container = $('router-view');
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn() },
    alert: vi.fn()
  };
  global.localStorage = global.window.localStorage;
  global.requestAnimationFrame = (cb) => cb();
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  S().init();
  accountNames.forEach(name => S().dispatch('ADD_ACCOUNT', { name, openingBalance: 5000, openingDate: '2026-01-01' }));
};

const renderEdit = (id) => {
  params = { id };
  const view = global.window.Views.AddTransactionView;
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};
const save = () => $('btn-save-tx').click();
const members = (sid) => S().getState().transactions
  .filter(t => t.recurrence && t.recurrence.seriesId === sid)
  .sort((a, b) => a.date.localeCompare(b.date));
const at = (sid, date) => members(sid).find(t => t.date === date);
const addSeries = ({ comment, amount, date, endDate, seriesId }) => {
  S().dispatch('ADD_TRANSACTION', {
    type: 'expense', amount, accountId: accId('Main'), categoryId: 'cat_rent', date, comment,
    recurrence: { interval: 1, frequency: 'months', endDate, ...(seriesId ? { seriesId } : {}) }
  });
  return S().getState().transactions.find(t => t.comment === comment && t.date === date).recurrence.seriesId;
};
const recOf = (tx, patch = {}) => ({
  seriesId: tx.recurrence.seriesId, interval: tx.recurrence.interval, frequency: tx.recurrence.frequency,
  endDate: tx.recurrence.endDate, ...patch
});
const en = (key) => global.window.I18n.dicts.en[key];

describe('Recurring series in the transaction form (1.0.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── BUG-26: the series' schedule ──────────────────────────────────────────
  describe('BUG-26', () => {
    it('pre-fills the series end, not a stale copy, and a future amount edit keeps 9 payments', () => {
      const sid = addSeries({ comment: 'StreamFlix', amount: 12.99, date: '2026-10-20', endDate: '2031-10-20' });
      const jan = at(sid, '2027-01-20');
      S().dispatch('UPDATE_TRANSACTION', {
        id: jan.id, amount: 12.99, date: jan.date, updateFuture: true, recurrence: recOf(jan, { endDate: '2027-06-30' })
      });
      expect(members(sid)).toHaveLength(9);
      at(sid, '2026-12-20').recurrence.endDate = '2031-10-20'; // a stale copy (no reboot)

      renderEdit(at(sid, '2026-12-20').id);
      expect($('tx-recurrence-end-date').value).toBe('2027-06-30');
      $('tx-amount').value = '13.99';
      save();
      $('ru-this-future').click();
      expect(members(sid)).toHaveLength(9);
      expect(at(sid, '2027-06-20').amount).toBe(13.99);
    });

    it('moving the one payment a deleteFuture kept is allowed with an untouched End Date', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      S().dispatch('DELETE_TRANSACTION', { id: at(sid, '2026-11-01').id, deleteFuture: true });
      expect(members(sid)).toHaveLength(1);

      renderEdit(at(sid, '2026-10-01').id);
      expect($('tx-recurrence-end-date').value).toBe('2026-10-01');
      $('tx-date').value = '2026-10-02';
      save();
      expect($('tx-recurrence-end-date-error')).toBeNull();
      expect($('recurring-update-modal')).not.toBeNull();
      $('ru-this-future').click();
      const m = members(sid);
      expect(m).toHaveLength(1);
      expect(m[0].date).toBe('2026-10-02');
      renderEdit(m[0].id);
      expect($('tx-recurrence-end-date').value).toBe('2026-10-02');
    });

    it('D-U3-5a: a stopped Rent moved from the 1st to the 5th keeps March to June, nothing after', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      S().dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-07-01').id, deleteFuture: true });
      renderEdit(at(sid, '2027-03-01').id);
      expect($('tx-recurrence-end-date').value).toBe('2027-06-01');
      $('tx-date').value = '2027-03-05';
      save();
      $('ru-this-future').click();
      const dates = members(sid).map(t => t.date);
      expect(dates.filter(d => d >= '2027-03-01')).toEqual(['2027-03-05', '2027-04-05', '2027-05-05', '2027-06-05']);
      expect(dates.filter(d => d >= '2027-07-01')).toEqual([]);
    });

    it("a last payment moved past the series end with 'Only this' stays editable", () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      renderEdit(at(sid, '2027-09-01').id);
      $('tx-date').value = '2027-09-06';
      save();
      expect($('tx-recurrence-end-date-error')).toBeNull();
      $('ru-only-this').click();
      expect(members(sid)).toHaveLength(12);
      expect(at(sid, '2027-09-06')).toBeTruthy();

      renderEdit(at(sid, '2027-09-06').id);
      $('tx-amount').value = '950';
      save();
      expect($('tx-recurrence-end-date-error')).toBeNull();
      expect($('recurring-update-modal')).not.toBeNull();
    });

    it('a changed End Date still refuses an end before the date (schedule changed)', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      renderEdit(at(sid, '2027-03-01').id);
      $('tx-recurrence-end-date').value = '2027-02-01';
      save();
      expect($('tx-recurrence-end-date-error')).not.toBeNull();
      expect($('recurring-update-modal')).toBeNull();
    });

    it("D-U3-2a: a changed End Date switches the 'Only this' subtitle, and 'Only this' keeps the schedule", () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      renderEdit(at(sid, '2027-03-01').id);
      $('tx-recurrence-end-date').value = '2027-05-01';
      save();
      expect($('ru-only-this').textContent).toContain(en('recUpdate.onlyThisSubSchedule'));
      $('ru-only-this').click();
      expect(members(sid)).toHaveLength(12);
      members(sid).forEach(t => expect(t.recurrence.endDate).toBe('2027-09-01'));
    });

    it("an untouched schedule keeps the usual 'Only this' subtitle", () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      renderEdit(at(sid, '2027-03-01').id);
      $('tx-amount').value = '950';
      save();
      expect($('ru-only-this').textContent).toContain(en('recUpdate.onlyThisSub'));
      expect($('ru-only-this').textContent).not.toContain(en('recUpdate.onlyThisSubSchedule'));
    });

    // review round 1 (spec-r1-U3-R1, regress-r1-U3-RV-1, spec-r1-U3-R2):
    // the D-U3-5a shift counts from the series END, so a payment 'Only this'
    // moved past the end never stretches a later 'This and future' rebuild.
    describe("D-U3-5a after a payment 'Only this' moved past the end", () => {
      const move = (sid, from, to, btn) => {
        renderEdit(at(sid, from).id);
        $('tx-date').value = to;
        save();
        expect($('tx-recurrence-end-date-error')).toBeNull();
        $(btn).click();
      };

      it('the last payment paid late (Sep 1 -> Oct 3), then Mar 1 -> Mar 5 future: 12 payments, nothing in October', () => {
        const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
        move(sid, '2027-09-01', '2027-10-03', 'ru-only-this');
        expect(members(sid)).toHaveLength(12);
        move(sid, '2027-03-01', '2027-03-05', 'ru-this-future');
        const m = members(sid);
        expect(m).toHaveLength(12);
        expect(m.filter(t => t.date >= '2027-10-01')).toEqual([]);
        expect(m[m.length - 1].date).toBe('2027-09-05');
        expect(S().getSeriesSchedule(sid).endDate).toBe('2027-09-05');
      });

      it('a mid payment moved to Aug 30, then Jan 20 -> Jan 25 future: the count holds, nothing after June', () => {
        const sid = addSeries({ comment: 'Gym', amount: 40, date: '2026-10-20', endDate: '2027-06-30' });
        move(sid, '2027-03-20', '2027-08-30', 'ru-only-this');
        expect(members(sid)).toHaveLength(9);
        expect(S().getSeriesSchedule(sid).endDate).toBe('2027-06-30');
        move(sid, '2027-01-20', '2027-01-25', 'ru-this-future');
        const m = members(sid);
        expect(m).toHaveLength(9);
        expect(m.filter(t => t.date > '2027-06-30')).toEqual([]);
        expect(m.filter(t => t.date >= '2027-01-01').map(t => t.date)).toEqual(
          ['2027-01-25', '2027-02-25', '2027-03-25', '2027-04-25', '2027-05-25', '2027-06-25']);
      });

      it('a stopped series: its last payment moved into July keeps the end; a later future move never brings July back', () => {
        const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
        S().dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-07-01').id, deleteFuture: true });
        expect(members(sid)).toHaveLength(9);
        move(sid, '2027-06-01', '2027-07-02', 'ru-only-this');
        members(sid).forEach(t => expect(t.recurrence.endDate).toBe('2027-06-01'));
        renderEdit(at(sid, '2027-03-01').id);
        expect($('tx-recurrence-end-date').value).toBe('2027-06-01');
        move(sid, '2027-03-01', '2027-03-05', 'ru-this-future');
        const m = members(sid);
        expect(m).toHaveLength(9);
        expect(m.filter(t => t.date >= '2027-07-01')).toEqual([]);
        expect(m.filter(t => t.date >= '2027-03-01').map(t => t.date)).toEqual(
          ['2027-03-05', '2027-04-05', '2027-05-05', '2027-06-05']);
      });

      // review round 2 (recheck-r2-rc2-U3-1): the shift counts payment SLOTS,
      // so an End Date between payment days never gains a payment after it.
      it('End Date off a payment day: Jan 1 -> Jan 15 future keeps the end, then Jan 15 -> Jan 10 future keeps 6 payments', () => {
        const sid = addSeries({ comment: 'Gym', amount: 40, date: '2027-01-01', endDate: '2027-06-30' });
        expect(members(sid)).toHaveLength(6);
        move(sid, '2027-01-01', '2027-01-15', 'ru-this-future');
        expect(members(sid).map(t => t.date)).toEqual(
          ['2027-01-15', '2027-02-15', '2027-03-15', '2027-04-15', '2027-05-15', '2027-06-15']);
        expect(S().getSeriesSchedule(sid).endDate).toBe('2027-06-30');
        renderEdit(at(sid, '2027-01-15').id);
        expect($('tx-recurrence-end-date').value).toBe('2027-06-30');
        move(sid, '2027-01-15', '2027-01-10', 'ru-this-future');
        expect(members(sid).map(t => t.date)).toEqual(
          ['2027-01-10', '2027-02-10', '2027-03-10', '2027-04-10', '2027-05-10', '2027-06-10']);
        expect(S().getSeriesSchedule(sid).endDate).toBe('2027-06-30');
      });

      ['ru-this-future', 'ru-all-series'].forEach(btn => {
        it(`End Date off a payment day: Jan 1 -> Jan 29 (${btn}) keeps 6 payments, nothing in July`, () => {
          const sid = addSeries({ comment: 'Gym', amount: 40, date: '2027-01-01', endDate: '2027-06-30' });
          move(sid, '2027-01-01', '2027-01-29', btn);
          const m = members(sid);
          expect(m).toHaveLength(6);
          expect(m[0].date).toBe('2027-01-29');
          expect(m.filter(t => t.date > '2027-06-30')).toEqual([]);
          expect(S().getSeriesSchedule(sid).endDate).toBe('2027-06-30');
        });
      });

      it('End Date off a payment day: Jan 1 -> Jan 31 future keeps 6 payments', () => {
        const sid = addSeries({ comment: 'Gym', amount: 40, date: '2027-01-01', endDate: '2027-06-30' });
        move(sid, '2027-01-01', '2027-01-31', 'ru-this-future');
        const m = members(sid);
        expect(m).toHaveLength(6);
        expect(m.filter(t => t.date > '2027-06-30')).toEqual([]);
      });

      it('a stopped series: a mid payment moved to August, then Apr 1 -> Apr 3 future: nothing past June', () => {
        const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
        S().dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-07-01').id, deleteFuture: true });
        move(sid, '2027-03-01', '2027-08-15', 'ru-only-this');
        renderEdit(at(sid, '2027-04-01').id);
        expect($('tx-recurrence-end-date').value).toBe('2027-06-01');
        move(sid, '2027-04-01', '2027-04-03', 'ru-this-future');
        const m = members(sid);
        expect(m.length).toBeLessThanOrEqual(9);
        expect(m.filter(t => t.date > '2027-06-03')).toEqual([]);
      });
    });

    it('regress-r1-U3-RV-2: an End Date past the 5-year cap that clamps back is no schedule change (no rebuild note)', () => {
      const sid = addSeries({ comment: 'StreamFlix', amount: 12.99, date: '2026-10-20', endDate: '2031-10-20' });
      S().dispatch('TOGGLE_TRANSACTION_PAID', { id: at(sid, '2026-12-20').id });
      renderEdit(at(sid, '2026-11-20').id);
      $('tx-amount').value = '13.99';
      $('tx-recurrence-end-date').value = '2032-10-20';
      save();
      expect($('ru-paid-note')).toBeNull();
      expect($('ru-only-this').textContent).not.toContain(en('recUpdate.onlyThisSubSchedule'));
      $('ru-this-future').click();
      expect(members(sid)).toHaveLength(61);
      expect(at(sid, '2026-12-20').isPaid).toBe(false);
    });

    describe('guard: the accepted 60-month limit', () => {
      it('a move across a month boundary at the cap drops the last payment', () => {
        const sid = addSeries({ comment: 'StreamFlix', amount: 12.99, date: '2026-10-20', endDate: '2031-10-20' });
        expect(members(sid)).toHaveLength(61);
        renderEdit(at(sid, '2027-01-20').id);
        $('tx-date').value = '2027-02-02';
        save();
        $('ru-this-future').click();
        const m = members(sid);
        expect(m).toHaveLength(60);
        expect(m[m.length - 1].date).toBe('2031-10-02');
      });

      it('a move within the month keeps all 61', () => {
        const sid = addSeries({ comment: 'StreamFlix', amount: 12.99, date: '2026-10-20', endDate: '2031-10-20' });
        renderEdit(at(sid, '2027-01-20').id);
        $('tx-date').value = '2027-01-25';
        save();
        $('ru-this-future').click();
        const m = members(sid);
        expect(m).toHaveLength(61);
        expect(m[m.length - 1].date).toBe('2031-10-25');
      });
    });
  });

  // ── BUG-27: paid state per payment ────────────────────────────────────────
  describe('BUG-27', () => {
    const rentWithUnpaidDec = () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-11-01', endDate: '2027-10-01' });
      S().dispatch('TOGGLE_TRANSACTION_PAID', { id: at(sid, '2026-12-01').id });
      return sid;
    };

    it("an amount edit with 'All' on an unpaid payment sends no isPaid and un-pays nothing else", () => {
      const sid = rentWithUnpaidDec();
      const spy = vi.spyOn(S(), 'dispatch');
      renderEdit(at(sid, '2026-12-01').id);
      expect($('tx-is-paid').checked).toBe(false);
      $('tx-amount').value = '950';
      save();
      $('ru-all-series').click();
      const call = spy.mock.calls.find(([a]) => a === 'UPDATE_TRANSACTION');
      expect(call).toBeTruthy();
      expect('isPaid' in call[1]).toBe(false);
      expect(at(sid, '2026-12-01').isPaid).toBe(false);
      expect(at(sid, '2026-11-01').isPaid).not.toBe(false);
      expect(members(sid).filter(t => t.isPaid === false)).toHaveLength(1);
    });

    it('a Paid flip alone: the sheet says it changes this transaction only', () => {
      const sid = rentWithUnpaidDec();
      renderEdit(at(sid, '2027-02-01').id);
      $('tx-is-paid').checked = false;
      save();
      const note = $('ru-paid-note');
      expect(note).not.toBeNull();
      expect(note.textContent).toBe(en('recUpdate.paidNote'));
      $('ru-this-future').click();
      expect(at(sid, '2027-02-01').isPaid).toBe(false);
      expect(members(sid).filter(t => t.isPaid === false).map(t => t.date)).toEqual(['2026-12-01', '2027-02-01']);
    });

    it('a Paid flip with a date change: the sheet says rebuilt payments start paid', () => {
      const sid = rentWithUnpaidDec();
      renderEdit(at(sid, '2027-02-01').id);
      $('tx-is-paid').checked = false;
      $('tx-date').value = '2027-02-03';
      save();
      expect($('ru-paid-note')).not.toBeNull();
      expect($('ru-paid-note').textContent).toBe(en('recUpdate.rebuildPaidNote'));
    });

    it('an untouched switch with a date change and a later unpaid payment: the rebuild note', () => {
      const sid = rentWithUnpaidDec();
      renderEdit(at(sid, '2026-11-01').id);
      $('tx-date').value = '2026-11-03';
      save();
      expect($('ru-paid-note')).not.toBeNull();
      expect($('ru-paid-note').textContent).toBe(en('recUpdate.rebuildPaidNote'));
    });

    it('an untouched switch with an amount-only edit: no note', () => {
      const sid = rentWithUnpaidDec();
      renderEdit(at(sid, '2026-11-01').id);
      $('tx-amount').value = '950';
      save();
      expect($('recurring-update-modal')).not.toBeNull();
      expect($('ru-paid-note')).toBeNull();
    });

    it('guard: an unpaid one-off converted to a transfer with the switch untouched stays unpaid on both legs', () => {
      S().dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 30, accountId: accId('Main'), categoryId: 'cat_groceries',
        date: '2026-10-10', comment: 'One-off', isPaid: false
      });
      const tx = S().getState().transactions.find(t => t.comment === 'One-off');
      renderEdit(tx.id);
      expect($('tx-is-paid').checked).toBe(false);
      $('toggle-transfer').click();
      $('tx-transfer-to').value = accId('Savings');
      save();
      const legs = S().getState().transactions.filter(t => t.transferRef);
      expect(legs).toHaveLength(2);
      legs.forEach(t => expect(t.isPaid).toBe(false));
    });
  });

  // ── BUG-74: the hand-edit mark from the form ──────────────────────────────
  describe('BUG-74', () => {
    const KITCHEN = {
      type: 'personal', principal: 6000, duration: 24, durationUnit: 'months',
      annualRate: 5, firstPaymentDate: '2026-08-01', amortization: 'french',
      rateChanges: [], earlyRepayments: [], additionalExpenses: []
    };

    it("an 'Only this' amount change on a loan-linked payment marks it", () => {
      S().dispatch('ADD_LOAN', { name: 'Kitchen', kind: 'active', config: KITCHEN });
      const loan = S().getState().loans[0];
      S().dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId: 'series-1' });
      const end = global.window.LoanEngine.simulate({ ...KITCHEN, computeSavings: false }).lastPaymentDate;
      addSeries({ comment: 'Kitchen', amount: 263.23, date: '2026-08-01', endDate: end, seriesId: 'series-1' });
      renderEdit(at('series-1', '2026-12-01').id);
      $('tx-amount').value = '300';
      save();
      $('ru-only-this').click();
      expect(at('series-1', '2026-12-01').amount).toBe(300);
      expect(at('series-1', '2026-12-01').amountEdited).toBe(true);
      expect(members('series-1').filter(t => t.amountEdited)).toHaveLength(1);
    });

    it('the same edit on a series no loan links sets nothing', () => {
      const sid = addSeries({ comment: 'Rent', amount: 900, date: '2026-10-01', endDate: '2027-09-01' });
      renderEdit(at(sid, '2026-12-01').id);
      $('tx-amount').value = '950';
      save();
      $('ru-only-this').click();
      expect(at(sid, '2026-12-01').amount).toBe(950);
      expect('amountEdited' in at(sid, '2026-12-01')).toBe(false);
    });
  });
});
