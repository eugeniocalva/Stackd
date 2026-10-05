import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.2 (live-U3-N2): #edit?id=A -> #edit?id=B (the web address bar) keeps the
// view, so SET_VIEW changed nothing and nothing re-rendered: the form kept A's
// fields and a save edited A. A form route whose query changed now renders
// afresh. routerLeave.test.js harness.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let state;
const R = () => window.Router;
const go = (hash) => { window.location.hash = hash; R().handleRouteChange(); };

describe('Router: a form route with a new query re-renders (1.0.2 live-U3-N2)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="router-view"></main><nav id="bottom-nav"></nav><div id="modal-container"></div>';
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    state = { activeView: 'dashboard', isSelectionMode: false, widgetEditMode: false, homeWidgets: [] };
    global.window.Store = {
      getState: () => state,
      dispatch: vi.fn((a, p) => { if (a === 'SET_VIEW') state.activeView = p; }),
      emit: vi.fn(),
      getCurrencySymbol: () => '€'
    };
    executeFile('components.js');
    executeFile('router.js');
    window.history.replaceState(null, '', '#dashboard');
    R()._curHash = null;
  });
  afterEach(() => vi.restoreAllMocks());

  it('#edit?id=A -> #edit?id=B emits one render', () => {
    go('#transactions');
    go('#edit?id=A');
    expect(window.Store.emit).not.toHaveBeenCalled(); // a view change renders through SET_VIEW
    go('#edit?id=B');
    expect(state.activeView).toBe('edit');
    expect(window.Store.emit).toHaveBeenCalledTimes(1);
  });

  it('the same hash again, or a non-form view with a new query, does not force a render', () => {
    go('#edit?id=A');
    R().handleRouteChange(); // same hash (Router.leave's same-pass route)
    expect(window.Store.emit).not.toHaveBeenCalled();
    go('#transactions');
    go('#transactions?account=x');
    expect(window.Store.emit).not.toHaveBeenCalled();
  });

  it('works for every form route (edit-account, edit-category)', () => {
    go('#edit-account?id=a1');
    go('#edit-account?id=a2');
    go('#edit-category?id=c1');
    go('#edit-category?id=c2');
    expect(window.Store.emit).toHaveBeenCalledTimes(2);
  });
});
