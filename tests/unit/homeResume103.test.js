// 1.0.3 (BUG-142) Home after a resume on a new day: ROLL_PERIODS re-rendered
// only History/Analytics, so a WebView kept in memory overnight showed
// yesterday's Home ("today" markers, month-to-date widgets, upcoming) until
// something else re-rendered it. The store now remembers the local day of the
// last render (`_renderedDay`, stamped by emit) and ROLL_PERIODS re-renders
// Home when that day has passed. Forms and Goals stay silent (half-typed
// input). D6: a timer at the next local midnight runs the same resume path
// while the app is visible.
// 1.0.3 (BUG-115) History's Today on a period that does not contain today
// moves to today's period of the same type (a custom range → this month).
// Zone pinned to Europe/Rome; only Date (and setTimeout where needed) faked.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const jsdomWindow = globalThis.window;
const flush = () => new Promise((r) => setTimeout(r, 0));
const at = (iso) => vi.setSystemTime(new Date(iso));

let prevTZ;
beforeAll(() => {
  prevTZ = process.env.TZ;
  process.env.TZ = 'Europe/Rome';
});
afterAll(() => {
  if (prevTZ === undefined) delete process.env.TZ;
  else process.env.TZ = prevTZ;
});

describe('Home re-renders after a resume on a new day (1.0.3 BUG-142)', () => {
  let Store;
  let emits;

  const boot = (iso, view) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(iso);
    const mem = {};
    global.window = {
      localStorage: {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: (k) => { delete mem[k]; }
      },
      crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) },
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    Store = global.window.Store;
    Store.init();
    Store.state.activeView = view;
    emits = 0;
    Store.subscribe(() => { emits++; });
    Store.emit({ sync: true }); // main.js boot render
    emits = 0;
  };

  afterEach(() => { vi.useRealTimers(); });

  it('Home left open across midnight re-renders once on ROLL_PERIODS; a second trigger is a no-op', async () => {
    boot('2026-10-31T23:45:00+01:00', 'dashboard');
    const save = vi.spyOn(global.window.StackdDB, 'save');
    at('2026-11-01T00:05:00+01:00');
    Store.dispatch('ROLL_PERIODS');
    await flush();
    expect(emits).toBe(1);
    Store.dispatch('ROLL_PERIODS');
    await flush();
    expect(emits).toBe(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('two triggers in the same tick (visibility + native resume) render once', async () => {
    boot('2026-10-31T23:45:00+01:00', 'dashboard');
    at('2026-11-01T07:00:00+01:00');
    Store.dispatch('ROLL_PERIODS');
    Store.dispatch('ROLL_PERIODS');
    await flush();
    expect(emits).toBe(1);
  });

  it('the same day re-renders nothing', async () => {
    boot('2026-10-31T10:00:00+01:00', 'dashboard');
    at('2026-10-31T23:59:00+01:00');
    Store.dispatch('ROLL_PERIODS');
    await flush();
    expect(emits).toBe(0);
  });

  it('a form or Goals stays put on a new day', async () => {
    for (const view of ['add', 'edit', 'budget', 'others']) {
      boot('2026-10-31T23:45:00+01:00', view);
      at('2026-11-01T00:05:00+01:00');
      Store.dispatch('ROLL_PERIODS');
      await flush();
      expect(emits).toBe(0);
    }
  });

  it('a render after midnight counts: Home rendered today does not re-render again', async () => {
    boot('2026-10-31T23:45:00+01:00', 'dashboard');
    at('2026-11-01T00:05:00+01:00');
    Store.emit(); // some other change re-rendered Home after midnight
    await flush();
    emits = 0;
    Store.dispatch('ROLL_PERIODS');
    await flush();
    expect(emits).toBe(0);
  });
});

describe('main.js midnight timer (1.0.3 BUG-142, D6)', () => {
  const main = readFileSync(resolve(__dirname, '../../src/main.js'), 'utf8');
  const block = (main.match(/const armMidnightRoll = \(\) => \{[\s\S]*?\r?\n  \};\r?\n  armMidnightRoll\(\);/) || [])[0];

  afterEach(() => { vi.useRealTimers(); });

  it('exists next to the resume wiring', () => {
    expect(block).toBeTruthy();
    expect(main.indexOf('const armMidnightRoll')).toBeGreaterThan(main.indexOf('const rollPeriodsOnResume'));
  });

  it('fires just after the next local midnight (DST night too), only while visible, and re-arms', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    at('2026-10-24T22:00:00+02:00'); // the night before the end of DST (25 Oct, 25-hour day)
    const roll = vi.fn();
    const doc = { visibilityState: 'visible' };
    new Function('rollPeriodsOnResume', 'document', block)(roll, doc);
    vi.advanceTimersByTime(2 * 3600 * 1000);       // 00:00:00 on the 25th
    expect(roll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5 * 1000);              // 00:00:05
    expect(roll).toHaveBeenCalledTimes(1);
    expect(new Date().getDate()).toBe(25);
    doc.visibilityState = 'hidden';
    vi.advanceTimersByTime(25 * 3600 * 1000);      // next midnight (a 25-hour day), hidden
    expect(new Date().getDate()).toBe(26);
    expect(roll).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    vi.advanceTimersByTime(24 * 3600 * 1000);
    expect(roll).toHaveBeenCalledTimes(2);
  });
});

