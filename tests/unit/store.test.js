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

    expect(global.window.Store.getGlobalBalance()).toBe(700);
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
});
