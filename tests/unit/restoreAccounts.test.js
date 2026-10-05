import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-30): inside the app an account is its id; the backup knew it only
// by name, so two 'Visa' accounts (a credit card at −300 and a debit card at
// 1000) came back as ONE Visa: rows found the first by name, the second
// opening balance overwrote the first, and the accounts file upserted both
// rows onto one account. Every case boots a second, empty install
// (per-boot id prefixes: restores now keep ids).
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'a' + (++bootNo) + '-uuid-';
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
const REPLACEMENT = String.fromCharCode(0xFFFD);
const importFile = (csv) => {
  let out;
  I().importCSV({ text: csv }, S().getState(), (r) => { out = r; }, (e) => { throw e; });
  return out;
};
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
const legacyTx = (csv) => stripCols(csv, ['AccountId', 'Id']);
const named = (name) => S().getState().accounts.filter(a => a.name === name);
const bal = (a) => S().getAccountBalance(a.id);
const total = () => Math.round(S().getState().accounts.reduce((s, a) => s + bal(a), 0) * 100) / 100;

// Two cards that share a name: Credit card −300, Debit card 1000; 45 and 120 spent.
const buildVisas = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Visa', type: 'Credit card', openingBalance: -300, openingDate: '2026-01-01' });
  const credit = S().getState().accounts[S().getState().accounts.length - 1];
  S().dispatch('ADD_ACCOUNT', { name: 'Visa', type: 'Debit card', openingBalance: 1000, openingDate: '2026-01-01' });
  const debit = S().getState().accounts.find(a => a.name === 'Visa' && a.id !== credit.id);
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 45, accountId: credit.id, categoryId: 'cat_groceries',
    date: '2026-02-03', time: '10:00:00', comment: 'Groceries run' });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 120, accountId: debit.id, categoryId: 'cat_transport',
    date: '2026-02-05', time: '11:00:00', comment: 'Fuel' });
  expect(bal(credit)).toBe(-345);
  expect(bal(debit)).toBe(880);
  return { credit, debit };
};
const expectTwoVisas = () => {
  const visas = named('Visa');
  expect(visas).toHaveLength(2);
  const byType = Object.fromEntries(visas.map(a => [a.type, bal(a)]));
  expect(byType).toEqual({ 'Credit card': -345, 'Debit card': 880 });
  expect(total()).toBe(535);
};

