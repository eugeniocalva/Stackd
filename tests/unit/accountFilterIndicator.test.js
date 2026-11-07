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
      NetFlowChart: { render: () => '<div>Chart</div>' },
      CategoryDonutChart: { render: () => '<div>Donut</div>' },
      TransactionItem: { render: () => '<div>Item</div>' },
      fitNumericFontSize: (values, maxRem) => `${maxRem}rem`
    };
    
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    // 1.2.2 (HG-10 P3) the real PeriodBar (its accounts chip replaced the red
    // "Partial accounts shown" line); the charts stay stubbed
    const stubs = global.window.Components;
    executeFile('components.js');
    global.window.Components = { ...global.window.Components, ...stubs };
    executeFile('views.js');

    global.window.Store.init();
  });

  it('shows the accounts chip when a subset of accounts is selected', () => {
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

    expect(html).toMatch(/data-filter-kind="accounts"[^>]*aria-label="Remove filter: Bank 1"/);
    expect(html).toContain('aria-label="Filters, 1 active"');
    expect(html).not.toContain('Partial accounts shown');
  });

  it('shows no accounts chip when every account is shown (filters.accounts empty)', () => {
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

    expect(html).not.toContain('data-filter-kind="accounts"');
    expect(html).not.toContain('Partial accounts shown');
  });
});
