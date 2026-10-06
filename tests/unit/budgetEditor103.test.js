import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.3 Goals (BudgetView) fixes, rendered in jsdom:
// - BUG-140 the limit editor reads and writes the limit of the month viewed
//   in Goals, and says from when a change applies;
// - BUG-58  Cumulative Rollover with no Start Month starts on the viewed month;
// - BUG-104 an End Month before the Start Month is refused, and the End Month
//   can be cleared from the month picker;
// - BUG-105 Remove Budget Limit asks first (Back closes the sheet first);
// - BUG-160 the summary decides "overspent" in cents (no "Overspent €0.00",
//   no "-€0.00") and the ring sums the same rows as the summary.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const S = () => window.Store;
const R = () => window.Router;
const BV = () => window.Views.BudgetView;
const $ = (id) => document.getElementById(id);
const rv = () => $('router-view');
const openAll = () => document.querySelectorAll('.modal-backdrop').forEach(el => el.classList.add('open'));
const back = () => R().handleBack({ canGoBack: true });
const rec = (cat = 'cat_groceries') => S().getState().budgets.find(b => b.categoryId === cat);
const acc = () => S().getState().accounts[0].id;
const spend = (amount, date, cat = 'cat_groceries') =>
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount, accountId: acc(), categoryId: cat, date });

const renderView = () => {
  rv().innerHTML = BV().render(S().getState());
  BV().attachEvents(rv(), S().getState());
};
const openEditor = (catId) => {
  BV().editCategoryId = catId;
  renderView();
};
const viewMonth = (ym) => S().dispatch('SET_MONTH_FILTER', ym);

let charts;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); // 15 Oct 2026
  document.body.innerHTML = '<main id="router-view"></main><nav id="bottom-nav"></nav><div id="modal-container"></div>';
  window.localStorage.clear();
  window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
  window.history.replaceState(null, '', '#budget');
  global.window.StackdHydrateIcons = vi.fn();
  charts = [];
  global.window.Chart = function (canvas, config) { this.config = config; this.destroy = () => {}; charts.push(this); };
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  executeFile('router.js');
  S().init();
  S().state.currency = 'EUR';
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2020-01-01' });
  S().dispatch('SET_VIEW', 'budget');
  BV().editCategoryId = null;
  BV()._editBaseline = null;
  BV().currentBudgetFilter = 'expense';
  vi.spyOn(window.history, 'back').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Limit editor and the viewed month (1.0.3 BUG-140)', () => {
  const setup = () => {
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 300, startDate: '2026-07', endDate: null, isCumulative: true });
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 400, startDate: '2026-07', endDate: null, isCumulative: true, effectiveFrom: '2026-10' });
  };

  it('prefills the limit of the viewed month and captions from when a change applies', () => {
    setup();
    viewMonth('2026-09');
    openEditor('cat_groceries');
    expect($('bdg-amount').value).toBe('300');
    const caption = $('bdg-applies-from');
    expect(caption).not.toBeNull();
    expect(caption.textContent).toContain('September 2026');
    expect(caption.textContent).toContain('Earlier months keep theirs');

    BV().closeEditor();
    viewMonth('2026-10');
    openEditor('cat_groceries');
    expect($('bdg-amount').value).toBe('400');
  });

  it('a save applies from the viewed month on', () => {
    setup();
    viewMonth('2026-09');
    openEditor('cat_groceries');
    $('bdg-amount').value = '350';
    $('btn-bdg-save').click();
    expect(BV().editCategoryId).toBeNull();
    expect(rec().limits).toEqual([{ from: '', amount: 300 }, { from: '2026-09', amount: 350 }]);
    expect(S().getBudgetForMonth('cat_groceries', '2026-08').allocated).toBe(300);
    expect(S().getBudgetForMonth('cat_groceries', '2026-10').allocated).toBe(350);
  });

  it('only toggling the switch keeps the history', () => {
    setup();
    viewMonth('2026-08');
    openEditor('cat_groceries');
    $('bdg-cumulative').checked = false;
    $('btn-bdg-save').click();
    expect(rec()).toMatchObject({ amount: 400, isCumulative: false });
    expect(rec().limits).toEqual([{ from: '', amount: 300 }, { from: '2026-10', amount: 400 }]);
  });

  it('no caption for a new budget or when the viewed month is the start month', () => {
    viewMonth('2026-09');
    openEditor('cat_transport');
    expect($('bdg-applies-from')).toBeNull();
    BV().closeEditor();
    setup();
    viewMonth('2026-07');
    openEditor('cat_groceries');
    expect($('bdg-applies-from')).toBeNull();
  });

  it('the opened editor is not dirty (the BUG-86 baseline is the prefilled month)', () => {
    setup();
    viewMonth('2026-09');
    openEditor('cat_groceries');
    expect(back()).toBe('step');
  });
});

