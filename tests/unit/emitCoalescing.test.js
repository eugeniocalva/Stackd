import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context (store.test.js pattern)
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// v0.93 render-model change: Store.emit coalesces — any number of dispatches in
// one tick produce exactly ONE listener pass on the next microtask, while state
// itself still mutates synchronously. Boot uses emit({ sync: true }).
describe('Store emit coalescing (v0.93 P1)', () => {
  beforeEach(() => {
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
      localStorage: (() => {
        const bag = {};
        return {
          getItem: k => (k in bag ? bag[k] : null),
          setItem: (k, v) => { bag[k] = String(v); },
          removeItem: k => { delete bag[k]; },
        };
      })(),
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    global.window.Store.init();
  });

  it('coalesces a burst of dispatches into a single listener pass', async () => {
    const Store = global.window.Store;
    let calls = 0;
    Store.subscribe(() => { calls++; });

    // The wallet-tap shape: several dispatches back to back in one tick.
    Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: ['acc_x'] } });
    Store.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { accounts: ['acc_x'] } });
    Store.dispatch('SET_VIEW', 'transactions');

    expect(calls).toBe(0);            // nothing yet — same tick
    expect(Store.getState().activeView).toBe('transactions'); // state is already current
    await Promise.resolve();          // one microtask
    expect(calls).toBe(1);            // exactly one render pass
  });

  it('emit({ sync: true }) flushes immediately and swallows a pending microtask flush', async () => {
    const Store = global.window.Store;
    let calls = 0;
    Store.subscribe(() => { calls++; });

    Store.dispatch('SET_VIEW', 'analytics'); // queues a microtask flush
    Store.emit({ sync: true });              // boot-style forced flush
    expect(calls).toBe(1);

    await Promise.resolve();
    expect(calls).toBe(1); // the queued microtask must not double-fire
  });

  it('separate ticks emit separately', async () => {
    const Store = global.window.Store;
    let calls = 0;
    Store.subscribe(() => { calls++; });

    Store.dispatch('SET_VIEW', 'analytics');
    await Promise.resolve();
    Store.dispatch('SET_VIEW', 'dashboard');
    await Promise.resolve();
    expect(calls).toBe(2);
  });
});

// v0.93: getAccountOpeningDate is memoized (it used to be a full-array .find
// inside per-transaction filter predicates — O(T²)). The index must drop on
// every dispatch so mutations are visible immediately.
describe('Opening-date index memoization (v0.93 P1)', () => {
  beforeEach(() => {
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
      localStorage: (() => {
        const bag = {};
        return {
          getItem: k => (k in bag ? bag[k] : null),
          setItem: (k, v) => { bag[k] = String(v); },
          removeItem: k => { delete bag[k]; },
        };
      })(),
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    global.window.Store.init();
  });

  it('reflects a newly created account opening date after the dispatch that adds it', () => {
    const Store = global.window.Store;
    Store.dispatch('ADD_ACCOUNT', { name: 'BPI', openingBalance: 100, openingDate: '2026-01-15' });
    const acc = Store.getState().accounts.find(a => a.name === 'BPI');
    expect(Store.getAccountOpeningDate(acc.id)).toBe('2026-01-15');

    // Warm the memo, then mutate again — the index must invalidate.
    Store.dispatch('ADD_ACCOUNT', { name: 'TR', openingBalance: 50, openingDate: '2026-03-02' });
    const acc2 = Store.getState().accounts.find(a => a.name === 'TR');
    expect(Store.getAccountOpeningDate(acc2.id)).toBe('2026-03-02');
    expect(Store.getAccountOpeningDate(acc.id)).toBe('2026-01-15');
    expect(Store.getAccountOpeningDate('missing')).toBe(null);
  });

  it('pre-opening transactions stay excluded from balances (memoized path)', () => {
    const Store = global.window.Store;
    Store.dispatch('ADD_ACCOUNT', { name: 'BPI', openingBalance: 100, openingDate: '2026-01-15' });
    const acc = Store.getState().accounts.find(a => a.name === 'BPI');
    Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 40, accountId: acc.id, categoryId: 'cat_groceries',
      date: '2025-12-01', tags: []
    });
    Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 10, accountId: acc.id, categoryId: 'cat_groceries',
      date: '2026-02-01', tags: []
    });
    // Pre-opening expense (2025-12-01) must not count: 100 - 10 = 90.
    expect(Store.getAccountBalance(acc.id)).toBe(90);
  });
});
