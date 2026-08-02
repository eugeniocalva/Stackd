import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Absolute Variance Display Unit Tests', () => {
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

  it('returns todayAbsDiff and eomAbsDiff in computeBalanceForecast', () => {
    // Add baseline account opened prior to August 2026
    global.window.Store.dispatch('ADD_ACCOUNT', {
      id: 'acc-base',
      name: 'Checking',
      openingBalance: 1000,
      openingDate: '2025-01-01'
    });

    // Add income transaction of €200 in current month
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income',
      amount: 200,
      accountId: 'acc-base',
      date: '2026-08-10'
    });

    const forecast = global.window.Store.computeBalanceForecast();

    // Baseline: 1000
    // Today: 1200
    // todayAbsDiff: 200
    // todayVariation: 20%
    expect(forecast.todayAbsDiff).toBe(200);
    expect(forecast.todayVariation).toBeCloseTo(20.0, 1);
  });

  it('renders absolute currency value before percentage in DashboardView variance indicators', () => {
    global.window.Store.state.currency = 'EUR';
    global.window.Store.dispatch('ADD_ACCOUNT', {
      id: 'acc-var',
      name: 'Main Wallet',
      openingBalance: 1000,
      openingDate: '2025-01-01'
    });

    // Add expense of €250 on 2026-08-05
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 250,
      accountId: 'acc-var',
      date: '2026-08-05'
    });

    const state = global.window.Store.getState();
    const html = global.window.Views.DashboardView.render(state);

    // Should display -€250.00 (-25.0%) vs. start of mo.
    expect(html).toContain('-€250.00 (-25.0%) vs. start of mo.');
    expect(html).toContain('var(--color-expense)');
    expect(html).toContain('as of today');
    expect(html).toContain('projected EOM');
  });
});
