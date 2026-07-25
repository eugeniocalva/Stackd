import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Overview Balance Fix (Today Capping)', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-id'
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      StackdDB: {
        load: (key, def) => def,
        save: vi.fn(),
        generateId: () => 'test-id'
      }
    };
    global.localStorage = global.window.localStorage;
    
    executeFile('db.js');
    executeFile('store.js');
    global.window.Store.init();
    
    // Set system time to a known date: 2026-04-17
    const mockDate = new Date(2026, 3, 17); // Month is 0-indexed, so 3 is April
    vi.setSystemTime(mockDate);
  });

  it('should NOT include future transactions in the current month balance for compute12MonthBalances', () => {
    // 1. Add account with an early opening date
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
    const account = global.window.Store.getState().accounts[0];

    // 2. Add transaction TODAY (2026-04-17)
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 100,
      accountId: account.id,
      date: '2026-04-17'
    });

    // 3. Add transaction in the FUTURE of the current month (2026-04-25)
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 500,
      accountId: account.id,
      date: '2026-04-25'
    });

    // 4. Calculate 12 month balances
    const balances = global.window.Store.compute12MonthBalances();
    const currentMonthLabel = new Date(2026, 3, 17).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const currentMonthBalanceRow = balances.find(b => b.label === currentMonthLabel);

    // Expected balance: 1000 (opening) - 100 (today expense) = 900
    // The future expense of 500 should be IGNORED because of the capping at today.
    expect(currentMonthBalanceRow.balance).toBe(900);
  });

  it('should still include the full month for past months', () => {
     // 1. Add account with an early opening date
     global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
     const account = global.window.Store.getState().accounts[0];
 
     // 2. Add transaction in PAST month (March 2026)
     global.window.Store.dispatch('ADD_TRANSACTION', {
       type: 'expense',
       amount: 200,
       accountId: account.id,
       date: '2026-03-31'
     });
 
     const balances = global.window.Store.compute12MonthBalances();
     const marchLabel = new Date(2026, 2, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
     const marchBalanceRow = balances.find(b => b.label === marchLabel);
 
     // Expected balance: 1000 (opening) - 200 = 800
     expect(marchBalanceRow.balance).toBe(800);
  });
});
