import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-78): importing the same backup twice silently duplicated every
// transaction, series and loan — the restore never compared incoming rows with
// the store, and the export carried no row id to compare by. Now each row is
// checked, in order: its id → a series held here → its (rebased) bank key → a
// content fingerprint; and a series or transfer already here is owned here.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'd' + (++bootNo) + '-uuid-';
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.window.DOMParser = global.DOMParser;
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
const id = (name) => S().getState().accounts.find(a => a.name === name).id;
const txs = () => S().getState().transactions;
const nonOpening = () => txs().filter(t => t.type !== 'opening_balance');
const exportFiles = () => {
  const st = S().getState();
  const E = window.StackdExport;
  E.exportAccounts(st); E.exportTransactions(st); E.exportLoans(st);
  return { accounts: files['stackd_accounts.csv'], transactions: files['stackd_transactions.csv'], loans: files['stackd_loans.csv'] };
};
// The file as a list of cell arrays (header first), and back — the test's own
// small RFC 4180 reader, independent of the code under test.
const table = (text) => {
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
const untable = (rows) => rows.map(r => window.StackdExport._toRow(r)).join('\n');
const stripCols = (csv, names) => {
  const rows = table(csv);
  const drop = names.map(n => rows[0].indexOf(n));
  expect(drop.every(i => i !== -1)).toBe(true);
  return untable(rows.map(r => r.filter((v, i) => !drop.includes(i))));
};
const legacy = (csv) => stripCols(csv, ['AccountId', 'Id']);
const seriesIds = () => [...new Set(txs().filter(t => t.recurrence && t.recurrence.seriesId).map(t => t.recurrence.seriesId))];
const armed = (sid) => txs().filter(t => t.recurrence && t.recurrence.seriesId === sid && t.recurrence.nextDate);
const snapshot = () => ({
  count: txs().length,
  balances: Object.fromEntries(S().getState().accounts.map(a => [a.name, S().getAccountBalance(a.id)])),
  series: seriesIds().map(sid => [sid, txs().filter(t => t.recurrence && t.recurrence.seriesId === sid).length, armed(sid).length])
});

// A ledger with one-off rows, a monthly series (past and future members) and
// a transfer.
const buildLedger = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 1000, openingDate: '2026-01-01' });
  S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 200, openingDate: '2026-01-01' });
  const bank = id('Main Bank');
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 3.5, accountId: bank, categoryId: 'cat_groceries', date: '2026-03-01', time: '08:00:00', comment: 'Coffee' });
  S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 1850, accountId: bank, categoryId: 'cat_salary', date: '2026-03-27', time: '09:00:00', comment: 'Salary' });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 700, accountId: bank, categoryId: 'cat_groceries', date: '2026-04-07', time: '07:00:00', comment: 'Rent',
    recurrence: { interval: 1, frequency: 'months', endDate: '2026-12-07' } });
  S().dispatch('ADD_TRANSFER', { amount: 200, expenseAccountId: bank, incomeAccountId: id('Savings'), date: '2026-05-02', note: 'Save' });
  expect(seriesIds()).toHaveLength(1);
  return { sid: seriesIds()[0] };
};

