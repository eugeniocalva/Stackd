import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-01): switching the base currency used to apply on the first tap
// and silently zero every total (every account carries an explicit currency,
// so the old base's accounts all became "foreign"). Now: SET_CURRENCY also
// takes { code, relabel }, Store.currencySwitchImpact() drives a shared
// Components.CurrencySwitchConfirm, the Settings picker is select → Done →
// confirm, and onboarding respects the base its existing accounts use.
// Same executeFile pattern as store.test.js — src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// main.js is the boot script (DOMContentLoaded etc.), so only the onboarding
// function is pulled out of it and evaluated against the test globals.
const loadRegionSetup = () => {
  const src = readFileSync(resolve(__dirname, '../../src/main.js'), 'utf8');
  const start = src.indexOf('function _showRegionSetupModal(');
  expect(start).toBeGreaterThan(-1);
  const fn = new Function('window', 'localStorage', 'crypto', src.slice(start) + '\nreturn _showRegionSetupModal;');
  return fn(global.window, global.window.localStorage, global.window.crypto);
};

const accountsSaves = () => window.localStorage.setItem.mock.calls.filter(c => c[0] === 'stackd_v1_accounts');
const currencyDispatches = (spy) => spy.mock.calls.filter(c => c[0] === 'SET_CURRENCY');

let uid = 0;
const freshWindow = (getItem) => {
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: { getItem: vi.fn(getItem || (() => null)), setItem: vi.fn(), removeItem: vi.fn() },
    StackdHydrateIcons: vi.fn(),
    Router: { navigate: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
};

const bootStore = ({ ui = false } = {}) => {
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('store.js');
  if (ui) {
    executeFile('components.js');
    executeFile('views.js');
  }
  window.Store.init();
};

const acc = (name) => window.Store.getState().accounts.find(a => a.name === name);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  }
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

// ── Store ───────────────────────────────────────────────────────────────────

