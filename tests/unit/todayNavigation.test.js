import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Today Navigation in History View', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    global.document = {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({ addEventListener: vi.fn(), appendChild: vi.fn() }))
    };
    global.requestAnimationFrame = (cb) => cb();

    executeFile('db.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T12:00:00'));

    global.window.Store.init();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clicking Today button in History filter bar maintains period filters and calls scrollToToday', () => {
    // Set initial historyFilters period to month
    global.window.Store.dispatch('UPDATE_FILTERS', {
      page: 'history',
      filters: { period: { type: 'month', value: '2026-07', start: '', end: '' } }
    });

    const scrollToTodaySpy = vi.spyOn(global.window.Views.TransactionsView, 'scrollToToday').mockImplementation(() => {});

    // Create a mock container with btn-today-history
    const btnToday = { addEventListener: vi.fn() };
    const mockContainer = {
      querySelector: (selector) => {
        if (selector === '#btn-today-history') return btnToday;
        return null;
      },
      querySelectorAll: () => []
    };

    global.window.Components.AdvancedFilterBar.attachEvents(mockContainer, 'history');

    // Trigger click on btnToday
    expect(btnToday.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    const clickHandler = btnToday.addEventListener.mock.calls.find(c => c[0] === 'click')[1];
    clickHandler();

    // Verify period filter remains 'month' and scrollToToday was called
    const state = global.window.Store.getState();
    expect(state.historyFilters.period.type).toBe('month');
    expect(scrollToTodaySpy).toHaveBeenCalledWith(mockContainer);
  });

  it('TransactionsView.scrollToToday targets exact today date group when present', () => {
    const targetGroup = { id: 'tx-2026-07-23', offsetTop: 350 };
    const otherGroup = { id: 'tx-2026-07-20', offsetTop: 500 };
    let scrollArgs = null;

    const mockContainer = {
      querySelectorAll: (selector) => {
        if (selector === '.date-group-container[id^="tx-"]') {
          return [targetGroup, otherGroup];
        }
        return [];
      },
      scrollTo: (opts) => {
        scrollArgs = opts;
      }
    };

    global.window.Views.TransactionsView.scrollToToday(mockContainer);
    vi.runAllTimers();

    expect(scrollArgs).not.toBeNull();
    expect(scrollArgs.behavior).toBe('smooth');
    expect(scrollArgs.top).toBeGreaterThanOrEqual(0);
  });

  it('TransactionsView.scrollToToday targets closest previous date when today has no transactions', () => {
    const olderGroup1 = { id: 'tx-2026-07-20', offsetTop: 300 };
    const olderGroup2 = { id: 'tx-2026-07-15', offsetTop: 500 };
    const futureGroup = { id: 'tx-2026-07-25', offsetTop: 100 };
    let scrollArgs = null;

    const mockContainer = {
      querySelectorAll: (selector) => {
        if (selector === '.date-group-container[id^="tx-"]') {
          return [futureGroup, olderGroup1, olderGroup2];
        }
        return [];
      },
      scrollTo: (opts) => {
        scrollArgs = opts;
      }
    };

    global.window.Views.TransactionsView.scrollToToday(mockContainer);
    vi.runAllTimers();

    expect(scrollArgs).not.toBeNull();
    expect(scrollArgs.behavior).toBe('smooth');
    // Calculated Y offset from tx-2026-07-20 (offsetTop: 300) minus header height (180) minus 16 offset = 104
    expect(scrollArgs.top).toBe(104);
  });

  it('TransactionsView.scrollToToday scrolls to top when no dates on or prior to today exist', () => {
    const futureGroup1 = { id: 'tx-2026-07-25', offsetTop: 200 };
    const futureGroup2 = { id: 'tx-2026-07-28', offsetTop: 400 };
    let scrollArgs = null;

    const mockContainer = {
      querySelectorAll: (selector) => {
        if (selector === '.date-group-container[id^="tx-"]') {
          return [futureGroup1, futureGroup2];
        }
        return [];
      },
      scrollTo: (opts) => {
        scrollArgs = opts;
      }
    };

    global.window.Views.TransactionsView.scrollToToday(mockContainer);
    vi.runAllTimers();

    expect(scrollArgs).toEqual({ top: 0, behavior: 'smooth' });
  });
});
