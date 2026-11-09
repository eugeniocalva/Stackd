// @vitest-environment jsdom
// 1.2.2 (HG-15, docs/phone-widgets-plan.md WG-2) — a tap on a phone widget:
// stackd://open?to=… opens a fixed list of screens, Quick add opens New log
// on its type, and every other URL is left to its owner (Bank Connect).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'document', 'localStorage', 'crypto', content);
  fn(window, document, window.localStorage, window.crypto);
};

const S = () => window.Store;
const N = () => window.StackdWidgets;
let n = 0;

describe('Phone widget links (HG-15 WG-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 9, 10, 0, 0));
    document.body.innerHTML = '<div id="modal-container"></div><main id="router-view"></main>';
    window.localStorage.clear();
    window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
    Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'uuid-' + (++n) }, writable: true, configurable: true });
    delete window.Capacitor;
    window.StackdHydrateIcons = vi.fn();
    window.Router = { navigate: vi.fn(), handleRouteChange: vi.fn(), getParams: () => ({}) };
    window.location.hash = '';
    ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'widgets-native.js', 'insights.js', 'views.js'].forEach(executeFile);
    S().init();
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 10, openingDate: '2026-01-01' });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('maps every target to its screen; anything unknown opens Home', () => {
    const p = (u) => N().parseOpenUrl(u).path;
    expect(p('stackd://open?to=home')).toBe('#dashboard');
    expect(p('stackd://open?to=add&type=income')).toBe('#add?type=income');
    expect(p('stackd://open?to=add&type=transfer')).toBe('#add?type=transfer');
    expect(p('stackd://open?to=add&type=<b>')).toBe('#add');
    expect(p('stackd://open?to=analytics')).toBe('#analytics');
    expect(p('stackd://open?to=budget')).toBe('#budget');
    expect(p('stackd://open?to=history&day=2026-11-12')).toBe('#transactions');
    expect(p('stackd://open?to=settings')).toBe('#dashboard');
    expect(p('stackd://open')).toBe('#dashboard');
  });

  it('leaves every other URL to its owner', () => {
    expect(N().parseOpenUrl('stackd://connect/return?ref=abc')).toBe(null);
    expect(N().parseOpenUrl('https://api.stackdplatform.com/connect/return?ref=abc')).toBe(null);
    expect(N().parseOpenUrl('stackd://opener?to=add')).toBe(null);
    expect(N().parseOpenUrl(null)).toBe(null);
    expect(N().openUrl('stackd://connect/return?ref=abc')).toBe(false);
  });

  it('History opens on that one day with every other filter cleared; a bad day opens it plain', () => {
    S().dispatch('UPDATE_FILTERS', { page: 'history', filters: { tags: ['x'] } });
    expect(N().openUrl('stackd://open?to=history&day=2026-11-12')).toBe(true);
    const f = S().getState().historyFilters;
    expect(f.period).toMatchObject({ type: 'custom', start: '2026-11-12', end: '2026-11-12' });
    expect(f.tags).toEqual([]);
    expect(window.Router.navigate).toHaveBeenCalledWith('#transactions');
    expect(N().parseOpenUrl('stackd://open?to=history&day=2026-02-30').actions).toEqual([]);
  });

  it('Analytics and Goals open on this month', () => {
    S().dispatch('SET_MONTH_FILTER', '2026-01');
    N().openUrl('stackd://open?to=budget');
    expect(S().getState().activeMonthFilter).toBe('2026-11');
    N().openUrl('stackd://open?to=analytics');
    const p = S().getState().analyticsFilters.period;
    expect(p.type).toBe('month');
    expect(p.value.slice(0, 7)).toBe('2026-11');
  });

  it('re-applies the route when the app already shows that screen', () => {
    window.location.hash = '#add?type=income';
    N().openUrl('stackd://open?to=add&type=income');
    expect(window.Router.handleRouteChange).toHaveBeenCalled();
    expect(window.Router.navigate).not.toHaveBeenCalled();
  });

  it('the iOS Quick add tap waiting in the App Group is opened once', async () => {
    const takePending = vi.fn()
      .mockResolvedValueOnce({ url: 'stackd://open?to=add&type=expense' })
      .mockResolvedValueOnce({});
    window.Capacitor = { isNativePlatform: () => true, Plugins: { StackdWidgets: { takePending } } };
    expect(await N().consumePending()).toBe(true);
    expect(window.Router.navigate).toHaveBeenCalledWith('#add?type=expense');
    expect(await N().consumePending()).toBe(false);
  });

  it('New log starts on the type from the link; an edit and a draft are not affected', () => {
    const form = (params) => {
      window.Router.getParams = () => params;
      return window.Views.AddTransactionView.render(S().getState());
    };
    const on = (html, id, cls) => new RegExp(`id="${id}" class="btn ${cls}"`).test(html);
    expect(on(form({ type: 'income' }), 'toggle-income', 'btn-income')).toBe(true);
    expect(on(form({ type: 'transfer' }), 'toggle-transfer', 'btn-primary')).toBe(true);
    expect(on(form({ type: 'nope' }), 'toggle-expense', 'btn-danger')).toBe(true);
    window._draftTxFormState = { type: 'expense' };
    expect(on(form({ type: 'income' }), 'toggle-expense', 'btn-danger')).toBe(true);
  });
});
