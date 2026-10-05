import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-25): an opening balance is owned by its account.
// (A) Opening one from History shows a read-only panel, not the transaction
//     form (which mapped it to "Income 450" and stored +450 on an untouched save).
// (B) UPDATE_TRANSACTION pins an opening balance's type, account, category and
//     sign, whatever the caller sends.
// (C) Edit Account on an account WITHOUT an opening balance defaults its date
//     to the earliest row and sends no opening balance on an untouched save.
// (D) A balance-neutral boot heal restores already converted rows.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let params = {};
let container;

const S = () => global.window.Store;
const $ = (id) => document.getElementById(id);
const accId = (name) => S().getState().accounts.find(a => a.name === name).id;
const obRows = (id) => S().getState().transactions.filter(t => t.accountId === id && t.type === 'opening_balance');

const makeStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: vi.fn(k => (m.has(k) ? m.get(k) : null)),
    setItem: vi.fn((k, v) => { m.set(k, String(v)); }),
    removeItem: vi.fn(k => { m.delete(k); }),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; }
  };
};

const boot = (seed = {}) => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  container = $('router-view');
  const storage = makeStorage({ stackd_v1_currency: JSON.stringify('EUR'), ...seed });
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: storage,
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn() },
    alert: vi.fn()
  };
  global.localStorage = storage;
  global.requestAnimationFrame = (cb) => cb();
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  S().init();
};

