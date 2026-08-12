import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Same executeFile pattern as store.test.js — src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Captures what StackdExport would have downloaded instead of touching the DOM.
let lastDownload = null;

describe('CSV export/import round-trip (v0.68)', () => {
  beforeEach(() => {
    let uid = 0;
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + (++uid) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('export.js');
    executeFile('import.js');

    lastDownload = null;
    global.window.StackdExport._download = (filename, content) => {
      lastDownload = { filename, content };
    };

    global.window.Store.init();
  });

  const exportCsv = () => {
    window.StackdExport.exportTransactions(window.Store.getState());
    return lastDownload.content;
  };

  describe('_normalizeDate', () => {
    const norm = (v) => window.StackdImport._normalizeDate(v);

    it('passes ISO dates through', () => {
      expect(norm('2026-03-09')).toBe('2026-03-09');
    });

    it('parses the legacy DD-MM-YYYY export format', () => {
      expect(norm('09-03-2026')).toBe('2026-03-09');
      expect(norm('31-12-2025')).toBe('2025-12-31');
    });

    it('flips when the first field cannot be a day', () => {
      expect(norm('03-25-2026')).toBe('2026-03-25');
    });

    it('accepts slash and dot separators, and pads single digits', () => {
      expect(norm('9/3/2026')).toBe('2026-03-09');
      expect(norm('09.03.2026')).toBe('2026-03-09');
    });

    it('strips a time suffix', () => {
      expect(norm('2026-03-09T14:30:00')).toBe('2026-03-09');
    });

    it('rejects garbage and out-of-range values', () => {
      expect(norm('not a date')).toBeNull();
      expect(norm('2026-13-01')).toBeNull();
      expect(norm('2026-01-32')).toBeNull();
      expect(norm('')).toBeNull();
      expect(norm(undefined)).toBeNull();
    });
  });

  it('exports dates as ISO so imported rows compare correctly', () => {
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const account = window.Store.getState().accounts[0];
    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 20, accountId: account.id,
      categoryId: 'cat_groceries', date: '2026-03-09'
    });

    const csv = exportCsv();
    const rows = window.StackdImport.parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]['date']).toBe('2026-03-09');
  });

  it('still imports a legacy DD-MM-YYYY file as ISO', () => {
    const csv = 'Date,Type,Amount,Account,Category,Note\n09-03-2026,expense,20,Wallet,Groceries,Legacy';
    const { transactions, stats } = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    );

    expect(stats.skippedCount).toBe(0);
    expect(transactions[0].date).toBe('2026-03-09');
  });

  it('preserves balance after an export/import round-trip', () => {
    // openingDate matters: transactions dated before it are excluded from balances.
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 100, openingDate: '2019-01-01' });
    const account = window.Store.getState().accounts[0];
    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 30, accountId: account.id,
      categoryId: 'cat_groceries', date: '2020-01-05'
    });
    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'income', amount: 50, accountId: account.id,
      categoryId: 'cat_salary', date: '2020-02-05'
    });

    const before = window.Store.getAccountBalance(account.id);
    expect(before).toBe(120);

    const csv = exportCsv();

    // Wipe the ledger (keep the opening balance) and restore from the CSV.
    window.Store.state.transactions = window.Store.state.transactions
      .filter(t => t.type === 'opening_balance');

    const { transactions } = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    );
    window.Store.dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions });

    expect(window.Store.getAccountBalance(account.id)).toBe(before);
  });

  it('round-trips time, tags and isPaid', () => {
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const account = window.Store.getState().accounts[0];
    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 12.5, accountId: account.id,
      categoryId: 'cat_groceries', date: '2026-03-09',
      time: '08:15:00', tags: ['Coffee', 'Work'], isPaid: false, comment: 'Beans, ground'
    });

    const csv = exportCsv();
    const { transactions } = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    );

    expect(transactions).toHaveLength(1);
    expect(transactions[0].time).toBe('08:15:00');
    expect(transactions[0].tags).toEqual(['coffee', 'work']);
    expect(transactions[0].isPaid).toBe(false);
    expect(transactions[0].comment).toBe('Beans, ground');
    expect(transactions[0].amount).toBe(12.5);
  });

  it('re-pairs transfer legs under a fresh transferRef', () => {
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 500 });
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
    const [a, b] = window.Store.getState().accounts;

    window.Store.dispatch('ADD_TRANSFER', {
      amount: 100, expenseAccountId: a.id, incomeAccountId: b.id, date: '2026-03-09', note: 'Move'
    });

    const csv = exportCsv();
    const originalRef = window.Store.getState().transactions.find(t => t.transferRef).transferRef;

    const { transactions } = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    );

    const refs = transactions.map(t => t.transferRef);
    expect(refs[0]).toBeTruthy();
    expect(refs[0]).toBe(refs[1]);          // still a pair
    expect(refs[0]).not.toBe(originalRef);  // but re-keyed, so a re-import can't collide
  });

  it('drops a transferRef that has no counterpart in the file', () => {
    const csv = [
      'Date,Type,Amount,Account,Category,Note,TransferRef',
      '2026-03-09,expense,100,Wallet,Transfer,Orphan,ref-abc'
    ].join('\n');

    const { transactions } = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    );

    // A lone leg is a normal transaction — keeping the ref would hide it from Analytics.
    expect(transactions[0].transferRef).toBeUndefined();
  });

  it('rebuilds a recurring series with exactly one armed tail', () => {
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 0 });
    const account = window.Store.getState().accounts[0];
    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 9.99, accountId: account.id,
      categoryId: 'cat_groceries', date: '2026-01-01',
      recurrence: { interval: 1, frequency: 'months', endDate: '2026-06-01' }
    });

    const members = window.Store.getState().transactions.filter(t => t.recurrence);
    expect(members.length).toBeGreaterThan(1);
    const originalSeriesId = members[0].recurrence.seriesId;

    const csv = exportCsv();
    const { transactions } = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    );

    const imported = transactions.filter(t => t.recurrence);
    expect(imported).toHaveLength(members.length);

    const seriesIds = new Set(imported.map(t => t.recurrence.seriesId));
    expect(seriesIds.size).toBe(1);
    expect([...seriesIds][0]).not.toBe(originalSeriesId);

    expect(imported[0].recurrence.frequency).toBe('months');
    expect(imported[0].recurrence.interval).toBe(1);
    expect(imported[0].recurrence.endDate).toBe('2026-06-01');

    const armed = imported.filter(t => t.recurrence.nextDate);
    expect(armed).toHaveLength(1);
  });

  it('disarms every armed member but the tail', () => {
    const header = 'Date,Type,Amount,Account,Category,SeriesId,Interval,Frequency,StartDate,EndDate,NextDate';
    const csv = [
      header,
      '2026-01-01,expense,10,Wallet,Groceries,s1,1,months,2026-01-01,2026-06-01,2026-02-01',
      '2026-02-01,expense,10,Wallet,Groceries,s1,1,months,2026-01-01,2026-06-01,2026-03-01',
      '2026-03-01,expense,10,Wallet,Groceries,s1,1,months,2026-01-01,2026-06-01,2026-04-01'
    ].join('\n');

    const { transactions } = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    );

    const armed = transactions.filter(t => t.recurrence && t.recurrence.nextDate);
    expect(armed).toHaveLength(1);
    expect(armed[0].date).toBe('2026-03-01');
    expect(armed[0].recurrence.nextDate).toBe('2026-04-01');
  });

  it("rejects type 'transfer' rows instead of creating a phantom expense", () => {
    const csv = [
      'Date,Type,Amount,Account,Category,Note',
      '2026-03-09,transfer,100,Wallet,Transfer,One-sided'
    ].join('\n');

    const { transactions, stats } = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    );

    expect(transactions).toHaveLength(0);
    expect(stats.importedCount).toBe(0);
    expect(stats.skippedCount).toBe(1);
    expect(Object.keys(stats.skipped)[0]).toMatch(/transfer/i);
  });

  it('skips rows with an unparseable date and reports them', () => {
    const csv = [
      'Date,Type,Amount,Account,Category',
      'yesterday,expense,10,Wallet,Groceries',
      '2026-03-09,expense,10,Wallet,Groceries'
    ].join('\n');

    const { transactions, stats } = window.StackdImport.buildTransactions(
      window.StackdImport.parseCSV(csv)
    );

    expect(transactions).toHaveLength(1);
    expect(stats.skippedCount).toBe(1);
    expect(stats.skipped['unrecognised date format']).toBe(1);
  });

  it('gives auto-created categories a Lucide icon name, not an emoji', () => {
    const csv = [
      'Date,Type,Amount,Account,Category',
      '2026-03-09,expense,10,Wallet,Sailing Club'
    ].join('\n');

    window.StackdImport.buildTransactions(window.StackdImport.parseCSV(csv));

    const category = window.Store.getState().categories.find(c => c.name === 'Sailing Club');
    expect(category).toBeDefined();
    expect(category.icon).toBe('pin');
    expect(category.icon).toMatch(/^[a-z-]+$/);
  });
});
