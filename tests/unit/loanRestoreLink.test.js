import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-02): a restored loan must come back TRACKED.
//
// Before this fix the loans file had no series column and the transactions
// import gave every series a new id, so after export -> factory reset ->
// import the loan was unlinked, its page offered "Track monthly payment"
// again, and accepting it doubled every payment. Every case boots a second,
// empty install and feeds the files through the real "Import CSV" router.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'b' + (++bootNo) + '-uuid-'; // ids never repeat across boots
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.FileReader = class {
    readAsText(file) { this.onload({ target: { result: file.text } }); }
  };
  // index.html order; all five dictionaries, as on a real phone.
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'i18n/fr.js', 'i18n/it.js', 'i18n/es.js', 'i18n/pt.js',
    'loan-engine.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', 'EUR');
};

const S = () => window.Store;
const loan = (name) => S().getState().loans.find(l => l.name === name);
const loansNamed = (name) => S().getState().loans.filter(l => l.name === name);
const seriesIds = () => [...new Set(S().getState().transactions
  .filter(t => t.recurrence && t.recurrence.seriesId).map(t => t.recurrence.seriesId))];

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

// The real tracking flow: SET_PENDING_LOAN_LINK, then the prefilled
// recurring expense (Views startRecurringPrefill) consumes it.
const trackLoan = (name, note, seriesId) => {
  const l = loan(name);
  const sid = seriesId || window.StackdDB.generateId();
  S().dispatch('SET_PENDING_LOAN_LINK', { loanId: l.id, seriesId: sid });
  S().dispatch('ADD_TRANSACTION', {
    type: 'expense', amount: 969.36, accountId: S().getState().accounts[0].id,
    categoryId: 'cat_debt', date: '2026-11-01',
    comment: note === undefined ? window.I18n.t('debt.paymentNote', { name: name }) : note,
    recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2031-10-01' }
  });
  expect(loan(name).linkedSeriesId).toBe(sid);
  return sid;
};

const buildLedger = (opts = {}) => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 5000, openingDate: '2026-01-01' });
  S().dispatch('ADD_LOAN', { name: opts.name || 'Home Mortgage', kind: 'active', config: { ...MORTGAGE } });
  S().dispatch('ADD_LOAN', { name: 'Car Sim', kind: 'sim', config: { ...MORTGAGE, type: 'personal', principal: 15000 } });
  const sid = trackLoan(opts.name || 'Home Mortgage', opts.note);
  const members = S().getLoanLinkedTransactions(loan(opts.name || 'Home Mortgage')).length;
  expect(members).toBeGreaterThan(12);
  return { sid, members };
};

const expectTracked = (name, members) => {
  const linked = S().getLoanLinkedTransactions(loan(name));
  expect(linked).not.toBeNull();
  expect(linked).toHaveLength(members);
  // One series only: nothing was doubled.
  expect(seriesIds()).toHaveLength(1);
  const onFirstDue = S().getState().transactions.filter(t => t.date === '2026-11-01' && t.type === 'expense');
  expect(onFirstDue).toHaveLength(1);
};

const EXPORT_ORDER = ['accounts', 'categories', 'transactions', 'loans', 'budgets', 'rules'];
const REVERSE_ORDER = [...EXPORT_ORDER].reverse(); // loans BEFORE transactions

