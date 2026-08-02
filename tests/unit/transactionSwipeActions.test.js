import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Transaction Swipe Actions Unit Tests', () => {
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
  });

  it('toggles transaction paid status with TOGGLE_TRANSACTION_PAID action', () => {
    global.window.Store.dispatch('ADD_TRANSACTION', {
      id: 'tx_paid_test',
      type: 'expense',
      amount: 45.00,
      accountId: 'acc_1',
      date: '2026-08-01'
    });

    // Initially unpaid
    let state = global.window.Store.getState();
    let tx = state.transactions.find(t => t.id === 'tx_paid_test');
    expect(tx.isPaid).toBeFalsy();

    // Toggle paid -> true
    global.window.Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: 'tx_paid_test' });
    state = global.window.Store.getState();
    tx = state.transactions.find(t => t.id === 'tx_paid_test');
    expect(tx.isPaid).toBe(true);

    // Toggle paid -> false
    global.window.Store.dispatch('TOGGLE_TRANSACTION_PAID', { id: 'tx_paid_test' });
    state = global.window.Store.getState();
    tx = state.transactions.find(t => t.id === 'tx_paid_test');
    expect(tx.isPaid).toBe(false);
  });

  it('renders swipe left (Edit/Delete) and swipe right (Paid) containers when allowSwipeReveal is true', () => {
    const tx = { id: 'tx_swipe', accountId: 'acc_1', amount: 20, type: 'expense', date: '2026-08-01', isPaid: true };
    const html = global.window.Components.TransactionItem.render(tx, null, null, {
      allowSwipeReveal: true
    });

    expect(html).toContain('class="swipe-container"');
    expect(html).toContain('class="swipe-actions left"');
    expect(html).toContain('class="swipe-actions right"');
    expect(html).toContain('swipe-action-btn paid');
    expect(html).toContain('swipe-action-btn edit');
    expect(html).toContain('swipe-action-btn delete');
    expect(html).toContain('paid-badge');
    expect(html).toContain('Paid</span>');
  });
});
