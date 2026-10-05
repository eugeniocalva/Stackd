import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-31): a restore file has ONE decimal convention. parseFloat read
// '12,50' as 12 and '1.850,00' as 1.85 — a truncated prefix is never NaN, so
// the cents of every row of an EU-formatted file vanished silently.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'm' + (++bootNo) + '-uuid-';
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
const BOM = String.fromCharCode(0xFEFF);
const REPLACEMENT = String.fromCharCode(0xFFFD); // what a cp1252 '€' becomes when read as UTF-8
const importFile = (csv) => {
  let out;
  I().importCSV({ text: csv }, S().getState(), (r) => { out = r; }, (e) => { throw e; });
  return out;
};
const acc = (name) => S().getState().accounts.find(a => a.name === name);
const amounts = () => S().getState().transactions.filter(t => t.type !== 'opening_balance').map(t => t.amount).sort((a, b) => a - b);

// The test's own small RFC 4180 reader for ',' files (independent of the code
// under test).
const csvTable = (text) => {
  let s = String(text);
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0] !== '');
};

// What an EU spreadsheet does to an export: ';' between cells, a decimal comma
// in the given number columns, dd/mm/yyyy in the given date columns.
const toEuSheet = (csv, numberCols, dateCols) => {
  const rows = csvTable(csv);
  const header = rows[0];
  const idx = (names) => names.map(n => header.indexOf(n)).filter(i => i !== -1);
  const nums = idx(numberCols);
  const dates = idx(dateCols);
  const cell = (v) => (/[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  return rows.map((cells, r) => cells.map((v, i) => {
    if (r > 0 && nums.includes(i) && v !== '') v = v.replace('.', ',');
    if (r > 0 && dates.includes(i)) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (m) v = m[3] + '/' + m[2] + '/' + m[1];
    }
    return cell(v);
  }).join(';')).join('\r\n');
};

describe('1.0.2 (BUG-31) restore amounts read to the cent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("a ';' migration file (BOM, CRLF, dd/mm/yyyy) keeps its cents", () => {
    const csv = BOM + [
      'Date;Type;Amount;Account;Category;Note',
      '03/01/2026;expense;12,50;Conto BPM;Spesa;Pane',
      '04/01/2026;expense;7,95;Conto BPM;Bar;Caffè',
      '05/01/2026;income;1.850,00;Conto BPM;Stipendio;Gennaio'
    ].join('\r\n');
    const res = importFile(csv);
    expect(res).toMatchObject({ kind: 'transactions', importedCount: 3, skippedCount: 0 });
    expect(amounts()).toEqual([7.95, 12.5, 1850]);
    expect(S().getAccountBalance(acc('Conto BPM').id)).toBeCloseTo(1829.55, 2);
  });

  it('a full backup re-saved by an EU spreadsheet restores to the same ledger', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', type: 'Bank', openingBalance: 120.5, openingDate: '2026-01-01' });
    const bank = acc('Main Bank');
    [[54.3, '2026-02-03'], [39.9, '2026-02-04'], [8.95, '2026-02-05']].forEach(([amount, date]) =>
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount, accountId: bank.id, categoryId: 'cat_groceries', date, time: '10:00:00' }));
    S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 12.4, accountId: bank.id, categoryId: 'cat_salary', date: '2026-02-06', time: '10:00:00' });
    const snapshot = () => S().getState().accounts.map(a => ({
      name: a.name, type: a.type, balance: Math.round(S().getAccountBalance(a.id) * 100) / 100,
      openings: S().getState().transactions.filter(t => t.accountId === a.id && t.type === 'opening_balance').map(t => [t.amount, t.date]),
      rows: S().getState().transactions.filter(t => t.accountId === a.id && t.type !== 'opening_balance').map(t => t.amount).sort((x, y) => x - y)
    }));
    const before = snapshot();
    expect(before[0].balance).toBe(29.75); // 120.50 − 54.30 − 39.90 − 8.95 + 12.40
    const st = S().getState();
    window.StackdExport.exportAccounts(st);
    window.StackdExport.exportTransactions(st);
    const tx = toEuSheet(files['stackd_transactions.csv'], ['Amount'], ['Date', 'StartDate', 'EndDate', 'NextDate']);
    const accounts = toEuSheet(files['stackd_accounts.csv'], ['opening_balance'], ['opening_date']);
    expect(tx).toContain(';54,3;');
    expect(accounts).toContain(';120,5;');

    boot();
    expect(importFile(tx)).toMatchObject({ kind: 'transactions', skippedCount: 0 });
    expect(importFile(accounts)).toMatchObject({ kind: 'accounts', skippedCount: 0 });
    expect(snapshot()).toEqual(before);
  });

  it("an accounts ';' file reads '1.850,00' as 1850", () => {
    const csv = [
      'id;name;opening_balance;created_at;currency;type;icon;color;opening_date',
      'a1;Conto BPM;1.850,00;2026-01-01T09:00:00.000Z;EUR;Bank;landmark;;01/01/2026'
    ].join('\n');
    expect(importFile(csv)).toMatchObject({ kind: 'accounts', importedCount: 1 });
    expect(S().getAccountBalance(acc('Conto BPM').id)).toBe(1850);
  });

  it("formatted cells: '12,50 €' in a ',' file, and the mis-decoded euro sign (N13)", () => {
    const csv = [
      'Date,Type,Amount,Account,Category,Note',
      '2026-01-03,expense,"12,50 €",Cassa,Spesa,Pane',
      `2026-01-04,expense,"7,00 ${REPLACEMENT}",Cassa,Spesa,Latte`
    ].join('\n');
    expect(I()._restoreDecimal(I().parseCSV(csv), ['amount'])).toBe('comma');
    expect(importFile(csv)).toMatchObject({ importedCount: 2, skippedCount: 0 });
    expect(amounts()).toEqual([7, 12.5]);
  });

  it('a cell that is not ONE number in the file convention is skipped and reported', () => {
    const csv = [
      'Date;Type;Amount;Account;Category;Note',
      '03/01/2026;expense;12,50;Cassa;Spesa;ok1',
      '04/01/2026;expense;12abc;Cassa;Spesa;bad1',
      '05/01/2026;expense;1,2,3;Cassa;Spesa;bad2',
      '06/01/2026;expense;54.3;Cassa;Spesa;bad3',
      '07/01/2026;expense;7,95;Cassa;Spesa;ok2'
    ].join('\n');
    const res = importFile(csv);
    expect(res.importedCount).toBe(2);
    expect(res.skipped).toEqual({ 'invalid amount': 3 });
    expect(amounts()).toEqual([7.95, 12.5]);
  });

  it('_restoreDecimal: evidence first, then the delimiter', () => {
    const dec = (csv) => I()._restoreDecimal(I().parseCSV(csv), ['amount']);
    expect(dec('Date;Amount\n2026-01-01;12\n2026-01-02;1.850')).toBe('comma');
    expect(dec('Date,Amount\n2026-01-01,12\n2026-01-02,1850')).toBe('dot');
    expect(dec('Date,Amount\n2026-01-01,"12,50"\n2026-01-02,7')).toBe('comma');
    expect(dec('Date;Amount\n2026-01-01;3,125')).toBe('comma');
    expect(dec('Date;Amount\n2026-01-01;12.5\n2026-01-02;7')).toBe('dot');
  });

  it('_parseRestoreAmount: the whole cell or nothing', () => {
    const p = (raw, d) => I()._parseRestoreAmount(raw, d);
    expect(p('', 'dot')).toBeNull();
    expect(p('  ', 'comma')).toBeNull();
    expect(p('1.850,00', 'comma')).toBe(1850);
    expect(p('-1.234.567,89', 'comma')).toBe(-1234567.89);
    expect(p("1'234.50", 'dot')).toBe(1234.5);
    expect(p('1,234.50', 'dot')).toBe(1234.5);
    expect(p('\u2212' + '5', 'dot')).toBe(-5);
    expect(p('12abc', 'dot')).toBeNaN();
    expect(p('54.3', 'comma')).toBeNaN();
    expect(p('1,2,3', 'comma')).toBeNaN();
  });

  it("review r1: a leading- or trailing-separator amount ('.5', '-.75', '12.') reads as 1.0.1 read it", () => {
    const p = (raw, d) => I()._parseRestoreAmount(raw, d);
    expect(p('.5', 'dot')).toBe(0.5);
    expect(p('-.75', 'dot')).toBe(-0.75);
    expect(p('12.', 'dot')).toBe(12);
    expect(p(',5', 'comma')).toBe(0.5);
    expect(p('12,', 'comma')).toBe(12);
    // Still one number or nothing.
    expect(p('.', 'dot')).toBeNaN();
    expect(p('-', 'dot')).toBeNaN();
    expect(p(',5', 'dot')).toBeNaN();
    expect(p('.5', 'comma')).toBeNaN();
    const res = importFile('Date,Type,Amount,Account,Category,Note\n2026-01-03,expense,.5,Cassa,Spesa,a\n2026-01-04,expense,12.,Cassa,Spesa,b');
    expect(res.importedCount).toBe(2);
    expect(res.skippedCount).toBe(0);
    expect(amounts()).toEqual([0.5, 12]);
  });

  it("guard: the app's own ',' export reads back exactly", () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const w = acc('Wallet');
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12.345, accountId: w.id, categoryId: 'cat_groceries', date: '2026-02-03' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 0.1 + 0.2, accountId: w.id, categoryId: 'cat_groceries', date: '2026-02-04' });
    window.StackdExport.exportTransactions(S().getState());
    S().state.transactions = S().state.transactions.filter(t => t.type === 'opening_balance');
    const { transactions, stats } = I().buildTransactions(I().parseCSV(files['stackd_transactions.csv']));
    expect(stats.skippedCount).toBe(0);
    expect(transactions.map(t => t.amount).sort((a, b) => a - b)).toEqual([0.30000000000000004, 12.345]);
  });
});
