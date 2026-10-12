import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.3 (BUG-138): editing a transfer and switching it to Income kept the
// From account and the SENT amount — the income landed on the account the
// money left. Now the toggles move the form between the pair's sides:
// Income = To + what arrived (same currency: the amount; across currencies:
// Amount received, or the stored income leg for a 1:1 legacy pair), Expense =
// From + the sent amount, Transfer = the pair restored. Either leg may be the
// one tapped. New logs are unchanged (toggles only restyle).
// Harness: crossCurrencyTransferForm.test.js.
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
const bal = (name) => Math.round(S().getAccountBalance(accId(name)) * 100) / 100;

const boot = () => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  container = $('router-view');
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
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
  S().dispatch('SET_CURRENCY', 'EUR');
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2026-09-01' });
  S().dispatch('ADD_ACCOUNT', { name: 'US Checking', openingBalance: 1000, openingDate: '2026-09-01', currency: 'USD' });
  S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 300, openingDate: '2026-09-01' });
};

const renderView = (name) => {
  const view = global.window.Views[name];
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

const seedPair = (to, sent, received) => {
  S().dispatch('ADD_TRANSFER', {
    amount: sent,
    ...(received !== undefined ? { receivedAmount: received } : {}),
    expenseAccountId: accId('Main'),
    incomeAccountId: accId(to),
    date: '2026-10-02',
    note: 'Move',
    tags: []
  });
  const legs = S().getState().transactions.filter(t => t.transferRef && t.comment === 'Move');
  return { exp: legs.find(t => t.type === 'expense'), inc: legs.find(t => t.type === 'income') };
};

const open = (tx) => { params = { id: tx.id }; renderView('AddTransactionView'); };
const visible = (id) => $(id) && $(id).style.display !== 'none';
const rows = () => S().getState().transactions.filter(t => t.comment === 'Move');

describe('Transfer → Income / Expense in the edit form (1.0.3 BUG-138)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const tapped of ['inc', 'exp']) {
    it(`same currency, tapped ${tapped} leg: Income moves to the To account; the save keeps one income there`, () => {
      const pair = seedPair('Savings', 100);
      open(pair[tapped]);
      $('toggle-income').click();
      expect($('tx-account').value).toBe(accId('Savings'));
      expect($('tx-amount').value).toBe('100');
      $('tx-category').value = 'cat_salary';
      $('btn-save-tx').click();
      expect(rows()).toHaveLength(1);
      expect(rows()[0]).toMatchObject({ type: 'income', accountId: accId('Savings'), amount: 100, transferRef: null });
      expect(bal('Savings')).toBe(400);
      expect(bal('Main')).toBe(2000);
    });
  }

  it('Expense keeps the From account and the sent amount', () => {
    const pair = seedPair('Savings', 100);
    open(pair.inc);
    $('toggle-expense').click();
    expect($('tx-account').value).toBe(accId('Main'));
    expect($('tx-amount').value).toBe('100');
    $('tx-category').value = 'cat_groceries';
    $('btn-save-tx').click();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ type: 'expense', accountId: accId('Main'), amount: 100 });
    expect(bal('Main')).toBe(1900);
    expect(bal('Savings')).toBe(300);
  });

  it('Income then Transfer restores From, To and the amount; a save leaves the pair as it was', () => {
    const pair = seedPair('Savings', 100);
    open(pair.inc);
    $('toggle-income').click();
    $('toggle-transfer').click();
    expect($('tx-account').value).toBe(accId('Main'));
    expect($('tx-transfer-to').value).toBe(accId('Savings'));
    expect($('tx-amount').value).toBe('100');
    $('btn-save-tx').click();
    expect(rows()).toHaveLength(2);
    expect(bal('Main')).toBe(1900);
    expect(bal('Savings')).toBe(400);
  });

  it('across currencies: Income = To in its currency with the amount received', () => {
    const pair = seedPair('US Checking', 100, 117);
    open(pair.inc);
    expect($('tx-received-amount').value).toBe('117');
    $('toggle-income').click();
    expect($('tx-account').value).toBe(accId('US Checking'));
    expect($('tx-amount').value).toBe('117');
    expect($('currency-symbol').textContent).toBe('$');
    expect(visible('group-received')).toBe(false);
    $('tx-category').value = 'cat_salary';
    $('btn-save-tx').click();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ type: 'income', accountId: accId('US Checking'), amount: 117 });
    expect(bal('US Checking')).toBe(1117);
    expect(bal('Main')).toBe(2000);
  });

  it('across currencies: a figure received in $ is never carried to a £ To account (review finding)', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'UK', openingBalance: 500, openingDate: '2026-09-01', currency: 'GBP' });
    const pair = seedPair('US Checking', 100, 117);
    open(pair.inc);
    $('tx-transfer-to').value = accId('UK');
    $('tx-transfer-to').dispatchEvent(new Event('change'));
    $('toggle-income').click();
    expect($('tx-account').value).toBe(accId('UK'));
    expect($('tx-amount').value).toBe('');
    expect($('currency-symbol').textContent).toBe('£');
    $('tx-category').value = 'cat_salary';
    $('btn-save-tx').click();
    expect(bal('UK')).toBe(500); // refused until the user types the £ amount
  });

  it('across currencies: Expense = From with the sent amount, in €', () => {
    const pair = seedPair('US Checking', 100, 117);
    open(pair.exp);
    $('toggle-expense').click();
    expect($('tx-account').value).toBe(accId('Main'));
    expect($('tx-amount').value).toBe('100');
    expect($('currency-symbol').textContent).toBe('€');
  });

  it('across currencies: Income then Transfer restores the received figure and its currency', () => {
    const pair = seedPair('US Checking', 100, 117);
    open(pair.exp);
    $('tx-received-amount').value = '118';
    $('toggle-income').click();
    expect($('tx-amount').value).toBe('118'); // the figure on screen, not the stored one
    $('toggle-transfer').click();
    expect($('tx-account').value).toBe(accId('Main'));
    expect($('tx-transfer-to').value).toBe(accId('US Checking'));
    expect($('tx-amount').value).toBe('100');
    expect(visible('group-received')).toBe(true);
    expect($('tx-received-amount').value).toBe('118');
    expect($('tx-received-amount').dataset.ccy).toBe('USD');
    $('btn-save-tx').click();
    expect(bal('US Checking')).toBe(1118);
    expect(bal('Main')).toBe(1900);
  });

  it('a pre-1.0.2 1:1 pair (received field empty) takes the stored income leg', () => {
    const pair = seedPair('US Checking', 100); // equal legs across currencies
    open(pair.inc);
    expect($('tx-received-amount').value).toBe('');
    $('toggle-income').click();
    expect($('tx-account').value).toBe(accId('US Checking'));
    expect($('tx-amount').value).toBe('100');
    $('toggle-transfer').click();
    expect($('tx-received-amount').value).toBe(''); // still asks what arrived
  });

  it('income <-> expense re-maps until the user changes the account or amount', () => {
    const pair = seedPair('Savings', 100);
    open(pair.inc);
    $('toggle-income').click();
    $('toggle-expense').click();
    expect($('tx-account').value).toBe(accId('Main'));
    $('toggle-income').click();
    expect($('tx-account').value).toBe(accId('Savings'));
    // the user's own figure survives the next toggle
    $('tx-amount').value = '95';
    $('tx-amount').dispatchEvent(new Event('input'));
    $('toggle-expense').click();
    expect($('tx-amount').value).toBe('95');
    expect($('tx-account').value).toBe(accId('Savings'));
  });

  it('a new log: the toggles never move the account or the amount', () => {
    params = {};
    renderView('AddTransactionView');
    $('tx-account').value = accId('Savings');
    $('tx-account').dispatchEvent(new Event('change'));
    $('tx-amount').value = '12';
    $('toggle-income').click();
    $('toggle-transfer').click();
    $('toggle-expense').click();
    expect($('tx-account').value).toBe(accId('Savings'));
    expect($('tx-amount').value).toBe('12');
  });
});
