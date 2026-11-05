// @vitest-environment jsdom
// 1.2.0 (UX-9, docs/ux-review-1.2-plan.md §C.2/§C.3) — Components.TagPickerSheet,
// the category-scoped tag picker that replaced the orphan TagsModal, and the
// transaction form's readonly Tags trigger that opens it.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'document', 'localStorage', 'crypto', content);
  fn(window, document, window.localStorage, window.crypto);
};

const S = () => window.Store;
const C = () => window.Components;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const tick = () => new Promise(r => setTimeout(r, 0));
const sheet = () => $('#tag-picker-sheet');
const rowTags = (sectionId) => $$(`#${sectionId} .tps-row`).map(r => r.dataset.tag);
const type = (text) => {
  const input = $('#tps-search');
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

let accId;
const addTx = (over) => S().dispatch('ADD_TRANSACTION', {
  type: 'expense', amount: 5, accountId: accId, categoryId: 'cat_groceries', date: '2026-10-02', tags: [], ...over
});

describe('Components.TagPickerSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-container"></div><main id="router-view"></main>';
    window.localStorage.clear();
    window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
    if (!window.crypto || !window.crypto.randomUUID) {
      let n = 0;
      Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'uuid-' + (++n) }, writable: true, configurable: true });
    }
    window.StackdHydrateIcons = vi.fn();
    ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js'].forEach(executeFile);
    S().init();
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0, openingDate: '2026-01-01' });
    accId = S().getState().accounts[0].id;
    addTx({ categoryId: 'cat_groceries', tags: ['milk', 'bread'] });
    addTx({ categoryId: 'cat_dining', tags: ['pizza', 'bread'] });
    S().dispatch('LINK_TAG', { tag: 'apples', categoryId: 'cat_groceries' });
    S().dispatch('LINK_TAG', { tag: 'zoo', categoryId: null });
  });

  it('renders the full-screen sheet with its ids, labels and dismiss control', () => {
    C().TagPickerSheet.show({ selectedTags: [], categoryId: 'cat_groceries', onApply() {} });
    const el = sheet();
    expect(el).toBeTruthy();
    expect(el.classList.contains('modal-backdrop')).toBe(true);
    expect(el.classList.contains('open')).toBe(true);
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-labelledby')).toBe('tps-title');
    expect($('#tps-title').textContent).toBe('Tags');
    const close = $('#tps-close');
    expect(close.classList.contains('modal-btn-close')).toBe(true);
    expect(close.getAttribute('aria-label')).toBe('Close tag selection');
    expect($('#tps-add').getAttribute('aria-label')).toBe('Create the tag you typed');
    expect($('#tps-apply').classList.contains('tps-apply')).toBe(true);
    expect($('#tps-apply').getAttribute('aria-label')).toBe('Apply tags');
    const search = $('#tps-search');
    expect(search.classList.contains('form-control')).toBe(true);
    expect(search.getAttribute('placeholder')).toBe('Search or create a tag');
    expect(search.getAttribute('autocomplete')).toBe('off');
    expect($('#tps-selected').textContent).toContain('No tags');
  });

  it('lists the category’s tags first, then every other tag, each alphabetically', () => {
    C().TagPickerSheet.show({ selectedTags: [], categoryId: 'cat_groceries', onApply() {} });
    expect($('#tps-section-category .tps-section-title').textContent).toBe('In Groceries');
    expect(rowTags('tps-section-category')).toEqual(['apples', 'bread', 'milk']);
    expect($('#tps-section-all .tps-section-title').textContent).toBe('All tags');
    expect(rowTags('tps-section-all')).toEqual(['pizza', 'zoo']);
    $$('.tps-row').forEach(r => expect(r.classList.contains('touch-target')).toBe(true));
  });

  it('with no category, or for a transfer, shows only All tags', () => {
    C().TagPickerSheet.show({ selectedTags: [], categoryId: '', onApply() {} });
    expect($('#tps-section-category')).toBeNull();
    expect(rowTags('tps-section-all')).toEqual(['apples', 'bread', 'milk', 'pizza', 'zoo']);
    C().TagPickerSheet.show({ selectedTags: [], categoryId: 'cat_groceries', typeHint: 'transfer', onApply() {} });
    expect($$('#tag-picker-sheet')).toHaveLength(1);
    expect($('#tps-section-category')).toBeNull();
  });

  it('marks the selected tags and toggles a row on tap', () => {
    C().TagPickerSheet.show({ selectedTags: ['milk'], categoryId: 'cat_groceries', onApply() {} });
    const milk = () => $('.tps-row[data-tag="milk"]');
    expect(milk().getAttribute('aria-checked')).toBe('true');
    expect($$('#tps-selected .tps-chip').map(c => c.dataset.tag)).toEqual(['milk']);
    $('.tps-row[data-tag="pizza"]').click();
    expect($('.tps-row[data-tag="pizza"]').getAttribute('aria-checked')).toBe('true');
    milk().click();
    expect(milk().getAttribute('aria-checked')).toBe('false');
    expect($$('#tps-selected .tps-chip').map(c => c.dataset.tag)).toEqual(['pizza']);
    $('#tps-selected .tps-chip').click(); // a chip tap removes it
    expect($$('#tps-selected .tps-chip')).toHaveLength(0);
  });

  it('search filters both lists by lowercase substring and shows the empty state', () => {
    C().TagPickerSheet.show({ selectedTags: [], categoryId: 'cat_groceries', onApply() {} });
    type('QQ');
    expect($('#tps-section-category')).toBeNull();
    expect($('#tps-empty').textContent).toBe('No tags yet. Type a name and tap + to create one.');
    type('#P');
    expect(rowTags('tps-section-category')).toEqual(['apples']);
    expect(rowTags('tps-section-all')).toEqual(['pizza']);
    type('');
    expect(rowTags('tps-section-category')).toEqual(['apples', 'bread', 'milk']);
  });

  it('+ creates the typed tag through Store.normalizeTag, selects it and clears the search', () => {
    C().TagPickerSheet.show({ selectedTags: [], categoryId: 'cat_groceries', onApply() {} });
    type('  #Road   Trip ');
    $('#tps-add').click();
    expect($('#tps-search').value).toBe('');
    const row = $('.tps-row[data-tag="road trip"]');
    expect(row.closest('#tps-section-category')).toBeTruthy();
    expect(row.getAttribute('aria-checked')).toBe('true');
    expect(row.querySelector('.tps-row-new').textContent).toBe('New');
    expect(S().getState().tagLinks['road trip']).toBeUndefined(); // nothing saved before Apply
  });

  it('Enter in the search selects an existing tag (not marked new); an empty or reserved name is ignored', () => {
    C().TagPickerSheet.show({ selectedTags: [], categoryId: '', onApply() {} });
    type('PIZZA');
    $('#tps-search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect($('.tps-row[data-tag="pizza"]').getAttribute('aria-checked')).toBe('true');
    expect($('.tps-row[data-tag="pizza"] .tps-row-new')).toBeNull();
    ['   ', '__untagged__'].forEach(v => { type(v); $('#tps-add').click(); });
    expect($$('#tps-selected .tps-chip').map(c => c.dataset.tag)).toEqual(['pizza']);
  });

  it('Apply calls onApply and links silently, with no re-render', async () => {
    const onApply = vi.fn();
    C().TagPickerSheet.show({ selectedTags: ['bread'], categoryId: 'cat_groceries', onApply });
    $('.tps-row[data-tag="pizza"]').click();
    type('Fresh');
    $('#tps-add').click();
    await tick();
    const seen = vi.fn();
    S().subscribe(seen);
    const save = vi.spyOn(window.StackdDB, 'save');
    $('#tps-apply').click();
    expect(onApply).toHaveBeenCalledWith(['bread', 'pizza', 'fresh']);
    const links = S().getState().tagLinks;
    expect(links.pizza).toEqual(['cat_groceries']);
    expect(links.fresh).toEqual(['cat_groceries']);
    expect(links.bread).toBeUndefined(); // already linked through a saved row: no write
    expect(save.mock.calls.map(c => c[0])).toEqual(['tagLinks', 'tagLinks']);
    expect(S()._emitQueued).toBeFalsy();
    await tick();
    expect(seen).not.toHaveBeenCalled();
    expect(sheet().classList.contains('open')).toBe(false);
  });

  it("Apply links a tag named 'constructor' like any other", () => {
    const onApply = vi.fn();
    C().TagPickerSheet.show({ selectedTags: [], categoryId: 'cat_groceries', onApply });
    type('constructor');
    $('#tps-add').click();
    type('valueOf');
    $('#tps-add').click();
    expect(() => $('#tps-apply').click()).not.toThrow();
    expect(onApply).toHaveBeenCalledWith(['constructor', 'valueof']);
    expect(S().getState().tagLinks.constructor).toEqual(['cat_groceries']);
    expect(S().getState().tagLinks.valueof).toEqual(['cat_groceries']);
  });

  it('Apply with no category links only the tags created in the sheet, unlinked', () => {
    const onApply = vi.fn();
    C().TagPickerSheet.show({ selectedTags: [], categoryId: '', onApply });
    $('.tps-row[data-tag="milk"]').click();
    type('brand new');
    $('#tps-add').click();
    type('dropped');
    $('#tps-add').click();
    $('.tps-chip[data-tag="dropped"]').click(); // created, then deselected: never saved
    $('#tps-apply').click();
    expect(onApply).toHaveBeenCalledWith(['milk', 'brand new']);
    expect(S().getState().tagLinks['brand new']).toEqual([]);
    expect(S().getState().tagLinks.milk).toBeUndefined();
    expect(S().getState().tagLinks.dropped).toBeUndefined();
  });

  it('✕, the backdrop and Android Back close it without applying', () => {
    const onApply = vi.fn();
    const before = JSON.stringify(S().getState().tagLinks);
    C().TagPickerSheet.show({ selectedTags: [], categoryId: 'cat_groceries', onApply });
    type('nope'); $('#tps-add').click();
    $('#tps-close').click();
    expect(sheet().classList.contains('open')).toBe(false);

    C().TagPickerSheet.show({ selectedTags: [], categoryId: 'cat_groceries', onApply });
    sheet().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(sheet().classList.contains('open')).toBe(false);

    C().TagPickerSheet.show({ selectedTags: [], categoryId: 'cat_groceries', onApply });
    expect(C().dismissTopSheet()).toBe(true);
    expect(sheet().classList.contains('open')).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
    expect(JSON.stringify(S().getState().tagLinks)).toBe(before);
  });

  it('tag and category names render as text', () => {
    S().dispatch('ADD_CATEGORY', { id: 'c_evil', name: '<img id="x-cat">', icon: 'pin', typeHint: 'both' });
    addTx({ categoryId: 'c_evil', tags: ['<b id="x-tag">t</b>'] });
    C().TagPickerSheet.show({ selectedTags: ['"><i id="x-sel">'], categoryId: 'c_evil', onApply() {} });
    expect(document.getElementById('x-cat')).toBeNull();
    expect(document.getElementById('x-tag')).toBeNull();
    expect(document.getElementById('x-sel')).toBeNull();
    expect($('#tps-section-category .tps-section-title').textContent).toBe('In <img id="x-cat">');
    expect($$('.tps-row').map(r => r.dataset.tag)).toContain('<b id="x-tag">t</b>');
  });
});