describe('1.0.2 (BUG-78) the same backup imported twice adds nothing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('restore onto a new phone, then the transactions file again', () => {
    buildLedger();
    const out = exportFiles();
    boot();
    importFile(out.accounts);
    importFile(out.transactions);
    const before = snapshot();
    const res = importFile(out.transactions);
    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(nonOpening().length);
    expect(snapshot()).toEqual(before);
    expect(before.series.every(([, , a]) => a === 1)).toBe(true);
  });

  it('a re-import into the same install (no reset)', () => {
    buildLedger();
    const before = snapshot();
    const out = exportFiles();
    const res = importFile(out.transactions);
    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(nonOpening().length);
    expect(snapshot()).toEqual(before);
  });

  it('restored transactions keep their backup ids', () => {
    buildLedger();
    const ids = nonOpening().map(t => t.id).sort();
    const out = exportFiles();
    boot();
    importFile(out.accounts);
    importFile(out.transactions);
    expect(nonOpening().map(t => t.id).sort()).toEqual(ids);
  });

  it('a pre-1.0.2 file (no Id/AccountId) imported twice: the second import is all duplicates', () => {
    buildLedger();
    const out = exportFiles();
    boot();
    importFile(legacy(out.transactions));
    const before = snapshot();
    const res = importFile(legacy(out.transactions));
    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(nonOpening().length);
    expect(snapshot()).toEqual(before);
  });

  // Integrated review (BUG-25 x BUG-78): a 1.0.1 backup holds a converted
  // opening balance as an 'Adjustment' income row. The 1.0.2 boot heal turns
  // the row here back into an opening balance, and the file must still match it.
  it('a pre-1.0.2 file holding a converted opening balance, after the heal, adds nothing', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: id('Main'), categoryId: 'cat_groceries', date: '2026-02-01', comment: 'Shop' });
    const ob = txs().find(t => t.type === 'opening_balance');
    ob.type = 'income'; // as 1.0.1 saved it from History (BUG-25)
    const file = legacy(exportFiles().transactions);
    expect(file).not.toContain('opening_balance'); // precondition: the file holds the Adjustment form
    S()._healConvertedOpeningBalances(); // the 1.0.2 boot heal
    expect(txs().find(t => t.id === ob.id).type).toBe('opening_balance');
    expect(S().getAccountBalance(id('Main'))).toBe(960);

    const res = importFile(file);

    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(2);
    expect(S().getAccountBalance(id('Main'))).toBe(960);
  });

  it('N2: an install restored with fresh ids still recognises every row of the 1.0.2 file', () => {
    buildLedger();
    const out = exportFiles();
    boot();
    importFile(legacy(out.transactions)); // a 1.0.1-style restore: every id is new
    const before = snapshot();
    const res = importFile(out.transactions);
    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(nonOpening().length);
    expect(snapshot()).toEqual(before);
  });

  it('N2: in a 1.0.2 file, an id-less copy of a row here is a duplicate; an id-less new row is imported', () => {
    buildLedger();
    const rows = table(exportFiles().transactions);
    const h = rows[0];
    const coffee = rows.find(r => r[h.indexOf('Note')] === 'Coffee');
    const copy = coffee.slice();
    copy[h.indexOf('Id')] = '';
    const fresh = coffee.slice();
    fresh[h.indexOf('Id')] = '';
    fresh[h.indexOf('Amount')] = '4.2';
    const res = importFile(untable([h, copy, fresh]));
    expect(res.importedCount).toBe(1);
    expect(res.duplicateCount).toBe(1);
    expect(nonOpening().filter(t => t.comment === 'Coffee').map(t => t.amount).sort()).toEqual([3.5, 4.2]);
  });

  it('N2/E7: a bank row deleted and re-imported from its statement is not brought back by the older backup', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 0, openingDate: '2026-01-01' });
    const statement = { entries: [
      { date: '2026-01-03', description: 'BAR', type: 'expense', amount: 3.2, bankRef: 'REF-1' },
      { date: '2026-01-04', description: 'SHOP', type: 'expense', amount: 9.9, bankRef: 'REF-2' }
    ] };
    const bankImport = () => {
      const { items } = I().buildStatementTransactions(statement, id('Main Bank'));
      S().dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: items.filter(it => !it.duplicate).map(it => it.tx) });
    };
    bankImport();
    const out = exportFiles(); // the older backup
    const gone = txs().find(t => t.bankRef === 'REF-1');
    S().dispatch('DELETE_TRANSACTION', { id: gone.id });
    bankImport(); // the same row again, under a new id and the same key
    expect(txs().find(t => t.bankRef === 'REF-1').id).not.toBe(gone.id);

    const res = importFile(out.transactions);
    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(2);
    expect(txs().filter(t => t.bankRef === 'REF-1')).toHaveLength(1);
  });

  it('N3: a trailing space and a flattened multi-line note still match a pre-1.0.2 file', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, openingDate: '2026-01-01' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 2, accountId: id('Cash'), categoryId: 'cat_groceries', date: '2026-03-01', time: '08:00:00', comment: 'Coffee ' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 54.3, accountId: id('Cash'), categoryId: 'cat_groceries', date: '2026-03-02', time: '10:00:00', comment: 'Supermercato Rossi — Spesa' });
    const csv = [
      'Date,Time,Type,Amount,Account,Category,Note',
      '2026-03-01,08:00:00,expense,2,Cash,Groceries,Coffee',
      '2026-03-02,10:00:00,expense,54.3,Cash,Groceries,"Supermercato',
      'Rossi — Spesa"'
    ].join('\n');
    const res = importFile(csv);
    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(2);
    expect(nonOpening()).toHaveLength(2);
  });

  it('N3: a time-less migration file imported twice (the first import stamped times)', () => {
    const csv = [
      'Date,Type,Amount,Account,Category,Note',
      '2026-03-01,expense,12.5,Conto,Spesa,Pane',
      '2026-03-02,expense,7.95,Conto,Bar,Caffè',
      '2026-03-03,income,1850,Conto,Stipendio,Marzo'
    ].join('\n');
    expect(importFile(csv).importedCount).toBe(3);
    expect(nonOpening().every(t => /^\d{2}:\d{2}:\d{2}$/.test(t.time))).toBe(true);
    const res = importFile(csv);
    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(3);
    expect(nonOpening()).toHaveLength(3);
  });

  it('the fingerprint is a multiset: one coffee here absorbs one of two identical rows', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, openingDate: '2026-01-01' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 3.5, accountId: id('Cash'), categoryId: 'cat_groceries', date: '2026-03-01', time: '08:00:00', comment: 'Coffee' });
    const csv = [
      'Date,Time,Type,Amount,Account,Category,Note',
      '2026-03-01,08:00:00,expense,3.50,Cash,Groceries,Coffee',
      '2026-03-01,08:00:00,expense,3.50,Cash,Groceries,Coffee'
    ].join('\n');
    const res = importFile(csv);
    expect(res.importedCount).toBe(1);
    expect(res.duplicateCount).toBe(1);
    expect(nonOpening()).toHaveLength(2);
  });

  it('E3: an install with two same-named accounts restores an id-less re-export of itself → nothing added', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Visa', type: 'Credit card', openingBalance: -300, openingDate: '2026-01-01' });
    S().dispatch('ADD_ACCOUNT', { name: 'Visa', type: 'Debit card', openingBalance: 1000, openingDate: '2026-01-01' });
    const [v1, v2] = S().getState().accounts;
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 45, accountId: v1.id, categoryId: 'cat_groceries', date: '2026-02-03', time: '10:00:00', comment: 'A' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 120, accountId: v2.id, categoryId: 'cat_groceries', date: '2026-02-05', time: '11:00:00', comment: 'B' });
    const before = snapshot();
    const res = importFile(legacy(exportFiles().transactions));
    expect(res.importedCount).toBe(0);
    expect(res.duplicateCount).toBe(2);
    expect(snapshot()).toEqual(before);
  });

  it('N1: two foreign files numbered from 1 both import in full; no row or account takes id 1', () => {
    importFile('ID,Date,Type,Amount,Account,Category,Note\n1,2026-03-01,expense,10,Cassa,Spesa,Pane\n2,2026-03-02,expense,20,Cassa,Spesa,Latte');
    const res = importFile('ID,Date,Type,Amount,Account,Category,Note\n1,2026-04-01,expense,30,Banca,Spesa,Benzina\n2,2026-04-02,expense,40,Banca,Spesa,Cena');
    expect(res.importedCount).toBe(2);
    expect(res.duplicateCount).toBe(0);
    expect(nonOpening()).toHaveLength(4);
    expect(txs().some(t => t.id === '1' || t.id === '2')).toBe(false);
    expect(S().getState().accounts.some(a => a.id === '1' || a.id === '2')).toBe(false);
    expect(S().getState().accounts.map(a => a.name).sort()).toEqual(['Banca', 'Cassa']);
  });

  it('N8: two rows of one file sharing an Id the store does not hold both import', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, openingDate: '2026-01-01' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 3.5, accountId: id('Cash'), categoryId: 'cat_groceries', date: '2026-03-01', time: '08:00:00', comment: 'Coffee' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 3.5, accountId: id('Cash'), categoryId: 'cat_groceries', date: '2026-03-01', time: '08:00:00', comment: 'Coffee' });
    const rows = table(exportFiles().transactions);
    const h = rows[0];
    const body = rows.slice(1).filter(r => r[h.indexOf('Type')] !== 'opening_balance');
    body[1][h.indexOf('Id')] = body[0][h.indexOf('Id')]; // a ledger that already held two copies
    const sharedId = body[0][h.indexOf('Id')];
    boot();
    const res = importFile(untable([h, ...body]));
    expect(res.importedCount).toBe(2);
    expect(res.duplicateCount).toBe(0);
    const ids = nonOpening().map(t => t.id);
    expect(ids).toContain(sharedId);
    expect(new Set(ids).size).toBe(2);
  });

  describe('D11: a series or transfer already here is owned here (N4)', () => {
    it('a past member deleted locally does not come back; one series, one armed member', () => {
      const { sid } = buildLedger();
      const out = exportFiles();
      const members = txs().filter(t => t.recurrence && t.recurrence.seriesId === sid);
      const past = members.find(t => t.date === '2026-05-07');
      S().dispatch('DELETE_TRANSACTION', { id: past.id });
      const before = snapshot();
      const res = importFile(out.transactions);
      expect(res.importedCount).toBe(0);
      // Every non-opening row of the file, the deleted member included (its series is held here).
      expect(res.duplicateCount).toBe(table(out.transactions).slice(1).filter(r => r[2] !== 'opening_balance').length);
      expect(snapshot()).toEqual(before);
      expect(seriesIds()).toEqual([sid]);
      expect(armed(sid)).toHaveLength(1);
      expect(txs().some(t => t.date === '2026-05-07' && t.comment === 'Rent')).toBe(false);
    });

    it('a this-and-future move from the 7th to the 5th is not undone by the older backup', () => {
      const { sid } = buildLedger();
      const out = exportFiles();
      const june = txs().find(t => t.recurrence && t.date === '2026-06-07');
      const rec = june.recurrence;
      S().dispatch('UPDATE_TRANSACTION', {
        id: june.id, type: june.type, amount: june.amount, accountId: june.accountId, categoryId: june.categoryId,
        date: '2026-06-05', time: undefined, comment: june.comment, tags: [],
        recurrence: { seriesId: rec.seriesId, interval: rec.interval, frequency: rec.frequency, endDate: rec.endDate,
          nextDate: S()._calculateNextRecurrenceDate('2026-06-05', rec.interval, rec.frequency) },
        updateFuture: true, updateAll: false
      });
      const rentDays = () => txs().filter(t => t.comment === 'Rent').map(t => t.date).sort();
      const after = rentDays();
      expect(after).toContain('2026-06-05');
      expect(after).not.toContain('2026-06-07');
      importFile(out.transactions);
      expect(rentDays()).toEqual(after);
      const months = rentDays().map(d => d.slice(0, 7));
      expect(new Set(months).size).toBe(months.length); // one member per month
      expect(seriesIds()).toEqual([sid]);
      expect(armed(sid)).toHaveLength(1);
    });

    it('payments removed with the loan stay removed after a restore', () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 5000, openingDate: '2026-01-01' });
      S().dispatch('ADD_LOAN', { name: 'Car', kind: 'active', config: {
        type: 'personal', principal: 12000, downPayment: 0, duration: 24, durationUnit: 'months',
        annualRate: 5, firstPaymentDate: '2026-04-01', amortization: 'french' } });
      const loan = S().getState().loans[0];
      const sid = window.StackdDB.generateId();
      S().dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId: sid });
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 526.46, accountId: id('Main Bank'), categoryId: 'cat_debt',
        date: '2026-04-01', comment: 'Car — loan payment', recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2028-03-01' } });
      const out = exportFiles();
      S().dispatch('DELETE_LOAN', { id: loan.id, deleteFuturePayments: true });
      const left = txs().filter(t => t.recurrence && t.recurrence.seriesId === sid).length;
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(24);
      importFile(out.transactions);
      importFile(out.loans);
      // Not re-added under the same series, nor as a re-keyed copy beside it.
      expect(seriesIds()).toEqual([sid]);
      expect(txs().filter(t => t.comment === 'Car — loan payment')).toHaveLength(left);
      expect(txs().filter(t => t.recurrence && t.recurrence.seriesId === sid)).toHaveLength(left);
      const back = S().getState().loans.find(l => l.name === 'Car');
      expect(S().getLoanLinkedTransactions(back)).toHaveLength(left);
    });

    it('the other leg of a transfer whose account was deleted does not come back alone', () => {
      buildLedger();
      const out = exportFiles();
      const savingsLeg = txs().find(t => t.transferRef && t.type === 'income');
      S().dispatch('DELETE_ACCOUNT', { id: id('Savings') });
      const survivor = txs().find(t => t.amount === 200 && t.type === 'expense');
      expect(survivor.transferRef).toBeFalsy();
      importFile(out.accounts);
      importFile(out.transactions);
      expect(txs().some(t => t.id === savingsLeg.id)).toBe(false);
      expect(txs().filter(t => t.amount === 200 && t.date === '2026-05-02')).toHaveLength(1);
      expect(txs().find(t => t.id === survivor.id).transferRef).toBeFalsy();
    });

    // Review round 1: ownership follows the store row that was matched. A
    // plain local row stands in for one file row, not for its whole series.
    it('a plain statement row matched by bank key does not swallow the backup series', () => {
      const { sid } = buildLedger();
      const members = () => txs().filter(t => t.recurrence && t.recurrence.seriesId === sid);
      const total = members().length;
      expect(total).toBe(9);
      const april = members().find(t => t.date === '2026-04-07');
      april.importKey = 'ref:' + april.accountId + '|REF-APR'; // linked to its statement row
      april.bankRef = 'REF-APR';
      const out = exportFiles();
      boot();
      S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 0, openingDate: '2026-01-01' });
      const { items } = I().buildStatementTransactions({ entries: [
        { date: '2026-04-07', description: 'RENT APRIL', type: 'expense', amount: 700, bankRef: 'REF-APR' }
      ] }, id('Main Bank'));
      S().dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: items.map(it => it.tx) });
      expect(txs().find(t => t.bankRef === 'REF-APR').recurrence).toBeFalsy();

      const res = importFile(out.transactions);
      expect(res.duplicateCount).toBe(1); // the April member only
      expect(members()).toHaveLength(total - 1);
      expect(armed(sid)).toHaveLength(1);
      expect(txs().filter(t => t.date === '2026-04-07' && t.amount === 700)).toHaveLength(1);
    });

    it('a plain local row matched by fingerprint takes one member / one leg, not the series or the transfer', () => {
      const { sid } = buildLedger();
      const members = () => txs().filter(t => t.recurrence && t.recurrence.seriesId === sid);
      const total = members().length;
      const leg = txs().find(t => t.transferRef && t.type === 'expense');
      const out = exportFiles();
      boot();
      importFile(out.accounts);
      const bank = id('Main Bank');
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 700, accountId: bank, categoryId: 'cat_groceries', date: '2026-04-07', time: '07:00:00', comment: 'Rent' });
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 200, accountId: bank, categoryId: '', date: leg.date, time: leg.time, comment: leg.comment });

      const res = importFile(out.transactions);
      expect(res.duplicateCount).toBe(2);
      expect(members()).toHaveLength(total - 1);
      expect(armed(sid)).toHaveLength(1);
      expect(txs().filter(t => t.date === '2026-04-07' && t.amount === 700)).toHaveLength(1);
      // The income leg comes back (unpaired, so a plain row): Savings 200 + 200.
      expect(S().getAccountBalance(id('Savings'))).toBe(400);
      expect(txs().filter(t => t.amount === 200 && t.date === leg.date && t.accountId === bank)).toHaveLength(1);
    });

    it('a re-keyed series with a locally renamed category and a deleted member creates no category', () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 1000, openingDate: '2026-01-01' });
      S().dispatch('ADD_CATEGORY', { name: 'Housing', icon: 'home', typeHint: 'expense' });
      const housing = S().getState().categories.find(c => c.name === 'Housing');
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 700, accountId: id('Main Bank'), categoryId: housing.id, date: '2026-04-07', time: '07:00:00', comment: 'Rent',
        recurrence: { interval: 1, frequency: 'months', endDate: '2026-12-07' } });
      const file = legacy(exportFiles().transactions);
      boot();
      importFile(file);
      // A 1.0-era restore re-keyed the series; then the category was renamed
      // and one member deleted.
      txs().forEach(t => { if (t.recurrence) t.recurrence = { ...t.recurrence, seriesId: 'local-sid' }; });
      const cat = S().getState().categories.find(c => c.name === 'Housing');
      S().dispatch('UPDATE_CATEGORY', { id: cat.id, name: 'Home' });
      S().dispatch('DELETE_TRANSACTION', { id: txs().find(t => t.date === '2026-05-07').id });
      const before = snapshot();
      const cats = S().getState().categories.length;

      const res = importFile(file);
      expect(res.importedCount).toBe(0);
      expect(res.duplicateCount).toBe(9);
      expect(res.newCategories).toBe(0);
      expect(S().getState().categories).toHaveLength(cats);
      expect(S().getState().categories.some(c => c.name === 'Housing')).toBe(false);
      expect(snapshot()).toEqual(before);
    });

    // Integrated review: the same, from a pre-1.0.2 file (no Id). The
    // survivor's note gained "Transfer to deleted account …", so only its
    // leftover shape (no ref, no category) can recognise it.
    it('a pre-1.0.2 file: the leg whose other account was deleted is not taken out twice', () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
      S().dispatch('ADD_ACCOUNT', { name: 'Old Savings', openingBalance: 0, openingDate: '2026-01-01' });
      S().dispatch('ADD_TRANSFER', { amount: 200, expenseAccountId: id('Main'), incomeAccountId: id('Old Savings'), date: '2026-05-02', note: 'Save' });
      const file = legacy(exportFiles().transactions);
      S().dispatch('DELETE_ACCOUNT', { id: id('Old Savings') });
      const survivor = txs().find(t => t.amount === 200);
      expect(survivor.comment).not.toBe('Save'); // precondition: the note changed
      expect(S().getAccountBalance(id('Main'))).toBe(800);

      const res = importFile(file);

      expect(S().getAccountBalance(id('Main'))).toBe(800);
      expect(txs().filter(t => t.accountId === id('Main') && t.amount === 200)).toHaveLength(1);
      expect(res.duplicateCount).toBeGreaterThanOrEqual(1);
      expect(txs().filter(t => t.amount === 200 && t.type === 'income')).toHaveLength(0); // its other leg went too
    });

    it("an account created only for a dropped transfer leg is taken back", () => {
      buildLedger();
      const out = exportFiles();
      const savingsId = id('Savings');
      S().dispatch('DELETE_ACCOUNT', { id: savingsId });
      // A transactions file without the Savings opening balance row.
      const rows = table(out.transactions);
      const h = rows[0];
      const file = untable(rows.filter(r => !(r[h.indexOf('Type')] === 'opening_balance' && r[h.indexOf('Account')] === 'Savings')));
      const before = snapshot();
      const accounts = S().getState().accounts.map(a => a.id);

      const res = importFile(file);
      expect(res.importedCount).toBe(0);
      expect(res.newAccounts).toBe(0);
      expect(S().getState().accounts.map(a => a.id)).toEqual(accounts);
      expect(snapshot()).toEqual(before);
    });
  });

  describe('loans', () => {
    const LOAN = { type: 'personal', principal: 9000, downPayment: 0, duration: 36, durationUnit: 'months', annualRate: 5, firstPaymentDate: '2026-01-15', amortization: 'french' };

    it('a loans file imported twice → one loan', () => {
      S().dispatch('ADD_LOAN', { name: 'Auto', kind: 'active', config: { ...LOAN } });
      const out = exportFiles();
      boot();
      expect(importFile(out.loans)).toMatchObject({ kind: 'loans', importedCount: 1, duplicateCount: 0 });
      expect(importFile(out.loans)).toMatchObject({ kind: 'loans', importedCount: 0, duplicateCount: 1 });
      expect(S().getState().loans).toHaveLength(1);
    });

    it('guard: a file holding two identical loans restores both onto an empty phone', () => {
      S().dispatch('ADD_LOAN', { name: 'Auto', kind: 'sim', config: { ...LOAN } });
      S().dispatch('ADD_LOAN', { name: 'Auto', kind: 'sim', config: { ...LOAN } });
      const out = exportFiles();
      boot();
      const res = importFile(out.loans);
      expect(res.importedCount).toBe(2);
      expect(res.duplicateCount || 0).toBe(0);
      expect(S().getState().loans).toHaveLength(2);
    });

    it('_stableJson ignores key order and undefined members', () => {
      expect(I()._stableJson({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe(I()._stableJson({ a: [1, { d: 2 }], b: 1 }));
    });
  });

  describe('BATCH_IMPORT_TRANSACTIONS keeps ids unique', () => {
    it('drops a payload row whose id is already here; an undefined id still gets one', () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, openingDate: '2026-01-01' });
      const row = (extra) => ({ type: 'expense', amount: 1, accountId: id('Cash'), categoryId: '', date: '2026-03-01', comment: 'x', ...extra });
      S().dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: [row({ id: 'tx-keep' })] });
      S().dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: [row({ id: 'tx-keep', amount: 2 }), row({ id: undefined })] });
      expect(txs().filter(t => t.id === 'tx-keep')).toHaveLength(1);
      expect(txs().find(t => t.id === 'tx-keep').amount).toBe(1);
      const generated = nonOpening().filter(t => t.id !== 'tx-keep');
      expect(generated).toHaveLength(1);
      expect(generated[0].id).toBeTruthy();
    });

    it('an unsafe id is replaced by a generated one (1.0.2 BUG-24 backstop)', () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, openingDate: '2026-01-01' });
      S().dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: [
        { id: 'x"><img>', type: 'expense', amount: 1, accountId: id('Cash'), categoryId: '', date: '2026-03-01', comment: 'x' }
      ] });
      const t = nonOpening()[0];
      expect(t.id).not.toBe('x"><img>');
      expect(t.id).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
    });

    it('a batch with nothing new changes nothing', () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, openingDate: '2026-01-01' });
      S().dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: [{ id: 'k1', type: 'expense', amount: 1, accountId: id('Cash'), categoryId: '', date: '2026-03-01' }] });
      const before = JSON.stringify(txs());
      S().dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: [{ id: 'k1', type: 'expense', amount: 9, accountId: id('Cash'), categoryId: '', date: '2026-03-02' }] });
      expect(JSON.stringify(txs())).toBe(before);
    });
  });
});
