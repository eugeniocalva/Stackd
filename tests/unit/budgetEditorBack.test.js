import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.2 (BUG-86): the Goals limit editor is a step INSIDE #budget
// (BudgetView.editCategoryId), not a route and not a sheet. Android Back used
// to skip it: Router.handleBack went straight to history.back() (usually Home),
// dropped the typed limit without asking, and BudgetView.destroy() left
// editCategoryId set, so the next visit to Goals reopened the stale editor
// (autofocused: keyboard up, bottom bar hidden). Back now closes the editor
// to the list ('step'), after the shared "Discard changes?" sheet when a
// field changed ('confirm'), and leaving Goals closes it.
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

// What a row tap does, minus the emit: set the editor's category, render it
// into #router-view and attach (the baseline is taken there).
const openEditor = (catId) => {
  BV().editCategoryId = catId;
  rv().innerHTML = BV().render(S().getState());
  BV().attachEvents(rv(), S().getState());
};
const type = (id, value) => {
  const el = $(id);
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};

describe('Android Back on the Goals limit editor (1.0.2 BUG-86)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    document.body.innerHTML = '<main id="router-view"></main><nav id="bottom-nav"></nav><div id="modal-container"></div>';
    window.localStorage.clear();
    window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
    window.history.replaceState(null, '', '#budget');
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    executeFile('router.js');
    S().init();
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
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

  it('(a) Back on an untouched editor closes it and stays on Goals', () => {
    openEditor('cat_groceries');
    const hash = window.location.hash;
    expect(back()).toBe('step');
    expect(BV().editCategoryId).toBeNull();
    expect(window.history.back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(hash);
    expect(S().getState().activeView).toBe('budget');
  });

  it('(b) Back after typing a limit asks first; Cancel keeps editing, Discard closes without saving', () => {
    openEditor('cat_groceries');
    type('bdg-amount', '200');
    expect(back()).toBe('confirm');
    expect($('modal-title').textContent).toBe('Discard changes?');
    openAll();
    // A second Back hits the sheet's Cancel: keep editing.
    expect(back()).toBe('sheet');
    expect($('bdg-amount').value).toBe('200');
    expect(BV().editCategoryId).toBe('cat_groceries');
    // Back again asks again; Discard closes to the list.
    expect(back()).toBe('confirm');
    $('modal-save-btn').click();
    expect(BV().editCategoryId).toBeNull();
    expect(S().getState().budgets.find(b => b.categoryId === 'cat_groceries')).toBeUndefined();
    expect(window.history.back).not.toHaveBeenCalled();
  });

  it('(c) a picked month or the rollover switch counts as a change', () => {
    openEditor('cat_groceries');
    $('bdg-start').value = '2026-08'; // what MonthPicker's onSelect writes
    expect(back()).toBe('confirm');

    document.getElementById('modal-container').innerHTML = '';
    openEditor('cat_transport');
    $('bdg-cumulative').checked = true;
    expect(back()).toBe('confirm');
  });

  it('(d) an existing budget, opened and left alone, closes without a prompt', () => {
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 100, startDate: '', endDate: null, isCumulative: false });
    openEditor('cat_groceries');
    expect($('bdg-amount').value).toBe('100');
    expect(back()).toBe('step');
    expect(BV().editCategoryId).toBeNull();
  });

  it('(e) a second editor never inherits the first one\'s baseline', () => {
    openEditor('cat_groceries');
    type('bdg-amount', '50');
    expect(back()).toBe('confirm');
    $('modal-save-btn').click();
    expect(BV().editCategoryId).toBeNull();
    openEditor('cat_transport');
    expect(back()).toBe('step');
  });

  it('(f) leaving Goals closes the editor (no stale, autofocused editor on the next visit)', () => {
    openEditor('cat_groceries');
    BV().destroy();
    expect(BV().editCategoryId).toBeNull();
    const html = BV().render(S().getState());
    expect(html).toContain('budget-cat-row');
    expect(html).not.toContain('bdg-amount');
  });

  it('(g) an unparseable typed amount (type=number badInput) still counts as a change', () => {
    openEditor('cat_groceries');
    // jsdom never reports badInput; a real type=number field holding '1,500'
    // reports value '' with validity.badInput true.
    Object.defineProperty($('bdg-amount'), 'validity', { value: { badInput: true }, configurable: true });
    expect(back()).toBe('confirm');
  });

  // On Android the first Back with the soft keyboard up only hides the
  // keyboard: #bdg-amount keeps focus, and KeyboardManager keeps
  // body.keyboard-active (bottom bar hidden) while an INPUT is focused. The
  // list re-render removes the field without a focusout, so closeEditor must
  // blur it itself. Checked synchronously: jsdom's own focus fixup on a later
  // re-render would hide a missing blur.
  it('(h) closing the editor blurs the focused field (keyboard-active is dropped)', () => {
    openEditor('cat_groceries');
    $('bdg-amount').focus();
    expect(document.activeElement).toBe($('bdg-amount'));
    expect(back()).toBe('step');
    expect(document.activeElement).toBe(document.body);
  });

  it('(i) the Discard path blurs the focused field too', () => {
    openEditor('cat_groceries');
    $('bdg-amount').focus();
    type('bdg-amount', '120');
    expect(back()).toBe('confirm');
    $('modal-save-btn').click();
    expect(BV().editCategoryId).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it('the editor ← arrow stays an explicit, silent discard', () => {
    openEditor('cat_groceries');
    type('bdg-amount', '75');
    $('btn-bdg-back').click();
    expect(BV().editCategoryId).toBeNull();
    expect(document.getElementById('modal-title')).toBeNull();
    expect(S().getState().budgets.find(b => b.categoryId === 'cat_groceries')).toBeUndefined();
  });

  it('the budget step is inert outside Goals and without an open editor', () => {
    S().dispatch('SET_VIEW', 'analytics');
    BV().editCategoryId = 'cat_groceries'; // stale value on another view
    expect(back()).toBe('back');
    expect(window.history.back).toHaveBeenCalledTimes(1);
    BV().editCategoryId = null;
    S().dispatch('SET_VIEW', 'budget');
    expect(back()).toBe('back'); // the budget list itself: plain route back
    expect(window.history.back).toHaveBeenCalledTimes(2);
  });
});
