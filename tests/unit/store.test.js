import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Store Logic', () => {
  beforeEach(() => {
    // Reset window and localStorage
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
    
    // Load dependencies in order
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    
    // Initialize store
    global.window.Store.init();
  });

  it('should initialize with default categories', () => {
    const state = global.window.Store.getState();
    expect(state.categories.length).toBeGreaterThan(0);
    expect(state.categories.find(c => c.name === 'Salary')).toBeDefined();
  });

  it('should add an account and opening balance', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', {
      name: 'Test Account',
      openingBalance: 1000
    });

    const state = global.window.Store.getState();
    const account = state.accounts.find(a => a.name === 'Test Account');
    expect(account).toBeDefined();
    
    const balance = global.window.Store.getAccountBalance(account.id);
    expect(balance).toBe(1000);
  });

  it('should calculate global balance correctly', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Acc 1', openingBalance: 500 });
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Acc 2', openingBalance: -200 });

    expect(global.window.Store.getGlobalBalance()).toBe(300);
  });

  it('should handle income and expenses', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const account = global.window.Store.getState().accounts[0];

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income',
      amount: 50,
      accountId: account.id,
      categoryId: 'cat_salary',
      date: '2026-03-31'
    });

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 20,
      accountId: account.id,
      categoryId: 'cat_groceries',
      date: '2026-03-31'
    });

    expect(global.window.Store.getAccountBalance(account.id)).toBe(30);
  });
  
  it('should save budget and compute spending', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 1000 });
    const account = global.window.Store.getState().accounts[0];
    const month = '2026-03';

    global.window.Store.dispatch('SAVE_BUDGET', {
      categoryId: 'cat_groceries',
      amount: 100,
      isCumulative: false
    });

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 40,
      accountId: account.id,
      categoryId: 'cat_groceries',
      date: `${month}-15`
    });

    const budgetStatus = global.window.Store.getBudgetForMonth('cat_groceries', month);
    expect(budgetStatus.allocated).toBe(100);
    expect(budgetStatus.spent).toBe(40);
    expect(budgetStatus.finalLimit).toBe(100);
  });

  it('should manage loan CRUD operations', () => {
    global.window.Store.dispatch('ADD_LOAN', {
      name: 'Car Loan',
      amount: 12000,
      tan: 6,
      durationMonths: 24,
      startDate: '2026-01-15',
      endDate: '2028-01-15',
      monthlyPayment: 531.85,
      totalReimbursement: 12764.4
    });

    const state = global.window.Store.getState();
    expect(state.loans.length).toBe(1);
    const loan = state.loans[0];
    expect(loan.name).toBe('Car Loan');
    expect(loan.amount).toBe(12000);
    expect(loan.tan).toBe(6);

    // v0.71 Phase 2: a legacy add still produces a v2 record with derived config
    expect(loan.kind).toBe('active');
    expect(loan.linkedSeriesId).toBeNull();
    expect(loan.config).toEqual({
      type: 'personal',
      principal: 12000,
      duration: 24,
      durationUnit: 'months',
      annualRate: 6,
      firstPaymentDate: '2026-01-15',
      amortization: 'french'
    });

    global.window.Store.dispatch('UPDATE_LOAN', {
      id: loan.id,
      name: 'Updated Car Loan',
      tan: 5.5
    });

    const updatedState = global.window.Store.getState();
    const updatedLoan = updatedState.loans.find(l => l.id === loan.id);
    expect(updatedLoan.name).toBe('Updated Car Loan');
    expect(updatedLoan.tan).toBe(5.5);
    // legacy term change re-derives the config so it never goes stale
    expect(updatedLoan.config.annualRate).toBe(5.5);
    expect(updatedLoan.config.principal).toBe(12000);

    global.window.Store.dispatch('DELETE_LOAN', { id: loan.id });
    expect(global.window.Store.getState().loans.length).toBe(0);
  });

  it('should add v2 loans with a config payload and promote simulations', () => {
    const config = {
      type: 'mortgage',
      principal: 111000,
      duration: 30,
      durationUnit: 'years',
      annualRate: 4.05,
      firstPaymentDate: '2026-09-06',
      amortization: 'french'
    };
    global.window.Store.dispatch('ADD_LOAN', { name: 'My Mortgage', kind: 'sim', config });

    const loan = global.window.Store.getState().loans[0];
    expect(loan.kind).toBe('sim');
    expect(loan.config).toEqual(config);
    expect(loan.linkedSeriesId).toBeNull();
    expect(loan.amount).toBeUndefined(); // no legacy fields on v2 adds

    global.window.Store.dispatch('PROMOTE_LOAN', { id: loan.id });
    const promoted = global.window.Store.getState().loans[0];
    expect(promoted.kind).toBe('active');
    expect(promoted.updatedAt).not.toBeNull();

    global.window.Store.dispatch('UPDATE_LOAN', { id: loan.id, linkedSeriesId: 'series-123' });
    expect(global.window.Store.getState().loans[0].linkedSeriesId).toBe('series-123');
    // v2 update without legacy terms must not touch the config
    expect(global.window.Store.getState().loans[0].config).toEqual(config);
  });

  it('should migrate legacy v1 loan records to config-based v2 at boot', () => {
    const v1Loan = {
      id: 'loan-legacy-1',
      name: 'Old Loan',
      amount: 5000,
      tan: 4.5,
      durationMonths: 24,
      startDate: '2025-03-10',
      endDate: '2027-03-10',
      monthlyPayment: 218.24,
      totalReimbursement: 5237.76,
      createdAt: '2025-03-01T00:00:00.000Z',
      updatedAt: null
    };
    global.window.localStorage.getItem = vi.fn((key) =>
      key === 'stackd_v1_loans' ? JSON.stringify([v1Loan]) : null
    );
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    global.window.Store.init();

    const migrated = global.window.Store.getState().loans[0];
    expect(migrated.kind).toBe('active');
    expect(migrated.linkedSeriesId).toBeNull();
    expect(migrated.config).toEqual({
      type: 'personal',
      principal: 5000,
      duration: 24,
      durationUnit: 'months',
      annualRate: 4.5,
      firstPaymentDate: '2025-03-10',
      amortization: 'french'
    });
    // legacy fields retained for the old DebtView (removed in Phase 3)
    expect(migrated.amount).toBe(5000);
    expect(migrated.monthlyPayment).toBe(218.24);
    // migration persisted the upgraded slice
    const saveCalls = global.window.localStorage.setItem.mock.calls
      .filter(c => c[0] === 'stackd_v1_loans');
    expect(saveCalls.length).toBeGreaterThan(0);
    expect(JSON.parse(saveCalls[saveCalls.length - 1][1])[0].config).toBeDefined();
  });

  it('should derive loan progress from the amortization schedule', () => {
    // Calibration loan: 111,000 @ 4.05% / 30y, first payment 2026-09-06
    const config = {
      type: 'mortgage', principal: 111000, duration: 30, durationUnit: 'years',
      annualRate: 4.05, firstPaymentDate: '2026-09-06', amortization: 'french'
    };
    global.window.Store.dispatch('ADD_LOAN', { name: 'Mutuo', kind: 'active', config });
    const loan = global.window.Store.getState().loans[0];

    // Before the first instalment: nothing paid, next payment is row 1
    const before = global.window.Store.getLoanProgress(loan, '2026-08-01');
    expect(before.paidCount).toBe(0);
    expect(before.paidPrincipalC).toBe(0);
    expect(before.remainingC).toBe(11100000);
    expect(before.pct).toBe(0);
    expect(before.nextPayment).toEqual({ date: '2026-09-06', amountC: 53314 });
    expect(before.totalCount).toBe(360);

    // After exactly 4 instalments: principal paid matches the schedule rows
    const after4 = global.window.Store.getLoanProgress(loan, '2026-12-06');
    expect(after4.paidCount).toBe(4);
    expect(after4.paidPrincipalC).toBe(15851 + 15905 + 15959 + 16013);
    expect(after4.paidInterestC).toBe(37463 + 37409 + 37355 + 37301);
    expect(after4.remainingC).toBe(11100000 - after4.paidPrincipalC);
    expect(after4.nextPayment.date).toBe('2027-01-06');
    expect(after4.isPaidOff).toBe(false);

    // Past the end: fully paid, no next payment
    const done = global.window.Store.getLoanProgress(loan, '2060-01-01');
    expect(done.paidCount).toBe(360);
    expect(done.remainingC).toBe(0);
    expect(done.pct).toBe(100);
    expect(done.nextPayment).toBeNull();
    expect(done.isPaidOff).toBe(true);
  });

  it('should return null progress for an unsimulatable loan', () => {
    expect(global.window.Store.getLoanProgress(null)).toBeNull();
    expect(global.window.Store.getLoanProgress({ id: 'x', name: 'no config' })).toBeNull();
    expect(global.window.Store.getLoanProgress({ id: 'x', config: { principal: -5 } })).toBeNull();
  });

  it('should link a loan to its recurring series only on an exact seriesId match', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 5000 });
    const account = global.window.Store.getState().accounts[0];
    global.window.Store.dispatch('ADD_LOAN', {
      name: 'Mutuo', kind: 'active',
      config: {
        principal: 10000, duration: 24, durationUnit: 'months',
        annualRate: 4.5, firstPaymentDate: '2026-09-06', amortization: 'french'
      }
    });
    const loan = global.window.Store.getState().loans[0];
    expect(loan.linkedSeriesId).toBeNull();

    global.window.Store.dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId: 'series-loan-1' });

    // An unrelated recurring transaction must NOT consume the armed link
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 20, accountId: account.id, categoryId: 'cat_groceries',
      date: '2026-09-01',
      recurrence: { seriesId: 'other-series', interval: 1, frequency: 'months', endDate: '2027-01-01' }
    });
    expect(global.window.Store.getState().loans[0].linkedSeriesId).toBeNull();
    expect(global.window.Store.getState().pendingLoanLink).not.toBeNull();

    // The armed series links the loan and disarms the pending link
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 436.48, accountId: account.id, categoryId: 'cat_debt',
      date: '2026-09-06',
      recurrence: { seriesId: 'series-loan-1', interval: 1, frequency: 'months', endDate: '2028-08-06' }
    });
    const linked = global.window.Store.getState().loans[0];
    expect(linked.linkedSeriesId).toBe('series-loan-1');
    expect(global.window.Store.getState().pendingLoanLink).toBeNull();

    // getLoanLinkedTransactions reads through to the real transactions
    expect(global.window.Store.getLoanLinkedTransactions(linked).length).toBeGreaterThan(0);
    expect(global.window.Store.getLoanLinkedTransactions({ linkedSeriesId: 'ghost' })).toBeNull();
    expect(global.window.Store.getLoanLinkedTransactions({ linkedSeriesId: null })).toBeNull();
  });

  it('should seed the Loan Payment category once, without resurrecting it', () => {
    const cats = global.window.Store.getState().categories;
    const debtCat = cats.find(c => c.id === 'cat_debt');
    expect(debtCat).toBeDefined();
    expect(debtCat.typeHint).toBe('expense');
    expect(debtCat.name).toBe('Loan Payment');

    // Simulate an install that already ran the seed and then deleted the category
    global.window.localStorage.getItem = vi.fn((key) => {
      if (key === 'stackd_v1_catDebtSeeded') return JSON.stringify(true);
      if (key === 'stackd_v1_categories') return JSON.stringify([{ id: 'cat_other', name: 'Other', icon: 'package', isDefault: true, typeHint: 'both' }]);
      return null;
    });
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    global.window.Store.init();
    expect(global.window.Store.getState().categories.find(c => c.id === 'cat_debt')).toBeUndefined();
  });

  it('should enforce 60-month cap on recurring transaction end date', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 1000 });
    const account = global.window.Store.getState().accounts[0];

    // Case 1: Less than 5 years (no clamp)
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 100,
      accountId: account.id,
      categoryId: 'cat_groceries',
      date: '2026-01-01',
      recurrence: {
        enabled: true,
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        period: 'monthly',
        interval: 1,
        frequency: 'months'
      }
    });
    
    let state = global.window.Store.getState();
    // Find the transaction by its original target/range
    let tx1 = state.transactions.find(t => t.recurrence && t.recurrence.endDate === '2027-01-01');
    expect(tx1).toBeDefined();

    // Case 2: Greater than 5 years -> clamped to 5 years (60 months)
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 100,
      accountId: account.id,
      categoryId: 'cat_groceries',
      date: '2026-01-01',
      recurrence: {
        enabled: true,
        startDate: '2026-01-01',
        endDate: '2032-01-01',
        period: 'monthly',
        interval: 1,
        frequency: 'months'
      }
    });

    state = global.window.Store.getState();
    // Clamped date should be 2031-01-01 (60 months after 2026-01-01)
    let tx2 = state.transactions.find(t => t.recurrence && t.recurrence.endDate === '2031-01-01');
    expect(tx2).toBeDefined();
  });

  it('should compute upcoming impact of future-dated transactions (v0.64)', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 1000 });
    const account = global.window.Store.getState().accounts[0];

    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const plusDays = (n) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return fmt(d);
    };

    // Past transaction: not upcoming
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 50, accountId: account.id,
      categoryId: 'cat_groceries', date: plusDays(-1)
    });
    // Two future transactions inside the window
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income', amount: 2000, accountId: account.id,
      categoryId: 'cat_salary', date: plusDays(2)
    });
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 300, accountId: account.id,
      categoryId: 'cat_groceries', date: plusDays(3)
    });
    // Future but beyond the window: excluded
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 999, accountId: account.id,
      categoryId: 'cat_groceries', date: plusDays(20)
    });

    const impact = global.window.Store.computeUpcomingImpact(plusDays(10), [account.id]);
    expect(impact.count).toBe(2);
    expect(impact.net).toBe(1700);

    // Consistency: balance at window end === balance today + upcoming net
    const balanceToday = global.window.Store.getBalanceAtDate(plusDays(0), [account.id]);
    const balanceEnd = global.window.Store.getBalanceAtDate(plusDays(10), [account.id]);
    expect(balanceEnd - balanceToday).toBe(impact.net);
  });

  it('should persist analytics balance mode (v0.64)', () => {
    expect(global.window.Store.getState().analyticsBalanceMode).toBe('today');

    global.window.Store.dispatch('SET_ANALYTICS_BALANCE_MODE', 'end');
    expect(global.window.Store.getState().analyticsBalanceMode).toBe('end');

    // Invalid payloads fall back to 'today'
    global.window.Store.dispatch('SET_ANALYTICS_BALANCE_MODE', 'bogus');
    expect(global.window.Store.getState().analyticsBalanceMode).toBe('today');
  });

  it('should honor passed filters in computeAnalyticalSummary (v0.64)', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const account = global.window.Store.getState().accounts[0];

    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const plusDays = (n) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return fmt(d);
    };

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 100, accountId: account.id,
      categoryId: 'cat_groceries', date: plusDays(0)
    });
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 250, accountId: account.id,
      categoryId: 'cat_groceries', date: plusDays(5)
    });

    const baseFilters = { types: [], accounts: [], categories: [], sortOrder: 'desc' };
    const fullWindow = global.window.Store.computeAnalyticalSummary({
      ...baseFilters, period: { type: 'custom', start: plusDays(0), end: plusDays(10) }
    });
    const clampedToToday = global.window.Store.computeAnalyticalSummary({
      ...baseFilters, period: { type: 'custom', start: plusDays(0), end: plusDays(0) }
    });

    expect(fullWindow.expense).toBe(350);
    expect(clampedToToday.expense).toBe(100);
  });
});

