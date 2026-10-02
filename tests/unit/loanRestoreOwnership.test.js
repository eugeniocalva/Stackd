import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-02) review fixes:
//  (a) a series belongs to ONE loan — importing the loans file twice, or a
//      full backup into the install it came from, must not give the duplicate
//      loan the original's series (deleting the duplicate with its future
//      payments used to wipe the original's schedule);
//  (b) the payment-note fallback only links loans from a loans file written
//      BEFORE the LinkedSeriesId column, never a loan the user left untracked.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
let bootNo = 0;
let storage;
// A real (Map-backed) localStorage so a "restart" can keep the data.
const makeStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m
  };
};
const boot = (keepStorage = false) => {
  let uid = 0;
  const prefix = 'o' + (++bootNo) + '-uuid-'; // ids never repeat across boots
  if (!keepStorage || !storage) storage = makeStorage();
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: storage
  };
  global.localStorage = global.window.localStorage;
  global.FileReader = class {
    readAsText(file) { this.onload({ target: { result: file.text } }); }
  };
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'i18n/fr.js', 'i18n/it.js', 'i18n/es.js', 'i18n/pt.js',
    'loan-engine.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  global.window.Store.init();
  if (!keepStorage) global.window.Store.dispatch('SET_CURRENCY', 'EUR');
};

const S = () => window.Store;
const loan = (name) => S().getState().loans.find(l => l.name === name);
const loansNamed = (name) => S().getState().loans.filter(l => l.name === name);
const membersOf = (sid) => S().getState().transactions.filter(t => t.recurrence && t.recurrence.seriesId === sid);

const importFile = (csv) => {
  let out;
  window.StackdImport.importCSV({ text: csv }, S().getState(),
    (result) => { out = result; },
    (err) => { throw err; });
  return out;
};

const exportAll = () => {
  const st = S().getState();
  const E = window.StackdExport;
  E.exportAccounts(st); E.exportCategories(st); E.exportTransactions(st);
  E.exportLoans(st); E.exportBudgets(st); E.exportImportRules(st);
  return {
    accounts: files['stackd_accounts.csv'],
    categories: files['stackd_categories.csv'],
    transactions: files['stackd_transactions.csv'],
    loans: files['stackd_loans.csv'],
    budgets: files['stackd_budgets.csv'],
    rules: files['stackd_import_rules.csv']
  };
};

// A loans file written before 1.0.1: no LinkedSeriesId column.
const stripLinkColumn = (csv) => csv.split('\n').map((line, i) => {
  if (i === 0) return line.replace(/,LinkedSeriesId$/, '');
  return line.replace(/,[^,"]*$/, '');
}).join('\n');

const MORTGAGE = {
  type: 'mortgage', principal: 200000, downPayment: 0, duration: 5, durationUnit: 'years',
  annualRate: 3, firstPaymentDate: '2026-11-01', amortization: 'french'
};

const trackLoan = (l, firstDate = '2026-11-01') => {
  const sid = window.StackdDB.generateId();
  S().dispatch('SET_PENDING_LOAN_LINK', { loanId: l.id, seriesId: sid });
  S().dispatch('ADD_TRANSACTION', {
    type: 'expense', amount: 969.36, accountId: S().getState().accounts[0].id,
    categoryId: 'cat_debt', date: firstDate,
    comment: window.I18n.t('debt.paymentNote', { name: l.name }),
    recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2031-10-01' }
  });
  expect(S().getState().loans.find(x => x.id === l.id).linkedSeriesId).toBe(sid);
  return sid;
};

const buildLedger = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 5000, openingDate: '2026-01-01' });
  S().dispatch('ADD_LOAN', { name: 'Home Mortgage', kind: 'active', config: { ...MORTGAGE } });
  const sid = trackLoan(loan('Home Mortgage'));
  const members = membersOf(sid).length;
  expect(members).toBeGreaterThan(12);
  return { sid, members };
};

