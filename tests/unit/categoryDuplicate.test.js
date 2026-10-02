import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-11, UI side): category names are unique across every type,
// trimmed and case-insensitive — a duplicate made the by-name CSV restore merge
// two categories. Both creation paths (EditCategoryView, the transaction form's
// "New category" sheet) refuse one inline. Store stays ungated (imports).
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const $ = (id) => document.getElementById(id);
const S = () => global.window.Store;
let params = {};
let container;

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
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('i18n/fr.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  S().init();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
};

const renderView = (name) => {
  const view = global.window.Views[name];
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

const countNamed = (name) => S().getState().categories.filter(c => c.name.trim().toLowerCase() === name.toLowerCase()).length;

describe('Store.findCategoryByName (1.0.1 BUG-11)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => vi.useRealTimers());

  it('is trimmed, case-insensitive and type-agnostic', () => {
    expect(S().findCategoryByName('  groceries ').id).toBe('cat_groceries');
    expect(S().findCategoryByName('SALARY').id).toBe('cat_salary'); // an income category
    expect(S().findCategoryByName('Nope')).toBeNull();
    expect(S().findCategoryByName('   ')).toBeNull();
    expect(S().findCategoryByName(null)).toBeNull();
  });

  it('honours exceptId', () => {
    expect(S().findCategoryByName('Groceries', 'cat_groceries')).toBeNull();
    S().dispatch('ADD_CATEGORY', { id: 'cat_dup', name: 'Groceries ', icon: 'pin', typeHint: 'expense' });
    expect(S().findCategoryByName('groceries', 'cat_groceries').id).toBe('cat_dup');
  });
});

describe('EditCategoryView uniqueness (1.0.1 BUG-11 / BUG-18)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => vi.useRealTimers());

  it('new mode refuses an existing name, inline and localized', () => {
    renderView('EditCategoryView');
    $('edit-cat-name').value = ' groceries ';
    $('btn-save-category').click();
    expect(countNamed('groceries')).toBe(1);
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
    expect($('edit-cat-name-error').textContent).toBe('A category called "Groceries" already exists.');
    expect($('edit-cat-name').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe($('edit-cat-name'));
  });

  it('the duplicate check ignores the type (an income name clashes too)', () => {
    renderView('EditCategoryView');
    $('edit-cat-name').value = 'Salary';
    $('edit-cat-type').value = 'expense';
    $('btn-save-category').click();
    expect(countNamed('salary')).toBe(1);
    expect($('edit-cat-name-error')).not.toBeNull();
  });

  it('in French the message is French', () => {
    global.window.I18n.setLang('fr');
    renderView('EditCategoryView');
    $('edit-cat-name').value = 'Groceries';
    $('btn-save-category').click();
    expect($('edit-cat-name-error').textContent).toBe('Une catégorie nommée « Groceries » existe déjà.');
  });

  it('an empty name gets its own message', () => {
    renderView('EditCategoryView');
    $('edit-cat-name').value = '   ';
    $('btn-save-category').click();
    expect($('edit-cat-name-error').textContent).toBe('Enter a category name.');
  });

  it('a unique name is created', () => {
    renderView('EditCategoryView');
    $('edit-cat-name').value = 'Pets';
    $('btn-save-category').click();
    expect(countNamed('pets')).toBe(1);
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#categories');
  });

  it('renaming onto another category is refused; re-casing itself is allowed', () => {
    S().dispatch('ADD_CATEGORY', { id: 'cat_pets', name: 'Pets', icon: 'pin', typeHint: 'expense' });
    params = { id: 'cat_pets' };
    renderView('EditCategoryView');
    $('edit-cat-name').value = 'Rent';
    $('btn-save-category').click();
    expect($('edit-cat-name-error')).not.toBeNull();
    expect(S().getState().categories.find(c => c.id === 'cat_pets').name).toBe('Pets');

    $('edit-cat-name').value = 'PETS';
    $('btn-save-category').click();
    expect(S().getState().categories.find(c => c.id === 'cat_pets').name).toBe('PETS');
  });

  it('an existing duplicate can still save a type/icon-only edit', () => {
    S().dispatch('ADD_CATEGORY', { id: 'cat_dup', name: 'Groceries', icon: 'pin', typeHint: 'expense' });
    params = { id: 'cat_dup' };
    renderView('EditCategoryView');
    expect($('edit-cat-name').value).toBe('Groceries');
    $('edit-cat-type').value = 'both';
    $('btn-save-category').click();
    expect($('edit-cat-name-error')).toBeNull();
    expect(S().getState().categories.find(c => c.id === 'cat_dup').typeHint).toBe('both');
  });

  it('a quote in the name survives the value attribute', () => {
    S().dispatch('ADD_CATEGORY', { id: 'cat_q', name: 'Mum\'s "fund"', icon: 'pin', typeHint: 'expense' });
    params = { id: 'cat_q' };
    renderView('EditCategoryView');
    expect($('edit-cat-name').value).toBe('Mum\'s "fund"');
  });
});

describe('Transaction form "New category" sheet (1.0.1 BUG-11 / BUG-18)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    boot();
    global.window.Components.IconPicker = { show: vi.fn() };
    renderView('AddTransactionView');
    $('btn-add-category').click();
  });
  afterEach(() => vi.useRealTimers());

  const saveSheet = () => $('modal-save-btn').click();

  it('stays open and explains a duplicate name', () => {
    const before = S().getState().categories.length;
    $('new-cat-name').value = 'GROCERIES';
    saveSheet();
    expect(S().getState().categories.length).toBe(before);
    expect($('active-modal')).not.toBeNull();
    expect($('new-cat-name-error').textContent).toBe('A category called "Groceries" already exists.');
  });

  it('stays open and explains an empty name', () => {
    $('new-cat-name').value = '';
    saveSheet();
    expect($('active-modal')).not.toBeNull();
    expect($('new-cat-name-error').textContent).toBe('Enter a category name.');
  });

  it('creates a unique name', () => {
    $('new-cat-name').value = 'Pets';
    saveSheet();
    expect(countNamed('pets')).toBe(1);
  });
});
