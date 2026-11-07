// 1.2.0 (UX-7) — Components.RingChart: the one ring look and the entry-only
// sweep, on every ring: the Home categories and budgets widgets, the
// Analytics donut and the Goals ring (one arc per budgeted category) + its
// row rings. docs/ux-review-1.2-plan.md B.4. 1.2.2 (HG-5): the look is flat
// solid arcs (no gradient, glow or icon badges); the legends carry each
// category's icon tinted in its arc colour instead of a colour bar or dot.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let reduce = false;
let charts;
let seq = 0;

const boot = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); // 15 Oct 2026
  reduce = false;
  document.body.innerHTML = '<div id="app"><main id="router-view"></main><div id="modal-container"></div></div>';
  const map = new Map([['stackd_v1_homeWidgets', '[]']]);
  global.window = {
    crypto: { randomUUID: () => `uuid-${++seq}` },
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k)
    },
    addEventListener: () => {},
    matchMedia: (q) => ({ matches: reduce && /reduce/.test(q), addEventListener: () => {}, addListener: () => {} }),
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
    this.destroyed = false;
    this.destroy = () => { this.destroyed = true; };
    charts.push(this);
  };
  global.window.Chart.getChart = () => null;
  S().init();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2020-01-01' });
};

afterEach(() => {
  vi.useRealTimers();
});

const S = () => global.window.Store;
const W = () => global.window.Widgets;
const RC = () => global.window.Components.RingChart;
const rv = () => document.getElementById('router-view');
const acc = () => S().getState().accounts[0].id;
const spend = (amount, cat, date = '2026-10-05') =>
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount, accountId: acc(), categoryId: cat, date });
const doughnuts = () => charts.filter(c => c.config.type === 'doughnut');
// jsdom serialises an inline colour as rgb()
const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

const baseConfig = () => ({
  type: 'doughnut',
  data: { datasets: [{ data: [3, 1], backgroundColor: ['#10b981', '#e2e8f0'], borderWidth: 3, borderRadius: 4 }] },
  options: { responsive: true, cutout: '74%', animation: { duration: 600 }, plugins: { legend: { display: false } } }
});

describe('RingChart.config', () => {
  beforeEach(boot);

  it('makes every ring flat and solid: one cutout, small rounded gaps, no outline (1.2.2 HG-5)', () => {
    const cfg = RC().config(baseConfig(), {});
    expect(cfg.options.cutout).toBe('66%');
    const ds = cfg.data.datasets[0];
    expect(ds.borderWidth).toBe(0);
    expect(ds.hoverBorderWidth).toBe(0);
    expect(ds.spacing).toBe(2);
    expect(ds.borderRadius).toBe(6);
    expect(cfg.options.plugins.legend).toEqual({ display: false });
  });

  it('paints nothing over Chart.js: no plugin, no gradient, glow or badges', () => {
    const cfg = RC().config(baseConfig(), { badges: [{ icon: 'pin' }, null], track: [1] });
    expect(cfg.plugins).toBeUndefined();
    expect(cfg.options.plugins.stackdRing).toBeUndefined();
    expect(RC().plugin).toBeUndefined();
    expect(RC()._paint).toBeUndefined();
  });

  it('keeps datasets[0].backgroundColor the plain hex array', () => {
    const cfg = RC().config(baseConfig(), {});
    expect(cfg.data.datasets[0].backgroundColor).toEqual(['#10b981', '#e2e8f0']);
  });

  it('animation is false unless the caller says this is an entry render', () => {
    expect(RC().config(baseConfig(), {}).options.animation).toBe(false);
    expect(RC().config(baseConfig(), { animate: false }).options.animation).toBe(false);
  });

  it('an entry render gets the sweep: rotate only, 700ms, the given delay, then no delay', () => {
    const anim = RC().config(baseConfig(), { animate: true, delay: 250 }).options.animation;
    expect(anim).toMatchObject({ animateRotate: true, animateScale: false, duration: 700, easing: 'easeOutQuart', delay: 250 });
    // later hover transitions start at once
    const chart = { options: { animation: anim } };
    anim.onComplete({ chart });
    expect(anim.delay).toBe(0);
  });

  it('reduced motion turns the sweep off', () => {
    reduce = true;
    const cfg = RC().config(baseConfig(), { animate: true });
    expect(cfg.options.animation).toBe(false);
  });
});

