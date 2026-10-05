import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-39): a new log ignored the Default Wallet and preselected the
// alphabetically first account, so the currency prefix, the saved account and
// the transfer From all followed the wrong wallet. A new log now starts on the
// Default Wallet; if none is set or it was deleted, on the first account by
// name (the select's order). Drafts with a valid account and edits keep theirs.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let params = {};
let container;

const S = () => global.window.Store;
const $ = (id) => document.getElementById(id);
const accId = (name) => S().getState().accounts.find(a => a.name === name).id;

const boot = () => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  container = $('router-view');
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: {
      getItem: vi.fn((k) => (k === 'stackd_v1_currency' ? JSON.stringify('EUR') : null)),
      setItem: vi.fn(),
      removeItem: vi.fn()
    },
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn() },
    alert: vi.fn()
  };
  global.localStorage = global.window.localStorage;
  global.requestAnimationFrame = (cb) => cb();
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  S().init();
};

const add = (name, extra = {}) => S().dispatch('ADD_ACCOUNT', { name, openingBalance: 100, openingDate: '2026-01-01', ...extra });

const renderView = (name) => {
  const view = global.window.Views[name];
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

describe('New log preselects the Default Wallet (1.0.2 BUG-39)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    delete global.window?._draftTxFormState;
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete global.window._draftTxFormState;
  });

  it('a new log preselects the Default Wallet', () => {
    add('Revolut'); // first account -> becomes the Default Wallet
    add('Cash');
    const revolut = accId('Revolut');
    const cash = accId('Cash');
    expect(S().getState().defaultAccountId).toBe(revolut);

    renderView('AddTransactionView');
    expect($('tx-account').value).toBe(revolut);

    $('tx-amount').value = '18.20';
    $('tx-category').value = 'cat_groceries';
    $('btn-save-tx').click();
    const exp = S().getState().transactions.find(t => t.type === 'expense');
    expect(exp.accountId).toBe(revolut);
    expect(exp.amount).toBe(18.2);
    expect(S().getAccountBalance(cash)).toBe(100);
    expect(S().getAccountBalance(revolut)).toBe(81.8);
  });

  it('the prefix follows the preselected account, including the fallback', () => {
    add('Main'); // EUR, default
    add('Amex', { currency: 'USD' });
    renderView('AddTransactionView');
    expect($('tx-account').value).toBe(accId('Main'));
    expect($('currency-symbol').textContent).toBe('€');

    // A deleted / stale default falls back to the first account by name.
    // SET_DEFAULT_ACCOUNT refuses dead ids since 1.0.2 (BUG-34), so plant
    // the stale value the way a 1.0/1.0.1 install stored it.
    S().state.defaultAccountId = 'gone';
    renderView('AddTransactionView');
    expect($('tx-account').value).toBe(accId('Amex'));
    expect($('currency-symbol').textContent).toBe('$');
  });

  it('Transfer From is the default; To differs', () => {
    add('Savings Pot'); // default
    add('Main Checking');
    const pot = accId('Savings Pot');
    renderView('AddTransactionView');
    $('toggle-transfer').click();
    expect($('tx-account').value).toBe(pot);
    expect($('tx-transfer-to').value).not.toBe('');
    expect($('tx-transfer-to').value).not.toBe(pot);
    expect($('tx-transfer-to').value).toBe(accId('Main Checking'));
  });

  it('a stale draft account falls back; a valid draft and an edited row keep theirs', () => {
    add('Revolut'); // default
    add('Cash');
    const revolut = accId('Revolut');
    const cash = accId('Cash');

    // stale draft (e.g. a loan prefill naming a deleted account)
    global.window._draftTxFormState = { account: 'gone', amount: '436.48', type: 'expense' };
    renderView('AddTransactionView');
    expect($('tx-account').value).toBe(revolut);
    expect($('tx-amount').value).toBe('436.48');

    // a valid draft keeps its account
    global.window._draftTxFormState = { account: cash, amount: '12', type: 'expense' };
    renderView('AddTransactionView');
    expect($('tx-account').value).toBe(cash);

    // editing a row on Cash keeps Cash
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 5, accountId: cash, categoryId: 'cat_groceries', date: '2026-09-30', comment: 'x' });
    const row = S().getState().transactions.find(t => t.comment === 'x');
    params = { id: row.id };
    renderView('AddTransactionView');
    expect($('tx-account').value).toBe(cash);
  });
});