describe('SET_CURRENCY payloads (1.0.1 BUG-01)', () => {
  beforeEach(() => {
    freshWindow();
    bootStore();
    // USD base: Checking (USD, 100), Euro Trip (EUR, 50)
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Checking', openingBalance: 0 });
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Euro Trip', openingBalance: 0, currency: 'EUR' });
    window.Store.dispatch('ADD_TRANSACTION', { type: 'income', amount: 100, accountId: acc('Checking').id, categoryId: 'cat_salary', date: '2026-09-10' });
    window.Store.dispatch('ADD_TRANSACTION', { type: 'income', amount: 50, accountId: acc('Euro Trip').id, categoryId: 'cat_salary', date: '2026-09-10' });
    window.localStorage.setItem.mockClear();
  });

  it('still accepts the plain string payload (onboarding, cross-tab, tests)', () => {
    window.Store.dispatch('SET_CURRENCY', 'EUR');
    expect(window.Store.getState().currency).toBe('EUR');
    expect(acc('Checking').currency).toBe('USD');
    expect(window.Store.getGlobalBalance()).toBe(50);
    expect(window.Store.foreignAccountCount()).toBe(1);
    expect(accountsSaves()).toHaveLength(0);
    expect(window.localStorage.setItem).toHaveBeenCalledWith('stackd_v1_currency', JSON.stringify('EUR'));
  });

  it('{ relabel: false } behaves exactly like the string payload', () => {
    window.Store.dispatch('SET_CURRENCY', { code: 'EUR', relabel: false });
    expect(window.Store.getState().currency).toBe('EUR');
    expect(acc('Checking').currency).toBe('USD');
    expect(window.Store.getGlobalBalance()).toBe(50);
    expect(accountsSaves()).toHaveLength(0);
  });

  it('{ relabel: true } moves every old-base account to the new code and saves once', () => {
    window.Store.dispatch('ADD_ACCOUNT', { name: 'London', openingBalance: 0, currency: 'GBP' });
    window.localStorage.setItem.mockClear();

    window.Store.dispatch('SET_CURRENCY', { code: 'EUR', relabel: true });
    expect(window.Store.getState().currency).toBe('EUR');
    expect(acc('Checking').currency).toBe('EUR');
    expect(acc('Euro Trip').currency).toBe('EUR');
    expect(acc('London').currency).toBe('GBP'); // only the OLD base moves
    expect(window.Store.getGlobalBalance()).toBe(150);
    expect(window.Store.foreignAccountCount()).toBe(1);
    const saves = accountsSaves();
    expect(saves).toHaveLength(1);
    const written = JSON.parse(saves[0][1]);
    expect(written.find(a => a.name === 'Checking').currency).toBe('EUR');
  });

  it('{ relabel: true } to the current base changes no account', () => {
    window.Store.dispatch('SET_CURRENCY', { code: 'USD', relabel: true });
    expect(window.Store.getState().currency).toBe('USD');
    expect(acc('Euro Trip').currency).toBe('EUR');
    expect(accountsSaves()).toHaveLength(0);
  });

  it('ignores a payload without a code', () => {
    window.Store.dispatch('SET_CURRENCY', { relabel: true });
    window.Store.dispatch('SET_CURRENCY', null);
    expect(window.Store.getState().currency).toBe('USD');
    expect(acc('Checking').currency).toBe('USD');
  });

  it('relabels into JPY without touching the stored amounts', () => {
    window.Store.dispatch('ADD_TRANSACTION', { type: 'income', amount: 12.5, accountId: acc('Checking').id, categoryId: 'cat_salary', date: '2026-09-11' });
    const before = window.Store.getAccountBalance(acc('Checking').id);
    window.Store.dispatch('SET_CURRENCY', { code: 'JPY', relabel: true });
    expect(acc('Checking').currency).toBe('JPY');
    expect(window.Store.getAccountBalance(acc('Checking').id)).toBe(before);
    expect(before).toBe(112.5);
    // label only: JPY formatting drops the decimals, the number stays 112.5
    expect(window.Store.getGlobalBalance()).toBe(112.5);
  });

  it('currencySwitchImpact reports what a switch would do', () => {
    expect(window.Store.currencySwitchImpact('EUR')).toEqual({ total: 2, relabelable: 1, excluded: 1, primaryAfter: 1 });
    expect(window.Store.currencySwitchImpact('GBP')).toEqual({ total: 2, relabelable: 1, excluded: 2, primaryAfter: 0 });
    expect(window.Store.currencySwitchImpact('USD')).toEqual({ total: 2, relabelable: 0, excluded: 1, primaryAfter: 1 });
  });
});

// ── Settings picker + confirm sheet ─────────────────────────────────────────

