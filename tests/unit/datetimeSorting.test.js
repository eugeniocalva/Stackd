import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Datetime Sorting Algorithm', () => {
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
    
    // Set system time to 2026-07-31 so activePeriod defaults to 2026-07
    vi.setSystemTime(new Date(2026, 6, 31));

    // Load dependencies in order
    executeFile('db.js');
    executeFile('store.js');

    global.window.Store.init();
  });

  it('should sort same-day transactions in exact chronological order for Oldest First (asc)', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet' });
    const acc = global.window.Store.getState().accounts[0];

    // Add three transactions on the same day with different system times
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 10,
      accountId: acc.id,
      date: '2026-07-31',
      time: '14:30:00'
    });

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 20,
      accountId: acc.id,
      date: '2026-07-31',
      time: '09:15:00'
    });

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 30,
      accountId: acc.id,
      date: '2026-07-31',
      time: '18:45:00'
    });

    // Set filter to history with sortOrder = 'asc' (Oldest First)
    global.window.Store.dispatch('UPDATE_FILTERS', {
      page: 'history',
      filters: { sortOrder: 'asc' }
    });

    const results = global.window.Store.getFilteredTransactions('history');
    const amounts = results.map(t => t.amount);
    // Expected order: 09:15:00 (20), 14:30:00 (10), 18:45:00 (30)
    expect(amounts).toEqual([20, 10, 30]);
  });

  it('should sort same-day transactions in reverse chronological order for Newest First (desc)', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet' });
    const acc = global.window.Store.getState().accounts[0];

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 10,
      accountId: acc.id,
      date: '2026-07-31',
      time: '14:30:00'
    });

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 20,
      accountId: acc.id,
      date: '2026-07-31',
      time: '09:15:00'
    });

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 30,
      accountId: acc.id,
      date: '2026-07-31',
      time: '18:45:00'
    });

    // Set filter to history with sortOrder = 'desc' (Newest First)
    global.window.Store.dispatch('UPDATE_FILTERS', {
      page: 'history',
      filters: { sortOrder: 'desc' }
    });

    const results = global.window.Store.getFilteredTransactions('history');
    const amounts = results.map(t => t.amount);
    // Expected order: 18:45:00 (30), 14:30:00 (10), 09:15:00 (20)
    expect(amounts).toEqual([30, 10, 20]);
  });

  it('should correctly evaluate full datetime across different days', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet' });
    const acc = global.window.Store.getState().accounts[0];

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 100,
      accountId: acc.id,
      date: '2026-07-30',
      time: '23:59:00'
    });

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 200,
      accountId: acc.id,
      date: '2026-07-31',
      time: '00:01:00'
    });

    global.window.Store.dispatch('UPDATE_FILTERS', {
      page: 'history',
      filters: { sortOrder: 'asc' }
    });

    const results = global.window.Store.getFilteredTransactions('history');
    expect(results.map(t => t.amount)).toEqual([100, 200]);
  });
});