describe('Cumulative Rollover without a Start Month (1.0.3 BUG-58)', () => {
  it('switching it on fills the Start Month with the viewed month', () => {
    viewMonth('2026-08');
    openEditor('cat_groceries');
    $('bdg-cumulative').checked = true;
    $('bdg-cumulative').dispatchEvent(new window.Event('change', { bubbles: true }));
    expect($('bdg-start').value).toBe('2026-08');
  });

  it('a start month already picked is kept', () => {
    viewMonth('2026-08');
    openEditor('cat_groceries');
    $('bdg-start').value = '2026-05';
    $('bdg-cumulative').checked = true;
    $('bdg-cumulative').dispatchEvent(new window.Event('change', { bubbles: true }));
    expect($('bdg-start').value).toBe('2026-05');
  });

  it('the save applies the same default', () => {
    viewMonth('2026-08');
    openEditor('cat_groceries');
    $('bdg-amount').value = '100';
    $('bdg-cumulative').checked = true; // no change event: the save still defaults
    $('btn-bdg-save').click();
    expect(rec()).toMatchObject({ amount: 100, isCumulative: true, startDate: '2026-08' });
  });
});

describe('End Month before Start Month, and clearing it (1.0.3 BUG-104)', () => {
  it('refuses an End Month before the Start Month with a field error', () => {
    openEditor('cat_groceries');
    $('bdg-amount').value = '100';
    $('bdg-start').value = '2026-08';
    $('bdg-end').value = '2026-05';
    $('btn-bdg-save').click();
    expect(BV().editCategoryId).toBe('cat_groceries');
    expect(rec()).toBeUndefined();
    expect($('bdg-end-error').textContent).toBe("End month can't be before the start month.");
    expect($('bdg-end').getAttribute('aria-invalid')).toBe('true');

    $('bdg-end').value = '2026-08'; // the same month is fine
    $('btn-bdg-save').click();
    expect(rec()).toMatchObject({ startDate: '2026-08', endDate: '2026-08' });
  });

  it('the End Month picker offers "No end date", which clears the field', () => {
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 100, startDate: '2026-01', endDate: '2026-12', isCumulative: false });
    openEditor('cat_groceries');
    expect($('bdg-end').value).toBe('2026-12');
    $('bdg-end').click();
    const clear = $('mp-clear');
    expect(clear).not.toBeNull();
    expect(clear.textContent.trim()).toBe('No end date');
    clear.click();
    expect($('bdg-end').value).toBe('');
    $('btn-bdg-save').click();
    expect(rec().endDate).toBeNull();
  });

  it('the Start Month picker has no clear button', () => {
    openEditor('cat_groceries');
    $('bdg-start').click();
    expect($('active-month-picker')).not.toBeNull();
    expect($('mp-clear')).toBeNull();
  });
});

