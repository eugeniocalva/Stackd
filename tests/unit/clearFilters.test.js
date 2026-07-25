import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('CLEAR_ALL_FILTERS Action', () => {
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
    
    executeFile('db.js');
    executeFile('store.js');
    
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00'));

    global.window.Store.init();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets analyticsFilters back to default state when CLEAR_ALL_FILTERS is dispatched', () => {
    // Set custom filters on analytics
    global.window.Store.dispatch('UPDATE_FILTERS', {
      page: 'analytics',
      filters: {
        period: { type: 'year', value: '2026-01-01', start: '', end: '' },
        types: ['expense'],
        accounts: ['acc-1'],
        categories: ['cat-1']
      }
    });

    let state = global.window.Store.getState();
    expect(state.analyticsFilters.period.type).toBe('year');
    expect(state.analyticsFilters.types).toEqual(['expense']);
    expect(state.analyticsFilters.accounts).toEqual(['acc-1']);
    expect(state.analyticsFilters.categories).toEqual(['cat-1']);

    // Clear all filters
    global.window.Store.dispatch('CLEAR_ALL_FILTERS', { page: 'analytics' });

    state = global.window.Store.getState();
    expect(state.analyticsFilters.period.type).toBe('month');
    expect(state.analyticsFilters.types).toEqual([]);
    expect(state.analyticsFilters.accounts).toEqual([]);
    expect(state.analyticsFilters.categories).toEqual([]);
    expect(state.analyticsFilters.tags).toEqual([]);
  });

  it('resets historyFilters back to default state when CLEAR_ALL_FILTERS is dispatched for history', () => {
    global.window.Store.dispatch('UPDATE_FILTERS', {
      page: 'history',
      filters: {
        period: { type: 'custom', value: '', start: '2026-01-01', end: '2026-03-31' },
        types: ['income'],
        accounts: ['acc-2']
      }
    });

    let state = global.window.Store.getState();
    expect(state.historyFilters.period.type).toBe('custom');
    expect(state.historyFilters.types).toEqual(['income']);

    global.window.Store.dispatch('CLEAR_ALL_FILTERS', { page: 'history' });

    state = global.window.Store.getState();
    expect(state.historyFilters.period.type).toBe('month');
    expect(state.historyFilters.types).toEqual([]);
    expect(state.historyFilters.accounts).toEqual([]);
  });
});
