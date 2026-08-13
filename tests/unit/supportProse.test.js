import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Same executeFile pattern as store.test.js — src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const LANGS = ['en', 'fr', 'it', 'es', 'pt'];

describe('Support prose (v0.91 P8f)', () => {
  beforeEach(() => {
    global.window = {
      crypto: {},
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    LANGS.forEach(l => executeFile(`i18n/${l}.js`));
    executeFile('store.js');
    executeFile('components.js');
  });

  // The whole point of P8f: these three blocks used to be hardcoded English
  // arrays. If any structure id drifts from its dictionary key, t() falls back
  // to returning the key — which renders as literal "manual.foo.bar" on screen.
  describe('every structure id resolves to a real string', () => {
    it.each(LANGS)('%s FAQ has no unresolved keys', (lang) => {
      global.window.I18n.setLang(lang);
      const faqs = global.window.Components.FaqModal.FAQS;
      expect(faqs).toHaveLength(7);
      const unresolved = faqs.flatMap(f => [f.q, f.a]).filter(s => /^faq\./.test(s));
      expect(unresolved).toEqual([]);
    });

    it.each(LANGS)('%s manual has no unresolved keys', (lang) => {
      global.window.I18n.setLang(lang);
      const sections = global.window.Components.ManualModal.SECTIONS;
      expect(sections).toHaveLength(13);
      const strings = sections.flatMap(s => [s.title, ...s.items.flatMap(i => [i.h, i.d])]);
      expect(strings).toHaveLength(13 + 59 * 2);
      expect(strings.filter(s => /^manual\./.test(s))).toEqual([]);
    });

    it.each(LANGS)('%s terms clauses all resolve', (lang) => {
      global.window.I18n.setLang(lang);
      const T = global.window.Components.TermsModal;
      const keys = [
        'terms.intro', 'terms.part1', 'terms.part2', 'terms.updatedDate',
        ...T.TERMS_IDS.flatMap(id => [`terms.use.${id}.h`, `terms.use.${id}.d`]),
        ...T.PRIVACY_IDS.flatMap(id => [`terms.privacy.${id}.h`, `terms.privacy.${id}.d`])
      ];
      const unresolved = keys.filter(k => global.window.I18n.t(k) === k);
      expect(unresolved).toEqual([]);
    });
  });

  // ManualModal.SECTIONS is a getter over the ACTIVE language, and _renderBody
  // reads it — so search matches translated text, not the English source.
  describe('manual search runs over the localized corpus', () => {
    const M = () => global.window.Components.ManualModal;

    it('matches a translated word that does not exist in English', () => {
      global.window.I18n.setLang('it');
      // 'Cronologia' is the Italian History; the English source never has it.
      const hit = M()._renderBody('cronologia');
      expect(hit).toContain('<mark');
      expect(hit).not.toContain('Nessun risultato');
    });

    it('an English-only word finds nothing once the language is Italian', () => {
      global.window.I18n.setLang('it');
      // 'rollover' matches in English; the Italian corpus says 'Riporto'.
      expect(M()._renderBody('rollover')).toContain('Nessun risultato');
      expect(M()._renderBody('riporto')).toContain('<mark');
    });

    it('still works in English', () => {
      global.window.I18n.setLang('en');
      const all = M()._renderBody('');
      const hit = M()._renderBody('rollover');
      expect(hit.length).toBeLessThan(all.length);
      expect(hit).toContain('<mark');
      expect(M()._renderBody('zzzznotarealword')).toContain('No results');
    });

    it('the empty query renders every section', () => {
      global.window.I18n.setLang('fr');
      const body = M()._renderBody('');
      expect((body.match(/class="manual-section"/g) || [])).toHaveLength(13);
    });
  });
});