describe('Remove Budget Limit asks first (1.0.3 BUG-105)', () => {
  beforeEach(() => {
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 300, startDate: '2026-01', endDate: null, isCumulative: true });
  });

  it('opens a confirmation; Remove clears the budget and closes the editor', () => {
    openEditor('cat_groceries');
    $('btn-bdg-delete').click();
    expect($('modal-title').textContent).toBe('Remove the Groceries budget?');
    expect($('modal-delete-btn').textContent).toBe('Remove Budget Limit');
    expect($('modal-save-btn').textContent).toBe('Cancel');
    expect(rec().amount).toBe(300);
    expect(BV().editCategoryId).toBe('cat_groceries');
    $('modal-delete-btn').click();
    expect(rec()).toMatchObject({ amount: 0, startDate: '', isCumulative: false });
    expect(BV().editCategoryId).toBeNull();
  });

  it('Cancel keeps the budget and the editor', () => {
    openEditor('cat_groceries');
    $('btn-bdg-delete').click();
    $('modal-save-btn').click();
    expect(rec().amount).toBe(300);
    expect(BV().editCategoryId).toBe('cat_groceries');
  });

  it('Android Back closes the sheet first and keeps the editor open', () => {
    openEditor('cat_groceries');
    $('btn-bdg-delete').click();
    openAll();
    expect(back()).toBe('sheet');
    expect($('active-modal').classList.contains('open')).toBe(false);
    expect(rec().amount).toBe(300);
    expect(BV().editCategoryId).toBe('cat_groceries');
    expect(back()).toBe('step'); // then the editor
    expect(BV().editCategoryId).toBeNull();
  });

  it('escapes the category name in the sheet title', () => {
    S().dispatch('ADD_CATEGORY', { name: '<img src=x onerror=alert(1)>', icon: 'pin', typeHint: 'expense' });
    const cat = S().getState().categories.find(c => c.name.startsWith('<img'));
    S().dispatch('SAVE_BUDGET', { categoryId: cat.id, amount: 10, startDate: '', endDate: null, isCumulative: false });
    openEditor(cat.id);
    $('btn-bdg-delete').click();
    expect($('modal-title').querySelector('img')).toBeNull();
    expect($('modal-title').textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('Goals summary and ring (1.0.3 BUG-160)', () => {
  const summary = () => rv().querySelector('.donut-chart-center').textContent;

  it('spending exactly the limit is not overspent and leaves €0.00, not -€0.00', () => {
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 100, startDate: '', endDate: null, isCumulative: false });
    const real = S().getBudgetForMonth.bind(S());
    S().getBudgetForMonth = (catId, ym) => (catId === 'cat_groceries'
      ? { allocated: 100, spent: 100.0000000000001, carryover: 0, finalLimit: 100 }
      : real(catId, ym));
    renderView();
    expect(summary()).toContain('Allocated');
    expect(summary()).not.toContain('Overspent');
    expect(rv().innerHTML).not.toContain('-€0.00');
    expect(rv().innerHTML).toMatch(/Remaining<\/span><br>\s*<strong style="color: var\(--color-income-val\);">€0\.00<\/strong>/);
    expect(charts[0].config.data.datasets[0].backgroundColor[0]).not.toBe('#ef4444');
  });

  it('a cent over is overspent, in the summary and the ring alike', () => {
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 100, startDate: '', endDate: null, isCumulative: false });
    spend(100.01, '2026-10-05');
    renderView();
    expect(summary()).toContain('Overspent');
    expect(summary()).toContain('€0.01');
    expect(charts[0].config.data.datasets[0].backgroundColor[0]).toBe('#ef4444');
  });

  it('the ring sums the rows the summary sums: no deleted-budget spend, no other tab', () => {
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 100, startDate: '', endDate: null, isCumulative: false });
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_dining', amount: 0, startDate: '', endDate: null, isCumulative: false }); // removed
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_salary', amount: 1000, startDate: '', endDate: null, isCumulative: false }); // income tab
    spend(50, '2026-10-05');
    spend(500, '2026-10-06', 'cat_dining');
    renderView();
    expect(summary()).toContain('€100.00');
    expect(charts[0].config.data.datasets[0].data).toEqual([50, 50]);
  });
});
