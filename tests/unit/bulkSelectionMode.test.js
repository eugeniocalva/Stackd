import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Bulk Selection Mode UI Unit Tests', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
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
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    global.window.Store.init();
  });

  it('initializes with isSelectionMode: false and empty selectedTransactionIds', () => {
    const state = global.window.Store.getState();
    expect(state.isSelectionMode).toBe(false);
    expect(state.selectedTransactionIds).toEqual([]);
  });

  it('handles TOGGLE_SELECTION_MODE action', () => {
    global.window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
    expect(global.window.Store.getState().isSelectionMode).toBe(true);

    global.window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: false });
    expect(global.window.Store.getState().isSelectionMode).toBe(false);
    expect(global.window.Store.getState().selectedTransactionIds).toEqual([]);
  });

  it('handles TOGGLE_TRANSACTION_SELECTION action', () => {
    global.window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
    global.window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: 'tx_1' });
    expect(global.window.Store.getState().selectedTransactionIds).toEqual(['tx_1']);

    global.window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: 'tx_2' });
    expect(global.window.Store.getState().selectedTransactionIds).toEqual(['tx_1', 'tx_2']);

    global.window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: 'tx_1' });
    expect(global.window.Store.getState().selectedTransactionIds).toEqual(['tx_2']);
  });

  it('handles SET_ALL_TRANSACTIONS_SELECTION action', () => {
    global.window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
    global.window.Store.dispatch('SET_ALL_TRANSACTIONS_SELECTION', { selectAll: true, ids: ['tx_1', 'tx_2', 'tx_3'] });
    expect(global.window.Store.getState().selectedTransactionIds).toEqual(['tx_1', 'tx_2', 'tx_3']);

    global.window.Store.dispatch('SET_ALL_TRANSACTIONS_SELECTION', { selectAll: false, ids: ['tx_1', 'tx_2', 'tx_3'] });
    expect(global.window.Store.getState().selectedTransactionIds).toEqual([]);
  });

  it('handles DELETE_BULK_TRANSACTIONS action', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { id: 'acc_1', name: 'Main Account', type: 'Checking', openingBalance: 100 });
    
    // Add two test transactions
    const tx1 = { id: 'tx_101', accountId: 'acc_1', amount: 20, type: 'expense', date: '2026-07-31', time: '12:00' };
    const tx2 = { id: 'tx_102', accountId: 'acc_1', amount: 30, type: 'income', date: '2026-07-31', time: '13:00' };
    
    global.window.Store.state.transactions.push(tx1, tx2);

    global.window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
    global.window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: 'tx_101' });
    global.window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: 'tx_102' });

    global.window.Store.dispatch('DELETE_BULK_TRANSACTIONS');

    const state = global.window.Store.getState();
    expect(state.isSelectionMode).toBe(false);
    expect(state.selectedTransactionIds).toEqual([]);
    expect(state.transactions.find(t => t.id === 'tx_101')).toBeUndefined();
    expect(state.transactions.find(t => t.id === 'tx_102')).toBeUndefined();
  });

  it('deletes selected AND future recurring transactions when deleteFuture is true', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { id: 'acc_1', name: 'Main Account', type: 'Checking', openingBalance: 500 });

    const seriesId = 'series_recurring_999';
    const txPast = { id: 'tx_rec_1', accountId: 'acc_1', amount: 50, type: 'expense', date: '2026-07-01', recurrence: { seriesId } };
    const txSelected = { id: 'tx_rec_2', accountId: 'acc_1', amount: 50, type: 'expense', date: '2026-08-01', recurrence: { seriesId } };
    const txFuture = { id: 'tx_rec_3', accountId: 'acc_1', amount: 50, type: 'expense', date: '2026-09-01', recurrence: { seriesId } };

    global.window.Store.state.transactions.push(txPast, txSelected, txFuture);

    global.window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
    global.window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: 'tx_rec_2' });

    global.window.Store.dispatch('DELETE_BULK_TRANSACTIONS', { ids: ['tx_rec_2'], deleteFuture: true });

    const state = global.window.Store.getState();
    expect(state.transactions.find(t => t.id === 'tx_rec_1')).toBeDefined(); // Past instance preserved
    expect(state.transactions.find(t => t.id === 'tx_rec_2')).toBeUndefined(); // Selected deleted
    expect(state.transactions.find(t => t.id === 'tx_rec_3')).toBeUndefined(); // Future instance deleted
  });

  it('dynamically recalculates account balance from Opening Balance baseline after batch deletion', () => {
    // Account created with Opening Balance 100 on 2026-01-01
    global.window.Store.dispatch('ADD_ACCOUNT', { id: 'acc_bal_1', name: 'Balance Account', openingBalance: 100, openingDate: '2026-01-01' });

    // Add 3 transactions: expense 30, income 50, expense 20
    const tx1 = { id: 'tx_b1', accountId: 'acc_bal_1', amount: 30, type: 'expense', date: '2026-01-10' };
    const tx2 = { id: 'tx_b2', accountId: 'acc_bal_1', amount: 50, type: 'income', date: '2026-01-15' };
    const tx3 = { id: 'tx_b3', accountId: 'acc_bal_1', amount: 20, type: 'expense', date: '2026-01-20' };

    global.window.Store.state.transactions.push(tx1, tx2, tx3);

    // Initial balance: 100 - 30 + 50 - 20 = 100
    expect(global.window.Store.getAccountBalance('acc_bal_1')).toBe(100);

    // Batch delete tx1 (expense 30) and tx3 (expense 20)
    global.window.Store.dispatch('DELETE_BULK_TRANSACTIONS', { ids: ['tx_b1', 'tx_b3'] });

    // Recalculated balance: 100 + 50 = 150
    expect(global.window.Store.getAccountBalance('acc_bal_1')).toBe(150);
  });

  it('renders TransactionItem with checkbox when in selection mode', () => {
    const tx = { id: 'tx_demo', accountId: 'acc_1', amount: 15.5, type: 'expense', date: '2026-07-31' };
    const html = global.window.Components.TransactionItem.render(tx, null, null, {
      isSelectionMode: true,
      isSelected: true
    });

    expect(html).toContain('custom-selection-checkbox');
    expect(html).toContain('tx-select-checkbox');
    expect(html).toContain('checked');
    expect(html).toContain('list-item-selected');
  });

  it('renders TransactionsView with contextual action bar, selected count, cancel button, and delete button', () => {
    global.window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
    global.window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id: 'tx_1' });
    const state = global.window.Store.getState();

    const html = global.window.Views.TransactionsView.render(state);
    expect(html).toContain('contextual-header-bar');
    expect(html).toContain('1 Selected');
    expect(html).toContain('selection-count-label');
    expect(html).toContain('btn-cancel-selection');
    expect(html).toContain('btn-bulk-delete-header');
    // v0.80: the duplicate floating bottom bar is gone — top bar is the only one.
    expect(html).not.toContain('bulk-selection-bar');
    expect(html).not.toContain('btn-cancel-selection-bottom');
  });

  it('formats 2-digit selection count (25 Selected) with white-space: nowrap to prevent text wrapping', () => {
    global.window.Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
    const ids = Array.from({ length: 25 }, (_, i) => `tx_batch_${i}`);
    ids.forEach(id => global.window.Store.dispatch('TOGGLE_TRANSACTION_SELECTION', { id }));

    const state = global.window.Store.getState();
    const html = global.window.Views.TransactionsView.render(state);

    expect(html).toContain('25 Selected');
    expect(html).toContain('white-space: nowrap');
    expect(html).toContain('Delete (25)');
  });
});