describe("History's Today on a period without today (1.0.3 BUG-115)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-10-15T12:00:00+02:00');
    global.window = jsdomWindow;
    const mem = {};
    const ls = {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; },
      clear: () => {}
    };
    Object.defineProperty(window, 'localStorage', { value: ls, configurable: true, writable: true });
    global.localStorage = ls;
    document.body.innerHTML = '<div id="modal-container"></div><div id="router-view"></div>';
    window.StackdHydrateIcons = vi.fn();
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');
    window.Views = { TransactionsView: { scrollToToday: vi.fn() } };
    window.Store.init();
    window.Store.dispatch('SET_VIEW', 'transactions');
  });
  afterEach(() => { vi.useRealTimers(); });

  const tapToday = (period) => {
    const S = window.Store;
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period } });
    const container = document.getElementById('router-view');
    container.innerHTML = window.Components.AdvancedFilterBar.render('history', S.state.historyFilters);
    window.Components.AdvancedFilterBar.attachEvents(container, 'history');
    const spy = vi.spyOn(window, 'dispatchEvent');
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    container.querySelector('#btn-today-history').click();
    const scrolledAtOnce = window.Views.TransactionsView.scrollToToday.mock.calls.length > 0;
    vi.advanceTimersByTime(150);
    const scrolledLater = spy.mock.calls.some((c) => c[0] && c[0].type === 'scroll-history-to-today');
    spy.mockRestore();
    return { period: S.state.historyFilters.period, scrolledAtOnce, scrolledLater };
  };

  it('a past month moves to this month, then scrolls after the re-render', () => {
    const r = tapToday({ type: 'month', value: '2026-08-01', start: '', end: '' });
    expect(r.period).toMatchObject({ type: 'month', value: '2026-10-01' });
    expect(r.scrolledAtOnce).toBe(false);
    expect(r.scrolledLater).toBe(true);
  });

  it('a past week, day or year moves to today\'s', () => {
    expect(tapToday({ type: 'week', value: '2026-09-02', start: '', end: '' }).period).toMatchObject({ type: 'week', value: '2026-10-15' });
    expect(tapToday({ type: 'today', value: '2026-10-02', start: '', end: '' }).period).toMatchObject({ type: 'today', value: '2026-10-15' });
    expect(tapToday({ type: 'year', value: '2025-03-01', start: '', end: '' }).period).toMatchObject({ type: 'year', value: '2026-01-01' });
  });

  it('a custom range without today becomes this month', () => {
    const r = tapToday({ type: 'custom', value: '', start: '2026-09-01', end: '2026-09-20' });
    expect(r.period).toMatchObject({ type: 'month', value: '2026-10-01' });
    expect(r.scrolledLater).toBe(true);
  });

  it('a period that holds today is kept and scrolls at once', () => {
    const r = tapToday({ type: 'custom', value: '', start: '2026-10-01', end: '2026-10-20' });
    expect(r.period).toMatchObject({ type: 'custom', start: '2026-10-01', end: '2026-10-20' });
    expect(r.scrolledAtOnce).toBe(true);
    expect(r.scrolledLater).toBe(false);
  });
});
