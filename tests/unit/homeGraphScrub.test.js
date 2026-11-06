// 1.2.2 (HG-1): drag-to-read on the Home graphs. A sideways drag on the plot
// area reads values (the curve into the header total, the bars into the pane
// head), a vertical drag is left to the page, a held press reads in place, a
// plain tap keeps its old meaning, and a swipe outside the plot still pages
// the pager (the zone covers the plot area only). Boot follows
// homeGraphPager.test.js; the Chart stub adds a linear x scale (px / 10).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    this.data = config.data;
    this.destroyed = false;
    this.destroy = () => { this.destroyed = true; };
    this.update = vi.fn();
    // 10 px per point, canvas at the viewport origin (jsdom rects are 0)
    this.scales = { x: { getValueForPixel: (px) => px / 10 } };
    created.push(this);
  };
  Chart.getChart = () => null;
  Chart._created = created;
  return Chart;
};

let uid = 0;
let S, V, Chart, container, navigate, haptics;

const boot = ({ native = false } = {}) => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
  const localStorage = makeLocalStorage();
  localStorage.setItem('stackd_v1_homeWidgets', '[]');
  navigate = vi.fn();
  haptics = { selectionStart: vi.fn(), selectionChanged: vi.fn(), selectionEnd: vi.fn(() => Promise.resolve()) };
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage,
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    StackdHydrateIcons: vi.fn(),
    Router: { navigate, getParams: () => ({}), handleRouteChange() {} },
    Capacitor: { isNativePlatform: () => native, Plugins: { Haptics: haptics } }
  };
  global.localStorage = localStorage;
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  Chart = makeChartStub();
  global.window.Chart = Chart;
  global.window.Components.ExpandedGraphModal.show = vi.fn();
  S = global.window.Store;
  S.init();
  S.dispatch('SET_CURRENCY', 'EUR');
  V = global.window.Views.DashboardView;
};

const seed = () => {
  S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2025-01-01' });
  const main = S.getState().accounts.find(a => a.name === 'Main').id;
  for (let m = 1; m <= 12; m++) {
    const date = S._localYMD(new Date(2025, 5 + m, 5, 12));
    if (date > '2026-06-15') break;
    S.dispatch('ADD_TRANSACTION', { type: 'income', amount: 300, accountId: main, categoryId: 'cat_salary', date });
  }
};

const mount = () => {
  const state = S.getState();
  container.innerHTML = V.render(state);
  V.attachEvents(container, state, false);
};

const lineChart = () => Chart._created.filter(c => c.config.type === 'line' && !c.destroyed)[0];
const barChart = () => Chart._created.filter(c => c.config.type === 'bar' && !c.destroyed)[0];
const zone = (id) => container.querySelector('#' + id);
const $ = (sel) => container.querySelector(sel);

const touch = (el, type, x, y = 50, { count = 1 } = {}) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const list = count ? Array.from({ length: count }, () => ({ clientX: x, clientY: y })) : [];
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : list });
  el.dispatchEvent(e);
  return e;
};
const pointer = (el, type, x, pointerType = 'mouse') => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  Object.defineProperty(e, 'clientX', { value: x });
  el.dispatchEvent(e);
};
const click = (el) => el.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));

const header = () => ({
  total: $('#dash-total').textContent,
  abs: $('.dash-var-today .dash-var-abs').textContent,
  pct: $('.dash-var-today .dash-var-pct').textContent,
  cap: $('.dash-var-today .dash-var-cap').textContent,
  scrubbing: $('#dash-head').classList.contains('is-scrubbing')
});