const renderView = (name) => {
  const view = global.window.Views[name];
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

const bal = (id) => Math.round(S().getAccountBalance(id) * 100) / 100;

describe('Opening balances are owned by their account (1.0.2 BUG-25)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('an opening balance opens a read-only panel, not the form', () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Visa Card', openingBalance: -450, openingDate: '2026-09-01' });
    const visa = accId('Visa Card');
    const ob = obRows(visa)[0];
    params = { id: ob.id };
    renderView('AddTransactionView');

    expect($('btn-save-tx')).toBeNull();
    expect($('tx-amount')).toBeNull();
    expect($('tx-type')).toBeNull();
    expect($('btn-delete-tx')).toBeNull();
    expect($('btn-ob-edit-account').getAttribute('href')).toBe('#edit-account?id=' + encodeURIComponent(visa));
    expect($('btn-ob-edit-account').textContent).toBe('Edit Account');
    const text = $('ob-panel').textContent;
    expect(text).toContain('-€450.00');
    expect(text).toContain('Visa Card');
    expect(text).toContain('September 1, 2026');
    expect(text).toContain('An opening balance belongs to its account.');
    // the close link goes back to History
    expect(container.querySelector('#ob-panel a[href="#transactions"]')).not.toBeNull();
    // nothing changed
    expect(obRows(visa)[0].amount).toBe(-450);
  });

  it('UPDATE_TRANSACTION cannot turn an opening balance into income, move it or make it a series', () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Main Checking', openingBalance: 2500, openingDate: '2026-09-01' });
    S().dispatch('ADD_ACCOUNT', { name: 'Visa Card', openingBalance: -450, openingDate: '2026-09-01' });
    const main = accId('Main Checking');
    const visa = accId('Visa Card');
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 62.5, accountId: visa, categoryId: 'cat_groceries', date: '2026-09-12', comment: '' });
    const visaOb = obRows(visa)[0];
    const count = S().getState().transactions.length;

    S().dispatch('UPDATE_TRANSACTION', {
      id: visaOb.id, type: 'income', amount: 450, accountId: main, categoryId: 'cat_groceries',
      recurrence: { interval: 1, frequency: 'months' }, updateAll: true
    });

    const row = S().getState().transactions.find(t => t.id === visaOb.id);
    expect(row.type).toBe('opening_balance');
    expect(row.amount).toBe(-450);
    expect(row.accountId).toBe(visa);
    expect(row.categoryId).toBe('cat_balance');
    expect(row.recurrence).toBeFalsy();
    expect(S().getState().transactions).toHaveLength(count);
    expect(obRows(main)).toHaveLength(1);
    expect(obRows(visa)).toHaveLength(1);
    expect(bal(visa)).toBe(-512.5);
    expect(bal(main)).toBe(2500);

    // An amount or date change still applies, with the stored sign kept.
    S().dispatch('UPDATE_TRANSACTION', { id: visaOb.id, amount: 500, date: '2026-08-31' });
    const row2 = S().getState().transactions.find(t => t.id === visaOb.id);
    expect(row2.amount).toBe(-500);
    expect(row2.date).toBe('2026-08-31');
    expect(bal(visa)).toBe(-562.5);
  });

  const bankSync = () => {
    boot();
    // No opening-balance row (Bank Connect / CSV-created shape).
    S().dispatch('ADD_ACCOUNT', { name: 'Bank Sync', openingBalance: 0 });
    const id = accId('Bank Sync');
    expect(obRows(id)).toHaveLength(0);
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 20, accountId: id, categoryId: 'cat_groceries', date: '2026-09-12', comment: '' });
    S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 100, accountId: id, categoryId: 'cat_salary', date: '2026-09-20', comment: '' });
    expect(bal(id)).toBe(80);
    params = { id };
    return id;
  };

  it('Edit Account on an account without an opening balance defaults to its earliest row, and an untouched rename creates none', () => {
    const id = bankSync();
    renderView('EditAccountView');
    expect($('edit-acc-date').value).toBe('2026-09-12');

    $('edit-acc-name').value = 'Revolut';
    $('btn-edit-acc-save').click();
    const acc = S().getState().accounts.find(a => a.id === id);
    expect(acc.name).toBe('Revolut');
    expect(obRows(id)).toHaveLength(0);
    expect(bal(id)).toBe(80);
  });

  it('typing an opening balance on such an account dates it at the earliest row', () => {
    const id = bankSync();
    renderView('EditAccountView');
    const ob = $('edit-acc-balance');
    ob.value = '10000';
    ob.dispatchEvent(new Event('input'));
    expect(ob.value).toBe('100.00');
    $('btn-edit-acc-save').click();
    const rows = obRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(100);
    expect(rows[0].date).toBe('2026-09-12');
    expect(bal(id)).toBe(180);
  });

  it('a cleared Opening Balance Date means the prefilled date (D-U2-8)', () => {
    const id = bankSync();
    // (a) cleared date, no amount: nothing is created
    renderView('EditAccountView');
    $('edit-acc-date').value = '';
    $('btn-edit-acc-save').click();
    expect(obRows(id)).toHaveLength(0);
    expect(bal(id)).toBe(80);

    // (b) cleared date plus an amount: dated at the prefilled earliest row
    renderView('EditAccountView');
    $('edit-acc-date').value = '';
    const ob = $('edit-acc-balance');
    ob.value = '10000';
    ob.dispatchEvent(new Event('input'));
    $('btn-edit-acc-save').click();
    const rows = obRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-09-12');
    expect(bal(id)).toBe(180);
  });

  it('an account WITH an opening balance still sends it on every save (sign, date kept)', () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Visa Card', openingBalance: -450, openingDate: '2026-09-01' });
    const id = accId('Visa Card');
    params = { id };
    renderView('EditAccountView');
    expect($('edit-acc-date').value).toBe('2026-09-01');
    $('edit-acc-date').value = '';
    $('edit-acc-name').value = 'Visa';
    $('btn-edit-acc-save').click();
    const rows = obRows(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-450);
    expect(rows[0].date).toBe('2026-09-01');
  });

  describe('boot heal _healConvertedOpeningBalances (D-U2-2)', () => {
    const acc = (id, name) => ({ id, name, color: '#0075EB', icon: 'wallet', type: 'Account', currency: 'EUR', createdAt: '2026-09-01T08:00:00.000Z' });
    const row = (id, accountId, type, amount, date, extra = {}) => ({
      id, accountId, type, amount, date, time: '00:00', categoryId: 'cat_groceries', comment: '', createdAt: '2026-09-01T08:00:00.000Z', ...extra
    });
    const cand = (id, accountId, type, amount, date, extra = {}) =>
      row(id, accountId, type, amount, date, { categoryId: 'cat_balance', comment: 'Opening Balance', ...extra });

    const seedAccounts = [
      acc('a_visa', 'Visa'), acc('a_card', 'Card'), acc('a_cash', 'Cash'), acc('a_loan', 'Loan'),
      acc('a_undated', 'Undated'), acc('a_twin', 'Twin'), acc('a_note', 'Note')
    ];
    const seedTxs = () => [
      // Visa: converted to income, one later expense -> healed, amount kept
      cand('v_ob', 'a_visa', 'income', 450, '2026-09-01'),
      row('v_e1', 'a_visa', 'expense', 62.5, '2026-09-12'),
      // Card: converted to expense -> healed as a NEGATIVE opening balance
      cand('c_ob', 'a_card', 'expense', 450, '2026-09-01'),
      // Cash: has a real opening balance plus a look-alike -> untouched
      { ...cand('k_ob', 'a_cash', 'opening_balance', 100, '2026-08-01') },
      cand('k_like', 'a_cash', 'income', 30, '2026-08-15'),
      // Loan: an earlier row exists -> untouched
      cand('l_ob', 'a_loan', 'income', 1000, '2026-09-01'),
      row('l_e0', 'a_loan', 'expense', 50, '2026-08-20'),
      // Undated: an undated row would drop out -> untouched
      cand('u_ob', 'a_undated', 'income', 200, '2026-09-01'),
      row('u_e0', 'a_undated', 'expense', 10, ''),
      // Twin: two candidates -> untouched
      cand('t_in', 'a_twin', 'income', 300, '2026-09-01'),
      cand('t_out', 'a_twin', 'expense', 100, '2026-09-01'),
      // Note: different comment -> untouched
      cand('n_ob', 'a_note', 'income', 75, '2026-09-01', { comment: 'Opening balance adj' })
    ];
    const seed = () => ({
      stackd_v1_accounts: JSON.stringify(seedAccounts),
      stackd_v1_transactions: JSON.stringify(seedTxs()),
      stackd_v1_homeWidgets: '[]'
    });

    it('restores converted opening balances only where no balance moves', () => {
      const expected = { a_visa: 387.5, a_card: -450, a_cash: 130, a_loan: 950, a_undated: 190, a_twin: 200, a_note: 75 };
      boot(seed());
      const tx = (id) => S().getState().transactions.find(t => t.id === id);

      expect(tx('v_ob').type).toBe('opening_balance');
      expect(tx('v_ob').amount).toBe(450);
      expect(tx('v_ob').date).toBe('2026-09-01');
      expect(tx('c_ob').type).toBe('opening_balance');
      expect(tx('c_ob').amount).toBe(-450);

      expect(tx('k_like').type).toBe('income');
      expect(tx('l_ob').type).toBe('income');
      expect(tx('u_ob').type).toBe('income');
      expect(tx('t_in').type).toBe('income');
      expect(tx('t_out').type).toBe('expense');
      expect(tx('n_ob').type).toBe('income');

      Object.entries(expected).forEach(([id, v]) => expect(bal(id)).toBe(v));

      // persisted
      const stored = JSON.parse(global.window.localStorage.getItem('stackd_v1_transactions'));
      expect(stored.find(t => t.id === 'v_ob').type).toBe('opening_balance');
      expect(stored.find(t => t.id === 'c_ob').amount).toBe(-450);
    });

    it('is idempotent and saves nothing when there is nothing to heal (no-op path)', () => {
      boot(seed());
      const before = JSON.stringify(S().getState().transactions);
      const saveSpy = vi.spyOn(global.window.StackdDB, 'save');
      S()._healConvertedOpeningBalances();
      expect(saveSpy).not.toHaveBeenCalled();
      expect(JSON.stringify(S().getState().transactions)).toBe(before);

      // A healthy install: nothing to heal, no transactions write at boot.
      saveSpy.mockRestore();
      boot({
        stackd_v1_accounts: JSON.stringify([acc('a_ok', 'Ok')]),
        stackd_v1_transactions: JSON.stringify([
          { ...cand('ok_ob', 'a_ok', 'opening_balance', 10, '2026-09-01') },
          row('ok_e', 'a_ok', 'expense', 2, '2026-09-02')
        ]),
        stackd_v1_homeWidgets: '[]'
      });
      const writes = global.window.localStorage.setItem.mock.calls.filter(([k]) => k === 'stackd_v1_transactions');
      expect(writes).toHaveLength(0);
      expect(bal('a_ok')).toBe(8);
    });

    // 1.0.2 (BUG-25) review round 1: the heal skips some damaged accounts, so
    // the release notes carry a manual fix. These tests pin the ORDER of that
    // fix: Edit Account (amount, sign, ORIGINAL date) first, then delete the
    // converted Adjustment row. The other order cannot be followed on a
    // stage-2 account, because History hides every row dated before the €0
    // opening balance that the 1.0.1 Edit Account save added.
    describe('manual fix for accounts the heal skips (release notes)', () => {
      const ALL_2026 = {
        period: { type: 'custom', start: '2026-01-01', end: '2026-12-31' },
        types: [], accounts: [], categories: [], tags: [], sortOrder: 'desc'
      };
      const historyIds = (accountId) => S().getFilteredTransactions('history', ALL_2026)
        .filter(t => t.accountId === accountId).map(t => t.id).sort();

      // Step 1 of the release-note fix: Edit Account, opening amount, sign,
      // and the ORIGINAL opening date (the form prefills another date).
      const restoreOpeningInEditAccount = (accountId, prefilled) => {
        params = { id: accountId };
        renderView('EditAccountView');
        expect($('edit-acc-date').value).toBe(prefilled);
        const ob = $('edit-acc-balance');
        ob.value = '45000';
        ob.dispatchEvent(new Event('input'));
        expect(ob.value).toBe('450.00');
        $('btn-ob-neg').click();
        $('edit-acc-date').value = '2026-09-01';
        $('btn-edit-acc-save').click();
        const rows = obRows(accountId);
        expect(rows).toHaveLength(1);
        expect(rows[0].amount).toBe(-450);
        expect(rows[0].date).toBe('2026-09-01');
      };

      // Step 2: the converted row opens the ordinary form (it is an income,
      // not an opening balance), which has a Delete button.
      const deleteConvertedRow = (id) => {
        params = { id };
        renderView('AddTransactionView');
        expect($('ob-panel')).toBeNull();
        expect($('btn-delete-tx')).not.toBeNull();
        S().dispatch('DELETE_TRANSACTION', { id });
      };

      it('stage-2 account (converted row + a later €0 opening balance): History hides the row until Edit Account restores the original date', () => {
        boot({
          stackd_v1_accounts: JSON.stringify([acc('a_visa', 'Visa')]),
          stackd_v1_transactions: JSON.stringify([
            cand('v_ob', 'a_visa', 'income', 450, '2026-09-01'),
            row('v_e1', 'a_visa', 'expense', 62.5, '2026-09-12'),
            // 1.0.1 stage 2: Edit Account save added a €0 opening balance on the save day
            cand('v_zero', 'a_visa', 'opening_balance', 0, '2026-09-30')
          ]),
          stackd_v1_homeWidgets: '[]'
        });
        const tx = (id) => S().getState().transactions.find(t => t.id === id);
        // the heal skips it (the account already has an opening balance)
        expect(tx('v_ob').type).toBe('income');
        expect(bal('a_visa')).toBe(0);
        // the row the old note said to delete in History is not there
        expect(historyIds('a_visa')).toEqual(['v_zero']);
        // the €0 row opens the read-only panel (no Delete), with Edit Account
        params = { id: 'v_zero' };
        renderView('AddTransactionView');
        expect($('btn-delete-tx')).toBeNull();
        expect($('btn-ob-edit-account').getAttribute('href')).toBe('#edit-account?id=a_visa');

        restoreOpeningInEditAccount('a_visa', '2026-09-30');
        // the converted row (same day as the opening balance) and the hidden
        // expense reappear in History
        expect(historyIds('a_visa')).toEqual(['v_e1', 'v_ob', 'v_zero']);

        deleteConvertedRow('v_ob');
        expect(historyIds('a_visa')).toEqual(['v_e1', 'v_zero']);
        expect(bal('a_visa')).toBe(-512.5);
      });

      it('account skipped for an earlier row: the form prefills the earliest row, the original date restores the pre-bug balance', () => {
        boot({
          stackd_v1_accounts: JSON.stringify([acc('a_visa', 'Visa')]),
          stackd_v1_transactions: JSON.stringify([
            cand('v_ob', 'a_visa', 'income', 450, '2026-09-01'),
            // an older imported row that the original opening date used to hide
            row('v_e0', 'a_visa', 'expense', 30, '2026-08-20'),
            row('v_e1', 'a_visa', 'expense', 62.5, '2026-09-12')
          ]),
          stackd_v1_homeWidgets: '[]'
        });
        const tx = (id) => S().getState().transactions.find(t => t.id === id);
        expect(tx('v_ob').type).toBe('income');
        expect(bal('a_visa')).toBe(357.5);
        expect(historyIds('a_visa')).toEqual(['v_e0', 'v_e1', 'v_ob']);

        // Part C prefills the earliest row (2026-08-20), not the original
        // 2026-09-01: the note must tell the user to enter the original date.
        restoreOpeningInEditAccount('a_visa', '2026-08-20');
        const newOb = obRows('a_visa')[0].id;
        // the converted row is still visible (same day); the 2026-08-20 row is
        // hidden again, as it was before the bug
        expect(historyIds('a_visa')).toEqual([newOb, 'v_e1', 'v_ob'].sort());

        deleteConvertedRow('v_ob');
        expect(bal('a_visa')).toBe(-512.5);
        // the next boot heal leaves the repaired account alone
        const saveSpy = vi.spyOn(global.window.StackdDB, 'save');
        S()._healConvertedOpeningBalances();
        expect(saveSpy).not.toHaveBeenCalled();
        saveSpy.mockRestore();
      });
    });
  });
});
