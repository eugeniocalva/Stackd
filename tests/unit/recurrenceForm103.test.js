import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.3 (U1) — the form and History side of the recurrence fixes, through the
// real AddTransactionView / TransactionsView and the real scope sheets
// (recurringSeriesForm.test.js harness):
//  - BUG-139: the report's Rent case keeps its gap through the form, and the
//    scope sheet warns (recUpdate.gapNote) when a frequency change cannot;
//  - BUG-51: the form's slot counter steps with the anchor day;
//  - BUG-103: swipe-delete on a series member opens RecurringDeleteModal.
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

const boot = () => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  container = $('router-view');
  if (typeof Element.prototype.scrollTo !== 'function') Element.prototype.scrollTo = () => {}; // jsdom
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    requestAnimationFrame: (cb) => cb(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn() },
    alert: vi.fn()
  };
  global.localStorage = global.window.localStorage;
  global.requestAnimationFrame = (cb) => cb();
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  S().init();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2500, openingDate: '2026-01-01' });
};

const renderEdit = (id) => {
  params = { id };
  const view = global.window.Views.AddTransactionView;
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};
const save = () => $('btn-save-tx').click();
const members = (sid) => S().getState().transactions
  .filter(t => t.recurrence && t.recurrence.seriesId === sid)
  .sort((a, b) => a.date.localeCompare(b.date));
const dates = (sid) => members(sid).map(t => t.date);
const at = (sid, date) => members(sid).find(t => t.date === date);
const addSeries = ({ comment, amount = 950, date, endDate }) => {
  S().dispatch('ADD_TRANSACTION', {
    type: 'expense', amount, accountId: accId('Main'), categoryId: 'cat_rent', date, comment,
    recurrence: { interval: 1, frequency: 'months', endDate }
  });
  return S().getState().transactions.find(t => t.comment === comment && t.date === date).recurrence.seriesId;
};
const en = (key) => global.window.I18n.dicts.en[key];

describe('Recurring series in the form and History (1.0.3 U1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('BUG-139', () => {
    it("the report's case: 1 Jan deleted, 1 Nov moved to 2 Nov with 'This and future' — 5 payments, no 2 Jan", () => {
      const sid = addSeries({ comment: 'Rent', date: '2026-11-01', endDate: '2027-04-01' });
      S().dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-01-01').id });
      renderEdit(at(sid, '2026-11-01').id);
      $('tx-date').value = '2026-11-02';
      save();
      expect($('ru-gap-note')).toBeNull(); // the gap is kept, nothing to warn about
      $('ru-this-future').click();
      expect(dates(sid)).toEqual(['2026-11-02', '2026-12-02', '2027-02-02', '2027-03-02', '2027-04-02']);
    });

    it('a frequency change over a gap warns that deleted payments come back', () => {
      const sid = addSeries({ comment: 'Rent', date: '2026-11-01', endDate: '2027-04-01' });
      S().dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-01-01').id });
      renderEdit(at(sid, '2026-11-01').id);
      $('tx-recurrence-interval').value = '2';
      save();
      expect($('recurring-update-modal')).not.toBeNull();
      expect($('ru-gap-note')).not.toBeNull();
      expect($('ru-gap-note').textContent).toBe(en('recUpdate.gapNote'));
    });

    it('no note for a frequency change on a series without gaps, nor for a date move', () => {
      const sid = addSeries({ comment: 'Rent', date: '2026-11-01', endDate: '2027-04-01' });
      renderEdit(at(sid, '2026-11-01').id);
      $('tx-recurrence-interval').value = '2';
      save();
      expect($('recurring-update-modal')).not.toBeNull();
      expect($('ru-gap-note')).toBeNull();
    });
  });

  describe('BUG-51: the slot counter steps with the anchor', () => {
    it('a month-end series moved later keeps its payment count (old chain on its anchor)', () => {
      const sid = addSeries({ comment: 'Card', date: '2026-10-31', endDate: '2027-03-30' });
      expect(dates(sid)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
      renderEdit(at(sid, '2026-10-31').id);
      $('tx-date').value = '2026-11-02';
      save();
      $('ru-this-future').click();
      expect(dates(sid)).toEqual(['2026-11-02', '2026-12-02', '2027-01-02', '2027-02-02', '2027-03-02']);
    });

    it('a series moved to the 31st keeps its payment count (shifted chain on the new day)', () => {
      const sid = addSeries({ comment: 'Card', date: '2026-10-15', endDate: '2027-03-15' });
      renderEdit(at(sid, '2026-10-15').id);
      $('tx-date').value = '2026-10-31';
      save();
      $('ru-this-future').click();
      expect(dates(sid)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
    });
  });

  describe('BUG-103: swipe-delete uses the three-scope sheet', () => {
    const renderHistory = () => {
      const view = global.window.Views.TransactionsView;
      container.innerHTML = view.render(S().getState());
      view.attachEvents(container, S().getState());
    };
    const swipeDelete = (id) => container.querySelector(`.swipe-action-btn.delete[data-id="${id}"]`).click();

    it("'All transactions' deletes the whole series from History", () => {
      const sid = addSeries({ comment: 'Mortgage', amount: 700, date: '2026-09-01', endDate: '2027-03-01' });
      renderHistory();
      swipeDelete(at(sid, '2026-10-01').id);
      expect($('recurring-delete-modal')).not.toBeNull();
      expect($('btn-delete-single')).toBeNull();
      expect($('rdm-only-this')).not.toBeNull();
      expect($('rdm-and-future')).not.toBeNull();
      $('rdm-all').click();
      expect(members(sid)).toHaveLength(0);
      expect(S().getState().transactions.some(t => t.comment === 'Mortgage')).toBe(false);
    });

    it("'Only this' deletes the one payment", () => {
      const sid = addSeries({ comment: 'Mortgage', amount: 700, date: '2026-09-01', endDate: '2027-03-01' });
      renderHistory();
      swipeDelete(at(sid, '2026-10-01').id);
      $('rdm-only-this').click();
      expect(dates(sid)).toEqual(['2026-09-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']);
    });

    it("'This and future' stops the series there", () => {
      const sid = addSeries({ comment: 'Mortgage', amount: 700, date: '2026-09-01', endDate: '2027-03-01' });
      renderHistory();
      swipeDelete(at(sid, '2026-10-01').id);
      $('rdm-and-future').click();
      expect(dates(sid)).toEqual(['2026-09-01']);
      expect(members(sid).some(t => t.recurrence.nextDate)).toBe(false);
    });
  });
});
