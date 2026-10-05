import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-24): a loan restored from files whose series id is NOT a safe id
// (a hand-made 'rent 2026', or one 1.0.1 kept verbatim) must still come back
// tracked, in either file order. SeriesId and LinkedSeriesId go through the
// same Store.fileId map, so both files meet on one stable safe id. The
// payment note is deliberately NOT the debt.paymentNote, so the note
// fallback cannot be what links it.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let files;
let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'b' + (++bootNo) + '-uuid-';
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', 'EUR');
};
const S = () => window.Store;
const importFile = (csv) => {
  let out;
  window.StackdImport.importCSV({ text: csv }, S().getState(), (r) => { out = r; }, (e) => { throw e; });
  return out;
};
const MORTGAGE = { type: 'mortgage', principal: 200000, downPayment: 0, duration: 5, durationUnit: 'years',
  annualRate: 3, firstPaymentDate: '2026-11-01', amortization: 'french' };
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

const buildAndExport = (sid) => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 5000, openingDate: '2026-01-01' });
  S().dispatch('ADD_LOAN', { name: 'Home', kind: 'active', config: { ...MORTGAGE } });
  const l = S().getState().loans.find(x => x.name === 'Home');
  S().dispatch('SET_PENDING_LOAN_LINK', { loanId: l.id, seriesId: sid });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 969.36, accountId: S().getState().accounts[0].id,
    categoryId: 'cat_debt', date: '2026-11-01', comment: 'my own note',
    recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2031-10-01' } });
  expect(S().getState().loans.find(x => x.name === 'Home').linkedSeriesId).toBe(sid);
  const st = S().getState();
  window.StackdExport.exportAccounts(st); window.StackdExport.exportTransactions(st); window.StackdExport.exportLoans(st);
  return { accounts: files['stackd_accounts.csv'], transactions: files['stackd_transactions.csv'], loans: files['stackd_loans.csv'] };
};

describe('1.0.2 (BUG-24) unsafe series ids keep the loan link on restore', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0)); });
  afterEach(() => { vi.useRealTimers(); });

  for (const sid of ['rent 2026', 's1"><x-xss>']) {
    for (const order of [['accounts', 'transactions', 'loans'], ['accounts', 'loans', 'transactions']]) {
      it(`${JSON.stringify(sid)} restores tracked (${order.join(' -> ')})`, () => {
        boot();
        const csv = buildAndExport(sid);
        boot();
        order.forEach(k => importFile(csv[k]));
        const loan = S().getState().loans.find(x => x.name === 'Home');
        expect(loan.linkedSeriesId).toMatch(SAFE_ID);
        const linked = S().getLoanLinkedTransactions(loan);
        expect(linked && linked.length).toBeGreaterThan(12);
        const sids = new Set(S().getState().transactions.filter(t => t.recurrence).map(t => t.recurrence.seriesId));
        expect([...sids]).toEqual([loan.linkedSeriesId]);
      });
    }
  }
});
