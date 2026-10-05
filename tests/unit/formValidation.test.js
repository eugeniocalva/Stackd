import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-08 / BUG-18 / BUG-21): the transaction and account forms validate
// inline (message under the field, focus on the first invalid one) instead of
// a 1-second background flash or a system alert(); the To list never offers the
// From account; "Unknown" becomes a localized "Uncategorized".
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const TODAY = '2026-10-01';

let params = {};
let container;

const S = () => global.window.Store;
const $ = (id) => document.getElementById(id);
const accId = (name) => S().getState().accounts.find(a => a.name === name).id;

const boot = (accountNames = ['Main', 'Savings', 'Cash']) => {
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
  executeFile('i18n/fr.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  S().init();
  accountNames.forEach(name => S().dispatch('ADD_ACCOUNT', { name, openingBalance: 100, openingDate: '2026-01-01' }));
};

const renderView = (name) => {
  const view = global.window.Views[name];
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

const userTxCount = () => S().getState().transactions.filter(t => t.type !== 'opening_balance').length;

const setAmount = (v) => { $('tx-amount').value = v; };
const save = () => $('btn-save-tx').click();

describe('Transaction form validation (1.0.1 BUG-08 / BUG-18)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks an expense without a category and says so inline', () => {
    renderView('AddTransactionView');
    setAmount('42.30');
    save();
    expect(userTxCount()).toBe(0);
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
    const err = $('tx-category-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe('Choose a category.');
    expect(err.getAttribute('role')).toBe('alert');
    expect($('tx-category').getAttribute('aria-invalid')).toBe('true');
    expect($('tx-category').getAttribute('aria-describedby')).toBe('tx-category-error');
    expect(document.activeElement).toBe($('tx-category'));
    expect(global.window.alert).not.toHaveBeenCalled();
  });

  it('saves once a category is chosen', () => {
    renderView('AddTransactionView');
    setAmount('42.30');
    $('tx-category').value = 'cat_groceries';
    save();
    const txs = S().getState().transactions.filter(t => t.type === 'expense');
    expect(txs).toHaveLength(1);
    expect(txs[0].categoryId).toBe('cat_groceries');
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');
  });

  it('requires a category for income too', () => {
    renderView('AddTransactionView');
    $('toggle-income').click();
    setAmount('10');
    save();
    expect(userTxCount()).toBe(0);
    expect($('tx-category-error').textContent).toBe('Choose a category.');
  });

  it('shows both errors at once and focuses the first (amount)', () => {
    renderView('AddTransactionView');
    setAmount('');
    save();
    const amountErr = $('tx-amount-error');
    expect(amountErr.textContent).toBe('Enter an amount greater than zero.');
    // after the flex row, not inside it
    expect(container.querySelector('.amount-input-group').nextElementSibling).toBe(amountErr);
    expect($('tx-category-error')).not.toBeNull();
    expect(document.activeElement).toBe($('tx-amount'));
    expect(userTxCount()).toBe(0);
  });

  it('an amount of 0 is refused with the inline message', () => {
    renderView('AddTransactionView');
    setAmount('0');
    $('tx-category').value = 'cat_groceries';
    save();
    expect($('tx-amount-error')).not.toBeNull();
    expect($('tx-category-error')).toBeNull();
    expect(userTxCount()).toBe(0);
  });

  it('repeated saves leave exactly one message per field', () => {
    renderView('AddTransactionView');
    setAmount('');
    save();
    save();
    save();
    expect(container.querySelectorAll('#tx-amount-error')).toHaveLength(1);
    expect(container.querySelectorAll('#tx-category-error')).toHaveLength(1);
  });

  it('typing in the amount clears its message', () => {
    renderView('AddTransactionView');
    setAmount('');
    save();
    $('tx-amount').value = '5';
    $('tx-amount').dispatchEvent(new Event('input'));
    expect($('tx-amount-error')).toBeNull();
    expect($('tx-amount').hasAttribute('aria-invalid')).toBe(false);
  });

  it('picking a category in the picker clears the category message', () => {
    let pickerOpts = null;
    global.window.Components.CategorySelectionModal = { show: vi.fn((o) => { pickerOpts = o; }) };
    renderView('AddTransactionView');
    setAmount('12');
    save();
    expect($('tx-category-error')).not.toBeNull();
    $('tx-category').dispatchEvent(new Event('mousedown', { cancelable: true }));
    expect(pickerOpts).not.toBeNull();
    pickerOpts.onSelect({ id: 'cat_groceries' });
    expect($('tx-category-error')).toBeNull();
    expect($('tx-category').value).toBe('cat_groceries');
    save();
    expect(S().getState().transactions.filter(t => t.type === 'expense')).toHaveLength(1);
  });

  it('a type switch drops a stale category message', () => {
    renderView('AddTransactionView');
    setAmount('12');
    save();
    expect($('tx-category-error')).not.toBeNull();
    $('toggle-transfer').click();
    $('toggle-expense').click();
    expect($('tx-category-error')).toBeNull();
  });

  it('a transfer needs no category', () => {
    renderView('AddTransactionView');
    $('toggle-transfer').click();
    setAmount('25');
    save();
    const legs = S().getState().transactions.filter(t => t.transferRef);
    expect(legs).toHaveLength(2);
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');
  });

  it('editing a row whose category was later re-typed keeps it and saves', () => {
    const main = accId('Main');
    S().dispatch('ADD_CATEGORY', { id: 'cat_side', name: 'Side gig', icon: 'pin', typeHint: 'both' });
    S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 50, accountId: main, categoryId: 'cat_side', date: TODAY, comment: '' });
    const tx = S().getState().transactions.find(t => t.categoryId === 'cat_side');
    // The user narrows the category to expenses after logging income with it.
    S().dispatch('UPDATE_CATEGORY', { id: 'cat_side', name: 'Side gig', icon: 'pin', typeHint: 'expense' });

    params = { id: tx.id };
    renderView('AddTransactionView');
    expect($('tx-category').value).toBe('cat_side');
    $('tx-amount').value = '60';
    save();
    expect($('tx-category-error')).toBeNull();
    const after = S().getState().transactions.find(t => t.id === tx.id);
    expect(after.amount).toBe(60);
    expect(after.categoryId).toBe('cat_side');
  });

  it('editing an imported uncategorized row asks for a category (D4c)', () => {
    const main = accId('Main');
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 9, accountId: main, categoryId: '', date: TODAY, comment: 'bank row' });
    const tx = S().getState().transactions.find(t => t.comment === 'bank row');
    params = { id: tx.id };
    renderView('AddTransactionView');
    save();
    expect($('tx-category-error')).not.toBeNull();
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
  });
});

