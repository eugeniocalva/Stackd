// 1.2.2 (HG-8, docs/category-rings-plan.md): one stable, accessible palette
// for every category ring; the Others fold (at most 6 slices); and the Goals
// ring's tap-to-focus — the tapped arc thickens, the centre shows the slice,
// a badge shows its icon then its share of spending. Keyboard and
// screen-reader path through real buttons; nothing is dispatched.
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
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0)); // 15 Oct 2026
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
    StackdHydrateIcons: vi.fn(),
    document,
    Router: { getParams: () => ({}), navigate: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'views.js'].forEach(executeFile);
  charts = [];
  global.window.Chart = function (canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.destroy = () => {};
    charts.push(this);
  };
  global.window.Chart.getChart = () => null;
  S().init();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 9000, openingDate: '2020-01-01' });
};

afterEach(() => { vi.useRealTimers(); reduce = false; });

const S = () => global.window.Store;
const C = () => global.window.Components;
const rv = () => document.getElementById('router-view');
const acc = () => S().getState().accounts[0].id;
const spend = (amount, cat) => S().dispatch('ADD_TRANSACTION', { type: 'expense', amount, accountId: acc(), categoryId: cat, date: '2026-10-05' });
const budget = (cat, amount) => S().dispatch('SAVE_BUDGET', { categoryId: cat, amount, startDate: '', endDate: null, isCumulative: false });
const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('CategoryPalette', () => {
  beforeEach(boot);

  it('every slot holds 3:1 on both cards and both icon discs, white icons hold 3:1 on every slot, and red is not a slot', () => {
    const P = C().CategoryPalette;
    expect(P.SLOTS).toHaveLength(8);
    expect(new Set(P.SLOTS).size).toBe(8);
    for (const slot of P.SLOTS) {
      for (const bg of ['#ffffff', '#161e2e', '#eef2f5', '#111827']) {
        expect(contrast(slot, bg), `${slot} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(slot, '#ffffff'), `white icon on ${slot}`).toBeGreaterThanOrEqual(3);
    }
    expect(P.SLOTS).not.toContain('#ef4444');
    expect(P.SLOTS).not.toContain('#f87171');
    expect(P.OTHERS).toBe('#64748b');
  });

  it('the default categories keep fixed colours, whatever the order', () => {
    const P = C().CategoryPalette;
    const a = P.assign(['cat_rent', 'cat_groceries', 'cat_dining', 'cat_health']);
    const b = P.assign(['cat_health', 'cat_dining', 'cat_groceries', 'cat_rent']);
    expect(a).toEqual(b);
    expect(a).toEqual({ cat_rent: '#3b82f6', cat_groceries: '#059669', cat_dining: '#ea580c', cat_health: '#c026d3' });
  });

  it('never repeats a colour on one ring of up to 8 categories, and a hashed user category is stable', () => {
    const P = C().CategoryPalette;
    const ids = ['cat_rent', 'cat_debt', 'cat_freelance', 'u-1', 'u-2', 'u-3', 'cat_other', 'cat_utilities'];
    const map = P.assign(ids);
    expect(new Set(Object.values(map)).size).toBe(8);
    expect(P.assign(['u-1']).u1).toBeUndefined();
    expect(P.assign(['u-1'])['u-1']).toBe(P.SLOTS[P.slotOf('u-1')]);
    expect(P.assign(['u-1'])['u-1']).toBe(P.assign(['u-1'])['u-1']);
    expect(P.assign(['__others__'])).toEqual({});
  });

  it('Analytics and the Home widget read the same palette through _assignColors', () => {
    const out = C().CategoryDonutChart._assignColors([
      { id: 'cat_dining', amount: 9 }, { id: 'cat_groceries', amount: 5 }, { id: '__others__', isOthers: true, amount: 1 }
    ]);
    expect(out.map(o => o._color)).toEqual(['#ea580c', '#059669', '#64748b']);
    expect(out.every(o => o._hoverColor === o._color)).toBe(true);
  });
});

describe('CategoryRing.fold, geometry and tap zones', () => {
  beforeEach(boot);
  const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, value: 100 - i }));

  it('up to 6 categories keep their own slice; from 7 the 5 biggest do and the rest fold into Others (never one member)', () => {
    const CR = C().CategoryRing;
    expect(CR.fold(items(6)).named).toHaveLength(6);
    expect(CR.fold(items(6)).others).toBeNull();
    const f = CR.fold(items(7));
    expect(f.named.map(i => i.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
    expect(f.others.members.map(m => m.id)).toEqual(['c5', 'c6']);
    expect(f.others.value).toBe(95 + 94);
  });

  it('ranks biggest first, ties by palette priority then id; zero values are left out', () => {
    const CR = C().CategoryRing;
    const f = CR.fold([{ id: 'zzz', value: 5 }, { id: 'cat_health', value: 5 }, { id: 'cat_rent', value: 5 }, { id: 'none', value: 0 }]);
    expect(f.named.map(i => i.id)).toEqual(['cat_rent', 'cat_health', 'zzz']);
  });

  it('keeps the 1.2.0 resting size in the 180 px box: outer 82, inner 54.12', () => {
    const g = C().CategoryRing.geometry([1, 3]);
    expect(g.outer).toBe(82);
    expect(g.inner).toBeCloseTo(54.12, 2);
    expect(g.arcs[0].span).toBeCloseTo(Math.PI / 2, 6);
    expect(g.arcs[1].start).toBeCloseTo(Math.PI / 2, 6);
  });

  // A tap at an angle (degrees) on the middle of the band.
  const tapAt = (CR, g, zones, deg) => {
    const p = CR.point(g, (deg * Math.PI) / 180, 68);
    return CR.hitTest(zones, p.x, p.y, g, [44, 92]);
  };
  const deg = (z) => ((z.end - z.start) * 180) / Math.PI;

  it('a small slice next to the track reaches 24° with a halo over the track only; the big slice keeps all of its arc', () => {
    const CR = C().CategoryRing;
    const g = CR.geometry([60, 1, 39]); // Rent 216°, a 3.6° slice, the track 140.4°
    const zones = CR.hitZones(g.arcs, [true, true, false]);
    expect(deg(zones[1])).toBeCloseTo(24, 6);
    expect(zones[1].start).toBeCloseTo(g.arcs[1].start, 9); // no halo over Rent
    expect(deg(zones[0])).toBeCloseTo(216, 6);
    expect(tapAt(CR, g, zones, 214)).toBe(0); // Rent's edge is still Rent
    expect(tapAt(CR, g, zones, 228)).toBe(1); // on the track, inside the halo
    expect(tapAt(CR, g, zones, 300)).toBe(2); // the rest of the track: not a slice
  });

  it('tiny slices side by side keep their drawn size; a tap on each drawn slice is always that slice', () => {
    const CR = C().CategoryRing;
    const g = CR.geometry([60, 1, 1, 38]);
    const zones = CR.hitZones(g.arcs, [true, true, true, false]);
    expect(deg(zones[1])).toBeCloseTo(3.6, 6); // between two slices: no halo
    expect(deg(zones[2])).toBeCloseTo(24, 6); // next to the track: the halo
    g.arcs.slice(0, 3).forEach((a, i) => expect(tapAt(CR, g, zones, (a.mid * 180) / Math.PI), `slice ${i}`).toBe(i));
  });

  it('early in the month (a huge track, every slice thin): the first and last slices gain halos, none drifts', () => {
    const CR = C().CategoryRing;
    const g = CR.geometry([150, 40, 25, 10, 2775]); // Rent 18°, then 4.9°, 3°, 1.2°, the track
    const zones = CR.hitZones(g.arcs, [true, true, true, true, false]);
    g.arcs.slice(0, 4).forEach((a, i) => expect(tapAt(CR, g, zones, (a.mid * 180) / Math.PI), `slice ${i}`).toBe(i));
    expect(deg(zones[0])).toBeCloseTo(24, 6); // Rent: a halo before it, over the end of the track
    expect(deg(zones[3])).toBeCloseTo(24, 6); // the last slice: a halo after it
    expect(tapAt(CR, g, zones, 355)).toBe(0);
  });

  it('fuzz: on 5,000 random rings a drawn slice never answers for another, and a halo never covers a slice', () => {
    const CR = C().CategoryRing;
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let n = 0; n < 5000; n++) {
      const k = 1 + Math.floor(rnd() * 6);
      const slices = Array.from({ length: k }, () => Math.pow(rnd(), 3) * 500 + 0.5).sort((a, b) => b - a);
      const withTrack = rnd() < 0.8;
      const values = withTrack ? slices.concat([rnd() * 3000]) : slices;
      const g = CR.geometry(values);
      const tappable = values.map((v, i) => i < k);
      const zones = CR.hitZones(g.arcs, tappable);
      for (let i = 0; i < k; i++) {
        const a = g.arcs[i];
        // five points across the drawn arc all answer for it
        for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) {
          expect(tapAt(CR, g, zones, ((a.start + a.span * f) * 180) / Math.PI), `ring ${n} slice ${i}`).toBe(i);
        }
      }
    }
  });

  it('hit-tests the band, not the hole or the outside', () => {
    const CR = C().CategoryRing;
    const g = CR.geometry([1, 1]);
    const zones = CR.hitZones(g.arcs, [true, true]);
    const p0 = CR.point(g, g.arcs[0].mid, 68);
    const p1 = CR.point(g, g.arcs[1].mid, 68);
    expect(CR.hitTest(zones, p0.x, p0.y, g, [44, 92])).toBe(0);
    expect(CR.hitTest(zones, p1.x, p1.y, g, [44, 92])).toBe(1);
    expect(CR.hitTest(zones, 90, 90, g, [44, 92])).toBe(-1);
    expect(CR.hitTest(zones, 0, 0, g, [44, 92])).toBe(-1);
  });

  it('the focus plugin only moves radii while the dataset draws, then restores them', () => {
    const CR = C().CategoryRing;
    const plugin = CR.plugin();
    expect(plugin.id).toBe('stackdRingFocus');
    const els = [{ outerRadius: 82, innerRadius: 54.12 }, { outerRadius: 82, innerRadius: 54.12 }, { outerRadius: 82, innerRadius: 54.12 }];
    const chart = { $ringFocus: { from: CR._targets(3, 1), to: CR._targets(3, 1), t: 1 } };
    plugin.beforeDatasetDraw(chart, { meta: { data: els } });
    expect(els.map(e => [e.outerRadius, +e.innerRadius.toFixed(2)])).toEqual([[80, 58.12], [88, 50.12], [80, 58.12]]);
    plugin.afterDatasetDraw(chart, { meta: { data: els } });
    expect(els.map(e => [e.outerRadius, e.innerRadius])).toEqual([[82, 54.12], [82, 54.12], [82, 54.12]]);
    // at rest: untouched
    const rest = { $ringFocus: null };
    plugin.beforeDatasetDraw(rest, { meta: { data: els } });
    expect(els[0].outerRadius).toBe(82);
  });
});

describe('the Goals ring', () => {
  beforeEach(() => {
    boot();
    S().dispatch('SET_VIEW', 'budget');
    const V = global.window.Views.BudgetView;
    V.editCategoryId = null;
    V.currentBudgetFilter = 'expense';
    V._ringFocus = null;
  });

  const V = () => global.window.Views.BudgetView;
  const render = (isEntry) => {
    rv().innerHTML = V().render(S().getState());
    V().attachEvents(rv(), S().getState(), isEntry);
    return charts[charts.length - 1];
  };
  // 7 budgeted categories with spending: the 5 biggest + Others (2)
  const seven = () => {
    [['cat_rent', 900], ['cat_groceries', 300], ['cat_dining', 120], ['cat_transport', 80], ['cat_utilities', 60], ['cat_health', 40], ['cat_shopping', 20]]
      .forEach(([c, a]) => { budget(c, a + 100); spend(a, c); });
    budget('cat_entertainment', 50); // budgeted, nothing spent: not on the ring
  };
  // tap the slice where it is drawn (the middle of its painted arc)
  const tapSlice = (id) => {
    const ring = V()._passTotals.ring;
    const i = V()._passTotals.slices.findIndex(s => s.id === id);
    const p = C().CategoryRing.point(ring.geo, ring.geo.arcs[i].mid, 68);
    rv().querySelector('#budget-ring-box').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: p.x, clientY: p.y }));
  };
  const box = () => rv().querySelector('#budget-ring-box');

  it('7 spending categories: 5 slices + Others, biggest first, then the track; Chart.js events off, padding 7, the focus plugin', () => {
    seven();
    const chart = render(false);
    const ds = chart.config.data.datasets[0];
    // allocated 2,270 (each budget = its spend + 100, Entertainment 50), spent 1,520
    expect(ds.data).toEqual([900, 300, 120, 80, 60, 60, 750]);
    expect(ds.backgroundColor).toEqual(['#3b82f6', '#059669', '#ea580c', '#0891b2', '#a16207', '#64748b', '#e2e8f0']);
    expect(ds.hoverOffset).toBe(0);
    expect(chart.config.options.events).toEqual([]);
    expect(chart.config.options.layout).toEqual({ padding: 7 });
    expect(chart.config.plugins.map(p => p.id)).toEqual(['stackdRingFocus']);
  });

  it('row icons: the slice colour, slate inside Others, none off the ring', () => {
    seven();
    render(false);
    const icon = (id) => rv().querySelector(`.budget-cat-row[data-id="${id}"] .list-item-icon`).style.color;
    expect(icon('cat_rent')).toBe(hexToRgb('#3b82f6'));
    expect(icon('cat_health')).toBe(hexToRgb('#64748b'));
    expect(icon('cat_shopping')).toBe(hexToRgb('#64748b'));
    expect(icon('cat_entertainment')).toBe('');
    expect(icon('cat_other')).toBe(''); // no budget at all
  });

  it('one labelled button per slice (not the track), outside the centre, and the canvas is hidden from screen readers', () => {
    seven();
    render(false);
    const group = rv().querySelector('.ring-arc-group');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Spending by category. Choose one to see its share.');
    const btns = [...group.querySelectorAll('button.ring-arc-btn')];
    expect(btns).toHaveLength(6);
    expect(btns[0].getAttribute('aria-label')).toMatch(/^Rent: .*900\.00, 59\.2% of spending$/);
    expect(btns[5].getAttribute('aria-label')).toMatch(/^Others \(2: Health, Shopping\): .*60\.00, 3\.9% of spending$/);
    expect(btns.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(rv().querySelector('.donut-chart-center .ring-arc-btn')).toBeNull();
    expect(rv().querySelector('#budgetChart').getAttribute('aria-hidden')).toBe('true');
  });

  it('a tap focuses the slice: centre, aria-pressed, the badge (icon, then the share at 0.9 s), the live region — no dispatch, no new chart', () => {
    seven();
    render(false);
    global.window.Components.Announcer.ensure();
    const dispatch = vi.spyOn(S(), 'dispatch');
    const before = charts.length;
    tapSlice('cat_groceries');
    expect(box().classList.contains('is-focused')).toBe(true);
    expect(box().querySelector('.ring-focus-name').textContent).toBe('Groceries');
    expect(box().querySelector('.ring-focus-amount').textContent).toMatch(/300\.00/);
    expect(box().querySelector('.ring-focus-caption').textContent).toMatch(/^of .*1,520\.00 spent$/);
    expect(box().querySelector('.ring-arc-btn[data-arc-id="cat_groceries"]').getAttribute('aria-pressed')).toBe('true');
    const badge = box().querySelector('.ring-badge[data-arc-id="cat_groceries"]');
    vi.advanceTimersByTime(60);
    expect(badge.classList.contains('is-on')).toBe(true);
    expect(badge.classList.contains('is-pct')).toBe(false);
    vi.advanceTimersByTime(900);
    expect(badge.classList.contains('is-pct')).toBe(true);
    expect(badge.querySelector('.ring-badge-pct').textContent).toBe('19.7%');
    expect(document.getElementById('sr-announcer').textContent).toMatch(/^Groceries: .*300\.00, 19\.7% of spending$/);
    expect(dispatch).not.toHaveBeenCalled();
    expect(charts.length).toBe(before);
    expect(V()._ringFocus).toEqual({ tab: 'expense', id: 'cat_groceries' });
  });

  it('the same slice again, the track, the hole and Escape each clear the focus', () => {
    seven();
    render(false);
    tapSlice('cat_rent');
    tapSlice('cat_rent');
    expect(V()._ringFocus).toBeNull();
    expect(box().classList.contains('is-focused')).toBe(false);
    tapSlice('cat_rent');
    box().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 90, clientY: 90 })); // the hole
    expect(V()._ringFocus).toBeNull();
    // the track, away from any halo: the middle of the remaining-budget arc
    tapSlice('cat_rent');
    const ring = V()._passTotals.ring;
    const t = C().CategoryRing.point(ring.geo, ring.geo.arcs[6].mid, 68);
    box().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: t.x, clientY: t.y }));
    expect(V()._ringFocus).toBeNull();
    // anywhere else on the summary card, with the live region saying so
    global.window.Components.Announcer.ensure();
    tapSlice('cat_rent');
    vi.advanceTimersByTime(100);
    rv().querySelector('#budget-summary-card').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(V()._ringFocus).toBeNull();
    vi.advanceTimersByTime(100);
    expect(document.getElementById('sr-announcer').textContent).toBe('Showing the whole budget');
    tapSlice('cat_dining');
    const btn = box().querySelector('.ring-arc-btn[data-arc-id="cat_dining"]');
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(V()._ringFocus).toBeNull();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('a button activation (keyboard, screen reader) focuses without the live region; a tap on another slice moves the focus', () => {
    seven();
    render(false);
    global.window.Components.Announcer.ensure();
    const btn = box().querySelector('.ring-arc-btn[data-arc-id="__others__"]');
    btn.click();
    expect(V()._ringFocus.id).toBe('__others__');
    expect(box().querySelector('.ring-focus-name').textContent).toBe('Others (2)');
    vi.advanceTimersByTime(200);
    expect(document.getElementById('sr-announcer').textContent).toBe('');
    tapSlice('cat_transport');
    expect(V()._ringFocus.id).toBe('cat_transport');
    expect(box().querySelector('.ring-arc-btn[data-arc-id="__others__"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('a re-render restores the focus in its final state, with no timers; a month without that slice drops it; the tab switch drops it', () => {
    seven();
    render(false);
    tapSlice('cat_dining');
    vi.advanceTimersByTime(1000);
    render(false);
    expect(box().classList.contains('is-focused')).toBe(true);
    const badge = box().querySelector('.ring-badge[data-arc-id="cat_dining"]');
    expect([...badge.classList]).toEqual(expect.arrayContaining(['is-on', 'is-pct', 'is-static']));
    expect(vi.getTimerCount()).toBe(0);
    S().dispatch('SET_MONTH_FILTER', '2026-09'); // nothing spent that month
    render(false);
    expect(V()._ringFocus).toBeNull();
    S().dispatch('SET_MONTH_FILTER', '2026-10');
    render(false);
    tapSlice('cat_dining');
    rv().querySelector('#bdg-toggle-income').click();
    expect(V()._ringFocus).toBeNull();
  });

  it('leaving Goals drops the focus and every timer', () => {
    seven();
    render(false);
    tapSlice('cat_rent');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    V().destroy();
    expect(V()._ringFocus).toBeNull();
    vi.advanceTimersByTime(70); // only the live region's own message was still due
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reduced motion: the badge shows the icon and the share together at once', () => {
    reduce = true;
    seven();
    render(false);
    tapSlice('cat_rent');
    const badge = box().querySelector('.ring-badge[data-arc-id="cat_rent"]');
    expect([...badge.classList]).toEqual(expect.arrayContaining(['is-on', 'is-both']));
    vi.advanceTimersByTime(70); // the live region's message
    expect(vi.getTimerCount()).toBe(0); // no badge timers at all
  });

  it('an overspent month: the slices fill the circle, the centre still reads Overspent, and slices stay tappable', () => {
    budget('cat_groceries', 100);
    budget('cat_dining', 100);
    spend(150, 'cat_groceries');
    spend(80, 'cat_dining');
    const chart = render(false);
    expect(chart.config.data.datasets[0].data).toEqual([150, 80]);
    expect(rv().querySelector('.donut-chart-center').textContent).toContain('Overspent');
    tapSlice('cat_dining');
    expect(V()._ringFocus.id).toBe('cat_dining');
  });

  it('nothing spent: the bare track, no buttons, no badges', () => {
    budget('cat_groceries', 100);
    const chart = render(false);
    expect(chart.config.data.datasets[0].data).toEqual([1]);
    expect(rv().querySelector('.ring-arc-btn')).toBeNull();
    expect(rv().querySelector('.ring-badge')).toBeNull();
  });

  it('escapes the member names inside the Others button name too', () => {
    [['cat_rent', 900], ['cat_groceries', 300], ['cat_dining', 120], ['cat_transport', 80], ['cat_utilities', 60], ['cat_health', 40]]
      .forEach(([c, a]) => { budget(c, a + 100); spend(a, c); });
    S().dispatch('ADD_CATEGORY', { name: 'x" onfocus="alert(1)"><img src=x>', icon: 'tag', typeHint: 'expense' });
    const evil = S().getState().categories.find(c => c.name.startsWith('x"'));
    budget(evil.id, 100);
    spend(5, evil.id); // the smallest: folds into Others with Health
    render(false);
    expect(rv().querySelector('img')).toBeNull();
    expect(rv().querySelector('[onfocus]')).toBeNull();
    const others = rv().querySelector('.ring-arc-btn[data-arc-id="__others__"]');
    expect(others.getAttribute('aria-label')).toContain('x" onfocus="alert(1)"><img src=x>');
  });

  it('large text: the readout moves under the ring (in flow) with the share in its caption; the hole keeps the resting centre', () => {
    seven();
    vi.spyOn(V(), '_ringBigText').mockReturnValue(true);
    render(false);
    expect(box().classList.contains('ring--big-text')).toBe(true);
    expect(box().querySelector('.ring-focus-readout')).toBeNull();
    const below = box().nextElementSibling;
    expect(below.classList.contains('ring-focus-readout--below')).toBe(true);
    tapSlice('cat_groceries');
    expect(below.querySelector('.ring-focus-name').textContent).toBe('Groceries');
    expect(below.querySelector('.ring-focus-caption').textContent).toMatch(/^19\.7% of .*1,520\.00 spent$/);
    render(false); // the markup path writes the same
    expect(box().nextElementSibling.querySelector('.ring-focus-caption').textContent).toMatch(/^19\.7% of .*1,520\.00 spent$/);
  });

  it('escapes category names in the button names and the badges', () => {
    S().dispatch('ADD_CATEGORY', { name: '<img src=x onerror=alert(1)>', icon: 'tag', typeHint: 'expense' });
    const cat = S().getState().categories.find(c => c.name.startsWith('<img'));
    budget(cat.id, 100);
    spend(10, cat.id);
    render(false);
    expect(rv().querySelector('img')).toBeNull(); // nothing was injected anywhere
    expect(rv().querySelector('.ring-arc-btn').getAttribute('aria-label')).toContain('<img src=x onerror=alert(1)>');
    expect(rv().querySelector('.ring-badge-pct').textContent).toBe('100%');
  });
});
