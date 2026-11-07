// 1.2.2 (HG-10 P4, docs/period-picker-plan.md §0): the Filter sheet.
// - History: "Filter and sort" with Order at the top; Analytics: "Filters",
//   no Order, and Apply sends no sort.
// - Reset (was SHOW ALL) clears the filters and keeps the order.
// - A dialog: role, aria-modal, a name; chips say aria-pressed; a backdrop tap
//   and Escape close without a change; focus returns to the Filter button.
// - Settings no longer has the History sort row (it never drove History).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const makeLocalStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
};

let uuid = 0;
const boot = () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date('2026-11-07T12:00:00'));
  document.body.innerHTML = '<div id="app"><main id="router-view"></main><div id="modal-container"></div></div>';
  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    document,
    StackdHydrateIcons: () => {},
    Router: { navigate: vi.fn(), getParams: () => ({}) }
  };
  global.localStorage = global.window.localStorage;
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'views.js'].forEach(executeFile);
  const S = global.window.Store;
  S.init();
  S.dispatch('SET_CURRENCY', 'EUR');
  S.dispatch('ADD_ACCOUNT', { id: 'acc_a', name: 'Main', openingBalance: 100, openingDate: '2020-01-01' });
  S.dispatch('ADD_ACCOUNT', { id: 'acc_b', name: 'Cash', openingBalance: 10, openingDate: '2020-01-01' });
  return S;
};

afterEach(() => { vi.useRealTimers(); });

const sheet = () => document.getElementById('filter-advanced-modal');
const C = () => global.window.Components;

describe('the Filter sheet (HG-10 P4)', () => {
  it('History: a named dialog with Order at the top, chips that say aria-pressed', () => {
    const S = boot();
    C().FilterModal.show('history');
    const d = sheet();
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(d.getAttribute('aria-labelledby')).textContent).toBe('Filter and Sort');
    expect(d.querySelector('.filter-group-title').textContent).toBe('Order');
    expect(d.querySelector('[data-sort="asc"]').getAttribute('aria-pressed')).toBe(String(S.state.historyFilters.sortOrder === 'asc'));
    expect(d.textContent).toContain('Accounts');
    expect(d.textContent).not.toContain('Wallets');
    expect(d.textContent).not.toContain('Show All');
  });

  it('Reset clears the filters and keeps the order', () => {
    const S = boot();
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { sortOrder: 'desc', accounts: ['acc_a'], types: ['expense'] } });
    C().FilterModal.show('history');
    sheet().querySelector('#afm-show-all').click();
    sheet().querySelector('#afm-apply').click();
    expect(S.state.historyFilters).toMatchObject({ sortOrder: 'desc', accounts: [], types: [], categories: [], tags: [] });
  });

  it('Analytics: "Filters", no Order, and Apply sends no sort', () => {
    const S = boot();
    C().FilterModal.show('analytics');
    const d = sheet();
    expect(document.getElementById(d.getAttribute('aria-labelledby')).textContent).toBe('Filters');
    expect(d.querySelector('[data-sort]')).toBeNull();
    const spy = vi.spyOn(S, 'dispatch');
    d.querySelector('[data-acc="acc_b"]').click();
    sheet().querySelector('#afm-apply').click();
    const call = spy.mock.calls.find(c => c[0] === 'UPDATE_FILTERS');
    expect(call[1].filters).not.toHaveProperty('sortOrder');
    expect(call[1].filters).not.toHaveProperty('period');
    expect(S.state.analyticsFilters.accounts).toEqual(['acc_b']);
  });

  it('a backdrop tap and Escape close without a change; focus returns to the Filter button', () => {
    const S = boot();
    document.getElementById('router-view').innerHTML = '<button id="btn-filter-history">f</button>';
    C().FilterModal.show('history');
    sheet().querySelector('[data-acc="acc_a"]').click();
    sheet().dispatchEvent(new MouseEvent('click', { bubbles: true })); // the backdrop itself
    expect(S.state.historyFilters.accounts).toEqual([]);
    expect(document.activeElement.id).toBe('btn-filter-history');
    vi.advanceTimersByTime(400);
    C().FilterModal.show('history');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(400);
    expect(sheet()).toBeNull();
  });
});

describe('Settings', () => {
  it('has no History sort row any more', () => {
    const S = boot();
    const html = global.window.Views.OthersView ? global.window.Views.OthersView.render(S.getState()) : '';
    expect(html).not.toBe('');
    expect(html).not.toContain('btn-sort-desc');
    expect(html).not.toContain('History Sort Order');
  });
});
