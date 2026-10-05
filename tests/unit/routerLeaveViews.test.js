import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.2 (BUG-87), the views half of routerLeave.test.js (cases (i)-(r)).
// Every form and dead-end page used to leave through Router.navigate(), which
// pushes: after a save or delete the form's own entry stayed directly under
// the landing screen and Android Back reopened it (a deleted log's 'Transaction
// not found.' loop, a blank live Edit Category, a deleted loan's results page
// that pushed the hub again). Views now leave through leaveTo() (Router.leave,
// with a navigate() fallback for Router stubs) and mark close / not-found links
// data-router-leave. The integration cases run the real Router, Store and Views
// on jsdom's window.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const jsdomWindow = global.window;
const realLS = global.localStorage; // jsdom's window IS the global: keep its own storage
const realRAF = global.requestAnimationFrame;
const $ = (id) => document.getElementById(id);
const S = () => global.window.Store;
const V = () => global.window.Views;

const LOAN_CONFIG = {
  type: 'personal', principal: 6000, duration: 24, durationUnit: 'months',
  annualRate: 5, firstPaymentDate: '2026-11-01', amortization: 'french',
  rateChanges: [], earlyRepayments: [], additionalExpenses: []
};

// ── Views with a Router stub (the formValidation.test.js harness) ──────────
describe('views leave through Router.leave (1.0.2 BUG-87)', () => {
  let params;
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
      Router: { getParams: () => params, navigate: vi.fn(), leave: vi.fn() },
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
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
  };
  const R = () => global.window.Router;
  const accId = () => S().getState().accounts[0].id;
  const renderView = (name) => {
    const view = V()[name];
    container.innerHTML = view.render(S().getState());
    view.attachEvents(container, S().getState());
  };
  const expectLeftTo = (path) => {
    expect(R().leave).toHaveBeenCalledWith(path);
    expect(R().navigate).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    global.window = jsdomWindow;
    global.localStorage = realLS;
    global.requestAnimationFrame = realRAF;
    vi.useRealTimers();
  });

  it('(i) transaction delete leaves to History', () => {
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12, accountId: accId(), categoryId: 'cat_groceries', date: '2026-09-30' });
    const tx = S().getState().transactions.find(t => t.type === 'expense');
    params = { id: tx.id };
    renderView('AddTransactionView');
    $('btn-delete-tx').click();
    $('modal-delete-btn').click();
    expect(S().getState().transactions.find(t => t.id === tx.id)).toBeUndefined();
    expectLeftTo('#transactions');
  });

  it('(j) transaction save leaves to History', () => {
    renderView('AddTransactionView');
    $('tx-amount').value = '42.30';
    $('tx-category').value = 'cat_groceries';
    $('btn-save-tx').click();
    expect(S().getState().transactions.filter(t => t.type === 'expense')).toHaveLength(1);
    expectLeftTo('#transactions');
  });

  it('(k) Edit Category for a missing id shows the not-found page and binds nothing', () => {
    params = { id: 'gone' };
    const html = V().EditCategoryView.render(S().getState());
    expect(html).toContain(window.I18n.t('cat.notFound'));
    container.innerHTML = html;
    expect(container.querySelector('a[data-router-leave][href="#categories"]')).not.toBeNull();
    expect($('edit-cat-name')).toBeNull();
    expect($('btn-save-category')).toBeNull();
    const dispatch = vi.spyOn(S(), 'dispatch');
    expect(() => V().EditCategoryView.attachEvents(container, S().getState())).not.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
    expect(R().leave).not.toHaveBeenCalled();
    expect(R().navigate).not.toHaveBeenCalled();
  });

  it('(l) category save and delete leave to Categories', () => {
    S().dispatch('ADD_CATEGORY', { id: 'cat_gym', name: 'Gym', icon: 'dumbbell', typeHint: 'expense' });
    params = { id: 'cat_gym' };
    renderView('EditCategoryView');
    $('btn-save-category').click();
    expectLeftTo('#categories');

    R().leave.mockClear();
    renderView('EditCategoryView');
    $('btn-delete-category').click();
    $('modal-delete-btn').click();
    expect(S().getState().categories.find(c => c.id === 'cat_gym')).toBeUndefined();
    expectLeftTo('#categories');
  });

  it('(m) account save and delete leave to Home', () => {
    renderView('EditAccountView'); // new mode (no ?id=)
    $('edit-acc-name').value = 'Wallet';
    $('btn-edit-acc-save').click();
    expect(S().getState().accounts.map(a => a.name)).toContain('Wallet');
    expectLeftTo('#dashboard');

    R().leave.mockClear();
    params = { id: accId() };
    renderView('EditAccountView');
    $('btn-edit-acc-delete').click();
    $('modal-delete-btn').click();
    expectLeftTo('#dashboard');
  });

  it('(n) dead-end Go Back links and the forms\' ✕ links carry data-router-leave', () => {
    params = { id: 'gone' };
    container.innerHTML = V().AddTransactionView.render(S().getState());
    expect(container.querySelector('a[data-router-leave][href="#transactions"]')).not.toBeNull();
    container.innerHTML = V().CategoryDetailView.render(S().getState());
    expect(container.querySelector('a[data-router-leave][href="#categories"]')).not.toBeNull();

    params = {};
    container.innerHTML = V().AddTransactionView.render(S().getState()); // New Log ✕ → Home
    expect(container.querySelector('a[data-router-leave][href="#dashboard"]')).not.toBeNull();
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 5, accountId: accId(), categoryId: 'cat_groceries', date: '2026-09-30' });
    params = { id: S().getState().transactions.find(t => t.type === 'expense').id };
    container.innerHTML = V().AddTransactionView.render(S().getState()); // Edit Log ✕ → History
    expect(container.querySelector('a[data-router-leave][href="#transactions"]')).not.toBeNull();

    params = { id: 'cat_groceries' };
    container.innerHTML = V().EditCategoryView.render(S().getState());
    expect(container.querySelector('a[data-router-leave][href="#categories"]')).not.toBeNull();

    params = { id: accId() };
    container.innerHTML = V().EditAccountView.render(S().getState());
    expect(container.querySelector('a[data-router-leave][href="#dashboard"]')).not.toBeNull();
  });

  // U2 (BUG-25) replaces the form with a read-only panel for an opening-balance
  // row; its ✕ must leave like the form's ✕, or Back reopens the closed panel.
  // Holds before the merge (the plain edit form) and after it (the panel).
  it('(n2) an opening-balance row: every close link to History carries data-router-leave', () => {
    params = { id: S().getState().transactions.find(t => t.type === 'opening_balance').id };
    container.innerHTML = V().AddTransactionView.render(S().getState());
    const closers = container.querySelectorAll('a[href="#transactions"]');
    expect(closers.length).toBeGreaterThan(0);
    closers.forEach(a => expect(a.hasAttribute('data-router-leave')).toBe(true));
  });

  it('(o) the Pro lock card: ✕ carries data-router-leave and Go Back leaves', () => {
    global.window.Pro = { canAddCategory: () => false, canAddAccount: () => false, FREE_ACCOUNT_LIMIT: 2 };
    params = {};
    renderView('EditCategoryView');
    expect($('pro-locked')).not.toBeNull();
    expect(container.querySelector('a[data-router-leave][href="#categories"]')).not.toBeNull();
    $('pro-locked-back').click();
    expectLeftTo('#categories');
  });

  it('(p) Debt: loan delete, the stale-id redirect and the results links leave to the hub', () => {
    S().dispatch('ADD_LOAN', { name: 'Car', kind: 'sim', config: LOAN_CONFIG });
    const loan = S().getState().loans[0];
    params = { id: loan.id };
    renderView('DebtResultsView');
    expect(container.querySelector('a[data-router-leave][href="#debt"]')).not.toBeNull(); // results ✕
    $('btn-dres-menu').click();
    document.querySelector('.dres-menu-opt[data-act="delete"]').click();
    $('modal-delete-btn').click();
    expect(S().getState().loans).toHaveLength(0);
    expectLeftTo('#debt');

    R().leave.mockClear();
    params = { id: 'gone' };
    renderView('DebtResultsView'); // attachEvents redirects a stale results entry
    expectLeftTo('#debt');
    expect(container.querySelector('a[data-router-leave][href="#debt"]')).not.toBeNull(); // 'Back to loans'
  });

  it('(p2) the simulator ✕ leaves to the hub (integrated review: Back must not reopen it)', () => {
    params = { type: 'personal' };
    renderView('DebtSimView');
    const close = $('dsim-close');
    expect(close.hasAttribute('data-router-leave')).toBe(true);
    expect(close.getAttribute('href')).toBe('#debt');
  });

  it('a Router stub without leave() still navigates (leaveTo fallback)', () => {
    delete global.window.Router.leave;
    renderView('AddTransactionView');
    $('tx-amount').value = '9';
    $('tx-category').value = 'cat_groceries';
    $('btn-save-tx').click();
    expect(R().navigate).toHaveBeenCalledWith('#transactions');
  });
});

