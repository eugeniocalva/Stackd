// 1.0.3 (BUG-147) — an inch mark inside an unquoted bank CSV field
// ('TV 55" SAMSUNG;-499,00') opened quote mode in _parseRow, which then
// swallowed the delimiter and the amount. A quote now opens a quoted field
// only at the start of a field (RFC 4180, the same rule _splitRecords already
// follows); anywhere else it is a literal character.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'q' + (++bootNo) + '-uuid-';
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
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

describe('1.0.3 (BUG-147) a quote inside an unquoted field', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('_parseRow keeps a mid-field quote literal and the following fields intact', () => {
    expect(I()._parseRow('03/01/2026;TV 55" SAMSUNG;-499,00', ';')).toEqual(['03/01/2026', 'TV 55" SAMSUNG', '-499,00']);
    expect(I()._parseRow('a,5" screen,"b, c",d', ',')).toEqual(['a', '5" screen', 'b, c', 'd']);
    expect(I()._parseRow('x;Shop "X;Y" Milano;1', ';')).toEqual(['x', 'Shop "X', 'Y" Milano', '1']);
  });

  it('_parseRow still reads RFC 4180 quoted fields, escaped quotes and leading blanks', () => {
    expect(I()._parseRow('"a ""b"" c";"x;y"', ';')).toEqual(['a "b" c', 'x;y']);
    expect(I()._parseRow('  "q,1" ,2', ',')).toEqual(['q,1', '2']);
    expect(I()._parseRow('"",""', ',')).toEqual(['', '']);
    expect(I()._parseRow('"a"b,c', ',')).toEqual(['ab', 'c']);
  });

  it('two adjacent inch-mark rows each keep their amount', () => {
    const csv = 'Data;Descrizione;Importo\n03/01/2026;TV 55" SAMSUNG;-499,00\n04/01/2026;MONITOR 27" LG;-229,90\n05/01/2026;STIPENDIO;1500,00';
    const a = I().analyzeBankCSV(csv);
    expect(a.rowsRaw).toEqual([
      ['03/01/2026', 'TV 55" SAMSUNG', '-499,00'],
      ['04/01/2026', 'MONITOR 27" LG', '-229,90'],
      ['05/01/2026', 'STIPENDIO', '1500,00']
    ]);
    S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 0, openingDate: '2020-01-01' });
    const { items, stats } = I().buildBankTransactions(a.rowsRaw, { ...a.guess, decimal: 'auto' }, S().getState().accounts[0].id);
    expect(stats.errors).toBe(0);
    expect(items.map(x => [x.tx.amount, x.tx.comment])).toEqual([[499, 'TV 55" SAMSUNG'], [229.9, 'MONITOR 27" LG'], [1500, 'STIPENDIO']]);
  });

  it('the importer routes such a file as a bank CSV with every row', () => {
    const csv = 'Data;Descrizione;Importo\n03/01/2026;TV 55" SAMSUNG;-499,00\n04/01/2026;MONITOR 27" LG;-229,90';
    const r = importFile(csv);
    expect(r.kind).toBe('bank');
    expect(I().analyzeBankCSV(r.csvText).rowsRaw).toHaveLength(2);
  });

  it('_detectDelimiter is not fooled by an inch mark in the header', () => {
    expect(I()._detectDelimiter('Date;TV 55" model, size;Amount')).toBe(';');
    expect(I()._detectDelimiter('Date,Screen 27";Size,Amount')).toBe(',');
  });

  it('Stack\'d exports with quotes and delimiters in notes still round-trip', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Main "Bank", Inc', openingBalance: 10, openingDate: '2026-01-01' });
    const accId = S().getState().accounts[0].id;
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 499, accountId: accId, categoryId: 'cat_shopping', date: '2026-02-03', comment: 'TV 55" SAMSUNG, "promo"; ok' });
    const E = window.StackdExport;
    E.exportAccounts(S().getState()); E.exportTransactions(S().getState());
    const out = { ...files };
    boot();
    importFile(out['stackd_accounts.csv']);
    const r = importFile(out['stackd_transactions.csv']);
    expect(r.kind).toBe('transactions');
    const tx = S().getState().transactions.find(t => t.type === 'expense');
    expect(tx.comment).toBe('TV 55" SAMSUNG, "promo"; ok');
    expect(tx.amount).toBe(499);
    expect(S().getState().accounts.map(a => a.name)).toEqual(['Main "Bank", Inc']);
  });
});
