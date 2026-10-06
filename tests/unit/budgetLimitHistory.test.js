import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.3 (BUG-140, D3) A budget keeps a limit HISTORY. Changing the limit used
// to overwrite the one `amount`, and getBudgetForMonth read that one figure
// for the month AND for every past month of the cumulative carry: raising
// €300 to €400 in October rewrote July–September to €400 and October's carry
// from +€4.65 to +€304.65. A changed limit now applies from the month viewed
// in Goals (`effectiveFrom`) onward; earlier months keep theirs. `amount`
// stays the newest limit (deleted marker 0, export filter, Remove), and
// `limits` [{from:'', amount}, {from:'YYYY-MM', amount}...] is stored only
// with two or more entries. CSV: a 6th `Limits` column (JSON).
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
const boot = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); // 15 Oct 2026
  let uid = 0;
  const mem = {};
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; }
    }
  };
  global.localStorage = global.window.localStorage;
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  global.window.Store.init();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2020-01-01' });
};

const S = () => window.Store;
const I = () => window.StackdImport;
const acc = () => S().getState().accounts[0].id;
const rec = (cat = 'cat_groceries') => S().getState().budgets.find(b => b.categoryId === cat);
const month = (ym, cat = 'cat_groceries') => S().getBudgetForMonth(cat, ym);
const spend = (amount, date, cat = 'cat_groceries') =>
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount, accountId: acc(), categoryId: cat, date });
const save = (payload) => S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', startDate: '', endDate: null, isCumulative: false, ...payload });

// The report's figures: €300/month cumulative from July, €895.35 spent over
// July–September, so October carries +€4.65.
const reportBudget = () => {
  save({ amount: 300, startDate: '2026-07', isCumulative: true });
  spend(300, '2026-07-10');
  spend(300, '2026-08-10');
  spend(295.35, '2026-09-10');
};

