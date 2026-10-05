import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-29): deleting an account left its id in every slice that names
// accounts by id — the saved Home view, History/Analytics filters, widget
// scopes, the default wallet and Bank Connect mappings. Readers treat an empty
// list as "all accounts", so a list holding only the dead id matched nothing
// (Home's TOTAL BALANCE read €0.00). Store._pruneAccountRefs drops those ids
// on DELETE_ACCOUNT, at boot, cross-tab (session filters only) and on
// UPDATE_FILTERS (D-U5-9); RESET_APP resets the saved view and the default
// (D-U5-3). Same executeFile pattern as store.test.js.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const mapStorage = (seed = {}) => {
  const bag = { ...seed };
  return {
    getItem: k => (k in bag ? bag[k] : null),
    setItem: (k, v) => { bag[k] = String(v); },
    removeItem: k => { delete bag[k]; },
    _bag: bag,
  };
};

const PREF_KEYS = ['expandedGraphFilters', 'homeWidgets', 'defaultAccountId', 'bankConnections'];

let listeners;
const boot = ({ seed = { stackd_v1_homeWidgets: '[]' }, ui = false, captureListeners = false, init = true } = {}) => {
  listeners = {};
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: mapStorage(seed),
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Router: { getParams: () => ({}), navigate: vi.fn() },
    ...(captureListeners ? {
      addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }
    } : {})
  };
  global.localStorage = global.window.localStorage;
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  if (ui) {
    executeFile('components.js');
    executeFile('widgets.js');
    executeFile('views.js');
  }
  if (init) global.window.Store.init();
  return global.window.Store;
};

const stored = (key) => JSON.parse(global.window.localStorage.getItem('stackd_v1_' + key));
const savedKeys = (spy) => spy.mock.calls.map(c => c[0]);
const idOf = (S, name) => S.getState().accounts.find(a => a.name === name).id;

