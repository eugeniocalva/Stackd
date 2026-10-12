import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.3 (BUG-42): a paste into the Opening Balance field is selection-aware.
// Over the whole field (all selected, or the field reads zero) the text is an
// amount read by Store.parseAmount; into part of it, the digits replace the
// selection and the decimal shift runs. It used to APPEND every digit
// ('1.234,56' over 0.00 → 1234.56 ok, over 50.00 → 500012345.6).
// 1.0.3 (BUG-46, Opening Balance only): the field's decimals follow the
// account currency (JPY none): ¥150,000 used to open at ¥1,500.
// 1.0.3 (BUG-154): an account in an unlisted currency keeps it on save.
// 1.0.3 (BUG-153): names compare with inner whitespace runs collapsed.
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
const obRow = (id) => S().getState().transactions.find(t => t.accountId === id && t.type === 'opening_balance');

const makeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: vi.fn(k => (m.has(k) ? m.get(k) : null)),
    setItem: vi.fn((k, v) => { m.set(k, String(v)); }),
    removeItem: vi.fn(k => { m.delete(k); }),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; }
  };
};

const boot = (seed = {}) => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  container = $('router-view');
  const storage = makeStorage({ stackd_v1_currency: JSON.stringify('EUR'), stackd_v1_homeWidgets: '[]', ...seed });
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: storage,
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn() },
    alert: vi.fn()
  };
  global.localStorage = storage;
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

const renderView = (name) => {
  const view = global.window.Views[name];
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

const paste = (el, text) => {
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { getData: () => text } });
  el.dispatchEvent(e);
  return e;
};
const typeDigits = (el, digits) => {
  for (const d of digits) { el.value = el.value + d; el.dispatchEvent(new Event('input')); }
};

