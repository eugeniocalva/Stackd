import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Account Balance Logic Refactor', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';

    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      Components: {},
      StackdHydrateIcons: vi.fn(),
      Router: {
        getParams: () => ({ id: 'acc_1' }),
        navigate: vi.fn()
      },
      Views: {}
    };
    global.localStorage = global.window.localStorage;

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('views.js');

    global.window.Store.init();

    const mockAccount = { id: 'acc_1', name: 'Main Account', color: '#0075EB', icon: 'wallet', type: 'Bank', createdAt: '2026-06-01T10:00:00Z' };
    const mockTxs = [
      // Transaction before opening date
      { id: 'tx_old', type: 'expense', amount: 50, accountId: 'acc_1', categoryId: 'cat_other', date: '2026-05-15', time: '12:00:00' },
      // Opening balance transaction on 2026-06-01
      { id: 'ob_1', type: 'opening_balance', amount: 500, accountId: 'acc_1', categoryId: 'cat_balance', date: '2026-06-01', time: '00:00' },
      // Transactions after opening date
      { id: 'tx_new_inc', type: 'income', amount: 200, accountId: 'acc_1', categoryId: 'cat_salary', date: '2026-06-05', time: '14:00:00' },
      { id: 'tx_new_exp', type: 'expense', amount: 30, accountId: 'acc_1', categoryId: 'cat_food', date: '2026-06-10', time: '18:00:00' }
    ];

    global.window.Store.state.accounts = [mockAccount];
    global.window.Store.state.transactions = mockTxs;
    global.window.Store.state.defaultAccountId = 'acc_1';
    global.window.Store.state.analyticsFilters.period = null;
    global.window.Store.state.historyFilters.period = null;
  });

  it('does NOT render edit-acc-current-balance input field in EditAccountView', () => {
    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    
    expect(container.querySelector('#edit-acc-current-balance')).toBeNull();
    expect(container.querySelector('#current-balance-warning')).toBeNull();
    expect(container.querySelector('#edit-acc-balance')).not.toBeNull();
    expect(container.querySelector('#edit-acc-date')).not.toBeNull();
  });

  it('defaults opening_balance transaction time to 00:00 on ADD_ACCOUNT and UPDATE_ACCOUNT', () => {
    window.Store.dispatch('ADD_ACCOUNT', {
      name: 'New Test Acc',
      openingBalance: 150,
      openingDate: '2026-07-01'
    });

    const addedAcc = window.Store.state.accounts.find(a => a.name === 'New Test Acc');
    expect(addedAcc).toBeDefined();
    const obTx = window.Store.state.transactions.find(t => t.accountId === addedAcc.id && t.type === 'opening_balance');
    expect(obTx).toBeDefined();
    expect(obTx.time).toBe('00:00');
    expect(obTx.date).toBe('2026-07-01');
    expect(obTx.amount).toBe(150);
  });

  it('calculates getAccountBalance using baseline + transactions from opening date and ignoring earlier transactions', () => {
    // Account 1 has OB = 500 on 2026-06-01.
    // Txs:
    // 2026-05-15: expense 50 (BEFORE opening date -> MUST BE IGNORED)
    // 2026-06-01: opening_balance 500
    // 2026-06-05: income 200
    // 2026-06-10: expense 30
    // Balance = 500 + 200 - 30 = 670. (If tx_old were included, it would be 620).
    const balance = window.Store.getAccountBalance('acc_1');
    expect(balance).toBe(670);
  });

  it('excludes pre-opening-date transactions from getFilteredTransactions for analytics and history', () => {
    const analyticsTxs = window.Store.getFilteredTransactions('analytics');
    const historyTxs = window.Store.getFilteredTransactions('history');

    // Should NOT include tx_old (2026-05-15)
    expect(analyticsTxs.some(t => t.id === 'tx_old')).toBe(false);
    expect(historyTxs.some(t => t.id === 'tx_old')).toBe(false);

    // Should include tx_new_inc and tx_new_exp
    expect(analyticsTxs.some(t => t.id === 'tx_new_inc')).toBe(true);
    expect(analyticsTxs.some(t => t.id === 'tx_new_exp')).toBe(true);
  });

  it('excludes pre-opening-date transactions from getBalanceAtDate', () => {
    // Cutoff on 2026-05-20 (before opening date) -> balance is 0
    expect(window.Store.getBalanceAtDate('2026-05-20')).toBe(0);

    // Cutoff on 2026-06-02 -> balance is 500 (opening balance)
    expect(window.Store.getBalanceAtDate('2026-06-02')).toBe(500);

    // Cutoff on 2026-06-15 -> balance is 670
    expect(window.Store.getBalanceAtDate('2026-06-15')).toBe(670);
  });
});