const addAccount = (S, name, extra = {}) => {
  S.dispatch('ADD_ACCOUNT', { name, openingBalance: 0, openingDate: '2026-09-01', ...extra });
  return idOf(S, name);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0)); // 2026-10-04
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('DELETE_ACCOUNT prunes account references (1.0.2 BUG-29)', () => {
  let S, mainId, savingsId, holidayId;

  const seedThree = () => {
    mainId = addAccount(S, 'Main Checking', { openingBalance: 2500 });
    savingsId = addAccount(S, 'Savings Pot', { openingBalance: 5000 });
    holidayId = addAccount(S, 'Holiday Fund', { openingBalance: 800 });
  };
  const addGroceries = () => S.dispatch('ADD_TRANSACTION', {
    type: 'expense', amount: 42.5, accountId: mainId, categoryId: 'cat_groceries',
    date: '2026-10-02', note: 'Groceries', tags: []
  });

  it('1. a saved Home view holding only the deleted account widens to all: Home reads the live total', () => {
    S = boot({ ui: true });
    mainId = addAccount(S, 'Main Checking', { openingBalance: 2500 });
    savingsId = addAccount(S, 'Savings Pot', { openingBalance: 5000 });
    S.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { accounts: [savingsId] });

    S.dispatch('DELETE_ACCOUNT', { id: savingsId });

    expect(S.getState().expandedGraphFilters.accounts).toEqual([]);
    expect(stored('expandedGraphFilters')).toEqual(S.getState().expandedGraphFilters);
    const html = global.window.Views.DashboardView.render(S.getState());
    expect(html).toContain('>' + S.formatCurrency(2500) + '</h1>');
    expect(html).not.toContain('>' + S.formatCurrency(0) + '</h1>');
    expect(html).not.toContain('Reset View');
  });

  it('2. a multi-account saved view keeps its live ids', () => {
    S = boot();
    mainId = addAccount(S, 'Main Checking', { openingBalance: 2500 });
    savingsId = addAccount(S, 'Savings Pot', { openingBalance: 5000 });
    S.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { accounts: [mainId, savingsId] });

    S.dispatch('DELETE_ACCOUNT', { id: savingsId });

    expect(S.getState().expandedGraphFilters.accounts).toEqual([mainId]);
    expect(stored('expandedGraphFilters').accounts).toEqual([mainId]);
  });

  it('3. History and Analytics filters drop the id on delete (History opens unfiltered)', () => {
    S = boot();
    seedThree();
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: [holidayId] }, replace: true });
    S.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { accounts: [holidayId] }, replace: true });
    addGroceries();

    S.dispatch('DELETE_ACCOUNT', { id: holidayId });

    expect(S.getState().historyFilters.accounts).toEqual([]);
    expect(S.getState().analyticsFilters.accounts).toEqual([]);
    expect(S.getFilteredTransactions('history').some(t => t.amount === 42.5 && t.accountId === mainId)).toBe(true);
  });

  it('4. UPDATE_FILTERS drops ids that name no account (a stale ?account= deep link) — D-U5-9', () => {
    S = boot();
    seedThree();
    addGroceries();
    S.dispatch('DELETE_ACCOUNT', { id: holidayId });

    // exactly what Router.handleRouteChange sends for #transactions?account=<deleted>
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: [holidayId] }, replace: true });
    expect(S.getState().historyFilters.accounts).toEqual([]);
    expect(S.getFilteredTransactions('history').some(t => t.amount === 42.5)).toBe(true);

    S.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { accounts: [mainId, holidayId] } });
    expect(S.getState().analyticsFilters.accounts).toEqual([mainId]);
  });

  it('5. widget scopes drop the id, keep their other config, and save once', () => {
    S = boot({ ui: true });
    mainId = addAccount(S, 'Main Checking', { openingBalance: 2500 });
    savingsId = addAccount(S, 'Savings Pot', { openingBalance: 5000 });
    S.dispatch('ADD_HOME_WIDGET', { type: 'netWorth', size: 'small', config: { accountIds: [savingsId] } });
    S.dispatch('ADD_HOME_WIDGET', { type: 'categories', size: 'large', config: { direction: 'expense', mode: 'top', categoryIds: ['cat_groceries'], accountIds: [mainId, savingsId] } });
    S.dispatch('ADD_HOME_WIDGET', { type: 'latest', size: 'large', config: {} });
    const latestBefore = JSON.parse(JSON.stringify(S.getState().homeWidgets[2]));
    const spy = vi.spyOn(global.window.StackdDB, 'save');

    S.dispatch('DELETE_ACCOUNT', { id: savingsId });

    const [nw, cats, latest] = S.getState().homeWidgets;
    expect(nw.config.accountIds).toEqual([]);
    expect(cats.config.accountIds).toEqual([mainId]);
    expect(cats.config).toMatchObject({ direction: 'expense', mode: 'top', categoryIds: ['cat_groceries'] });
    expect(latest).toEqual(latestBefore);
    expect(savedKeys(spy).filter(k => k === 'homeWidgets')).toHaveLength(1);
    expect(stored('homeWidgets').map(w => w.config.accountIds)).toEqual([[], [mainId], undefined]);

    global.window.Widgets._passMemo = {};
    const html = global.window.Widgets.registry.netWorth.render(nw, S.getState());
    expect(html).toContain(S.formatCurrency(2500));
    expect(html).not.toContain('>' + S.formatCurrency(0) + '<');
  });

  it('6. a deleted DEFAULT promotes the first primary-currency account by name (D-U5-1)', () => {
    S = boot();
    S.dispatch('SET_CURRENCY', 'EUR');
    const amexId = addAccount(S, 'Amex', { currency: 'USD' });
    mainId = addAccount(S, 'Main', { currency: 'EUR' });
    savingsId = addAccount(S, 'Savings', { currency: 'EUR' });
    S.dispatch('SET_DEFAULT_ACCOUNT', savingsId);

    S.dispatch('DELETE_ACCOUNT', { id: savingsId });
    expect(S.getState().defaultAccountId).toBe(mainId); // not Amex, which sorts first
    expect(stored('defaultAccountId')).toBe(mainId);

    S.dispatch('SET_DEFAULT_ACCOUNT', mainId);
    S.dispatch('DELETE_ACCOUNT', { id: mainId });
    expect(S.getState().defaultAccountId).toBe(amexId); // only a foreign account left
    expect(stored('defaultAccountId')).toBe(amexId);

    S.dispatch('DELETE_ACCOUNT', { id: amexId });
    expect(S.getState().defaultAccountId).toBe('');
    expect(stored('defaultAccountId')).toBe('');
  });

  it('7. guard: a non-default delete keeps the default, and a cleared default stays cleared', () => {
    S = boot();
    seedThree();
    S.dispatch('SET_DEFAULT_ACCOUNT', mainId);
    S.dispatch('DELETE_ACCOUNT', { id: holidayId });
    expect(S.getState().defaultAccountId).toBe(mainId);

    S.dispatch('SET_DEFAULT_ACCOUNT', '');
    S.dispatch('DELETE_ACCOUNT', { id: savingsId });
    expect(S.getState().defaultAccountId).toBe('');
    expect(stored('defaultAccountId')).toBe('');
  });

  it('8. a Bank Connect mapping to the deleted account is unmapped; others are untouched', () => {
    S = boot();
    seedThree();
    S.dispatch('ADD_BANK_CONNECTION', { ref: 'r1', accounts: [
      { bankAccountId: 'b1', stackdAccountId: savingsId, ibanTail: '1111', currency: 'USD', name: null },
      { bankAccountId: 'b2', stackdAccountId: mainId, ibanTail: '2222', currency: 'USD', name: null }
    ] });
    const spy = vi.spyOn(global.window.StackdDB, 'save');

    S.dispatch('DELETE_ACCOUNT', { id: savingsId });

    const accs = S.getState().bankConnections[0].accounts;
    expect(accs.find(a => a.bankAccountId === 'b1').stackdAccountId).toBeNull();
    expect(accs.find(a => a.bankAccountId === 'b2').stackdAccountId).toBe(mainId);
    expect(savedKeys(spy)).toContain('bankConnections');
    expect(stored('bankConnections')[0].accounts.map(a => a.stackdAccountId)).toEqual([null, mainId]);
  });

  it('9. guard: deleting an unknown id on a consistent install saves none of the pref slices', () => {
    S = boot();
    seedThree();
    S.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { accounts: [mainId] });
    S.dispatch('ADD_HOME_WIDGET', { type: 'netWorth', size: 'small', config: { accountIds: [mainId] } });
    S.dispatch('SET_DEFAULT_ACCOUNT', mainId);
    S.dispatch('ADD_BANK_CONNECTION', { ref: 'r1', accounts: [{ bankAccountId: 'b1', stackdAccountId: mainId }] });
    const spy = vi.spyOn(global.window.StackdDB, 'save');

    S.dispatch('DELETE_ACCOUNT', { id: 'no-such-account' });

    expect(savedKeys(spy).filter(k => PREF_KEYS.includes(k))).toEqual([]);
  });
});

