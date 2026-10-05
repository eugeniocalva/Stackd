import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 live-check fixes: problems found by the live reproduction pass over the
// merged 1.0.2 app (ids live-<unit>-<n>). Real AddTransactionView, components,
// widgets, store and importer (recurringSeriesForm.test.js harness).
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let params = {};
let container;
let files;

const S = () => global.window.Store;
const $ = (id) => document.getElementById(id);
const accId = (name) => S().getState().accounts.find(a => a.name === name).id;
const en = (key) => global.window.I18n.dicts.en[key];

const boot = () => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  container = $('router-view');
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn() },
    alert: vi.fn()
  };
  global.localStorage = global.window.localStorage;
  global.requestAnimationFrame = (cb) => cb();
  global.FileReader = class {
    readAsText(file) { this.onload({ target: { result: file.text } }); }
  };
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'i18n/fr.js', 'loan-engine.js', 'store.js',
    'components.js', 'widgets.js', 'views.js', 'export.js', 'import.js']) executeFile(f);
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  S().init();
  S().dispatch('SET_CURRENCY', 'EUR');
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2026-01-01' });
};

const renderEdit = (id) => {
  params = { id };
  const view = global.window.Views.AddTransactionView;
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};
const members = (sid) => S().getState().transactions
  .filter(t => t.recurrence && t.recurrence.seriesId === sid)
  .sort((a, b) => a.date.localeCompare(b.date));