describe('Transfer To list + inline transfer/recurrence errors (1.0.1 BUG-21)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const optionValues = (id) => Array.from($(id).options).map(o => o.value);

  it('the To list never contains the From account', () => {
    boot();
    renderView('AddTransactionView');
    $('toggle-transfer').click();
    expect(optionValues('tx-transfer-to')).not.toContain($('tx-account').value);
    expect(optionValues('tx-transfer-to')).toHaveLength(2);
    ['Main', 'Savings', 'Cash'].forEach(name => {
      $('tx-account').value = accId(name);
      $('tx-account').dispatchEvent(new Event('change'));
      expect(optionValues('tx-transfer-to')).not.toContain(accId(name));
      expect($('tx-transfer-to').value).not.toBe('');
    });
  });

  it('moving From onto the current To swaps them', () => {
    boot();
    renderView('AddTransactionView');
    $('toggle-transfer').click();
    $('tx-account').value = accId('Main');
    $('tx-account').dispatchEvent(new Event('change'));
    $('tx-transfer-to').value = accId('Savings');
    $('tx-account').value = accId('Savings');
    $('tx-account').dispatchEvent(new Event('change'));
    expect($('tx-transfer-to').value).toBe(accId('Main'));
  });

  it('keeps the To choice when From changes to a third account', () => {
    boot();
    renderView('AddTransactionView');
    $('toggle-transfer').click();
    $('tx-account').value = accId('Main');
    $('tx-account').dispatchEvent(new Event('change'));
    $('tx-transfer-to').value = accId('Savings');
    $('tx-account').value = accId('Cash');
    $('tx-account').dispatchEvent(new Event('change'));
    expect($('tx-transfer-to').value).toBe(accId('Savings'));
  });

  it('a single-account user gets an inline "add a second account" message', () => {
    boot(['Main']);
    renderView('AddTransactionView');
    $('toggle-transfer').click();
    setAmount('10');
    save();
    expect(S().getState().transactions.filter(t => t.transferRef)).toHaveLength(0);
    expect($('tx-transfer-to-error').textContent).toBe('Add a second account to make a transfer.');
    expect(global.window.alert).not.toHaveBeenCalled();
  });

  it('a recurrence ending before the date is refused inline, without alert()', () => {
    boot();
    renderView('AddTransactionView');
    setAmount('10');
    $('tx-category').value = 'cat_rent';
    $('tx-is-recurrent').checked = true;
    $('tx-is-recurrent').dispatchEvent(new Event('change'));
    $('tx-recurrence-end-date').value = '2026-01-01';
    save();
    expect(userTxCount()).toBe(0);
    expect($('tx-recurrence-end-date-error').textContent).toBe("The recurrence end date can't be before the transaction date.");
    expect($('tx-recurrence-end-group').contains($('tx-recurrence-end-date-error'))).toBe(true);
    expect(global.window.alert).not.toHaveBeenCalled();
  });

  it('a same-account recurring transfer edit is refused BEFORE the scope sheet', () => {
    boot();
    const main = accId('Main');
    S().dispatch('ADD_TRANSFER', {
      amount: 20, expenseAccountId: main, incomeAccountId: accId('Savings'), date: TODAY, note: '',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-03-01' }, tags: []
    });
    const leg = S().getState().transactions.find(t => t.transferRef && t.type === 'expense' && t.date === TODAY);
    expect(leg.recurrence).toBeTruthy();
    const scopeSpy = vi.fn();
    global.window.Components.RecurringUpdateModal = { show: scopeSpy };
    params = { id: leg.id };
    renderView('AddTransactionView');
    // Force To == From (not offerable by the UI any more, but guard anyway).
    const opt = document.createElement('option');
    opt.value = main;
    $('tx-transfer-to').appendChild(opt);
    $('tx-transfer-to').value = main;
    const before = JSON.stringify(S().getState().transactions);
    save();
    expect(scopeSpy).not.toHaveBeenCalled();
    expect($('tx-transfer-to-error').textContent).toBe('Cannot transfer to the same account.');
    expect(JSON.stringify(S().getState().transactions)).toBe(before);
    expect(global.window.alert).not.toHaveBeenCalled();
  });

  it('editing a legacy same-account transfer shows a placeholder instead of guessing', () => {
    boot();
    const main = accId('Main');
    const ref = 'legacy-ref';
    const st = S().getState();
    st.transactions.push(
      { id: 'leg_out', type: 'expense', amount: 5, accountId: main, categoryId: '', date: TODAY, transferRef: ref },
      { id: 'leg_in', type: 'income', amount: 5, accountId: main, categoryId: '', date: TODAY, transferRef: ref }
    );
    params = { id: 'leg_out' };
    renderView('AddTransactionView');
    const to = $('tx-transfer-to');
    expect(to.value).toBe('');
    expect(to.options[0].disabled).toBe(true);
    expect(optionValues('tx-transfer-to')).not.toContain(main);
    save();
    expect($('tx-transfer-to-error').textContent).toBe('Cannot transfer to the same account.');
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
    // An explicit choice then goes through.
    to.value = accId('Savings');
    save();
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');
    expect(S().getState().transactions.find(t => t.transferRef === ref && t.type === 'income').accountId).toBe(accId('Savings'));
  });
});