describe('1.0.2 (BUG-30) same-named accounts survive a restore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('accounts then transactions → two Visas at −345 / 880, with their own ids', () => {
    const { credit, debit } = buildVisas();
    const out = exportFiles();
    boot();
    expect(importFile(out.accounts)).toMatchObject({ kind: 'accounts', importedCount: 2 });
    expect(importFile(out.transactions)).toMatchObject({ kind: 'transactions', importedCount: 2, skippedCount: 2 });
    expectTwoVisas();
    // Restored accounts keep their backup ids, and so do the rows.
    expect(S().getState().accounts.map(a => a.id).sort()).toEqual([credit.id, debit.id].sort());
    expect(S().getState().transactions.find(t => t.amount === 45).accountId).toBe(credit.id);
    expect(S().getState().transactions.find(t => t.amount === 120).accountId).toBe(debit.id);
  });

  it('transactions then accounts → the same two Visas', () => {
    buildVisas();
    const out = exportFiles();
    boot();
    importFile(out.transactions);
    importFile(out.accounts);
    expectTwoVisas();
  });

  it('the transactions file alone restores two accounts, each with its own opening balance', () => {
    const { credit, debit } = buildVisas();
    const out = exportFiles();
    boot();
    expect(importFile(out.transactions)).toMatchObject({ importedCount: 2, newAccounts: 2 });
    const visas = named('Visa');
    expect(visas).toHaveLength(2);
    const ob = (id) => S().getState().transactions.filter(t => t.accountId === id && t.type === 'opening_balance').map(t => t.amount);
    expect(ob(credit.id)).toEqual([-300]);
    expect(ob(debit.id)).toEqual([1000]);
    expect(bal(visas.find(a => a.id === credit.id))).toBe(-345);
    expect(bal(visas.find(a => a.id === debit.id))).toBe(880);
  });

  it('importing the accounts file again into the same install leaves both Visas intact', () => {
    const { credit, debit } = buildVisas();
    const out = exportFiles();
    expect(importFile(out.accounts)).toMatchObject({ importedCount: 2, updated: 2, created: 0 });
    expect(S().getState().accounts).toHaveLength(2);
    expect(new Set(S().getState().accounts.map(a => a.id)).size).toBe(2); // one account per id
    expect(S().getState().accounts.find(a => a.id === credit.id).type).toBe('Credit card');
    expect(S().getState().accounts.find(a => a.id === debit.id).type).toBe('Debit card');
    expect(bal(credit)).toBe(-345);
    expect(bal(debit)).toBe(880);
  });

  it('pre-1.0.2 transactions file, accounts first → two accounts, total 535, the guess reported', () => {
    buildVisas();
    const out = exportFiles();
    boot();
    importFile(out.accounts);
    const res = importFile(legacyTx(out.transactions));
    expect(res.importedCount).toBe(2);
    expect(res.ambiguousRows).toBe(2);
    expect(res.ambiguousAccounts).toEqual(['Visa']);
    expect(named('Visa')).toHaveLength(2);
    expect(total()).toBe(535);

    // N12: the same file again imports nothing and reports no ambiguity.
    const again = importFile(legacyTx(out.transactions));
    expect(again.importedCount).toBe(0);
    expect(again.duplicateCount).toBe(2);
    expect(again.ambiguousRows).toBe(0);
    expect(total()).toBe(535);
  });

  it('pre-1.0.2 transactions file first, then accounts → two accounts, total 535', () => {
    buildVisas();
    const out = exportFiles();
    boot();
    const res = importFile(legacyTx(out.transactions));
    expect(res.newAccounts).toBe(2); // the second opening balance no longer overwrites the first
    expect(named('Visa')).toHaveLength(2);
    expect(total()).toBe(535);
    importFile(out.accounts);
    expect(named('Visa')).toHaveLength(2);
    expect(S().getState().accounts.map(a => a.type).sort()).toEqual(['Credit card', 'Debit card']);
    expect(total()).toBe(535);
  });

  it('N5: a 1.0.1-merged Visa is not given a second account by the old transactions file', () => {
    buildVisas();
    const out = exportFiles();
    boot();
    // What a 1.0.1 restore left: ONE Visa (the debit card's looks and opening)
    // holding both expenses — €835.
    S().dispatch('ADD_ACCOUNT', { name: 'Visa', type: 'Debit card', openingBalance: 1000, openingDate: '2026-01-01' });
    const merged = named('Visa')[0];
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 45, accountId: merged.id, categoryId: 'cat_groceries',
      date: '2026-02-03', time: '10:00:00', comment: 'Groceries run' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 120, accountId: merged.id, categoryId: 'cat_transport',
      date: '2026-02-05', time: '11:00:00', comment: 'Fuel' });
    expect(total()).toBe(835);

    const res = importFile(legacyTx(out.transactions));
    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(2);
    expect(res.skipped).toEqual({ 'opening balance rows are owned by the account': 2 });
    expect(named('Visa')).toHaveLength(1);
    expect(total()).toBe(835);

    importFile(out.accounts);
    expect(named('Visa')).toHaveLength(2);
    expect(total()).toBe(535);
  });

  it("'Cash'/' cash ' and 'Revolut'/'revolut' (with a transfer between them) stay four accounts", () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 50, openingDate: '2026-01-01' });
    S().dispatch('ADD_ACCOUNT', { name: ' cash ', openingBalance: 20, openingDate: '2026-01-01' });
    S().dispatch('ADD_ACCOUNT', { name: 'Revolut', openingBalance: 300, openingDate: '2026-01-01' });
    S().dispatch('ADD_ACCOUNT', { name: 'revolut', openingBalance: 1200, openingDate: '2026-01-01' });
    const id = (n) => S().getState().accounts.find(a => a.name === n).id;
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 5, accountId: id(' cash '), categoryId: 'cat_groceries', date: '2026-02-01' });
    S().dispatch('ADD_TRANSFER', { amount: 200, expenseAccountId: id('Revolut'), incomeAccountId: id('revolut'), date: '2026-02-02', note: 'Top up' });
    const before = Object.fromEntries(S().getState().accounts.map(a => [a.id, bal(a)]));
    const out = exportFiles();

    for (const order of [['accounts', 'transactions'], ['transactions', 'accounts']]) {
      boot();
      order.forEach(k => importFile(out[k]));
      expect(S().getState().accounts).toHaveLength(4);
      expect(Object.fromEntries(S().getState().accounts.map(a => [a.id, bal(a)]))).toEqual(before);
      const legs = S().getState().transactions.filter(t => t.transferRef);
      expect(legs.map(t => [t.type, t.accountId]).sort()).toEqual([['expense', id('Revolut')], ['income', id('revolut')]].sort());
    }
  });

  it('E8a: the same ledger as a pre-1.0.2 file splits by exact spelling, in either order', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Revolut', openingBalance: 300, openingDate: '2026-01-01' });
    S().dispatch('ADD_ACCOUNT', { name: 'revolut', openingBalance: 1200, openingDate: '2026-01-01' });
    const id = (n) => S().getState().accounts.find(a => a.name === n).id;
    S().dispatch('ADD_TRANSFER', { amount: 200, expenseAccountId: id('Revolut'), incomeAccountId: id('revolut'), date: '2026-02-02', note: 'Top up' });
    const out = exportFiles();
    const tx = legacyTx(out.transactions);

    for (const order of [['transactions', 'accounts'], ['accounts', 'transactions']]) {
      boot();
      let res;
      order.forEach(k => { const r = importFile(k === 'transactions' ? tx : out.accounts); if (k === 'transactions') res = r; });
      expect(S().getState().accounts).toHaveLength(2);
      expect(bal(named('Revolut')[0])).toBe(100);
      expect(bal(named('revolut')[0])).toBe(1400);
      expect(res.ambiguousRows).toBe(0);
    }
  });

  it('N7: a backup USD Revolut never merges into the phone\'s own EUR Revolut', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Revolut', currency: 'USD', openingBalance: 500, openingDate: '2026-01-01' });
    const usd = S().getState().accounts[0];
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 30, accountId: usd.id, categoryId: 'cat_groceries', date: '2026-02-01' });
    const out = exportFiles();

    boot(); // the new phone already has its own EUR 'Revolut' with one expense
    S().dispatch('ADD_ACCOUNT', { name: 'Revolut', openingBalance: 100, openingDate: '2026-01-01' });
    const eur = S().getState().accounts[0];
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 10, accountId: eur.id, categoryId: 'cat_groceries', date: '2026-02-01' });
    importFile(out.accounts);
    importFile(out.transactions);

    expect(named('Revolut')).toHaveLength(2);
    const local = S().getState().accounts.find(a => a.id === eur.id);
    expect(local.currency).toBe('EUR');
    expect(bal(local)).toBe(90);
    expect(S().getState().transactions.filter(t => t.accountId === eur.id && t.type !== 'opening_balance').map(t => t.amount)).toEqual([10]);
    const restored = S().getState().accounts.find(a => a.id !== eur.id);
    expect(restored.currency).toBe('USD');
    expect(bal(restored)).toBe(470);
  });

  describe('N6 (D5): the name on an id match', () => {
    it('keeps a local rename when another account here uses the file\'s name; type and opening follow the file', () => {
      const { credit } = buildVisas();
      const out = exportFiles();
      S().dispatch('UPDATE_ACCOUNT', { id: credit.id, name: 'Visa Credit', type: 'Card' });
      importFile(out.accounts);
      const acc = S().getState().accounts.find(a => a.id === credit.id);
      expect(acc.name).toBe('Visa Credit');
      expect(acc.type).toBe('Credit card');
      expect(bal(acc)).toBe(-345);
      expect(S().getState().accounts.map(a => a.name).sort()).toEqual(['Visa', 'Visa Credit']);
    });

    it('never writes a mis-decoded name over a good local one', () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Café', openingBalance: 10, openingDate: '2026-01-01' });
      const out = exportFiles();
      importFile(out.accounts.replace('Café', 'Caf' + REPLACEMENT));
      expect(S().getState().accounts.map(a => a.name)).toEqual(['Café']);
    });

    it('applies a plain rename back when no other account uses the name', () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 10, openingDate: '2026-01-01' });
      const out = exportFiles();
      const id = S().getState().accounts[0].id;
      S().dispatch('UPDATE_ACCOUNT', { id, name: 'Rainy day' });
      importFile(out.accounts);
      expect(S().getState().accounts.map(a => [a.id, a.name])).toEqual([[id, 'Savings']]);
    });
  });

  it('N1: an accounts-shaped file from elsewhere upserts by name and its ids are ignored', () => {
    const csv = 'ID,Name,Opening Balance\n1,Conto,100\n2,Carta,-50';
    importFile(csv);
    importFile(csv);
    const accs = S().getState().accounts;
    expect(accs.map(a => a.name).sort()).toEqual(['Carta', 'Conto']);
    expect(accs.some(a => a.id === '1' || a.id === '2')).toBe(false);
    expect(total()).toBe(50);
  });

  it('guard: a phone with its own uniquely named EUR Cash merges the backup\'s Cash into it', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Cash', type: 'Wallet', openingBalance: 40, openingDate: '2026-01-01' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 5, accountId: S().getState().accounts[0].id, categoryId: 'cat_groceries', date: '2026-02-01' });
    const out = exportFiles();
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0 });
    const local = S().getState().accounts[0];
    importFile(out.accounts);
    importFile(out.transactions);
    expect(S().getState().accounts).toHaveLength(1);
    expect(S().getState().accounts[0].id).toBe(local.id);
    expect(S().getState().accounts[0].type).toBe('Wallet');
    expect(bal(S().getState().accounts[0])).toBe(35);
  });

  it('an id the store would not keep goes through Store.fileId, so the row still meets its account', () => {
    const accounts = [
      'id,name,opening_balance,created_at,currency,type,icon,color,opening_date',
      'acc 1,Conto,100,2026-01-01T09:00:00.000Z,EUR,Bank,landmark,,2026-01-01'
    ].join('\n');
    const tx = [
      'Date,Time,Type,Amount,Account,Category,Note,Tags,IsPaid,TransferRef,SeriesId,Interval,Frequency,StartDate,EndDate,NextDate,PropagateTags,ImportKey,BankRef,AccountCurrency,AccountId,Id',
      '2026-02-01,10:00:00,expense,5,Conto,Groceries,Bread,,true,,,,,,,,,,,EUR,acc 1,tx 1'
    ].join('\n');
    importFile(accounts);
    importFile(tx);
    const accs = S().getState().accounts;
    expect(accs).toHaveLength(1);
    expect(accs[0].id).toBe(S().fileId('acc 1'));
    expect(accs[0].id).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
    const row = S().getState().transactions.find(t => t.amount === 5);
    expect(row.accountId).toBe(accs[0].id);
    expect(row.id).toBe(S().fileId('tx 1'));
    expect(bal(accs[0])).toBe(95);
  });

  it('StackdExport.TX_HEADERS ends with AccountId and Id, and the cells are the ids', () => {
    expect(window.StackdExport.TX_HEADERS.slice(-2)).toEqual(['AccountId', 'Id']);
    const { debit } = buildVisas();
    const rows = I().parseCSV(exportFiles().transactions);
    const fuel = rows.find(r => r.note === 'Fuel');
    const t = S().getState().transactions.find(x => x.comment === 'Fuel');
    expect(fuel.accountid).toBe(debit.id);
    expect(fuel.id).toBe(t.id);
  });
});

