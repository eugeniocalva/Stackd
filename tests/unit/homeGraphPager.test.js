// 1.2.0 (UX-1 / UX-3): the Home graph — a two-pane pager (balance curve with
// range chips, monthly net bars) under the total. Boot after
// expandedGraphModal.test.js (plain window object + a recording Chart stub),
// with jsdom's real document for the rendered container.
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
    this.destroyed = false;
    this.destroy = () => { this.destroyed = true; };
    created.push(this);
  };
  Chart.getChart = () => null;
  Chart._created = created;
  return Chart;
};

let uid = 0;
let S, V, Chart, container, navigate;

const boot = ({ theme } = {}) => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(2026, 5, 15, 12));
  const localStorage = makeLocalStorage();
  localStorage.setItem('stackd_v1_homeWidgets', '[]');
  if (theme) localStorage.setItem('stackd_v1_theme', JSON.stringify(theme));
  navigate = vi.fn();
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage,
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    StackdHydrateIcons: vi.fn(),
    Router: { navigate, getParams: () => ({}), handleRouteChange() {} }
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
  S = global.window.Store;
  S.init();
  if (theme) S.state.activeTheme = theme;
  S.dispatch('SET_CURRENCY', 'EUR');
  V = global.window.Views.DashboardView;
};

const accId = (name) => S.getState().accounts.find(a => a.name === name).id;

// up: the balance grows over the year; down: it shrinks
const seed = (direction = 'up') => {
  S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2025-01-01' });
  const main = accId('Main');
  for (let m = 1; m <= 12; m++) {
    const d = new Date(2025, 5 + m, 5, 12);
    const date = S._localYMD(d);
    if (date > '2026-06-15') break;
    S.dispatch('ADD_TRANSACTION', direction === 'up'
      ? { type: 'income', amount: 300, accountId: main, categoryId: 'cat_salary', date }
      : { type: 'expense', amount: 300, accountId: main, categoryId: 'cat_groceries', date });
  }
  return main;
};

const mount = () => {
  const state = S.getState();
  container.innerHTML = V.render(state);
  V.attachEvents(container, state, false);
  return state;
};

const lineCharts = () => Chart._created.filter(c => c.config.type === 'line');
const barCharts = () => Chart._created.filter(c => c.config.type === 'bar');
const live = () => Chart._created.filter(c => !c.destroyed);

beforeEach(() => {
  document.body.innerHTML = '<main id="router-view"></main>';
  container = document.getElementById('router-view');
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Home pager markup (UX-1 / UX-3)', () => {
  beforeEach(() => { boot(); seed(); });

  it('renders the pager, two panes, the chips and the dots', () => {
    const html = V.render(S.getState());
    expect(html).toContain('id="home-pager"');
    expect(html).toContain('data-horizontal-scroll');
    container.innerHTML = html;
    const panes = container.querySelectorAll('#home-pager > .home-pane');
    expect(panes).toHaveLength(2);
    expect(panes[0].dataset.pane).toBe('0');
    expect(panes[1].id).toBe('netflow-pane');
    expect(panes[1].getAttribute('role')).toBe('button');
    expect(panes[1].getAttribute('aria-label')).toBe('Monthly net balance');
    expect(panes[0].querySelector('#chart-card-container #balanceChart')).not.toBeNull();
    expect(panes[1].querySelector('.home-netflow-wrap #netflowChart')).not.toBeNull();
    expect(panes[1].textContent).toContain('Monthly net');
    expect(panes[1].textContent).toContain('End of month');

    const chips = [...container.querySelectorAll('.home-range-chips .chart-toggle-btn[data-range]')];
    expect(chips.map(c => c.dataset.range)).toEqual(['1w', '1m', '6m', 'ytd', '1y', 'max']);
    expect(chips.map(c => c.textContent.trim())).toEqual(['1W', '1M', '6M', 'YTD', '1Y', 'Max']);
    expect(chips.filter(c => c.classList.contains('active')).map(c => c.dataset.range)).toEqual(['1y']);
    expect(chips.find(c => c.dataset.range === '1y').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.home-range-chips').getAttribute('aria-label')).toBe('Graph period');

    const dots = [...container.querySelectorAll('.home-pager-dots .home-pager-dot')];
    expect(dots).toHaveLength(2);
    expect(dots[0].classList.contains('is-active')).toBe(true);
    expect(dots[0].getAttribute('aria-pressed')).toBe('true');
    expect(dots[1].getAttribute('aria-pressed')).toBe('false');
    expect(dots[0].getAttribute('aria-label')).toBe('Balance curve');
    expect(container.querySelector('.home-pager-dots').getAttribute('aria-label')).toBe('Graph view');
  });

  it('keeps the expand contract on #chart-card-container, inside pane 0', () => {
    const html = V.render(S.getState());
    expect(html).toContain('id="chart-card-container"');
    container.innerHTML = html;
    expect(container.querySelector('.home-pane[data-pane="0"] #chart-card-container')).not.toBeNull();
    expect(html).toContain('cursor: pointer');
    expect(html).toContain('title="Click to view expanded graph"');
  });

  it('the filtered-view strip shows only for an account/category subset, naming the range', () => {
    S.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'weekly', accounts: [], categories: [] });
    expect(V.render(S.getState())).not.toContain('id="btn-reset-graph-filters"');
    S.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'monthly', accounts: [], categories: ['cat_salary'] });
    const html = V.render(S.getState());
    expect(html).toContain('id="btn-reset-graph-filters"');
    expect(html).toContain('Filtered View (1Y)');
  });

  it('render() follows the session range chip', () => {
    V._range = '6m';
    container.innerHTML = V.render(S.getState());
    expect(container.querySelector('.chart-toggle-btn.active').dataset.range).toBe('6m');
    expect(V._passGraph.series.points).toHaveLength(26);
  });
});

