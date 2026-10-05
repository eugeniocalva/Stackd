// 1.0.2 (BUG-28) computeNetFlowData builds every bucket edge as a LOCAL
// midnight and must format it as the local day. toISOString() gave the UTC
// day: east of UTC every bucket started and ended a day early, so a salary on
// 30 Sep counted for October and a bill on 31 Oct fell out of it. The zone is
// pinned to Europe/Rome — the owner's Lisbon machine (UTC+0 in winter) and a
// UTC CI runner both hide the bug. Only Date is faked.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
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

const makeChartStub = () => {
  const created = [];
  const Chart = function (canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.destroy = () => {};
    created.push(this);
  };
  Chart.getChart = () => null;
  Chart._created = created;
  return Chart;
};

let uuid = 0;
const boot = (iso) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    document: { documentElement: { setAttribute: () => {}, classList: { add: () => {}, remove: () => {} } } }
  };
  global.localStorage = global.window.localStorage;
  // Opt out of the latest-widget seed (an absent key seeds one on boot).
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  global.window.Chart = makeChartStub();
  global.window.Router = { navigate: vi.fn() };
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', 'EUR');
  return global.window.Store;
};

// The report's data: Main opened 1 Sep, salary on 30 Sep, bill on 31 Oct.
const seedReport = (S) => {
  S.dispatch('ADD_ACCOUNT', { id: 'acc_main', name: 'Main Checking', openingBalance: 1000, openingDate: '2026-09-01' });
  S.dispatch('ADD_TRANSACTION', { type: 'income', amount: 2000, accountId: 'acc_main', categoryId: 'cat_salary', date: '2026-09-30', time: '12:00' });
  S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 80, accountId: 'acc_main', categoryId: 'cat_utilities', date: '2026-10-31', time: '12:00' });
};

const filtersFor = (type, value) => ({
  period: { type, value, start: '', end: '' },
  types: [],
  accounts: [],
  categories: [],
  sortOrder: 'desc'
});

const weekday = (ymd) => new Date(ymd + 'T12:00:00').getDay();

