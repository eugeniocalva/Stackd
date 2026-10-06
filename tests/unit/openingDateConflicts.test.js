import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.3 (BUG-137 / BUG-41): a row dated before its account's opening date
// counts in no balance, budget or chart. Edit Account (a later opening date)
// and the transaction form (a back-dated log) now say so first, through one
// sheet, Components.OpeningDateSheet: primary (fix the dates) / anyway /
// Cancel. History lists such rows dimmed and leaves them out of its sums (D2).
// Harness: openingBalanceForm.test.js (jsdom, store + components + views, en).
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
const obRow = (id) => S().getState().transactions.find(t => t.accountId === id && t.type === 'opening_balance');
const bal = (id) => Math.round(S().getAccountBalance(id) * 100) / 100;
const txs = () => S().getState().transactions;

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
  const storage = makeStorage({ stackd_v1_currency: JSON.stringify('EUR'), stackd_v1_homeWidgets: '[]', ...seed });
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: storage,
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn() },
    alert: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    // dismissTopSheet reads the computed z-index / display
    getComputedStyle: (el) => ({ zIndex: '0', display: el.style.display || 'block' })
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

const sheet = () => $('opening-date-sheet');
const sheetText = () => sheet().textContent.replace(/\s+/g, ' ');

// Main opens 2026-09-01 with €1,000; rows: 08-20 (already before opening),
// 09-05 expense €20, 09-10 unpaid income €100, 09-15 expense €10.
const seedMain = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-09-01' });
  const main = accId('Main');
  const add = (type, amount, date, extra = {}) =>
    S().dispatch('ADD_TRANSACTION', { type, amount, accountId: main, categoryId: type === 'income' ? 'cat_salary' : 'cat_groceries', date, comment: '', ...extra });
  add('expense', 30, '2026-08-20');
  add('expense', 20, '2026-09-05');
  add('income', 100, '2026-09-10', { isPaid: false });
  add('expense', 10, '2026-09-15');
  return main;
};

