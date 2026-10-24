import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.1.0 (IE-3, docs/import-export-plan.md §6e): QIF files read into ledger
// rows — several accounts, the opening record, transfers between accounts,
// splits, Cat:Sub categories, the file's date order and decimal mark —
// imported through the ledger path; never written in restore mode.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let mem;
let setItem;
let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'q' + (++bootNo) + '-';
  mem = new Map();
  setItem = vi.fn((k, v) => { mem.set(k, String(v)); });
  const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem, removeItem: (k) => { mem.delete(k); } };
  global.window = { crypto: { randomUUID: () => prefix + (++uid) }, localStorage: ls };
  global.localStorage = ls;
  global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
  ['db.js', 'i18n.js', 'i18n/en.js', 'i18n/fr.js', 'i18n/it.js', 'i18n/es.js', 'i18n/pt.js',
    'loan-engine.js', 'store.js', 'export.js', 'import.js'].forEach(executeFile);
  window.Store.init();
  window.Store.dispatch('SET_CURRENCY', 'EUR');
};

const S = () => window.Store;
const I = () => window.StackdImport;
const acc = (name) => S().getState().accounts.find(a => a.name === name);
const bal = (name) => Math.round(S().getAccountBalance(acc(name).id) * 100) / 100;
const txsOf = (name) => S().getState().transactions.filter(t => t.accountId === acc(name).id && t.type !== 'opening_balance');
const catName = (id) => (S().getState().categories.find(c => c.id === id) || {}).name || '';
const commit = (text, opts = {}) => {
  let out = null;
  let err = null;
  I().importText(text, Object.assign({ mode: 'commit' }, opts), (r) => { out = r; }, (e) => { err = e; });
  if (err) throw err;
  return out;
};

// Quicken-style multi-account export (US dates M/D'YY, dot decimals).
const MULTI = [
  '!Option:AutoSwitch',
  '!Account', 'NChecking', 'TBank', '^',
  '!Account', 'NSavings', 'TBank', '^',
  '!Clear:AutoSwitch',
  '!Account', 'NChecking', 'TBank', '^',
  '!Type:Bank',
  "D1/ 1'26", 'T1,000.00', 'CX', 'POpening Balance', 'L[Checking]', '^',
  "D1/13'26", 'T-45.90', 'PSUPERMARKET', 'MWeekly', 'LGroceries:Food/Home', '^',
  "D1/15'26", 'T-200.00', 'PTransfer', 'L[Savings]', '^',
  "D1/20'26", 'T-120.00', 'PSTORE', 'MSplit buy', 'LHousehold',
  'SHousehold:Kitchen', 'EPans', '$-80.00', 'SGifts', 'EFor Mia', '$-40.00', '^',
  "D1/25'26", 'T2,500.00', 'PACME', 'LSalary', '^',
  '!Account', 'NSavings', 'TBank', '^',
  '!Type:Bank',
  "D1/ 1'26", 'T5,000.00', 'POpening Balance', 'L[Savings]', '^',
  "D1/15'26", 'T200.00', 'PTransfer', 'L[Checking]', '^',
  '!Account', 'NBroker', 'TInvst', '^',
  '!Type:Invst',
  "D1/ 3'26", 'NBuy', 'YACME', 'I10', 'Q5', 'T50', '^'
].join('\n');

describe('QIF detection (1.1.0 IE-3)', () => {
  beforeEach(boot);

  it('is sniffed by content and analysed without writing', () => {
    expect(I().sniffFormat(MULTI)).toBe('qif');
    expect(I().sniffFormat('!Type:Bank\nD01/02/2026\nT-1.00\n^')).toBe('qif');
    expect(I().sniffFormat('Date;Amount\n01/02/2026;1')).toBe('csv');
    const before = JSON.stringify(S().getState().transactions);
    const a = I().analyzeText(MULTI);
    expect(a).toMatchObject({ kind: 'qif', qif: { accounts: ['Checking', 'Savings', 'Broker'], named: true } });
    expect(a.decided.dateOrder.order).toBe('mdy');
    expect(JSON.stringify(S().getState().transactions)).toBe(before);
  });

  it('restore mode (Settings) still refuses it as before and writes nothing', () => {
    let out = null;
    let err = null;
    I().importCSV({ text: MULTI }, S().getState(), (r) => { out = r; }, (e) => { err = e; });
    expect(out).toBeNull();
    expect(err.message).toBe('unrecognised file');
    expect(S().getState().transactions).toHaveLength(0);
  });
});

