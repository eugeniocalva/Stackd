// 1.2.0 (UX-7) — Components.RingChart: the one ring look (thick arcs, a
// gradient per arc, glow, canvas icon badges) and the entry-only sweep, on
// every ring: the Home categories and budgets widgets, the Analytics donut
// and the Goals ring (now one arc per budgeted category) + its row rings.
// docs/ux-review-1.2-plan.md B.4. The Chart stubs never run plugin hooks,
// so _paint is driven here with a fake chart and a recording context.
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

const baseConfig = () => ({
  type: 'doughnut',
  data: { datasets: [{ data: [3, 1], backgroundColor: ['#10b981', '#e2e8f0'], borderWidth: 3, borderRadius: 4 }] },
  options: { responsive: true, cutout: '74%', animation: { duration: 600 }, plugins: { legend: { display: false } } }
});

describe('RingChart.config', () => {
  beforeEach(boot);

  it('makes the ring thick and gapped, and registers the plugin at the config root', () => {
    const cfg = RC().config(baseConfig(), { badges: [{ icon: 'pin' }, null], track: [1] });
    expect(cfg.options.cutout).toBe('62%');
    const ds = cfg.data.datasets[0];
    expect(ds.borderWidth).toBe(0);
    expect(ds.spacing).toBe(2);
    expect(ds.borderRadius).toBe(8);
    expect(cfg.plugins).toContain(RC().plugin);
    expect(RC().plugin.id).toBe('stackdRing');
    expect(cfg.options.plugins.legend).toEqual({ display: false });
    expect(cfg.options.plugins.stackdRing).toMatchObject({
      badges: [{ icon: 'pin' }, null], track: [1], glow: true, theme: 'light', animate: false
    });
  });

  it('keeps datasets[0].backgroundColor the plain hex array', () => {
    const cfg = RC().config(baseConfig(), {});
    expect(cfg.data.datasets[0].backgroundColor).toEqual(['#10b981', '#e2e8f0']);
  });

  it('never registers the plugin twice', () => {
    const cfg = RC().config(RC().config(baseConfig(), {}), {});
    expect(cfg.plugins.filter(p => p === RC().plugin)).toHaveLength(1);
  });

  it('animation is false unless the caller says this is an entry render', () => {
    expect(RC().config(baseConfig(), {}).options.animation).toBe(false);
    expect(RC().config(baseConfig(), { animate: false }).options.animation).toBe(false);
  });

  it('an entry render gets the sweep: rotate only, 700ms, the given delay', () => {
    const anim = RC().config(baseConfig(), { animate: true, delay: 250 }).options.animation;
    expect(anim).toMatchObject({ animateRotate: true, animateScale: false, duration: 700, easing: 'easeOutQuart', delay: 250 });
    // the glow waits for the arcs to settle, then one extra draw adds it
    const chart = { $ringAnimating: false, ctx: {}, draw: vi.fn() };
    anim.onProgress({ chart });
    expect(chart.$ringAnimating).toBe(true);
    anim.onComplete({ chart });
    expect(chart.$ringAnimating).toBe(false);
    expect(chart.draw).toHaveBeenCalledTimes(1);
  });

  it('reduced motion turns the sweep off', () => {
    reduce = true;
    const cfg = RC().config(baseConfig(), { animate: true });
    expect(cfg.options.animation).toBe(false);
    expect(cfg.options.plugins.stackdRing.animate).toBe(false);
  });

  it('follows the dark theme', () => {
    S().state.activeTheme = 'dark';
    expect(RC().config(baseConfig(), {}).options.plugins.stackdRing.theme).toBe('dark');
  });

  it('the plugin starts a sweeping chart without its glow', () => {
    const chart = {};
    RC().plugin.beforeInit(chart, {}, { animate: true });
    expect(chart.$ringAnimating).toBe(true);
    RC().plugin.beforeInit(chart, {}, { animate: false });
    expect(chart.$ringAnimating).toBe(false);
  });
});

