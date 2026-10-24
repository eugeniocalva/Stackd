import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.1.0 (IE-1, docs/import-export-plan.md §6a): importCSV's routing moved
// into importText so the Import screen's paste box takes the same path as a
// picked file, and analyzeText tells Check what a text is without writing.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let bootNo = 0;
let setItem;
const boot = () => {
  let uid = 0;
  const prefix = 't' + (++bootNo) + '-';
  setItem = vi.fn();
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: { getItem: vi.fn(), setItem, removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.FileReader = class {
    readAsText(file) { this.onload({ target: { result: file.text } }); }
  };
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'export.js', 'import.js'].forEach(executeFile);
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', 'EUR');
};

const S = () => window.Store;
const I = () => window.StackdImport;

const viaText = (text, opts) => {
  let out = null;
  let err = null;
  I().importText(text, opts, (r) => { out = r; }, (e) => { err = e; });
  return { out, err };
};
const viaFile = (text) => {
  let out = null;
  let err = null;
  I().importCSV({ text }, S().getState(), (r) => { out = r; }, (e) => { err = e; });
  return { out, err };
};
const snapshot = () => {
  const st = S().getState();
  return {
    accounts: st.accounts.map(a => [a.name, a.currency]).sort(),
    tx: st.transactions.map(t => [t.date, t.type, t.amount, t.comment]).sort(),
    categories: st.categories.map(c => c.name).sort()
  };
};

const BACKUP = [
  'Date;Type;Amount;Account;Category;Note',
  '01/02/2026;opening_balance;100,00;Main;;Opening Balance',
  '03/02/2026;expense;12,50;Main;Groceries;latte',
  '04/02/2026;income;1500,00;Main;Salary;'
].join('\r\n');
const BANK = 'Data;Descrizione;Importo\n03/01/2026;SUPERMERCATO;-45,90\n05/01/2026;STIPENDIO;1850,00';
const CAMT = '<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt></BkToCstmrStmt></Document>';
const MT940 = ':20:STARTUMS\n:25:12345678/0012345678\n:28C:0\n:60F:C260101EUR1000,00\n:62F:C260131EUR1000,00';

describe('importText is importCSV for text (1.1.0 IE-1)', () => {
  beforeEach(boot);

  it('a backup lands exactly as the same text picked as a file', () => {
    const a = viaText(BACKUP, { mode: 'restore' });
    expect(a.err).toBeNull();
    expect(a.out.kind).toBe('transactions');
    expect(a.out.importedCount).toBe(2);
    const afterText = snapshot();

    boot();
    const b = viaFile(BACKUP);
    expect(b.err).toBeNull();
    expect({ ...b.out }).toEqual({ ...a.out });
    expect(snapshot()).toEqual(afterText);
  });

  it('opts and mode are optional (restore is the default)', () => {
    const r = viaText(BACKUP);
    expect(r.out.kind).toBe('transactions');
  });

  it('a bank CSV is handed back for the mapping flow, nothing written', () => {
    const before = snapshot();
    const r = viaText(BANK, { mode: 'restore' });
    expect(r.out).toEqual({ kind: 'bank', csvText: BANK });
    expect(snapshot()).toEqual(before);
  });

  it('an MT940 comes back as a statement', () => {
    expect(viaText(MT940).out.kind).toBe('statement');
  });

  it('an empty Stack\'d export restores as 0, garbage fails with nothing written', () => {
    expect(viaText('Date,Time,Type,Amount,Account,Category,Note').out.kind).toBe('transactions');
    const before = snapshot();
    const r = viaText('just one line of text');
    expect(r.out).toBeNull();
    expect(r.err).toBeTruthy();
    expect(snapshot()).toEqual(before);
  });

  it('a throwing success callback still reports through onError once', () => {
    const fail = vi.fn();
    I().importText(BACKUP, {}, () => { throw new Error('boom'); }, fail);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(fail.mock.calls[0][0].message).toBe('boom');
  });

  it('importCSV still reports a read failure without importing', () => {
    global.FileReader = class { readAsText() { this.onerror(); } };
    const before = snapshot();
    const r = viaFile(BACKUP);
    expect(r.out).toBeNull();
    expect(r.err.message).toBe('Failed to read file');
    expect(snapshot()).toEqual(before);
  });
});

describe('analyzeText: what Check sees, without writing (1.1.0 IE-1)', () => {
  beforeEach(boot);

  it('recognises every Stack\'d backup kind from its header', () => {
    const kinds = {
      'id,name,opening_balance,created_at,currency,type,icon,color,opening_date\nx,Main,0,,EUR,Bank,wallet,,2026-01-01': 'accounts',
      'id,name,icon,type_hint\nc1,Food,utensils,expense': 'categories',
      'Match,Category\nLIDL,Groceries': 'rules',
      'Category,Amount,StartMonth,EndMonth,Cumulative,Limits\nFood,100,2026-01,,false,': 'budgets',
      'Name,Kind,Type,Principal,DownPayment,Duration,Config\nCar,sim,car,10000,0,48,{}': 'loans',
      [BACKUP]: 'transactions'
    };
    Object.entries(kinds).forEach(([text, kind]) => {
      const a = I().analyzeText(text);
      expect(a.kind).toBe('backup');
      expect(a.backupKind).toBe(kind);
    });
  });

  it('a header-only Stack\'d export is still a backup (0 rows)', () => {
    const a = I().analyzeText('Date,Time,Type,Amount,Account,Category,Note');
    expect(a).toMatchObject({ kind: 'backup', backupKind: 'transactions', rowCount: 0 });
  });

  it('bank CSVs, including Tab and CR-only ones the restore reader cannot read', () => {
    expect(I().analyzeText(BANK)).toMatchObject({ kind: 'bank', rowCount: 2, delimiter: ';' });
    const tab = I().analyzeText('Date\tDescription\tAmount\n03/01/2026\tShop\t-4,50');
    expect(tab).toMatchObject({ kind: 'bank', delimiter: '\t', rowCount: 1 });
    expect(tab.header).toEqual(['Date', 'Description', 'Amount']);
    const cr = I().analyzeText(BANK.replace(/\n/g, '\r'));
    expect(cr).toMatchObject({ kind: 'bank', rowCount: 2 });
    expect(cr.decided.rowDelimiter).toBe('cr');
  });

  it('statements, empty text and one-column text', () => {
    expect(I().analyzeText(MT940)).toEqual({ kind: 'statement', format: 'mt940' });
    expect(I().analyzeText(CAMT)).toEqual({ kind: 'statement', format: 'camt' });
    expect(I().analyzeText('').kind).toBe('empty');
    expect(I().analyzeText('   \n \n').kind).toBe('empty');
    expect(I().analyzeText('hello\nworld').kind).toBe('unknown');
    expect(I().analyzeText('A;B').kind).toBe('empty'); // a header with no rows
  });

  it('passes the settings through and reports what Auto decided', () => {
    const a = I().analyzeText('A,B;C\n1,2;3', { delimiter: ';', ignoreQuotes: true });
    expect(a.delimiter).toBe(';');
    expect(a.decided).toEqual({ delimiter: ';', rowDelimiter: 'lf', ignoreQuotes: true });
    expect(a.rows[1]).toEqual(['1,2', '3']);
  });

  it('never touches the store', () => {
    const before = snapshot();
    const writes = setItem.mock.calls.length;
    [BACKUP, BANK, MT940, '', 'x'].forEach(t => I().analyzeText(t));
    expect(snapshot()).toEqual(before);
    expect(setItem.mock.calls.length).toBe(writes);
  });
});