describe('Home charts (UX-1 / UX-3)', () => {
  it('creates the balance line and the net-flow bars, and destroys both before re-creating and on destroy()', () => {
    boot(); seed();
    mount();
    expect(lineCharts()).toHaveLength(1);
    expect(barCharts()).toHaveLength(1);
    expect(V._balanceChart).toBe(lineCharts()[0]);
    expect(V._netflowChart).toBe(barCharts()[0]);
    expect(lineCharts()[0].canvas.id).toBe('balanceChart');
    expect(barCharts()[0].canvas.id).toBe('netflowChart');

    mount(); // a same-view re-render (every dispatch)
    expect(Chart._created).toHaveLength(4);
    expect(live()).toHaveLength(2);
    expect(Chart._created[0].destroyed).toBe(true);
    expect(Chart._created[1].destroyed).toBe(true);

    V.destroy();
    expect(live()).toHaveLength(0);
    expect(V._balanceChart).toBeNull();
    expect(V._netflowChart).toBeNull();
  });

  it('the curve reuses the series render() computed (no second aggregation)', () => {
    boot(); seed();
    const state = S.getState();
    container.innerHTML = V.render(state);
    const spy = vi.spyOn(S, 'computeBalanceSeries');
    const nf = vi.spyOn(S, 'computeNetFlowData');
    V.attachEvents(container, state, false);
    expect(spy).not.toHaveBeenCalled();
    expect(nf).not.toHaveBeenCalled();
    expect(lineCharts()[0].config.data.datasets[0].data).toBe(V._passGraph.series.points);
  });

  it('colours the curve by trend: green when the range ends at or above its start, red below', () => {
    boot(); seed('up');
    mount();
    let ds = lineCharts()[0].config.data.datasets[0];
    expect(ds.borderColor).toBe('#10b981');
    expect(ds.pointBackgroundColor).toBe('#10b981');
    expect(ds.pointBorderColor).toBe('#ffffff');
    expect(ds.cubicInterpolationMode).toBe('monotone');
    expect(ds.borderWidth).toBe(2.5);

    boot(); seed('down');
    mount();
    ds = lineCharts()[0].config.data.datasets[0];
    expect(ds.borderColor).toBe('#ef4444');

    boot({ theme: 'dark' }); seed('up');
    mount();
    ds = lineCharts()[0].config.data.datasets[0];
    expect(ds.borderColor).toBe('#34d399');
    expect(ds.pointBorderColor).toBe('#161e2e');
  });

  it('draws a dotted baseline at the range start, hidden from the tooltip', () => {
    boot(); seed();
    mount();
    const cfg = lineCharts()[0].config;
    expect(cfg.data.datasets).toHaveLength(2); // no per-account lines on Home
    const [main, base] = cfg.data.datasets;
    expect(base._baseline).toBe(true);
    expect(base.borderDash).toEqual([2, 4]);
    expect(base.pointRadius).toBe(0);
    expect(base.fill).toBe(false);
    expect(base.borderColor).toBe('#94a3b8');
    const series = V._passGraph.series;
    expect(base.data.every(p => p.y === series.baseline)).toBe(true);
    expect(base.data).toHaveLength(main.data.length);
    expect(base.data[base.data.length - 1].x).toBe(main.data.length - 1);
    const filter = cfg.options.plugins.tooltip.filter;
    expect(filter({ dataset: base })).toBe(false);
    expect(filter({ dataset: main })).toBe(true);
    // tooltip label in the total's currency
    expect(cfg.options.plugins.tooltip.callbacks.label({ dataset: main, parsed: { y: 1234.5 } })).toContain('€1,234.50');
  });

  it('fills with a gradient once laid out, flat before; an end dot on today only', () => {
    boot(); seed();
    mount();
    const ds = lineCharts()[0].config.data.datasets[0];
    expect(ds.backgroundColor({ chart: {} })).toBe('rgba(16,185,129,0.12)');
    const stops = [];
    const grad = { addColorStop: (o, c) => stops.push([o, c]) };
    const ctx = { createLinearGradient: vi.fn(() => grad) };
    const chart = { chartArea: { top: 8, bottom: 150 }, ctx };
    expect(ds.backgroundColor({ chart })).toBe(grad);
    expect(stops).toEqual([[0, 'rgba(16,185,129,0.28)'], [1, 'rgba(16,185,129,0)']]);
    expect(ds.backgroundColor({ chart })).toBe(grad); // cached by area
    expect(ctx.createLinearGradient).toHaveBeenCalledTimes(1);
    const last = ds.data.length - 1;
    expect(ds.pointRadius({ dataIndex: last })).toBe(4);
    expect(ds.pointRadius({ dataIndex: 0 })).toBe(0);
  });

  it('keeps the x-axis literals and maps ticks to the series tick labels', () => {
    boot(); seed();
    mount();
    const x = lineCharts()[0].config.options.scales.x;
    expect(x.ticks.autoSkip).toBe(true);
    expect(x.ticks.autoSkipPadding).toBe(6);
    expect(x.ticks.maxRotation).toBe(45);
    expect(x.ticks.minRotation).toBe(0);
    expect(x.ticks.font({ chart: { width: 320 } }).size).toBe(9);
    expect(x.min).toBe(0);
    expect(x.max).toBe(11);
    const labels = V._passGraph.series.tickLabels;
    expect(x.ticks.callback(3)).toBe(labels[3]);
    expect(x.ticks.callback(3.5)).toBe('');
    const axis = {};
    x.afterBuildTicks(axis);
    expect(axis.ticks.map(t => t.value)).toEqual(labels.map((l, i) => (l ? i : -1)).filter(i => i >= 0));
    expect(lineCharts()[0].config.options.animation).toEqual({ duration: 0 });
    expect(lineCharts()[0].config.options.scales.y.display).toBe(false);
  });

  it('the net-flow pane: 12 EOM bars on the SAVED filters, current month strongest', () => {
    boot(); seed('up');
    S.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'weekly', accounts: [], categories: [] });
    const spy = vi.spyOn(S, 'computeNetFlowData');
    mount();
    expect(spy).toHaveBeenCalledTimes(1);
    const [filters, clampEnd] = spy.mock.calls[0];
    expect(filters.period).toEqual({ type: 'month', value: '2026-06-15', start: '', end: '' });
    expect(filters.accounts).toEqual([]); // [] = every base account (BUG-36)
    expect(filters.categories).toEqual([]);
    expect(clampEnd).toBeUndefined(); // End of month, not month-to-date

    const cfg = barCharts()[0].config;
    const ds = cfg.data.datasets[0];
    expect(cfg.data.labels).toHaveLength(12);
    expect(ds.data).toHaveLength(12);
    expect(ds.data[11]).toBe(300);
    expect(ds.backgroundColor[11]).toBe('rgba(16,185,129,0.9)');
    expect(ds.backgroundColor[10]).toBe('rgba(16,185,129,0.55)');
    expect(ds.borderRadius).toBe(6);
    expect(ds.borderSkipped).toBe(false);
    expect(cfg.options.plugins.legend.display).toBe(false);
    expect(cfg.options.scales.y.ticks.display).toBe(false);
    expect(cfg.options.scales.y.grid.color({ tick: { value: 0 } })).toBe('#94a3b8');
    expect(cfg.options.scales.y.grid.color({ tick: { value: 100 } })).toBe('transparent');
    expect(cfg.options.plugins.tooltip.callbacks.label({ dataset: ds, parsed: { y: -42 } })).toContain('€42.00');
  });

  it('a negative month is a red bar; a category subset reaches pane 2', () => {
    boot(); seed('down');
    S.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'monthly', accounts: [accId('Main')], categories: ['cat_groceries'] });
    const spy = vi.spyOn(S, 'computeNetFlowData');
    mount();
    expect(spy.mock.calls[0][0].accounts).toEqual([accId('Main')]);
    expect(spy.mock.calls[0][0].categories).toEqual(['cat_groceries']);
    const ds = barCharts()[0].config.data.datasets[0];
    expect(ds.data[11]).toBe(-300);
    expect(ds.backgroundColor[11]).toBe('rgba(239,68,68,0.9)');
  });
});

