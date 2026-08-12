import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Background Timestamp Logging', () => {
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
    executeFile('store.js');
    
    // Mock system time to a fixed timestamp: 14:32:05
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T14:32:05'));

    // Initialize store
    global.window.Store.init();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should automatically capture system time HH:mm:ss on ADD_TRANSACTION', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Checking', openingBalance: 0 });
    const account = global.window.Store.getState().accounts[0];

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 45.50,
      accountId: account.id,
      categoryId: 'cat_groceries',
      date: '2026-07-31'
    });

    const tx = global.window.Store.getState().transactions.find(t => t.amount === 45.50);
    expect(tx).toBeDefined();
    expect(tx.date).toBe('2026-07-31');
    expect(tx.time).toBe('14:32:05');
  });

  it('should automatically capture system time HH:mm:ss on ADD_TRANSFER for both sides', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Bank 1', openingBalance: 500 });
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Bank 2', openingBalance: 100 });
    const [acc1, acc2] = global.window.Store.getState().accounts;

    global.window.Store.dispatch('ADD_TRANSFER', {
      amount: 50,
      expenseAccountId: acc1.id,
      incomeAccountId: acc2.id,
      date: '2026-07-31',
      note: 'Fund transfer'
    });

    const transfers = global.window.Store.getState().transactions.filter(t => t.comment === 'Fund transfer');
    expect(transfers.length).toBe(2);
    expect(transfers[0].time).toBe('14:32:05');
    expect(transfers[1].time).toBe('14:32:05');
  });

  it('should capture system time on account opening balance creation', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', {
      name: 'Savings',
      openingBalance: 1250,
      openingDate: '2026-07-01'
    });

    const obTx = global.window.Store.getState().transactions.find(t => t.type === 'opening_balance');
    expect(obTx).toBeDefined();
    expect(obTx.date).toBe('2026-07-01');
    expect(obTx.time).toBe('00:00');
  });

  it('should assign system time to batch imported transactions when time is omitted', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet' });
    const acc = global.window.Store.getState().accounts[0];

    global.window.Store.dispatch('BATCH_IMPORT_TRANSACTIONS', {
      transactions: [
        { type: 'expense', amount: 12.00, accountId: acc.id, categoryId: 'cat_dining', date: '2026-07-30' }
      ]
    });

    const importedTx = global.window.Store.getState().transactions.find(t => t.amount === 12.00);
    expect(importedTx).toBeDefined();
    expect(importedTx.time).toBe('14:32:05');
  });

  it('should migrate pre-existing transactions without time field on Store.init()', () => {
    // Setup pre-existing transaction in DB without time field
    const existingTx = {
      id: 'tx-legacy-1',
      type: 'expense',
      amount: 99.99,
      accountId: 'acc-1',
      categoryId: 'cat_other',
      date: '2026-06-15',
      createdAt: '2026-06-15T09:15:30.000Z'
    };

    global.window.localStorage.getItem = vi.fn((key) => {
      if (key === 'stackd_v1_transactions') return JSON.stringify([existingTx]);
      return null;
    });

    global.window.Store.init();

    const migrated = global.window.Store.getState().transactions.find(t => t.id === 'tx-legacy-1');
    expect(migrated).toBeDefined();
    expect(migrated.time).toBe('09:15:30');
  });
});
