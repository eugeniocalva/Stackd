import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('I18n core (v0.86 P8a)', () => {
  beforeEach(() => {
    global.window = { localStorage: {}, crypto: {} };
    executeFile('i18n.js');
    // Dictionary files self-attach to window.I18n.dicts, index.html order
    executeFile('i18n/en.js');
    executeFile('i18n/fr.js');
    executeFile('i18n/it.js');
    executeFile('i18n/es.js');
    executeFile('i18n/pt.js');
  });

  it('exposes the five supported languages for the pickers', () => {
    const codes = global.window.I18n.LANGUAGES.map(l => l.code);
    expect(codes).toEqual(['en', 'fr', 'it', 'es', 'pt']);
    expect(global.window.I18n.LANGUAGES[1].label).toBe('Français');
  });

  it('every language file registers its dictionary', () => {
    expect(Object.keys(global.window.I18n.dicts).sort())
      .toEqual(['en', 'es', 'fr', 'it', 'pt']);
  });

  // v0.89 P8d: with 500+ keys across five files, a key added to en.js and
  // forgotten elsewhere silently falls back to English — invisible in review
  // and only caught by someone actually reading that screen in that language.
  describe('dictionary parity', () => {
    const LANGS = ['fr', 'it', 'es', 'pt'];
    const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

    it.each(LANGS)('%s covers every English key, with no strays', (lang) => {
      const en = global.window.I18n.dicts.en;
      const dict = global.window.I18n.dicts[lang];
      expect(Object.keys(en).filter(k => !(k in dict))).toEqual([]);
      expect(Object.keys(dict).filter(k => !(k in en))).toEqual([]);
    });

    it.each(LANGS)('%s uses the same placeholders as English', (lang) => {
      const en = global.window.I18n.dicts.en;
      const dict = global.window.I18n.dicts[lang];
      // A dropped {amount}/{count} renders a sentence with a hole in it.
      const mismatched = Object.keys(en)
        .filter(k => k in dict && placeholders(en[k]) !== placeholders(dict[k]));
      expect(mismatched).toEqual([]);
    });

    it.each(LANGS)('%s defines both plural variants wherever English does', (lang) => {
      const en = global.window.I18n.dicts.en;
      const dict = global.window.I18n.dicts[lang];
      const missing = Object.keys(en)
        .filter(k => /\.(one|other)$/.test(k))
        .filter(k => !(k in dict));
      expect(missing).toEqual([]);
    });
  });

  describe('locale()', () => {
    it('maps each language code to its BCP 47 locale', () => {
      const I18n = global.window.I18n;
      const expected = { en: 'en-US', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', pt: 'pt-PT' };
      for (const [code, locale] of Object.entries(expected)) {
        I18n.setLang(code);
        expect(I18n.locale()).toBe(locale);
      }
    });

    it('setLang rejects unsupported codes and falls back to en', () => {
      const I18n = global.window.I18n;
      I18n.setLang('de');
      expect(I18n.lang).toBe('en');
      expect(I18n.locale()).toBe('en-US');
      I18n.setLang(undefined);
      expect(I18n.lang).toBe('en');
    });
  });

  describe('t() lookup and fallback chain', () => {
    it('returns the requested-language string when present', () => {
      const I18n = global.window.I18n;
      I18n.dicts.fr['nav.home'] = 'Accueil';
      I18n.setLang('fr');
      expect(I18n.t('nav.home')).toBe('Accueil');
    });

    it('falls back to English when the requested language misses the key', () => {
      const I18n = global.window.I18n;
      I18n.dicts.en['nav.home'] = 'Home';
      I18n.setLang('it');
      expect(I18n.t('nav.home')).toBe('Home');
    });

    it('falls back to the key itself when no dictionary has it', () => {
      const I18n = global.window.I18n;
      I18n.setLang('pt');
      expect(I18n.t('nav.unknown')).toBe('nav.unknown');
    });

    it('never returns blank for an empty-string count params edge', () => {
      const I18n = global.window.I18n;
      I18n.setLang('es');
      expect(I18n.t('some.key', { count: 3 })).toBe('some.key');
    });
  });

  describe('t() interpolation', () => {
    it('replaces {name} placeholders from params', () => {
      const I18n = global.window.I18n;
      I18n.dicts.en['greeting'] = 'Hello, {name}! You have {count} alerts.';
      I18n.setLang('en');
      expect(I18n.t('greeting', { name: 'Ada', count: 2 })).toBe('Hello, Ada! You have 2 alerts.');
    });

    it('leaves unknown placeholders intact', () => {
      const I18n = global.window.I18n;
      I18n.dicts.en['partial'] = '{done} of {total}';
      I18n.setLang('en');
      expect(I18n.t('partial', { done: 1 })).toBe('1 of {total}');
    });

    it('interpolates into an English-fallback string too', () => {
      const I18n = global.window.I18n;
      I18n.dicts.en['tx.deleted'] = '{count} deleted';
      I18n.setLang('fr');
      expect(I18n.t('tx.deleted', { count: 4 })).toBe('4 deleted');
    });
  });

  describe('t() plural variants via Intl.PluralRules', () => {
    beforeEach(() => {
      const I18n = global.window.I18n;
      I18n.dicts.en['tx.count.one'] = '{count} transaction';
      I18n.dicts.en['tx.count.other'] = '{count} transactions';
      I18n.dicts.fr['tx.count.one'] = '{count} transaction';
      I18n.dicts.fr['tx.count.other'] = '{count} transactions';
    });

    it('English: 1 is one, 0 and 2 are other', () => {
      const I18n = global.window.I18n;
      I18n.setLang('en');
      expect(I18n.t('tx.count', { count: 1 })).toBe('1 transaction');
      expect(I18n.t('tx.count', { count: 0 })).toBe('0 transactions');
      expect(I18n.t('tx.count', { count: 2 })).toBe('2 transactions');
    });

    it('French: 0 is grammatically singular', () => {
      const I18n = global.window.I18n;
      I18n.setLang('fr');
      expect(I18n.t('tx.count', { count: 0 })).toBe('0 transaction');
      expect(I18n.t('tx.count', { count: 1 })).toBe('1 transaction');
      expect(I18n.t('tx.count', { count: 2 })).toBe('2 transactions');
    });

    it('honours an explicit .zero override before plural rules', () => {
      const I18n = global.window.I18n;
      I18n.dicts.en['tx.count.zero'] = 'No transactions';
      I18n.setLang('en');
      expect(I18n.t('tx.count', { count: 0 })).toBe('No transactions');
      expect(I18n.t('tx.count', { count: 1 })).toBe('1 transaction');
    });

    it('uses .other when the exact category variant is missing', () => {
      const I18n = global.window.I18n;
      delete I18n.dicts.en['tx.count.one'];
      I18n.setLang('en');
      expect(I18n.t('tx.count', { count: 1 })).toBe('1 transactions');
    });

    it('plural lookup falls back to English variants for an untranslated language', () => {
      const I18n = global.window.I18n;
      I18n.setLang('it');
      expect(I18n.t('tx.count', { count: 1 })).toBe('1 transaction');
      expect(I18n.t('tx.count', { count: 5 })).toBe('5 transactions');
    });
  });
});

describe('Store ↔ I18n wiring (v0.86 P8a)', () => {
  const bootWindow = () => {
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
      localStorage: (() => {
        const bag = {};
        return {
          getItem: k => (k in bag ? bag[k] : null),
          setItem: (k, v) => { bag[k] = String(v); },
          removeItem: k => { delete bag[k]; },
        };
      })(),
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('i18n/fr.js');
    executeFile('i18n/it.js');
    executeFile('i18n/es.js');
    executeFile('i18n/pt.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
  };

  it('boot syncs I18n.lang from the persisted language', () => {
    bootWindow();
    global.window.localStorage.setItem('stackd_v1_language', JSON.stringify('it'));
    global.window.Store.init();
    expect(global.window.Store.getState().language).toBe('it');
    expect(global.window.I18n.lang).toBe('it');
    expect(global.window.I18n.locale()).toBe('it-IT');
  });

  it('SET_LANGUAGE updates I18n.lang, persists, and emits (coalesced, v0.93)', async () => {
    bootWindow();
    global.window.Store.init();
    expect(global.window.I18n.lang).toBe('en');

    let emitted = false;
    global.window.Store.subscribe(() => { emitted = true; });
    global.window.Store.dispatch('SET_LANGUAGE', 'pt');

    // State mutates synchronously with the dispatch…
    expect(global.window.Store.getState().language).toBe('pt');
    expect(global.window.I18n.lang).toBe('pt');
    expect(JSON.parse(global.window.localStorage.getItem('stackd_v1_language'))).toBe('pt');
    // …but the listener pass coalesces to the next microtask (v0.93).
    expect(emitted).toBe(false);
    await Promise.resolve();
    expect(emitted).toBe(true);
  });
});