describe('Net-flow buckets use local days (1.0.2 BUG-28, Europe/Rome)', () => {
  let prevTZ;
  beforeAll(() => {
    prevTZ = process.env.TZ;
    process.env.TZ = 'Europe/Rome';
  });
  afterAll(() => {
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('month buckets are whole local calendar months, also across the DST change', () => {
    const S = boot('2026-10-03T12:00:00+02:00');
    const b = S.computeNetFlowData(filtersFor('month', '2026-10-01'));
    expect(b).toHaveLength(12);
    expect(b[11]).toMatchObject({ start: '2026-10-01', end: '2026-10-31' });
    expect(b[10]).toMatchObject({ start: '2026-09-01', end: '2026-09-30' });
    const march = b.find((x) => x.start.startsWith('2026-03'));
    expect(march).toMatchObject({ start: '2026-03-01', end: '2026-03-31' });
  });

  it('the report scenario: 30 Sep counts for September, 31 Oct for October', () => {
    const S = boot('2026-10-03T12:00:00+02:00');
    seedReport(S);
    const b = S.computeNetFlowData(filtersFor('month', '2026-10-01'));
    expect(b[11]).toMatchObject({ income: 0, expense: 80, net: -80 });
    expect(b[10].net).toBe(2000);
    // Same month, same answer as Home's projected EOM.
    expect(b[11].net).toBe(S.computeBalanceForecast().eomAbsDiff);
  });

  it('a salary dated today (31 Oct) lands in October', () => {
    const S = boot('2026-10-31T12:00:00+01:00');
    S.dispatch('ADD_ACCOUNT', { id: 'acc_main', name: 'Main Checking', openingBalance: 1000, openingDate: '2026-09-01' });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 60, accountId: 'acc_main', categoryId: 'cat_groceries', date: '2026-10-15', time: '12:00' });
    S.dispatch('ADD_TRANSACTION', { type: 'income', amount: 2400, accountId: 'acc_main', categoryId: 'cat_salary', date: '2026-10-31', time: '09:00' });
    const b = S.computeNetFlowData(filtersFor('month', S._todayYMD()));
    expect(b[11]).toMatchObject({ start: '2026-10-01', end: '2026-10-31', income: 2400, expense: 60, net: 2340 });
  });

  it('day buckets sit on their own day', () => {
    const S = boot('2026-10-03T12:00:00+02:00');
    S.dispatch('ADD_ACCOUNT', { id: 'acc_main', name: 'Main Checking', openingBalance: 1000, openingDate: '2026-09-01' });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 10, accountId: 'acc_main', categoryId: 'cat_groceries', date: '2026-10-02', time: '12:00' });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 25, accountId: 'acc_main', categoryId: 'cat_groceries', date: '2026-10-03', time: '12:00' });
    const b = S.computeNetFlowData(filtersFor('today', '2026-10-03'));
    expect(b.map((x) => x.start)).toEqual([
      '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'
    ]);
    b.forEach((x) => expect(x.end).toBe(x.start));
    expect(b[6].net).toBe(-25);
    expect(b[5].net).toBe(-10);
  });

  it('week buckets run Monday to Sunday', () => {
    const S = boot('2026-10-03T12:00:00+02:00');
    const b = S.computeNetFlowData(filtersFor('week', '2026-10-03'));
    expect(b).toHaveLength(5);
    expect(b[4]).toMatchObject({ start: '2026-09-28', end: '2026-10-04' });
    b.forEach((x) => {
      expect(weekday(x.start)).toBe(1);
      expect(weekday(x.end)).toBe(0);
    });
  });

  it('Income vs Expenses and Personal savings show October as -€80.00', () => {
    const S = boot('2026-10-03T12:00:00+02:00');
    seedReport(S);
    const W = global.window.Widgets;
    const render = (type) => {
      S.dispatch('ADD_HOME_WIDGET', { type, size: 'small', config: {} });
      const list = S.getState().homeWidgets;
      return W.registry[type].render(list[list.length - 1], S.getState());
    };
    const ie = render('incomeExpense');
    expect(ie).toContain('-€80.00');
    expect(ie).not.toContain('€2,000.00');
    const sav = render('savings');
    expect(sav).toContain('-€80.00');
    expect(sav).not.toContain('€2,000.00');
  });

  it("the Analytics bar drill-down opens October's own dates", () => {
    const S = boot('2026-10-03T12:00:00+02:00');
    seedReport(S);
    const filters = filtersFor('month', '2026-10-01');
    const data = S.computeNetFlowData(filters);
    const canvas = { id: 'netFlowChart' };
    const container = { querySelector: (sel) => (sel === '#netFlowChart' ? canvas : null) };
    global.window.Components.NetFlowChart.attachEvents(container, data, filters);
    const chart = global.window.Chart._created[global.window.Chart._created.length - 1];
    const spy = vi.spyOn(S, 'dispatch');
    chart.config.options.onClick({ native: { target: { style: {} } } }, [{ index: 11 }]);
    const call = spy.mock.calls.find((c) => c[0] === 'UPDATE_FILTERS');
    expect(call).toBeTruthy();
    expect(call[1].page).toBe('history');
    expect(call[1].filters.period).toMatchObject({ type: 'custom', start: '2026-10-01', end: '2026-10-31' });
  });

  // Guard (passes on the F0 base too; F0's localYMD.test.js owns the full
  // contract): the formatter the buckets now use, at 00:30 on 1 Nov in Rome,
  // which is 23:30 UTC on 31 Oct.
  it('_localYMD contract at 00:30 on 1 Nov', () => {
    const S = boot('2026-11-01T00:30:00+01:00');
    expect(S._localYMD()).toBe('2026-11-01');
    expect(S._todayYMD()).toBe('2026-11-01');
    expect(S._localYMD(new Date().toISOString())).toBe('2026-11-01');
    expect(S._localYMD(Date.now())).toBe('2026-11-01');
    expect(S._localYMD('2026-10-03')).toBe('2026-10-03');
    expect(S._localYMD('not a date')).toBe('');
    expect(S._localYMD(null)).toBe('');
    expect(S._localYMD(undefined)).toBe('');
    expect(S._localYMD('')).toBe('');
  });
});
