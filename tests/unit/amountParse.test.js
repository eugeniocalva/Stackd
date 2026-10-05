import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-50) Store.parseAmount: the one reader for a typed or pasted money
// amount. The transaction and budget fields used to be type=number inputs read
// by parseFloat, so '1,234.56' saved 1.23456. Rules (decision D7 / D-U2-3/4):
// both separators -> the LAST one is the decimal and the other must group the
// integer part in threes; one kind repeated -> grouping (proper groups); one
// separator + 0-2 digits -> decimal; one separator + exactly 3 digits ->
// grouping only when it is the UI locale's grouping character, otherwise NaN;
// more than 2 decimals -> NaN. Empty -> null. Result rounded to cents.
// F0 review: a space/apostrophe run inside the number is a grouping mark held
// to the same groups-of-three rule ('12 50' -> NaN, not 1250), and a Number is
// rounded to cents directly instead of being re-read through String().

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let Store;
const LANGS = ['en', 'fr', 'it', 'es', 'pt'];

const boot = () => {
  global.window = {
    crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2, 11) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  for (const f of ['db.js', 'i18n.js', ...LANGS.map(l => `i18n/${l}.js`), 'store.js']) executeFile(f);
  Store = global.window.Store;
};
const lang = (code) => global.window.I18n.setLang(code);
const expectTable = (table) => {
  Object.entries(table).forEach(([raw, want]) => {
    const got = Store.parseAmount(raw);
    if (Number.isNaN(want)) expect(got, JSON.stringify(raw)).toBeNaN();
    else expect(got, JSON.stringify(raw)).toBe(want);
  });
};