beforeEach(() => {
  document.body.innerHTML = '<main id="router-view"></main>';
  container = document.getElementById('router-view');
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('drag-to-read markup and chart config (HG-1)', () => {
  beforeEach(() => { boot(); seed(); mount(); });

  it('lays a scrub zone over each plot, inside the tap targets', () => {
    expect(zone('balance-scrub-zone').closest('#chart-card-container')).not.toBeNull();
    expect(zone('netflow-scrub-zone').closest('#netflow-pane')).not.toBeNull();
    expect(zone('balance-scrub-zone').getAttribute('aria-hidden')).toBe('true');
  });

  it('turns Chart.js pointer handling and tooltips off on both Home charts', () => {
    for (const c of [lineChart(), barChart()]) {
      expect(c.config.options.events).toEqual([]);
      expect(c.config.options.plugins.tooltip.enabled).toBe(false);
    }
  });

  it('places the zone on the plot area after every layout', () => {
    const plugin = lineChart().config.plugins.find(p => p.id === 'stackdScrub');
    plugin.afterLayout({ chartArea: { left: 2.4, right: 300.2, top: 8, bottom: 131.6 } });
    const z = zone('balance-scrub-zone');
    expect(z.style.left).toBe('2px');
    expect(z.style.width).toBe('298px');
    expect(z.style.top).toBe('0px');
    expect(z.style.height).toBe('132px'); // the axis labels below stay outside
    const bars = barChart().config.plugins.find(p => p.id === 'stackdScrub');
    bars.afterLayout({ chartArea: { left: 0, right: 200, top: 8, bottom: 120 } });
    expect(zone('netflow-scrub-zone').style.width).toBe('200px');
  });

  it('fades the curve after the read point and hides the end dot while reading', () => {
    const ds = lineChart().config.data.datasets[0];
    const last = ds.data.length - 1;
    const chart = { $scrubIdx: null };
    expect(ds.pointRadius({ dataIndex: last, chart })).toBe(4);
    expect(ds.segment.borderColor({ chart, p0DataIndex: 5 })).toBeUndefined();
    chart.$scrubIdx = 4;
    expect(ds.pointRadius({ dataIndex: last, chart })).toBe(0);
    expect(ds.segment.borderColor({ chart, p0DataIndex: 3 })).toBeUndefined();
    expect(ds.segment.borderColor({ chart, p0DataIndex: 4 })).toBe('rgba(16,185,129,0.3)');
  });
});

describe('the balance curve (HG-1)', () => {
  beforeEach(() => { boot(); seed(); mount(); });

  it('a sideways drag reads each point into the header, release restores today', () => {
    const before = header();
    const z = zone('balance-scrub-zone');
    const { points, baseline } = V._balanceMeta;

    touch(z, 'touchstart', 2);
    const mv = touch(z, 'touchmove', 30);
    expect(mv.defaultPrevented).toBe(true); // the pager never gets the drag
    expect(lineChart().$scrubIdx).toBe(3);
    expect(lineChart().update).toHaveBeenCalledWith('none');
    let h = header();
    expect(h.scrubbing).toBe(true);
    expect(h.total).toBe(S.formatCurrency(points[3].balance, 'EUR'));
    expect(h.abs).toBe('+' + S.formatCurrency(points[3].balance - baseline, 'EUR'));
    expect(h.pct).toBe(`+17.0% since ${points[0].fullLabel}`);
    expect(h.cap).toBe(points[3].fullLabel);

    // a move inside the same point does not redraw again
    const calls = lineChart().update.mock.calls.length;
    touch(z, 'touchmove', 32);
    expect(lineChart().update.mock.calls.length).toBe(calls);

    // the last point is today
    touch(z, 'touchmove', 500);
    expect(lineChart().$scrubIdx).toBe(points.length - 1);
    expect(header().cap).toBe('as of today');

    touch(z, 'touchend', 500);
    expect(lineChart().$scrubIdx).toBeNull();
    expect(header()).toEqual(before);
  });

  it('a vertical drag is left to the page: nothing is read or prevented', () => {
    const before = header();
    const z = zone('balance-scrub-zone');
    touch(z, 'touchstart', 30, 50);
    const mv = touch(z, 'touchmove', 34, 80);
    expect(mv.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(1000); // the hold timer was cancelled
    const mv2 = touch(z, 'touchmove', 60, 120);
    expect(mv2.defaultPrevented).toBe(false);
    expect(header()).toEqual(before);
    touch(z, 'touchend', 60);
  });

  it('a press held still reads the point, and its tap does not open the sheet', () => {
    const z = zone('balance-scrub-zone');
    touch(z, 'touchstart', 50);
    vi.advanceTimersByTime(V.SCRUB_HOLD_MS - 1);
    expect(header().scrubbing).toBe(false);
    vi.advanceTimersByTime(1);
    expect(header().scrubbing).toBe(true);
    expect(lineChart().$scrubIdx).toBe(5);
    touch(z, 'touchend', 50);
    click(z);
    expect(global.window.Components.ExpandedGraphModal.show).not.toHaveBeenCalled();
  });

  it('a plain tap still opens the expanded sheet', () => {
    const z = zone('balance-scrub-zone');
    touch(z, 'touchstart', 50);
    touch(z, 'touchmove', 52);
    touch(z, 'touchend', 52);
    click(z);
    expect(global.window.Components.ExpandedGraphModal.show).toHaveBeenCalledTimes(1);
    expect(header().scrubbing).toBe(false);
  });

  it('a second finger ends the read', () => {
    const z = zone('balance-scrub-zone');
    touch(z, 'touchstart', 2);
    touch(z, 'touchmove', 30);
    expect(header().scrubbing).toBe(true);
    touch(z, 'touchstart', 30, 50, { count: 2 });
    expect(header().scrubbing).toBe(false);
  });

  it('a mouse reads on hover and restores on leave', () => {
    const before = header();
    const z = zone('balance-scrub-zone');
    pointer(z, 'pointermove', 20, 'touch'); // not a mouse: ignored
    expect(header().scrubbing).toBe(false);
    pointer(z, 'pointermove', 20);
    expect(lineChart().$scrubIdx).toBe(2);
    pointer(z, 'pointermove', 40);
    expect(lineChart().$scrubIdx).toBe(4);
    pointer(z, 'pointerleave', 40);
    expect(header()).toEqual(before);
  });

  it('a range chip keeps the zone working on the new chart', () => {
    container.querySelector('.home-range-chips [data-range="1m"]').click();
    const z = zone('balance-scrub-zone');
    touch(z, 'touchstart', 2);
    touch(z, 'touchmove', 100);
    expect(lineChart().$scrubIdx).toBe(10);
    expect(V._balanceMeta.points).toHaveLength(30);
    touch(z, 'touchend', 100);
  });
});

describe('the monthly net bars (HG-1)', () => {
  beforeEach(() => { boot(); seed(); mount(); });

  it('a drag reads the month into the pane head and highlights its bar', () => {
    const cap = $('#netflow-pane .home-pane-head .widget-card-caption');
    const before = cap.textContent;
    const z = zone('netflow-scrub-zone');
    const colors = barChart().config.data.datasets[0].backgroundColor.slice();
    touch(z, 'touchstart', 2);
    touch(z, 'touchmove', 110);
    const m = V._netflowMeta;
    expect(cap.textContent).toBe(`${m.labels[11]} · +€300.00`);
    const bg = barChart().data.datasets[0].backgroundColor;
    expect(bg[11]).toBe('rgba(16,185,129,0.95)');
    expect(bg[10]).toBe('rgba(16,185,129,0.22)');
    touch(z, 'touchend', 110);
    click(z);
    expect(navigate).not.toHaveBeenCalled(); // the drag is not a tap
    expect(cap.textContent).toBe(before);
    expect(barChart().data.datasets[0].backgroundColor).toEqual(colors);
  });

  it('a plain tap still opens Analytics', () => {
    click(zone('netflow-scrub-zone'));
    expect(navigate).toHaveBeenCalledWith('#analytics');
  });
});

describe('haptics (HG-1)', () => {
  it('ticks once per point crossed by a finger, on native only', () => {
    boot({ native: true }); seed(); mount();
    const z = zone('balance-scrub-zone');
    touch(z, 'touchstart', 2);
    touch(z, 'touchmove', 30);
    expect(haptics.selectionStart).toHaveBeenCalledTimes(1);
    expect(haptics.selectionChanged).toHaveBeenCalledTimes(1);
    touch(z, 'touchmove', 33); // same point
    touch(z, 'touchmove', 50);
    touch(z, 'touchmove', 61);
    expect(haptics.selectionChanged).toHaveBeenCalledTimes(3);
    touch(z, 'touchend', 61);
    expect(haptics.selectionEnd).toHaveBeenCalledTimes(1);
  });

  it('a mouse never ticks; the web build never calls the plugin', () => {
    boot({ native: true }); seed(); mount();
    pointer(zone('balance-scrub-zone'), 'pointermove', 30);
    expect(haptics.selectionChanged).not.toHaveBeenCalled();
    boot({ native: false }); seed(); mount();
    const z = zone('balance-scrub-zone');
    touch(z, 'touchstart', 2);
    touch(z, 'touchmove', 30);
    touch(z, 'touchend', 30);
    expect(haptics.selectionStart).not.toHaveBeenCalled();
    expect(haptics.selectionChanged).not.toHaveBeenCalled();
  });
});