describe('Boot heal for stale account references (1.0.2 BUG-29)', () => {
  const MAIN = { id: 'acc_main', name: 'Main', currency: 'USD', color: '#E60023', icon: 'wallet', type: 'Bank', createdAt: '2026-09-01T10:00:00.000Z' };
  const seedWith = (ref, extra = {}) => ({
    stackd_v1_accounts: JSON.stringify([MAIN]),
    stackd_v1_expandedGraphFilters: JSON.stringify({ interval: 'monthly', accounts: [ref], categories: [] }),
    stackd_v1_homeWidgets: JSON.stringify([{ id: 'w1', type: 'netWorth', size: 'small', config: { accountIds: [ref] }, createdAt: '2026-09-01T10:00:00.000Z' }]),
    stackd_v1_defaultAccountId: JSON.stringify(ref),
    stackd_v1_bankConnections: JSON.stringify([{ ref: 'r', accounts: [{ bankAccountId: 'b', stackdAccountId: ref }] }]),
    ...extra
  });

  it('10. Store.init prunes every stale reference, in state and on disk, and promotes a default', () => {
    const S = boot({ seed: seedWith('gone') });
    const st = S.getState();
    expect(st.expandedGraphFilters.accounts).toEqual([]);
    expect(st.homeWidgets[0].config.accountIds).toEqual([]);
    expect(st.defaultAccountId).toBe('acc_main');
    expect(st.bankConnections[0].accounts[0].stackdAccountId).toBeNull();
    expect(stored('expandedGraphFilters').accounts).toEqual([]);
    expect(stored('homeWidgets')[0].config.accountIds).toEqual([]);
    expect(stored('defaultAccountId')).toBe('acc_main');
    expect(stored('bankConnections')[0].accounts[0].stackdAccountId).toBeNull();
  });

  it('11. guard: a consistent install writes none of the pref slices at boot', () => {
    const S = boot({ seed: seedWith('acc_main'), init: false });
    const spy = vi.spyOn(global.window.StackdDB, 'save');
    S.init();
    expect(savedKeys(spy).filter(k => PREF_KEYS.includes(k))).toEqual([]);
    expect(S.getState().defaultAccountId).toBe('acc_main');
  });

  it('12. guard: an unreadable accounts key (rows but no accounts) skips the heal', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const seed = seedWith('gone', {
      stackd_v1_accounts: '{broken',
      stackd_v1_transactions: JSON.stringify([{ id: 't1', type: 'expense', amount: 5, accountId: 'gone', categoryId: 'cat_groceries', date: '2026-09-10', time: '10:00:00', createdAt: '2026-09-10T10:00:00.000Z' }])
    });
    const S = boot({ seed });
    const st = S.getState();
    expect(st.accounts).toEqual([]);
    expect(st.homeWidgets[0].config.accountIds).toEqual(['gone']);
    expect(st.defaultAccountId).toBe('gone');
    expect(st.bankConnections[0].accounts[0].stackdAccountId).toBe('gone');
    expect(st.expandedGraphFilters.accounts).toEqual(['gone']);
    expect(global.window.localStorage.getItem('stackd_v1_homeWidgets')).toBe(seed.stackd_v1_homeWidgets);
    expect(global.window.localStorage.getItem('stackd_v1_defaultAccountId')).toBe('"gone"');
    expect(global.window.localStorage.getItem('stackd_v1_bankConnections')).toBe(seed.stackd_v1_bankConnections);
    expect(global.window.localStorage.getItem('stackd_v1_expandedGraphFilters')).toBe(seed.stackd_v1_expandedGraphFilters);
  });

  it('13. guard: non-array widget / bank slices (corrupt keys) neither crash boot nor get re-saved', () => {
    const S = boot({ seed: seedWith('acc_main', { stackd_v1_homeWidgets: '{}', stackd_v1_bankConnections: '{"x":1}' }), init: false });
    const spy = vi.spyOn(global.window.StackdDB, 'save');
    expect(() => S.init()).not.toThrow();
    expect(savedKeys(spy)).not.toContain('homeWidgets');
    expect(savedKeys(spy)).not.toContain('bankConnections');
    expect(global.window.localStorage.getItem('stackd_v1_homeWidgets')).toBe('{}');
    expect(global.window.localStorage.getItem('stackd_v1_bankConnections')).toBe('{"x":1}');
  });
});

