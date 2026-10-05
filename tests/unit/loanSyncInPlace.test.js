import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.1 review 3 — the linked-series sync moves a series' end IN PLACE and
// handles the edges the second review found:
//  - an end move never rebuilds the chain from one member (customised
//    account / category / note survive, deleted payments stay deleted);
//  - the series end is set on the series' own day of the month;
//  - an interest-only first instalment re-prices its month, and payments
//    dated before a later first instalment are deleted;
//  - undoing the old final cent adjustment is not "a new regular payment";
//  - a temporary change gets the schedule wording;
//  - a series converted to a transfer moves its end on both legs.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const pin = (y, m, d) => vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
const cents = (amount) => Math.round(Number(amount) * 100);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const month = (ymd) => ymd.slice(0, 7);

const KITCHEN = { // 6,000 @ 5% / 2 years, tracked at 263.23
  type: 'personal', principal: 6000, duration: 24, durationUnit: 'months',
  annualRate: 5, firstPaymentDate: '2026-08-01', amortization: 'french',
  rateChanges: [], earlyRepayments: [], additionalExpenses: []
};

describe('Loan series sync — review 3 (in-place end move and edges)', () => {
  let Store;
  let acc1;
  let acc2;

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
    ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js', 'router.js']
      .forEach(executeFile);
    Store = global.window.Store;
    Store.init();
    global.window.Views._DebtShared.draft = null;
    Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 50000, openingDate: '2026-01-01' });
    Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 50000, openingDate: '2026-01-01' });
    [acc1, acc2] = Store.getState().accounts.map(a => a.id);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const sim = (config) => global.window.LoanEngine.simulate({ ...config, computeSavings: false });
  const loanById = (id) => Store.getState().loans.find(l => l.id === id);
  const addLoan = (config) => {
    Store.dispatch('ADD_LOAN', { name: 'Kitchen Loan', kind: 'active', config });
    const loans = Store.getState().loans;
    return loans[loans.length - 1];
  };
  const track = (config, { amount = 263.23, date, endDate } = {}) => {
    const loan = addLoan(config);
    Store.dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId: 'series-1' });
    Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount, accountId: acc1, categoryId: 'cat_debt',
      date: date || config.firstPaymentDate,
      recurrence: { seriesId: 'series-1', interval: 1, frequency: 'months', endDate: endDate || sim(config).lastPaymentDate }
    });
    return loanById(loan.id);
  };
  const edit = (loan, config) => {
    const prevConfig = loanById(loan.id).config;
    Store.dispatch('UPDATE_LOAN', { id: loan.id, name: loan.name, config });
    return prevConfig;
  };
  const sync = (loan, prevConfig) => Store.dispatch('SYNC_LOAN_SERIES', { id: loan.id, prevConfig });
  const members = () => Store.getState().transactions
    .filter(t => t.recurrence && t.recurrence.seriesId === 'series-1')
    .sort((a, b) => a.date.localeCompare(b.date));
  const legs = () => members().filter(t => !t.transferRef || t.type === 'expense');
  const future = (today = '2026-10-15') => legs().filter(t => t.date > today);
  const armed = () => members().filter(t => t.recurrence.nextDate);
  const regularOf = (cfg) => {
    const s = sim(cfg);
    return (ymd) => {
      const row = s.schedule.find(r => month(r.date) === month(ymd));
      return row ? Store._loanRowRegularC(cfg, row) : null;
    };
  };
  const openSyncSheet = async (loanId, prevConfig) => {
    global.window.Views.DebtResultsView._offerSeriesSync(loanId, prevConfig);
    await wait(120);
    return document.querySelector('.modal-body').textContent.replace(/\s+/g, ' ');
  };

  describe('an end move never rebuilds the chain from one payment', () => {
    it('customised account, note and a deleted payment survive a shorter end', () => {
      const loan = track(KITCHEN);
      const byDate = (d) => members().find(t => t.date === d);
      Store.dispatch('UPDATE_TRANSACTION', { id: byDate('2026-11-01').id, accountId: acc2, amount: 300, comment: 'one-off from savings' });
      Store.dispatch('UPDATE_TRANSACTION', { id: byDate('2027-02-01').id, comment: 'feb custom' });
      Store.dispatch('DELETE_TRANSACTION', { id: byDate('2026-12-01').id });
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2027-01-01', frequency: 'once', mode: 'reduceDuration' }] };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.endDate).not.toBeNull();

      sync(loan, prev);
      const nov = byDate('2026-11-01');
      expect(nov.accountId).toBe(acc2);
      expect(nov.comment).toBe('one-off from savings');
      expect(cents(nov.amount)).toBe(30000);
      expect(byDate('2026-12-01')).toBeUndefined();
      expect(byDate('2027-02-01').comment).toBe('feb custom');
      future().filter(t => t.date !== '2026-11-01').forEach(t => expect(t.accountId).toBe(acc1));
      const end = sim(cfg).lastPaymentDate;
      const fut = future();
      expect(month(fut[fut.length - 1].date)).toBe(month(end));
      expect(fut.every(t => month(t.date) <= month(end))).toBe(true);
      expect(armed().length).toBe(1);
      expect(armed()[0]).toBe(fut[fut.length - 1]);
      // a processing pass resurrects nothing
      Store._processRecurringTransactions();
      expect(byDate('2026-12-01')).toBeUndefined();
      expect(future().length).toBe(fut.length);
    });

    it('a longer end only adds the new months, cloned from the real last payment', () => {
      const loan = track(KITCHEN);
      const byDate = (d) => members().find(t => t.date === d);
      Store.dispatch('UPDATE_TRANSACTION', { id: byDate('2026-11-01').id, accountId: acc2, comment: 'first one from savings' });
      const cfg = { ...KITCHEN, duration: 30 };
      const prev = edit(loan, cfg);
      sync(loan, prev);
      const regular = regularOf(cfg);
      expect(byDate('2026-11-01').accountId).toBe(acc2);
      const fut = future();
      expect(month(fut[fut.length - 1].date)).toBe('2029-01');
      fut.filter(t => t.date > '2028-07-01').forEach(t => {
        expect(t.accountId).toBe(acc1);
        expect(t.comment || '').not.toContain('first one');
      });
      fut.forEach(t => expect(cents(t.amount)).toBe(regular(t.date)));
      expect(new Set(fut.map(t => month(t.date))).size).toBe(fut.length);
      expect(armed().length).toBe(1);
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });
  });

  describe('the series end sits on the series\' own day of the month', () => {
    it('a series on the 20th keeps its final-month payment when the loan now pays on the 5th', () => {
      pin(2026, 10, 25);
      const base = { ...KITCHEN, firstPaymentDate: '2026-08-20' };
      const loan = track(base);
      const prev = edit(loan, { ...base, firstPaymentDate: '2026-08-05' });
      // same amounts, same months: nothing to change, nothing lost
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
      expect(month(legs()[legs().length - 1].date)).toBe('2028-07');
      expect(legs().length).toBe(24);
    });

    it('a series moved to the 5th ends in the loan\'s last month on the 5th', () => {
      const loan = track(KITCHEN);
      const nov = members().find(t => t.date === '2026-11-01');
      Store.dispatch('UPDATE_TRANSACTION', { id: nov.id, date: '2026-11-05', updateFuture: true });
      const cfg = { ...KITCHEN, duration: 30 };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.endDate).toBe('2029-01-05');
      sync(loan, prev);
      const fut = future();
      expect(fut[fut.length - 1].date).toBe('2029-01-05');
      expect(armed().length).toBe(1);
    });
  });

  describe('the loan\'s first instalments', () => {
    it('an interest-only first instalment re-prices that month', () => {
      const base = { ...KITCHEN, firstPaymentDate: '2026-11-01' };
      const loan = track(base);
      const cfg = { ...base, firstInstallmentInterestOnly: true };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan).not.toBeNull();
      sync(loan, prev);
      const regular = regularOf(cfg);
      const s = sim(cfg);
      expect(cents(future()[0].amount)).toBe(s.schedule[0].paymentC);
      future().forEach(t => expect(cents(t.amount)).toBe(regular(t.date)));
      expect(month(future()[future().length - 1].date)).toBe(month(s.lastPaymentDate));
      expect(armed().length).toBe(1);
    });

    it('a first payment moved later deletes the payments dated before it', async () => {
      const loan = track(KITCHEN);
      const cfg = { ...KITCHEN, firstPaymentDate: '2027-02-01' };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.removeCount).toBe(3);
      expect(plan.startDate).toBe('2027-02-01');
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('the 3 payments dated before it will be deleted');

      sync(loan, prev);
      const fut = future();
      expect(fut[0].date).toBe('2027-02-01');
      expect(fut.length).toBe(24);
      expect(month(fut[fut.length - 1].date)).toBe(month(sim(cfg).lastPaymentDate));
      expect(armed().length).toBe(1);
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });
  });

  describe('what the prompt says', () => {
    it('removing a one-off repayment is an end change, not a new regular payment', async () => {
      const old = { ...KITCHEN, earlyRepayments: [{ amount: 1500, date: '2027-03-01', frequency: 'once', mode: 'reduceDuration' }] };
      const loan = track(old);
      const prev = edit(loan, KITCHEN);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.amountC).toBeNull();
      expect(month(plan.endDate)).toBe('2028-07');
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('The loan now ends on 01/07/28');
      expect(text).not.toContain('regular payment is');

      sync(loan, prev);
      const regular = regularOf(KITCHEN);
      future().forEach(t => expect(cents(t.amount)).toBe(regular(t.date)));
      expect(month(future()[future().length - 1].date)).toBe('2028-07');
      expect(armed().length).toBe(1);
    });

    it('a temporary monthly repayment uses the schedule wording', async () => {
      const loan = track(KITCHEN);
      const prev = edit(loan, { ...KITCHEN, earlyRepayments: [
        { amount: 100, date: '2026-11-01', endDate: '2027-01-01', frequency: 'monthly', mode: 'reduceDuration' }
      ] });
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.varies).toBe(true);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain("The loan's schedule changed.");
      expect(text).not.toContain('is now');
    });

    it('a plain rate change still reads as the new regular payment', async () => {
      const loan = track(KITCHEN);
      const prev = edit(loan, { ...KITCHEN, annualRate: 9 });
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.varies).toBe(false);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain("The loan's regular payment is now $274.11.");
    });
  });

  it('a series converted to a transfer moves its end on both legs', () => {
    const loan = addLoan(KITCHEN);
    Store.dispatch('ADD_TRANSFER', {
      amount: 263.23, expenseAccountId: acc1, incomeAccountId: acc2, date: '2026-08-01',
      recurrence: { seriesId: 'series-1', interval: 1, frequency: 'months', endDate: sim(KITCHEN).lastPaymentDate }
    });
    Store.dispatch('UPDATE_LOAN', { id: loan.id, linkedSeriesId: 'series-1' });
    const cfg = { ...KITCHEN, duration: 30 };
    const prev = edit(loan, cfg);
    sync(loan, prev);
    const all = members();
    const expense = all.filter(t => t.type === 'expense');
    const income = all.filter(t => t.type === 'income');
    expect(expense.length).toBe(30);
    expect(income.length).toBe(30);
    all.forEach(t => expect(month(t.recurrence.endDate)).toBe('2029-01'));
    expect(armed().length).toBe(1);
    expect(armed()[0].type).toBe('expense');
    // every future pair agrees on its amount
    future().forEach(t => {
      const cp = all.find(o => o !== t && o.transferRef === t.transferRef);
      expect(cp && cents(cp.amount)).toBe(cents(t.amount));
    });
  });

  // ── review 4 ───────────────────────────────────────────────────────────────
  describe('review 4', () => {
    it('a longer end grows the chain', () => {
      const loan = track(KITCHEN);
      const shorter = { ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2027-01-01', frequency: 'once', mode: 'reduceDuration' }] };
      edit(loan, shorter); // the prompt is declined
      const nov = members().find(t => t.date === '2026-11-01');
      Store.dispatch('UPDATE_TRANSACTION', {
        id: nov.id, updateFuture: true,
        recurrence: { ...nov.recurrence, endDate: sim(shorter).lastPaymentDate }
      });
      expect(month(legs()[legs().length - 1].date)).toBe('2027-11');
      // 1.0.2 (BUG-26): past members carry the series' (shorter) end too
      expect(members().find(t => t.date === '2026-09-01').recurrence.endDate).toBe(sim(shorter).lastPaymentDate);

      const prev = edit(loan, KITCHEN);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.endDate).toBe('2028-07-01');
      expect(plan.addCount).toBe(8);
      sync(loan, prev);
      const fut = future();
      expect(fut[fut.length - 1].date).toBe('2028-07-01');
      expect(cents(fut[fut.length - 1].amount)).toBe(regularOf(KITCHEN)('2028-07-01'));
      expect(new Set(fut.map(t => month(t.date))).size).toBe(fut.length);
      expect(armed().length).toBe(1);
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });

    it('a weekly or every-2-months series is not re-priced with a monthly instalment', () => {
      const loan = addLoan(KITCHEN);
      Store.dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId: 'series-1' });
      Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 526.46, accountId: acc1, categoryId: 'cat_debt', date: '2026-08-01',
        recurrence: { seriesId: 'series-1', interval: 2, frequency: 'months', endDate: '2028-07-01' }
      });
      const before = members().map(t => cents(t.amount));
      const prev = edit(loan, { ...KITCHEN, annualRate: 9 });
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
      sync(loan, prev);
      expect(members().map(t => cents(t.amount))).toEqual(before);
    });

    it('a plain extension says how many payments it adds', async () => {
      const loan = track(KITCHEN);
      const prev = edit(loan, { ...KITCHEN, duration: 30 });
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.addCount).toBe(6);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('6 new payments will be added, up to 01/01/29.');
      sync(loan, prev);
      expect(future().length).toBe(21 + 6);
    });

    it('a loan moved past its old end replaces the payments — never "0 upcoming payments"', async () => {
      const short = { ...KITCHEN, duration: 6 }; // Aug 2026 – Jan 2027
      const loan = track(short, { amount: 1014.63 });
      const cfg = { ...short, firstPaymentDate: '2027-03-01' };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.keepCount).toBe(0);
      expect(plan.addCount).toBe(6);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).not.toMatch(/\b0 upcoming/);
      expect(text).toContain('The loan now runs from 01/03/27 to 01/08/27, so 6 new payments will be created.');
      sync(loan, prev);
      const fut = future();
      expect(fut.map(t => t.date)).toEqual(['2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01', '2027-07-01', '2027-08-01']);
      expect(armed().length).toBe(1);
    });

    it('a final payment shrunk by a lump sum prompts, even when the end stays', async () => {
      const loan = track(KITCHEN);
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 200, date: '2027-03-01', frequency: 'once', mode: 'reduceDuration' }] };
      const s = sim(cfg);
      expect(month(s.lastPaymentDate)).toBe('2028-07');
      const finalC = Store._loanRowRegularC(cfg, s.schedule[s.schedule.length - 1]);
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan).not.toBeNull();
      expect(plan.amountC).toBe(finalC);
      expect(plan.varies).toBe(true);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).not.toContain('regular payment is');
      sync(loan, prev);
      expect(cents(future()[future().length - 1].amount)).toBe(finalC);
    });

    it('an end-only prompt names a final payment far from the regular one', async () => {
      const loan = track(KITCHEN);
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2026-11-01', frequency: 'once', mode: 'reduceDuration' }] };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.amountC).toBeNull();
      expect(plan.finalC).toBe(22778);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('The loan now ends on 01/11/27');
      expect(text).toContain('The last payment, on 01/11/27, will be $227.78.');
    });

    it('review 5: the prompt names the LOAN\'s end, not the series day', async () => {
      const base = { ...KITCHEN, firstPaymentDate: '2026-08-31' }; // series drifts to the 28th
      const loan = track(base);
      const cfg = { ...base, earlyRepayments: [{ amount: 2000, date: '2027-03-31', frequency: 'once', mode: 'reduceDuration' }] };
      expect(sim(cfg).lastPaymentDate).toBe('2027-11-30');
      const prev = edit(loan, cfg);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('The loan now ends on 30/11/27');
      expect(text).not.toContain('ends on 28/11/27');
    });

    it('review 5: a replaced, capped run names the real loan end and the cap', async () => {
      const short = { ...KITCHEN, duration: 6 };
      const loan = track(short, { amount: 1014.63 });
      const prev = edit(loan, { ...short, firstPaymentDate: '2027-03-01', duration: 60 });
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.capped).toBe(true);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('The loan now runs from 01/03/27 to 01/02/32');
      expect(text).toContain('capped at 5 years');
    });

    it('review 5: an extension that creates a small final payment names it', async () => {
      const old = { ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2026-11-01', frequency: 'once', mode: 'reduceDuration' }] };
      const loan = track(old);
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 1200, date: '2026-11-01', frequency: 'once', mode: 'reduceDuration' }] };
      const s = sim(cfg);
      const finalC = Store._loanRowRegularC(cfg, s.schedule[s.schedule.length - 1]);
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.addCount).toBeGreaterThan(0);
      expect(plan.finalC).toBe(finalC);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('The last payment, on');
      sync(loan, prev);
      expect(cents(future()[future().length - 1].amount)).toBe(finalC);
    });

    it('review 5: nothing left after the sync never reads "Update its 0 upcoming payments"', async () => {
      const loan = track(KITCHEN);
      const apr = members().find(t => t.date === '2027-04-01');
      Store.dispatch('DELETE_TRANSACTION', { id: apr.id, deleteFuture: true }); // stops the chain
      const prev = edit(loan, { ...KITCHEN, firstPaymentDate: '2027-06-01', duration: 12 });
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.removeCount).toBe(5);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).not.toMatch(/\b0 upcoming/);
      expect(text).toContain('the 5 payments dated before it will be deleted');
      sync(loan, prev);
      expect(future().length).toBe(0);
    });

    it('review 5: a weekly series is finished when the loan is already paid off', () => {
      const loan = addLoan(KITCHEN);
      Store.dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId: 'series-1' });
      Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 60, accountId: acc1, categoryId: 'cat_debt', date: '2026-08-03',
        recurrence: { seriesId: 'series-1', interval: 1, frequency: 'weeks', endDate: '2028-07-01' }
      });
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 5400, date: '2026-09-01', frequency: 'once', mode: 'reduceDuration' }] };
      expect(sim(cfg).lastPaymentDate < '2026-10-15').toBe(true);
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.mode).toBe('finish');
      sync(loan, prev);
      expect(future().length).toBe(0);
      expect(armed().length).toBe(0);
    });

    it('review 6: no payment ends up dated after its series end (31st → 28th drift)', () => {
      const base = { ...KITCHEN, firstPaymentDate: '2026-08-31' };
      const loan = track(base);
      const cfg = { ...base, earlyRepayments: [{ amount: 5000, date: '2026-11-30', frequency: 'once', mode: 'reduceDuration' }] };
      const prev = edit(loan, cfg);
      sync(loan, prev);
      members().forEach(t => expect(t.date <= t.recurrence.endDate).toBe(true));
      const dec = members().find(t => month(t.date) === '2026-12');
      expect(dec).toBeDefined();
      // a later "this and future" move of November keeps December's payment
      const nov = members().find(t => month(t.date) === '2026-11');
      Store.dispatch('UPDATE_TRANSACTION', { id: nov.id, date: '2026-11-29', updateFuture: true });
      expect(members().some(t => month(t.date) === '2026-12')).toBe(true);
    });

    it('review 6: existing and added payments are counted separately, and a reverted final is named', async () => {
      const old = { ...KITCHEN, earlyRepayments: [{ amount: 5000, date: '2026-11-01', frequency: 'once', mode: 'reduceDuration' }] };
      const loan = track(old);
      const dec = members().find(t => t.date === '2026-12-01');
      const oldFinal = cents(dec.amount);
      expect(oldFinal).toBeLessThan(26323 - 100);
      const prev = edit(loan, KITCHEN);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.keepCount).toBe(2);
      expect(plan.addCount).toBe(19);
      expect(plan.revertC).toBe(26323);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('Update its 2 upcoming payments');
      expect(text).toContain('19 new payments will be added');
      expect(text).toContain('back to the regular $263.23');
      sync(loan, prev);
      expect(cents(members().find(t => t.date === '2026-12-01').amount)).toBe(26323);
      expect(future().length).toBe(21);
    });

    it('review 6: a material change to the final payment is caught even when it sits near the regular one', () => {
      pin(2026, 10, 2);
      const base = { ...KITCHEN, duration: 6, firstPaymentDate: '2026-10-15' };
      const loan = track(base, { amount: 1014.63 });
      pin(2026, 11, 20);
      Store.dispatch('DELETE_TRANSACTION', { id: members().find(t => t.date === '2027-02-15').id });
      const cfg = { ...base, earlyRepayments: [{ amount: 500, date: '2026-12-20', frequency: 'once', mode: 'reducePayment' }] };
      const s = sim(cfg);
      const finalC = Store._loanRowRegularC(cfg, s.schedule[s.schedule.length - 1]);
      const prev = edit(loan, cfg);
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).not.toBeNull();
      sync(loan, prev);
      const fut = future('2026-11-20');
      expect(cents(fut[fut.length - 1].amount)).toBe(finalC);
      expect(fut.some(t => t.date === '2027-02-15')).toBe(false); // the deletion holds
    });

    it('review 6: a longer loan extends a series whose last payment is due today', async () => {
      pin(2026, 10, 2);
      const base = { ...KITCHEN, duration: 6, firstPaymentDate: '2026-10-15' };
      const loan = track(base, { amount: 1014.63 });
      pin(2027, 3, 15);
      const cfg = { ...base, duration: 12 };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan).not.toBeNull();
      expect(plan.addCount).toBe(6);
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('6 new payments will be added');
      sync(loan, prev);
      const fut = future('2027-03-15');
      expect(fut.length).toBe(6);
      expect(fut[fut.length - 1].date).toBe('2027-09-15');
      expect(armed().length).toBe(1);
    });

    it('review 6: after "finish" the survivors carry the real end, so a later edit resurrects nothing', () => {
      const loan = track(KITCHEN);
      const cfg = { ...KITCHEN, earlyRepayments: [{ amount: 6000, date: '2026-09-01', frequency: 'once', mode: 'reduceDuration' }] };
      const prev = edit(loan, cfg);
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev).mode).toBe('finish');
      sync(loan, prev);
      expect(future().length).toBe(0);
      const last = legs()[legs().length - 1];
      members().forEach(t => expect(t.recurrence.endDate).toBe(last.date));
      const sep = members().find(t => t.date === '2026-09-01');
      Store.dispatch('UPDATE_TRANSACTION', { id: sep.id, date: '2026-09-02', updateFuture: true });
      expect(legs().filter(t => t.date > '2026-10-15').length).toBe(0);
    });

    it('review 7: payments a longer end creates never inherit a bank identity', () => {
      pin(2026, 4, 20);
      const base = { ...KITCHEN, duration: 6, firstPaymentDate: '2026-05-01' };
      const loan = track(base, { amount: 1014.63 });
      pin(2026, 10, 15);
      const oct = members().find(t => t.date === '2026-10-01');
      Store.dispatch('APPLY_IMPORT_MATCHES', { links: [{ txId: oct.id, importKey: 'ref:acc|BANK123', bankRef: 'BANK123' }] });
      const prev = edit(loan, { ...base, duration: 12 });
      sync(loan, prev);
      const fut = future();
      expect(fut.length).toBe(6);
      fut.forEach(t => {
        expect(t.importKey).toBeUndefined();
        expect(t.bankRef).toBeUndefined();
      });
      expect(members().find(t => t.date === '2026-10-01').importKey).toBe('ref:acc|BANK123');
      expect(Store.getState().transactions.filter(t => t.importKey === 'ref:acc|BANK123').length).toBe(1);
    });

    it('review 7: the prompt says what the new payments cost', async () => {
      const loan = track(KITCHEN);
      const cfg = { ...KITCHEN, duration: 30 };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.addC).toBe(regularOf(cfg)(plan.addFrom));
      const text = await openSyncSheet(loan.id, prev);
      expect(text).toContain('The new payments start at $213.18.');
    });

    it('review 7: a stopped series that already ends before the loan gets no prompt', () => {
      const loan = track(KITCHEN);
      Store.dispatch('DELETE_TRANSACTION', { id: members().find(t => t.date === '2027-06-01').id, deleteFuture: true });
      const before = members().map(t => t.id + t.date + t.amount);
      const prev = edit(loan, { ...KITCHEN, earlyRepayments: [{ amount: 2000, date: '2027-01-01', frequency: 'once', mode: 'reduceDuration' }] });
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
      sync(loan, prev);
      expect(members().map(t => t.id + t.date + t.amount)).toEqual(before);
    });

    it('review 7: extending after the last payment never back-dates payments', () => {
      pin(2026, 7, 15);
      const loan = track(KITCHEN);
      pin(2028, 9, 15);
      const cfg = { ...KITCHEN, duration: 30 };
      const prev = edit(loan, cfg);
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      expect(plan.addFrom).toBe('2028-10-01');
      expect(plan.addCount).toBe(4);
      sync(loan, prev);
      const regular = regularOf(cfg);
      expect(legs().filter(t => t.date > '2028-07-01' && t.date <= '2028-09-15').length).toBe(0);
      const fut = future('2028-09-15');
      expect(fut.map(t => t.date)).toEqual(['2028-10-01', '2028-11-01', '2028-12-01', '2029-01-01']);
      fut.forEach(t => expect(cents(t.amount)).toBe(regular(t.date)));
      expect(armed().length).toBe(1);
    });

    it('review 8: a longer loan that adds nothing after today asks nothing', async () => {
      pin(2025, 9, 20);
      const base = { ...KITCHEN, principal: 3000, duration: 12, firstPaymentDate: '2025-10-01' };
      const loan = track(base, { amount: 256.82 });
      pin(2026, 10, 15);
      const prev = edit(loan, { ...base, duration: 13 }); // new final month 2026-10: already past
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
      global.window.Views.DebtResultsView._offerSeriesSync(loan.id, prev);
      await wait(120);
      expect(document.querySelector('.modal-body')).toBeNull();
    });

    it('review 8: everything already paid and a longer loan ending before today: no prompt', () => {
      pin(2026, 7, 15);
      const loan = track(KITCHEN);
      pin(2028, 9, 15);
      const prev = edit(loan, { ...KITCHEN, duration: 25 }); // ends 2028-08-01, in the past
      expect(Store.getLoanSeriesSyncPlan(loanById(loan.id), prev)).toBeNull();
    });

    it('a series the user stopped is never restarted by a longer loan', () => {
      const loan = track(KITCHEN);
      const apr = members().find(t => t.date === '2027-04-01');
      Store.dispatch('DELETE_TRANSACTION', { id: apr.id, deleteFuture: true });
      expect(armed().length).toBe(0);
      const lastBefore = legs()[legs().length - 1].date;
      const prev = edit(loan, { ...KITCHEN, duration: 30 });
      const plan = Store.getLoanSeriesSyncPlan(loanById(loan.id), prev);
      if (plan) expect(plan.endDate).toBeNull();
      sync(loan, prev);
      expect(legs()[legs().length - 1].date).toBe(lastBefore);
      expect(armed().length).toBe(0);
    });
  });
});
