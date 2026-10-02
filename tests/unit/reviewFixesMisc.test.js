import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 review fixes (misc):
// - BUG-03: a sign-only flip of the opening balance (#btn-ob-pos/#btn-ob-neg,
//   aria-pressed; the amount field holds the absolute value) counts as an
//   unsaved edit, so Android Back asks before discarding it.
// - BUG-21: the import-failure sheet no longer repeats its title in the body.
// - BUG-09: the 50/30/20 hint shows the sum at _splitOk's precision, so an
//   invalid split can never read "Currently 100%".
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const $ = (id) => document.getElementById(id);
const S = () => global.window.Store;

const boot = () => {
  document.body.innerHTML = '<div id="router-view"></div><nav id="bottom-nav"></nav><div id="modal-container"></div>';
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    location: { hash: '' },
    history: { back: vi.fn() },
    addEventListener: vi.fn(),
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
  executeFile('widgets.js');
  executeFile('views.js');
  executeFile('router.js');
  S().init();
};

describe('1.0.1 review fixes (misc)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0));
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('BUG-03: opening-balance sign flip is an unsaved edit', () => {
    const R = () => global.window.Router;
    const mountEditAccount = () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 500, openingDate: '2026-01-01' });
      const id = S().getState().accounts.find(a => a.name === 'Bank').id;
      global.window.location.hash = `#edit-account?id=${id}`;
      S().getState().activeView = 'edit-account';
      const rv = $('router-view');
      rv.innerHTML = global.window.Views.EditAccountView.render(S().getState());
      global.window.Views.EditAccountView.attachEvents(rv, S().getState());
      return rv;
    };

    it('tapping Negative alone makes the form dirty and Back asks first', () => {
      mountEditAccount();
      expect($('edit-acc-balance').value).toBe('500.00');
      R()._armFormBaseline();
      expect(R()._isFormDirty()).toBe(false);

      $('btn-ob-neg').click();
      expect($('edit-acc-balance').value).toBe('500.00'); // absolute value unchanged
      expect(R()._isFormDirty()).toBe(true);
      expect(R().handleBack({ canGoBack: true })).toBe('confirm');
      expect($('modal-title').textContent).toBe('Discard changes?');
      expect(global.window.history.back).not.toHaveBeenCalled();
    });

    it('flipping back to Positive returns to the baseline (no prompt)', () => {
      mountEditAccount();
      R()._armFormBaseline();
      $('btn-ob-neg').click();
      $('btn-ob-pos').click();
      expect(R()._isFormDirty()).toBe(false);
      expect(R().handleBack({ canGoBack: true })).toBe('back');
      expect(global.window.history.back).toHaveBeenCalledTimes(1);
    });

    it('pressed toggles are told apart by id', () => {
      S().getState().activeView = 'edit-account';
      $('router-view').innerHTML = `
        <button id="a" aria-pressed="true"></button>
        <button id="b" aria-pressed="false"></button>`;
      R()._armFormBaseline();
      $('a').setAttribute('aria-pressed', 'false');
      $('b').setAttribute('aria-pressed', 'true');
      expect(R()._isFormDirty()).toBe(true);
    });
  });

  describe('BUG-21: import-failure sheet body', () => {
    const pickFile = () => {
      const input = $('import-csv-file');
      Object.defineProperty(input, 'files', { value: [{ name: 'backup.csv' }], configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    const renderSettings = () => {
      const c = $('router-view');
      const state = S().getState();
      c.innerHTML = global.window.Views.OthersView.render(state);
      global.window.Views.OthersView.attachEvents(c, state);
    };

    it('the body carries only the reason, never the title again', () => {
      global.window.StackdImport = { importCSV: (file, state, ok, fail) => fail(new Error('unrecognised file')) };
      renderSettings();
      pickFile();
      expect($('import-result-modal-title').textContent).toBe('Import failed');
      expect($('import-result-modal-body').textContent).toBe('unrecognised file');
    });

    it('a message-less error falls back to a localized body (never "undefined")', () => {
      global.window.I18n.setLang('fr');
      global.window.StackdImport = { importCSV: (file, state, ok, fail) => fail(new Error('')) };
      renderSettings();
      pickFile();
      expect($('import-result-modal-title').textContent).toBe("Échec de l'import");
      const body = $('import-result-modal-body').textContent;
      expect(body).toBe("Le fichier n'a pas pu être lu. Vérifiez son format et réessayez.");
      expect(body).not.toContain("Échec de l'import");

      global.window.StackdImport = { importCSV: (file, state, ok, fail) => fail(undefined) };
      renderSettings();
      pickFile();
      expect($('import-result-modal-body').textContent).not.toMatch(/undefined/);
    });

    it('the retired others.importFailed key is gone from every dictionary', () => {
      ['it', 'es', 'pt'].forEach(l => executeFile(`i18n/${l}.js`));
      ['en', 'fr', 'it', 'es', 'pt'].forEach(l => {
        global.window.I18n.setLang(l);
        expect(global.window.I18n.t('others.importFailedBody')).not.toBe('others.importFailedBody');
      });
      const src = ['en', 'fr', 'it', 'es', 'pt'].map(l => readFileSync(resolve(__dirname, '../../src/i18n', l + '.js'), 'utf8'));
      src.forEach(s => expect(s).not.toMatch(/'others\.importFailed':/));
    });
  });

  describe('BUG-09: 50/30/20 hint precision', () => {
    const fifty = () => global.window.Widgets.registry.fiftyThirtyTwenty;

    it.each([
      [33.35 + 33.3 + 33.3, '99.95%'],
      [99.96, '99.96%'],
      [100.04, '100.04%'],
      [100.01, '100.01%'],
      [99.9996, null], // rounds to 100 at 0.001 → valid, no hint shown
      [80, '80%']
    ])('sum %s never reads "Currently 100%" when invalid', (sum, shown) => {
      const ok = fifty()._splitOk(sum);
      const hint = fifty()._sumHint(sum);
      if (shown === null) {
        expect(ok).toBe(true);
        return;
      }
      expect(ok).toBe(false);
      expect(hint).toBe(`Currently ${shown} — the split must total 100%`);
    });

    it('a float-noise valid split still passes', () => {
      expect(fifty()._splitOk(33.3 + 33.3 + 33.4)).toBe(true);
    });

    it('no invalid sum on a 0.0001 grid around 100 formats as 100% (en + fr)', () => {
      ['en', 'fr'].forEach(l => {
        global.window.I18n.setLang(l);
        const hundred = S().formatPercent(100);
        for (let i = -1000; i <= 1000; i++) {
          const sum = 100 + i / 10000;
          if (fifty()._splitOk(sum)) continue;
          expect(fifty()._sumHint(sum).startsWith(global.window.I18n.t('widget.fifty.sumHint', { pct: hundred, total: hundred }))).toBe(false);
        }
      });
    });
  });
});
