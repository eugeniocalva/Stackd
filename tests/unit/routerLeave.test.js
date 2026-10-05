import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.2 (BUG-87) Router.leave(path): leave the current screen for `path`
// without keeping the screen's history entry. navigate() pushes, so the jump
// after a save/delete left the form's entry under the landing screen and
// Android Back reopened it (a deleted log's 'not found' page, a blank Edit
// Category). leave() rewrites the current entry in place and routes at once;
// when the entry underneath already shows `path` it then drops the duplicate
// with history.back(). Every fresh entry is stamped with the hash it was
// pushed from ({stackdNav:1, from}); Android Back marks the next unstamped
// entry's origin as unknown. Router-only cases here (F0); U9 adds the views
// cases (leaveTo call sites) to this file.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const jsdomWindow = global.window;
let state;
const R = () => window.Router;
// A push plus the route change the hashchange listener would run (Router.init
// is not called here, except in the last describe).
const go = (hash) => { window.location.hash = hash; R().handleRouteChange(); };
const makeStore = () => ({
  getState: () => state,
  dispatch: vi.fn((a, p) => { if (a === 'SET_VIEW') state.activeView = p; }),
  getCurrencySymbol: () => '€'
});

const setup = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
  document.body.innerHTML = '<main id="router-view"></main><nav id="bottom-nav"></nav><div id="modal-container"></div>';
  global.window.StackdHydrateIcons = vi.fn();
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  state = { activeView: 'dashboard', isSelectionMode: false, widgetEditMode: false, homeWidgets: [] };
  global.window.Store = makeStore();
  global.window.BankConnect = { esc: (s) => s, revoke: vi.fn(() => Promise.resolve()) };
  executeFile('components.js');
  executeFile('router.js'); // a fresh Router per test: _curHash null, _noOrigin false
  window.history.replaceState(null, '', '#dashboard');
  R()._curHash = null;
  vi.spyOn(window.history, 'back').mockImplementation(() => {});
};
const teardown = () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
};

