import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Same executeFile pattern as store.test.js / csvRoundTrip.test.js —
// src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Captures what StackdExport would have downloaded instead of touching the DOM.
let lastDownload = null;

// Semicolon-delimited Italian bank statement — the contract's reference sample.
const ITALIAN_CSV = [
  'Data;Descrizione;Importo',
  '03/01/2026;SUPERMERCATO ROSSI;-45,90',
  '05/01/2026;STIPENDIO;1.850,00'
].join('\n');

const ITALIAN_ROWS = [
  ['03/01/2026', 'SUPERMERCATO ROSSI', '-45,90'],
  ['05/01/2026', 'STIPENDIO', '1.850,00']
];

// Full mapping object per the contract; overrides for per-test variations.
const singleMapping = (over = {}) => ({
  date: 0, description: 1, amountMode: 'single', amount: 2,
  debit: -1, credit: -1, bankRef: -1, dateFormat: 'dmy', decimal: 'auto',
  ...over
});

describe('Bank statement import (v0.99)', () => {
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
  });

  const seedAccount = (name = 'Bank') => {
    window.Store.dispatch('ADD_ACCOUNT', { name, openingBalance: 0, openingDate: '2020-01-01' });
    return window.Store.getState().accounts.find(a => a.name === name).id;
  };

  const exportCsv = () => {
    window.StackdExport.exportTransactions(window.Store.getState());
    return lastDownload.content;
  };

  // ── analyzeBankCSV ─────────────────────────────────────────────────────────

  describe('analyzeBankCSV', () => {
    it('guesses the mapping of a semicolon Italian statement', () => {
      const a = window.StackdImport.analyzeBankCSV(ITALIAN_CSV);

      expect(a.headerLabels).toEqual(['Data', 'Descrizione', 'Importo']);
      expect(a.rowsRaw).toEqual(ITALIAN_ROWS);

      const g = a.guess;
      expect(g.date).toBe(0);
      expect(g.dateFormat).toBe('dmy');
      expect(g.description).toBe(1);
      expect(g.amountMode).toBe('single');
      expect(g.amount).toBe(2);
      expect(g.debit).toBe(-1);
      expect(g.credit).toBe(-1);
      expect(g.bankRef).toBe(-1);
      expect(g.decimal).toBe('auto');
    });

    it('builds the signature from squashed header labels joined with |', () => {
      const a = window.StackdImport.analyzeBankCSV(ITALIAN_CSV);
      expect(a.signature).toBe('data|descrizione|importo');

      // Casing/punctuation drift lands on the same signature.
      const b = window.StackdImport.analyzeBankCSV(
        'DATA ;" Descrizione";Importo (EUR)\n03/01/2026;X;-1,00'
      );
      expect(b.signature).toBe('data|descrizione|importoeur');
    });

    it('exposes per-column samples for the mapping selects', () => {
      const a = window.StackdImport.analyzeBankCSV(ITALIAN_CSV);
      expect(a.columns).toHaveLength(3);
      expect(a.columns[2]).toEqual({
        index: 2, label: 'Importo', samples: ['-45,90', '1.850,00']
      });
    });

    // v0.99 review fix: delimiter detection is quote-aware — a semicolon
    // hiding inside a QUOTED header cell of a comma file no longer wins.
    it('detects the comma delimiter despite a quoted semicolon in a header', () => {
      const csv = [
        '"Booking; value date",Description,Amount',
        '03/01/2026,COFFEE,-2.50'
      ].join('\n');
      const a = window.StackdImport.analyzeBankCSV(csv);
      expect(a.headerLabels).toEqual(['Booking; value date', 'Description', 'Amount']);
      expect(a.rowsRaw[0]).toEqual(['03/01/2026', 'COFFEE', '-2.50']);
    });
  });

  // ── parseBankAmount ────────────────────────────────────────────────────────

  describe('parseBankAmount', () => {
    const p = (v, mode = 'auto') => window.StackdImport.parseBankAmount(v, mode);

    it('parses the contract table', () => {
      expect(p('1.850,00')).toBe(1850);
      expect(p('-45,90')).toBe(-45.9);
      expect(p('1,234.56')).toBe(1234.56);
      expect(p("1'234.50")).toBe(1234.5);   // Swiss apostrophe thousands
      expect(p('123,45-')).toBe(-123.45);   // trailing minus
      expect(p('12.345')).toBe(12345);      // lone dot + 3 digits = thousands
      expect(p('')).toBeNull();
    });

    it('handles parentheses, currency symbols and forced separators', () => {
      expect(p('(12,34)')).toBe(-12.34);
      expect(p('EUR 1.850,00')).toBe(1850);
      expect(p('1.850,00', 'comma')).toBe(1850);
      expect(p('1,850.00', 'dot')).toBe(1850);
      expect(p('garbage')).toBeNull();
      expect(p(null)).toBeNull();
    });

    // v0.99 review fix: a minus between a currency prefix and the digits (or a
    // Unicode minus) was stripped with the symbol, flipping debits to income.
    it('keeps the sign of currency-prefixed and Unicode-minus negatives', () => {
      expect(p('EUR -45,90')).toBe(-45.9);
      expect(p('€ -45,90')).toBe(-45.9);
      expect(p('€-45,90')).toBe(-45.9);
      expect(p('CHF -12.00')).toBe(-12);
      expect(p('−45,90')).toBe(-45.9);      // U+2212 minus sign
      expect(p('EUR -45,90', 'comma')).toBe(-45.9);
      expect(p('EUR 45,90')).toBe(45.9);          // positive stays positive
    });
  });

  // ── buildBankTransactions ──────────────────────────────────────────────────

  describe('buildBankTransactions', () => {
    it('maps signs to types and normalizes dmy dates', () => {
      const accId = seedAccount();
      const { items, stats } = window.StackdImport.buildBankTransactions(
        ITALIAN_ROWS, singleMapping(), accId
      );

      expect(stats).toEqual({ total: 2, ok: 2, duplicates: 0, errors: 0 });

      expect(items[0].tx.type).toBe('expense');
      expect(items[0].tx.amount).toBe(45.9);
      expect(items[0].tx.date).toBe('2026-01-03');
      expect(items[0].tx.comment).toBe('SUPERMERCATO ROSSI');
      expect(items[0].duplicate).toBe(false);
      expect(items[0].error).toBeNull();

      expect(items[1].tx.type).toBe('income');
      expect(items[1].tx.amount).toBe(1850);
      expect(items[1].tx.date).toBe('2026-01-05');
    });

    it('normalizes ymd dates and 2-digit years', () => {
      const accId = seedAccount();
      const ymd = window.StackdImport.buildBankTransactions(
        [['2026-01-03', 'X', '-1,00']], singleMapping({ dateFormat: 'ymd' }), accId
      );
      expect(ymd.items[0].tx.date).toBe('2026-01-03');

      const shortYear = window.StackdImport.buildBankTransactions(
        [['03/01/26', 'X', '-1,00']], singleMapping(), accId
      );
      expect(shortYear.items[0].tx.date).toBe('2026-01-03');

      const bad = window.StackdImport.buildBankTransactions(
        [['not a date', 'X', '-1,00']], singleMapping(), accId
      );
      expect(bad.items[0].tx).toBeNull();
      expect(bad.items[0].error).toBeTruthy();
      expect(bad.stats.errors).toBe(1);
    });

    it('handles split debit/credit files', () => {
      const accId = seedAccount();
      const mapping = singleMapping({ amountMode: 'split', amount: -1, debit: 2, credit: 3 });
      const rows = [
        ['03/01/2026', 'CANONE MENSILE', '12,00', ''],
        ['05/01/2026', 'BONIFICO IN ENTRATA', '', '500,00'],
        ['06/01/2026', 'RIGA VUOTA', '', '']
      ];
      const { items, stats } = window.StackdImport.buildBankTransactions(rows, mapping, accId);

      expect(items[0].tx.type).toBe('expense');
      expect(items[0].tx.amount).toBe(12);
      expect(items[1].tx.type).toBe('income');
      expect(items[1].tx.amount).toBe(500);
      expect(items[2].tx).toBeNull();
      expect(items[2].error).toBeTruthy();
      expect(stats).toEqual({ total: 3, ok: 2, duplicates: 0, errors: 1 });
    });

    it('builds fp: importKeys from account, date, type, cents and squashed description', () => {
      const accId = seedAccount();
      const { items } = window.StackdImport.buildBankTransactions(
        ITALIAN_ROWS, singleMapping(), accId
      );
      expect(items[0].tx.importKey)
        .toBe('fp:' + accId + '|2026-01-03|expense|4590|supermercato rossi');
      expect(items[1].tx.importKey)
        .toBe('fp:' + accId + '|2026-01-05|income|185000|stipendio');
    });

    it('suffixes intra-file twins with #2, #3 deterministically', () => {
      const accId = seedAccount();
      const twin = ['03/01/2026', 'SUPERMERCATO ROSSI', '-45,90'];
      const run = () => window.StackdImport.buildBankTransactions(
        [twin, twin, twin], singleMapping(), accId
      ).items.map(it => it.tx.importKey);

      const base = 'fp:' + accId + '|2026-01-03|expense|4590|supermercato rossi';
      const first = run();
      expect(first).toEqual([base, base + '#2', base + '#3']);
      // Deterministic: a re-import of the same file regenerates the same keys.
      expect(run()).toEqual(first);
    });

    it('uses ref: keys when a bank reference column is mapped and non-empty', () => {
      const accId = seedAccount();
      const mapping = singleMapping({ bankRef: 3 });
      const rows = [
        ['03/01/2026', 'POS PAGAMENTO', '-10,00', 'TX-001'],
        ['04/01/2026', 'POS PAGAMENTO', '-11,00', ''] // empty ref → fingerprint
      ];
      const { items } = window.StackdImport.buildBankTransactions(rows, mapping, accId);

      expect(items[0].tx.importKey).toBe('ref:' + accId + '|TX-001');
      expect(items[0].tx.bankRef).toBe('TX-001');
      expect(items[1].tx.importKey).toBe('fp:' + accId + '|2026-01-04|expense|1100|pos pagamento');
      expect(items[1].tx).not.toHaveProperty('bankRef');
    });

    // v0.99 review fix: trim AFTER the 60-char slice — a cut landing on a word
    // boundary left a trailing space that every CSV restore trims away,
    // drifting the key and breaking backup-round-trip dedup for that row.
    it('never produces an fp: key with a trailing space at the slice boundary', () => {
      const accId = seedAccount();
      // 59-char token + space + more text → the slice lands on the boundary.
      const desc = 'A'.repeat(59) + ' TRAILING WORDS';
      const { items } = window.StackdImport.buildBankTransactions(
        [['03/01/2026', desc, '-45,90']], singleMapping(), accId
      );
      const key = items[0].tx.importKey;
      expect(key).toBe(key.trim());
      expect(key.endsWith(' ')).toBe(false);
    });

    // v0.99 review fix: '#'/'%' in a literal bankRef are escaped inside the
    // key so a ref ending in '#2' can't collide with an ordinal twin suffix.
    it('keeps a literal ref ending in #2 distinct from an ordinal twin suffix', () => {
      const accId = seedAccount();
      const mapping = singleMapping({ bankRef: 3 });
      const rows = [
        ['03/01/2026', 'POS', '-10,00', 'ABC'],
        ['03/01/2026', 'POS', '-10,00', 'ABC'],      // twin → ordinal '#2'
        ['03/01/2026', 'POS', '-10,00', 'ABC#2'],    // literal '#2' in the ref
        ['03/01/2026', 'POS', '-10,00', 'ABC%232']   // literal '%23' too
      ];
      const { items } = window.StackdImport.buildBankTransactions(rows, mapping, accId);
      const keys = items.map(it => it.tx.importKey);
      expect(new Set(keys).size).toBe(4);
    });

    it('produces txs with empty categoryId and none of the forbidden keys', () => {
      const accId = seedAccount();
      const { items } = window.StackdImport.buildBankTransactions(
        ITALIAN_ROWS, singleMapping(), accId
      );
      items.forEach(it => {
        expect(it.tx.categoryId).toBe('');
        expect(it.tx.accountId).toBe(accId);
        expect(it.tx).not.toHaveProperty('recurrence');
        expect(it.tx).not.toHaveProperty('transferRef');
        expect(it.tx).not.toHaveProperty('time');
        expect(it.tx).not.toHaveProperty('id');
      });
    });
  });

  // ── BATCH_IMPORT_BANK_TRANSACTIONS dedup ───────────────────────────────────

  describe('BATCH_IMPORT_BANK_TRANSACTIONS', () => {
    it('imports once and dedups a re-dispatch of the same payload', () => {
      const accId = seedAccount();
      const { items } = window.StackdImport.buildBankTransactions(
        ITALIAN_ROWS, singleMapping(), accId
      );
      const txs = items.map(it => it.tx);
      const before = window.Store.getState().transactions.length; // opening balance

      window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: txs });
      expect(window.Store.getState().transactions.length).toBe(before + 2);

      // Same payload again: every key already exists → nothing accepted.
      window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: txs });
      expect(window.Store.getState().transactions.length).toBe(before + 2);

      expect(window.Store.hasImportKey(txs[0].importKey)).toBe(true);
      expect(window.Store.hasImportKey(txs[1].importKey)).toBe(true);

      // Stored rows carry the key and got store-generated ids and a time.
      const stored = window.Store.getState().transactions.filter(t => t.importKey);
      expect(stored).toHaveLength(2);
      stored.forEach(t => {
        expect(t.id).toBeTruthy();
        expect(t.time).toBeTruthy();
      });
    });

    it('skips a tx without an importKey', () => {
      const accId = seedAccount();
      const before = window.Store.getState().transactions.length;
      window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', {
        transactions: [{
          type: 'expense', amount: 5, accountId: accId, categoryId: '',
          date: '2026-02-01', comment: 'no key'
        }]
      });
      expect(window.Store.getState().transactions.length).toBe(before);
    });

    it('flags every item duplicate on a second buildBankTransactions pass', () => {
      const accId = seedAccount();
      const first = window.StackdImport.buildBankTransactions(
        ITALIAN_ROWS, singleMapping(), accId
      );
      window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', {
        transactions: first.items.map(it => it.tx)
      });

      const second = window.StackdImport.buildBankTransactions(
        ITALIAN_ROWS, singleMapping(), accId
      );
      expect(second.items.every(it => it.duplicate === true)).toBe(true);
      expect(second.stats).toEqual({ total: 2, ok: 0, duplicates: 2, errors: 0 });
    });
  });

  // ── SAVE_IMPORT_PRESET ─────────────────────────────────────────────────────

  describe('SAVE_IMPORT_PRESET', () => {
    it('creates a preset and upserts by signature without duplicating', () => {
      const m1 = singleMapping();
      window.Store.dispatch('SAVE_IMPORT_PRESET', { signature: 'data|descrizione|importo', mapping: m1 });

      let presets = window.Store.getState().importPresets;
      expect(presets).toHaveLength(1);
      expect(presets[0].signature).toBe('data|descrizione|importo');
      expect(presets[0].mapping).toEqual(m1);
      expect(presets[0].id).toBeTruthy();
      expect(presets[0].createdAt).toBeTruthy();
      expect(presets[0].updatedAt).toBeTruthy();
      const firstId = presets[0].id;

      const m2 = singleMapping({ amount: 5 });
      window.Store.dispatch('SAVE_IMPORT_PRESET', { signature: 'data|descrizione|importo', mapping: m2 });

      presets = window.Store.getState().importPresets;
      expect(presets).toHaveLength(1);           // upsert, no duplicate entry
      expect(presets[0].id).toBe(firstId);
      expect(presets[0].mapping.amount).toBe(5);
    });

    it('persists the slice under stackd_v1_importPresets', () => {
      window.Store.dispatch('SAVE_IMPORT_PRESET', { signature: 'sig|a', mapping: singleMapping() });
      const calls = window.localStorage.setItem.mock.calls
        .filter(c => c[0] === 'stackd_v1_importPresets');
      expect(calls.length).toBeGreaterThan(0);
      const saved = JSON.parse(calls[calls.length - 1][1]);
      expect(saved).toHaveLength(1);
      expect(saved[0].signature).toBe('sig|a');
    });

    it('caps the slice at 20 by evicting the smallest updatedAt', () => {
      for (let i = 1; i <= 20; i++) {
        window.Store.dispatch('SAVE_IMPORT_PRESET', { signature: 'sig-' + i, mapping: singleMapping() });
      }
      expect(window.Store.getState().importPresets).toHaveLength(20);

      // Make one preset clearly the least recently used, then add a 21st.
      window.Store.getState().importPresets
        .find(p => p.signature === 'sig-7').updatedAt = '2000-01-01T00:00:00.000Z';
      window.Store.dispatch('SAVE_IMPORT_PRESET', { signature: 'sig-21', mapping: singleMapping() });

      const sigs = window.Store.getState().importPresets.map(p => p.signature);
      expect(sigs).toHaveLength(20);
      expect(sigs).not.toContain('sig-7');   // LRU evicted
      expect(sigs).toContain('sig-1');
      expect(sigs).toContain('sig-21');
    });
  });

  // ── RESET_APP ──────────────────────────────────────────────────────────────

  it('RESET_APP saves an empty importPresets slice', () => {
    window.Store.dispatch('SAVE_IMPORT_PRESET', { signature: 'sig|x', mapping: singleMapping() });
    window.Store.dispatch('RESET_APP');

    const calls = window.localStorage.setItem.mock.calls
      .filter(c => c[0] === 'stackd_v1_importPresets');
    expect(calls[calls.length - 1][1]).toBe('[]');
  });

  // ── Backup round-trip ──────────────────────────────────────────────────────

  it('round-trips importKey/bankRef through a CSV backup and keeps dedup alive', () => {
    const accId = seedAccount();
    const rows = [
      ['03/01/2026', 'SUPERMERCATO ROSSI', '-45,90', 'TX-001'],
      ['05/01/2026', 'STIPENDIO', '1.850,00', '']
    ];
    const { items } = window.StackdImport.buildBankTransactions(
      rows, singleMapping({ bankRef: 3 }), accId
    );
    window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', {
      transactions: items.map(it => it.tx)
    });
    const keys = items.map(it => it.tx.importKey);
    expect(keys[0]).toBe('ref:' + accId + '|TX-001');
    expect(keys[1].startsWith('fp:')).toBe(true);

    // Export carries the new trailing columns and the actual key values.
    const csv = exportCsv();
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toContain('ImportKey');
    expect(headerLine).toContain('BankRef');
    expect(csv).toContain(keys[0]);
    expect(csv).toContain(keys[1]);
    expect(csv).toContain('TX-001');

    // Feed it back through the restore path: keys survive on the rebuilt txs.
    const rebuilt = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    ).transactions;
    const withKeys = rebuilt.filter(t => t.importKey);
    expect(withKeys.map(t => t.importKey).sort()).toEqual([...keys].sort());
    expect(withKeys.find(t => t.importKey === keys[0]).bankRef).toBe('TX-001');

    // Wipe the ledger (keep the opening balance), restore the backup, and the
    // dedup index still recognises both keys — a later bank re-import of the
    // same statement would be flagged duplicate.
    window.Store.state.transactions = window.Store.state.transactions
      .filter(t => t.type === 'opening_balance');
    window.Store.dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: rebuilt });

    keys.forEach(k => expect(window.Store.hasImportKey(k)).toBe(true));
  });
});