describe('RESET_APP resets the saved view and the default wallet (1.0.2 BUG-29, D-U5-3)', () => {
  it('14. saves the fresh-install expandedGraphFilters and an empty defaultAccountId', () => {
    const S = boot();
    const mainId = addAccount(S, 'Main');
    S.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'weekly', accounts: [mainId], categories: ['cat_groceries'] });
    S.dispatch('SET_DEFAULT_ACCOUNT', mainId);

    S.dispatch('RESET_APP');

    const fresh = { interval: 'monthly', accounts: [], categories: [] };
    expect(stored('expandedGraphFilters')).toEqual(fresh);
    expect(stored('defaultAccountId')).toBe('');
    expect(S.getState().expandedGraphFilters).toEqual(fresh);
    expect(S.getState().defaultAccountId).toBe('');
  });

  it('14b. writes the emptied transactions first and the growing slices last (U7 BUG-34 hand-off)', () => {
    const S = boot();
    addAccount(S, 'Main', { openingBalance: 10 });
    const spy = vi.spyOn(global.window.StackdDB, 'save');

    S.dispatch('RESET_APP');

    const keys = savedKeys(spy);
    const at = (k) => keys.indexOf(k);
    expect(keys[0]).toBe('transactions');
    ['loans', 'accounts', 'budgets', 'importPresets', 'importRules', 'bankConnect', 'bankConnections'].forEach(k => {
      expect(at(k)).toBeGreaterThan(at('transactions'));
      expect(at(k)).toBeLessThan(at('categories'));
    });
    expect(at('homeWidgets')).toBeGreaterThan(at('categories'));
    expect(at('expandedGraphFilters')).toBeGreaterThan(at('homeWidgets'));
    expect(at('defaultAccountId')).toBeGreaterThan(at('homeWidgets'));
    expect(stored('transactions')).toEqual([]);
  });
});