describe('Home ring widgets play the sweep on an entry render only', () => {
  beforeEach(() => {
    boot();
    spend(50, 'cat_groceries');
    spend(30, 'cat_dining');
    S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 200, startDate: '', endDate: null, isCumulative: false });
    S().dispatch('ADD_HOME_WIDGET', { type: 'categories', size: 'small' });
    S().dispatch('ADD_HOME_WIDGET', { type: 'budgets', size: 'small' });
  });

  const mount = (opts) => {
    const state = S().getState();
    rv().innerHTML = W().renderSection(state);
    W().attachSection(rv(), state, opts);
  };

  it('isEntry: both rings get the sweep object', () => {
    mount({ isEntry: true });
    expect(doughnuts()).toHaveLength(2);
    doughnuts().forEach(c => {
      expect(c.config.options.animation).toMatchObject({ animateRotate: true, duration: 700, delay: 250 });
      expect(c.config.options.cutout).toBe('66%');
    });
    expect(W()._entryPass).toBe(false); // only for that attach loop
  });

  it('a same-view re-render (no isEntry) never animates', () => {
    mount({ isEntry: false });
    mount();
    expect(doughnuts()).toHaveLength(4);
    expect(doughnuts().every(c => c.config.options.animation === false)).toBe(true);
    expect(doughnuts().every(c => c.config.options.cutout === '66%')).toBe(true);
  });

  it('reduced motion: no sweep even on entry (the look stays)', () => {
    reduce = true;
    mount({ isEntry: true });
    expect(doughnuts().every(c => c.config.options.animation === false)).toBe(true);
    expect(doughnuts().every(c => c.config.options.cutout === '66%')).toBe(true);
  });

  it('the budgets ring keeps its hex pair, the remainder in the track colour', () => {
    mount({ isEntry: true });
    const ring = doughnuts().find(c => !c.config.data.labels);
    expect(ring.config.data.datasets[0].data).toEqual([50, 150]);
    expect(ring.config.data.datasets[0].backgroundColor).toEqual(['#64748b', '#e2e8f0']);
  });

  it('the large categories legend shows each icon in its arc colour, no dot (1.2.2 HG-5)', () => {
    const inst = S().getState().homeWidgets[0];
    S().dispatch('UPDATE_HOME_WIDGET', { id: inst.id, size: 'large' });
    mount({ isEntry: false });
    const large = doughnuts().find(c => c.config.data.labels);
    const colors = large.config.data.datasets[0].backgroundColor;
    const icons = [...rv().querySelectorAll('.widget-legend-item .widget-legend-icon')];
    expect(icons.map(i => i.querySelector('i').getAttribute('data-lucide'))).toEqual(['shopping-cart', 'utensils']);
    expect(icons.map(i => i.style.color)).toEqual(colors.map(hexToRgb));
    expect(rv().querySelector('.widget-legend-dot')).toBeNull();
  });

  it('the add-widget preview never animates', () => {
    W().attachSection(rv(), S().getState(), { isEntry: true }); // an entry pass already ran...
    charts = [];
    const html = W().renderPreview('categories', 'small', {}, S().getState());
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    W().attachPreview(root, 'categories', 'small', {}, S().getState());
    expect(doughnuts()).toHaveLength(1);
    expect(doughnuts()[0].config.options.animation).toBe(false);
    expect(doughnuts()[0].config.options.cutout).toBe('66%');
  });
});

describe('Analytics donut', () => {
  beforeEach(() => {
    boot();
    spend(50, 'cat_groceries');
    spend(30, 'cat_dining');
  });

  const render = (isEntry) => {
    const V = global.window.Views.AnalyticsView;
    rv().innerHTML = V.render(S().getState());
    V.attachEvents(rv(), S().getState(), isEntry);
    return V;
  };

  it('sweeps on the Analytics entry render', () => {
    render(true);
    const donut = doughnuts()[0];
    expect(donut.config.options.animation).toMatchObject({ animateRotate: true, delay: 250 });
    expect(donut.config.options.cutout).toBe('66%');
    expect(donut.config.data.datasets[0].backgroundColor).toEqual(['#059669', '#ea580c']); // 1.2.2 (HG-8) palette
  });

  it('each legend row tints its icon in the arc colour, with no colour bar (1.2.2 HG-5)', () => {
    render(false);
    const rows = [...rv().querySelectorAll('.donut-legend-item')];
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.querySelector('.list-item-icon').style.color)).toEqual(['#059669', '#ea580c'].map(hexToRgb));
    expect(rv().querySelector('.donut-legend-color')).toBeNull();
  });

  it('a same-view re-render and the type toggle never replay it', () => {
    render(false);
    expect(doughnuts()[0].config.options.animation).toBe(false);
    charts = [];
    render(true);
    charts = [];
    S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 900, accountId: acc(), categoryId: 'cat_salary', date: '2026-10-03' });
    rv().querySelector('.chart-toggle-btn[data-type="income"]').click();
    expect(doughnuts()).toHaveLength(1);
    expect(doughnuts()[0].config.options.animation).toBe(false);
  });
});