describe('Budget limit history (1.0.3 BUG-140)', () => {
  beforeEach(boot);
  afterEach(() => { vi.useRealTimers(); });

  it('raising a cumulative €300 to €400 from October keeps July–September at €300 (report figures)', () => {
    reportBudget();
    expect(month('2026-10').finalLimit).toBeCloseTo(304.65, 2);
    save({ amount: 400, startDate: '2026-07', isCumulative: true, effectiveFrom: '2026-10' });
    const oct = month('2026-10');
    expect(oct.allocated).toBe(400);
    expect(oct.carryover).toBeCloseTo(4.65, 2);
    expect(oct.finalLimit).toBeCloseTo(404.65, 2);
    expect(month('2026-07')).toMatchObject({ allocated: 300, finalLimit: 300 });
    expect(month('2026-09').allocated).toBe(300);
    expect(month('2026-11').allocated).toBe(400);
    expect(rec().amount).toBe(400); // the newest limit
    expect(rec().limits).toEqual([{ from: '', amount: 300 }, { from: '2026-10', amount: 400 }]);
  });

  it('lowering it to €200 from October gives €204.65', () => {
    reportBudget();
    save({ amount: 200, startDate: '2026-07', isCumulative: true, effectiveFrom: '2026-10' });
    expect(month('2026-10').finalLimit).toBeCloseTo(204.65, 2);
    expect(month('2026-08').allocated).toBe(300);
  });

  it('a non-cumulative budget keeps its past months too', () => {
    save({ amount: 300 });
    save({ amount: 400, effectiveFrom: '2026-10' });
    expect(month('2026-07').allocated).toBe(300);
    expect(month('2026-09').finalLimit).toBe(300);
    expect(month('2026-10').allocated).toBe(400);
  });

  it('an old record (no limits) and a save without effectiveFrom read exactly as before', () => {
    S().state.budgets.push({ id: 'old', categoryId: 'cat_transport', amount: 50, startDate: '2026-08', endDate: null, isCumulative: true });
    spend(20, '2026-08-05', 'cat_transport');
    expect(month('2026-10', 'cat_transport')).toMatchObject({ allocated: 50, finalLimit: 50 + 30 + 50 });
    save({ amount: 300 });
    save({ amount: 400 }); // old callers: flat
    expect(rec().limits).toBeUndefined();
    expect(month('2026-07').allocated).toBe(400);
  });

  it('a change made at (or before) the start month rewrites every month', () => {
    reportBudget();
    save({ amount: 400, startDate: '2026-07', isCumulative: true, effectiveFrom: '2026-10' });
    save({ amount: 350, startDate: '2026-07', isCumulative: true, effectiveFrom: '2026-07' });
    expect(rec().limits).toBeUndefined();
    expect(rec().amount).toBe(350);
    expect(month('2026-07').allocated).toBe(350);
    expect(month('2026-10').allocated).toBe(350);
    save({ amount: 360, startDate: '2026-07', isCumulative: true, effectiveFrom: '2026-05' });
    expect(rec().limits).toBeUndefined();
    expect(month('2026-08').allocated).toBe(360);
  });

  it('a later change replaces the limits after it; an earlier one is kept', () => {
    save({ amount: 300 });
    save({ amount: 400, effectiveFrom: '2026-10' });
    save({ amount: 450, effectiveFrom: '2026-12' });
    expect(rec().limits).toEqual([{ from: '', amount: 300 }, { from: '2026-10', amount: 400 }, { from: '2026-12', amount: 450 }]);
    save({ amount: 380, effectiveFrom: '2026-11' }); // drops December's
    expect(rec().limits).toEqual([{ from: '', amount: 300 }, { from: '2026-10', amount: 400 }, { from: '2026-11', amount: 380 }]);
    expect(rec().amount).toBe(380);
    expect(month('2027-02').allocated).toBe(380);
    save({ amount: 300, effectiveFrom: '2026-10' }); // back to the base: one flat limit again
    expect(rec().limits).toBeUndefined();
    expect(rec().amount).toBe(300);
  });

  it('saving the same amount (months or the rollover switch edited) keeps the history and the newest limit', () => {
    save({ amount: 300 });
    save({ amount: 400, effectiveFrom: '2026-10' });
    // Viewing September, the editor shows €300; only the switch changes.
    save({ amount: 300, isCumulative: true, startDate: '2026-06', effectiveFrom: '2026-09' });
    expect(rec()).toMatchObject({ amount: 400, isCumulative: true, startDate: '2026-06' });
    expect(rec().limits).toEqual([{ from: '', amount: 300 }, { from: '2026-10', amount: 400 }]);
    expect(month('2026-09').allocated).toBe(300);
    expect(month('2026-10').allocated).toBe(400);
  });

  it('Remove (amount 0) clears the history; a re-created budget starts flat', () => {
    save({ amount: 300 });
    save({ amount: 400, effectiveFrom: '2026-10' });
    save({ amount: 0, effectiveFrom: '2026-10' });
    expect(rec().amount).toBe(0);
    expect(rec().limits).toBeUndefined();
    expect(month('2026-07').allocated).toBe(0);
    save({ amount: 120, effectiveFrom: '2026-10' });
    expect(rec().limits).toBeUndefined();
    expect(month('2026-07').allocated).toBe(120);
  });

  it('a limits list (CSV restore) is normalized: bad entries dropped, same month last wins, sorted, neighbours merged', () => {
    save({
      amount: 999,
      limits: [
        { from: '2026-10', amount: 400 },
        { from: 'bad', amount: 5 },
        { from: '2026-02', amount: 300 },
        { from: '2026-11', amount: -1 },
        { from: '2026-12', amount: 'x' },
        { from: '2027-01', amount: 450 },
        { from: '2026-10', amount: 450 },
        { from: '2026-13', amount: 70 },
        null
      ]
    });
    // '2026-02' is the earliest entry, so it becomes the base (from '');
    // October and January now both read 450 and merge.
    expect(rec().limits).toEqual([{ from: '', amount: 300 }, { from: '2026-10', amount: 450 }]);
    expect(rec().amount).toBe(450);

    save({ amount: 80, limits: [{ from: '', amount: 80 }, { from: '2026-10', amount: 80 }] });
    expect(rec().limits).toBeUndefined();
    expect(rec().amount).toBe(80);

    save({ amount: 90, limits: [] }); // nothing usable: flat amount
    expect(rec().limits).toBeUndefined();
    expect(rec().amount).toBe(90);
  });

  it('_budgetAmountFor reads the limit in force for a month and 0 for a deleted budget', () => {
    const b = { amount: 450, limits: [{ from: '', amount: 300 }, { from: '2026-10', amount: 400 }, { from: '2027-01', amount: 450 }] };
    expect(S()._budgetAmountFor(b, '2026-01')).toBe(300);
    expect(S()._budgetAmountFor(b, '2026-10')).toBe(400);
    expect(S()._budgetAmountFor(b, '2026-12')).toBe(400);
    expect(S()._budgetAmountFor(b, '2027-05')).toBe(450);
    expect(S()._budgetAmountFor({ ...b, amount: 0 }, '2027-05')).toBe(0);
    expect(S()._budgetAmountFor({ amount: '25.5' }, '2027-05')).toBe(25.5);
  });
});

