import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Multi-Period Filtering Integration', () => {
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
    global.window.Components = {
        PeriodSwitcher: { render: vi.fn(), attachEvents: vi.fn() },
        PeriodPicker: { show: vi.fn() }
    };
    
    // Load dependencies
    executeFile('db.js');
    executeFile('store.js');
    
    // Mock system time to Wednesday, April 15, 2026 BEFORE store init
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00'));

    // Initialize store
    global.window.Store.init();
    global.window.Store.dispatch('RESET_PERIOD'); // Ensure activePeriod grabs mocked date
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters transactions correctly for "Today"', () => {
    // Add transactions
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const accId = global.window.Store.getState().accounts[0].id;

    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-04-15', amount: 100, type: 'income', accountId: accId });
    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-04-14', amount: 50, type: 'expense', accountId: accId });

    global.window.Store.dispatch('SET_PERIOD_TYPE', 'today');
    const state = global.window.Store.getState();
    const filtered = state.transactions.filter(t => global.window.Store.isDateInPeriod(t.date, state.activePeriod));

    expect(filtered.length).toBe(1);
    expect(filtered[0].date).toBe('2026-04-15');
  });

  it('filters transactions correctly for "Week" (Mon-Sun)', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const accId = global.window.Store.getState().accounts[0].id;

    // Apr 15 is Wed. Week is Apr 13 (Mon) to Apr 19 (Sun)
    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-04-13', amount: 10, type: 'expense', accountId: accId });
    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-04-15', amount: 20, type: 'expense', accountId: accId });
    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-04-12', amount: 30, type: 'expense', accountId: accId }); // Previous week (Sun)

    global.window.Store.dispatch('SET_PERIOD_TYPE', 'week');
    const state = global.window.Store.getState();
    const filtered = state.transactions.filter(t => global.window.Store.isDateInPeriod(t.date, state.activePeriod));

    expect(filtered.length).toBe(2);
    expect(filtered.map(t => t.date)).toContain('2026-04-13');
    expect(filtered.map(t => t.date)).toContain('2026-04-15');
  });

  it('filters transactions correctly for "Month"', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const accId = global.window.Store.getState().accounts[0].id;

    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-04-01', amount: 10, type: 'expense', accountId: accId });
    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-04-30', amount: 20, type: 'expense', accountId: accId });
    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-03-31', amount: 30, type: 'expense', accountId: accId });

    global.window.Store.dispatch('SET_PERIOD_TYPE', 'month');
    const state = global.window.Store.getState();
    const filtered = state.transactions.filter(t => global.window.Store.isDateInPeriod(t.date, state.activePeriod));

    expect(filtered.length).toBe(2);
  });

  it('filters transactions correctly for "Year"', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const accId = global.window.Store.getState().accounts[0].id;

    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-01-01', amount: 10, type: 'expense', accountId: accId });
    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2026-12-31', amount: 20, type: 'expense', accountId: accId });
    global.window.Store.dispatch('ADD_TRANSACTION', { date: '2025-12-31', amount: 30, type: 'expense', accountId: accId });

    global.window.Store.dispatch('SET_PERIOD_TYPE', 'year');
    const state = global.window.Store.getState();
    const filtered = state.transactions.filter(t => global.window.Store.isDateInPeriod(t.date, state.activePeriod));

    expect(filtered.length).toBe(2);
  });

  it('navigates periods correctly via NAVIGATE_PERIOD', () => {
    global.window.Store.dispatch('SET_PERIOD_TYPE', 'month'); // Apr 2026
    
    global.window.Store.dispatch('NAVIGATE_PERIOD', -1);
    let state = global.window.Store.getState();
    expect(state.activePeriod.value.startsWith('2026-03')).toBe(true);

    global.window.Store.dispatch('NAVIGATE_PERIOD', 1);
    state = global.window.Store.getState();
    expect(state.activePeriod.value.startsWith('2026-04')).toBe(true);
  });
});
