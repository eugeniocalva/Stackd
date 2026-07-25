import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Negative Balance Display & Calculations', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    global.document = {
      getElementById: vi.fn((id) => {
        if (id === 'app') return global.document.body;
        return null;
      }),
      body: {
        appendChild: vi.fn(),
        querySelector: vi.fn()
      },
      createElement: (tag) => {
        const elem = {
          tagName: tag.toUpperCase(),
          className: '',
          id: '',
          innerHTML: '',
          style: {},
          classList: {
            add: vi.fn(),
            remove: vi.fn()
          },
          querySelector: vi.fn(),
          querySelectorAll: vi.fn(() => []),
          appendChild: vi.fn(),
          remove: vi.fn()
        };
        return elem;
      }
    };

    executeFile('db.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    global.window.Store.init();
    global.window.Store.state.currency = 'EUR';

    global.window.Store.state.accounts = [
      { id: 'acc_credit', name: 'Credit Card', balance: -17.80, color: '#ef4444' }
    ];
    global.window.Store.state.transactions = [
      { id: 'tx_1', type: 'expense', amount: 17.80, accountId: 'acc_credit', categoryId: 'cat1', date: '2026-07-01' }
    ];
    global.window.Store.state.defaultAccountId = 'acc_credit';
  });

  it('formats negative numbers with minus sign in Store.formatCurrency', () => {
    expect(global.window.Store.formatCurrency(-17.80)).toBe('-€17.80');
    expect(global.window.Store.formatCurrency(17.80)).toBe('€17.80');
  });

  it('renders negative balance on Home page wallet tile in red with minus sign', () => {
    const html = window.Views.DashboardView.render(window.Store.state);
    expect(html).toContain('-€17.80');
    expect(html).toContain('var(--color-expense)');
  });

  it('renders negative end balance on History page in red with minus sign', () => {
    const html = window.Views.TransactionsView.render(window.Store.state);
    expect(html).toContain('-€17.80');
    expect(html).toContain('color: var(--color-expense)');
  });
});