describe('Budget limits in the CSV backup (1.0.3 BUG-140)', () => {
  beforeEach(boot);
  afterEach(() => { vi.useRealTimers(); });

  const exportCsv = () => { window.StackdExport.exportBudgets(S().getState()); return files['stackd_budgets.csv']; };
  const restore = (csv) => I().buildBudgets(I().parseCSV(csv));
  const groceriesName = () => S().getState().categories.find(c => c.id === 'cat_groceries').name;
  const groceriesRec = () => S().getState().budgets.find(b => {
    const c = S().getState().categories.find(x => x.id === b.categoryId);
    return c && c.name === groceriesName();
  });

  it('exports a Limits column: JSON for a history, empty for a flat budget', () => {
    save({ amount: 300, startDate: '2026-07', isCumulative: true });
    save({ amount: 400, startDate: '2026-07', isCumulative: true, effectiveFrom: '2026-10' });
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_transport', amount: 50, startDate: '', endDate: null, isCumulative: false });
    const lines = exportCsv().split('\n');
    expect(lines[0]).toBe('Category,Amount,StartMonth,EndMonth,Cumulative,Limits');
    expect(lines[1]).toBe(`${groceriesName()},400,2026-07,,true,"[{""from"":"""",""amount"":300},{""from"":""2026-10"",""amount"":400}]"`);
    expect(lines[2]).toMatch(/,50,,,false,$/);
  });

  it('restores the history onto a fresh install with the same monthly figures, and twice is the same', () => {
    reportBudget();
    save({ amount: 400, startDate: '2026-07', isCumulative: true, effectiveFrom: '2026-10' });
    const csv = exportCsv();

    boot(); // phone B
    spend(300, '2026-07-10');
    spend(300, '2026-08-10');
    spend(295.35, '2026-09-10');
    expect(restore(csv)).toMatchObject({ importedCount: 1, skippedCount: 0 });
    expect(groceriesRec()).toMatchObject({ amount: 400, startDate: '2026-07', isCumulative: true });
    expect(groceriesRec().limits).toEqual([{ from: '', amount: 300 }, { from: '2026-10', amount: 400 }]);
    expect(month('2026-10').finalLimit).toBeCloseTo(404.65, 2);
    expect(month('2026-07').allocated).toBe(300);

    restore(csv); // idempotent
    expect(S().getState().budgets.filter(b => b.amount > 0)).toHaveLength(1);
    expect(groceriesRec().limits).toEqual([{ from: '', amount: 300 }, { from: '2026-10', amount: 400 }]);
  });

  it('an old 5-column file restores flat; an unreadable Limits cell falls back to Amount', () => {
    restore('Category,Amount,StartMonth,EndMonth,Cumulative\nGroceries,300,2026-01,,false');
    expect(groceriesRec()).toMatchObject({ amount: 300 });
    expect(groceriesRec().limits).toBeUndefined();

    boot();
    restore('Category,Amount,StartMonth,EndMonth,Cumulative,Limits\nGroceries,250,2026-01,,false,not json');
    expect(groceriesRec().amount).toBe(250);
    expect(groceriesRec().limits).toBeUndefined();

    boot();
    restore('Category,Amount,StartMonth,EndMonth,Cumulative,Limits\nGroceries,250,2026-01,,false,');
    expect(groceriesRec().amount).toBe(250);
    expect(groceriesRec().limits).toBeUndefined();
  });

  it('a budgets export with a Limits column is still recognised as a budgets file', () => {
    save({ amount: 300 });
    save({ amount: 400, effectiveFrom: '2026-10' });
    expect(I().isBudgetRows(I().parseCSV(exportCsv()))).toBe(true);
  });

  // 1.0.3 (BUG-58) a cumulative row with no start month starts this month
  it('a Cumulative=true row with no start month starts in the current month', () => {
    restore('Category,Amount,StartMonth,EndMonth,Cumulative\nGroceries,100,,,true');
    expect(groceriesRec()).toMatchObject({ amount: 100, startDate: '2026-10', isCumulative: true });
    boot();
    restore('Category,Amount,StartMonth,EndMonth,Cumulative\nGroceries,100,,,false');
    expect(groceriesRec().startDate).toBe('');
  });
});
