import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-35): the transaction form shows a required "Amount received
// (USD)" field only for a transfer whose From and To use different
// currencies; each leg is saved in its own currency. A received figure belongs
// to the To currency it was typed for (D-U8-12), and a pre-1.0.2 1:1 pair
// opens with an EMPTY received field so a save must say what arrived (D-U8-4).
// Harness: formValidation.test.js (jsdom, store + components + views, en).
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
  S().dispatch('ADD_ACCOUNT', { name: 'UK Savings', openingBalance: 500, openingDate: '2026-09-01', currency: 'GBP' });
};

const renderView = (name) => {
  const view = global.window.Views[name];
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

const pick = (id, value) => {
  $(id).value = value;
  $(id).dispatchEvent(new Event('change'));
};
const visible = (id) => $(id) && $(id).style.display !== 'none';
const save = () => $('btn-save-tx').click();
const legs = () => S().getState().transactions.filter(t => t.transferRef);
const pairOf = (ref) => ({
  exp: S().getState().transactions.find(t => t.transferRef === ref && t.type === 'expense'),
  inc: S().getState().transactions.find(t => t.transferRef === ref && t.type === 'income')
});

// New transfer form, From Main → To US Checking
const openTransfer = (to = 'US Checking') => {
  renderView('AddTransactionView');
  $('toggle-transfer').click();
  pick('tx-account', accId('Main'));
  pick('tx-transfer-to', accId(to));
};

const seedPair = (sent, received) => {
  S().dispatch('ADD_TRANSFER', {
    amount: sent,
    ...(received !== undefined ? { receivedAmount: received } : {}),
    expenseAccountId: accId('Main'),
    incomeAccountId: accId('US Checking'),
    date: '2026-10-02',
    note: 'FX',
    tags: []
  });
  return legs().find(t => t.comment === 'FX').transferRef;
};

describe('Cross-currency transfer form (1.0.2 BUG-35)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete global.window._draftTxFormState;
  });

  it('From and To in different currencies show Amount received (USD)', () => {
    renderView('AddTransactionView');
    expect($('group-received')).not.toBeNull();
    expect(visible('group-received')).toBe(false); // expense: hidden
    $('toggle-transfer').click();
    pick('tx-account', accId('Main'));
    pick('tx-transfer-to', accId('US Checking'));
    expect(visible('group-received')).toBe(true);
    expect($('label-received').textContent).toBe('Amount received (USD)');
    expect($('received-currency-symbol').textContent).toBe('$');
    expect($('tx-received-hint').textContent).toContain('from EUR to USD');
    pick('tx-transfer-to', accId('Savings'));
    expect(visible('group-received')).toBe(false);
    // back to Expense hides it too
    pick('tx-transfer-to', accId('US Checking'));
    $('toggle-expense').click();
    expect(visible('group-received')).toBe(false);
  });

  it('a cross-currency save without the received amount is refused inline', () => {
    openTransfer();
    $('tx-amount').value = '100';
    save();
    const err = $('tx-received-amount-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe('Enter the amount received, greater than zero.');
    expect($('tx-received-amount').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe($('tx-received-amount'));
    expect(legs()).toHaveLength(0);
    expect(global.window.alert).not.toHaveBeenCalled();
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
  });

  it('a zero received amount is refused too', () => {
    openTransfer();
    $('tx-amount').value = '100';
    $('tx-received-amount').value = '0';
    save();
    expect($('tx-received-amount-error')).not.toBeNull();
    expect(legs()).toHaveLength(0);
  });

  it('an unreadable received amount is refused (form.amountInvalid)', () => {
    openTransfer();
    $('tx-amount').value = '100';
    $('tx-received-amount').value = '12a';
    save();
    expect($('tx-received-amount-error')).not.toBeNull();
    expect(legs()).toHaveLength(0);
  });

  it('one pass: empty amount and empty received both show at once', () => {
    openTransfer();
    $('tx-amount').value = '';
    save();
    expect(container.querySelectorAll('.field-error')).toHaveLength(2);
    expect($('tx-amount-error')).not.toBeNull();
    expect($('tx-received-amount-error')).not.toBeNull();
    expect(document.activeElement).toBe($('tx-amount'));
    expect(legs()).toHaveLength(0);
  });

  it('a same-currency transfer never asks for a received amount', () => {
    openTransfer('Savings');
    $('tx-amount').value = '40';
    save();
    expect($('tx-received-amount-error')).toBeNull();
    expect(legs().map(t => t.amount)).toEqual([40, 40]);
  });

  it('a cross-currency save stores 100 / 117', () => {
    openTransfer();
    $('tx-amount').value = '100';
    $('tx-received-amount').value = '117';
    save();
    expect(legs()).toHaveLength(2);
    const exp = legs().find(t => t.type === 'expense');
    const inc = legs().find(t => t.type === 'income');
    expect(exp.amount).toBe(100);
    expect(exp.accountId).toBe(accId('Main'));
    expect(inc.amount).toBe(117);
    expect(inc.accountId).toBe(accId('US Checking'));
    expect(S().getAccountBalance(accId('US Checking'))).toBe(1117);
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');
  });

  it('editing the USD leg opens with €100 sent and $117 received', () => {
    const ref = seedPair(100, 117);
    params = { id: pairOf(ref).inc.id };
    renderView('AddTransactionView');
    expect($('tx-account').value).toBe(accId('Main'));
    expect($('tx-transfer-to').value).toBe(accId('US Checking'));
    expect($('tx-amount').value).toBe('100');
    expect($('currency-symbol').textContent).toBe('€');
    expect($('tx-received-amount').value).toBe('117');
    expect(visible('group-received')).toBe(true);
    expect($('label-received').textContent).toBe('Amount received (USD)');
  });

  it('re-saving that edit unchanged keeps 100 / 117', () => {
    const ref = seedPair(100, 117);
    params = { id: pairOf(ref).inc.id };
    renderView('AddTransactionView');
    save();
    expect($('tx-received-amount-error')).toBeNull();
    expect(pairOf(ref).exp.amount).toBe(100);
    expect(pairOf(ref).inc.amount).toBe(117);
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');
  });

  it('a 1:1 cross-currency pair opens with an EMPTY received field and an unchanged save is refused inline (D-U8-4)', () => {
    const ref = seedPair(100); // pre-1.0.2 shape: 100 / 100 across currencies
    expect(pairOf(ref).inc.amount).toBe(100);
    params = { id: pairOf(ref).exp.id };
    renderView('AddTransactionView');
    expect($('tx-amount').value).toBe('100');
    expect(visible('group-received')).toBe(true);
    expect($('tx-received-amount').value).toBe('');
    save();
    expect($('tx-received-amount-error').textContent).toBe('Enter the amount received, greater than zero.');
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
    // entering what arrived corrects the pair
    $('tx-received-amount').value = '117';
    save();
    expect(pairOf(ref).exp.amount).toBe(100);
    expect(pairOf(ref).inc.amount).toBe(117);
  });

  it('switching To from a € account to a $ account shows an empty received field', () => {
    openTransfer('Savings');
    $('tx-amount').value = '100';
    expect(visible('group-received')).toBe(false);
    pick('tx-transfer-to', accId('US Checking'));
    expect(visible('group-received')).toBe(true);
    expect($('tx-received-amount').value).toBe('');
  });

  it('a received figure belongs to its currency (D-U8-12)', () => {
    openTransfer();
    $('tx-received-amount').value = '117';
    pick('tx-transfer-to', accId('UK Savings'));
    expect(visible('group-received')).toBe(true);
    expect($('tx-received-amount').value).toBe('');
    expect($('label-received').textContent).toBe('Amount received (GBP)');
    expect($('received-currency-symbol').textContent).toBe('£');
    pick('tx-transfer-to', accId('US Checking'));
    expect($('tx-received-amount').value).toBe('117');
    expect($('label-received').textContent).toBe('Amount received (USD)');
  });

  it('moving From onto To swaps the two figures (D-U8-12)', () => {
    openTransfer();
    $('tx-amount').value = '100';
    $('tx-received-amount').value = '117';
    pick('tx-account', accId('US Checking'));
    expect($('tx-transfer-to').value).toBe(accId('Main'));
    expect($('tx-amount').value).toBe('117');
    expect($('tx-received-amount').value).toBe('100');
    expect($('label-received').textContent).toBe('Amount received (EUR)');
    expect($('currency-symbol').textContent).toBe('$');
    save();
    const exp = legs().find(t => t.type === 'expense');
    const inc = legs().find(t => t.type === 'income');
    expect(exp.accountId).toBe(accId('US Checking'));
    expect(exp.amount).toBe(117);
    expect(inc.accountId).toBe(accId('Main'));
    expect(inc.amount).toBe(100);
  });

  it('the draft keeps the received amount across a round trip (new category, etc.)', () => {
    openTransfer();
    $('tx-amount').value = '100';
    $('tx-received-amount').value = '117';
    // captureDraftTxFormState is module-private: the category picker trigger
    // runs it (the "+ New category" path re-renders the form from the draft).
    global.window.Components.CategorySelectionModal = { show: vi.fn() };
    $('tx-category').dispatchEvent(new Event('mousedown', { cancelable: true }));
    expect(global.window._draftTxFormState.receivedAmount).toBe('117');
    expect(global.window._draftTxFormState.transferTo).toBe(accId('US Checking'));
    renderView('AddTransactionView');
    expect(visible('group-received')).toBe(true);
    expect($('tx-received-amount').value).toBe('117');
    expect($('tx-amount').value).toBe('100');
  });

  it('a hidden received figure keeps its own currency through a draft round trip (D-U8-12)', () => {
    // 1. Main (EUR) → US Checking (USD): 100 sent, 117 received
    openTransfer();
    $('tx-amount').value = '100';
    $('tx-received-amount').value = '117';
    // 2. To = Savings (EUR): the field hides, the $117 stays parked
    pick('tx-transfer-to', accId('Savings'));
    expect(visible('group-received')).toBe(false);
    // 3. Expense → category picker captures the draft → the form re-renders from it
    $('toggle-expense').click();
    global.window.Components.CategorySelectionModal = { show: vi.fn() };
    $('tx-category').dispatchEvent(new Event('mousedown', { cancelable: true }));
    expect(global.window._draftTxFormState.transferTo).toBe(accId('Savings'));
    renderView('AddTransactionView');
    // 4. Transfer, From = US Checking (To stays Savings, EUR)
    $('toggle-transfer').click();
    pick('tx-account', accId('US Checking'));
    expect($('tx-transfer-to').value).toBe(accId('Savings'));
    expect(visible('group-received')).toBe(true);
    expect($('label-received').textContent).toBe('Amount received (EUR)');
    // never "117 (EUR)": the figure was typed for USD
    expect($('tx-received-amount').value).toBe('');
    save();
    expect($('tx-received-amount-error')).not.toBeNull();
    expect(legs()).toHaveLength(0);
    // the $117 comes back once To is a USD account again
    pick('tx-account', accId('Main'));
    pick('tx-transfer-to', accId('US Checking'));
    expect($('label-received').textContent).toBe('Amount received (USD)');
    expect($('tx-received-amount').value).toBe('117');
  });
});