describe('Settings currency picker (1.0.1 BUG-01)', () => {
  let spy;
  const openPicker = () => {
    const view = window.Views.OthersView;
    const root = document.getElementById('router-view');
    root.innerHTML = view.render(window.Store.getState());
    view.attachEvents(root, window.Store.getState());
    document.getElementById('btn-open-currency').click();
  };
  const opt = (code) => document.querySelector(`.currency-opt[data-code="${code}"]`);
  const click = (id) => document.getElementById(id).click();
  const title = () => document.getElementById('modal-title').textContent;

  const boot = ({ withAccounts = true } = {}) => {
    freshWindow();
    bootStore({ ui: true });
    if (withAccounts) {
      // USD base: Checking + Savings in USD
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Checking', openingBalance: 0 });
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
    }
    spy = vi.spyOn(window.Store, 'dispatch');
  };

  it('a tap only selects; Cancel applies nothing', () => {
    boot();
    openPicker();
    expect(opt('USD').getAttribute('aria-checked')).toBe('true');
    opt('EUR').click();
    expect(window.Store.getState().currency).toBe('USD');
    expect(opt('EUR').getAttribute('aria-checked')).toBe('true');
    expect(opt('USD').getAttribute('aria-checked')).toBe('false');
    expect(document.getElementById('active-modal')).not.toBeNull(); // sheet still open
    click('modal-cancel-btn');
    vi.advanceTimersByTime(400);
    expect(window.Store.getState().currency).toBe('USD');
    expect(currencyDispatches(spy)).toHaveLength(0);
  });

  it('Enter selects an option from the keyboard', () => {
    boot();
    openPicker();
    opt('GBP').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(opt('GBP').getAttribute('aria-checked')).toBe('true');
    expect(currencyDispatches(spy)).toHaveLength(0);
  });

  it('Done with an unchanged selection just closes', () => {
    boot();
    openPicker();
    click('modal-save-btn');
    vi.advanceTimersByTime(400);
    expect(document.getElementById('active-modal')).toBeNull();
    expect(currencyDispatches(spy)).toHaveLength(0);
  });

  it('Done on a switch that excludes accounts opens the confirm; its Cancel never dispatches', () => {
    boot();
    openPicker();
    opt('EUR').click();
    click('modal-save-btn');
    expect(title()).toBe('Switch to EUR?');
    expect(document.getElementById('currency-switch-summary').textContent)
      .toContain('Every account will count in your totals.'); // relabel pre-ticked (no EUR account yet)
    expect(document.getElementById('currency-switch-relabel').checked).toBe(true);
    expect(window.Store.getState().currency).toBe('USD');
    click('modal-cancel-btn');
    vi.advanceTimersByTime(400);
    expect(window.Store.getState().currency).toBe('USD');
    expect(currencyDispatches(spy)).toHaveLength(0);
  });

  it('a backdrop tap on the confirm aborts too', () => {
    boot();
    openPicker();
    opt('EUR').click();
    click('modal-save-btn');
    const backdrop = document.getElementById('active-modal');
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(currencyDispatches(spy)).toHaveLength(0);
    expect(window.Store.getState().currency).toBe('USD');
  });

  it('applying with the relabel box ticked moves every old-base account', () => {
    boot();
    openPicker();
    opt('EUR').click();
    click('modal-save-btn');
    click('modal-save-btn'); // "Switch to EUR"
    expect(spy).toHaveBeenCalledWith('SET_CURRENCY', { code: 'EUR', relabel: true });
    expect(window.Store.getState().currency).toBe('EUR');
    expect(acc('Checking').currency).toBe('EUR');
    expect(acc('Savings').currency).toBe('EUR');
    expect(window.Store.foreignAccountCount()).toBe(0);
  });

  it('unticking the box updates the summary live and applies a plain switch', () => {
    boot();
    openPicker();
    opt('EUR').click();
    click('modal-save-btn');
    const box = document.getElementById('currency-switch-relabel');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    const summary = document.getElementById('currency-switch-summary').textContent;
    expect(summary).toContain('2 accounts aren’t in EUR');
    expect(summary).toContain('None of your accounts would count');
    click('modal-save-btn');
    expect(spy).toHaveBeenCalledWith('SET_CURRENCY', { code: 'EUR', relabel: false });
    expect(window.Store.getState().currency).toBe('EUR');
    expect(acc('Checking').currency).toBe('USD');
  });

  it('leaves the relabel box unticked when an account already uses the target currency', () => {
    boot();
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Euro Trip', openingBalance: 0, currency: 'EUR' });
    openPicker();
    opt('EUR').click();
    click('modal-save-btn');
    const box = document.getElementById('currency-switch-relabel');
    expect(box.checked).toBe(false);
    expect(document.getElementById('currency-switch-summary').textContent).toContain('2 accounts aren’t in EUR');
    expect(box.parentElement.textContent).toContain('Also switch my 2 USD accounts to EUR');
  });

  it('with no accounts a switch applies directly on Done, with no confirm', () => {
    boot({ withAccounts: false });
    openPicker();
    opt('GBP').click();
    click('modal-save-btn');
    expect(spy).toHaveBeenCalledWith('SET_CURRENCY', 'GBP');
    expect(window.Store.getState().currency).toBe('GBP');
    expect(document.getElementById('currency-switch-summary')).toBeNull();
  });
});

