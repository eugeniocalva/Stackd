import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.19: budgets in the CSV backup (export.js exportBudgets, import.js
// isBudgetRows / buildBudgets). Before this, a restore silently dropped every
// budget: the slice was neither exported nor importable, while the store
// listing and the website both called a backup "a full restore".
//
// The round-trip cases restore onto a FRESH install (a second boot), not back
// into the same store — that is the case a backup exists for, and the one the
// older csvRoundTrip suite never exercised.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
const boot = () => {
  let uid = 0;
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  global.window.Store.init();
};

const S = () => window.Store;
const I = () => window.StackdImport;
const catByName = (name) => S().getState().categories.find(c => c.name === name);
const liveBudgets = () => S().getState().budgets.filter(b => (parseFloat(b.amount) || 0) > 0);
const exportBudgetsCsv = () => { window.StackdExport.exportBudgets(S().getState()); return files['stackd_budgets.csv']; };
const restore = (csv) => I().buildBudgets(I().parseCSV(csv));

describe('Budgets in the CSV backup (v1.19)', () => {
  beforeEach(boot);

  describe('export', () => {
    it('writes the category by name, the amount, both months and the cumulative flag', () => {
      S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 300, startDate: '2026-01', endDate: '2026-12', isCumulative: true });
      const groceries = S().getState().categories.find(c => c.id === 'cat_groceries').name;
      const lines = exportBudgetsCsv().split('\n');
      expect(lines[0]).toBe('Category,Amount,StartMonth,EndMonth,Cumulative,Limits'); // 1.0.3 (BUG-140)
      expect(lines[1]).toBe(`${groceries},300,2026-01,2026-12,true,`);
    });

    it('quotes a category name that contains the delimiter', () => {
      S().dispatch('ADD_CATEGORY', { name: 'Food, drinks', icon: 'utensils', typeHint: 'expense' });
      S().dispatch('SAVE_BUDGET', { categoryId: catByName('Food, drinks').id, amount: 80, startDate: '2026-02', endDate: null, isCumulative: false });
      expect(exportBudgetsCsv().split('\n')[1]).toBe('"Food, drinks",80,2026-02,,false,');
    });

    it('skips a deleted budget (the amount-0 tombstone) and a budget whose category is gone', () => {
      S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 300, startDate: '2026-01', endDate: null, isCumulative: false });
      S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 0, startDate: '', endDate: null, isCumulative: false }); // the UI's delete
      S().state.budgets.push({ id: 'orphan', categoryId: 'cat_does_not_exist', amount: 50, startDate: '2026-01', endDate: null, isCumulative: false });
      expect(exportBudgetsCsv().split('\n')).toEqual(['Category,Amount,StartMonth,EndMonth,Cumulative,Limits']);
    });
  });

  describe('restore onto a fresh install', () => {
    it('brings every budget back, with the same monthly figures', () => {
      S().dispatch('ADD_CATEGORY', { name: 'Hobbies', icon: 'guitar', typeHint: 'expense' });
      S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 300, startDate: '2026-01', endDate: null, isCumulative: true });
      S().dispatch('SAVE_BUDGET', { categoryId: catByName('Hobbies').id, amount: 45.5, startDate: '2026-03', endDate: '2026-08', isCumulative: false });
      const groceriesName = S().getState().categories.find(c => c.id === 'cat_groceries').name;
      const csv = exportBudgetsCsv();

      boot(); // phone B
      const stats = restore(csv);

      expect(stats).toMatchObject({ importedCount: 2, skippedCount: 0 });
      expect(liveBudgets()).toHaveLength(2);
      const g = S().getState().budgets.find(b => b.categoryId === catByName(groceriesName).id);
      expect(g).toMatchObject({ amount: 300, startDate: '2026-01', endDate: null, isCumulative: true });
      const h = S().getState().budgets.find(b => b.categoryId === catByName('Hobbies').id);
      expect(h).toMatchObject({ amount: 45.5, startDate: '2026-03', endDate: '2026-08', isCumulative: false });
      expect(S().getBudgetForMonth(catByName('Hobbies').id, '2026-05').allocated).toBe(45.5);
      expect(S().getBudgetForMonth(catByName('Hobbies').id, '2026-09').allocated).toBe(0); // past its end month
    });

    it('re-creates a missing category by name and counts it', () => {
      S().dispatch('ADD_CATEGORY', { name: 'Hobbies', icon: 'guitar', typeHint: 'expense' });
      S().dispatch('SAVE_BUDGET', { categoryId: catByName('Hobbies').id, amount: 20, startDate: '2026-01', endDate: null, isCumulative: false });
      const csv = exportBudgetsCsv();

      boot();
      expect(catByName('Hobbies')).toBeUndefined();
      const stats = restore(csv);
      expect(stats.newCategories).toBe(1);
      expect(catByName('Hobbies')).toBeDefined();
      expect(S().getState().budgets.find(b => b.categoryId === catByName('Hobbies').id).amount).toBe(20);
    });

    it('is idempotent: importing the same file twice leaves one budget per category', () => {
      S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 300, startDate: '2026-01', endDate: null, isCumulative: false });
      const csv = exportBudgetsCsv();
      boot();
      restore(csv);
      restore(csv);
      expect(liveBudgets()).toHaveLength(1);
    });
  });

  describe('tolerating a file that went through a spreadsheet', () => {
    const csvWith = (start, end = '', amount = '100') =>
      `Category,Amount,StartMonth,EndMonth,Cumulative\nGroceries,${amount},${start},${end},false`;
    const startOf = () => S().getState().budgets.find(b => b.amount > 0).startDate;

    it('cuts a full date back to its month', () => {
      restore(csvWith('2026-03-01'));
      expect(startOf()).toBe('2026-03');
    });

    it('reads a day-first date', () => {
      restore(csvWith('01/03/2026'));
      expect(startOf()).toBe('2026-03');
    });

    it('pads a single-digit month', () => {
      restore(csvWith('2026-3'));
      expect(startOf()).toBe('2026-03');
    });

    it('reads a comma decimal in a semicolon file', () => {
      restore('Category;Amount;StartMonth;EndMonth;Cumulative\nGroceries;300,5;2026-01;;true');
      const b = S().getState().budgets.find(x => x.amount > 0);
      expect(b.amount).toBe(300.5);
      expect(b.isCumulative).toBe(true);
    });

    // 1.0.2 (BUG-31): parseFloat('1.200,50'.replace(',', '.')) read 1.2.
    it("reads grouped thousands with a decimal comma ('1.200,50')", () => {
      const stats = restore('Category;Amount;StartMonth;EndMonth;Cumulative\nGroceries;1.200,50;2026-01;;false');
      expect(stats.importedCount).toBe(1);
      expect(S().getState().budgets.find(x => x.amount > 0).amount).toBe(1200.5);
    });

    it('skips unreadable rows and says why, without dropping the good ones', () => {
      const csv = [
        'Category,Amount,StartMonth,EndMonth,Cumulative',
        'Groceries,100,2026-01,,false',
        'Rent,abc,2026-01,,false',
        'Transport,0,2026-01,,false',
        'Fuel,50,March,,false',
        'Gifts,50,2026-13,,false',
        'Travel,50,2026-06,2026-02,false',
        ',50,2026-01,,false'
      ].join('\n');
      const stats = restore(csv);
      expect(stats.importedCount).toBe(1);
      expect(stats.skipped).toEqual({
        'invalid amount': 2,
        'unreadable month': 2,
        'end month before start month': 1,
        'missing category': 1
      });
    });
  });

  describe('routing: a budgets file is recognised, and nothing else is', () => {
    const rowsOf = (csv) => I().parseCSV(csv);

    it('recognises its own export', () => {
      S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 300, startDate: '2026-01', endDate: null, isCumulative: false });
      const rows = rowsOf(exportBudgetsCsv());
      expect(I().isBudgetRows(rows)).toBe(true);
      // and no earlier route in importCSV claims it first
      expect(I().isLoanRows(rows)).toBe(false);
      expect(I().isRuleRows(rows)).toBe(false);
    });

    it('does not claim a transactions backup, which also has Category, Amount and StartDate', () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
      S().dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 12, accountId: S().getState().accounts[0].id,
        categoryId: 'cat_groceries', date: '2026-02-03'
      });
      window.StackdExport.exportTransactions(S().getState());
      expect(I().isBudgetRows(rowsOf(files['stackd_transactions.csv']))).toBe(false);
    });

    it('does not claim an import-rules file or a bank statement', () => {
      expect(I().isBudgetRows(rowsOf('Match,Category\ncoffee,Groceries'))).toBe(false);
      expect(I().isBudgetRows(rowsOf('Date,Description,Amount\n2026-02-03,Shop,-12.00'))).toBe(false);
    });
  });
});
