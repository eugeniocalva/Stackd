import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.1 review fixes (loans): the BUG-02/06/07/20 follow-ups on a tracked
// loan's linked series —
//  (a) a series another loan also claims is never deleted/rewritten per loan;
//  (b) a one-off early repayment is never proposed as the regular payment;
//  (c) a change that starts in a later month (rate change, reducePayment)
//      still prompts, anchored at the first member that differs;
//  (d) a 60-month-capped series end is not presented as the loan's end;
//  (e) the end-date note has a singular form;
//  (f) the "Delete Payments" confirm is styled as destructive.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const pin = (y, m, d) => vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
const cents = (amount) => Math.round(Number(amount) * 100);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const KITCHEN = { // 6,000 @ 5% / 2 years, tracked at 263.23
  type: 'personal', principal: 6000, duration: 24, durationUnit: 'months',
  annualRate: 5, firstPaymentDate: '2026-08-01', amortization: 'french',
  rateChanges: [], earlyRepayments: [], additionalExpenses: []
};

describe('Loan series sync — 1.0.1 review fixes', () => {
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

  const sim = (config) => global.window.LoanEngine.simulate({ ...config, computeSavings: false });
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
  const future = (today = '2026-10-15') => members().filter(t => t.date > today);
  const trackKitchen = () => {
    const loan = addLoan(KITCHEN);
    return track(loan, { amount: 263.23, date: '2026-08-01', endDate: sim(KITCHEN).lastPaymentDate });
  };
  const edit = (loan, config) => {
    const prevConfig = loanById(loan.id).config;
    Store.dispatch('UPDATE_LOAN', { id: loan.id, name: loan.name, config });
    return prevConfig;
  };
  const openSyncSheet = async (loanId, prevConfig) => {
    global.window.Views.DebtResultsView._offerSeriesSync(loanId, prevConfig);
    await wait(120); // the 60ms hand-off
    return document.querySelector('.modal-body').textContent.replace(/\s+/g, ' ');
  };

  // ── (a) shared series ─────────────────────────────────────────────────────
  describe('a series another loan also claims (BUG-02 defensive layer)', () => {
    const duplicate = () => {
      const original = trackKitchen();
      const dup = addLoan(KITCHEN, 'Kitchen Loan (re-imported)');
      Store.dispatch('UPDATE_LOAN', { id: dup.id, linkedSeriesId: original.linkedSeriesId });
      return { original: loanById(original.id), dup: loanById(dup.id) };
    };

    it('no loan sees the shared series as its own future payments', () => {
      const { original, dup } = duplicate();
      expect(original.linkedSeriesId).toBe('series-1');
      expect(dup.linkedSeriesId).toBe('series-1');
      expect(Store.getLoanFuturePayments(original)).toEqual([]);
      expect(Store.getLoanFuturePayments(dup)).toEqual([]);
    });

    it('deleting the duplicate with deleteFuturePayments keeps the original\'s payments', () => {
      const { original, dup } = duplicate();
      const before = members().map(t => t.id);
      expect(future().length).toBe(21);
      Store.dispatch('DELETE_LOAN', { id: dup.id, deleteFuturePayments: true });
      expect(loanById(dup.id)).toBeUndefined();
      expect(members().map(t => t.id)).toEqual(before);
      expect(armed().length).toBe(1);
      // the surviving loan owns its series again
      expect(Store.getLoanFuturePayments(loanById(original.id)).length).toBe(21);
    });

    it('the duplicate\'s delete sheet offers no payment checkbox', () => {
      const { dup } = duplicate();
      global.window.location.hash = `#debt-results?id=${dup.id}`;
      const container = document.createElement('div');
      document.body.appendChild(container);
      const state = Store.getState();
      container.innerHTML = global.window.Views.DebtResultsView.render(state);
      global.window.Views.DebtResultsView.attachEvents(container, state);
      container.querySelector('#btn-dres-menu').click();
      document.querySelector('.dres-menu-opt[data-act="delete"]').click();
      expect(document.getElementById('dres-delete-future')).toBeNull();
      const before = members().length;
      document.getElementById('modal-delete-btn').click();
      expect(loanById(dup.id)).toBeUndefined();
      expect(members().length).toBe(before);
    });

    it('editing either loan\'s terms proposes no sync and SYNC_LOAN_SERIES changes nothing', () => {
      const { dup } = duplicate();
      const prev = edit(dup, { ...KITCHEN, annualRate: 9 });
      expect(Store.getLoanSeriesSyncPlan(loanById(dup.id), prev)).toBeNull();
      const amounts = members().map(t => cents(t.amount));
      Store.dispatch('SYNC_LOAN_SERIES', { id: dup.id, prevConfig: prev });
      expect(members().map(t => cents(t.amount))).toEqual(amounts);
    });
  });

  // ── (b) one-off early repayments ──────────────────────────────────────────
  describe('a one-off early repayment is not the regular payment', () => {
    it('a once repayment in the first future month proposes only the new end', () => {
      const loan = trackKitchen();
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2026-11-01', mode: 'reduceDuration' }] };
      const s = sim(cfg);
      const novRow = s.schedule.find(r => r.date === '2026-11-01');
      expect(novRow.extraPrincipalC).toBe(200000); // the lump sum lands in that row
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.mode).toBe('update');
      expect(plan.amountC).toBeNull();
      expect(plan.endDate).toBe(s.lastPaymentDate);

      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      const fut = future();
      expect(fut.length).toBeGreaterThan(1);
      fut.slice(0, -1).forEach(t => expect(cents(t.amount)).toBe(26323));
      // BUG-17's tail stamp still applies: the series sums to the regular schedule
      const last = s.schedule[s.schedule.length - 1];
      expect(cents(fut[fut.length - 1].amount)).toBe(last.paymentC);
      expect(fut.every(t => cents(t.amount) <= 26323)).toBe(true);
      expect(armed().length).toBe(1);
    });

    it('the sheet never quotes the lump sum as the regular payment', async () => {
      const loan = trackKitchen();
      const prev = edit(loan, { ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2026-11-01', mode: 'reduceDuration' }] });
      const text = await openSyncSheet(loan.id, prev);
      expect(text).not.toContain('2,263.23');
      expect(text).toContain('The loan now ends on');
    });

    it('a monthly (recurring) early repayment IS part of the regular payment', () => {
      const loan = trackKitchen();
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 50, date: '2026-11-01', frequency: 'monthly', mode: 'reduceDuration' }] };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.amountC).toBe(26323 + 5000);
    });

    it('the tracking prefill skips a one-off due on the next instalment', () => {
      const loan = addLoan({ ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2026-11-01' }] });
      const p = Store.getLoanProgress(loan);
      expect(p.nextRegularPayment.date).toBe('2026-11-01');
      expect(p.nextRegularPayment.amountC).toBe(26323);
    });
  });

  // ── (c) changes that start in a later month ───────────────────────────────
  describe('a change that starts months ahead still prompts', () => {
    it('a rate change effective 2027-01-01 updates from the January payment on', () => {
      const loan = trackKitchen();
      const cfg = { ...KITCHEN, rateChanges: [{ annualRate: 9, effectiveFrom: '2027-01-01' }] };
      const janC = sim(cfg).schedule.find(r => r.date === '2027-01-01').paymentC;
      expect(janC).toBe(27195);
      const prev = edit(loan, cfg);
      const fut = future();
      const jan = fut.find(t => t.date === '2027-01-01');
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan).toEqual({
        mode: 'update', firstId: jan.id, count: fut.filter(t => t.date >= '2027-01-01').length,
        amountC: 27195, varies: false, endDate: null, firstDate: '2027-01-01', fromDate: '2027-01-01',
        keepCount: fut.length, loanEnd: sim(cfg).lastPaymentDate
      });

      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      const after = members();
      expect(after.length).toBe(24);
      after.filter(t => t.date < '2027-01-01').forEach(t => expect(cents(t.amount)).toBe(26323));
      after.filter(t => t.date >= '2027-01-01').slice(0, -1).forEach(t => expect(cents(t.amount)).toBe(27195));
      expect(armed().length).toBe(1);
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });

    it('the sheet says from which date', async () => {
      const loan = trackKitchen();
      const prev = edit(loan, { ...KITCHEN, rateChanges: [{ annualRate: 9, effectiveFrom: '2027-01-01' }] });
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('From 01/01/27');
      expect(text).toContain('$271.95');
      expect(text).toContain('19 upcoming payments from that date');
    });

    it('a reducePayment repayment on 2026-12-01 re-prices from January, not with the lump sum', () => {
      const loan = trackKitchen();
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2026-12-01', mode: 'reducePayment' }] };
      const janC = sim(cfg).schedule.find(r => r.date === '2027-01-01').paymentC;
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.amountC).toBe(janC);
      expect(plan.fromDate).toBe('2027-01-01');
      expect(plan.endDate).toBeNull();

      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      const dec = members().find(t => t.date === '2026-12-01');
      expect(cents(dec.amount)).toBe(26323);
      members().filter(t => t.date >= '2027-01-01').slice(0, -1).forEach(t => expect(cents(t.amount)).toBe(janC));
      expect(armed().length).toBe(1);
    });

    it('a monthly repayment from January (new amount AND earlier end) regenerates from the anchor, one chain', () => {
      const loan = trackKitchen();
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 50, date: '2027-01-01', frequency: 'monthly', mode: 'reduceDuration' }] };
      const s = sim(cfg);
      expect(s.lastPaymentDate < sim(KITCHEN).lastPaymentDate).toBe(true);
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.fromDate).toBe('2027-01-01');
      expect(plan.amountC).toBe(26323 + 5000);
      expect(plan.endDate).toBe(s.lastPaymentDate);

      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      const m = members();
      const months = m.map(t => t.date.slice(0, 7));
      expect(new Set(months).size).toBe(months.length); // no duplicate month
      expect(m[m.length - 1].date.slice(0, 7)).toBe(s.lastPaymentDate.slice(0, 7));
      expect(armed().length).toBe(1);
      // the untouched future members before the anchor read the new end too
      future().forEach(t => expect(t.recurrence.endDate).toBe(s.lastPaymentDate));
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });

    it('an Italian loan whose terms did not change still proposes nothing', () => {
      const cfg = { ...KITCHEN, amortization: 'italian' };
      const loan = addLoan(cfg, 'Italian');
      const firstRow = sim(cfg).schedule.find(r => r.index >= 1);
      track(loan, { amount: firstRow.paymentC / 100, date: '2026-08-01', endDate: sim(cfg).lastPaymentDate });
      const prev = edit(loan, { ...cfg });
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });
  });

  // ── (d) the 60-month cap ──────────────────────────────────────────────────
  // ── review 2: one amount cannot follow a schedule that changes twice ──────
  describe('the payments follow the schedule month by month', () => {
    const regularOf = (cfg) => {
      const s = sim(cfg);
      return (date) => {
        const row = s.schedule.find(r => r.index >= 1 && r.date.slice(0, 7) === date.slice(0, 7));
        return row ? Store._loanRowRegularC(cfg, row) : null;
      };
    };

    it('two scheduled rate changes: every future payment gets its own month\'s instalment', () => {
      const loan = trackKitchen();
      const cfg = { ...KITCHEN, rateChanges: [
        { annualRate: 9, effectiveFrom: '2027-01-01' },
        { annualRate: 3, effectiveFrom: '2027-07-01' }
      ] };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.varies).toBe(true);
      expect(plan.firstDate).toBe('2027-01-01');

      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      const regular = regularOf(cfg);
      members().filter(t => t.date <= '2026-10-15').forEach(t => expect(cents(t.amount)).toBe(26323));
      future().forEach(t => expect(cents(t.amount)).toBe(regular(t.date)));
      const jul = future().find(t => t.date === '2027-07-01');
      const jun = future().find(t => t.date === '2027-06-01');
      expect(cents(jul.amount)).not.toBe(cents(jun.amount)); // the second step landed
      expect(armed().length).toBe(1);
      // nothing left to sync
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });

    it('a monthly early repayment with an end date stops charging after it ends', () => {
      const loan = trackKitchen();
      const cfg = { ...KITCHEN, earlyRepayments: [
        { amount: 50, date: '2027-01-01', endDate: '2027-06-01', frequency: 'monthly', mode: 'reduceDuration' }
      ] };
      const prev = edit(loan, cfg);
      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      const s = sim(cfg);
      const regular = regularOf(cfg);
      const fut = future();
      fut.forEach(t => expect(cents(t.amount)).toBe(regular(t.date)));
      expect(cents(fut.find(t => t.date === '2027-03-01').amount)).toBe(26323 + 5000);
      expect(cents(fut.find(t => t.date === '2027-08-01').amount)).toBe(26323);
      // the series ends with the (now earlier) loan, one chain, one armed tail
      expect(fut[fut.length - 1].date.slice(0, 7)).toBe(s.lastPaymentDate.slice(0, 7));
      expect(new Set(fut.map(t => t.date.slice(0, 7))).size).toBe(fut.length);
      expect(armed().length).toBe(1);
    });

    it('a payment the user customised in an untouched month keeps its amount', () => {
      const loan = trackKitchen();
      const dec = future().find(t => t.date === '2026-12-01');
      Store.dispatch('UPDATE_TRANSACTION', { id: dec.id, amount: 300 }); // this one only
      const cfg = { ...KITCHEN, rateChanges: [{ annualRate: 9, effectiveFrom: '2027-03-01' }] };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.firstDate).toBe('2027-03-01'); // the rate change, not the custom December
      expect(plan.fromDate).toBe('2027-03-01');

      Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig: prev });
      const regular = regularOf(cfg);
      expect(cents(future().find(t => t.date === '2026-12-01').amount)).toBe(30000);
      future().filter(t => t.date >= '2027-03-01').forEach(t => expect(cents(t.amount)).toBe(regular(t.date)));
    });

    it('the sheet names the first new amount and when it starts', async () => {
      const loan = trackKitchen();
      const prev = edit(loan, { ...KITCHEN, rateChanges: [
        { annualRate: 9, effectiveFrom: '2027-01-01' },
        { annualRate: 3, effectiveFrom: '2027-07-01' }
      ] });
      const body = await openSyncSheet(loan.id, prev);
      expect(body).toContain("The loan's schedule changed.");
      expect(body).toContain('starting with $271.95 on 01/01/27');
    });
  });

  describe('a capped series end is not called the loan\'s end', () => {
    const CAR = {
      type: 'personal', principal: 20000, duration: 48, durationUnit: 'months',
      annualRate: 5, firstPaymentDate: '2026-08-01', amortization: 'french'
    };

    it('the plan carries the capped series end and the real loan end', () => {
      const loan = addLoan(CAR, 'Car');
      const row = sim(CAR).schedule[0];
      track(loan, { amount: row.paymentC / 100, date: '2026-08-01', endDate: sim(CAR).lastPaymentDate });
      const cfg = { ...CAR, duration: 120 };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.endDate).toBe('2031-08-01');
      expect(plan.capped).toBe(true);
      expect(plan.loanEnd).toBe(sim(cfg).lastPaymentDate);
      expect(plan.loanEnd).toBe('2036-07-01');
    });

    it('the sheet names the cap and both dates, never "with the loan"', async () => {
      const loan = addLoan(CAR, 'Car');
      const row = sim(CAR).schedule[0];
      track(loan, { amount: row.paymentC / 100, date: '2026-08-01', endDate: sim(CAR).lastPaymentDate });
      const prev = edit(loan, { ...CAR, duration: 120 });
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('capped at 5 years');
      expect(text).toContain('01/08/31');
      expect(text).toContain('01/07/36');
      expect(text).not.toContain('with the loan');
    });

    it('an end-only capped plan quotes the real loan end', async () => {
      const loan = trackKitchen();
      const fake = { mode: 'update', firstId: future()[0].id, count: 45, amountC: null, endDate: '2031-08-01', capped: true, loanEnd: '2036-07-01' };
      Store.getLoanSeriesSyncPlan = () => fake;
      const text = await openSyncSheet(loan.id, KITCHEN);
      expect(text).toContain('The loan now ends on 01/07/36');
      expect(text).toContain('Update its 45 upcoming payments to match?');
      expect(text).toContain('will stop on 01/08/31');
      expect(text).not.toContain('so they end with it');
    });
  });

  // ── (e) singular end note ─────────────────────────────────────────────────
  describe('the end-date note agrees with a single remaining payment', () => {
    it('one payment left: no stray plural pronoun', async () => {
      pin(2028, 6, 15);
      const loan = trackKitchen();
      const prev = edit(loan, { ...KITCHEN, annualRate: 6, duration: 25 });
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.count).toBe(1);
      expect(plan.amountC).not.toBeNull();
      expect(plan.endDate).not.toBeNull();
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('Update its upcoming payment to match?');
      expect(text).toContain('Linked payments will also end on');
      expect(text).not.toContain('They will also end');
    });

    it('several payments keep the plural note', async () => {
      const loan = trackKitchen();
      const prev = edit(loan, { ...KITCHEN, annualRate: 9, duration: 30 });
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('They will also end on');
    });
  });

  // ── (f) destructive styling ───────────────────────────────────────────────
  describe('the confirm button style follows the action', () => {
    it('"Delete Payments" (finish) is btn-danger, with Cancel kept', async () => {
      const loan = trackKitchen();
      const prev = edit(loan, { ...KITCHEN, duration: 3 });
      await openSyncSheet(loan.id, prev);
      const btn = document.getElementById('modal-save-btn');
      expect(btn.textContent).toContain('Delete Payments');
      expect(btn.classList.contains('btn-danger')).toBe(true);
      expect(btn.classList.contains('btn-primary')).toBe(false);
      expect(document.getElementById('modal-cancel-btn')).not.toBeNull();
    });

    it('"Update Payments" stays btn-primary', async () => {
      const loan = trackKitchen();
      const prev = edit(loan, { ...KITCHEN, annualRate: 9 });
      await openSyncSheet(loan.id, prev);
      const btn = document.getElementById('modal-save-btn');
      expect(btn.textContent).toContain('Update Payments');
      expect(btn.classList.contains('btn-primary')).toBe(true);
    });
  });
});