describe('Router.leave and entry origin stamps (1.0.2 BUG-87)', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('(a) every fresh entry is stamped with the hash it was pushed from', () => {
    go('#transactions');
    expect(window.history.state).toMatchObject({ stackdNav: 1, from: null }); // origin before the first route is unknown
    go('#edit?id=t1');
    expect(window.history.state).toMatchObject({ stackdNav: 1, from: '#transactions' });
    expect(R()._curHash).toBe('#edit?id=t1');
  });

  it('a stamped entry is never re-stamped (Back/Forward restore their own stamps)', () => {
    go('#transactions');
    go('#edit?id=t1');
    R()._curHash = '#somewhere-else';
    R().handleRouteChange();
    expect(window.history.state).toMatchObject({ stackdNav: 1, from: '#transactions' });
    expect(R()._curHash).toBe('#edit?id=t1');
  });

  it('(b) back branch: the origin is the landing screen -> rewrite + route synchronously, then drop the duplicate', () => {
    go('#transactions');
    go('#edit?id=t1');
    window.Store.dispatch.mockClear();
    R().leave('#transactions');
    expect(window.location.hash).toBe('#transactions');
    expect(window.Store.dispatch).toHaveBeenCalledWith('SET_VIEW', 'transactions');
    expect(state.activeView).toBe('transactions');
    expect(window.history.back).toHaveBeenCalledTimes(1);
    expect(window.history.state.left).toBe(1);
    // A second leave (double tap) changes nothing.
    R().leave('#transactions');
    expect(window.history.back).toHaveBeenCalledTimes(1);
  });

  it('a leave while a step back is still landing (state.left) is ignored', () => {
    go('#transactions');
    go('#edit?id=t1');
    R().leave('#transactions');
    window.Store.dispatch.mockClear();
    R().leave('#categories'); // the transient entry still carries left: 1
    expect(window.location.hash).toBe('#transactions');
    expect(window.Store.dispatch).not.toHaveBeenCalled();
    expect(window.history.back).toHaveBeenCalledTimes(1);
  });

  it('(c) replace branch: another screen underneath -> the entry is rewritten in place and keeps its origin', () => {
    go('#category-detail?id=cat_groceries');
    go('#edit?id=t1');
    const len = window.history.length;
    window.Store.dispatch.mockClear();
    R().leave('#transactions');
    expect(window.location.hash).toBe('#transactions');
    expect(window.history.back).not.toHaveBeenCalled();
    expect(window.history.length).toBe(len);
    expect(window.history.state).toMatchObject({ stackdNav: 1, from: '#category-detail?id=cat_groceries' });
    expect(window.history.state.left).toBeUndefined();
    expect(window.Store.dispatch).toHaveBeenCalledWith('SET_VIEW', 'transactions');
  });

  it('(d) filtered History origin (D-U9-8): leave("#transactions") returns to #transactions?account=a1', () => {
    go('#transactions?account=a1');
    go('#edit?id=t1');
    const replaceHash = vi.spyOn(R(), '_replaceHash').mockImplementation(() => {});
    window.Store.dispatch.mockClear();
    R().leave('#transactions');
    expect(window.history.back).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#transactions?account=a1');
    expect(window.Store.dispatch).toHaveBeenCalledWith('UPDATE_FILTERS', { page: 'history', filters: { accounts: ['a1'] }, replace: true });
    expect(window.Store.dispatch).toHaveBeenCalledWith('SET_VIEW', 'transactions');
    expect(replaceHash).not.toHaveBeenCalled();
  });

  it('a path WITH a query never matches an origin by route alone', () => {
    go('#transactions?account=a1');
    go('#edit?id=t1');
    R().leave('#transactions?account=b2');
    expect(window.history.back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#transactions?account=b2');
  });

  it("the bare URL ('' / '#') and '#dashboard' are the same screen", () => {
    window.history.replaceState(null, '', '#');
    R()._curHash = null;
    R().handleRouteChange();
    window.Store.dispatch.mockClear();
    R().leave('#dashboard'); // already there
    expect(window.Store.dispatch).not.toHaveBeenCalled();
    expect(window.history.back).not.toHaveBeenCalled();
    // Home underneath as '' (cold start at the bare URL) is the landing screen.
    go('#settings');
    expect(window.history.state).toMatchObject({ stackdNav: 1, from: '' });
    R().leave('#dashboard');
    expect(window.history.back).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('');
    expect(state.activeView).toBe('dashboard');
  });

  it('(e1) unknown origin on a cold start: leave replaces and never steps back', () => {
    window.history.replaceState(null, '', '#edit-category?id=x');
    R()._curHash = null;
    R().handleRouteChange();
    expect(window.history.state.from).toBeNull();
    R().leave('#categories');
    expect(window.history.back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#categories');
    expect(state.activeView).toBe('categories');
  });

  it('(e2) an unstamped entry reached by Android Back has an unknown origin', () => {
    go('#transactions');
    window.history.replaceState(null, '', '#edit?id=t2'); // an unstamped entry
    R()._back(true);
    expect(R()._noOrigin).toBe(true);
    R().handleRouteChange();
    expect(R()._noOrigin).toBe(false);
    expect(window.history.state.from).toBeNull();
    R().leave('#transactions');
    expect(window.history.back).toHaveBeenCalledTimes(1); // only _back's
    expect(window.location.hash).toBe('#transactions');
  });

  it('_back(false) (empty WebView history) navigates Home and leaves _noOrigin alone', () => {
    go('#settings');
    R()._back(false);
    expect(R()._noOrigin).toBe(false);
    expect(window.history.back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#dashboard');
  });

  it('(f) a refused replaceState (WebKit rate limit) falls back to location.replace with an unknown origin', () => {
    go('#transactions');
    go('#edit?id=t1');
    const replaceHash = vi.spyOn(R(), '_replaceHash').mockImplementation(() => {});
    vi.spyOn(window.history, 'replaceState').mockImplementationOnce(() => { throw new Error('SecurityError'); });
    window.Store.dispatch.mockClear();
    R().leave('#transactions');
    expect(replaceHash).toHaveBeenCalledWith('#transactions');
    expect(window.history.back).not.toHaveBeenCalled();
    expect(R()._noOrigin).toBe(true);
    expect(window.Store.dispatch).not.toHaveBeenCalled(); // location.replace's hashchange routes later
  });

  it('a refused stamp is swallowed: the route still applies and leave() then replaces', () => {
    go('#transactions');
    vi.spyOn(window.history, 'replaceState').mockImplementationOnce(() => { throw new Error('SecurityError'); });
    expect(() => go('#edit?id=t1')).not.toThrow();
    expect(state.activeView).toBe('edit');
    expect(R()._entryState()).toBeNull(); // unstamped (jsdom reports undefined, browsers null)
    R().leave('#transactions');
    expect(window.history.back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#transactions');
  });

  it('ignores a non-string path', () => {
    go('#transactions');
    window.Store.dispatch.mockClear();
    R().leave(undefined);
    R().leave(null);
    expect(window.location.hash).toBe('#transactions');
    expect(window.Store.dispatch).not.toHaveBeenCalled();
    expect(window.history.back).not.toHaveBeenCalled();
  });
});

describe('Router without a History API (1.0.2 BUG-87)', () => {
  // (g) Unit-test windows such as loanLinkedPayments / loanSyncReview /
  // reviewFixesMisc: a plain object, or history with only back().
  const bootPlain = (win) => {
    state = { activeView: 'debt-results' };
    global.window = Object.assign(win, { Store: makeStore() });
    executeFile('router.js');
  };
  afterEach(() => {
    global.window = jsdomWindow;
    vi.restoreAllMocks();
  });

  it('(g) no history at all: handleRouteChange does not throw and leave() navigates', () => {
    bootPlain({ location: { hash: '#debt-results?id=x' } });
    expect(() => window.Router.handleRouteChange()).not.toThrow();
    expect(window.Router._curHash).toBe('#debt-results?id=x');
    expect(() => window.Router.leave('#debt')).not.toThrow();
    expect(window.location.hash).toBe('#debt');
  });

  it('history with back() only: the stamp is a no-op and leave() navigates without stepping back', () => {
    const back = vi.fn();
    bootPlain({ location: { hash: '#edit?id=t1' }, history: { back } });
    expect(() => window.Router.handleRouteChange()).not.toThrow();
    window.Router.leave('#transactions');
    expect(window.location.hash).toBe('#transactions');
    expect(back).not.toHaveBeenCalled();
  });

  it('_replaceHash uses location.replace, or navigate() when there is none', () => {
    const replace = vi.fn();
    bootPlain({ location: { hash: '#a', replace } });
    window.Router._replaceHash('#b');
    expect(replace).toHaveBeenCalledWith('#b');
    expect(window.location.hash).toBe('#a');
    bootPlain({ location: { hash: '#a' } });
    window.Router._replaceHash('#b');
    expect(window.location.hash).toBe('#b');
  });
});

// Router.init() adds a hashchange listener to the shared jsdom window, bound to
// that case's Router. It is removed after each case here: left in place it
// would route every later hash change (including the hashchange tasks the
// synchronous cases above queued) into the next case's Store stub. Cases may
// follow this describe.
describe('[data-router-leave] links (1.0.2 BUG-87)', () => {
  let addSpy;
  beforeEach(() => {
    setup();
    addSpy = vi.spyOn(window, 'addEventListener');
  });
  afterEach(() => {
    addSpy.mock.calls
      .filter(([type]) => type === 'hashchange')
      .forEach(([type, fn, opts]) => window.removeEventListener(type, fn, opts));
    teardown();
  });

  it('(h) a [data-router-leave] link leaves instead of pushing', () => {
    R().init();
    const rv = document.getElementById('router-view');
    rv.innerHTML = '<a id="x" href="#categories" data-router-leave><svg></svg></a><div id="plain"><span id="inner">p</span></div>';
    const leave = vi.spyOn(R(), 'leave').mockImplementation(() => {});
    const len = window.history.length;
    const hash = window.location.hash;

    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    rv.querySelector('svg').dispatchEvent(ev);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledWith('#categories');
    expect(ev.defaultPrevented).toBe(true);
    expect(window.history.length).toBe(len);
    expect(window.location.hash).toBe(hash);

    // Any other element is not intercepted. (Not an href-less <a>: jsdom still
    // "follows" one, queueing a push of the bare URL into a later case.)
    const evPlain = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    rv.querySelector('#inner').dispatchEvent(evPlain);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(evPlain.defaultPrevented).toBe(false);

    // A click another handler already prevented is left alone.
    const stop = (e) => e.preventDefault();
    rv.querySelector('#x').addEventListener('click', stop);
    const ev2 = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    rv.querySelector('#x').dispatchEvent(ev2);
    expect(leave).toHaveBeenCalledTimes(1);
    rv.querySelector('#x').removeEventListener('click', stop);
  });
});

// Guard for the describe above: a case that follows a Router.init() case sees
// neither init()'s hashchange listener nor a navigation queued by its clicks.
describe('after a Router.init() case (1.0.2 BUG-87)', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('nothing from an earlier init() case routes or navigates in a later case', async () => {
    window.Store.dispatch.mockClear();
    go('#transactions');
    go('#edit?id=t1');
    await new Promise(r => setTimeout(r, 20)); // jsdom fires hashchange as a task
    const views = window.Store.dispatch.mock.calls.filter(c => c[0] === 'SET_VIEW').map(c => c[1]);
    expect(views).toEqual(['transactions', 'edit']);
    expect(window.location.hash).toBe('#edit?id=t1');
    expect(window.history.state).toMatchObject({ stackdNav: 1, from: '#transactions' });
  });
});