// No two loans may ever name the same series.
const expectNoSharedSeries = () => {
  const ids = S().getState().loans.map(l => l.linkedSeriesId).filter(Boolean);
  expect(new Set(ids).size).toBe(ids.length);
};

const EXPORT_ORDER = ['accounts', 'categories', 'transactions', 'loans', 'budgets', 'rules'];
const LOANS_FIRST = ['accounts', 'categories', 'loans', 'transactions', 'budgets', 'rules'];

describe('1.0.1 (BUG-02) a re-imported loan never shares its series', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('a loans file imported twice → only one loan holds the series; deleting the duplicate keeps the original\'s payments', () => {
    const { sid, members } = buildLedger();
    const out = exportAll();

    boot(); // new phone: a normal restore…
    for (const k of EXPORT_ORDER) importFile(out[k]);
    expect(loan('Home Mortgage').linkedSeriesId).toBe(sid);
    importFile(out.loans); // …then the loans file again by mistake

    const both = loansNamed('Home Mortgage');
    expect(both).toHaveLength(2);
    expect(both.filter(l => l.linkedSeriesId === sid)).toHaveLength(1);
    expectNoSharedSeries();
    const original = both.find(l => l.linkedSeriesId === sid);
    const dup = both.find(l => l !== original);
    expect(dup.linkedSeriesId).toBeNull();

    S().dispatch('DELETE_LOAN', { id: dup.id, deleteFuturePayments: true });
    expect(S().getState().loans).toHaveLength(1);
    expect(membersOf(sid)).toHaveLength(members);
    expect(S().getLoanLinkedTransactions(S().getState().loans[0])).toHaveLength(members);
  });

  it('a loans file imported twice in the install it came from (no reset)', () => {
    const { sid, members } = buildLedger();
    const out = exportAll();
    importFile(out.loans);
    importFile(out.loans);

    const all = loansNamed('Home Mortgage');
    expect(all).toHaveLength(3);
    expect(all.filter(l => l.linkedSeriesId === sid)).toHaveLength(1);
    expectNoSharedSeries();
    all.filter(l => l.linkedSeriesId !== sid)
      .forEach(l => S().dispatch('DELETE_LOAN', { id: l.id, deleteFuturePayments: true }));
    expect(membersOf(sid)).toHaveLength(members);
  });

  for (const [label, order] of [['in export order', EXPORT_ORDER], ['loans before transactions', LOANS_FIRST]]) {
    it(`a full backup re-imported into the same install (${label}) → the duplicate tracks the re-keyed copy, not the original`, () => {
      const { sid, members } = buildLedger();
      const original = loan('Home Mortgage');
      const out = exportAll();
      for (const k of order) importFile(out[k]);

      const both = loansNamed('Home Mortgage');
      expect(both).toHaveLength(2);
      expectNoSharedSeries();
      const dup = both.find(l => l.id !== original.id);
      expect(dup.linkedSeriesId).not.toBe(sid);
      // The re-imported transactions came back under a fresh series id; the
      // duplicate loan is linked to that copy by its payment note.
      expect(dup.linkedSeriesId).toBeTruthy();
      expect(membersOf(dup.linkedSeriesId)).toHaveLength(members);
      expect(dup.needsNoteRelink).toBeUndefined();

      S().dispatch('DELETE_LOAN', { id: dup.id, deleteFuturePayments: true });
      expect(loan('Home Mortgage').id).toBe(original.id);
      expect(membersOf(sid)).toHaveLength(members);
      expect(S().getLoanLinkedTransactions(loan('Home Mortgage'))).toHaveLength(members);
      // Exactly one armed generator per remaining series.
      expect(membersOf(sid).filter(t => t.recurrence.nextDate)).toHaveLength(1);
    });
  }

  it('two rows of one file naming the same series → only the first keeps it', () => {
    const { sid, members } = buildLedger();
    const out = exportAll();
    const lines = out.loans.split('\n');
    const row = lines.find(l => l.startsWith('Home Mortgage,'));
    out.loans = [...lines, row.replace(/^Home Mortgage,/, 'Home Mortgage Copy,')].join('\n');

    boot();
    for (const k of LOANS_FIRST) importFile(out[k]);
    expect(loan('Home Mortgage').linkedSeriesId).toBe(sid);
    expect(loan('Home Mortgage Copy').linkedSeriesId).toBeNull(); // its note names the other loan
    expectNoSharedSeries();
    expect(S().getLoanLinkedTransactions(loan('Home Mortgage'))).toHaveLength(members);
  });

  it('buildLoans alone still reads the id back (the ownership check is the import route\'s)', () => {
    const { sid } = buildLedger();
    const { loans } = window.StackdImport.buildLoans(window.StackdImport.parseCSV(exportAll().loans));
    expect(loans[0].linkedSeriesId).toBe(sid);
    expect(loans[0].needsNoteRelink).toBeUndefined();
  });
});

