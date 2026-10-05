import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-33): a line break inside a quoted CSV field (RFC 4180) is part of
// the field. Every reader used to split the file on each line break first, so
// a multi-line note ended its record early: every column after Note was lost
// (IsPaid, TransferRef, the series columns, ImportKey, BankRef…) and the rest
// became a bogus row skipped as 'missing date, amount or account'.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
let bootNo = 0;
// Ids never repeat across boots: a restore keeps the backup's ids.
const boot = () => {
  let uid = 0;
  const prefix = 'r' + (++bootNo) + '-uuid-';
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.FileReader = class {
    readAsText(file) { this.onload({ target: { result: file.text } }); }
  };
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', 'EUR');
};

const S = () => window.Store;
const I = () => window.StackdImport;
const importFile = (csv) => {
  let out;
  I().importCSV({ text: csv }, S().getState(), (r) => { out = r; }, (e) => { throw e; });
  return out;
};
// What 1.0.1 did: one record per physical line.
const oldRows = (csv) => {
  const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
  const d = I()._detectDelimiter(lines[0]);
  const headers = I()._parseRow(lines[0], d).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return lines.slice(1).map(l => {
    const v = I()._parseRow(l, d);
    const row = {};
    headers.forEach((h, i) => { row[h] = v[i] !== undefined ? v[i] : ''; });
    return row;
  });
};

const BANK_LF = [
  'Date,Description,Amount',
  '2026-01-03,"CARD PAYMENT',
  'LIDL 1234 MILANO",-45.90',
  '2026-01-05,"TRANSFER TO',
  'JOHN DOE',
  'REF 99",-120.00',
  '2026-01-07,SALARY,1850.00'
].join('\n');

