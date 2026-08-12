import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Same executeFile pattern as store.test.js — src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const LOCALES = { en: 'en-US', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', pt: 'pt-PT' };

let lastDownload = null;

const boot = () => {
  let uid = 0;
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn() }
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
  executeFile('export.js');
  executeFile('import.js');

  lastDownload = null;
  global.window.StackdExport._download = (filename, content) => {
    lastDownload = { filename, content };
  };

  global.window.Store.init();
};

describe('Locale-aware formatting (v0.87 P8b)', () => {
  beforeEach(boot);

  describe('Store.getLocale()', () => {
    it('follows the app language', () => {
      for (const [lang, locale] of Object.entries(LOCALES)) {
        window.I18n.setLang(lang);
        expect(window.Store.getLocale()).toBe(locale);
      }
    });

    it('falls back to en-US when i18n is not loaded (unit test chains)', () => {
      delete window.I18n;
      expect(window.Store.getLocale()).toBe('en-US');
    });
  });

  describe('formatCurrency locale matrix', () => {
    it('formats per language exactly as Intl.NumberFormat for that locale', () => {
      window.Store.state.currency = 'EUR';
      for (const [lang, locale] of Object.entries(LOCALES)) {
        window.I18n.setLang(lang);
        const expected = '€' + new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2, maximumFractionDigits: 2
        }).format(1234.56);
        expect(window.Store.formatCurrency(1234.56)).toBe(expected);
      }
    });

    it('uses comma decimals for Italian and dot decimals for English', () => {
      // Note: it/es have CLDR minimumGroupingDigits=2, so grouping only
      // appears from 5 integer digits — use an amount big enough to show it.
      window.Store.state.currency = 'EUR';
      window.I18n.setLang('it');
      expect(window.Store.formatCurrency(12345.67)).toBe('€12.345,67');
      window.I18n.setLang('en');
      expect(window.Store.formatCurrency(12345.67)).toBe('€12,345.67');
    });

    it('keeps the sign-then-symbol shape and zero decimals for JPY/CNY', () => {
      window.Store.state.currency = 'JPY';
      window.I18n.setLang('fr');
      const expected = '-¥' + new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(1234.56);
      expect(window.Store.formatCurrency(-1234.56)).toBe(expected);
    });
  });

  describe('date label locale matrix', () => {
    it('month period labels use the language month names', () => {
      const period = { type: 'month', value: '2026-03-15' };
      const expectations = {
        en: 'March 2026', fr: 'mars 2026', it: 'marzo 2026',
        es: 'marzo de 2026', pt: 'março de 2026'
      };
      for (const [lang, expected] of Object.entries(expectations)) {
        window.I18n.setLang(lang);
        expect(window.Store._getPeriodLabel(period)).toBe(expected);
      }
    });

    it('graph month labels follow the language', () => {
      window.I18n.setLang('it');
      const { monthLabels } = window.Store.computeGraphBalances({ interval: 'monthly' });
      const expectedLast = new Date().toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
      expect(monthLabels[monthLabels.length - 1]).toBe(expectedLast);
    });
  });

  describe('CSV round-trip under a non-English language', () => {
    beforeEach(() => {
      window.I18n.setLang('it');
      window.Store.dispatch('SET_LANGUAGE', 'it');
    });

    it('CSV headers stay English (import.js matches them by name)', () => {
      window.StackdExport.exportTransactions(window.Store.getState());
      const headerRow = lastDownload.content.split('\n')[0];
      expect(headerRow).toBe(window.StackdExport.TX_HEADERS.join(','));
      expect(headerRow.startsWith('Date,Time,Type,Amount,Account,Category')).toBe(true);
    });

    it('amounts are written with dot decimals regardless of language', () => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
      const account = window.Store.getState().accounts[0];
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 1234.56, accountId: account.id,
        categoryId: 'cat_groceries', date: '2026-03-09'
      });
      window.StackdExport.exportTransactions(window.Store.getState());
      const dataRow = lastDownload.content.split('\n')[1];
      expect(dataRow).toContain('1234.56');
      expect(dataRow).not.toContain('1.234,56');
    });

    it('export→import round-trip preserves balances with language=it', () => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 100, openingDate: '2019-01-01' });
      const account = window.Store.getState().accounts[0];
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 30.5, accountId: account.id,
        categoryId: 'cat_groceries', date: '2020-01-05'
      });
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'income', amount: 50.25, accountId: account.id,
        categoryId: 'cat_salary', date: '2020-02-05'
      });
      const before = window.Store.getAccountBalance(account.id);

      window.StackdExport.exportTransactions(window.Store.getState());
      const csv = lastDownload.content;

      // Wipe the ledger (keep the opening balance) and restore from the CSV.
      window.Store.state.transactions = window.Store.state.transactions
        .filter(t => t.type === 'opening_balance');
      const { transactions, stats } = window.StackdImport.buildTransactions(
        window.StackdImport.parseCSV(csv)
      );
      expect(stats.skippedCount).toBe(0);
      window.Store.state.transactions.push(...transactions);

      expect(window.Store.getAccountBalance(account.id)).toBe(before);
    });
  });
});