describe('1.0.1 (BUG-02) the payment-note fallback is for legacy loans files only', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  const unrelatedTxCsv = () => [
    'Date,Time,Amount,Account,Category,Type,Comment',
    '2026-09-15,10:00,3.50,Main Bank,Groceries,expense,Tea'
  ].join('\n');

  it('a loan the user never tracked is not linked by a later transactions import', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 5000, openingDate: '2026-01-01' });
    S().dispatch('ADD_LOAN', { name: 'Car', kind: 'active', config: { ...MORTGAGE, type: 'personal', principal: 15000 } });
    const sid = trackLoan(loan('Car'));
    // Delete the loan but keep its payments (box unticked).
    S().dispatch('DELETE_LOAN', { id: loan('Car').id, deleteFuturePayments: false });
    expect(membersOf(sid).length).toBeGreaterThan(12);
    // A refinance with the same name; the user declines the Track offer.
    S().dispatch('ADD_LOAN', { name: 'Car', kind: 'active', config: { ...MORTGAGE, type: 'personal', principal: 12000 } });

    const res = importFile(unrelatedTxCsv());
    expect(res.kind).toBe('transactions');
    expect(res.importedCount).toBe(1);
    expect(loan('Car').linkedSeriesId).toBeNull();
  });

  it('an empty LinkedSeriesId cell (new-format file) means untracked — never flagged, never note-linked', () => {
    const { sid } = buildLedger();
    const out = exportAll();
    // The user deliberately left this one untracked: blank cell.
    out.loans = out.loans.split('\n').map((l, i) => (i === 0 ? l : l.replace(/,[^,"]*$/, ','))).join('\n');

    boot();
    importFile(out.loans);
    expect(loan('Home Mortgage').linkedSeriesId).toBeNull();
    expect(loan('Home Mortgage').needsNoteRelink).toBeUndefined();
    for (const k of ['accounts', 'categories', 'transactions']) importFile(out[k]);
    expect(membersOf(sid).length).toBeGreaterThan(12);
    expect(loan('Home Mortgage').linkedSeriesId).toBeNull();
  });

  it('a legacy-file loan keeps its flag across a restart and is linked by a transactions file imported later', () => {
    const { sid, members } = buildLedger();
    const out = exportAll();

    boot();
    importFile(stripLinkColumn(out.loans));
    expect(loan('Home Mortgage').linkedSeriesId).toBeNull();
    expect(loan('Home Mortgage').needsNoteRelink).toBe(true);
    // Persisted on the record, not held in memory only.
    expect(storage.getItem('stackd_v1_loans')).toMatch(/"needsNoteRelink":true/);
    // The export never leaks it into the CSV.
    window.StackdExport.exportLoans(S().getState());
    expect(files['stackd_loans.csv']).not.toMatch(/needsNoteRelink/i);

    boot(true); // app restart: same storage
    expect(loan('Home Mortgage').needsNoteRelink).toBe(true);
    importFile(out.accounts);
    importFile(out.categories);
    importFile(out.transactions);
    expect(loan('Home Mortgage').linkedSeriesId).toBe(sid);
    expect(loan('Home Mortgage').needsNoteRelink).toBeUndefined();
    expect(S().getLoanLinkedTransactions(loan('Home Mortgage'))).toHaveLength(members);
    expect(storage.getItem('stackd_v1_loans')).not.toMatch(/needsNoteRelink/);
  });

  it('ADD_LOAN keeps the flag only on an active, unlinked loan', () => {
    S().dispatch('ADD_LOAN', { name: 'A', kind: 'active', config: { ...MORTGAGE }, needsNoteRelink: true });
    S().dispatch('ADD_LOAN', { name: 'B', kind: 'sim', config: { ...MORTGAGE }, needsNoteRelink: true });
    S().dispatch('ADD_LOAN', { name: 'C', kind: 'active', config: { ...MORTGAGE }, linkedSeriesId: 'x', needsNoteRelink: true });
    S().dispatch('ADD_LOAN', { name: 'D', kind: 'active', config: { ...MORTGAGE } });
    expect(loan('A').needsNoteRelink).toBe(true);
    expect(loan('B').needsNoteRelink).toBeUndefined();
    expect(loan('C').needsNoteRelink).toBeUndefined();
    expect(loan('D').needsNoteRelink).toBeUndefined();
  });

  const legacyRestoreLoansOnly = () => {
    buildLedger();
    const out = exportAll();
    boot();
    importFile(stripLinkColumn(out.loans));
    expect(loan('Home Mortgage').needsNoteRelink).toBe(true);
    return out;
  };

  it('editing the loan clears the flag (UPDATE_LOAN)', () => {
    const out = legacyRestoreLoansOnly();
    S().dispatch('UPDATE_LOAN', { id: loan('Home Mortgage').id, name: 'Home Mortgage', config: { ...MORTGAGE } });
    expect(loan('Home Mortgage').needsNoteRelink).toBeUndefined();
    expect(storage.getItem('stackd_v1_loans')).not.toMatch(/needsNoteRelink/);
    for (const k of ['accounts', 'categories', 'transactions']) importFile(out[k]);
    expect(loan('Home Mortgage').linkedSeriesId).toBeNull();
  });

  it('starting to track the loan by hand clears the flag (SET_PENDING_LOAN_LINK)', () => {
    const out = legacyRestoreLoansOnly();
    S().dispatch('SET_PENDING_LOAN_LINK', { loanId: loan('Home Mortgage').id, seriesId: 'hand-series' });
    expect(loan('Home Mortgage').needsNoteRelink).toBeUndefined();
    expect(storage.getItem('stackd_v1_loans')).not.toMatch(/needsNoteRelink/);
    S().dispatch('SET_PENDING_LOAN_LINK', null); // form abandoned
    for (const k of ['accounts', 'categories', 'transactions']) importFile(out[k]);
    expect(loan('Home Mortgage').linkedSeriesId).toBeNull();
  });

  it('tracking the loan through the prefilled form clears the flag and links it (ADD_TRANSACTION)', () => {
    legacyRestoreLoansOnly();
    S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 5000, openingDate: '2026-01-01' });
    const l = loan('Home Mortgage');
    const sid = window.StackdDB.generateId();
    S().dispatch('SET_PENDING_LOAN_LINK', { loanId: l.id, seriesId: sid });
    l.needsNoteRelink = true; // isolate the ADD_TRANSACTION link block
    S().dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 969.36, accountId: S().getState().accounts[0].id,
      categoryId: 'cat_debt', date: '2026-11-01', comment: 'by hand',
      recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2031-10-01' }
    });
    expect(loan('Home Mortgage').linkedSeriesId).toBe(sid);
    expect(loan('Home Mortgage').needsNoteRelink).toBeUndefined();
  });
});