describe('1.0.1 (BUG-02) a tracked loan survives a full restore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('exports LinkedSeriesId for an active loan and leaves it blank for a sim', () => {
    const { sid } = buildLedger();
    const lines = exportAll().loans.split('\n');
    expect(lines[0].split(',').pop()).toBe('LinkedSeriesId');
    const mortgageRow = lines.find(l => l.startsWith('Home Mortgage,'));
    const simRow = lines.find(l => l.startsWith('Car Sim,'));
    expect(mortgageRow.endsWith(',' + sid)).toBe(true);
    expect(simRow.endsWith(',')).toBe(true);
  });

  it('buildLoans reads LinkedSeriesId back, never onto a sim', () => {
    const { sid } = buildLedger();
    // Mark the sim row as if it carried an id: it must still come back unlinked.
    const csv = exportAll().loans.split('\n')
      .map(l => (l.startsWith('Car Sim,') ? l + 'bogus-id' : l)).join('\n');
    const { loans } = window.StackdImport.buildLoans(window.StackdImport.parseCSV(csv));
    expect(loans.find(l => l.name === 'Home Mortgage').linkedSeriesId).toBe(sid);
    expect(loans.find(l => l.name === 'Car Sim').linkedSeriesId).toBeNull();
  });

  for (const [label, order] of [['in export order', EXPORT_ORDER], ['loans before transactions', REVERSE_ORDER]]) {
    it(`comes back tracked, ${label}`, () => {
      const { sid, members } = buildLedger();
      const out = exportAll();

      boot(); // new phone
      for (const k of order) importFile(out[k]);

      expect(loan('Home Mortgage').linkedSeriesId).toBe(sid); // the backup's own id is kept
      expectTracked('Home Mortgage', members);
      expect(loan('Car Sim').linkedSeriesId).toBeNull();
      // Exactly one armed generator survives the restore.
      expect(S().getState().transactions.filter(t => t.recurrence && t.recurrence.nextDate)).toHaveLength(1);
    });
  }

  for (const [label, order] of [['transactions first', EXPORT_ORDER], ['loans first', REVERSE_ORDER]]) {
    it(`an old loans file without LinkedSeriesId relinks by the payment note, ${label}`, () => {
      const { members } = buildLedger();
      const out = exportAll();
      out.loans = stripLinkColumn(out.loans);
      expect(out.loans.split('\n')[0]).not.toMatch(/LinkedSeriesId/);

      boot();
      for (const k of order) importFile(out[k]);
      expectTracked('Home Mortgage', members);
      expect(loan('Car Sim').linkedSeriesId).toBeNull();
    });
  }

  it('the note fallback matches a note written in another language (fr)', () => {
    const { members } = buildLedger({ note: 'Home Mortgage — échéance de prêt' });
    const out = exportAll();
    out.loans = stripLinkColumn(out.loans);

    boot(); // the new phone is in English
    for (const k of REVERSE_ORDER) importFile(out[k]);
    expectTracked('Home Mortgage', members);
  });

  it('a loan name containing "$&" still matches its note', () => {
    const name = 'Save $& Spend';
    const { members } = buildLedger({ name });
    const out = exportAll();
    out.loans = stripLinkColumn(out.loans);

    boot();
    for (const k of EXPORT_ORDER) importFile(out[k]);
    expectTracked(name, members);
  });

  it('never links a sim, even when a series carries its note', () => {
    buildLedger();
    S().dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 300, accountId: S().getState().accounts[0].id, categoryId: 'cat_debt',
      date: '2026-11-05', comment: 'Car Sim — loan payment',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-10-05' }
    });
    const out = exportAll();
    out.loans = stripLinkColumn(out.loans);

    boot();
    for (const k of EXPORT_ORDER) importFile(out[k]);
    expect(loan('Car Sim').linkedSeriesId).toBeNull();
  });

  it('never takes the series another loan in the same file names', () => {
    const { sid, members } = buildLedger();
    const out = exportAll();
    // A second, unlinked row with the same name (e.g. a loan the user added
    // again): it must not steal the series the first row names.
    const lines = out.loans.split('\n');
    const dupe = lines.find(l => l.startsWith('Home Mortgage,')).replace(/,[^,"]*$/, ',');
    out.loans = [...lines, dupe].join('\n');

    boot();
    for (const k of REVERSE_ORDER) importFile(out[k]); // loans first: the first row's link dangles until the transactions arrive
    const both = loansNamed('Home Mortgage');
    expect(both).toHaveLength(2);
    expect(both.filter(l => l.linkedSeriesId === sid)).toHaveLength(1);
    expect(both.filter(l => l.linkedSeriesId === null)).toHaveLength(1);
    expectTracked('Home Mortgage', members);
  });

  it('never takes a live series already linked to another loan', () => {
    buildLedger();
    const ownedSid = loan('Home Mortgage').linkedSeriesId;
    S().dispatch('ADD_LOAN', { name: 'Home Mortgage', kind: 'active', config: { ...MORTGAGE } });
    S().dispatch('RELINK_LOAN_SERIES');
    const both = loansNamed('Home Mortgage');
    expect(both.map(l => l.linkedSeriesId).sort()).toEqual([null, ownedSid].sort());
  });

  it('a dangling LinkedSeriesId is not overwritten by a local series with the same note', () => {
    const { sid, members } = buildLedger();
    const out = exportAll();

    boot();
    // The new phone already holds a same-note series (e.g. typed by hand).
    S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 5000, openingDate: '2026-01-01' });
    S().dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 969.36, accountId: S().getState().accounts[0].id, categoryId: 'cat_debt',
      date: '2026-12-01', comment: 'Home Mortgage — loan payment',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-05-01' }
    });
    const localSid = seriesIds()[0];
    expect(localSid).not.toBe(sid);

    importFile(out.loans); // link dangles: transactions not imported yet
    expect(loan('Home Mortgage').linkedSeriesId).toBe(sid);
    importFile(out.transactions);
    expect(loan('Home Mortgage').linkedSeriesId).toBe(sid);
    expect(S().getLoanLinkedTransactions(loan('Home Mortgage'))).toHaveLength(members);
  });

  it('several matching series (an already double-tracked backup) → the earliest one', () => {
    buildLedger();
    // A second, later series with the same note — what re-tracking after a
    // 1.0 restore produced.
    S().dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 969.36, accountId: S().getState().accounts[0].id, categoryId: 'cat_debt',
      date: '2026-12-01', comment: 'Home Mortgage — loan payment',
      recurrence: { interval: 1, frequency: 'months', endDate: '2031-10-01' }
    });
    const out = exportAll();
    out.loans = stripLinkColumn(out.loans);

    boot();
    for (const k of EXPORT_ORDER) importFile(out[k]);
    const linked = S().getLoanLinkedTransactions(loan('Home Mortgage'));
    expect(linked[0].recurrence.startDate).toBe('2026-11-01');
    expect(linked.every(t => t.recurrence.seriesId === linked[0].recurrence.seriesId)).toBe(true);
  });
});

describe('1.0.1 (BUG-02) series ids on import', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps the CSV series id when this install has no series by that id', () => {
    const { sid } = buildLedger();
    const tx = exportAll().transactions;
    boot();
    importFile(tx);
    expect(seriesIds()).toEqual([sid]);
  });

  it('re-keys the series on a collision (re-import into the same install)', () => {
    const { sid, members } = buildLedger();
    const tx = exportAll().transactions;
    importFile(tx);
    const ids = seriesIds();
    expect(ids).toHaveLength(2);
    expect(ids).toContain(sid);
    // The loan keeps its own series; the re-imported copy is a separate one.
    expect(S().getLoanLinkedTransactions(loan('Home Mortgage'))).toHaveLength(members);
  });

  it('RELINK_LOAN_SERIES with nothing to link does not touch the loans', () => {
    buildLedger();
    const before = JSON.stringify(S().getState().loans);
    S().dispatch('RELINK_LOAN_SERIES');
    expect(JSON.stringify(S().getState().loans)).toBe(before);
  });
});