describe('1.0.2 (BUG-33) RFC 4180 records', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('parseCSV keeps a quoted line break inside the field', () => {
    const rows = I().parseCSV(BANK_LF);
    expect(rows).toHaveLength(3);
    expect(rows[0].description).toBe('CARD PAYMENT\nLIDL 1234 MILANO');
    expect(rows[1].description).toBe('TRANSFER TO\nJOHN DOE\nREF 99');
    expect(rows[1].amount).toBe('-120.00');
    expect(rows[2].description).toBe('SALARY');
  });

  it('reads CRLF files, and a CRLF inside quotes becomes a plain line break', () => {
    const crlf = BANK_LF.split('\n').join('\r\n');
    const rows = I().parseCSV(crlf);
    expect(rows).toHaveLength(3);
    expect(rows[0].description).toBe('CARD PAYMENT\nLIDL 1234 MILANO');
    expect(rows[1].description).toBe('TRANSFER TO\nJOHN DOE\nREF 99');
    expect(rows[2].amount).toBe('1850.00');
  });

  it('analyzeBankCSV sees three rows and guesses the mapping', () => {
    const a = I().analyzeBankCSV(BANK_LF);
    expect(a.rowsRaw).toHaveLength(3);
    expect(a.guess).toMatchObject({ date: 0, description: 1, amount: 2, dateFormat: 'ymd' });
  });

  it('a bank CSV stores the note on one line, with the same key as the multi-line text', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 0, openingDate: '2020-01-01' });
    const accId = S().getState().accounts[0].id;
    const a = I().analyzeBankCSV(BANK_LF);
    const { items, stats } = I().buildBankTransactions(a.rowsRaw, { ...a.guess, decimal: 'auto' }, accId);
    expect(stats.errors).toBe(0);
    expect(items[0].tx.comment).toBe('CARD PAYMENT LIDL 1234 MILANO');
    expect(items[1].tx.comment).toBe('TRANSFER TO JOHN DOE REF 99');
    // The key a multi-line description gives (what a 1.0.1 camt import stored).
    const legacy = { type: 'expense', amount: 45.9, date: '2026-01-03', comment: 'CARD PAYMENT\nLIDL 1234 MILANO' };
    I()._stampImportKey(legacy, '', accId, {});
    expect(items[0].tx.importKey).toBe(legacy.importKey);
  });

  it('a backup with multi-line notes restores every column onto a new phone', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 1000, openingDate: '2026-01-01' });
    S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
    const bank = S().getState().accounts.find(a => a.name === 'Main Bank');
    const sav = S().getState().accounts.find(a => a.name === 'Savings');
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 54.3, accountId: bank.id, categoryId: 'cat_groceries',
      date: '2026-02-03', time: '10:00:00', comment: 'Supermercato\nRossi — Spesa' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 120, accountId: bank.id, categoryId: 'cat_groceries',
      date: '2026-02-10', time: '09:00:00', comment: 'Bolletta\r\nluce', isPaid: false });
    S().dispatch('ADD_TRANSFER', { amount: 200, expenseAccountId: bank.id, incomeAccountId: sav.id,
      date: '2026-02-12', note: 'Risparmio\nfebbraio' });
    S().dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: [{
      type: 'expense', amount: 12.4, accountId: bank.id, categoryId: '', date: '2026-02-05',
      comment: 'PAGAMENTO POS\nBAR CENTRALE', importKey: 'ref:' + bank.id + '|BK-1', bankRef: 'BK-1'
    }] });
    const balances = () => Object.fromEntries(S().getState().accounts.map(a => [a.name, S().getAccountBalance(a.id)]));
    const before = balances();
    const st = S().getState();
    window.StackdExport.exportAccounts(st);
    window.StackdExport.exportTransactions(st);
    const out = { accounts: files['stackd_accounts.csv'], transactions: files['stackd_transactions.csv'] };

    boot(); // new phone
    const res = importFile(out.transactions);
    expect(res.kind).toBe('transactions');
    expect(res.skippedCount).toBe(0);
    importFile(out.accounts);

    const txs = S().getState().transactions;
    const shop = txs.find(t => t.amount === 54.3);
    expect(shop.comment).toBe('Supermercato Rossi — Spesa');
    const bill = txs.find(t => t.amount === 120);
    expect(bill.isPaid).toBe(false);
    expect(bill.comment).toBe('Bolletta luce');
    const legs = txs.filter(t => t.transferRef);
    expect(legs).toHaveLength(2);
    expect(legs[0].transferRef).toBe(legs[1].transferRef);
    expect(legs.every(t => t.comment === 'Risparmio febbraio')).toBe(true);
    const bankRow = txs.find(t => t.bankRef === 'BK-1');
    expect(bankRow.importKey).toBe('ref:' + bank.id + '|BK-1');
    expect(bankRow.comment).toBe('PAGAMENTO POS BAR CENTRALE');
    expect(balances()).toEqual(before);
  });

  it('a rules file with a quoted multi-line Match restores as one rule', () => {
    const res = importFile('Match,Category\n"Supermercato\nRossi",Groceries');
    expect(res.kind).toBe('rules');
    expect(res.importedCount).toBe(1);
    expect(S().getState().importRules.map(r => r.match)).toEqual(['supermercato rossi']);
  });

  it('StackdExport._toRow quotes a value containing a carriage return', () => {
    expect(window.StackdExport._toRow(['a\rb', 'c'])).toBe('"a\rb",c');
  });

  describe('guards: files that are not RFC 4180 read as in 1.0.1', () => {
    it('an unterminated quote reads the whole file line by line', () => {
      const csv = [
        'Date,Description,Amount',
        '2026-01-03,"OPEN QUOTE,-1.00',
        '2026-01-04,NORMAL,-2.00',
        '2026-01-05,ALSO NORMAL,-3.00'
      ].join('\n');
      expect(I().parseCSV(csv)).toEqual(oldRows(csv));
      expect(I().parseCSV(csv)).toHaveLength(3);
    });

    it('a quote in the middle of a field stays literal and line-local', () => {
      const csv = 'Date,Description,Amount\n2026-01-03,5" screen,-1.00\n2026-01-04,NEXT,-2.00';
      const rows = I().parseCSV(csv);
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(oldRows(csv));
      expect(rows[1].description).toBe('NEXT');
    });

    it('a stray opening quote closed lines later does not swallow the rows in between (E10)', () => {
      const csv = [
        'Date,Description,Amount',
        '2026-01-01,A,-1.00',
        '2026-01-02,B,-2.00',
        '2026-01-03,C,-3.00',
        '2026-01-04,"STRAY,-4.00', // line 5 opens a quote at the start of a field
        '2026-01-05,D,-5.00',
        '2026-01-06,E,-6.00',
        '2026-01-07,F,-7.00',
        '2026-01-08,G",-8.00', // line 9 closes it at the end of a field
        '2026-01-09,H,-9.00'
      ].join('\n');
      const rows = I().parseCSV(csv);
      expect(rows).toEqual(oldRows(csv));
      expect(rows).toHaveLength(9);
      expect(rows.map(r => r.date).slice(4, 7)).toEqual(['2026-01-05', '2026-01-06', '2026-01-07']);
    });

    it('a stray opening quote closed mid-field on the next line keeps that next row (integrated review)', () => {
      const csv = [
        'Date,Description,Amount',
        '2026-09-01,"ACME 5,-10.00',
        '2026-09-02,Shop "X" Milano,-5.00',
        '2026-09-03,Lidl,-20.00'
      ].join('\n');
      const rows = I().parseCSV(csv);
      expect(rows).toEqual(oldRows(csv));
      expect(rows.map(r => r.description)).toContain('Shop X Milano'); // read as 1.0.1 did
      // a real two-line note still reads as one record
      const note = 'Date,Description,Amount\n2026-09-01,"two\nlines",-1.00\n2026-09-02,Lidl,-2.00';
      expect(I().parseCSV(note).map(r => r.description)).toEqual(['two\nlines', 'Lidl']);
    });

    it('the fp key of a flattened camt note equals the key of its multi-line text', () => {
      const a = { type: 'expense', amount: 45.9, date: '2026-01-03', comment: 'Supermercato Rossi — Spesa settimanale' };
      const b = { type: 'expense', amount: 45.9, date: '2026-01-03', comment: 'Supermercato\n  Rossi — Spesa\nsettimanale' };
      I()._stampImportKey(a, '', 'acc-1', {});
      I()._stampImportKey(b, '', 'acc-1', {});
      expect(a.importKey).toBe(b.importKey);
    });
  });
});
