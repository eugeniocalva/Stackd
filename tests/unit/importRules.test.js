import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Same executeFile pattern as store.test.js — src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Captures what StackdExport would have downloaded instead of touching the DOM.
let lastDownload = null;

describe('Import category rules (v1.01)', () => {
  let seedAccount;
  let addRule;

  beforeEach(() => {
    let uid = 0;
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + (++uid) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('export.js');
    executeFile('import.js');

    lastDownload = null;
    global.window.StackdExport._download = (filename, content) => {
      lastDownload = { filename, content };
    };

    global.window.Store.init();

    seedAccount = () => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0 });
      return window.Store.getState().accounts[0].id;
    };
    addRule = (match, categoryId) =>
      window.Store.dispatch('ADD_IMPORT_RULE', { match, categoryId });
  });

  // ── ADD_IMPORT_RULE / DELETE_IMPORT_RULE ───────────────────────────────────

  describe('rule dispatch cases', () => {
    it('prepends new rules and normalizes the match', () => {
      addRule('  SUPERMERCATO Rossi  ', 'cat_groceries');
      addRule('Enel Energia', 'cat_utilities');

      const rules = window.Store.getState().importRules;
      expect(rules).toHaveLength(2);
      expect(rules[0].match).toBe('enel energia'); // newest first
      expect(rules[1].match).toBe('supermercato rossi');
      expect(rules[0].id).toBeTruthy();
      expect(rules[0].createdAt).toBeTruthy();
    });

    it('re-teaching a match replaces the old rule and moves it to the front', () => {
      addRule('rossi', 'cat_groceries');
      addRule('enel', 'cat_utilities');
      addRule('rossi', 'cat_shopping'); // re-teach

      const rules = window.Store.getState().importRules;
      expect(rules).toHaveLength(2);
      expect(rules[0]).toMatchObject({ match: 'rossi', categoryId: 'cat_shopping' });
      expect(rules[1].match).toBe('enel');
    });

    it('ignores empty matches and missing categories, caps at 100', () => {
      addRule('', 'cat_groceries');
      addRule('x', '');
      expect(window.Store.getState().importRules).toHaveLength(0);

      for (let i = 0; i < 105; i++) addRule('merchant-' + i, 'cat_groceries');
      expect(window.Store.getState().importRules).toHaveLength(100);
      // newest survive the cap
      expect(window.Store.getState().importRules[0].match).toBe('merchant-104');
    });

    it('persists via StackdDB and deletes by id', () => {
      addRule('rossi', 'cat_groceries');
      const id = window.Store.getState().importRules[0].id;

      window.Store.dispatch('DELETE_IMPORT_RULE', id);
      expect(window.Store.getState().importRules).toHaveLength(0);

      const writes = window.localStorage.setItem.mock.calls
        .filter(c => c[0] === 'stackd_v1_importRules');
      expect(writes.length).toBeGreaterThanOrEqual(2);
      expect(writes[writes.length - 1][1]).toBe('[]');
    });

    it('RESET_APP clears the rules slice', () => {
      addRule('rossi', 'cat_groceries');
      window.Store.dispatch('RESET_APP');
      const writes = window.localStorage.setItem.mock.calls
        .filter(c => c[0] === 'stackd_v1_importRules');
      expect(writes[writes.length - 1][1]).toBe('[]');
    });
  });

  // ── matchImportRule ────────────────────────────────────────────────────────

  describe('matchImportRule', () => {
    it('is a case-insensitive substring test, first (= newest) match wins', () => {
      addRule('rossi', 'cat_groceries');
      addRule('supermercato', 'cat_shopping'); // newer, also matches

      expect(window.Store.matchImportRule('SUPERMERCATO ROSSI MILANO')).toBe('cat_shopping');
      expect(window.Store.matchImportRule('Da Rossi ristorante')).toBe('cat_groceries');
      expect(window.Store.matchImportRule('no hit here')).toBe('');
      expect(window.Store.matchImportRule('')).toBe('');
    });

    it('skips rules whose category no longer exists', () => {
      addRule('rossi', 'cat_gone_forever');
      addRule('rossi supermercato', 'cat_groceries');
      // 'rossi supermercato' does not appear in this description, and the
      // matching 'rossi' rule points at a dead category → no match at all.
      expect(window.Store.matchImportRule('SUPERMERCATO ROSSI')).toBe('');
    });
  });

  // ── rules applied at build time ────────────────────────────────────────────

  describe('builders apply rules', () => {
    it('bank-CSV rows get their category from the rules', () => {
      const accId = seedAccount();
      addRule('supermercato rossi', 'cat_groceries');

      const { items } = window.StackdImport.buildBankTransactions(
        [['03/01/2026', 'SUPERMERCATO ROSSI', '-45,90'],
         ['05/01/2026', 'STIPENDIO', '1.850,00']],
        { date: 0, description: 1, amountMode: 'single', amount: 2, debit: -1, credit: -1, bankRef: -1, dateFormat: 'dmy', decimal: 'auto' },
        accId
      );
      expect(items[0].tx.categoryId).toBe('cat_groceries');
      expect(items[1].tx.categoryId).toBe('');
    });

    it('statement rows get their category from the rules', () => {
      const accId = seedAccount();
      addRule('supermercato rossi', 'cat_groceries');

      const { items } = window.StackdImport.buildStatementTransactions({
        entries: [{ date: '2026-01-03', description: 'SUPERMERCATO ROSSI — Spesa settimanale', type: 'expense', amount: 45.9, bankRef: '' }]
      }, accId);
      expect(items[0].tx.categoryId).toBe('cat_groceries');
    });
  });

  // ── suggestRuleMatch ───────────────────────────────────────────────────────

  it('suggestRuleMatch keeps the stable party segment of structured descriptions', () => {
    const s = window.StackdImport.suggestRuleMatch;
    expect(s('SUPERMERCATO ROSSI — Spesa settimanale')).toBe('supermercato rossi');
    expect(s('PLAIN CSV DESCRIPTION')).toBe('plain csv description');
    expect(s('')).toBe('');
    expect(s('A'.repeat(80)).length).toBe(60);
  });

  // ── rules CSV backup round-trip ────────────────────────────────────────────

  it('round-trips rules through the CSV export by category NAME', () => {
    addRule('supermercato rossi', 'cat_groceries');
    addRule('enel energia', 'cat_gone'); // dead category: not exported

    window.StackdExport.exportImportRules(window.Store.getState());
    expect(lastDownload.filename).toBe('stackd_import_rules.csv');
    expect(lastDownload.content).toContain('Match,Category');
    expect(lastDownload.content).toContain('supermercato rossi,Groceries');
    expect(lastDownload.content).not.toContain('enel energia');

    // Wipe and restore on a "different install": category resolved by name.
    window.Store.state.importRules = [];
    const rows = window.StackdImport.parseCSV(lastDownload.content);
    expect(window.StackdImport.isRuleRows(rows)).toBe(true);
    const stats = window.StackdImport.buildImportRules(rows);
    expect(stats.importedCount).toBe(1);
    expect(window.Store.getState().importRules[0]).toMatchObject({
      match: 'supermercato rossi', categoryId: 'cat_groceries'
    });
  });

  it('restores multi-rule files in file order (first row = highest priority)', () => {
    const csv = [
      'Match,Category',
      'first priority,Groceries',
      'second priority,Transport',
      'brand new cat,Dogfood' // does not exist → created
    ].join('\n');
    const rows = window.StackdImport.parseCSV(csv);
    const stats = window.StackdImport.buildImportRules(rows);

    expect(stats.importedCount).toBe(3);
    const rules = window.Store.getState().importRules;
    expect(rules.map(r => r.match)).toEqual(['first priority', 'second priority', 'brand new cat']);
    const dogfood = window.Store.getState().categories.find(c => c.name === 'Dogfood');
    expect(dogfood).toBeTruthy();
    expect(rules[2].categoryId).toBe(dogfood.id);
  });

  it('a rules CSV is not mistaken for a bank CSV or a backup', () => {
    const rows = window.StackdImport.parseCSV('Match,Category\nrossi,Groceries');
    expect(window.StackdImport.isRuleRows(rows)).toBe(true);
    expect(window.StackdImport.isLoanRows(rows)).toBe(false);
    // and a real bank CSV is not mistaken for rules
    const bank = window.StackdImport.parseCSV('Data;Descrizione;Importo\n03/01/2026;X;-1,00');
    expect(window.StackdImport.isRuleRows(bank)).toBe(false);
  });
});
