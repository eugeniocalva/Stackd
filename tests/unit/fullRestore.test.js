import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.19 (A-17): a backup must restore onto a NEW phone.
//
// Measured before this fix, with this very scenario: every account came back
// without its opening balance (960 -> -40), a USD account came back as EUR,
// account type/icon/colour and custom category icons were lost, and the
// accounts and categories files were routed into the bank column-mapping flow.
// The older csvRoundTrip suite never saw it: it restores into the SAME store
// and keeps the accounts. Every case here boots a second, empty install and
// feeds the files through the real single "Import CSV" router (importCSV).
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
// 1.0.1 (BUG-02): ids are unique ACROSS boots. A restore now keeps the
// backup's series ids, so a counter restarting at uuid-1 on the "new phone"
// could mint an id equal to one kept from the old install and merge two
// unrelated series (a false pass or a false failure).
let bootNo = 0;
const boot = (currency = 'EUR') => {
  let uid = 0;
  const prefix = 'b' + (++bootNo) + '-uuid-';
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  // importCSV reads the file through FileReader; hand it the text directly.
  global.FileReader = class {
    readAsText(file) { this.onload({ target: { result: file.text } }); }
  };
  // 1.0.1 (BUG-02): loan-engine.js before store.js, as in index.html, so a
  // loans import is validated by the engine and getLoanProgress can run.
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', currency);
};

const S = () => window.Store;
const acc = (name) => S().getState().accounts.find(a => a.name === name);
const cat = (name) => S().getState().categories.find(c => c.name === name);

// The real router, synchronously (the FileReader above calls back at once).
const importFile = (csv) => {
  let out;
  window.StackdImport.importCSV({ text: csv }, S().getState(),
    (result) => { out = result; },
    (err) => { throw err; });
  return out;
};

const EXPORTS = ['accounts', 'categories', 'transactions', 'loans', 'budgets', 'rules'];
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

// A realistic ledger: two currencies, a card that opens in DEBT, custom
// looks, a custom category with a non-default kind, a budget and a rule.
const buildLedger = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', type: 'Bank', icon: 'landmark', color: '#123456', openingBalance: 1000, openingDate: '2026-01-01' });
  S().dispatch('ADD_ACCOUNT', { name: 'US Card', type: 'Card', icon: 'credit-card', color: '#abcdef', currency: 'USD', openingBalance: -500, openingDate: '2026-01-15' });
  S().dispatch('ADD_CATEGORY', { name: 'Hobbies', icon: 'guitar', typeHint: 'expense' });
  S().dispatch('ADD_CATEGORY', { name: 'Side gigs', icon: 'briefcase', typeHint: 'income' });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: acc('Main Bank').id, categoryId: 'cat_groceries', date: '2026-02-03' });
  S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 120, accountId: acc('Main Bank').id, categoryId: cat('Side gigs').id, date: '2026-02-10' });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 15, accountId: acc('US Card').id, categoryId: cat('Hobbies').id, date: '2026-02-04' });
  // Before the card's opening date: must stay OUT of its balance after restore too.
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 999, accountId: acc('US Card').id, categoryId: cat('Hobbies').id, date: '2026-01-02' });
  S().dispatch('SAVE_BUDGET', { categoryId: cat('Hobbies').id, amount: 60, startDate: '2026-01', endDate: null, isCumulative: true });
  S().dispatch('ADD_IMPORT_RULE', { match: 'guitar shop', categoryId: cat('Hobbies').id });
};

// Everything a user would notice, keyed by name so ids can differ.
const snapshot = () => {
  const st = S().getState();
  const catName = (id) => (st.categories.find(c => c.id === id) || {}).name;
  const accounts = {};
  for (const a of st.accounts) {
    const ob = st.transactions.filter(t => t.accountId === a.id && t.type === 'opening_balance');
    accounts[a.name] = {
      balance: S().getAccountBalance(a.id), currency: a.currency, type: a.type, icon: a.icon, color: a.color,
      openingBalances: ob.map(t => [t.amount, t.date])
    };
  }
  const categories = {};
  for (const c of st.categories.filter(c => !c.isDefault)) categories[c.name] = { icon: c.icon, typeHint: c.typeHint };
  return {
    accounts,
    categories,
    budgets: st.budgets.filter(b => b.amount > 0)
      .map(b => ({ category: catName(b.categoryId), amount: b.amount, startDate: b.startDate, isCumulative: b.isCumulative })),
    rules: st.importRules.map(r => ({ match: r.match, category: catName(r.categoryId) })),
    expenses: st.transactions.filter(t => t.type !== 'opening_balance').length
  };
};

