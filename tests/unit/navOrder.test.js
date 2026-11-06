// 1.2.2 (HG-7 P2, docs/smart-insights-plan.md §3.5): the tab bar order.
// Home is always first and the start screen; the other four tabs follow the
// order saved per device (stackd_v1_navOrder, SET_NAV_ORDER), normalised on
// read. Settings → Tab bar moves a tab with Move up / Move down buttons (the
// non-drag path, WCAG 2.5.7); focus stays on the moved row and a polite live
// region outside #router-view says where it went (4.1.3).
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

const Store = () => global.window.Store;
const Nav = () => global.window.Components.BottomNav;
const DEFAULT = ['transactions', 'budget', 'analytics', 'insights'];

describe('Store: the tab bar order', () => {
  beforeEach(() => boot());

  it('defaults to History, Goals, Analytics, Smart Insights; Home is never in the list', () => {
    expect(Store().getNavOrder()).toEqual(DEFAULT);
    expect(Store().NAV_TABS).toEqual(DEFAULT);
  });

  it('normalises: unknown ids and Home dropped, duplicates kept once, missing tabs appended in the default order', () => {
    expect(Store().normalizeNavOrder(['insights', 'dashboard', 'bogus', 'insights', 'budget', 42]))
      .toEqual(['insights', 'budget', 'transactions', 'analytics']);
    expect(Store().normalizeNavOrder(null)).toEqual(DEFAULT);
    expect(Store().normalizeNavOrder('analytics')).toEqual(DEFAULT);
  });

  it('SET_NAV_ORDER saves per device, a new boot reads it, RESET_APP restores the default and drops the key', () => {
    Store().dispatch('SET_NAV_ORDER', ['insights', 'transactions', 'budget', 'analytics']);
    expect(Store().getNavOrder()).toEqual(['insights', 'transactions', 'budget', 'analytics']);
    const saved = global.window.localStorage.getItem('stackd_v1_navOrder');
    expect(JSON.parse(saved)).toEqual(['insights', 'transactions', 'budget', 'analytics']);

    boot({ stackd_v1_navOrder: saved });
    expect(Store().getNavOrder()).toEqual(['insights', 'transactions', 'budget', 'analytics']);

    Store().dispatch('RESET_APP', {});
    expect(Store().getNavOrder()).toEqual(DEFAULT);
    expect(global.window.localStorage.getItem('stackd_v1_navOrder')).toBeNull();
  });

  it('a stored order from an older build gains the tabs it lacks', () => {
    boot({ stackd_v1_navOrder: JSON.stringify(['analytics', 'transactions']) });
    expect(Store().getNavOrder()).toEqual(['analytics', 'transactions', 'budget', 'insights']);
  });

  it('a rolled-back change reloads the slice (_reloadSlice knows the key)', () => {
    Store().state.navOrder = ['budget'];
    expect(Store()._reloadSlice('navOrder')).toBe(true);
    expect(Store().getNavOrder()).toEqual(DEFAULT);
  });
});

describe('BottomNav', () => {
  beforeEach(() => boot());

  const views = () => {
    const div = document.createElement('div');
    div.innerHTML = Nav().render();
    return [...div.querySelectorAll('.nav-pill a.nav-item')].map(a => `${a.dataset.view}:${a.getAttribute('href')}`);
  };

  it('Home first, then the saved order', () => {
    expect(views()).toEqual(['dashboard:#dashboard', 'transactions:#transactions', 'budget:#budget', 'analytics:#analytics', 'insights:#insights']);
    Store().dispatch('SET_NAV_ORDER', ['insights', 'analytics', 'budget', 'transactions']);
    expect(views()).toEqual(['dashboard:#dashboard', 'insights:#insights', 'analytics:#analytics', 'budget:#budget', 'transactions:#transactions']);
  });

  it('every tab keeps its label; the rebuild key follows the order and the language', () => {
    const div = document.createElement('div');
    div.innerHTML = Nav().render();
    expect([...div.querySelectorAll('.nav-item')].map(a => a.getAttribute('aria-label')))
      .toEqual(['Dashboard', 'History', 'Goals', 'Analytics', 'Smart Insights']);
    const k1 = Nav().key(Store().getState());
    Store().dispatch('SET_NAV_ORDER', ['budget', 'transactions', 'analytics', 'insights']);
    const k2 = Nav().key(Store().getState());
    expect(k2).not.toBe(k1);
    expect(Nav().key({ ...Store().getState(), language: 'fr' })).not.toBe(k2);
  });
});

