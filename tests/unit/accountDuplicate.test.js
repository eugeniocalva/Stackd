import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-30, UI side): account names are unique across every currency and
// type, trimmed and case-insensitive (D-U5-6) — backups name an account by its
// name, and a restore merged two "Visa" accounts into one. EditAccountView
// refuses a duplicate inline, only when the name actually changes (D-U5-7).
// Store.findAccountByName itself is covered by findAccountByName.test.js (F0).
// Plus the 1.0.2 (BUG-24) rider: the delete sheet escapes the account name.
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
  const bag = { stackd_v1_homeWidgets: '[]' };
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: {
      getItem: vi.fn((k) => (k in bag ? bag[k] : null)),
      setItem: vi.fn((k, v) => { bag[k] = String(v); }),
      removeItem: vi.fn((k) => { delete bag[k]; })
    },
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
};

const renderForm = (id) => {
  params = id ? { id } : {};
  const view = global.window.Views.EditAccountView;
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

const save = (name) => {
  $('edit-acc-name').value = name;
  $('btn-edit-acc-save').click();
};

const named = (name) => S().getState().accounts.filter(a => a.name.trim().toLowerCase() === name.toLowerCase());
const idOf = (name) => S().getState().accounts.find(a => a.name === name).id;

describe('EditAccountView refuses duplicate names (1.0.2 BUG-30)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('new mode: " visa " next to "Visa" shows the inline error and creates nothing', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Visa', type: 'Credit card', currency: 'EUR', openingBalance: 0 });
    renderForm();
    const spy = vi.spyOn(S(), 'dispatch');
    save(' visa ');

    const err = $('edit-acc-name-error');
    expect(err).not.toBeNull();
    expect(err.textContent).toBe('An account called "Visa" already exists.');
    expect($('edit-acc-name').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe($('edit-acc-name'));
    expect(named('visa')).toHaveLength(1);
    expect(spy.mock.calls.filter(c => c[0] === 'ADD_ACCOUNT')).toHaveLength(0);
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
  });

  it('the same name in another currency is refused too (D-U5-6)', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Revolut', currency: 'USD', openingBalance: 0 });
    renderForm();
    $('edit-acc-currency').value = 'EUR';
    save('revolut');

    expect($('edit-acc-name-error').textContent).toBe('An account called "Revolut" already exists.');
    expect(named('revolut')).toHaveLength(1);
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
  });

  it('renaming onto another account\'s name is refused; re-casing its own name saves', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Visa', openingBalance: 0 });
    S().dispatch('ADD_ACCOUNT', { name: 'Amex', openingBalance: 0 });
    const amexId = idOf('Amex');

    renderForm(amexId);
    save('VISA');
    expect($('edit-acc-name-error').textContent).toBe('An account called "Visa" already exists.');
    expect(S().getState().accounts.find(a => a.id === amexId).name).toBe('Amex');
    expect(global.window.Router.navigate).not.toHaveBeenCalled();

    S().dispatch('UPDATE_ACCOUNT', { id: idOf('Visa'), name: 'visa' });
    const visaId = idOf('visa');
    renderForm(visaId);
    const spy = vi.spyOn(S(), 'dispatch');
    save('Visa');
    expect($('edit-acc-name-error')).toBeNull();
    expect(spy).toHaveBeenCalledWith('UPDATE_ACCOUNT', expect.objectContaining({ id: visaId, name: 'Visa' }));
    expect(S().getState().accounts.find(a => a.id === visaId).name).toBe('Visa');
  });

  it('guard: an existing duplicate pair can still save a colour-only edit (D-U5-7)', () => {
    S().dispatch('ADD_ACCOUNT', { id: 'dup1', name: 'Visa', openingBalance: 0 });
    S().dispatch('ADD_ACCOUNT', { id: 'dup2', name: 'Visa', openingBalance: 0 });
    renderForm('dup2');
    const swatch = [...container.querySelectorAll('.color-swatch-btn')]
      .find(b => b.dataset.color !== S().getState().accounts.find(a => a.id === 'dup2').color);
    swatch.click();
    const spy = vi.spyOn(S(), 'dispatch');
    $('btn-edit-acc-save').click();

    expect($('edit-acc-name-error')).toBeNull();
    expect(spy).toHaveBeenCalledWith('UPDATE_ACCOUNT', expect.objectContaining({ id: 'dup2', name: 'Visa', color: swatch.dataset.color }));
    expect(global.window.Router.navigate).toHaveBeenCalled();
  });

  it('the error is localized (French)', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Visa', openingBalance: 0 });
    S().dispatch('SET_LANGUAGE', 'fr');
    renderForm();
    save('visa');
    expect($('edit-acc-name-error').textContent).toBe('Un compte nommé « Visa » existe déjà.');
  });
});

describe('Account delete sheet escapes the name (1.0.2 BUG-24 rider)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a name holding markup renders as text in the confirmation', () => {
    const evil = 'Pot<img src=x id="inj">';
    S().dispatch('ADD_ACCOUNT', { name: evil, openingBalance: 0 });
    renderForm(idOf(evil));
    expect($('inj')).toBeNull();
    $('btn-edit-acc-delete').click();

    expect($('inj')).toBeNull();
    expect(document.querySelector('#active-modal .modal-body').textContent).toContain(evil);
  });

  // Review round 1: escaped exactly once — a second escape (e.g. a later
  // sweep wrapping this sink again) would show "Tom &amp; Jerry".
  it('a name with "&" reads literally, escaped exactly once', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Tom & Jerry', openingBalance: 0 });
    renderForm(idOf('Tom & Jerry'));
    $('btn-edit-acc-delete').click();

    const text = document.querySelector('#active-modal .modal-body').textContent;
    expect(text).toContain('Tom & Jerry');
    expect(text).not.toContain('&amp;');
  });

  // Review round 1: views.js must not depend on a fresh i18n.js here — a
  // WebView holding a cached pre-1.0.2 i18n.js (no I18n.esc) next to the new
  // views.js threw inside the click listener and the sheet never opened.
  it('opens even when I18n.esc is missing (stale cached i18n.js)', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
    renderForm(idOf('Savings'));
    delete global.window.I18n.esc;
    $('btn-edit-acc-delete').click();

    expect(document.querySelector('#active-modal .modal-body').textContent).toContain('Savings');
  });
});
