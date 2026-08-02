import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('computeBalanceForecast with accounts opened in different months', () => {
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
      }
    };
    global.localStorage = global.window.localStorage;

    executeFile('db.js');
    executeFile('store.js');
    global.window.Store.init();

    // Mock today to 2026-08-01
    const mockDate = new Date(2026, 7, 1); // August 1, 2026
    vi.setSystemTime(mockDate);
  });

  it('should not produce huge variance when an account opening balance date is in the current month', () => {
    // Account 1: opened in 2025 with €9,800
    global.window.Store.dispatch('ADD_ACCOUNT', {
      id: 'acc-1',
      name: 'BPI',
      openingBalance: 9800,
      openingDate: '2025-08-01'
    });

    // Account 2: opened in August 2026 (current month) with €7,000
    global.window.Store.dispatch('ADD_ACCOUNT', {
      id: 'acc-2',
      name: 'TR',
      openingBalance: 7000,
      openingDate: '2026-08-01'
    });

    // Compute forecast
    const forecast = global.window.Store.computeBalanceForecast();

    // Total baseline: 9800 + 7000 = 16800
    // Total today: 9800 + 7000 = 16800
    // todayVariation should be 0.0%, NOT +9,763,350% or +71.4%
    expect(forecast.todayVariation).toBeCloseTo(0.0, 1);
    expect(forecast.eomVariation).toBeCloseTo(0.0, 1);
  });

  it('should compute accurate % variation for actual transactions during the current month', () => {
    // Account 1: opened in 2025 with €10,000
    global.window.Store.dispatch('ADD_ACCOUNT', {
      id: 'acc-1',
      name: 'BPI',
      openingBalance: 10000,
      openingDate: '2025-08-01'
    });

    // Account 2: opened on 2026-08-01 with €5,000
    global.window.Store.dispatch('ADD_ACCOUNT', {
      id: 'acc-2',
      name: 'TR',
      openingBalance: 5000,
      openingDate: '2026-08-01'
    });

    // Add an income transaction of €150 in August on Account 2
    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income',
      amount: 150,
      accountId: 'acc-2',
      date: '2026-08-01'
    });

    const forecast = global.window.Store.computeBalanceForecast();

    // Baseline: 10000 + 5000 = 15000
    // Today: 10000 + 5000 + 150 = 15150
    // Pct: (150 / 15000) * 100 = 1.0%
    expect(forecast.todayVariation).toBeCloseTo(1.0, 1);
  });
});
