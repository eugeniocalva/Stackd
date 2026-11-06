// 1.2.2 (HG-6): every bar chart speaks Home's monthly-net look. Solid fills
// in the theme's trend pair (NetFlowChart.barStyle / barFill), rounded, no
// outline. Home keeps its newest bar strong and the earlier ones softer;
// Analytics draws every bar at the same strength, keeps its € labels over a
// quiet grid (faint hairlines, the zero line as Home's baseline), and its
// card has no decorative blob. The Income vs Expenses and Savings widgets
// use the same fills and corners.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let charts;
const S = () => global.window.Store;
const NF = () => global.window.Components.NetFlowChart;

const boot = (theme = 'light') => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  const map = new Map([['stackd_v1_homeWidgets', '[]']]);
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k)
    },
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Router: { getParams: () => ({}), navigate: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  executeFile('views.js');
  charts = [];
  global.window.Chart = function (canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.destroy = () => {};
    this.update = () => {};
    this.scales = { x: { getValueForPixel: () => 0 } };
    charts.push(this);
  };
  global.window.Chart.getChart = () => null;
  S().init();
  S().state.activeTheme = theme;
  S().dispatch('SET_CURRENCY', 'EUR');
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2025-09-01' });
  const acc = S().getState().accounts[0].id;
  S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 900, accountId: acc, categoryId: 'cat_salary', date: '2026-08-03' });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 300, accountId: acc, categoryId: 'cat_groceries', date: '2026-09-03' });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 80, accountId: acc, categoryId: 'cat_groceries', date: '2026-10-02' });
};

const bars = () => charts.filter(c => c.config.type === 'bar');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('the shared bar look', () => {
  it('fills solid in the theme trend pair, rounded, without an outline', () => {
    boot();
    const st = NF().barStyle([5, -3, 0]);
    expect(st.backgroundColor).toEqual(['rgba(16,185,129,0.9)', 'rgba(239,68,68,0.9)', 'rgba(16,185,129,0.9)']);
    expect(st).toMatchObject({ borderWidth: 0, borderRadius: 6, borderSkipped: false, barPercentage: 0.72, categoryPercentage: 0.8 });
  });

  it('emphasizeLast keeps the newest bar strong and softens the rest (Home)', () => {
    boot();
    expect(NF().barStyle([5, -3, 2], { emphasizeLast: true }).backgroundColor)
      .toEqual(['rgba(16,185,129,0.55)', 'rgba(239,68,68,0.55)', 'rgba(16,185,129,0.9)']);
  });

  it('follows the dark theme', () => {
    boot('dark');
    expect(NF().barFill(1)).toBe('rgba(52,211,153,0.9)');
    expect(NF().barFill(-1)).toBe('rgba(248,113,113,0.9)');
  });

  it('the quiet grid draws the zero line as the baseline and hairlines elsewhere', () => {
    boot();
    const pal = NF()._themeColors();
    const grid = NF().quietGrid(pal);
    expect(grid.color({ tick: { value: 0 } })).toBe(pal.baseline);
    expect(grid.color({ tick: { value: 100 } })).toBe(pal.hairline);
    expect(grid.drawTicks).toBe(false);
  });
});

describe('Analytics net flow (HG-6)', () => {
  const mount = () => {
    S().dispatch('UPDATE_FILTERS', {
      page: 'analytics',
      filters: { period: { type: 'month', value: '2026-10-15', start: '', end: '' }, types: [], accounts: [], categories: [], tags: [], sortOrder: 'desc' }
    });
    const view = global.window.Views.AnalyticsView;
    const root = document.getElementById('router-view');
    root.innerHTML = view.render(S().getState());
    view.attachEvents(root, S().getState());
    return { root, chart: bars()[0] };
  };

  it('draws Home’s solid bars, every one at the same strength', () => {
    boot();
    const { chart } = mount();
    const ds = chart.config.data.datasets[0];
    expect(ds.borderWidth).toBe(0);
    expect(ds.borderRadius).toBe(6);
    expect(ds.borderColor).toBeUndefined();
    const fills = new Set(ds.backgroundColor.map(c => c.replace(/^rgba\((\d+,\d+,\d+),/, 'rgba(x,')));
    expect([...fills]).toEqual(['rgba(x,0.9)']);
    expect(ds.backgroundColor[ds.backgroundColor.length - 1]).toBe('rgba(239,68,68,0.9)'); // October lost 80
  });

  it('keeps its € labels over a quiet grid', () => {
    boot();
    const { chart } = mount();
    const y = chart.config.options.scales.y;
    expect(y.ticks.callback(100)).toBe('€100');
    expect(y.border).toEqual({ display: false });
    expect(y.grid.borderDash).toBeUndefined();
    expect(y.grid.color({ tick: { value: 0 } })).toBe(NF()._themeColors().baseline);
  });

  it('has no decorative blob in its card', () => {
    boot();
    const { root } = mount();
    const card = root.querySelector('#netFlowChart').closest('.card');
    expect(card.innerHTML).not.toContain('blur(');
  });
});

describe('Home and the bar widgets share the look (HG-6)', () => {
  it('Home monthly net keeps its newest bar strong', () => {
    boot();
    const V = global.window.Views.DashboardView;
    const root = document.getElementById('router-view');
    root.innerHTML = V.render(S().getState());
    V.attachEvents(root, S().getState(), false);
    const ds = bars()[0].config.data.datasets[0];
    const n = ds.backgroundColor.length;
    expect(ds.backgroundColor[n - 1]).toMatch(/,0\.9\)$/);
    expect(ds.backgroundColor[n - 2]).toMatch(/,0\.55\)$/);
    expect(ds.borderRadius).toBe(6);
    V.destroy();
  });

  it('Income vs Expenses and Savings bars use the shared fills and corners', () => {
    boot('dark');
    const W = global.window.Widgets;
    ['incomeExpense', 'savings'].forEach((type, i) => {
      const inst = { id: 'w' + i, type, size: 'large', config: {}, createdAt: 1 };
      const card = document.createElement('div');
      card.innerHTML = W.registry[type].render(inst, S().getState());
      document.body.appendChild(card);
      W.registry[type].attach(inst, card, S().getState());
    });
    const [ie, sv] = bars();
    expect(ie.config.data.datasets[0].backgroundColor).toBe('rgba(52,211,153,0.9)');
    expect(ie.config.data.datasets[1].backgroundColor).toBe('rgba(248,113,113,0.9)');
    expect(ie.config.data.datasets.every(d => d.borderRadius === 6)).toBe(true);
    expect(sv.config.data.datasets[0].borderRadius).toBe(6);
    expect(sv.config.data.datasets[0].backgroundColor.every(c => /^rgba\((52,211,153|248,113,113),0\.9\)$/.test(c))).toBe(true);
    expect(ie.config.options.scales.y.grid.color({ tick: { value: 0 } })).toBe(NF()._themeColors().baseline);
  });
});
