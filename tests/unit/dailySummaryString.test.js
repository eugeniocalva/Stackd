import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('HistoryView Daily Summary String', () => {
  beforeEach(() => {
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
    global.window.Components = {
      AdvancedFilterBar: { render: () => '<div>FilterBar</div>', attachEvents: vi.fn() },
      TransactionItem: { render: (tx) => `<div class="tx-item">${tx.id}</div>` }
    };
    
    executeFile('db.js');
    executeFile('store.js');
    executeFile('views.js');

    global.window.Store.init();
  });

  it('renders daily summary string with positive sum colored green for income transactions', () => {
    const today = new Date().toISOString().split('T')[0];
    
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income',
      amount: 150.50,
      date: today,
      accountId: 'acc1'
    });

    const state = global.window.Store.getState();
    const html = global.window.Views.TransactionsView.render(state);

    expect(html).toContain('day-summary-footer');
    expect(html).toContain('color: var(--color-income)');
    expect(html).toContain('sum: $150.50');
  });

  it('renders daily summary string with negative sum colored red for net expenses', () => {
    const today = new Date().toISOString().split('T')[0];

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income',
      amount: 50.00,
      date: today,
      accountId: 'acc1'
    });
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 120.00,
      date: today,
      accountId: 'acc1'
    });

    const state = global.window.Store.getState();
    const html = global.window.Views.TransactionsView.render(state);

    expect(html).toContain('day-summary-footer');
    expect(html).toContain('color: var(--color-expense)');
    expect(html).toContain('sum: -$70.00');
  });

  it('ignores transfer transactions when calculating the daily summary', () => {
    const today = new Date().toISOString().split('T')[0];

    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Checking', openingBalance: 0 });
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });

    const accounts = global.window.Store.getState().accounts;

    // Add 1 income of 100
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income',
      amount: 100.00,
      date: today,
      accountId: accounts[0].id
    });

    // Add a transfer of 500 between accounts
    global.window.Store.dispatch('ADD_TRANSFER', {
      amount: 500.00,
      expenseAccountId: accounts[0].id,
      incomeAccountId: accounts[1].id,
      date: today,
      note: 'Transfer to savings'
    });

    const state = global.window.Store.getState();
    const html = global.window.Views.TransactionsView.render(state);

    // Day sum should be 100 (income only, transfer excluded), colored green
    expect(html).toContain('day-summary-footer');
    expect(html).toContain('color: var(--color-income)');
    expect(html).toContain('sum: $100.00');
  });

  it('formats currency according to user currency settings (e.g. EUR)', () => {
    const today = new Date().toISOString().split('T')[0];

    global.window.Store.dispatch('SET_CURRENCY', 'EUR');
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income',
      amount: 250.00,
      date: today,
      accountId: 'acc1'
    });

    const state = global.window.Store.getState();
    const html = global.window.Views.TransactionsView.render(state);

    expect(html).toContain('day-summary-footer');
    expect(html).toContain('sum: €250.00');
  });
});
