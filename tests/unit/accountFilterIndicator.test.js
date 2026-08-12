import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('AnalyticsView Account Filter Indicator', () => {
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
    global.window.Components = {
      AdvancedFilterBar: { render: () => '<div>FilterBar</div>', attachEvents: vi.fn() },
      NetFlowChart: { render: () => '<div>Chart</div>' },
      CategoryDonutChart: { render: () => '<div>Donut</div>' },
      TransactionItem: { render: () => '<div>Item</div>' },
      fitNumericFontSize: (values, maxRem) => `${maxRem}rem`
    };
    
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('views.js');

    global.window.Store.init();
  });

  it('renders "Partial accounts shown" when a subset of accounts is selected', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Bank 1', openingBalance: 100 });
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Bank 2', openingBalance: 200 });
    
    const accounts = global.window.Store.getState().accounts;
    expect(accounts.length).toBe(2);

    // Select only 1 account out of 2
    global.window.Store.dispatch('UPDATE_FILTERS', {
      page: 'analytics',
      filters: {
        accounts: [accounts[0].id]
      }
    });

    const state = global.window.Store.getState();
    const html = global.window.Views.AnalyticsView.render(state);

    expect(html).toContain('Partial accounts shown');
  });

  it('does NOT render "Partial accounts shown" when all accounts are selected or filters.accounts is empty', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Bank 1', openingBalance: 100 });
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Bank 2', openingBalance: 200 });

    // Empty accounts array -> All accounts shown
    global.window.Store.dispatch('UPDATE_FILTERS', {
      page: 'analytics',
      filters: {
        accounts: []
      }
    });

    const state = global.window.Store.getState();
    const html = global.window.Views.AnalyticsView.render(state);

    expect(html).not.toContain('Partial accounts shown');
  });
});
