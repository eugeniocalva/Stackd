import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Same executeFile pattern as store.test.js — src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let lastDownload = null;

describe('Per-account currency (v1.02, plan §6)', () => {
  // Seeds a USD-primary app with one USD account and one EUR account, each
  // holding income of 100 (USD) / 50 (EUR) on 2026-03-10.
  let usdId, eurId;

  const boot = () => {
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('export.js');
    global.window.StackdExport._download = (filename, content) => {
      lastDownload = { filename, content };
    };
    global.window.Store.init();
  };

  beforeEach(() => {
    let uid = 0;
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + (++uid) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    lastDownload = null;
    boot();

    window.Store.dispatch('ADD_ACCOUNT', { name: 'Checking', openingBalance: 0 });
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Euro Trip', openingBalance: 0, currency: 'EUR' });
    const accs = window.Store.getState().accounts;
    usdId = accs.find(a => a.name === 'Checking').id;
    eurId = accs.find(a => a.name === 'Euro Trip').id;

    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income', amount: 100, accountId: usdId, categoryId: 'cat_salary', date: '2026-03-10'
    });
    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income', amount: 50, accountId: eurId, categoryId: 'cat_salary', date: '2026-03-10'
    });
  });

  // ── account field + migration ──────────────────────────────────────────────

  it('ADD_ACCOUNT defaults to the primary currency, honours an explicit one', () => {
    expect(window.Store.getState().accounts.find(a => a.id === usdId).currency).toBe('USD');
    expect(window.Store.getState().accounts.find(a => a.id === eurId).currency).toBe('EUR');
  });

  it('UPDATE_ACCOUNT changes the currency and reclassifies aggregates', () => {
    expect(window.Store.getGlobalBalance()).toBe(100);
    window.Store.dispatch('UPDATE_ACCOUNT', { id: eurId, currency: 'USD' });
    expect(window.Store.getGlobalBalance()).toBe(150); // _primaryIdx invalidated by dispatch
  });

  it('boot migration stamps the primary currency on legacy accounts', () => {
    const legacy = [{ id: 'a1', name: 'Old', color: '#0075EB', icon: 'wallet', type: 'Bank', createdAt: '2026-01-01T00:00:00.000Z' }];
    let uid = 100;
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + (++uid) },
      localStorage: {
        getItem: vi.fn((key) => key === 'stackd_v1_accounts' ? JSON.stringify(legacy) : null),
        setItem: vi.fn(),
        removeItem: vi.fn()
      }
    };
    global.localStorage = global.window.localStorage;
    boot();

    expect(window.Store.getState().accounts[0].currency).toBe('USD');
    const writes = window.localStorage.setItem.mock.calls.filter(c => c[0] === 'stackd_v1_accounts');
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(writes[writes.length - 1][1])[0].currency).toBe('USD');
  });

  // ── formatCurrency / getAccountCurrency ────────────────────────────────────

  it('formatCurrency accepts a currency override without breaking the default', () => {
    expect(window.Store.formatCurrency(1234.5)).toBe('$1,234.50');
    expect(window.Store.formatCurrency(1234.5, 'EUR')).toBe('€1,234.50');
    expect(window.Store.formatCurrency(1234.5, 'JPY')).toBe('¥1,235'); // no decimals
    expect(window.Store.formatCurrency(1234.5)).toBe('$1,234.50'); // cache unpoisoned
    expect(window.Store.getAccountCurrency(eurId)).toBe('EUR');
    expect(window.Store.getAccountCurrency('nope')).toBe('USD'); // fallback = primary
  });

  // ── aggregation: exclude, never convert ────────────────────────────────────

  it('empty accountIds means primary-currency accounts only', () => {
    expect(window.Store.getGlobalBalance()).toBe(100);            // EUR 50 excluded
    expect(window.Store.getBalanceAtDate('2026-12-31')).toBe(100);
    expect(window.Store.getAccountBalance(eurId)).toBe(50);       // explicit id: untouched
    expect(window.Store.getBalanceAtDate('2026-12-31', [eurId, usdId])).toBe(150); // explicit list: user's call
  });

  it('analytics aggregates exclude foreign accounts, history keeps them visible', () => {
    const filters = {
      period: { type: 'custom', start: '2026-03-01', end: '2026-03-31' },
      types: [], accounts: [], categories: [], sortOrder: 'desc'
    };
    const analytics = window.Store.getFilteredTransactions('analytics', filters);
    expect(analytics).toHaveLength(1);
    expect(analytics[0].accountId).toBe(usdId);

    const history = window.Store.getFilteredTransactions('history', filters);
    expect(history.filter(t => t.type === 'income')).toHaveLength(2); // ledger shows all

    const summary = window.Store.computeAnalyticalSummary(filters);
    expect(summary.income).toBe(100);

    // explicit selection of the foreign account is respected
    const explicit = window.Store.getFilteredTransactions('analytics', { ...filters, accounts: [eurId] });
    expect(explicit).toHaveLength(1);
    expect(explicit[0].accountId).toBe(eurId);
  });

  it('net-flow, forecast and upcoming-impact exclude foreign accounts by default', () => {
    const filters = {
      period: { type: 'month', value: '2026-03-10', start: '', end: '' },
      types: [], accounts: [], categories: [], sortOrder: 'desc'
    };
    const buckets = window.Store.computeNetFlowData(filters) || [];
    const totalIn = buckets.reduce((s, b) => s + (b.income || 0), 0);
    expect(totalIn).toBe(100);

    const forecast = window.Store.computeBalanceForecast([]);
    expect(forecast).toBeTruthy(); // primary-only baseline; must not throw

    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 10, accountId: eurId, categoryId: 'cat_groceries',
      date: '2099-01-05', recurrence: { interval: 1, frequency: 'months', endDate: '2099-06-01' }
    });
    const impact = window.Store.computeUpcomingImpact('2099-12-31', []);
    // the EUR future expense must not count toward the primary upcoming net
    expect(impact.net).toBeGreaterThanOrEqual(0);
  });

  it('budget spend index skips foreign-account expenses', () => {
    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 30, accountId: usdId, categoryId: 'cat_groceries', date: '2026-03-12'
    });
    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 99, accountId: eurId, categoryId: 'cat_groceries', date: '2026-03-13'
    });
    window.Store.dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 200, isCumulative: false });
    const b = window.Store.getBudgetForMonth('cat_groceries', '2026-03');
    expect(b.spent).toBe(30); // EUR 99 stays out
  });

  it('SET_CURRENCY reclassifies which accounts are primary', () => {
    expect(window.Store.getGlobalBalance()).toBe(100);
    window.Store.dispatch('SET_CURRENCY', 'EUR');
    // now the EUR account is primary and the USD one is foreign
    expect(window.Store.getGlobalBalance()).toBe(50);
    expect(window.Store.foreignAccountCount()).toBe(1);
    expect(window.Store.primaryAccountIds()).toEqual([eurId]);
  });

  // ── export ─────────────────────────────────────────────────────────────────

  it('the accounts CSV carries the currency column', () => {
    window.StackdExport.exportAccounts(window.Store.getState());
    expect(lastDownload.filename).toBe('stackd_accounts.csv');
    const lines = lastDownload.content.split('\n');
    expect(lines[0]).toBe('id,name,opening_balance,created_at,currency');
    expect(lastDownload.content).toContain('EUR');
    expect(lastDownload.content).toContain('USD');
  });
});
