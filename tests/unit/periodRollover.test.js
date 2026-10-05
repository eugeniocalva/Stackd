// 1.0.2 (BUG-69) A History/Analytics period that showed the current day,
// week, month or year follows the calendar once the local date moves on (app
// left open across midnight, resumed the next morning). A period the user
// moved away from, or a custom range, stays. The reconcile runs on every
// SET_VIEW, on ROLL_PERIODS (resume, History's Today) and before every filter
// action; FilterModal never sends the period back. Zone pinned to Europe/Rome
// (the owner's Lisbon machine and CI's UTC hide date bugs); only Date is
// faked and every clock is an ISO string with an explicit offset.
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

describe('Live periods roll over (1.0.2 BUG-69)', () => {
  let Store;
  let emits;

  const boot = (iso) => {
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
    emits = 0;
    Store.subscribe(() => { emits++; });
  };

  afterEach(() => { vi.useRealTimers(); });

  it('a month left open across midnight rolls on the next SET_VIEW; a page moved with ‹ stays', () => {
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'dashboard');
    Store.dispatch('NAVIGATE_PERIOD', { offset: -1, page: 'analytics' }); // September, chosen on 31 Oct
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('SET_VIEW', 'add');
    Store.dispatch('SET_VIEW', 'transactions');
    expect(Store.state.historyFilters.period.value).toBe('2026-11-01');
    expect(Store._getPeriodLabel(Store.state.historyFilters.period)).toBe('This Month');
    expect(Store.isDateInPeriod('2026-11-01', Store.state.historyFilters.period)).toBe(true);
    expect(Store.state.analyticsFilters.period.value).toBe('2026-09-01');
  });

  it('a Day period follows today', () => {
    boot('2026-10-15T10:00:00+02:00');
    Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'today', value: '2026-10-15', start: '', end: '' } } });
    at('2026-10-16T08:00:00+02:00');
    Store.dispatch('SET_VIEW', 'transactions');
    expect(Store.state.historyFilters.period.value).toBe('2026-10-16');
    expect(Store._getPeriodLabel(Store.state.historyFilters.period)).toBe('Today');
  });

  it('a Week period rolls into the new week, a Year period into the new year (anchored on 1 Jan)', () => {
    boot('2026-11-01T20:00:00+01:00'); // Sunday
    Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'week', value: '2026-11-01', start: '', end: '' } } });
    at('2026-11-02T07:00:00+01:00'); // Monday
    Store.dispatch('SET_VIEW', 'transactions');
    expect(Store.state.historyFilters.period).toMatchObject({ type: 'week', value: '2026-11-02' });
    expect(Store._getPeriodLabel(Store.state.historyFilters.period)).toBe('This Week');

    boot('2026-12-31T23:59:00+01:00');
    Store.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { period: { type: 'year', value: '2026-12-31', start: '', end: '' } } });
    at('2027-01-01T00:01:00+01:00');
    Store.dispatch('SET_VIEW', 'analytics');
    expect(Store.state.analyticsFilters.period).toMatchObject({ type: 'year', value: '2027-01-01' });
    // a month on 31 Dec rolls to the 1st, never to a 29th-31st anchor
    expect(Store.state.historyFilters.period).toMatchObject({ type: 'month', value: '2027-01-01' });
  });

  it('a custom range never moves', () => {
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'custom', start: '2026-10-01', end: '2026-10-31', value: '' } } });
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('SET_VIEW', 'analytics');
    expect(Store.state.historyFilters.period).toMatchObject({ type: 'custom', start: '2026-10-01', end: '2026-10-31' });
    expect(Store.state.analyticsFilters.period.value).toBe('2026-11-01');
  });

  it('the same day is a no-op: nothing moves, nothing is re-created', () => {
    boot('2026-10-31T10:00:00+01:00');
    const hist = Store.state.historyFilters;
    const ana = Store.state.analyticsFilters;
    at('2026-10-31T23:59:00+01:00');
    expect(Store._rollLivePeriods()).toEqual([]);
    Store.dispatch('ROLL_PERIODS');
    Store.dispatch('SET_VIEW', 'transactions');
    expect(Store.state.historyFilters).toBe(hist);
    expect(Store.state.analyticsFilters).toBe(ana);
    expect(Store._liveDay).toBe('2026-10-31');
  });

  it('ROLL_PERIODS re-renders Analytics once, is idempotent, is silent on a form, and saves nothing', async () => {
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'analytics');
    await flush(); emits = 0;
    const save = vi.spyOn(global.window.StackdDB, 'save');
    at('2026-11-01T08:00:00+01:00');
    Store.dispatch('ROLL_PERIODS');
    await flush();
    expect(Store.state.analyticsFilters.period.value).toBe('2026-11-01');
    expect(emits).toBe(1);
    Store.dispatch('ROLL_PERIODS'); // idempotent: a second trigger is a no-op
    await flush();
    expect(emits).toBe(1);
    expect(save).not.toHaveBeenCalled();

    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'add');
    await flush(); emits = 0;
    at('2026-11-01T00:30:00+01:00');
    Store.dispatch('ROLL_PERIODS');
    await flush();
    expect(Store.state.historyFilters.period.value).toBe('2026-11-01');
    expect(emits).toBe(0);
  });

  it('SET_VIEW re-renders a same-view History after a roll, but not a same-view Home', async () => {
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'transactions');
    await flush(); emits = 0;
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('SET_VIEW', 'transactions');
    await flush();
    expect(Store.state.historyFilters.period.value).toBe('2026-11-01');
    expect(emits).toBe(1);

    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'dashboard');
    await flush(); emits = 0;
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('SET_VIEW', 'dashboard');
    await flush();
    expect(Store.state.historyFilters.period.value).toBe('2026-11-01');
    expect(emits).toBe(0);
  });

  it('on History an Analytics-only roll re-renders nothing; it still rolls (round-1 review)', async () => {
    // History on a custom range (does not roll), Analytics on This Month (rolls).
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'custom', start: '2026-10-25', end: '2026-10-31', value: '' } } });
    Store.dispatch('SET_VIEW', 'transactions');
    await flush(); emits = 0;
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('ROLL_PERIODS');
    await flush();
    expect(Store.state.analyticsFilters.period.value).toBe('2026-11-01');
    expect(Store.state.historyFilters.period).toMatchObject({ type: 'custom', start: '2026-10-25', end: '2026-10-31' });
    expect(emits).toBe(0);

    // Same for a same-view SET_VIEW (re-tapping the History tab).
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'custom', start: '2026-10-25', end: '2026-10-31', value: '' } } });
    Store.dispatch('SET_VIEW', 'transactions');
    await flush(); emits = 0;
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('SET_VIEW', 'transactions');
    await flush();
    expect(Store.state.analyticsFilters.period.value).toBe('2026-11-01');
    expect(emits).toBe(0);

    // And the mirror image: on Analytics, a History-only roll is silent.
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { period: { type: 'custom', start: '2026-10-25', end: '2026-10-31', value: '' } } });
    Store.dispatch('SET_VIEW', 'analytics');
    await flush(); emits = 0;
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('ROLL_PERIODS');
    await flush();
    expect(Store.state.historyFilters.period.value).toBe('2026-11-01');
    expect(emits).toBe(0);
  });

  it('any other action taken on History or Analytics after midnight re-renders the rolled period (integrated review)', async () => {
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'transactions');
    await flush(); emits = 0;
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('TOGGLE_SELECTION_MODE', { active: true });
    await flush();
    expect(Store.state.historyFilters.period.value).toBe('2026-11-01');
    expect(Store._getPeriodLabel(Store.state.historyFilters.period)).toBe('This Month');
    expect(emits).toBe(1);

    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'analytics');
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('SET_ANALYTICS_BALANCE_MODE', 'end');
    expect(Store.state.analyticsFilters.period.value).toBe('2026-11-01');

    // off those pages nothing re-renders for a roll (a form stays put)
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'add');
    await flush(); emits = 0;
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('SET_ANALYTICS_BALANCE_MODE', Store.state.analyticsBalanceMode);
    await flush();
    expect(Store.state.historyFilters.period.value).toBe('2026-10-01');
  });

  it('‹ › on a stale screen step from the period on screen; the choice is not rolled later', () => {
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'transactions');
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('NAVIGATE_PERIOD', { offset: 1, page: 'history' });
    expect(Store.state.historyFilters.period.value).toBe('2026-11-01');
    expect(Store.state.analyticsFilters.period.value).toBe('2026-11-01'); // the other page reconciled
    Store.dispatch('NAVIGATE_PERIOD', { offset: -1, page: 'history' });
    expect(Store.state.historyFilters.period.value).toBe('2026-10-01');
    Store.dispatch('SET_VIEW', 'edit');
    Store.dispatch('SET_VIEW', 'transactions');
    expect(Store.state.historyFilters.period.value).toBe('2026-10-01');

    // A stale ‹ lands on September, not on October again.
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'transactions');
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('NAVIGATE_PERIOD', { offset: -1, page: 'history' });
    expect(Store.state.historyFilters.period.value).toBe('2026-09-01');
  });

  it('a non-period filter change lands on the rolled period', () => {
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'transactions');
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { types: ['expense'] } });
    expect(Store.state.historyFilters.period.value).toBe('2026-11-01');
    expect(Store.state.historyFilters.types).toEqual(['expense']);
  });

  it('a period set by a filter action is kept; the other page reconciles', () => {
    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'transactions');
    at('2026-11-01T00:03:00+01:00');
    // a drill-down's custom range, chosen from what is on screen
    Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'month', value: '2026-10-01', start: '', end: '' } } });
    expect(Store.state.historyFilters.period.value).toBe('2026-10-01');
    expect(Store.state.analyticsFilters.period.value).toBe('2026-11-01');
    Store.dispatch('SET_VIEW', 'transactions');
    expect(Store.state.historyFilters.period.value).toBe('2026-10-01'); // judged against today: a choice

    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'analytics');
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('CLEAR_ALL_FILTERS', { page: 'analytics' });
    expect(Store.state.analyticsFilters.period.value).toBe('2026-11-01');
    expect(Store.state.historyFilters.period.value).toBe('2026-11-01');

    boot('2026-10-31T23:58:00+01:00');
    Store.dispatch('SET_VIEW', 'dashboard');
    Store.dispatch('ADD_ACCOUNT', { id: 'acc_x', name: 'X' }); // UPDATE_FILTERS drops unknown ids (1.0.2 BUG-29)
    at('2026-11-01T00:03:00+01:00');
    Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: ['acc_x'] }, replace: true });
    expect(Store.state.historyFilters.accounts).toEqual(['acc_x']);
    expect(Store.state.analyticsFilters.period.value).toBe('2026-11-01');
  });

  it('_getPreviousPeriod counts a custom range across the DST change correctly (D-U4-4)', () => {
    boot('2026-11-05T12:00:00+01:00');
    expect(Store._getPreviousPeriod({ type: 'custom', start: '2026-10-01', end: '2026-10-31' }))
      .toMatchObject({ start: '2026-08-31', end: '2026-09-30' });
  });

  it('main.js wires both resume triggers to ROLL_PERIODS', () => {
    const main = readFileSync(resolve(__dirname, '../../src/main.js'), 'utf8');
    expect(main).toMatch(/const rollPeriodsOnResume = \(\) => \{[\s\S]{0,200}dispatch\('ROLL_PERIODS'\)[\s\S]{0,300}scroll-history-to-today/);
    expect(main).toMatch(/addEventListener\('visibilitychange'[\s\S]{0,120}rollPeriodsOnResume\(\)/);
    expect(main).toMatch(/addListener\('resume', rollPeriodsOnResume\)/);
  });
});

