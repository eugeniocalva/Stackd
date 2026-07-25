import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Dynamic Balance Color Formatting', () => {
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
  });

  it('renders Green text-income for positive account tile balance on Home page', () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    global.window.Store.state.accounts = [
      { id: 'acc1', name: 'Checking', balance: 0, color: '#000' }
    ];
    global.window.Store.state.transactions = [
      { id: 'tx1', type: 'income', amount: 500, accountId: 'acc1', date: todayStr }
    ];
    const state = global.window.Store.getState();
    const html = global.window.Views.DashboardView.render(state);
    
    expect(html).toContain('€500.00');
    expect(html).toContain('color: var(--color-income)');
  });

  it('renders Red text-expense for negative account tile balance on Home page', () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    global.window.Store.state.accounts = [
      { id: 'acc1', name: 'Credit Card', balance: 0, color: '#000' }
    ];
    global.window.Store.state.transactions = [
      { id: 'tx1', type: 'expense', amount: 150.50, accountId: 'acc1', date: todayStr }
    ];
    const state = global.window.Store.getState();
    const html = global.window.Views.DashboardView.render(state);

    expect(html).toContain('-€150.50');
    expect(html).toContain('color: var(--color-expense)');
  });

  it('renders default text color for zero balance on Home page tile', () => {
    global.window.Store.state.accounts = [
      { id: 'acc1', name: 'Zero Acc', balance: 0, color: '#000' }
    ];
    global.window.Store.state.transactions = [];
    const state = global.window.Store.getState();
    const html = global.window.Views.DashboardView.render(state);

    expect(html).toContain('€0.00');
    expect(html).toContain('var(--text-primary)');
  });

  it('renders Start and End balances on History page with green for positive, red for negative, and default for zero', () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const prevMonthStr = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}-01`;

    global.window.Store.state.accounts = [
      { id: 'acc1', name: 'Bank', balance: 0, color: '#000' }
    ];
    // Start balance prior to current month = +100
    global.window.Store.state.transactions = [
      { id: 'tx1', type: 'income', amount: 100, accountId: 'acc1', date: prevMonthStr },
      { id: 'tx2', type: 'expense', amount: 300, accountId: 'acc1', date: todayStr }
    ];

    const html = window.Views.TransactionsView.render(global.window.Store.state);

    // Start balance = €100.00 (income / green)
    expect(html).toContain('color: var(--color-income)');
    // End balance = 100 - 300 = -200 (red)
    expect(html).toContain('color: var(--color-expense)');
    expect(html).toContain('-€200.00');
  });
});