describe('Committing a QIF file (1.1.0 IE-3)', () => {
  beforeEach(boot);

  it('several accounts, openings, a transfer, splits and categories', () => {
    const r = commit(MULTI);
    expect(r.kind).toBe('qif');
    expect(r.newAccounts).toBe(2);
    expect(r.skipped['investment accounts are not supported']).toBe(1);
    expect(bal('Checking')).toBe(1000 - 45.9 - 200 - 120 + 2500);
    expect(bal('Savings')).toBe(5200);
    expect(S().getAccountOpeningDate(acc('Checking').id)).toBe('2026-01-01');
    const legs = S().getState().transactions.filter(t => t.transferRef);
    expect(legs).toHaveLength(2);
    expect(new Set(legs.map(t => t.transferRef)).size).toBe(1);
    const shop = txsOf('Checking').find(t => t.amount === 45.9);
    expect(shop.date).toBe('2026-01-13');
    expect(catName(shop.categoryId)).toBe('Groceries');
    expect(shop.tags).toEqual(['food', 'home']);
    expect(shop.comment).toBe('SUPERMARKET — Weekly');
    const splits = txsOf('Checking').filter(t => t.date === '2026-01-20');
    expect(splits.map(t => [t.amount, catName(t.categoryId), t.comment]).sort()).toEqual([
      [40, 'Gifts', 'STORE — Split buy — For Mia'], [80, 'Household', 'STORE — Split buy — Pans']
    ]);
    expect(r.ledger.qif.accounts).toEqual(['Checking', 'Savings', 'Broker']);
  });

  it('re-importing adds nothing; Check equals Import and writes nothing', () => {
    const before = JSON.stringify(S().getState());
    const writes = setItem.mock.calls.length;
    const chk = I().checkText(MULTI);
    expect(JSON.stringify(S().getState())).toBe(before);
    expect(setItem.mock.calls.length).toBe(writes);
    const real = commit(MULTI);
    expect(chk.result).toEqual(real);
    const again = commit(MULTI);
    expect(again.importedCount).toBe(0);
  });

  it('a single-account export takes its name from the opening record, or from Review', () => {
    const one = ['!Type:CCard', "D02/01'26", 'T-150.00', 'POpening Balance', 'L[Visa]', '^',
      "D02/03'26", 'T-12.50', 'PCafe', 'LDining', '^'].join('\n');
    commit(one);
    expect(bal('Visa')).toBe(-162.5);
    boot();
    commit(one, { accountName: 'My card' });
    expect(acc('My card')).toBeTruthy();
    expect(bal('My card')).toBe(-162.5);
    boot();
    commit(['!Type:Cash', 'D03/04/2026', 'T-5.00', 'PBus', '^'].join('\n'));
    expect(acc('QIF')).toBeTruthy();
  });

  it('European dates and decimal commas; a transfer to an account not in the file stays plain', () => {
    const eu = ['!Type:Bank', 'D31.01.2026', 'T-1.234,56', 'PRent', 'LHousing', '^',
      'D15.01.2026', 'T-50,00', 'PTo savings', 'L[Savings]', '^'].join('\n');
    const r = commit(eu, { accountName: 'Conto' });
    expect(r.ledger.dateOrder.order).toBe('dmy');
    expect(r.ledger.decimal).toBe('comma');
    expect(txsOf('Conto').find(t => t.amount === 1234.56).date).toBe('2026-01-31');
    const lone = txsOf('Conto').find(t => t.amount === 50);
    expect(lone.transferRef).toBeUndefined();
    expect(catName(lone.categoryId)).toBe('Transfer');
    expect(lone.comment).toBe('To savings — → Savings');
  });

  it('settings: a forced date order and the amount factor', () => {
    const t = ['!Type:Bank', "D02/03'26", 'T-10.00', 'PX', '^'].join('\n');
    commit(t, { accountName: 'A', dateOrder: 'dmy', factor: -1 });
    const row = txsOf('A')[0];
    expect(row.date).toBe('2026-03-02');
    expect(row.type).toBe('income');
  });

  it('records without a date or with a bad amount are counted, not imported', () => {
    const r = commit(['!Type:Bank', 'T-10.00', 'PNo date', '^', 'D01/02/2026', 'Tabc', '^', 'D01/03/2026', 'T-1.00', '^'].join('\n'), { accountName: 'A' });
    expect(r.importedCount).toBe(1);
    expect(r.skippedCount).toBe(2);
  });
});
