// 1.3.0 (PL-2, docs/privacy-currencies-plan.md §3): every currency. The
// store knows the codes, their signs (the system's narrow symbol, never '$'
// for a code it does not know), their names in the app language and the
// currency of the phone's region; Components.CurrencyList is the one
// searchable list behind the Settings picker, the account form and onboarding.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const makeLocalStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
};

let uid = 0;
let S, C;

const boot = ({ navigator, lang } = {}) => {
  const localStorage = makeLocalStorage();
  localStorage.setItem('stackd_v1_homeWidgets', '[]');
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    StackdHydrateIcons: vi.fn(),
    Router: { navigate: vi.fn(), getParams: () => ({}), handleRouteChange() {} }
  };
  if (navigator) global.window.navigator = navigator;
  global.localStorage = localStorage;
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  if (lang && lang !== 'en') executeFile(`i18n/${lang}.js`);
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  S = global.window.Store;
  C = global.window.Components;
  S.init();
  if (lang) S.dispatch('SET_LANGUAGE', lang);
};

beforeEach(() => {
  document.body.innerHTML = '<main id="router-view"></main><div id="modal-container"></div>';
});
afterEach(() => { document.body.innerHTML = ''; });

describe('the currency list (PL-2)', () => {
  beforeEach(() => boot());

  it('lists every active currency once, the Rand included, and none that counts in thousandths', () => {
    const codes = S.CURRENCY_CODES;
    expect(codes.length).toBeGreaterThan(140);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach(c => expect(c).toMatch(/^[A-Z]{3}$/));
    ['ZAR', 'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'CHF', 'INR', 'BRL', 'NGN', 'KES'].forEach(c => expect(codes).toContain(c));
    // D6: amounts are kept in cents
    ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'].forEach(c => expect(codes).not.toContain(c));
  });

  it('every listed currency has a name and a sign from the system', () => {
    S.CURRENCY_CODES.forEach(c => {
      expect(S.getCurrencySymbol(c).length).toBeGreaterThan(0);
      expect(S.currencyLabel(c).startsWith(c)).toBe(true);
    });
    // a current Node / WebView names nearly all of them; allow a few new codes
    const unnamed = S.CURRENCY_CODES.filter(c => S.currencyName(c) === c);
    expect(unnamed.length).toBeLessThan(6);
  });
});

describe('signs and amounts (PL-2)', () => {
  beforeEach(() => boot());

  it('the five original currencies keep their signs', () => {
    expect(S.getCurrencySymbol('USD')).toBe('$');
    expect(S.getCurrencySymbol('EUR')).toBe('€');
    expect(S.getCurrencySymbol('GBP')).toBe('£');
    expect(S.getCurrencySymbol('JPY')).toBe('¥');
    expect(S.getCurrencySymbol('CNY')).toBe('¥');
  });

  it('other currencies show their own sign, never a dollar', () => {
    expect(S.getCurrencySymbol('ZAR')).toBe('R');
    expect(S.getCurrencySymbol('SEK')).toBe('kr');
    expect(S.getCurrencySymbol('CHF')).toBe('CHF');
    expect(S.getCurrencySymbol('INR')).toBe('₹');
    expect(S.getCurrencySymbol('BRL')).toBe('R$');
  });

  it('a code the system does not know shows the code; a broken one never reaches markup', () => {
    expect(S.getCurrencySymbol('QQQ')).toBe('QQQ');
    expect(S.getCurrencySymbol('X"<b>')).toBe('¤');
    expect(S.getCurrencySymbol('__proto__')).toBe('¤');
    expect(S.getCurrencySymbol('constructor')).toBe('¤');
    S.CURRENCY_CODES.concat(['QQQ', 'X"<b>']).forEach(c => expect(S.getCurrencySymbol(c)).not.toMatch(/[<>&"'`\s]/));
  });

  it('a word sign takes a no-break space, a single sign stays glued', () => {
    S.dispatch('SET_CURRENCY', 'ZAR');
    expect(S.formatCurrency(1234.56)).toBe('R1,234.56');
    expect(S.formatCurrency(-5)).toBe('-R5.00');
    expect(S.formatCurrency(1234.56, 'CHF')).toBe('CHF 1,234.56');
    expect(S.formatCurrency(1234.56, 'SEK')).toBe('kr 1,234.56');
    expect(S.formatCurrency(1234.56, 'BRL')).toBe('R$1,234.56');
    expect(S.formatCurrency(1234.56, 'EUR')).toBe('€1,234.56');
  });

  it('a currency without a minor unit shows no decimals', () => {
    expect(S.formatCurrency(1234.56, 'KRW')).toBe('₩1,235');
    expect(S.formatCurrency(1234.56, 'JPY')).toBe('¥1,235');
    expect(S.formatCurrency(1234.56, 'CNY')).toBe('¥1,235'); // unchanged
  });

  it('SET_CURRENCY takes three capitals or nothing', () => {
    S.dispatch('SET_CURRENCY', 'ZAR');
    expect(S.getState().currency).toBe('ZAR');
    ['zar', 'EU', 'X"<b>', '', null, { code: 'eur' }].forEach(bad => {
      S.dispatch('SET_CURRENCY', bad);
      expect(S.getState().currency).toBe('ZAR');
    });
    S.dispatch('SET_CURRENCY', { code: 'EUR' });
    expect(S.getState().currency).toBe('EUR');
  });

  it('a typed amount may carry the sign or code in use — and only those', () => {
    S.dispatch('SET_CURRENCY', 'ZAR');
    expect(S.parseAmount('R 12.50')).toBe(12.5);
    expect(S.parseAmount('R12.50')).toBe(12.5);
    expect(S.parseAmount('12.50 ZAR')).toBe(12.5);
    expect(S.parseAmount('€12.50')).toBe(12.5); // the classic signs, as before
    expect(Number.isNaN(S.parseAmount('kr 12.50'))).toBe(true); // not a sign in use here
    expect(Number.isNaN(S.parseAmount('12abc'))).toBe(true);
    expect(Number.isNaN(S.parseAmount('R'))).toBe(true);
  });

  it('the signs Home hides amounts by include each account currency, longest first', () => {
    S.dispatch('SET_CURRENCY', 'ZAR');
    S.dispatch('ADD_ACCOUNT', { name: 'Swiss', currency: 'CHF', openingBalance: 10, openingDate: '2026-01-01' });
    const re = new RegExp('^(?:' + S.moneySymbolPattern() + ')$');
    ['R', 'CHF ', '$', '€', '£', '¥'].forEach(sign => expect(re.test(sign)).toBe(true));
    expect(S.moneySymbolPattern().startsWith('CHF')).toBe(true);
  });
});

describe('names (PL-2)', () => {
  it('come from the app language, first letter capitalized; the five originals keep their dictionary names', () => {
    boot();
    expect(S.currencyLabel('ZAR')).toBe('ZAR — South African Rand');
    expect(S.currencyLabel('EUR')).toBe('EUR — Euro');
    expect(S.currencyLabel('USD')).toBe('USD — US Dollar');
    expect(S.currencyLabel('QQQ')).toBe('QQQ');
    boot({ lang: 'it' });
    expect(S.currencyLabel('ZAR')).toBe('ZAR — Rand sudafricano');
    expect(S.currencyLabel('USD')).toBe(global.window.I18n.t('currency.USD'));
  });
});

describe("the phone's regional currency (PL-2)", () => {
  it('reads the region of the first language that names one', () => {
    boot({ navigator: { language: 'en-ZA', languages: ['en-ZA', 'en'] } });
    expect(S.regionCurrency()).toBe('ZAR');
    boot({ navigator: { language: 'pt-BR', languages: ['pt-BR'] } });
    expect(S.regionCurrency()).toBe('BRL');
    boot({ navigator: { language: 'en', languages: ['en', 'fr-CH'] } });
    expect(S.regionCurrency()).toBe('CHF');
  });

  it('falls back to the likeliest region of a bare language, and to nothing without a navigator', () => {
    boot({ navigator: { language: 'it', languages: ['it'] } });
    expect(S.regionCurrency()).toBe('EUR');
    boot({ navigator: { language: 'ja', languages: [] } });
    expect(S.regionCurrency()).toBe('JPY');
    boot();
    expect(S.regionCurrency()).toBe('');
    boot({ navigator: { language: 'not a tag', languages: ['???'] } });
    expect(S.regionCurrency()).toBe('');
  });

  it('a region whose currency is not listed (Kuwait, D6) suggests nothing', () => {
    boot({ navigator: { language: 'ar-KW', languages: ['ar-KW'] } });
    expect(S.regionCurrency()).toBe('');
  });

  it('every mapped currency is one the picker lists', () => {
    boot();
    S._REGION_CURRENCIES.split('|').forEach(group => {
      expect(S.CURRENCY_CODES).toContain(group.split(':')[0]);
    });
  });
});

describe('Components.CurrencyList (PL-2)', () => {
  const mount = (o) => {
    document.body.innerHTML = `<div id="host">${C.CurrencyList.html(o)}</div>`;
    const host = document.getElementById('host');
    C.CurrencyList.bind(host, o);
    return host;
  };
  const codes = (host) => [...host.querySelectorAll('.currency-row')].map(r => r.dataset.code);
  const type = (host, text) => {
    const input = host.querySelector('#currency-search');
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };

  it('shows the suggested few first, then every other currency once', () => {
    boot({ navigator: { language: 'en-ZA', languages: ['en-ZA'] } });
    const host = mount({ selected: 'EUR', rowClass: 'currency-opt', role: 'radio' });
    const list = codes(host);
    expect(list.slice(0, 6)).toEqual(['ZAR', 'EUR', 'USD', 'GBP', 'JPY', 'CNY']);
    expect(new Set(list).size).toBe(list.length);
    expect(list.length).toBe(S.CURRENCY_CODES.length);
    expect(host.querySelectorAll('.currency-group-title').length).toBe(2);
    const on = host.querySelectorAll('[aria-checked="true"]');
    expect(on.length).toBe(1);
    expect(on[0].dataset.code).toBe('EUR');
    expect(host.querySelector('#currency-opts').getAttribute('role')).toBe('radiogroup');
  });

  it('search finds a currency by code, by name without accents, and by sign', () => {
    boot();
    const host = mount({ selected: 'EUR', rowClass: 'currency-opt', role: 'radio' });
    type(host, 'zar');
    expect(codes(host)).toEqual(['ZAR']);
    type(host, 'south afr');
    expect(codes(host)).toEqual(['ZAR']);
    type(host, 'r$');
    expect(codes(host)).toContain('BRL');
    type(host, 'venezuelan bolivar');
    expect(codes(host)).toEqual(['VES']);
    expect(host.querySelector('.currency-group-title')).toBeNull();
    type(host, 'zzzz');
    expect(codes(host)).toEqual([]);
    expect(host.querySelector('.currency-empty').textContent).toBe('No currency found');
    type(host, '');
    expect(codes(host).length).toBe(S.CURRENCY_CODES.length);
  });

  it('a pick reports the code and moves the selection; Enter picks too', () => {
    boot();
    const onPick = vi.fn();
    const host = mount({ selected: 'EUR', rowClass: 'currency-opt', role: 'radio', onPick });
    type(host, 'rand');
    host.querySelector('.currency-row[data-code="ZAR"]').click();
    expect(onPick).toHaveBeenLastCalledWith('ZAR');
    expect(host.querySelector('.currency-row[data-code="ZAR"]').getAttribute('aria-checked')).toBe('true');
    type(host, 'swiss');
    host.querySelector('.currency-row[data-code="CHF"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onPick).toHaveBeenLastCalledWith('CHF');
  });

  it("an account's unlisted currency is still offered, and its code is escaped", () => {
    boot();
    let host = mount({ selected: 'KWD', rowClass: 'currency-opt', role: 'radio' });
    expect(codes(host)[0]).toBe('KWD');
    host = mount({ selected: 'X"<b>', rowClass: 'currency-opt', role: 'radio' });
    expect(host.querySelector('b')).toBeNull(); // not three capitals: never offered, never markup
    expect(codes(host)).not.toContain('X"<b>');
  });

  it('the onboarding rows are buttons, not radios', () => {
    boot();
    const host = mount({ selected: 'EUR', rowClass: 'setup-picker-opt', role: 'button' });
    expect(host.querySelector('.setup-picker-opt[data-code="ZAR"]').getAttribute('role')).toBe('button');
    expect(host.querySelector('#currency-opts').hasAttribute('role')).toBe(false);
  });
});

describe('Components.CurrencyPicker (PL-2)', () => {
  it('a tap only selects; Done hands the changed choice over; Cancel applies nothing', () => {
    boot();
    const onDone = vi.fn((code, close) => close());
    C.CurrencyPicker.show({ selected: 'EUR', onDone });
    document.querySelector('.currency-opt[data-code="USD"]').click();
    expect(onDone).not.toHaveBeenCalled();
    document.getElementById('modal-save-btn').click();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0]).toBe('USD');

    onDone.mockClear();
    C.CurrencyPicker.show({ selected: 'EUR', onDone });
    document.querySelector('.currency-opt[data-code="GBP"]').click();
    document.getElementById('modal-cancel-btn').click();
    expect(onDone).not.toHaveBeenCalled();

    C.CurrencyPicker.show({ selected: 'EUR', onDone });
    document.getElementById('modal-save-btn').click(); // unchanged
    expect(onDone).not.toHaveBeenCalled();
  });
});