describe('Cross-tab sync of account references (1.0.2 BUG-29)', () => {
  const fire = async (key) => {
    for (const fn of (listeners.storage || [])) await fn({ key });
  };

  it('15. another tab\'s saved Home view and default wallet are reloaded', async () => {
    const S = boot({ captureListeners: true });
    expect((listeners.storage || []).length).toBe(1);
    const mainId = addAccount(S, 'Main');

    global.window.localStorage.setItem('stackd_v1_expandedGraphFilters', JSON.stringify({ interval: 'quarter', accounts: [mainId], categories: [] }));
    await fire('stackd_v1_expandedGraphFilters');
    expect(S.getState().expandedGraphFilters).toEqual({ interval: 'quarter', accounts: [mainId], categories: [] });

    global.window.localStorage.setItem('stackd_v1_defaultAccountId', JSON.stringify(''));
    await fire('stackd_v1_defaultAccountId');
    expect(S.getState().defaultAccountId).toBe('');
    global.window.localStorage.setItem('stackd_v1_defaultAccountId', JSON.stringify(mainId));
    await fire('stackd_v1_defaultAccountId');
    expect(S.getState().defaultAccountId).toBe(mainId);
  });

  it('16. an account deleted in another tab leaves this tab\'s session filters — and saves nothing', async () => {
    const S = boot({ captureListeners: true });
    addAccount(S, 'Main');
    const holidayId = addAccount(S, 'Holiday Fund');
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: [holidayId] }, replace: true });
    S.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { accounts: [holidayId] } });
    expect(S.getState().historyFilters.accounts).toEqual([holidayId]);

    const others = S.getState().accounts.filter(a => a.id !== holidayId);
    global.window.localStorage.setItem('stackd_v1_accounts', JSON.stringify(others));
    const spy = vi.spyOn(global.window.StackdDB, 'save');
    await fire('stackd_v1_accounts');

    expect(S.getState().accounts.map(a => a.id)).toEqual(others.map(a => a.id));
    expect(S.getState().historyFilters.accounts).toEqual([]);
    expect(S.getState().analyticsFilters.accounts).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
