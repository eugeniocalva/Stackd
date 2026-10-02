import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.1 (BUG-06, BUG-07, BUG-15, BUG-16, BUG-17): a tracked loan and its linked
// recurring series. Deleting / editing the loan now reaches its payments, an
// instalment due today is trackable, the 60-month cap copy names its real end
// date, and the series' last member carries the schedule's final amount.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const pin = (y, m, d) => vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
const cents = (amount) => Math.round(Number(amount) * 100);

const KITCHEN = { // the report's Kitchen Loan: 6,000 @ 5% / 2 years
  type: 'personal', principal: 6000, duration: 24, durationUnit: 'months',
  annualRate: 5, firstPaymentDate: '2026-08-01', amortization: 'french',
  rateChanges: [], earlyRepayments: [], additionalExpenses: []
};

describe('Loan ↔ linked payments (1.0.1)', () => {
  let Store;
  let accountId;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    pin(2026, 10, 15);
    document.body.innerHTML = '<div id="modal-container"></div>';
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      StackdHydrateIcons: vi.fn(),
      location: { hash: '#debt' }
    };
    global.localStorage = global.window.localStorage;

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    executeFile('router.js');

    Store = global.window.Store;
    Store.init();
    global.window.Views._DebtShared.draft = null;
    Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 50000 });
    accountId = Store.getState().accounts[0].id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const addLoan = (config, name = 'Kitchen Loan', kind = 'active') => {
    Store.dispatch('ADD_LOAN', { name, kind, config });
    const loans = Store.getState().loans;
    return loans[loans.length - 1];
  };
  const loanById = (id) => Store.getState().loans.find(l => l.id === id);
  const track = (loan, { amount, date, endDate, seriesId = 'series-1' }) => {
    Store.dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId });
    Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount, accountId, categoryId: 'cat_debt', date,
      recurrence: { seriesId, interval: 1, frequency: 'months', endDate }
    });
    return loanById(loan.id);
  };
  const members = (seriesId = 'series-1') => Store.getState().transactions
    .filter(t => t.recurrence && t.recurrence.seriesId === seriesId)
    .sort((a, b) => a.date.localeCompare(b.date));
  const armed = (seriesId = 'series-1') => members(seriesId).filter(t => t.recurrence.nextDate);
  const sim = (config) => global.window.LoanEngine.simulate({ ...config, computeSavings: false });

  // ── BUG-15 ────────────────────────────────────────────────────────────────
  describe('BUG-15: an instalment due today is trackable', () => {
    it('arms today\'s row while progress still counts it as paid', () => {
      const cal = addLoan({
        type: 'mortgage', principal: 111000, duration: 30, durationUnit: 'years',
        annualRate: 4.05, firstPaymentDate: '2026-09-06', amortization: 'french'
      }, 'Mutuo');
      const p = Store.getLoanProgress(cal, '2026-09-06');
      expect(p.paidCount).toBe(1);
      expect(p.nextPayment.date).toBe('2026-10-06');
      expect(p.nextRegularPayment.date).toBe('2026-09-06');
    });

    it('prefills tracking from today when the first payment is today', () => {
      pin(2026, 10, 1);
      const loan = addLoan({
        type: 'personal', principal: 10000, duration: 24, durationUnit: 'months',
        annualRate: 4.5, firstPaymentDate: '2026-10-01', amortization: 'french'
      });
      const S = global.window.Views._DebtShared;
      expect(S.trackablePayment(Store.getLoanProgress(loan)).date).toBe('2026-10-01');
      delete global.window._draftTxFormState;
      S.startRecurringPrefill(loan);
      expect(global.window._draftTxFormState.date).toBe('2026-10-01');
      expect(global.window._draftTxFormState.amount).toBe('436.48');
    });

    it('starts next month once the payment day has passed', () => {
      pin(2026, 10, 2);
      const loan = addLoan({
        type: 'personal', principal: 10000, duration: 24, durationUnit: 'months',
        annualRate: 4.5, firstPaymentDate: '2026-10-01', amortization: 'french'
      });
      const S = global.window.Views._DebtShared;
      expect(S.trackablePayment(Store.getLoanProgress(loan)).date).toBe('2026-11-01');
    });

    it('offers nothing on a loan\'s final payment day (already paid off)', () => {
      pin(2026, 10, 1);
      const loan = addLoan({
        type: 'personal', principal: 900, duration: 3, durationUnit: 'months',
        annualRate: 3, firstPaymentDate: '2026-08-01', amortization: 'french'
      });
      const p = Store.getLoanProgress(loan);
      expect(p.isPaidOff).toBe(true);
      expect(global.window.Views._DebtShared.trackablePayment(p)).toBeNull();
      global.window.location.hash = `#debt-results?id=${loan.id}`;
      const html = global.window.Views.DebtResultsView.render(Store.getState());
      expect(html).not.toContain('btn-dres-track');
    });
  });

  // ── BUG-17 ────────────────────────────────────────────────────────────────
  describe('BUG-17: the last linked payment carries the final instalment', () => {
    const CAR = {
      type: 'personal', principal: 16000, duration: 48, durationUnit: 'months',
      annualRate: 4, firstPaymentDate: '2026-11-01', amortization: 'french'
    };

    it('stamps the tail so the series sums to the schedule, cent-exact', () => {
      const loan = addLoan(CAR, 'Car Loan');
      const p = Store.getLoanProgress(loan);
      const s = p.simulation.schedule;
      const regular = p.nextRegularPayment.amountC;
      const finalC = s[s.length - 1].paymentC + s[s.length - 1].extraPrincipalC;
      expect(finalC).not.toBe(regular);
      track(loan, { amount: regular / 100, date: p.nextRegularPayment.date, endDate: p.lastPaymentDate });

      const m = members();
      expect(m.length).toBe(48);
      expect(cents(m[m.length - 1].amount)).toBe(finalC);
      m.slice(0, -1).forEach(t => expect(cents(t.amount)).toBe(regular));
      const sumMembers = m.reduce((acc, t) => acc + cents(t.amount), 0);
      const sumSchedule = s.reduce((acc, r) => acc + r.paymentC + r.extraPrincipalC, 0);
      expect(sumMembers).toBe(sumSchedule);
      expect(armed().length).toBe(1);
    });

    it('leaves a series capped by the 60-month window alone (61 regular members)', () => {
      const loan = addLoan({
        type: 'mortgage', principal: 200000, duration: 20, durationUnit: 'years',
        annualRate: 3.5, firstPaymentDate: '2026-11-01', amortization: 'french'
      }, 'Home');
      const p = Store.getLoanProgress(loan);
      track(loan, { amount: p.nextRegularPayment.amountC / 100, date: p.nextRegularPayment.date, endDate: p.lastPaymentDate });
      const m = members();
      expect(m.length).toBe(61);
      m.forEach(t => expect(cents(t.amount)).toBe(p.nextRegularPayment.amountC));
    });

    it('leaves a custom amount alone', () => {
      const loan = addLoan(CAR, 'Car Loan');
      const p = Store.getLoanProgress(loan);
      track(loan, { amount: 500, date: p.nextRegularPayment.date, endDate: p.lastPaymentDate });
      members().forEach(t => expect(Number(t.amount)).toBe(500));
    });

    it('leaves a loan whose instalment varies (Italian) alone', () => {
      const loan = addLoan({ ...CAR, amortization: 'italian' }, 'Italian');
      const p = Store.getLoanProgress(loan);
      const amount = p.nextRegularPayment.amountC / 100;
      track(loan, { amount, date: p.nextRegularPayment.date, endDate: p.lastPaymentDate });
      members().forEach(t => expect(Number(t.amount)).toBe(amount));
    });
  });

  // ── BUG-06 ────────────────────────────────────────────────────────────────
  describe('BUG-06: deleting a tracked loan can take its future payments', () => {
    const trackKitchen = () => {
      const loan = addLoan(KITCHEN);
      return track(loan, { amount: 263.23, date: '2026-08-01', endDate: sim(KITCHEN).lastPaymentDate });
    };

    it('lists future payments only for tracked loans, after today, once per occurrence', () => {
      const untracked = addLoan(KITCHEN, 'Untracked');
      const simLoan = addLoan(KITCHEN, 'Sim', 'sim');
      expect(Store.getLoanFuturePayments(untracked)).toEqual([]);
      expect(Store.getLoanFuturePayments(simLoan)).toEqual([]);

      const loan = trackKitchen();
      const fut = Store.getLoanFuturePayments(loan);
      expect(members().length).toBe(24);
      expect(fut.length).toBe(members().filter(t => t.date > '2026-10-15').length);
      expect(fut.every(t => t.date > '2026-10-15')).toBe(true);
      expect(fut[0].date).toBe('2026-11-01');

      // a recurring transfer pair counts once
      Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
      const savingsId = Store.getState().accounts.find(a => a.name === 'Savings').id;
      Store.dispatch('ADD_TRANSFER', {
        amount: 100, expenseAccountId: accountId, incomeAccountId: savingsId, date: '2026-11-05', note: 'x',
        recurrence: { seriesId: 'series-tr', interval: 1, frequency: 'months', endDate: '2027-02-05' }
      });
      Store.dispatch('UPDATE_LOAN', { id: untracked.id, linkedSeriesId: 'series-tr' });
      const trFuture = Store.getLoanFuturePayments(loanById(untracked.id));
      expect(trFuture.length).toBe(4);
      expect(trFuture.every(t => t.type === 'expense')).toBe(true);
    });

    it('keeps every payment when the box is unticked (no flag)', () => {
      const loan = trackKitchen();
      const before = members().length;
      Store.dispatch('DELETE_LOAN', { id: loan.id });
      expect(Store.getState().loans.find(l => l.id === loan.id)).toBeUndefined();
      expect(members().length).toBe(before);
    });

    it('deletes only the payments after today, leaves nothing armed, and nothing comes back', () => {
      const loan = trackKitchen();
      const past = members().filter(t => t.date <= '2026-10-15').map(t => t.id);
      expect(past.length).toBe(3);
      Store.dispatch('DELETE_LOAN', { id: loan.id, deleteFuturePayments: true });
      expect(Store.getState().loans.find(l => l.id === loan.id)).toBeUndefined();
      expect(members().map(t => t.id)).toEqual(past);
      expect(armed().length).toBe(0);

      // an unrelated save runs the generation pass: nothing is resurrected
      Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 5, accountId, categoryId: 'cat_groceries', date: '2026-10-15'
      });
      expect(members().map(t => t.id)).toEqual(past);
    });

    it('disarms a stray armed past member too (one-armed-tail poison)', () => {
      const loan = trackKitchen();
      const first = members()[0];
      first.recurrence = { ...first.recurrence, nextDate: '2026-09-01' };
      Store.dispatch('DELETE_LOAN', { id: loan.id, deleteFuturePayments: true });
      expect(armed().length).toBe(0);
      Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 5, accountId, categoryId: 'cat_groceries', date: '2026-10-15'
      });
      expect(members().length).toBe(3);
    });

    it('the delete sheet shows a ticked checkbox and honours it', () => {
      const loan = trackKitchen();
      global.window.location.hash = `#debt-results?id=${loan.id}`;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const state = Store.getState();
      container.innerHTML = global.window.Views.DebtResultsView.render(state);
      global.window.Views.DebtResultsView.attachEvents(container, state);

      container.querySelector('#btn-dres-menu').click();
      document.querySelector('.dres-menu-opt[data-act="delete"]').click();
      const cb = document.getElementById('dres-delete-future');
      expect(cb).not.toBeNull();
      expect(cb.checked).toBe(true);
      expect(document.querySelector('.modal-body').textContent).toContain('Also delete its 21 upcoming payments');
      expect(document.querySelector('.modal-body').textContent).toContain('Payments up to today stay in your history.');

      document.getElementById('modal-delete-btn').click();
      expect(Store.getState().loans.find(l => l.id === loan.id)).toBeUndefined();
      expect(members().length).toBe(3);
    });

    it('an untracked loan\'s delete sheet has no checkbox', () => {
      const loan = addLoan(KITCHEN);
      global.window.location.hash = `#debt-results?id=${loan.id}`;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const state = Store.getState();
      container.innerHTML = global.window.Views.DebtResultsView.render(state);
      global.window.Views.DebtResultsView.attachEvents(container, state);
      container.querySelector('#btn-dres-menu').click();
      document.querySelector('.dres-menu-opt[data-act="delete"]').click();
      expect(document.getElementById('dres-delete-future')).toBeNull();
      document.getElementById('modal-delete-btn').click();
      expect(Store.getState().loans.length).toBe(0);
    });
  });

  // ── BUG-07 ────────────────────────────────────────────────────────────────
  describe('BUG-07: editing an active loan offers to sync its payments', () => {
    const trackKitchen = () => {
      const loan = addLoan(KITCHEN);
      return track(loan, { amount: 263.23, date: '2026-08-01', endDate: sim(KITCHEN).lastPaymentDate });
    };
    const edit = (loan, config, name) => {
      const prevConfig = loanById(loan.id).config;
      Store.dispatch('UPDATE_LOAN', { id: loan.id, name: name || loan.name, config });
      return prevConfig;
    };

    it('a name-only edit proposes nothing', () => {
      const loan = trackKitchen();
      const prev = edit(loan, { ...KITCHEN }, 'Renamed');
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
      // same terms, different key order / shape: still nothing
      const reordered = { amortization: 'french', firstPaymentDate: '2026-08-01', annualRate: 5, durationUnit: 'months', duration: 24, principal: 6000, type: 'personal' };
      const prev2 = edit(loan, reordered);
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev2)).toBeNull();
    });

    it('an Italian loan edited by name months later proposes nothing', () => {
      const cfg = { ...KITCHEN, amortization: 'italian' };
      const loan = addLoan(cfg, 'Italian');
      const firstRow = sim(cfg).schedule.find(r => r.index >= 1);
      track(loan, { amount: firstRow.paymentC / 100, date: '2026-08-01', endDate: sim(cfg).lastPaymentDate });
      const prev = edit(loan, { ...cfg }, 'Italian renamed');
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });

    it('5% → 9% updates every future payment to 274.11 with a 274.08 tail; the past is untouched', () => {
      const loan = trackKitchen();
      const before = members();
      const futureCount = before.filter(t => t.date > '2026-10-15').length;
      const prev = edit(loan, { ...KITCHEN, annualRate: 9 });
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      const firstFuture = before.find(t => t.date > '2026-10-15');
      expect(plan).toEqual({ mode: 'update', firstId: firstFuture.id, count: futureCount, amountC: 27411, varies: false, endDate: null, firstDate: firstFuture.date, keepCount: futureCount,
        loanEnd: global.window.LoanEngine.simulate({ ...KITCHEN, annualRate: 9, computeSavings: false }).lastPaymentDate });

      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      const after = members();
      expect(after.length).toBe(before.length);
      const fut = after.filter(t => t.date > '2026-10-15');
      fut.slice(0, -1).forEach(t => expect(cents(t.amount)).toBe(27411));
      expect(cents(fut[fut.length - 1].amount)).toBe(27408);
      after.filter(t => t.date <= '2026-10-15').forEach(t => expect(cents(t.amount)).toBe(26323));
      expect(armed().length).toBe(1);
      // nothing left to sync
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });

    it('a reduceDuration early repayment shortens the series to the new end', () => {
      const loan = trackKitchen();
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2026-12-01', mode: 'reduceDuration' }] };
      const newEnd = sim(cfg).lastPaymentDate;
      expect(newEnd < sim(KITCHEN).lastPaymentDate).toBe(true);
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.mode).toBe('update');
      expect(plan.endDate).toBe(newEnd);

      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      const m = members();
      expect(m.every(t => t.date <= newEnd)).toBe(true);
      expect(m[m.length - 1].date.slice(0, 7)).toBe(newEnd.slice(0, 7));
      // past members are never touched by any scope; the regenerated future follows the loan
      expect(m.filter(t => t.date > '2026-10-15').every(t => t.recurrence.endDate === newEnd)).toBe(true);
      expect(armed().length).toBe(1);
      expect(m.filter(t => t.date <= '2026-10-15').length).toBe(3);
    });

    it('a pay-off edit offers to delete the future payments ("finish")', () => {
      const loan = trackKitchen();
      // pays the whole balance before the next linked payment
      const cfg = { ...KITCHEN, duration: 3 };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.mode).toBe('finish');
      expect(plan.count).toBe(21);
      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      expect(members().length).toBe(3);
      expect(armed().length).toBe(0);
    });

    it('a deliberately shorter series is not stretched to the loan end', () => {
      const loan = addLoan(KITCHEN);
      track(loan, { amount: 263.23, date: '2026-08-01', endDate: '2027-07-01' });
      const prev = edit(loan, { ...KITCHEN, duration: 36 });
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.mode).toBe('update');
      expect(plan.endDate).toBeNull();
      expect(plan.amountC).toBe(sim({ ...KITCHEN, duration: 36 }).schedule[3].paymentC);
    });

    it('active loans get Save Changes and an Edit Loan title', () => {
      const loan = trackKitchen();
      global.window.location.hash = '#debt-results';
      Store.dispatch('SET_DEBT_SIM', { config: { ...KITCHEN, annualRate: 9 }, fromForm: true, editingLoanId: loan.id });
      const html = global.window.Views.DebtResultsView.render(Store.getState());
      expect(html).toContain('Save Changes');
      expect(html).toContain('btn-dres-save');
      expect(html).not.toContain('btn-dres-promote');
      expect(html).not.toContain('Update Simulation');

      global.window.location.hash = `#debt-sim?id=${loan.id}`;
      const form = global.window.Views.DebtSimView.render(Store.getState());
      expect(form).toContain('Edit Loan');
      expect(form).not.toContain('Edit Simulation');
    });

    it('Save Changes prompts for the sync, and accepting it updates the payments', async () => {
      const loan = trackKitchen();
      global.window.location.hash = '#debt-results';
      Store.dispatch('SET_DEBT_SIM', { config: { ...KITCHEN, annualRate: 9 }, fromForm: true, editingLoanId: loan.id });
      const container = document.createElement('div');
      document.body.appendChild(container);
      const state = Store.getState();
      container.innerHTML = global.window.Views.DebtResultsView.render(state);
      global.window.Views.DebtResultsView.attachEvents(container, state);

      container.querySelector('#btn-dres-save').click();
      expect(document.getElementById('modal-title').textContent).toBe('Save Changes');
      document.getElementById('modal-save-btn').click(); // keep the name
      expect(loanById(loan.id).config.annualRate).toBe(9);

      await new Promise(r => setTimeout(r, 120)); // the 60ms hand-off
      expect(document.getElementById('modal-title').textContent).toBe('Update linked payments?');
      expect(document.querySelector('.modal-body').textContent).toContain('$274.11');
      expect(document.querySelector('.modal-body').textContent).toContain('21 upcoming payments');
      document.getElementById('modal-save-btn').click();
      const fut = members().filter(t => t.date > '2026-10-15');
      expect(cents(fut[0].amount)).toBe(27411);
    });
  });

  // ── BUG-16 ────────────────────────────────────────────────────────────────
  describe('BUG-16: the cap note names the date the series stops at', () => {
    const offerBody = (config) => {
      const loan = addLoan(config, 'Home');
      global.window.Views._DebtShared.offerRecurringExpense(loan);
      return document.querySelector('.modal-body').textContent;
    };
    const monthly = (n) => ({
      type: 'mortgage', principal: 100000, duration: n, durationUnit: 'months',
      annualRate: 3, firstPaymentDate: '2026-11-01', amortization: 'french'
    });

    it('a 20-year mortgage says payments are created up to 01/11/31', () => {
      pin(2026, 9, 15);
      const body = offerBody({ ...monthly(240), duration: 20, durationUnit: 'years' });
      expect(body).toContain('payments will only be created up to 01/11/31');
      expect(body).not.toContain('first 60 payments');
    });

    it('61 remaining instalments fit (no note); 62 do not', () => {
      pin(2026, 9, 15);
      expect(offerBody(monthly(61))).not.toContain('capped at 5 years');
      expect(offerBody(monthly(62))).toContain('capped at 5 years');
    });
  });
});