describe('RingChart drawing (fake chart, recording context)', () => {
  beforeEach(boot);

  const makeCtx = () => {
    const log = [];
    return {
      log,
      save() {}, restore() {}, beginPath() {}, fill() { log.push(['fill', this.fillStyle]); }, stroke() {},
      arc(...a) { log.push(['badge', a]); },
      drawImage() { log.push(['img']); },
      createRadialGradient(...a) {
        const g = { stops: [], addColorStop(o, c) { this.stops.push([o, c]); } };
        log.push(['grad', a, g]);
        return g;
      },
      set globalCompositeOperation(v) { log.push(['gco', v]); },
      get globalCompositeOperation() { return 'source-over'; },
      set shadowBlur(v) { log.push(['blur', v]); },
      get shadowBlur() { return 0; },
      shadowColor: ''
    };
  };
  const makeArc = (start, end, inner, outer, color, fills) => ({
    x: 120, y: 120, startAngle: start, endAngle: end, innerRadius: inner, outerRadius: outer,
    options: { backgroundColor: color },
    getProps(props) { const o = {}; props.forEach(p => { o[p] = this[p]; }); return o; },
    draw() { fills.push(this.options.backgroundColor); }
  });
  const makeChart = (arcs, colors, ringOpts, animating = false) => ({
    ctx: makeCtx(),
    $ringAnimating: animating,
    data: { datasets: [{ backgroundColor: colors }] },
    getDatasetMeta: () => ({ data: arcs }),
    config: { options: { plugins: { stackdRing: ringOpts } } },
    draw: vi.fn()
  });

  it('refills every non-track arc with a radial gradient and glows behind it', () => {
    const fills = [];
    const arcs = [makeArc(0, 2, 60, 100, '#10b981', fills), makeArc(2, 6, 60, 100, '#e2e8f0', fills)];
    const chart = makeChart(arcs, ['#10b981', '#e2e8f0'], { track: [1], glow: true, theme: 'light' });
    RC()._paint(chart);
    const grads = chart.ctx.log.filter(l => l[0] === 'grad');
    expect(grads).toHaveLength(1);
    expect(grads[0][1]).toEqual([120, 120, 60, 120, 120, 100]);
    const stops = grads[0][2].stops;
    expect(stops[1]).toEqual([0.5, '#10b981']);
    expect(stops[0][1]).not.toBe('#10b981'); // lighter inside
    expect(stops[2][1]).not.toBe('#10b981'); // darker outside
    expect(chart.ctx.log).toContainEqual(['gco', 'destination-over']);
    expect(chart.ctx.log).toContainEqual(['blur', 14]);
    // glow fill (base) then the gradient; the track arc is never repainted
    expect(fills).toHaveLength(2);
    expect(fills[0]).toBe('#10b981');
    expect(fills[1]).toBe(grads[0][2]);
  });

  it('draws no glow while the arcs are still moving', () => {
    const fills = [];
    const chart = makeChart([makeArc(0, 2, 60, 100, '#10b981', fills)], ['#10b981'], { track: [], glow: true }, true);
    RC()._paint(chart);
    expect(chart.ctx.log).not.toContainEqual(['gco', 'destination-over']);
    expect(fills).toHaveLength(1); // the gradient only
  });

  it('badges only a big ring, only on arcs wide enough, never on the track', () => {
    const fills = [];
    const arcs = [
      makeArc(0, 2, 60, 100, '#10b981', fills),     // wide: badge
      makeArc(2, 2.1, 60, 100, '#f59e0b', fills),   // 0.1 rad × 80px = 8px: too narrow
      makeArc(2.1, 6, 60, 100, '#e2e8f0', fills)    // track
    ];
    const chart = makeChart(arcs, ['#10b981', '#f59e0b', '#e2e8f0'],
      { badges: [{ icon: 'pin' }, { icon: 'pin' }, { icon: 'pin' }], track: [2], glow: false });
    RC()._paint(chart);
    const badges = chart.ctx.log.filter(l => l[0] === 'badge');
    expect(badges).toHaveLength(1);
    // centred on the arc's mid-angle, halfway through the ring's thickness
    const [bx, by, r] = badges[0][1];
    expect(bx).toBeCloseTo(120 + Math.cos(1) * 80, 5);
    expect(by).toBeCloseTo(120 + Math.sin(1) * 80, 5);
    expect(r).toBe(10);
  });

  it('a ring under 70px radius gets no badges', () => {
    const fills = [];
    const chart = makeChart([makeArc(0, 3, 40, 65, '#10b981', fills)], ['#10b981'],
      { badges: [{ icon: 'pin' }], track: [], glow: false });
    RC()._paint(chart);
    expect(chart.ctx.log.filter(l => l[0] === 'badge')).toHaveLength(0);
  });

  it('shades a colour lighter and darker', () => {
    expect(RC()._shade('#808080', 0.5)).toBe('rgb(192, 192, 192)');
    expect(RC()._shade('#808080', -0.5)).toBe('rgb(64, 64, 64)');
    expect(RC()._rgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(RC()._rgb('var(--x)')).toBeNull();
  });

  it("icons come from lucide's renderer first, white, then the file:// snapshot", () => {
    global.window.lucide = {
      icons: { ShoppingCart: ['svg', {}, []] },
      createElement: () => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.setAttribute('stroke', 'currentColor');
        return el;
      }
    };
    const svg = RC()._iconSvg('shopping-cart');
    expect(svg).toContain('stroke="#ffffff"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');

    delete global.window.lucide;
    global.window.StackdIconSvg = (n) => (n === 'help-circle' ? '<svg stroke="currentColor"><circle/></svg>' : null);
    expect(RC()._iconSvg('not-an-icon')).toBe('<svg stroke="#ffffff"><circle/></svg>');
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
      expect(c.config.plugins).toContain(RC().plugin);
      expect(c.config.options.cutout).toBe('62%');
    });
    expect(W()._entryPass).toBe(false); // only for that attach loop
  });

  it('a same-view re-render (no isEntry) never animates', () => {
    mount({ isEntry: false });
    mount();
    expect(doughnuts()).toHaveLength(4);
    expect(doughnuts().every(c => c.config.options.animation === false)).toBe(true);
    expect(doughnuts().every(c => c.config.plugins.includes(RC().plugin))).toBe(true);
  });

  it('reduced motion: no sweep even on entry (the look stays)', () => {
    reduce = true;
    mount({ isEntry: true });
    expect(doughnuts().every(c => c.config.options.animation === false)).toBe(true);
    expect(doughnuts().every(c => c.config.options.cutout === '62%')).toBe(true);
  });

  it('the budgets ring keeps its hex pair, with the remainder as a flat track', () => {
    mount({ isEntry: true });
    const ring = doughnuts().find(c => !c.config.data.labels);
    expect(ring.config.data.datasets[0].data).toEqual([50, 150]);
    expect(ring.config.data.datasets[0].backgroundColor).toEqual(['#64748b', '#e2e8f0']);
    expect(ring.config.options.plugins.stackdRing.track).toEqual([1]);
    expect(ring.config.options.plugins.stackdRing.badges).toBeNull();
  });

  it('the categories ring badges its arcs in the large size only', () => {
    mount({ isEntry: false });
    const small = doughnuts().find(c => c.config.data.labels);
    expect(small.config.options.plugins.stackdRing.badges).toBeNull();
    const inst = S().getState().homeWidgets[0];
    S().dispatch('UPDATE_HOME_WIDGET', { id: inst.id, size: 'large' });
    charts = [];
    mount({ isEntry: false });
    const large = doughnuts().find(c => c.config.data.labels);
    expect(large.config.options.plugins.stackdRing.badges).toEqual([{ icon: 'shopping-cart' }, { icon: 'utensils' }]);
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
    expect(doughnuts()[0].config.plugins).toContain(RC().plugin);
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

  it('sweeps on the Analytics entry render, with an icon badge per arc', () => {
    render(true);
    const donut = doughnuts()[0];
    expect(donut.config.options.animation).toMatchObject({ animateRotate: true, delay: 250 });
    expect(donut.config.options.cutout).toBe('62%');
    expect(donut.config.data.datasets[0].backgroundColor).toEqual(['#10b981', '#f59e0b']);
    expect(donut.config.options.plugins.stackdRing.badges).toEqual([{ icon: 'shopping-cart' }, { icon: 'utensils' }]);
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
    expect(doughnuts()[0].config.plugins).toContain(RC().plugin);
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

  it('one arc per budgeted category with spending, in its colour, then the remaining track', () => {
    budget('cat_groceries', 100);
    budget('cat_dining', 100);
    budget('cat_transport', 100); // budgeted, nothing spent: no arc
    spend(50, 'cat_groceries');
    spend(30, 'cat_dining');
    const ring = render(false);
    const ds = ring.config.data.datasets[0];
    // displayed order: budgeted first, alphabetical (Dining Out, Groceries, Transport)
    expect(ds.data).toEqual([30, 50, 220]);
    expect(ds.backgroundColor).toEqual(['#f59e0b', '#10b981', '#e2e8f0']);
    expect(ring.config.options.plugins.stackdRing.track).toEqual([2]);
    expect(ring.config.options.plugins.stackdRing.badges).toEqual([{ icon: 'utensils' }, { icon: 'shopping-cart' }, null]);
  });

  it('overspent stays the full red ring', () => {
    budget('cat_groceries', 100);
    spend(150, 'cat_groceries');
    const ring = render(false);
    const ds = ring.config.data.datasets[0];
    expect(ds.data).toEqual([1, 0]);
    expect(ds.backgroundColor[0]).toBe('#ef4444');
    expect(ring.config.options.plugins.stackdRing.track).toEqual([1]);
    expect(ring.config.options.plugins.stackdRing.badges).toBeNull();
  });

  it('nothing budgeted is an empty track', () => {
    const ring = render(false);
    expect(ring.config.data.datasets[0].data).toEqual([1]);
    expect(ring.config.options.plugins.stackdRing.track).toEqual([0]);
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
