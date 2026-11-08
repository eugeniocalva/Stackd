// 1.2.2 (HG-12, docs/account-order-plan.md): the user's account order.
// Saved per device (stackd_v1_accountOrder, SET_ACCOUNT_ORDER), read through
// Store.orderedAccounts(): known ids in the saved order, the rest appended
// alphabetically. No saved order = alphabetical (D5); a new account goes to
// the end (D6); a deleted one leaves the order; a reset clears it. Home's
// tiles follow it and carry no DEFAULT chip (D2).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const makeLocalStorage = (seed) => {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _map: map
  };
};

let uuid = 0;
const boot = (seed) => {
  uuid = 0;
  document.body.innerHTML = '<div id="router-view"></div>';
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(Object.assign({ stackd_v1_homeWidgets: '[]' }, seed || {})),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    document,
    Router: { navigate: vi.fn(), getParams: () => ({}) },
    StackdHydrateIcons: () => {}
  };
  global.localStorage = global.window.localStorage;
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'insights.js', 'views.js']
    .forEach(executeFile);
  global.window.Store.init();
};

afterEach(() => { document.body.innerHTML = ''; });

const S = () => global.window.Store;
const names = () => S().orderedAccounts().map(a => a.name);
const idOf = (name) => S().getState().accounts.find(a => a.name === name).id;
const saved = () => JSON.parse(global.window.localStorage.getItem('stackd_v1_accountOrder') || 'null');
const add = (name) => S().dispatch('ADD_ACCOUNT', { id: 'acc_' + name.toLowerCase(), name, openingBalance: 10, openingDate: '2026-01-01' });

describe('Store: the account order', () => {
  beforeEach(() => boot());

  it('with no saved order lists accounts alphabetically (D5)', () => {
    boot({
      stackd_v1_accounts: JSON.stringify([
        { id: 'a1', name: 'Zeta', currency: 'USD' }, { id: 'a2', name: 'alpha', currency: 'USD' }, { id: 'a3', name: 'Mid', currency: 'USD' }
      ])
    });
    expect(saved()).toBeNull();
    expect(names()).toEqual(['alpha', 'Mid', 'Zeta']);
  });

  it('a new account goes to the end, also the first time an order is written (D6)', () => {
    add('Bravo');
    expect(saved()).toBeNull(); // one account: nothing to order yet
    add('Alpha');
    expect(names()).toEqual(['Bravo', 'Alpha']);
    add('Charlie');
    expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie']);
    expect(saved()).toEqual(['acc_bravo', 'acc_alpha', 'acc_charlie']);
    // state.accounts itself stays alphabetical (CSV, import matching)
    expect(S().getState().accounts.map(a => a.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('SET_ACCOUNT_ORDER saves a normalised order: unknown ids dropped, missing accounts appended by name', () => {
    ['Alpha', 'Bravo', 'Charlie', 'Delta'].forEach(add);
    S().dispatch('SET_ACCOUNT_ORDER', ['acc_delta', 'ghost', 'acc_bravo', 'acc_delta']);
    expect(names()).toEqual(['Delta', 'Bravo', 'Alpha', 'Charlie']);
    expect(saved()).toEqual(['acc_delta', 'acc_bravo', 'acc_alpha', 'acc_charlie']);
  });

  it('survives a reload; a stored id of a gone account is ignored', () => {
    ['Alpha', 'Bravo', 'Charlie'].forEach(add);
    S().dispatch('SET_ACCOUNT_ORDER', ['acc_charlie', 'acc_alpha', 'acc_bravo']);
    const ls = Object.fromEntries(global.window.localStorage._map);
    ls.stackd_v1_accountOrder = JSON.stringify(['gone', 'acc_charlie', 'acc_alpha', 'acc_bravo']);
    boot(ls);
    expect(names()).toEqual(['Charlie', 'Alpha', 'Bravo']);
  });

  it('a deleted account leaves the saved order', () => {
    ['Alpha', 'Bravo', 'Charlie'].forEach(add);
    S().dispatch('SET_ACCOUNT_ORDER', ['acc_charlie', 'acc_alpha', 'acc_bravo']);
    S().dispatch('DELETE_ACCOUNT', { id: idOf('Alpha') });
    expect(saved()).toEqual(['acc_charlie', 'acc_bravo']);
    expect(names()).toEqual(['Charlie', 'Bravo']);
  });

  it('a reset clears it (back to alphabetical)', () => {
    ['Alpha', 'Bravo'].forEach(add);
    S().dispatch('SET_ACCOUNT_ORDER', ['acc_bravo', 'acc_alpha']);
    S().dispatch('RESET_APP');
    expect(saved()).toBeNull();
    expect(S().getState().accountOrder).toEqual([]);
  });

  it('a failed save rolls the order back (_reloadSlice knows the key)', () => {
    expect(S()._reloadSlice('accountOrder')).toBe(true);
  });
});

describe('Home: the account tiles', () => {
  beforeEach(() => boot());

  it('follow the saved order and carry no DEFAULT chip or outline (D1, D2)', () => {
    ['Alpha', 'Bravo', 'Charlie'].forEach(add);
    S().dispatch('SET_ACCOUNT_ORDER', ['acc_charlie', 'acc_alpha', 'acc_bravo']);
    const html = global.window.Views.DashboardView.render(S().getState());
    const root = document.getElementById('router-view');
    root.innerHTML = html;
    const ids = Array.from(root.querySelectorAll('.wallet-card')).map(c => c.dataset.id);
    expect(ids).toEqual(['acc_charlie', 'acc_alpha', 'acc_bravo']);
    expect(S().getState().defaultAccountId).toBe('acc_alpha'); // the first account is the default
    expect(root.querySelector('.wallet-card-default-badge')).toBeNull();
    expect(root.querySelector('.wallet-card.is-default')).toBeNull();
    expect(html).not.toMatch(/DEFAULT/);
  });
});
