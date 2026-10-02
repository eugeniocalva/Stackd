// 1.0.1 (BUG-09) — Store.formatPercent is the single choke point for every
// displayed percentage: Intl percent formatting in the UI language, an ASCII
// '-' applied outside the formatter (like formatCurrency), never '-0.0%', and
// '—' when there is no value to show.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const LOCALES = { en: 'en-US', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', pt: 'pt-PT' };

const intlPct = (locale, fraction, min, max) =>
  new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: min, maximumFractionDigits: max }).format(fraction);

const boot = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  let uid = 0;
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  global.window.Store.init();
};

const fp = (...args) => global.window.Store.formatPercent(...args);

describe('Store.formatPercent (1.0.1 BUG-09)', () => {
  beforeEach(boot);
  afterEach(() => { vi.useRealTimers(); });

  it('formats in en-US like the old toFixed output', () => {
    expect(fp(59.9, { digits: 1 })).toBe('59.9%');
    expect(fp(38)).toBe('38%');
    expect(fp(37.5)).toBe('38%');
    expect(fp(250)).toBe('250%');
    expect(fp(12345)).toBe('12,345%');
    expect(fp(0)).toBe('0%');
    expect(fp(0, { digits: 1 })).toBe('0.0%');
  });

  it('follows the UI language for every supported locale (computed with Intl in-test)', () => {
    for (const [lang, locale] of Object.entries(LOCALES)) {
      global.window.I18n.setLang(lang);
      expect(fp(59.9, { digits: 1 })).toBe(intlPct(locale, 0.599, 1, 1));
      expect(fp(-1.1, { digits: 1 })).toBe('-' + intlPct(locale, 0.011, 1, 1));
      expect(fp(25, { digits: 1, signed: true })).toBe('+' + intlPct(locale, 0.25, 1, 1));
    }
    global.window.I18n.setLang('it');
    expect(fp(59.9, { digits: 1 })).toContain('59,9');
  });

  it('applies an ASCII hyphen for negatives and + only when signed', () => {
    expect(fp(-1.1, { digits: 1 })).toBe('-1.1%');
    expect(fp(-1.1, { digits: 1, signed: true })).toBe('-1.1%');
    expect(fp(59.9, { digits: 1, signed: true })).toBe('+59.9%');
    expect(fp(59.9, { digits: 1 })).toBe('59.9%');
    expect(fp(-1.1, { digits: 1 })).not.toContain('−');
  });

  it('never prints a signed zero — the sign follows the FORMATTED value', () => {
    expect(fp(-0.04, { digits: 1 })).toBe('0.0%');
    expect(fp(0.04, { digits: 1, signed: true })).toBe('0.0%');
    expect(fp(-0.4)).toBe('0%');
    expect(fp(-0)).toBe('0%');
    expect(fp(0, { signed: true })).toBe('0%');
    // ...but a value that rounds AWAY from zero keeps its sign.
    expect(fp(-0.05, { digits: 1 })).toBe('-0.1%');
    expect(fp(0.6, { signed: true })).toBe('+1%');
  });

  it('honours maxDigits (min defaults to digits)', () => {
    expect(fp(33.3, { maxDigits: 1 })).toBe('33.3%');
    expect(fp(50, { maxDigits: 1 })).toBe('50%');
    expect(fp(3.456, { maxDigits: 3 })).toBe('3.456%');
    expect(fp(3.5, { digits: 2, maxDigits: 1 })).toBe('3.50%'); // max is never below min
  });

  it('returns — for null, undefined and non-finite values', () => {
    expect(fp(null)).toBe('—');
    expect(fp(undefined)).toBe('—');
    expect(fp(NaN)).toBe('—');
    expect(fp(Infinity)).toBe('—');
    expect(fp(-Infinity, { signed: true })).toBe('—');
    expect(fp('12')).toBe('—');
  });

  it('caches one formatter per locale|min|max', () => {
    const S = global.window.Store;
    S._percentFormatCache = {};
    fp(1); fp(2); fp(3, { digits: 1 });
    expect(Object.keys(S._percentFormatCache).sort()).toEqual(['en-US|0|0', 'en-US|1|1']);
    global.window.I18n.setLang('fr');
    fp(1);
    expect(S._percentFormatCache['fr-FR|0|0']).toBeDefined();
  });
});