describe('Full restore onto a new phone (v1.19, A-17)', () => {
  beforeEach(() => boot());

  it('every file, in export order, brings back the same ledger', () => {
    buildLedger();
    const before = snapshot();
    expect(before.accounts['Main Bank'].balance).toBe(1080);
    expect(before.accounts['US Card'].balance).toBe(-515);
    const out = exportAll();

    boot(); // new phone, EUR primary
    const kinds = EXPORTS.map(k => importFile(out[k]).kind);
    expect(kinds).toEqual(['accounts', 'categories', 'transactions', 'loans', 'budgets', 'rules']);
    expect(snapshot()).toEqual(before);
  });

  it('lands in the same state whatever order the files are imported in', () => {
    buildLedger();
    const before = snapshot();
    const out = exportAll();

    boot();
    // Worst case: the transactions file first, so it re-creates the accounts
    // and categories with defaults, and the files that fix them come last.
    for (const k of ['transactions', 'rules', 'budgets', 'loans', 'categories', 'accounts']) importFile(out[k]);
    expect(snapshot()).toEqual(before);
  });

  it('the transactions file on its own restores every balance and currency', () => {
    buildLedger();
    const before = snapshot();
    const tx = exportAll().transactions;

    boot();
    const result = importFile(tx);
    expect(result.kind).toBe('transactions');
    const after = snapshot();
    for (const name of ['Main Bank', 'US Card']) {
      expect(after.accounts[name].balance).toBe(before.accounts[name].balance);
      expect(after.accounts[name].currency).toBe(before.accounts[name].currency);
      expect(after.accounts[name].openingBalances).toEqual(before.accounts[name].openingBalances);
    }
    // Known and accepted: looks live in the accounts file, not this one.
    expect(after.accounts['US Card'].type).toBe('Account');
  });

  it('re-importing into the SAME phone does not add a second opening balance', () => {
    buildLedger();
    const tx = exportAll().transactions;
    const result = importFile(tx);
    expect(result.skipped['opening balance rows are owned by the account']).toBe(2);
    for (const name of ['Main Bank', 'US Card']) {
      const obs = S().getState().transactions.filter(t => t.accountId === acc(name).id && t.type === 'opening_balance');
      expect(obs).toHaveLength(1);
    }
  });

  it('empty exports (no loans, no rules, no budgets) import as zero instead of failing', () => {
    const out = exportAll(); // a brand-new install has none of these
    boot();
    for (const k of ['loans', 'rules', 'budgets']) {
      expect(out[k].split('\n').filter(l => l.trim()).length).toBe(1);
      expect(importFile(out[k])).toMatchObject({ kind: k, importedCount: 0 });
    }
  });

  it('still reads an accounts file from before v1.19', () => {
    boot();
    const old = [
      'id,name,opening_balance,created_at,currency',
      'x1,Old Savings,2500,2025-11-20T09:12:00.000Z,GBP'
    ].join('\n');
    expect(importFile(old)).toMatchObject({ kind: 'accounts', importedCount: 1 });
    const a = acc('Old Savings');
    expect(a.currency).toBe('GBP');
    expect(S().getAccountBalance(a.id)).toBe(2500);
    const ob = S().getState().transactions.find(t => t.accountId === a.id && t.type === 'opening_balance');
    expect(ob.date).toBe('2025-11-20'); // created_at stands in for the missing opening date
  });

  it('accounts and categories files no longer open the bank column-mapping flow', () => {
    buildLedger();
    const out = exportAll();
    boot();
    expect(importFile(out.accounts).kind).toBe('accounts');
    expect(importFile(out.categories).kind).toBe('categories');
  });
});

describe('UPDATE_CATEGORY saves the kind (v1.19)', () => {
  beforeEach(() => boot());

  it('keeps the income/expense/both choice the category editor sends', () => {
    S().dispatch('ADD_CATEGORY', { name: 'Tips', icon: 'coins', typeHint: 'both' });
    S().dispatch('UPDATE_CATEGORY', { id: cat('Tips').id, name: 'Tips', icon: 'coins', typeHint: 'income' });
    expect(cat('Tips').typeHint).toBe('income');
  });

  it('ignores a value that is not a kind', () => {
    S().dispatch('ADD_CATEGORY', { name: 'Tips', icon: 'coins', typeHint: 'expense' });
    S().dispatch('UPDATE_CATEGORY', { id: cat('Tips').id, typeHint: 'nonsense' });
    expect(cat('Tips').typeHint).toBe('expense');
  });
});