describe('Opening Balance field (1.0.3 BUG-42 / BUG-46)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
    params = {};
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const newAccount = () => {
    boot();
    params = {};
    renderView('EditAccountView');
    return $('edit-acc-balance');
  };

  it('a paste over the whole field reads the amount (1.234,56 / 1500 / 99.9)', () => {
    const ob = newAccount();
    ob.value = '50.00';
    ob.setSelectionRange(0, ob.value.length);
    const e = paste(ob, '1.234,56');
    expect(e.defaultPrevented).toBe(true);
    expect(ob.value).toBe('1234.56');

    ob.setSelectionRange(0, ob.value.length);
    paste(ob, '1500');
    expect(ob.value).toBe('1500.00');

    ob.setSelectionRange(0, ob.value.length);
    paste(ob, '99.9');
    expect(ob.value).toBe('99.90');
  });

  it('a paste into a field that still reads 0.00 is a whole-field paste', () => {
    const ob = newAccount();
    expect(ob.value).toBe('0.00');
    ob.setSelectionRange(4, 4); // caret at the end
    paste(ob, '1500');
    expect(ob.value).toBe('1500.00');
  });

  it('a paste at the caret or over part of the field splices digits, then shifts', () => {
    const ob = newAccount();
    ob.value = '12.34';
    ob.setSelectionRange(5, 5);
    paste(ob, '5');
    expect(ob.value).toBe('123.45');

    ob.value = '12.34';
    ob.setSelectionRange(0, 2); // "12"
    paste(ob, '9');
    expect(ob.value).toBe('9.34');
  });

  it('a negative paste sets Negative; a positive one never clears it', () => {
    const ob = newAccount();
    paste(ob, '-450');
    expect(ob.value).toBe('450.00');
    expect($('btn-ob-neg').getAttribute('aria-pressed')).toBe('true');
    ob.setSelectionRange(0, ob.value.length);
    paste(ob, '300');
    expect(ob.value).toBe('300.00');
    expect($('btn-ob-neg').getAttribute('aria-pressed')).toBe('true');
  });

  it('text that is not an amount shows the field error and changes nothing', () => {
    const ob = newAccount();
    ob.value = '12.00';
    ob.setSelectionRange(0, 5);
    paste(ob, 'abc');
    expect(ob.value).toBe('12.00');
    expect($('edit-acc-balance-error').textContent).toContain('1,234.56');
  });

  it('Gboard clipboard chip (beforeinput insertFromPaste) takes the same path', () => {
    const ob = newAccount();
    const e = new Event('beforeinput', { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'inputType', { value: 'insertFromPaste' });
    Object.defineProperty(e, 'data', { value: '1500' });
    ob.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(ob.value).toBe('1500.00');
  });

  it('a whole-field paste saves that amount on a new account', () => {
    const ob = newAccount();
    $('edit-acc-name').value = 'Pasted';
    paste(ob, '1.234,56');
    $('btn-edit-acc-save').click();
    expect(obRow(accId('Pasted')).amount).toBe(1234.56);
  });

  it('JPY: no decimals — typing 150000 is ¥150,000, and the edit form opens at 150000', () => {
    const ob = newAccount();
    const ccy = $('edit-acc-currency');
    ccy.value = 'JPY';
    ccy.dispatchEvent(new Event('change'));
    expect(ob.value).toBe('0');
    expect(ob.placeholder).toBe('0');
    ob.value = '';
    typeDigits(ob, '150000');
    expect(ob.value).toBe('150000');
    $('edit-acc-name').value = 'Yen';
    $('btn-edit-acc-save').click();
    const yen = accId('Yen');
    expect(obRow(yen).amount).toBe(150000);

    params = { id: yen };
    renderView('EditAccountView');
    expect($('edit-acc-balance').value).toBe('150000');
    $('edit-acc-balance').setSelectionRange(0, 6);
    paste($('edit-acc-balance'), '200,000');
    expect($('edit-acc-balance').value).toBe('200000');
  });

  it('switching the currency keeps the figure, in the new decimals', () => {
    const ob = newAccount();
    ob.value = '';
    typeDigits(ob, '150000');
    expect(ob.value).toBe('1500.00');
    const ccy = $('edit-acc-currency');
    ccy.value = 'JPY';
    ccy.dispatchEvent(new Event('change'));
    expect(ob.value).toBe('1500');
    ccy.value = 'GBP';
    ccy.dispatchEvent(new Event('change'));
    expect(ob.value).toBe('1500.00');
  });

  it('review: a rename never rounds a stored JPY balance with decimals, and a currency flip keeps the cents', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Yen', currency: 'JPY', openingBalance: 123.45, openingDate: '2026-09-01' });
    const yen = accId('Yen');
    params = { id: yen };
    renderView('EditAccountView');
    expect($('edit-acc-balance').value).toBe('123');
    $('edit-acc-name').value = 'Yen wallet';
    $('btn-edit-acc-save').click();
    expect(obRow(yen).amount).toBe(123.45);

    S().dispatch('ADD_ACCOUNT', { name: 'Euro', openingBalance: 12.5, openingDate: '2026-09-01' });
    params = { id: accId('Euro') };
    renderView('EditAccountView');
    const ccy = $('edit-acc-currency');
    ccy.value = 'JPY'; ccy.dispatchEvent(new Event('change'));
    expect($('edit-acc-balance').value).toBe('13');
    ccy.value = 'EUR'; ccy.dispatchEvent(new Event('change'));
    expect($('edit-acc-balance').value).toBe('12.50');
  });

  it('Store.currencyDigits: Intl minor units, capped at 2, 2 for an unknown code', () => {
    boot();
    expect(S().currencyDigits('JPY')).toBe(0);
    expect(S().currencyDigits('EUR')).toBe(2);
    expect(S().currencyDigits('KWD')).toBe(2);
    expect(S().currencyDigits('not a code')).toBe(2);
  });
});

