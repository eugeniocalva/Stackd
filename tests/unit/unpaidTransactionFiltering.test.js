import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Unpaid Transaction Data Logic & Filtering Unit Tests', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-id-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      StackdDB: {
        load: (key, def) => def,
        save: vi.fn(),
        generateId: () => 'test-id-' + Math.random().toString(36).substr(2, 9)
      },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    global.document = {
      getElementById: vi.fn(),
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      body: {
        appendChild: vi.fn()
      }
    };

    executeFile('db.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    global.window.Store.init();

    // Set fixed date to 2026-08-15
    const mockDate = new Date(2026, 7, 15);
    vi.setSystemTime(mockDate);
  });

  it('excludes unpaid transactions (isPaid === false) from getBalanceAtDate and account balances', () => {
    // Account with opening balance of €1,000
    global.window.Store.dispatch('ADD_ACCOUNT', {
      id: 'acc_unpaid_1',
      name: 'Main Checking',
      openingBalance: 1000,
      openingDate: '2025-01-01'
    });

    // Add paid expense of €100
    global.window.Store.dispatch('ADD_TRANSACTION', {
      id: 'tx_paid',
      type: 'expense',
      amount: 100,
      accountId: 'acc_unpaid_1',
      date: '2026-08-01',
      isPaid: true
    });

    // Add unpaid expense of €200
    global.window.Store.dispatch('ADD_TRANSACTION', {
      id: 'tx_unpaid',
      type: 'expense',
      amount: 200,
      accountId: 'acc_unpaid_1',
      date: '2026-08-02',
      isPaid: false
    });

    // Balance should be 1000 - 100 = 900 (the €200 unpaid expense is excluded)
    const balance = global.window.Store.getAccountBalance('acc_unpaid_1');
    expect(balance).toBe(900);
  });

  it('excludes unpaid transactions from analytics statistics (computeAnalyticalSummary & computeCategoryDistribution)', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', {
      id: 'acc_unpaid_2',
      name: 'Card',
      openingBalance: 500,
      openingDate: '2025-01-01'
    });

    // Paid income €300
    global.window.Store.dispatch('ADD_TRANSACTION', {
      id: 'tx_inc_paid',
      type: 'income',
      amount: 300,
      accountId: 'acc_unpaid_2',
      date: '2026-08-05',
      isPaid: true
    });

    // Unpaid income €500
    global.window.Store.dispatch('ADD_TRANSACTION', {
      id: 'tx_inc_unpaid',
      type: 'income',
      amount: 500,
      accountId: 'acc_unpaid_2',
      date: '2026-08-06',
      isPaid: false
    });

    const summary = global.window.Store.computeAnalyticalSummary();
    expect(summary.income).toBe(300); // 500 unpaid income excluded

    const dist = global.window.Store.computeCategoryDistribution(null, 'income');
    const totalDistAmount = dist.reduce((sum, item) => sum + item.amount, 0);
    expect(totalDistAmount).toBe(300);
  });

  it('re-includes transaction value when toggled back from unpaid (false) to paid (true)', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', {
      id: 'acc_unpaid_3',
      name: 'Savings',
      openingBalance: 2000,
      openingDate: '2025-01-01'
    });

    global.window.Store.dispatch('ADD_TRANSACTION', {
      id: 'tx_toggle',
      type: 'expense',
      amount: 450,
      accountId: 'acc_unpaid_3',
      date: '2026-08-10',
      isPaid: false
    });

    // While unpaid: balance is 2000
    expect(global.window.Store.getAccountBalance('acc_unpaid_3')).toBe(2000);

    // Toggle to Paid
    global.window.Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: 'tx_toggle' });

    // When paid: balance becomes 2000 - 450 = 1550
    expect(global.window.Store.getAccountBalance('acc_unpaid_3')).toBe(1550);
  });
});