describe('Opening date conflicts (1.0.3 BUG-137 / BUG-41)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Store helpers', () => {
    it('openingDateImpact counts only the rows a later date NEWLY leaves out; unpaid rows are counted but not in net', () => {
      boot();
      const main = seedMain();
      expect(S().openingDateImpact(main, '2026-09-12')).toEqual({ count: 2, net: -20, earliest: '2026-09-05' });
      expect(S().openingDateImpact(main, '2026-09-20')).toEqual({ count: 3, net: -30, earliest: '2026-09-05' });
      // same date (a rename) or an earlier one: nothing newly left out
      expect(S().openingDateImpact(main, '2026-09-01').count).toBe(0);
      expect(S().openingDateImpact(main, '2026-08-01').count).toBe(0);
    });

    it('openingDateImpact has no lower bound on an account without an opening row', () => {
      boot({
        stackd_v1_accounts: JSON.stringify([{ id: 'a_bank', name: 'Bank', type: 'Bank', currency: 'EUR', icon: 'wallet', color: '#0075EB' }]),
        stackd_v1_transactions: JSON.stringify([
          { id: 't1', type: 'income', amount: 500, accountId: 'a_bank', categoryId: 'cat_salary', date: '2026-08-01', time: '09:00' },
          { id: 't2', type: 'expense', amount: 40, accountId: 'a_bank', categoryId: 'cat_groceries', date: '2026-08-15', time: '09:00' }
        ])
      });
      expect(S().openingDateImpact('a_bank', '2026-09-01')).toEqual({ count: 2, net: 460, earliest: '2026-08-01' });
    });

    it('openingDateConflicts names each account a leg would sit before, once', () => {
      boot();
      S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-09-01' });
      S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-09-20' });
      const main = accId('Main');
      const sav = accId('Savings');
      expect(S().openingDateConflicts([{ accountId: main, date: '2026-09-10' }, { accountId: sav, date: '2026-09-10' }]))
        .toEqual([{ accountId: sav, openingDate: '2026-09-20' }]);
      expect(S().openingDateConflicts([{ accountId: main, date: '2026-08-10' }, { accountId: sav, date: '2026-08-10' }, { accountId: sav, date: '2026-08-11' }]))
        .toEqual([{ accountId: main, openingDate: '2026-09-01' }, { accountId: sav, openingDate: '2026-09-20' }]);
      expect(S().openingDateConflicts([{ accountId: main, date: '2026-09-01' }])).toEqual([]);
    });
  });

  describe('Edit Account (BUG-137)', () => {
    const openEdit = (id, date) => {
      params = { id };
      renderView('EditAccountView');
      if (date) $('edit-acc-date').value = date;
      $('btn-edit-acc-save').click();
    };

    it('a later opening date opens the sheet and saves nothing', () => {
      boot();
      const main = seedMain();
      const spy = vi.spyOn(S(), 'dispatch');
      openEdit(main, '2026-09-12');
      expect(sheet()).not.toBeNull();
      expect(spy).not.toHaveBeenCalled();
      expect(obRow(main).date).toBe('2026-09-01');
      const text = sheetText();
      expect(text).toContain('Entries before this date');
      expect(text).toContain('2 entries (-€20.00) are dated before Sep 12, 2026.');
      expect($('opening-date-primary').textContent).toBe('Open on Sep 5, 2026 instead');
      expect($('opening-date-anyway').textContent).toBe('Change anyway');
      expect($('opening-date-cancel').hasAttribute('data-back-dismiss')).toBe(true);
    });

    it('"Open on {earliest} instead" keeps every row counted', () => {
      boot();
      const main = seedMain();
      openEdit(main, '2026-09-12');
      $('opening-date-primary').click();
      expect(sheet()).toBeNull();
      expect(obRow(main).date).toBe('2026-09-05');
      expect(bal(main)).toBe(970);
      expect(global.window.Router.navigate).toHaveBeenCalledWith('#dashboard');
    });

    it('"Change anyway" saves the later date; the rows stop counting', () => {
      boot();
      const main = seedMain();
      openEdit(main, '2026-09-12');
      $('opening-date-anyway').click();
      expect(obRow(main).date).toBe('2026-09-12');
      expect(bal(main)).toBe(990);
    });

    it('Cancel, a backdrop tap and Android Back save nothing and keep the form', () => {
      boot();
      const main = seedMain();
      openEdit(main, '2026-09-12');
      $('opening-date-cancel').click();
      expect(sheet().classList.contains('open')).toBe(false);
      expect(obRow(main).date).toBe('2026-09-01');
      expect($('edit-acc-date').value).toBe('2026-09-12');

      sheet().remove();
      $('btn-edit-acc-save').click();
      sheet().click(); // backdrop
      expect(sheet().classList.contains('open')).toBe(false);

      sheet().remove();
      $('btn-edit-acc-save').click();
      expect(global.window.Components.dismissTopSheet()).toBe(true);
      expect(sheet().classList.contains('open')).toBe(false);
      expect(obRow(main).date).toBe('2026-09-01');
      expect(global.window.Router.navigate).not.toHaveBeenCalled();
    });

    it('a rename-only save never asks', () => {
      boot();
      const main = seedMain();
      params = { id: main };
      renderView('EditAccountView');
      $('edit-acc-name').value = 'Main Checking';
      $('btn-edit-acc-save').click();
      expect(sheet()).toBeNull();
      expect(S().getState().accounts.find(a => a.id === main).name).toBe('Main Checking');
    });
  });

  describe('transaction form (BUG-41)', () => {
    const logExpense = (accountName, date, amount = '25') => {
      params = {};
      renderView('AddTransactionView');
      $('tx-amount').value = amount;
      $('tx-account').value = accId(accountName);
      $('tx-account').dispatchEvent(new Event('change'));
      $('tx-category').value = 'cat_groceries';
      $('tx-date').value = date;
      $('btn-save-tx').click();
    };

    it('an expense before the opening date opens the sheet; Cancel saves nothing', () => {
      boot();
      const main = seedMain();
      const n = txs().length;
      logExpense('Main', '2026-08-25');
      expect(sheet()).not.toBeNull();
      expect(txs()).toHaveLength(n);
      const text = sheetText();
      expect(text).toContain('Before the opening balance');
      expect(text).toContain("Main opens on Sep 1, 2026. Earlier entries are kept but don't count in balances, budgets or charts.");
      expect($('opening-date-primary').textContent).toBe('Move opening date to Aug 25, 2026');
      expect($('opening-date-anyway').textContent).toBe('Save anyway');
      $('opening-date-cancel').click();
      expect(txs()).toHaveLength(n);
      expect(obRow(main).date).toBe('2026-09-01');
      expect(global.window.Router.navigate).not.toHaveBeenCalled();
    });

    it('"Move opening date" re-dates the opening row in the same batch, and the row counts', () => {
      boot();
      const main = seedMain();
      const n = txs().length;
      const before = bal(main);
      // dispatch() itself runs in a batch: count the OUTERMOST ones only
      const orig = S().batch.bind(S());
      let depth = 0;
      let batches = 0;
      S().batch = (fn) => { if (depth === 0) batches++; depth++; try { return orig(fn); } finally { depth--; } };
      const seen = [];
      const origDispatch = S().dispatch.bind(S());
      S().dispatch = (a, p) => { seen.push([a, depth > 0]); return origDispatch(a, p); };
      logExpense('Main', '2026-08-25');
      $('opening-date-primary').click();
      expect(batches).toBe(1);
      expect(seen).toEqual([['UPDATE_ACCOUNT', true], ['ADD_TRANSACTION', true]]);
      expect(txs()).toHaveLength(n + 1);
      expect(obRow(main).date).toBe('2026-08-25');
      expect(obRow(main).amount).toBe(1000);
      // the new €25 counts; the 08-20 row stays before the (moved) opening
      expect(bal(main)).toBe(Math.round((before - 25) * 100) / 100);
    });

    it('"Save anyway" saves the row, which does not count', () => {
      boot();
      const main = seedMain();
      const before = bal(main);
      logExpense('Main', '2026-08-25');
      $('opening-date-anyway').click();
      const row = txs().find(t => t.accountId === main && t.date === '2026-08-25');
      expect(row).toBeTruthy();
      expect(obRow(main).date).toBe('2026-09-01');
      expect(bal(main)).toBe(before);
    });

    it('a transfer into a later-opened account names that account only', () => {
      boot();
      S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-09-01' });
      S().dispatch('ADD_ACCOUNT', { name: 'Savings <b>', openingBalance: 0, openingDate: '2026-09-20' });
      renderView('AddTransactionView');
      $('toggle-transfer').click();
      $('tx-account').value = accId('Main');
      $('tx-account').dispatchEvent(new Event('change'));
      $('tx-transfer-to').value = accId('Savings <b>');
      $('tx-transfer-to').dispatchEvent(new Event('change'));
      $('tx-amount').value = '50';
      $('tx-date').value = '2026-09-10';
      $('btn-save-tx').click();
      const body = $('opening-date-sheet-body');
      expect(body.querySelectorAll('p')).toHaveLength(1);
      expect(body.textContent).toContain('Savings <b> opens on Sep 20, 2026.');
      expect(body.querySelector('b')).toBeNull(); // the name is escaped
      $('opening-date-primary').click();
      expect(obRow(accId('Savings <b>')).date).toBe('2026-09-10');
      expect(obRow(accId('Main')).date).toBe('2026-09-01');
      expect(bal(accId('Savings <b>'))).toBe(50);
      expect(bal(accId('Main'))).toBe(950);
    });

    it('a transfer whose both legs are before their opening dates lists both accounts', () => {
      boot();
      S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-09-01' });
      S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-09-20' });
      renderView('AddTransactionView');
      $('toggle-transfer').click();
      $('tx-account').value = accId('Main');
      $('tx-account').dispatchEvent(new Event('change'));
      $('tx-transfer-to').value = accId('Savings');
      $('tx-transfer-to').dispatchEvent(new Event('change'));
      $('tx-amount').value = '50';
      $('tx-date').value = '2026-08-10';
      $('btn-save-tx').click();
      expect($('opening-date-sheet-body').querySelectorAll('p')).toHaveLength(2);
      $('opening-date-primary').click();
      expect(obRow(accId('Main')).date).toBe('2026-08-10');
      expect(obRow(accId('Savings')).date).toBe('2026-08-10');
    });

    it('an edit that keeps the date and the account never asks (a pre-opening row stays editable)', () => {
      boot();
      const main = seedMain();
      const old = txs().find(t => t.date === '2026-08-20');
      params = { id: old.id };
      renderView('AddTransactionView');
      $('tx-comment').value = 'note';
      $('btn-save-tx').click();
      expect(sheet()).toBeNull();
      expect(txs().find(t => t.id === old.id).comment).toBe('note');
      expect(obRow(main).date).toBe('2026-09-01');
    });

    it('an edit that moves a row before the opening date asks', () => {
      boot();
      seedMain();
      const row = txs().find(t => t.date === '2026-09-15');
      params = { id: row.id };
      renderView('AddTransactionView');
      $('tx-date').value = '2026-08-28';
      $('btn-save-tx').click();
      expect(sheet()).not.toBeNull();
      $('opening-date-anyway').click();
      expect(txs().find(t => t.id === row.id).date).toBe('2026-08-28');
    });

    it('on a series member the opening sheet comes BEFORE the scope sheet', () => {
      boot();
      S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-09-01' });
      const main = accId('Main');
      S().dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 15, accountId: main, categoryId: 'cat_groceries', date: '2026-09-10', comment: 'Gym',
        recurrence: { seriesId: 'gym', interval: 1, frequency: 'months', startDate: '2026-09-10', endDate: '2026-12-10', nextDate: '2026-10-10' }
      });
      const first = txs().find(t => t.comment === 'Gym' && t.date === '2026-09-10');
      params = { id: first.id };
      renderView('AddTransactionView');
      $('tx-date').value = '2026-08-10';
      $('btn-save-tx').click();
      expect(sheet()).not.toBeNull();
      expect($('recurring-update-modal')).toBeNull();
      $('opening-date-primary').click();
      expect($('recurring-update-modal')).not.toBeNull();
      // nothing saved until the scope is chosen
      expect(obRow(main).date).toBe('2026-09-01');
      $('ru-only-this').click();
      expect(obRow(main).date).toBe('2026-08-10');
      expect(txs().find(t => t.id === first.id).date).toBe('2026-08-10');
    });

    it('Android Back on the sheet = Cancel: nothing saved, the form stays', () => {
      boot();
      seedMain();
      const n = txs().length;
      logExpense('Main', '2026-08-25');
      expect(global.window.Components.dismissTopSheet()).toBe(true);
      expect(sheet().classList.contains('open')).toBe(false);
      expect(txs()).toHaveLength(n);
      expect($('tx-amount').value).toBe('25');
    });
  });

  describe('History lists pre-opening rows dimmed, out of the sums (D2)', () => {
    const OCT = {
      period: { type: 'custom', start: '2026-10-01', end: '2026-10-31' },
      types: [], accounts: [], categories: [], tags: [], sortOrder: 'desc'
    };

    it('the row is listed with the "not counted" line; day sum, In/Out and START/END leave it out', () => {
      if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}; // jsdom: History scrolls to today
      boot();
      S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-10-10' });
      const main = accId('Main');
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 50, accountId: main, categoryId: 'cat_groceries', date: '2026-10-05', comment: '' });
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 20, accountId: main, categoryId: 'cat_groceries', date: '2026-10-12', comment: '' });
      S().dispatch('UPDATE_FILTERS', { page: 'history', filters: OCT, replace: true });
      const early = txs().find(t => t.date === '2026-10-05');

      // default callers still drop it; History keeps it
      expect(S().getFilteredTransactions('history').some(t => t.id === early.id)).toBe(false);
      expect(S().getFilteredTransactions('history', null, { keepBeforeOpening: true }).some(t => t.id === early.id)).toBe(true);

      renderView('TransactionsView');
      const row = container.querySelector(`.list-item[data-id="${early.id}"]`);
      expect(row).not.toBeNull();
      expect(row.textContent).toContain('Before opening balance · not counted');
      expect(row.querySelector('.list-item-content').getAttribute('style')).toContain('opacity: 0.55');
      const later = container.querySelector(`.list-item[data-id="${txs().find(t => t.date === '2026-10-12').id}"]`);
      expect(later.textContent).not.toContain('not counted');
      // its day footer sums nothing
      expect($('tx-2026-10-05').querySelector('.day-summary-footer').textContent).toContain('€0.00');
      // START/END follow getBalanceAtDate (unchanged)
      const html = container.innerHTML;
      expect(html).toContain('€980.00');

      // select-all selects exactly the listed rows
      S().dispatch('TOGGLE_SELECTION_MODE', { active: true });
      renderView('TransactionsView');
      $('btn-toggle-select-all').click();
      expect(S().getState().selectedTransactionIds).toContain(early.id);

      // a type filter switches the card to In/Out: the dimmed row is not "Out"
      S().dispatch('TOGGLE_SELECTION_MODE', { active: false });
      S().dispatch('UPDATE_FILTERS', { page: 'history', filters: { ...OCT, types: ['expense'] }, replace: true });
      renderView('TransactionsView');
      expect(container.textContent).toContain('-€20.00');
      expect(container.textContent).not.toContain('-€70.00');
    });
  });
});