describe('Account form name validation (1.0.1 BUG-18)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    boot([]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('an empty name shows a message, focuses the field and dispatches nothing', () => {
    renderView('EditAccountView');
    $('btn-edit-acc-save').click();
    expect(S().getState().accounts).toHaveLength(0);
    const err = $('edit-acc-name-error');
    expect(err.textContent).toBe('Enter an account name.');
    expect(document.activeElement).toBe($('edit-acc-name'));
    expect($('edit-acc-name').getAttribute('aria-invalid')).toBe('true');
    $('btn-edit-acc-save').click();
    expect(container.querySelectorAll('#edit-acc-name-error')).toHaveLength(1);

    $('edit-acc-name').value = 'Wallet';
    $('edit-acc-name').dispatchEvent(new Event('input'));
    expect($('edit-acc-name-error')).toBeNull();
    $('btn-edit-acc-save').click();
    expect(S().getState().accounts.map(a => a.name)).toEqual(['Wallet']);
  });

  it('a quote in the account name survives the value attribute', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Bob\'s "Big" pot', openingBalance: 0, openingDate: '2026-01-01' });
    params = { id: S().getState().accounts[0].id };
    renderView('EditAccountView');
    expect($('edit-acc-name').value).toBe('Bob\'s "Big" pot');
  });
});

