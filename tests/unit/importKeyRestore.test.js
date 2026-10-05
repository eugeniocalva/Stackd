import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-32): statement keys embed the account they were imported into
// ('ref:<accountId>|…'). A restore re-created every account under a new id but
// kept the old keys, so the same statement imported again matched nothing and
// every row was added twice. Restores now keep ids, map a key's account
// through the import, and a boot heal re-points keys whose account is gone.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const makeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i],
    get length() { return m.size; },
    _map: m
  };
};

let files;
let bootNo = 0;
let saveSpy;
const boot = (seed) => {
  let uid = 0;
  const prefix = 'k' + (++bootNo) + '-uuid-';
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: makeStorage(seed)
  };
  global.localStorage = global.window.localStorage;
  global.window.DOMParser = global.DOMParser;
  global.FileReader = class {
    readAsText(file) { this.onload({ target: { result: file.text } }); }
  };
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  const realSave = global.window.StackdDB.save.bind(global.window.StackdDB);
  saveSpy = vi.fn(realSave);
  global.window.StackdDB.save = saveSpy;
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  global.window.Store.init();
  if (!seed) global.window.Store.dispatch('SET_CURRENCY', 'EUR');
};

const S = () => window.Store;
const I = () => window.StackdImport;
const importFile = (csv) => {
  let out;
  I().importCSV({ text: csv }, S().getState(), (r) => { out = r; }, (e) => { throw e; });
  return out;
};
const accId = (name) => S().getState().accounts.find(a => a.name === name).id;
const exportFiles = () => {
  const st = S().getState();
  window.StackdExport.exportAccounts(st);
  window.StackdExport.exportTransactions(st);
  return { accounts: files['stackd_accounts.csv'], transactions: files['stackd_transactions.csv'] };
};
// The test's own small RFC 4180 reader (independent of the code under test).
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
// A file written before 1.0.2: the named columns removed.
const stripCols = (csv, names) => {
  const rows = csvTable(csv);
  const drop = names.map(n => rows[0].indexOf(n));
  expect(drop.every(i => i !== -1)).toBe(true);
  return rows.map(r => window.StackdExport._toRow(r.filter((v, i) => !drop.includes(i)))).join('\n');
};

// A camt-shaped statement: two entries with a bank reference, one without.
const STATEMENT = {
  format: 'camt', currency: 'EUR', openingBalance: null, closingBalance: null,
  entries: [
    { date: '2026-01-03', description: 'SUPERMERCATO ROSSI — Spesa', type: 'expense', amount: 45.9, bankRef: 'REF-001' },
    { date: '2026-01-04', description: 'BAR CENTRALE', type: 'expense', amount: 3.2, bankRef: 'REF-002' },
    { date: '2026-01-05', description: 'BONIFICO STIPENDIO', type: 'income', amount: 1850, bankRef: '' }
  ]
};
const importStatement = (accountId) => {
  const { items } = I().buildStatementTransactions(STATEMENT, accountId);
  S().dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: items.filter(it => !it.duplicate).map(it => it.tx) });
};
const buildLedger = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 1000, openingDate: '2026-01-01' });
  importStatement(accId('Main Bank'));
  expect(S().getState().transactions.filter(t => t.importKey)).toHaveLength(3);
};
const reimportStats = () => I().buildStatementTransactions(STATEMENT, accId('Main Bank')).stats;

