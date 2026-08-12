import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Same executeFile pattern as store.test.js — src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let lastDownload = null;

// A loan exercising every nested list, so the round-trip has something that
// genuinely cannot be flattened into fixed CSV columns.
const RICH_CONFIG = {
  type: 'mortgage',
  principal: 111000,
  downPayment: 11000,
  duration: 30,
  durationUnit: 'years',
  annualRate: 4.05,
  firstPaymentDate: '2026-09-06',
  amortization: 'french',
  firstInstallmentInterestOnly: true,
  interestOnlyExtendsDuration: false,
  rateChanges: [{ annualRate: 2.05, effectiveFrom: '2042-08-06' }],
  earlyRepayments: [
    { amount: 250, date: '2030-01-06', frequency: 'monthly', endDate: '2032-01-06', mode: 'reducePayment' }
  ],
  additionalExpenses: [{ name: 'Insurance', amount: 12, frequency: 'monthly', date: null }]
};

describe('Loan CSV export/import round-trip (v0.71)', () => {
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
    executeFile('loan-engine.js');
    executeFile('store.js');
    executeFile('export.js');
    executeFile('import.js');

    lastDownload = null;
    global.window.StackdExport._download = (filename, content) => {
      lastDownload = { filename, content };
    };

    global.window.Store.init();
  });

  const exportLoansCsv = () => {
    window.StackdExport.exportLoans(window.Store.getState());
    return lastDownload.content;
  };

  it('round-trips a loan with rate changes, early repayments and extra costs', () => {
    window.Store.dispatch('ADD_LOAN', { name: 'Casa Mia', kind: 'active', config: RICH_CONFIG });
    const csv = exportLoansCsv();
    expect(lastDownload.filename).toBe('stackd_loans.csv');

    // Readable columns are present for spreadsheet users
    expect(csv.split('\n')[0]).toContain('Name');
    expect(csv).toContain('Casa Mia');
    expect(csv).toContain('111000');

    // Re-import into a clean store
    global.window.Store.state.loans = [];
    const rows = window.StackdImport.parseCSV(csv);
    expect(window.StackdImport.isLoanRows(rows)).toBe(true);

    const { loans, stats } = window.StackdImport.buildLoans(rows);
    expect(stats.importedCount).toBe(1);
    expect(stats.skippedCount).toBe(0);
    expect(loans[0].name).toBe('Casa Mia');
    expect(loans[0].kind).toBe('active');
    // the nested lists survive intact — this is what the Config column is for
    expect(loans[0].config).toEqual(RICH_CONFIG);
  });

  it('produces an identical simulation after the round-trip', () => {
    window.Store.dispatch('ADD_LOAN', { name: 'Casa Mia', kind: 'sim', config: RICH_CONFIG });
    const before = window.LoanEngine.simulate({ ...RICH_CONFIG, computeSavings: false });

    const rows = window.StackdImport.parseCSV(exportLoansCsv());
    const { loans } = window.StackdImport.buildLoans(rows);
    const after = window.LoanEngine.simulate({ ...loans[0].config, computeSavings: false });

    expect(after.initialPaymentC).toBe(before.initialPaymentC);
    expect(after.totalInterestC).toBe(before.totalInterestC);
    expect(after.installmentCount).toBe(before.installmentCount);
    expect(after.lastPaymentDate).toBe(before.lastPaymentDate);
    expect(loans[0].kind).toBe('sim'); // simulations stay simulations
  });

  it('rebuilds a loan from flat columns when Config is absent (hand-made sheet)', () => {
    const csv = [
      'Name,Kind,Type,Principal,DownPayment,Duration,DurationUnit,AnnualRate,FirstPaymentDate,Amortization',
      'Prestito Auto,active,personal,10000,0,24,months,4.5,2026-10-01,french'
    ].join('\n');
    const { loans, stats } = window.StackdImport.buildLoans(window.StackdImport.parseCSV(csv));
    expect(stats.importedCount).toBe(1);
    expect(loans[0].config).toEqual({
      type: 'personal', principal: 10000, downPayment: 0, duration: 24,
      durationUnit: 'months', annualRate: 4.5, firstPaymentDate: '2026-10-01',
      amortization: 'french'
    });
    // and it simulates to the figure the app shows elsewhere for this loan
    expect(window.LoanEngine.simulate(loans[0].config).initialPaymentC).toBe(43648);
  });

  it('accepts the legacy DD-MM-YYYY date form in flat columns', () => {
    const csv = [
      'Name,Principal,Duration,DurationUnit,AnnualRate,FirstPaymentDate',
      'Vecchio,5000,12,months,3,01-10-2026'
    ].join('\n');
    const { loans } = window.StackdImport.buildLoans(window.StackdImport.parseCSV(csv));
    expect(loans[0].config.firstPaymentDate).toBe('2026-10-01');
  });

  it('rejects rows the engine cannot simulate, with a reason', () => {
    const csv = [
      'Name,Kind,Principal,Duration,DurationUnit,AnnualRate,FirstPaymentDate,Config',
      // negative principal, supplied via Config so it bypasses the flat fallback
      'Rotto,active,-5,12,months,3,2026-10-01,"{""principal"":-5,""duration"":12,""durationUnit"":""months"",""annualRate"":3,""firstPaymentDate"":""2026-10-01""}"',
      'Buono,active,5000,12,months,3,2026-10-01,'
    ].join('\n');
    const { loans, stats } = window.StackdImport.buildLoans(window.StackdImport.parseCSV(csv));
    expect(stats.importedCount).toBe(1);
    expect(stats.skippedCount).toBe(1);
    expect(Object.keys(stats.skipped)[0]).toMatch(/principal/i);
    expect(loans[0].name).toBe('Buono');
  });

  it('skips flat rows missing the essentials', () => {
    const csv = [
      'Name,Principal,Duration,DurationUnit,AnnualRate,FirstPaymentDate',
      'Senza data,5000,12,months,3,',
      'Senza importo,,12,months,3,2026-10-01'
    ].join('\n');
    const { loans, stats } = window.StackdImport.buildLoans(window.StackdImport.parseCSV(csv));
    expect(loans).toHaveLength(0);
    expect(stats.skippedCount).toBe(2);
  });

  it('does not mistake a transactions export for a loans file', () => {
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 100 });
    const account = window.Store.getState().accounts[0];
    window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 25, accountId: account.id,
      categoryId: 'cat_groceries', date: '2026-03-09'
    });
    window.StackdExport.exportTransactions(window.Store.getState());
    const txRows = window.StackdImport.parseCSV(lastDownload.content);
    expect(window.StackdImport.isLoanRows(txRows)).toBe(false);

    // ...and the loans export is not mistaken for transactions
    window.Store.dispatch('ADD_LOAN', { name: 'Casa', kind: 'active', config: RICH_CONFIG });
    const loanRows = window.StackdImport.parseCSV(exportLoansCsv());
    expect(window.StackdImport.isLoanRows(loanRows)).toBe(true);
  });

  it('exports every loan, simulations included, and survives a comma in the name', () => {
    window.Store.dispatch('ADD_LOAN', { name: 'Casa, Milano', kind: 'sim', config: RICH_CONFIG });
    window.Store.dispatch('ADD_LOAN', {
      name: 'Auto', kind: 'active',
      config: { principal: 9000, duration: 36, durationUnit: 'months', annualRate: 5, firstPaymentDate: '2026-01-15' }
    });
    const rows = window.StackdImport.parseCSV(exportLoansCsv());
    expect(rows).toHaveLength(2);
    const { loans } = window.StackdImport.buildLoans(rows);
    expect(loans.map(l => l.name)).toEqual(['Casa, Milano', 'Auto']);
    expect(loans.map(l => l.kind)).toEqual(['sim', 'active']);
  });
});
