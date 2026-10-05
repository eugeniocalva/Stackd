import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-50): #tx-amount and #bdg-amount were type=number inputs read with
// parseFloat. Chromium keeps only one separator of '1,234.56', so the form
// saved 1.23456. Both are now inputmode=decimal TEXT inputs read by
// Store.parseAmount (tested on its own in amountParse.test.js); this file
// covers the form and budget wiring.
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
const expenses = () => S().getState().transactions.filter(t => t.type === 'expense');

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
  executeFile('i18n/it.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  S().init();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2026-01-01' });
};

const renderView = (name) => {
  const view = global.window.Views[name];
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

const logExpense = (text) => {
  params = {};
  renderView('AddTransactionView');
  $('tx-amount').value = text;
  $('tx-category').value = 'cat_groceries';
  $('btn-save-tx').click();
};

describe('Typed money amounts (1.0.2 BUG-50)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a grouped amount saves in full', () => {
    renderView('AddTransactionView');
    const input = $('tx-amount');
    expect(input.type).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.hasAttribute('step')).toBe(false);

    logExpense('1,234.56');
    expect(expenses().map(t => t.amount)).toEqual([1234.56]);
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');

    logExpense('1.234,56');
    expect(expenses().map(t => t.amount)).toEqual([1234.56, 1234.56]);
  });

  it('an ambiguous amount is refused inline', () => {
    logExpense('1.234');
    expect(expenses()).toHaveLength(0);
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
    expect($('tx-amount-error').textContent).toBe('Enter a valid amount, like 1,234.56.');
    expect(document.activeElement).toBe($('tx-amount'));
    // under the figure, like the "required" message
    expect(container.querySelector('.amount-input-group').nextElementSibling).toBe($('tx-amount-error'));

    // more than two decimals and junk are refused the same way
    logExpense('1.23456');
    expect($('tx-amount-error').textContent).toBe('Enter a valid amount, like 1,234.56.');
    logExpense('12a');
    expect($('tx-amount-error').textContent).toBe('Enter a valid amount, like 1,234.56.');
    // empty / zero keep the existing message
    logExpense('');
    expect($('tx-amount-error').textContent).toBe('Enter an amount greater than zero.');
    logExpense('-5');
    expect($('tx-amount-error').textContent).toBe('Enter an amount greater than zero.');
    expect(expenses()).toHaveLength(0);
  });

  it('the example in the message follows the UI language', () => {
    global.window.I18n.setLang('it');
    logExpense('1,234');
    expect(expenses()).toHaveLength(0);
    expect($('tx-amount-error').textContent).toBe('Inserisci un importo valido, ad esempio 1234,56.');
    // '2.500' is the Italian grouping reading
    logExpense('2.500');
    expect(expenses().map(t => t.amount)).toEqual([2500]);
  });

  it('a legacy 3-decimal row is prefilled at cents and never re-read 1000× larger', () => {
    global.window.I18n.setLang('it');
    const main = accId('Main');
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 1.234, accountId: main, categoryId: 'cat_groceries', date: '2026-09-30', comment: 'legacy' });
    const row = S().getState().transactions.find(t => t.comment === 'legacy');
    params = { id: row.id };
    renderView('AddTransactionView');
    expect($('tx-amount').value).toBe('1.23');
    $('btn-save-tx').click();
    expect(S().getState().transactions.find(t => t.id === row.id).amount).toBe(1.23);

    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 1.23456, accountId: main, categoryId: 'cat_groceries', date: '2026-09-29', comment: 'legacy2' });
    const row2 = S().getState().transactions.find(t => t.comment === 'legacy2');
    params = { id: row2.id };
    renderView('AddTransactionView');
    expect($('tx-amount').value).toBe('1.23');
    $('btn-save-tx').click();
    expect(S().getState().transactions.find(t => t.id === row2.id).amount).toBe(1.23);
  });

  it('budget limit uses the same reader', () => {
    const BV = global.window.Views.BudgetView;
    const openEditor = (text) => {
      BV.editCategoryId = 'cat_groceries';
      renderView('BudgetView');
      const input = $('bdg-amount');
      expect(input.type).toBe('text');
      expect(input.getAttribute('inputmode')).toBe('decimal');
      input.value = text;
      $('btn-bdg-save').click();
    };
    const budget = () => S().getState().budgets.find(b => b.categoryId === 'cat_groceries');

    openEditor('1,500.00');
    expect(budget().amount).toBe(1500);
    expect(BV.editCategoryId).toBeNull();

    const spy = vi.spyOn(S(), 'dispatch');
    ['1.5.0', '-50'].forEach(text => {
      openEditor(text);
      expect($('bdg-amount-error').textContent).toBe('Enter a valid amount, like 1,234.56.');
      expect(BV.editCategoryId).toBe('cat_groceries');
      expect(spy).not.toHaveBeenCalledWith('SAVE_BUDGET', expect.anything());
    });
    expect(budget().amount).toBe(1500);
    spy.mockRestore();

    // the prefill is rounded to cents
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 1.23456, startDate: '', endDate: null, isCumulative: false });
    BV.editCategoryId = 'cat_groceries';
    renderView('BudgetView');
    expect($('bdg-amount').value).toBe('1.23');

    // empty = no limit (0)
    openEditor('');
    expect(budget().amount).toBe(0);
    expect(BV.editCategoryId).toBeNull();
  });
});