describe('1.0.2 (BUG-32) a restored backup keeps its bank-import dedup', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('the same statement after a restore (export order) is all duplicates', () => {
    buildLedger();
    const out = exportFiles();
    boot();
    importFile(out.accounts);
    importFile(out.transactions);
    expect(reimportStats()).toMatchObject({ duplicates: 3, ok: 0 });
  });

  it('…with the transactions file restored first', () => {
    buildLedger();
    const out = exportFiles();
    boot();
    importFile(out.transactions);
    importFile(out.accounts);
    expect(reimportStats()).toMatchObject({ duplicates: 3, ok: 0 });
  });

  it('…from a pre-1.0.2 transactions file imported before the accounts file', () => {
    buildLedger();
    const out = exportFiles();
    boot();
    importFile(stripCols(out.transactions, ['AccountId', 'Id']));
    importFile(out.accounts);
    expect(S().getState().accounts).toHaveLength(1);
    expect(reimportStats()).toMatchObject({ duplicates: 3, ok: 0 });
  });

  it('a bank-CSV (fingerprint-keyed) import survives a restore too', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 0, openingDate: '2020-01-01' });
    const rows = [['03/01/2026', 'SUPERMERCATO ROSSI', '-45,90'], ['05/01/2026', 'STIPENDIO', '1.850,00']];
    const mapping = { date: 0, description: 1, amountMode: 'single', amount: 2, debit: -1, credit: -1, bankRef: -1, dateFormat: 'dmy', decimal: 'auto' };
    const first = I().buildBankTransactions(rows, mapping, accId('Main Bank'));
    S().dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: first.items.map(it => it.tx) });
    const out = exportFiles();
    boot();
    importFile(out.transactions);
    importFile(out.accounts);
    expect(I().buildBankTransactions(rows, mapping, accId('Main Bank')).stats).toMatchObject({ duplicates: 2, ok: 0 });
  });

  it('N9: a bank row moved to another account keeps its key, and stays a duplicate of its statement', () => {
    buildLedger();
    S().dispatch('ADD_ACCOUNT', { name: 'Card', openingBalance: 0, openingDate: '2026-01-01' });
    const a = accId('Main Bank');
    const b = accId('Card');
    const moved = S().getState().transactions.find(t => t.bankRef === 'REF-002');
    S().dispatch('UPDATE_TRANSACTION', { ...moved, accountId: b });
    expect(S().getState().transactions.find(t => t.bankRef === 'REF-002').accountId).toBe(b);
    const out = exportFiles();

    boot();
    importFile(out.accounts);
    importFile(out.transactions);
    const row = S().getState().transactions.find(t => t.bankRef === 'REF-002');
    expect(row.accountId).toBe(b);
    expect(row.importKey).toBe('ref:' + a + '|REF-002');
    const stats = reimportStats();
    expect(stats).toMatchObject({ duplicates: 3, ok: 0 });
  });

  it('rebaseImportKey swaps the account of ref:/fp: keys and leaves anything else alone', () => {
    expect(S().rebaseImportKey('ref:OLD|BK1#2', 'NEW')).toBe('ref:NEW|BK1#2');
    expect(S().rebaseImportKey('fp:OLD|2026-01-03|expense|4590|bar', 'NEW')).toBe('fp:NEW|2026-01-03|expense|4590|bar');
    expect(S().rebaseImportKey('bc:OLD|x', 'NEW')).toBe('bc:OLD|x');
    expect(S().rebaseImportKey('plain', 'NEW')).toBe('plain');
  });
});

describe('1.0.2 (BUG-32) boot heal: keys naming an account that no longer exists', () => {
  afterEach(() => { vi.useRealTimers(); });
  const P = 'stackd_v1_';
  const ACC = (id, name) => ({ id, name, color: '#0075EB', icon: 'wallet', type: 'Account', currency: 'EUR', createdAt: '2026-01-01T10:00:00.000Z' });
  const ROW = (id, accountId, importKey) => ({ id, type: 'expense', amount: 5, accountId, categoryId: '', date: '2026-01-03',
    time: '10:00:00', comment: 'Bar', importKey, createdAt: '2026-01-03T10:00:00.000Z' });
  const seed = (accounts, transactions) => ({
    [P + 'accounts']: JSON.stringify(accounts),
    [P + 'transactions']: JSON.stringify(transactions),
    [P + 'currency']: JSON.stringify('EUR'),
    [P + 'homeWidgets']: '[]'
  });
  const txSaves = () => saveSpy.mock.calls.filter(c => c[0] === 'transactions').length;

  it('re-points a key whose account is gone to its row\'s account, and saves', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot(seed([ACC('A', 'Main')], [ROW('t1', 'A', 'ref:GONE|BK1#2')]));
    const t = S().getState().transactions.find(x => x.id === 't1');
    expect(t.importKey).toBe('ref:A|BK1#2');
    expect(S().hasImportKey('ref:A|BK1#2')).toBe(true);
    expect(txSaves()).toBeGreaterThan(0);
    expect(window.localStorage.getItem(P + 'transactions')).toContain('ref:A|BK1#2');
  });

  it('guard: a key naming another LIVE account (a moved row) is left alone, and nothing is saved', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot(seed([ACC('A', 'Main'), ACC('B', 'Card')], [ROW('t1', 'B', 'ref:A|BK1'), ROW('t2', 'A', 'fp:A|2026-01-03|expense|500|bar')]));
    expect(S().getState().transactions.find(x => x.id === 't1').importKey).toBe('ref:A|BK1');
    expect(txSaves()).toBe(0);
  });
});