describe('Store.parseAmount (1.0.2 BUG-50)', () => {
  beforeEach(boot);

  it('en: grouped, decimal and ambiguous inputs', () => {
    lang('en');
    expectTable({
      '1,234.56': 1234.56,
      '1.234,56': 1234.56,
      '1234,56': 1234.56,
      '12,500': 12500,
      '2.500': NaN,
      '1.23456': NaN,
      '12.': 12,
      ',5': 0.5,
      '€ 12,50': 12.5,
      "1'234.50": 1234.5,
      '1,234,567.89': 1234567.89,
      '1,2,3': NaN,
      'abc': NaN,
      '': null,
      '  ': null,
      '-5': -5
    });
  });

  it('en: more of the rules (currency signs, minus, groups, cents rounding)', () => {
    lang('en');
    expectTable({
      '1234.5': 1234.5,
      '0.29': 0.29,
      '12,50 €': 12.5,
      '$1,234.56': 1234.56,
      '£5': 5,
      '¥1,000': 1000,
      '−5': -5,          // U+2212 MINUS SIGN
      '-1,234.56': -1234.56,
      '1’234.50': 1234.5, // typographic apostrophe grouping
      '1,234': 1234,          // en grouping char + 3 digits
      '0,125': NaN,           // a group may not start with 0
      '01,234.56': NaN,
      '1.234,567': NaN,       // > 2 decimals
      '1,23.45': NaN,         // the grouping part is not in threes
      '1.234.567,89': 1234567.89,
      '1,234.567,89': NaN,
      '1.005': NaN,
      '.': NaN,
      '12a': NaN,
      '--5': NaN,
      '1e3': NaN
    });
    expect(Store.parseAmount(null)).toBeNull();
    expect(Store.parseAmount(undefined)).toBeNull();
    expect(Store.parseAmount(12.5)).toBe(12.5);
  });

  it('it: "." groups, "," is the decimal', () => {
    lang('it');
    expectTable({
      '2.500': 2500,
      '1,234': NaN,
      '0.125': NaN,
      '1.234.567': 1234567,
      '1.234,56': 1234.56,
      '1234,56': 1234.56,
      '12,5': 12.5
    });
  });

  it('es: "." groups, "," is the decimal', () => {
    lang('es');
    expectTable({ '2.500': 2500, '1,234': NaN, '1.234,56': 1234.56, '1234,56': 1234.56 });
  });

  it('fr: narrow no-break space groups; a lone "." or "," + 3 digits is ambiguous', () => {
    lang('fr');
    expectTable({
      '2.500': NaN,
      '12,500': NaN,
      '1 234,56': 1234.56,
      '1 234,56': 1234.56,
      '1 234,56': 1234.56,
      '1 234 567,89': 1234567.89,
      '12,5': 12.5
    });
  });

  it('pt (pt-PT, no-break space grouping)', () => {
    lang('pt');
    expectTable({ '2.500': NaN, '1234,56': 1234.56, '1 234,56': 1234.56, '1.234,56': 1234.56 });
  });

  it("each language's example parses back", () => {
    LANGS.forEach(code => {
      lang(code);
      expect(Store.parseAmount(Store.amountExample()), code).toBe(1234.56);
    });
  });

  // 1.0.2 (BUG-50, F0 review): a space or apostrophe inside the number groups
  // in threes exactly like '.' and ','. It used to be deleted unchecked, so a
  // stray space on a decimal keypad ('12 50' for 12,50) saved 1250.
  it('spaces and apostrophes group in threes, so a stray one is NaN in every language', () => {
    LANGS.forEach(code => {
      lang(code);
      expectTable({
        '12 50': NaN,
        '1 2345': NaN,
        '0 5': NaN,
        '1 23,45': NaN,
        "12'5": NaN,
        '12’5': NaN,
        '12 50': NaN,
        '12 50': NaN,
        '12 ,50': NaN,         // a group mark next to the decimal point
        '12, 50': NaN,         // a space is never the decimal point
        '1,234 567': NaN,
        "12'": NaN,
        "'12": NaN,
        '1 234.567,89': NaN,   // three different separators
        '1 234': 1234,
        '12 500': 12500,
        '1 234 567': 1234567,
        '1 234.56': 1234.56,
        '1 234,56': 1234.56,
        "1'234'567.89": 1234567.89,
        '€ 12,50': 12.5,       // spaces around a currency sign or the minus stay free
        '12,50 €': 12.5,
        ' 12,50 ': 12.5,
        '- 5': -5,
        '\t1 234,56\n': 1234.56
      });
    });
  });

  // 1.0.2 (BUG-50, F0 review): a Number is rounded to cents directly. Through
  // String() it would be re-read with the UI separators: under it/es '1.234'
  // is a grouped 1234, a silent 1000x inflation of a legacy 3-decimal amount.
  it('a Number is rounded to cents, never re-read through the UI separators', () => {
    LANGS.forEach(code => {
      lang(code);
      expect(Store.parseAmount(1.234), code).toBe(1.23);
      expect(Store.parseAmount(12.5), code).toBe(12.5);
      expect(Store.parseAmount(0.1 + 0.2), code).toBe(0.3);
      expect(Store.parseAmount(2500), code).toBe(2500);
      expect(Store.parseAmount(-5), code).toBe(-5);
      expect(Store.parseAmount(0), code).toBe(0);
      expect(Store.parseAmount(1234567.891), code).toBe(1234567.89);
      expect(Store.parseAmount(NaN), code).toBeNaN();
      expect(Store.parseAmount(Infinity), code).toBeNaN();
    });
  });
});

describe('Store.amountExample / _numberSeparators (1.0.2 BUG-50)', () => {
  beforeEach(boot);

  it('amountExample is the locale 2-decimal format of 1234.56', () => {
    lang('en');
    expect(Store.amountExample()).toBe('1,234.56');
    ['fr', 'it', 'es', 'pt'].forEach(code => {
      lang(code);
      expect(Store.amountExample(), code).toMatch(/^1[.   ]?234,56$/);
    });
  });

  it('_numberSeparators reads the UI locale and caches per locale', () => {
    lang('en');
    expect(Store._numberSeparators()).toEqual({ group: ',', decimal: '.' });
    const enSeps = Store._numberSeparators();
    expect(Store._numberSeparators()).toBe(enSeps);
    expect(Store._amountSepCache['en-US']).toBe(enSeps);
    lang('it');
    expect(Store._numberSeparators()).toEqual({ group: '.', decimal: ',' });
    lang('fr');
    expect(Store._numberSeparators().decimal).toBe(',');
    expect(Store._numberSeparators().group).toMatch(/^[   ]$/);
  });
});
