// 1.2.2 (HG-10 P2, docs/period-picker-plan.md §0): Analytics on a custom range.
// - computeNetFlowData draws bars for a custom range (it showed "Chart not
//   available"): daily up to 31 days, Monday–Sunday weeks up to 93, months up
//   to 36, years beyond; the end bars clipped to the range; the aggregate
//   rules hold (no unpaid rows).
// - A bar tap opens a whole month/year as itself, any other bar as its dates.
// - The % badge names the window it compares with ("vs Oct 1 – Oct 7",
//   "vs September 2026").
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

const makeChartStub = () => {
  const created = [];
  const Chart = function (canvas, config) { this.canvas = canvas; this.config = config; this.destroy = () => {}; created.push(this); };
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
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'views.js'].forEach(executeFile);
  global.window.Chart = makeChartStub();
  global.window.Router = { navigate: vi.fn(), getParams: () => ({}) };
  global.window.StackdHydrateIcons = () => {};
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', 'EUR');
  global.window.Store.dispatch('ADD_ACCOUNT', { id: 'acc', name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
  return global.window.Store;
};

afterEach(() => { vi.useRealTimers(); });

const custom = (start, end) => ({ period: { type: 'custom', value: '', start, end }, types: [], accounts: [], categories: [], tags: [], sortOrder: 'desc' });
const spend = (S, amount, date, extra = {}) => S.dispatch('ADD_TRANSACTION', { type: 'expense', amount, accountId: 'acc', categoryId: 'cat_groceries', date, ...extra });

describe('bars for a custom range', () => {
  it('a bar a day up to 31 days', () => {
    const S = boot('2026-11-07T12:00:00');
    const b = S.computeNetFlowData(custom('2026-10-09', '2026-10-23'));
    expect(b).toHaveLength(15);
    expect(b[0]).toMatchObject({ start: '2026-10-09', end: '2026-10-09', kind: 'day' });
    expect(b[14]).toMatchObject({ start: '2026-10-23', end: '2026-10-23' });
    const one = S.computeNetFlowData(custom('2026-11-07', '2026-11-07'));
    expect(one).toHaveLength(1);
  });

  it('Monday–Sunday weeks up to 93 days, the end weeks clipped', () => {
    const S = boot('2026-11-07T12:00:00');
    const b = S.computeNetFlowData(custom('2026-09-10', '2026-10-31')); // Thu → Sat, 52 days
    expect(b[0]).toMatchObject({ start: '2026-09-10', end: '2026-09-13', kind: 'range' });
    expect(b[1]).toMatchObject({ start: '2026-09-14', end: '2026-09-20' });
    expect(b[b.length - 1]).toMatchObject({ start: '2026-10-26', end: '2026-10-31' });
    b.slice(1, -1).forEach(w => expect(new Date(w.start + 'T12:00:00').getDay()).toBe(1));
  });

  it('calendar months up to 36 months; a whole month is a month, a clipped one a range', () => {
    const S = boot('2026-11-07T12:00:00');
    const b = S.computeNetFlowData(custom('2026-01-15', '2026-06-30'));
    expect(b).toHaveLength(6);
    expect(b[0]).toMatchObject({ start: '2026-01-15', end: '2026-01-31', kind: 'range' });
    expect(b[1]).toMatchObject({ start: '2026-02-01', end: '2026-02-28', kind: 'month' });
    expect(b[5]).toMatchObject({ start: '2026-06-01', end: '2026-06-30', kind: 'month' });
  });

  it('years beyond 36 months', () => {
    const S = boot('2026-11-07T12:00:00');
    const b = S.computeNetFlowData(custom('2021-03-01', '2026-11-07'));
    expect(b.map(x => x.label)).toEqual(['2021', '2022', '2023', '2024', '2025', '2026']);
    expect(b[1]).toMatchObject({ start: '2022-01-01', end: '2022-12-31', kind: 'year' });
    expect(b[0].kind).toBe('range');
  });

  it('follows the aggregate rules: unpaid rows and the clamp to today stay out', () => {
    const S = boot('2026-11-07T12:00:00');
    spend(S, 10, '2026-11-02');
    spend(S, 99, '2026-11-03', { isPaid: false });
    spend(S, 5, '2026-11-10'); // after today
    const b = S.computeNetFlowData(custom('2026-11-01', '2026-11-12'), '2026-11-07');
    expect(b.find(x => x.start === '2026-11-02').expense).toBe(10);
    expect(b.find(x => x.start === '2026-11-03').expense).toBe(0);
    expect(b.find(x => x.start === '2026-11-10').expense).toBe(0);
  });

  it('an empty or reversed range has no bars', () => {
    const S = boot('2026-11-07T12:00:00');
    expect(S.computeNetFlowData(custom('', ''))).toBeNull();
    expect(S.computeNetFlowData(custom('2026-11-07', '2026-11-01'))).toBeNull();
  });
});

describe('a bar tap opens what the bar shows', () => {
  const tap = (S, filters, index) => {
    const data = S.computeNetFlowData(filters);
    const canvas = { id: 'netFlowChart' };
    const container = { querySelector: (sel) => (sel === '#netFlowChart' ? canvas : null) };
    global.window.Components.NetFlowChart.attachEvents(container, data, filters);
    const chart = global.window.Chart._created[global.window.Chart._created.length - 1];
    const spy = vi.spyOn(S, 'dispatch');
    chart.config.options.onClick({ native: { target: { style: {} } } }, [{ index }]);
    const calls = spy.mock.calls.filter(c => c[0] === 'UPDATE_FILTERS');
    spy.mockClear(); // the same spy across taps: read this tap's call
    return calls[calls.length - 1][1].filters;
  };

  it('a whole-month bar of a range opens that month; a clipped or daily bar its own dates', () => {
    const S = boot('2026-11-07T12:00:00');
    expect(tap(S, custom('2026-01-15', '2026-06-30'), 1).period).toMatchObject({ type: 'month', value: '2026-02-01' });
    expect(tap(S, custom('2026-01-15', '2026-06-30'), 0).period).toMatchObject({ type: 'custom', start: '2026-01-15', end: '2026-01-31' });
    const f = tap(S, custom('2026-10-09', '2026-10-23'), 2);
    expect(f.period).toMatchObject({ type: 'custom', start: '2026-10-11', end: '2026-10-11' });
    expect(f.tags).toEqual([]);
    expect(f).not.toHaveProperty('sortOrder');
  });
});

describe('the badge names the compared window', () => {
  it('Store.comparisonLabel: months and years by name, other windows by dates', () => {
    const S = boot('2026-11-07T12:00:00');
    expect(S.comparisonLabel({ type: 'month', value: '2026-09-01' })).toBe('September 2026');
    expect(S.comparisonLabel({ type: 'year', value: '2025-01-01' })).toBe('2025');
    expect(S.comparisonLabel({ type: 'custom', start: '2026-10-01', end: '2026-10-07' })).toBe('Oct 1 – Oct 7');
    expect(S.comparisonLabel({ type: 'custom', start: '2026-10-01', end: '2026-10-01' })).toBe('Oct 1');
    expect(S.comparisonLabel({ type: 'custom', start: '2025-10-01', end: '2025-10-01' })).toBe('Oct 1, 2025');
  });

  const badge = (S) => {
    const html = global.window.Views.AnalyticsView.render(S.getState());
    const m = html.match(/margin-left: 2px;">([^<]*)<\/span>/);
    return m && m[1];
  };

  it('this month so far: the same days of last month', () => {
    const S = boot('2026-11-07T12:00:00');
    expect(badge(S)).toBe('vs Oct 1 – Oct 7');
  });

  it('a past month: the month before, by name', () => {
    const S = boot('2026-11-07T12:00:00');
    S.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { period: { type: 'month', value: '2026-10-01', start: '', end: '' } } });
    expect(badge(S)).toBe('vs September 2026');
  });

  it('a custom range: the window before it, and the chart draws bars', () => {
    const S = boot('2026-11-07T12:00:00');
    S.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { period: { type: 'custom', value: '', start: '2026-10-09', end: '2026-10-23' } } });
    expect(badge(S)).toBe('vs Sep 24 – Oct 8');
    const html = global.window.Views.AnalyticsView.render(S.getState());
    expect(html).not.toContain('Chart not available');
  });
});
