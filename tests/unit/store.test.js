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

    global.window.Store.dispatch('UPDATE_LOAN', {
      id: loan.id,
      name: 'Updated Car Loan',
      tan: 5.5
    });

    const updatedState = global.window.Store.getState();
    const updatedLoan = updatedState.loans.find(l => l.id === loan.id);
    expect(updatedLoan.name).toBe('Updated Car Loan');
    expect(updatedLoan.tan).toBe(5.5);

    global.window.Store.dispatch('DELETE_LOAN', { id: loan.id });
    expect(global.window.Store.getState().loans.length).toBe(0);
  });

  it('should compute remaining loan balance correctly', () => {
    const loan = {
      id: 'loan-1',
      name: 'Test Loan',
      amount: 12000,
      tan: 0,
      durationMonths: 24,
      startDate: '2026-01-15',
      endDate: '2028-01-15',
      monthlyPayment: 500,
      totalReimbursement: 12000
    };

    const RealDate = global.Date;
    
    // Scenario 1: today is 2026-01-15 (same day as start)
    global.Date = class extends RealDate {
      constructor(val) {
        if (val) return new RealDate(val);
        return new RealDate('2026-01-15T12:00:00');
      }
    };
    expect(global.window.Store.computeLoanRemainingBalance(loan)).toBe(12000);

    // Scenario 2: today is 2026-02-14 (less than 1 month elapsed)
    global.Date = class extends RealDate {
      constructor(val) {
        if (val) return new RealDate(val);
        return new RealDate('2026-02-14T12:00:00');
      }
    };
    expect(global.window.Store.computeLoanRemainingBalance(loan)).toBe(12000);

    // Scenario 3: today is 2026-02-15 (exactly 1 month elapsed)
    global.Date = class extends RealDate {
      constructor(val) {
        if (val) return new RealDate(val);
        return new RealDate('2026-02-15T12:00:00');
      }
    };
    expect(global.window.Store.computeLoanRemainingBalance(loan)).toBe(11500);

    // Scenario 4: today is 2027-01-15 (exactly 12 months elapsed)
    global.Date = class extends RealDate {
      constructor(val) {
        if (val) return new RealDate(val);
        return new RealDate('2027-01-15T12:00:00');
      }
    };
    expect(global.window.Store.computeLoanRemainingBalance(loan)).toBe(6000);

    global.Date = RealDate;
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
});