describe('transaction form Tags trigger', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="modal-container"></div><main id="router-view"></main>';
    window.localStorage.clear();
    window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
    window.StackdHydrateIcons = vi.fn();
    window.Router = { getParams: () => ({}), navigate: vi.fn(), leave: vi.fn() };
    ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'views.js'].forEach(executeFile);
    S().init();
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0, openingDate: '2026-01-01' });
    accId = S().getState().accounts[0].id;
    addTx({ categoryId: 'cat_groceries', tags: ['milk'] });
  });

  const renderForm = () => {
    const root = document.getElementById('router-view');
    const state = S().getState();
    state.activeView = 'add';
    root.innerHTML = window.Views.AddTransactionView.render(state);
    window.Views.AddTransactionView.attachEvents(root, state);
    return root;
  };

  it("TagsView renders a tag named 'constructor' with its own count and links", () => {
    addTx({ categoryId: 'cat_dining', tags: ['constructor'] });
    S().dispatch('LINK_TAG', { tag: 'tostring', categoryId: null });
    const html = window.Views.TagsView.render(S().getState());
    const root = document.getElementById('router-view');
    root.innerHTML = html;
    const row = root.querySelector('[data-tag-open="constructor"]');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('1 transaction');
    expect(row.textContent).toContain('Dining');
    const unused = root.querySelector('[data-tag-open="tostring"]');
    expect(unused.textContent).toContain('0 transactions');
  });

  it('keeps a readonly #tx-tags-input labelled by the Tags label, and no inline autocomplete', () => {
    const root = renderForm();
    const input = root.querySelector('#tx-tags-input');
    expect(input).toBeTruthy();
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute('inputmode')).toBe('none');
    expect(root.querySelector('label[for="tx-tags-input"]')).toBeTruthy();
    expect(root.querySelector('#tx-tags-autocomplete')).toBeNull();
  });

  it('a tap opens the picker for the chosen category; Apply fills the chips without re-rendering the form', async () => {
    const root = renderForm();
    const cat = root.querySelector('#tx-category');
    cat.value = 'cat_groceries';
    root.querySelector('#tx-comment').value = 'unsaved note';
    root.querySelector('#tx-tags-input').click();
    expect(sheet()).toBeTruthy();
    expect(rowTags('tps-section-category')).toEqual(['milk']);
    type('weekly');
    $('#tps-add').click();
    $('#tps-apply').click();
    await tick();
    expect(Array.from(root.querySelectorAll('.tag-chip')).map(c => c.dataset.tag)).toEqual(['weekly']);
    expect(root.querySelector('#tx-comment').value).toBe('unsaved note'); // same DOM: no re-render
    expect(S().getState().tagLinks.weekly).toEqual(['cat_groceries']);
  });

  it('Enter on the trigger opens it; removing a chip does not', () => {
    const root = renderForm();
    root.querySelector('#tx-tags-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(sheet()).toBeTruthy();
    $('#tps-close').click();
    sheet().remove();
    root.querySelector('#tx-tags-input').click();
    $('.tps-row[data-tag="milk"]').click();
    $('#tps-apply').click();
    sheet().remove();
    root.querySelector('.tag-chip .remove-tag').click();
    expect(root.querySelectorAll('.tag-chip')).toHaveLength(0);
    expect(sheet()).toBeNull();
  });
});