describe('Uncategorized label (1.0.1 BUG-08)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    boot(['Main']);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('TransactionItem labels a row without category "Uncategorized", a transfer leg "Transfer"', () => {
    const acc = S().getState().accounts[0];
    const html = global.window.Components.TransactionItem.render({ id: 'x', type: 'expense', amount: 3, accountId: acc.id, categoryId: '', date: TODAY }, null, acc);
    expect(html).toContain('Uncategorized');
    expect(html).not.toContain('Unknown');
    const leg = global.window.Components.TransactionItem.render({ id: 'y', type: 'expense', amount: 3, accountId: acc.id, categoryId: '', date: TODAY, transferRef: 'r' }, null, acc);
    expect(leg).toContain('Transfer');
  });

  it('computeCategoryDistribution names the bucket in the UI language', () => {
    const main = accId('Main');
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 7, accountId: main, categoryId: '', date: TODAY, comment: '' });
    const filters = { period: null, types: [], accounts: [], categories: [], tags: [] };
    const find = () => S().computeCategoryDistribution(filters, 'expense').find(d => d.id === 'uncategorized');
    expect(find().name).toBe('Uncategorized');
    global.window.I18n.setLang('fr');
    expect(find().name).toBe('Sans catégorie');
  });
});

// 1.0.2 (BUG-34): converting a saved expense to a transfer is a delete plus an
// add. Each used to save on its own, so at the storage quota the delete landed
// (it shrinks) and the transfer did not: the expense was gone for good. The
// form now runs the conversion as ONE change.
describe('Type conversion when storage is full (1.0.2, BUG-34)', () => {
  let qls;

  const makeQuotaStorage = () => {
    const map = new Map();
    const size = () => { let n = 0; map.forEach((v, k) => { n += k.length + v.length; }); return n; };
    const s = {
      quota: null,
      get length() { return map.size; },
      key: (i) => [...map.keys()][i] ?? null,
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => {
        const str = String(v);
        const cur = map.has(k) ? k.length + map.get(k).length : 0;
        if (s.quota != null && size() - cur + k.length + str.length > s.quota) {
          const e = new Error('The quota has been exceeded.');
          e.name = 'QuotaExceededError';
          throw e;
        }
        map.set(k, str);
      },
      removeItem: (k) => { map.delete(k); },
      size
    };
    return s;
  };

  const bootQuota = () => {
    document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
    container = $('router-view');
    qls = makeQuotaStorage();
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
      localStorage: qls,
      requestAnimationFrame: (cb) => cb(),
      StackdHydrateIcons: vi.fn(),
      Components: {},
      Views: {},
      Router: { getParams: () => params, navigate: vi.fn() },
      alert: vi.fn()
    };
    global.localStorage = qls;
    global.requestAnimationFrame = (cb) => cb();
    ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js'].forEach(executeFile);
    S().init();
    ['Main', 'Savings'].forEach(name => S().dispatch('ADD_ACCOUNT', { name, openingBalance: 100, openingDate: '2026-01-01' }));
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    bootQuota();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('converting a saved expense to a transfer that does not fit keeps the expense, in memory and on disk', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 42, accountId: accId('Main'), categoryId: 'cat_groceries', date: TODAY, comment: 'keep me' });
    const tx = S().getState().transactions.find(t => t.comment === 'keep me');
    const before = qls.getItem('stackd_v1_transactions');
    params = { id: tx.id };
    renderView('AddTransactionView');
    $('toggle-transfer').click();
    $('tx-transfer-to').value = accId('Savings');
    qls.quota = qls.size(); // no room: the delete fits, the two transfer legs do not

    save();

    expect(S().getState().transactions.some(t => t.id === tx.id)).toBe(true);
    expect(S().getState().transactions.some(t => t.transferRef)).toBe(false);
    expect(qls.getItem('stackd_v1_transactions')).toBe(before);
  });
});

describe('Required date (1.0.2 BUG-38 rider)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a cleared date is refused inline', () => {
    renderView('AddTransactionView');
    setAmount('10');
    $('tx-category').value = 'cat_groceries';
    $('tx-date').value = '';
    save();
    expect(userTxCount()).toBe(0);
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
    expect($('tx-date-error').textContent).toBe('Choose a date.');
    expect(document.activeElement).toBe($('tx-date'));
    expect(global.window.alert).not.toHaveBeenCalled();

    // A recurring log with a cleared date is refused the same way (it used to
    // throw RangeError on the end default and do nothing).
    $('tx-is-recurrent').checked = true;
    $('tx-is-recurrent').dispatchEvent(new Event('change'));
    $('tx-recurrence-end-date').value = '';
    save();
    expect(userTxCount()).toBe(0);
    expect($('tx-date-error').textContent).toBe('Choose a date.');

    // Picking a date clears the message and the save goes through.
    $('tx-date').value = '2026-10-01';
    $('tx-date').dispatchEvent(new Event('change'));
    expect($('tx-date-error')).toBeNull();
    save();
    expect(userTxCount()).toBeGreaterThan(0);
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');
  });
});