// ── Onboarding welcome sheet ────────────────────────────────────────────────

describe('Onboarding welcome sheet currency (1.0.1 BUG-01 / BUG-20)', () => {
  let spy, show;
  const boot = ({ withAccounts }) => {
    freshWindow();
    bootStore({ ui: true });
    if (withAccounts) {
      // An earlier onboarding was dismissed before "Get started": the base is
      // still the store default (USD) and the accounts carry it.
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Checking', openingBalance: 0 });
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
    }
    spy = vi.spyOn(window.Store, 'dispatch');
    show = loadRegionSetup();
  };
  const setupDone = () => window.localStorage.setItem.mock.calls.some(c => c[0] === 'stackd_v1_setup_done');

  it('fresh install: preselects EUR and Get started applies it with no confirm', () => {
    boot({ withAccounts: false });
    show();
    vi.advanceTimersByTime(60);
    expect(document.getElementById('setup-currency-subtitle').textContent).toBe('EUR — Euro');
    document.getElementById('modal-save-btn').click();
    expect(spy).toHaveBeenCalledWith('SET_CURRENCY', 'EUR');
    expect(window.Store.getState().currency).toBe('EUR');
    expect(setupDone()).toBe(true);
    expect(document.getElementById('currency-switch-summary')).toBeNull();
  });

  it('has no visible footer Cancel (mandatory sheet)', () => {
    boot({ withAccounts: false });
    show();
    vi.advanceTimersByTime(60);
    const cancel = document.getElementById('modal-cancel-btn');
    expect(!cancel || cancel.style.display === 'none').toBe(true);
  });

  it('with existing accounts: preselects the base in use, so Get started changes nothing', () => {
    boot({ withAccounts: true });
    show();
    vi.advanceTimersByTime(60);
    expect(document.getElementById('setup-currency-subtitle').textContent).toBe('USD — US Dollar');
    document.getElementById('modal-save-btn').click();
    expect(window.Store.getState().currency).toBe('USD');
    expect(acc('Checking').currency).toBe('USD');
    expect(setupDone()).toBe(true);
    expect(document.getElementById('currency-switch-summary')).toBeNull();
  });

  it('with existing accounts: picking another currency routes through the confirm', () => {
    boot({ withAccounts: true });
    show();
    vi.advanceTimersByTime(60);
    document.getElementById('setup-row-currency').click();
    document.querySelector('#setup-picker-sheet .setup-picker-opt[data-code="EUR"]').click();
    expect(document.getElementById('setup-currency-subtitle').textContent).toBe('EUR — Euro');

    document.getElementById('modal-save-btn').click(); // Get started
    expect(document.getElementById('modal-title').textContent).toBe('Switch to EUR?');
    expect(window.Store.getState().currency).toBe('USD');
    expect(currencyDispatches(spy)).toHaveLength(0);
    expect(setupDone()).toBe(true); // onboarding itself is complete either way

    document.getElementById('modal-save-btn').click(); // Switch to EUR (relabel pre-ticked)
    expect(window.Store.getState().currency).toBe('EUR');
    expect(acc('Checking').currency).toBe('EUR');
    expect(acc('Savings').currency).toBe('EUR');
  });

  it('cancelling that confirm leaves the base and the accounts unchanged', () => {
    boot({ withAccounts: true });
    show('GBP', 'en');
    vi.advanceTimersByTime(60);
    document.getElementById('modal-save-btn').click();
    expect(document.getElementById('modal-title').textContent).toBe('Switch to GBP?');
    document.getElementById('modal-cancel-btn').click();
    vi.advanceTimersByTime(400);
    expect(currencyDispatches(spy)).toHaveLength(0);
    expect(window.Store.getState().currency).toBe('USD');
    expect(acc('Checking').currency).toBe('USD');
  });
});