describe('1.0.2 live-check fixes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    global.window.I18n.setLang && global.window.I18n.setLang('en');
    vi.useRealTimers();
  });

  // ── live-U1-N1 ─────────────────────────────────────────────────────────────
  it('live-U1-N1: a long unbroken name ellipsizes; the amount never shrinks or wraps', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'IT60X0542811101000000123456-SAVINGS-JOINT', openingBalance: 0, openingDate: '2026-01-01' });
    const html = global.window.Components.TransactionItem.render(
      { id: 't1', type: 'expense', amount: 1234.5, date: '2026-10-01', accountId: accId('IT60X0542811101000000123456-SAVINGS-JOINT') },
      { id: 'c1', name: 'Household_groceries_weekly_supermarket_run', icon: 'pin' },
      S().getState().accounts.find(a => a.name.startsWith('IT60')),
      { allowSwipeReveal: true });
    const host = document.createElement('div');
    host.innerHTML = html;
    expect(host.querySelector('.list-item-content').style.minWidth).toBe('0px');
    const title = host.querySelector('.tx-item-title-text');
    expect(title.textContent).toBe('Household_groceries_weekly_supermarket_run');
    expect(title.style.textOverflow).toBe('ellipsis');
    expect(title.style.whiteSpace).toBe('nowrap');
    expect(title.style.overflow).toBe('hidden');
    const account = host.querySelector('.tx-item-account');
    expect(account.style.textOverflow).toBe('ellipsis');
    expect(account.style.minWidth).toBe('0px');
    const value = host.querySelector('.list-item-value');
    expect(value.style.flexShrink).toBe('0');
    expect(value.style.whiteSpace).toBe('nowrap');
  });

  // ── live-U1-N3 ─────────────────────────────────────────────────────────────
  it('live-U1-N3: tag chips keep a labelled <button> remover after the attach-time re-render and a removal', () => {
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 10, accountId: accId('Main'), categoryId: 'cat_groceries', date: '2026-10-01', tags: ['food', 'weekly'] });
    const tx = S().getState().transactions.find(t => t.type === 'expense');
    renderEdit(tx.id);
    const removers = () => Array.from(container.querySelectorAll('.tag-chip .remove-tag'));
    expect(removers()).toHaveLength(2);
    removers().forEach(b => {
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('type')).toBe('button');
    });
    expect(removers().map(b => b.getAttribute('aria-label'))).toEqual(['Remove tag food', 'Remove tag weekly']);
    removers()[0].click();
    expect(removers()).toHaveLength(1);
    expect(removers()[0].tagName).toBe('BUTTON');
    expect(removers()[0].getAttribute('aria-label')).toBe('Remove tag weekly');
  });

  // ── live-U2-NEW-U2-2 / live-U8-PRE-1 ───────────────────────────────────────
  it('live-U2-NEW-U2-2: the amount label uses the defined visually-hidden class', () => {
    params = {};
    container.innerHTML = global.window.Views.AddTransactionView.render(S().getState());
    const label = container.querySelector('label[for="tx-amount"]');
    expect(label.classList.contains('visually-hidden')).toBe(true);
    const views = readFileSync(resolve(__dirname, '../../src/views.js'), 'utf8');
    expect(views).not.toMatch(/class="sr-only"/);
    const css = readFileSync(resolve(__dirname, '../../src/styles/components.css'), 'utf8');
    expect(css).toMatch(/\.visually-hidden\s*\{[^}]*clip: rect\(0, 0, 0, 0\)/);
  });

  // ── live-U2-NEW-U2-1 ───────────────────────────────────────────────────────
  it('live-U2-NEW-U2-1: an opening balance cannot be marked unpaid; a stored unpaid one can be marked paid', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Visa', openingBalance: -450, openingDate: '2026-01-01' });
    const visa = accId('Visa');
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 62.5, accountId: visa, categoryId: 'cat_groceries', date: '2026-10-01' });
    const ob = () => S().getState().transactions.find(t => t.accountId === visa && t.type === 'opening_balance');
    expect(S().getAccountBalance(visa)).toBe(-512.5);
    S().dispatch('TOGGLE_TRANSACTION_PAID', { id: ob().id });
    expect('isPaid' in ob()).toBe(false);
    S().dispatch('TOGGLE_TRANSACTION_PAID', { id: ob().id, isPaid: false });
    expect('isPaid' in ob()).toBe(false);
    expect(S().getAccountBalance(visa)).toBe(-512.5);
    // A row stored unpaid before 1.0.2 keeps its way back
    ob().isPaid = false;
    S().dispatch('TOGGLE_TRANSACTION_PAID', { id: ob().id });
    expect('isPaid' in ob()).toBe(false);
    // Ordinary rows still toggle
    const exp = S().getState().transactions.find(t => t.accountId === visa && t.type === 'expense');
    S().dispatch('TOGGLE_TRANSACTION_PAID', { id: exp.id });
    expect(exp.isPaid).toBe(false);

    const TI = global.window.Components.TransactionItem;
    const acc = S().getState().accounts.find(a => a.id === visa);
    const host = document.createElement('div');
    host.innerHTML = TI.render(ob(), null, acc, { allowSwipeReveal: true });
    expect(host.querySelector('.swipe-action-btn.paid')).toBeNull();
    expect(host.querySelector('.swipe-action-btn.edit')).not.toBeNull();
    host.innerHTML = TI.render({ ...ob(), isPaid: false }, null, acc, { allowSwipeReveal: true });
    expect(host.querySelector('.swipe-action-btn.paid')).not.toBeNull();
    host.innerHTML = TI.render(exp, null, acc, { allowSwipeReveal: true });
    expect(host.querySelector('.swipe-action-btn.paid')).not.toBeNull();
  });

  // ── live-U3-N1 ─────────────────────────────────────────────────────────────
  describe('live-U3-N1: the scope sheet says a rebuild replaces different later amounts', () => {
    const addLoanLike = () => {
      S().dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 151.94, accountId: accId('Main'), categoryId: 'cat_rent', date: '2026-11-04', comment: 'Car',
        recurrence: { interval: 1, frequency: 'months', endDate: '2027-03-04' }
      });
      return S().getState().transactions.find(t => t.comment === 'Car').recurrence.seriesId;
    };

    it('a date move with a later payment at another amount shows the note', () => {
      const sid = addLoanLike();
      const dec = members(sid).find(t => t.date === '2026-12-04');
      S().dispatch('UPDATE_TRANSACTION', { id: dec.id, amount: 500, date: dec.date });
      expect(members(sid).find(t => t.date === '2026-12-04').amount).toBe(500);
      renderEdit(members(sid).find(t => t.date === '2026-11-04').id);
      $('tx-date').value = '2026-11-06';
      $('btn-save-tx').click();
      const note = $('ru-amount-note');
      expect(note).not.toBeNull();
      expect(note.textContent).toBe(en('recUpdate.rebuildAmountNote'));
    });

    it('no note for a uniform series, nor without a date or schedule change', () => {
      const sid = addLoanLike();
      renderEdit(members(sid)[0].id);
      $('tx-date').value = '2026-11-06';
      $('btn-save-tx').click();
      expect($('recurring-update-modal')).not.toBeNull();
      expect($('ru-amount-note')).toBeNull();
      $('ru-cancel').click();

      const dec = members(sid).find(t => t.date === '2026-12-04');
      S().dispatch('UPDATE_TRANSACTION', { id: dec.id, amount: 500, date: dec.date });
      renderEdit(members(sid)[0].id);
      $('tx-amount').value = '160';
      $('btn-save-tx').click();
      expect($('recurring-update-modal')).not.toBeNull();
      expect($('ru-amount-note')).toBeNull();
    });
  });

  // ── live-U4-U4-N1 ──────────────────────────────────────────────────────────
  it('live-U4-N1: each custom-range calendar is labelled Start / End', () => {
    S().dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'custom', start: '2026-09-01', end: '2026-09-30' } } });
    global.window.Components.CustomRangeModal.show('history');
    const labels = (id) => $(id).querySelector('.crm-calendar-label');
    expect(labels('calendar-container-start').textContent).toBe(en('range.startDate'));
    expect(labels('calendar-container-end').textContent).toBe(en('range.endDate'));
    // still there after a month arrow re-renders the calendars
    $('calendar-container-end').querySelector('.btn-month-nav[data-offset="-1"]').click();
    expect(labels('calendar-container-end').textContent).toBe(en('range.endDate'));
  });

  // ── live-U6-U6-N1 ──────────────────────────────────────────────────────────
  it('live-U6-N1: an uncategorised row restores uncategorised, with no new category', () => {
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 19.9, accountId: accId('Main'), categoryId: '', date: '2026-10-02', comment: 'Bank row' });
    global.window.StackdExport.exportTransactions(S().getState());
    const csv = files['stackd_transactions.csv'];
    const before = S().getState().categories.length;
    // a new phone with the same account
    boot();
    let out;
    global.window.StackdImport.importCSV({ text: csv }, S().getState(), (r) => { out = r; }, (e) => { throw e; });
    const row = S().getState().transactions.find(t => t.comment === 'Bank row');
    expect(row).toBeTruthy();
    expect(row.categoryId).toBe('');
    expect(S().getState().categories.length).toBe(before);
    expect(S().getState().categories.some(c => c.name === 'Uncategorized')).toBe(false);
    expect(out.newCategories).toBe(0);
  });

  // ── live-U6-U6-N2 ──────────────────────────────────────────────────────────
  it('live-U6-N2: the transactions restore result is pluralised per sentence', () => {
    const t = (k, p) => global.window.I18n.t(k, p);
    expect(t('others.importedTx', { count: 1 })).toBe('Success! Imported 1 transaction.');
    expect(t('others.importedTx', { count: 2 })).toBe('Success! Imported 2 transactions.');
    expect(t('others.importCreatedAccounts', { count: 1 })).toBe('Created 1 missing account automatically.');
    expect(t('others.importCreatedCategories', { count: 3 })).toBe('Created 3 missing categories automatically.');
    const views = readFileSync(resolve(__dirname, '../../src/views.js'), 'utf8');
    expect(views).not.toContain("'others.importedTransactions'");
  });

  // ── live-U8-U8-N1 ──────────────────────────────────────────────────────────
  it('live-U8-N1: the widget currency note is a sentence, not an uppercase label', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'US', currency: 'USD', openingBalance: 0, openingDate: '2026-01-01' });
    const items = S().getState().accounts.map(a => ({ id: a.id, name: a.name }));
    const host = document.createElement('div');
    host.innerHTML = global.window.Widgets._multiChips('accountIds', items, [accId('Main'), accId('US')]);
    const note = host.querySelector('.widget-currency-note');
    expect(note).not.toBeNull();
    expect(note.classList.contains('widget-config-label')).toBe(false);
    expect(note.textContent).toBe('1 account in another currency is excluded from these totals.');
  });

  // ── live-U8-PRE-2 ──────────────────────────────────────────────────────────
  it('live-U8-PRE-2: no hard-coded English in the net-flow card or the scope sheet', () => {
    const html = global.window.Components.NetFlowChart.render([{ label: 'Oct', income: 10, expense: 5, net: 5 }], false, 'EUR');
    expect(html).not.toContain('Custom date ranges');
    global.window.I18n.setLang('fr');
    global.window.Components.RecurringUpdateModal.show({ onSelection: () => {} });
    expect($('recurring-update-modal').textContent).toContain(global.window.I18n.dicts.fr['recUpdate.description']);
    global.window.Components.RecurringUpdateModal.show({ recurrenceRemoved: true, onSelection: () => {} });
    expect($('recurring-update-modal').textContent).toContain(global.window.I18n.dicts.fr['recUpdate.stopDescription']);
    const comps = readFileSync(resolve(__dirname, '../../src/components.js'), 'utf8');
    expect(comps).not.toContain('part of a repeating series');
    expect(comps).not.toContain('You turned off Recurrent');
  });
});