describe('Settings → Tab bar', () => {
  beforeEach(() => boot());

  const V = () => global.window.Views.OthersView;
  const mount = () => {
    const root = document.getElementById('router-view');
    root.innerHTML = V().render(Store().getState());
    V().attachEvents(root, Store().getState());
    return root;
  };
  const rows = (root) => [...root.querySelectorAll('#nav-order-list > li')].map(li => li.dataset.navView);
  const btn = (root, dir, view) => root.querySelector(`button[data-nav-move="${dir}"][data-nav-view="${view}"]`);
  const announced = () => new Promise(r => setTimeout(() => r((document.getElementById('sr-announcer') || {}).textContent), 90));

  it('Home is locked first; four rows with labelled Move up / Move down, disabled at the ends', () => {
    const root = mount();
    expect(rows(root)).toEqual(['dashboard', ...DEFAULT]);
    const home = root.querySelector('li[data-nav-view="dashboard"]');
    expect(home.textContent).toContain('Always first · opens at start');
    expect(home.querySelector('button')).toBeNull();
    expect(root.querySelector('#nav-order-list').getAttribute('aria-labelledby')).toBe('nav-order-title');
    expect(btn(root, 'up', 'transactions').disabled).toBe(true);
    expect(btn(root, 'down', 'transactions').disabled).toBe(false);
    expect(btn(root, 'down', 'insights').disabled).toBe(true);
    expect(btn(root, 'up', 'insights').getAttribute('aria-label')).toBe('Move Smart Insights up');
    expect(btn(root, 'down', 'budget').getAttribute('aria-label')).toBe('Move Goals down');
    // the grips are for the pointer only
    root.querySelectorAll('.nav-order-grip').forEach(g => expect(g.getAttribute('aria-hidden')).toBe('true'));
    // the live region exists before the first message
    expect(document.getElementById('sr-announcer').getAttribute('aria-live')).toBe('polite');
    // no reset while the order is the default
    expect(root.querySelector('#btn-nav-order-reset')).toBeNull();
  });

  it('Move up: the new order is saved, focus stays on the moved row and the live region says where it went', async () => {
    let root = mount();
    btn(root, 'up', 'insights').click();
    expect(Store().getNavOrder()).toEqual(['transactions', 'budget', 'insights', 'analytics']);
    root = mount(); // the re-render the dispatch triggers
    expect(rows(root)).toEqual(['dashboard', 'transactions', 'budget', 'insights', 'analytics']);
    expect(document.activeElement).toBe(btn(root, 'up', 'insights'));
    expect(await announced()).toBe('Smart Insights is now in position 4 of 5.');
  });

  it('a row that reaches an end keeps focus on its other button', async () => {
    let root = mount();
    btn(root, 'up', 'budget').click();
    root = mount();
    expect(Store().getNavOrder()[0]).toBe('budget');
    expect(btn(root, 'up', 'budget').disabled).toBe(true);
    expect(document.activeElement).toBe(btn(root, 'down', 'budget'));
    expect(await announced()).toBe('Goals is now in position 2 of 5.');
  });

  it('Restore the default order appears once the order differs, and restores it', async () => {
    Store().dispatch('SET_NAV_ORDER', ['insights', 'analytics', 'budget', 'transactions']);
    let root = mount();
    const reset = root.querySelector('#btn-nav-order-reset');
    expect(reset.textContent).toBe('Restore the default order');
    reset.click();
    expect(Store().getNavOrder()).toEqual(DEFAULT);
    root = mount();
    expect(root.querySelector('#btn-nav-order-reset')).toBeNull();
    expect(document.activeElement).toBe(btn(root, 'down', 'transactions'));
    expect(await announced()).toBe('Default order restored.');
  });
});