describe('Account form: unlisted currency and names (1.0.3 BUG-154 / BUG-153)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
    params = {};
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const seedCad = () => boot({
    stackd_v1_accounts: JSON.stringify([{ id: 'a_cad', name: 'Tangerine', type: 'Bank', currency: 'CAD', icon: 'wallet', color: '#0075EB' }]),
    stackd_v1_transactions: JSON.stringify([
      { id: 'cad_ob', type: 'opening_balance', amount: 250, accountId: 'a_cad', categoryId: 'cat_balance', date: '2026-09-01', time: '00:00' }
    ])
  });

  it('a CAD account (CSV / Bank Connect) shows CAD selected and keeps it through a rename', () => {
    seedCad();
    params = { id: 'a_cad' };
    renderView('EditAccountView');
    expect($('edit-acc-currency').value).toBe('CAD');
    const spy = vi.spyOn(S(), 'dispatch');
    $('edit-acc-name').value = 'Tangerine Chequing';
    $('btn-edit-acc-save').click();
    const call = spy.mock.calls.find(([a]) => a === 'UPDATE_ACCOUNT');
    expect('currency' in call[1]).toBe(false);
    const acc = S().getState().accounts.find(a => a.id === 'a_cad');
    expect(acc.currency).toBe('CAD');
    expect(acc.name).toBe('Tangerine Chequing');
  });

  it('a changed currency is still sent', () => {
    seedCad();
    params = { id: 'a_cad' };
    renderView('EditAccountView');
    $('edit-acc-currency').value = 'EUR';
    $('edit-acc-currency').dispatchEvent(new Event('change'));
    $('btn-edit-acc-save').click();
    expect(S().getState().accounts.find(a => a.id === 'a_cad').currency).toBe('EUR');
  });

  it('the unlisted code is escaped into the option', () => {
    boot({
      stackd_v1_accounts: JSON.stringify([{ id: 'a_x', name: 'X', type: 'Bank', currency: 'X"<b>', icon: 'wallet', color: '#0075EB' }])
    });
    params = { id: 'a_x' };
    renderView('EditAccountView');
    expect($('edit-acc-currency').value).toBe('X"<b>');
    expect($('edit-acc-currency').querySelector('b')).toBeNull();
  });

  it('findAccountByName / findCategoryByName collapse inner spaces and no-break spaces', () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Visa Card', openingBalance: 0 });
    S().dispatch('ADD_CATEGORY', { name: 'Dining Out', icon: 'pin', typeHint: 'expense' });
    expect(S().findAccountByName('visa  card').name).toBe('Visa Card');
    expect(S().findAccountByName('Visa Card').name).toBe('Visa Card');
    expect(S().findAccountByName(' VISA \t CARD ').name).toBe('Visa Card');
    expect(S().findAccountByName('VisaCard')).toBeNull();
    expect(S().findCategoryByName('dining   out').name).toBe('Dining Out');
    expect(S().findCategoryByName('Dining Out').name).toBe('Dining Out');
  });

  it('the account form refuses "Visa  Card" next to "Visa Card" and saves names collapsed', () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Visa Card', openingBalance: 0 });
    params = {};
    renderView('EditAccountView');
    $('edit-acc-name').value = 'Visa  Card';
    $('btn-edit-acc-save').click();
    expect($('edit-acc-name-error').textContent).toContain('Visa Card');
    expect(S().getState().accounts).toHaveLength(1);

    $('edit-acc-name').value = '  Travel   Card ';
    $('btn-edit-acc-save').click();
    expect(S().getState().accounts.map(a => a.name).sort()).toEqual(['Travel Card', 'Visa Card']);
  });

  it('a rename that only changes inner spacing is not a "name change" (existing duplicates still save)', () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Visa  Card', openingBalance: 0 });
    S().dispatch('ADD_ACCOUNT', { name: 'Visa Card', openingBalance: 0 });
    const first = S().getState().accounts.find(a => a.name === 'Visa  Card');
    params = { id: first.id };
    renderView('EditAccountView');
    $('btn-edit-acc-save').click();
    expect($('edit-acc-name-error')).toBeNull();
    expect(S().getState().accounts.find(a => a.id === first.id).name).toBe('Visa Card');
  });
});