describe('Goals ring and row rings', () => {
  beforeEach(() => {
    boot();
    S().dispatch('SET_VIEW', 'budget');
    global.window.Views.BudgetView.editCategoryId = null;
    global.window.Views.BudgetView.currentBudgetFilter = 'expense';
  });

  const render = (isEntry) => {
    const V = global.window.Views.BudgetView;
    rv().innerHTML = V.render(S().getState());
    V.attachEvents(rv(), S().getState(), isEntry);
    return doughnuts()[doughnuts().length - 1];
  };
  const budget = (cat, amount) =>
    S().dispatch('SAVE_BUDGET', { categoryId: cat, amount, startDate: '', endDate: null, isCumulative: false });

  it('one arc per budgeted category with spending, biggest first, in its palette colour, then the remaining track', () => {
    budget('cat_groceries', 100);
    budget('cat_dining', 100);
    budget('cat_transport', 100); // budgeted, nothing spent: no arc
    spend(50, 'cat_groceries');
    spend(30, 'cat_dining');
    const ring = render(false);
    const ds = ring.config.data.datasets[0];
    // 1.2.2 (HG-8): biggest first (Groceries, Dining Out), then the track
    expect(ds.data).toEqual([50, 30, 220]);
    expect(ds.backgroundColor).toEqual(['#059669', '#ea580c', '#e2e8f0']);
    // each row's icon wears its arc's colour (one map per pass); a row with
    // no arc has none — a colour always means 'this is your slice'
    const iconColor = (id) => rv().querySelector(`.budget-cat-row[data-id="${id}"] .list-item-icon`).style.color;
    expect(iconColor('cat_dining')).toBe(hexToRgb('#ea580c'));
    expect(iconColor('cat_groceries')).toBe(hexToRgb('#059669'));
    expect(iconColor('cat_transport')).toBe('');
  });

  it('overspent draws the slices over total spent, no track (1.2.2 HG-8)', () => {
    budget('cat_groceries', 100);
    spend(150, 'cat_groceries');
    const ring = render(false);
    const ds = ring.config.data.datasets[0];
    expect(ds.data).toEqual([150]);
    expect(ds.backgroundColor).toEqual(['#059669']);
    expect(rv().querySelector('.donut-chart-center').textContent).toContain('Overspent');
  });

  it('nothing budgeted is an empty track', () => {
    const ring = render(false);
    expect(ring.config.data.datasets[0].data).toEqual([1]);
    expect(ring.config.data.datasets[0].backgroundColor).toEqual(['#e2e8f0']);
  });

  it('the rings sweep on the Goals entry render only', () => {
    budget('cat_groceries', 100);
    spend(50, 'cat_groceries');
    const entry = render(true);
    expect(entry.config.options.animation).toMatchObject({ animateRotate: true, delay: 250 });
    expect(rv().querySelector('.budget-list').classList.contains('is-entering')).toBe(true);

    const again = render(false);
    expect(again.config.options.animation).toBe(false);
    expect(rv().querySelector('.budget-list').classList.contains('is-entering')).toBe(false);
  });

  it('each budgeted row shows its usage inside a ring (bar and label strings kept)', () => {
    budget('cat_groceries', 100);
    spend(50, 'cat_groceries');
    render(false);
    const row = rv().querySelector('.budget-cat-row[data-id="cat_groceries"]');
    const wrap = row.querySelector('.budget-row-ring-wrap');
    expect(wrap.querySelector('svg.budget-row-ring[aria-hidden="true"]')).not.toBeNull();
    expect(wrap.querySelector('.budget-used-pct').textContent).toBe('50%');
    const fill = wrap.querySelector('.budget-row-ring-fill');
    const c = Math.round(2 * Math.PI * 15.5 * 100) / 100;
    expect(fill.style.strokeDasharray).toBe(String(c));
    expect(parseFloat(fill.style.strokeDashoffset)).toBeCloseTo(c / 2, 1);
    expect(row.innerHTML).toContain('width: 50%');
    // a row without a limit has no ring
    expect(rv().querySelector('.budget-cat-row[data-id="cat_dining"] .budget-row-ring')).toBeNull();
  });

  it('a full or over row ring is closed; an empty one is invisible', () => {
    budget('cat_groceries', 100);
    budget('cat_dining', 100);
    spend(150, 'cat_groceries');
    render(false);
    const full = rv().querySelector('.budget-cat-row[data-id="cat_groceries"] .budget-row-ring-fill');
    expect(parseFloat(full.style.strokeDashoffset)).toBe(0);
    expect(full.style.stroke).toBe('var(--color-expense)');
    const empty = rv().querySelector('.budget-cat-row[data-id="cat_dining"] .budget-row-ring-fill');
    expect(empty.getAttribute('style')).toContain('stroke-opacity: 0');
  });
});