describe('Sheets and buttons that must not undo a roll (1.0.2 BUG-69)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at('2026-10-31T23:58:00+01:00');
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

  it('FilterModal Apply after a roll keeps the rolled period', () => {
    window.Components.FilterModal.show('history');
    at('2026-11-01T00:05:00+01:00');
    window.Store.dispatch('ROLL_PERIODS');
    expect(window.Store.state.historyFilters.period.value).toBe('2026-11-01');
    document.querySelector('#afm-apply').click();
    expect(window.Store.state.historyFilters.period.value).toBe('2026-11-01');
  });

  it("History's Today rolls a stale period, then scrolls after the re-render; on the same day it scrolls at once", () => {
    const container = document.getElementById('router-view');
    container.innerHTML = window.Components.AdvancedFilterBar.render('history', window.Store.state.historyFilters);
    window.Components.AdvancedFilterBar.attachEvents(container, 'history');
    const spy = vi.spyOn(window, 'dispatchEvent');
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    at('2026-11-01T00:05:00+01:00');
    container.querySelector('#btn-today-history').click();
    expect(window.Store.state.historyFilters.period.value).toBe('2026-11-01');
    expect(window.Views.TransactionsView.scrollToToday).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(spy.mock.calls.some((c) => c[0] && c[0].type === 'scroll-history-to-today')).toBe(true);

    container.querySelector('#btn-today-history').click(); // same day now: plain scroll, as before
    expect(window.Views.TransactionsView.scrollToToday).toHaveBeenCalledWith(container);
    spy.mockRestore();
  });

  it("History's Today on a range that does not roll, while only Analytics rolls, scrolls at once with no re-render after it (round-1 review)", async () => {
    const S = window.Store;
    S.dispatch('UPDATE_FILTERS', { page: 'history', filters: { period: { type: 'custom', start: '2026-10-25', end: '2026-10-31', value: '' } } });
    const container = document.getElementById('router-view');
    container.innerHTML = window.Components.AdvancedFilterBar.render('history', S.state.historyFilters);
    window.Components.AdvancedFilterBar.attachEvents(container, 'history');
    await flush();
    // A re-render after the synchronous scroll would detach its target
    // (scrollToToday reads offsetTop in a later animation frame).
    const order = [];
    S.subscribe(() => order.push('render'));
    window.Views.TransactionsView.scrollToToday.mockImplementation(() => order.push('scrollToToday'));
    const spy = vi.spyOn(window, 'dispatchEvent');
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    at('2026-11-01T00:05:00+01:00');
    container.querySelector('#btn-today-history').click();
    await new Promise((r) => queueMicrotask(r)); // a queued emit would flush here
    expect(S.state.analyticsFilters.period.value).toBe('2026-11-01'); // Analytics still rolled
    expect(S.state.historyFilters.period).toMatchObject({ type: 'custom', start: '2026-10-25', end: '2026-10-31' });
    expect(order).toEqual(['scrollToToday']);
    vi.advanceTimersByTime(150);
    expect(spy.mock.calls.some((c) => c[0] && c[0].type === 'scroll-history-to-today')).toBe(false);
    spy.mockRestore();
  });
});