// ── Real Router + Store + Views on jsdom's window ──────────────────────────
describe('leave() with the real Router (1.0.2 BUG-87)', () => {
  const R = () => window.Router;
  const go = (hash) => { window.location.hash = hash; R().handleRouteChange(); };
  let rv;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    document.body.innerHTML = '<main id="router-view"></main><nav id="bottom-nav"></nav><div id="modal-container"></div>';
    rv = $('router-view');
    window.localStorage.clear();
    window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    executeFile('router.js'); // Router.init() is never called: no hashchange listener
    S().init();
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
    window.history.replaceState(null, '', '#dashboard');
    R()._curHash = null;
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('(q) a delete from History renders History in the same pass (no "Transaction not found." frame)', async () => {
    go('#transactions');
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 38.75, accountId: S().getState().accounts[0].id, categoryId: 'cat_groceries', date: '2026-09-30' });
    const tx = S().getState().transactions.find(t => t.type === 'expense');
    go('#edit?id=' + tx.id);
    rv.innerHTML = V().AddTransactionView.render(S().getState());
    V().AddTransactionView.attachEvents(rv, S().getState());
    await Promise.resolve(); // flush the pending coalesced emits
    const seen = [];
    S().subscribe((st) => seen.push(st.activeView));

    $('btn-delete-tx').click();
    $('modal-delete-btn').click();
    expect(S().getState().activeView).toBe('transactions');
    expect(window.location.hash).toBe('#transactions');

    await Promise.resolve();
    expect(seen).toEqual(['transactions']); // one render pass, of History
    expect(window.history.back).toHaveBeenCalledTimes(1); // the form's entry is dropped

    // The old Delete again (double tap): already on History, nothing more.
    $('btn-delete-tx').click();
    $('modal-delete-btn').click();
    expect(window.history.back).toHaveBeenCalledTimes(1);
  });

  it('(r) loan delete and a stale results entry step back to the hub, never pushing it', () => {
    const len0 = window.history.length;
    go('#debt');
    S().dispatch('ADD_LOAN', { name: 'Car', kind: 'sim', config: LOAN_CONFIG });
    const loan = S().getState().loans[0];
    go('#debt-results?id=' + loan.id);
    const len = window.history.length;
    expect(len).toBeGreaterThanOrEqual(len0);
    rv.innerHTML = V().DebtResultsView.render(S().getState());
    V().DebtResultsView.attachEvents(rv, S().getState());
    const navigate = vi.spyOn(R(), 'navigate');

    $('btn-dres-menu').click();
    document.querySelector('.dres-menu-opt[data-act="delete"]').click();
    $('modal-delete-btn').click();
    expect(S().getState().activeView).toBe('debt');
    expect(window.location.hash).toBe('#debt');
    expect(window.history.back).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();

    // Back lands on a results entry whose loan is gone (stamped from the hub).
    window.history.replaceState({ stackdNav: 1, from: '#debt' }, '', '#debt-results?id=gone');
    R().handleRouteChange();
    rv.innerHTML = V().DebtResultsView.render(S().getState());
    V().DebtResultsView.attachEvents(rv, S().getState());
    expect(window.history.back).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe('#debt');
    expect(S().getState().activeView).toBe('debt');
    expect(navigate).not.toHaveBeenCalled();
    expect(window.history.length).toBe(len);
  });
});