describe('Home pager behaviour (UX-1 / UX-3)', () => {
  beforeEach(() => { boot(); seed(); });

  it('a chip tap rebuilds only the balance chart, without a dispatch', () => {
    mount();
    const dispatch = vi.spyOn(S, 'dispatch');
    const before = Chart._created.length;
    const oldLine = V._balanceChart;
    const oldBar = V._netflowChart;
    container.querySelector('[data-range="1m"]').click();
    expect(dispatch).not.toHaveBeenCalled();
    expect(V._range).toBe('1m');
    expect(Chart._created.length).toBe(before + 1);
    expect(oldLine.destroyed).toBe(true);
    expect(oldBar.destroyed).toBe(false);
    expect(V._netflowChart).toBe(oldBar);
    expect(V._balanceChart.config.data.datasets[0].data).toHaveLength(30);
    const chips = [...container.querySelectorAll('[data-range]')];
    expect(chips.filter(c => c.classList.contains('active')).map(c => c.dataset.range)).toEqual(['1m']);
    expect(container.querySelector('[data-range="1m"]').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-range="1y"]').getAttribute('aria-pressed')).toBe('false');
    // a tap does not open the expanded sheet
    expect(document.getElementById('expanded-graph-modal')).toBeNull();
    // the next re-render keeps the chip
    mount();
    expect(container.querySelector('.chart-toggle-btn.active').dataset.range).toBe('1m');
    expect(V._balanceChart.config.data.datasets[0].data).toHaveLength(30);
    // the range survives leaving Home (session-only, not persisted)
    V.destroy();
    expect(V._range).toBe('1m');
  });

  it('restores the visible pane synchronously on re-render', () => {
    V._pane = 1;
    const state = S.getState();
    container.innerHTML = V.render(state);
    const pager = container.querySelector('#home-pager');
    Object.defineProperty(pager, 'clientWidth', { configurable: true, get: () => 320 });
    V.attachEvents(container, state, false);
    expect(pager.scrollLeft).toBe(320);
    expect(container.querySelector('.home-pager-dot[data-pane="1"]').classList.contains('is-active')).toBe(true);
    expect(container.querySelector('.home-pager-dot[data-pane="0"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('scrolling the pager toggles the dots after an 80 ms debounce, without a dispatch', () => {
    const state = S.getState();
    container.innerHTML = V.render(state);
    const pager = container.querySelector('#home-pager');
    Object.defineProperty(pager, 'clientWidth', { configurable: true, get: () => 320 });
    V.attachEvents(container, state, false);
    const dispatch = vi.spyOn(S, 'dispatch');
    pager.scrollLeft = 300;
    pager.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(79);
    expect(V._pane).toBe(0);
    vi.advanceTimersByTime(1);
    expect(V._pane).toBe(1);
    const dots = container.querySelectorAll('.home-pager-dot');
    expect(dots[1].classList.contains('is-active')).toBe(true);
    expect(dots[0].classList.contains('is-active')).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    // back to the curve
    pager.scrollLeft = 10;
    pager.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(80);
    expect(V._pane).toBe(0);
    // leaving Home resets the pane
    V._pane = 1;
    V.destroy();
    expect(V._pane).toBe(0);
  });

  it('a dot tap scrolls the pager to its pane', () => {
    const state = S.getState();
    container.innerHTML = V.render(state);
    const pager = container.querySelector('#home-pager');
    Object.defineProperty(pager, 'clientWidth', { configurable: true, get: () => 400 });
    pager.scrollTo = vi.fn();
    V.attachEvents(container, state, false);
    container.querySelector('.home-pager-dot[data-pane="1"]').click();
    expect(pager.scrollTo).toHaveBeenCalledWith({ left: 400, behavior: 'smooth' });
    expect(V._pane).toBe(1);
    expect(container.querySelector('.home-pager-dot[data-pane="1"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('a dot tap jumps without animation under reduced motion', () => {
    global.window.matchMedia = (q) => ({ matches: q.includes('reduce'), addEventListener() {} });
    const state = S.getState();
    container.innerHTML = V.render(state);
    const pager = container.querySelector('#home-pager');
    Object.defineProperty(pager, 'clientWidth', { configurable: true, get: () => 400 });
    pager.scrollTo = vi.fn();
    V.attachEvents(container, state, false);
    container.querySelector('.home-pager-dot[data-pane="1"]').click();
    expect(pager.scrollTo).toHaveBeenCalledWith({ left: 400, behavior: 'auto' });
  });

  it('pane 2 opens Analytics; pane 1 still opens the expanded sheet', () => {
    const show = vi.fn();
    global.window.Components.ExpandedGraphModal.show = show;
    mount();
    container.querySelector('#netflow-pane').click();
    expect(navigate).toHaveBeenCalledWith('#analytics');
    expect(show).not.toHaveBeenCalled();
    container.querySelector('#chart-card-container').click();
    expect(show).toHaveBeenCalledTimes(1);
  });
});