// 1.0.2 (BUG-25, part E — U2's design, applied in U6's buildAccounts): an
// account exported without an opening balance has opening_balance 0 and an
// EMPTY opening_date. Dating a €0 opening balance at created_at put it after
// the account's own history and hid every earlier row.
describe('1.0.2 (BUG-25 part E) an account exported without an opening balance', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  for (const order of [['transactions', 'accounts'], ['accounts', 'transactions']]) {
    it(`restores without one (${order.join(' then ')})`, () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Bank Sync', openingBalance: 0 });
      const a = S().getState().accounts[0];
      a.createdAt = '2026-09-20T10:00:00.000Z';
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 20, accountId: a.id, categoryId: 'cat_groceries', date: '2026-09-12' });
      S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 100, accountId: a.id, categoryId: 'cat_salary', date: '2026-09-15' });
      expect(S().getState().transactions.some(t => t.type === 'opening_balance')).toBe(false);
      expect(bal(a)).toBe(80);
      const out = exportFiles();

      boot();
      order.forEach(k => importFile(out[k]));
      const restored = named('Bank Sync');
      expect(restored).toHaveLength(1);
      expect(S().getState().transactions.filter(t => t.type === 'opening_balance')).toEqual([]);
      expect(bal(restored[0])).toBe(80);
    });
  }

  it('a file from before v1.19 (no opening_date column) still falls back to created_at, as a local day', () => {
    importFile([
      'id,name,opening_balance,created_at,currency',
      'x1,Old Savings,2500,2025-11-20T09:12:00.000Z,GBP'
    ].join('\n'));
    const ob = S().getState().transactions.find(t => t.type === 'opening_balance');
    expect(ob.amount).toBe(2500);
    expect(ob.date).toBe(S()._localYMD('2025-11-20T09:12:00.000Z'));
  });
});
