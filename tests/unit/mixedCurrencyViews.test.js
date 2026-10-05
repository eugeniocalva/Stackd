import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-36 + BUG-63 rider): the screens built on aggregates honour the
// mixed-selection rule (base wins, caption says what was left out) and format
// totals in the selection's currency — Home, History, Analytics and the
// account-configurable widgets. Lists keep every selected account's rows,
// each in its own currency (D-U8-13).
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const CAPTION_ONE = '1 account in another currency is excluded from these totals.';

let params = {};
let main, us;
const S = () => global.window.Store;
const W = () => global.window.Widgets;
const id = (n) => S().getState().accounts.find(a => a.name === n).id;

const boot = () => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  const map = new Map([['stackd_v1_homeWidgets', '[]']]);
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k)
    },
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.requestAnimationFrame = (cb) => cb();
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  executeFile('views.js');
  S().init();
  S().dispatch('SET_CURRENCY', 'EUR');
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2026-09-01' });
  S().dispatch('ADD_ACCOUNT', { name: 'US Checking', openingBalance: 1000, openingDate: '2026-09-01', currency: 'USD' });
  main = id('Main'); us = id('US Checking');
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 50, accountId: main, categoryId: 'cat_groceries', date: '2026-10-02' });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: us, categoryId: 'cat_groceries', date: '2026-10-02' });
};

const monthFilters = (accounts) => ({
  period: { type: 'month', value: '2026-10-04', start: '', end: '' },
  types: [], accounts, categories: [], tags: [], sortOrder: 'desc'
});

let widgetSeq = 0;
const widget = (type, size, config) => ({ id: `w${++widgetSeq}`, type, size, config, createdAt: '2026-10-01T00:00:00.000Z' });
const renderWidget = (inst) => {
  W()._passMemo = {};
  return W().registry[inst.type].render(inst, S().getState());
};

describe('Mixed-currency selections on screen (1.0.2 BUG-36 / BUG-63)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    params = {};
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Home ──────────────────────────────────────────────────────────────────

  it('Home with a saved mixed selection shows the € total and the caption', () => {
    S().dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'monthly', accounts: [main, us], categories: [] });
    const html = global.window.Views.DashboardView.render(S().getState());
    expect(html).toContain('€1,950.00');
    expect(html).not.toContain('€2,910.00');
    expect(html).toContain(CAPTION_ONE);
  });

  it('Home with a saved list equal to the base accounts shows the caption', () => {
    S().dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'monthly', accounts: [main], categories: [] });
    const html = global.window.Views.DashboardView.render(S().getState());
    expect(html).toContain('€1,950.00');
    expect(html).toContain(CAPTION_ONE);
  });

  it('Home with a saved US-only selection reads in $', () => {
    S().dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'monthly', accounts: [us], categories: [] });
    const html = global.window.Views.DashboardView.render(S().getState());
    expect(html).toContain('<h1 class="header-title" style="margin: 0 0 var(--space-3);">$960.00</h1>');
    expect(html).not.toContain(CAPTION_ONE);
  });

  it('Home chart: the excluded account gets no dashed line; tooltips use each line\'s currency', () => {
    S().dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'monthly', accounts: [main, us], categories: [] });
    global.window.Chart = vi.fn(function (canvas, cfg) { this.cfg = cfg; this.destroy = vi.fn(); });
    const view = global.window.Views.DashboardView;
    const container = document.getElementById('router-view');
    container.innerHTML = view.render(S().getState());
    view.attachEvents(container, S().getState());
    const cfg = global.window.Chart.mock.calls[global.window.Chart.mock.calls.length - 1][1];
    const labels = cfg.data.datasets.map(d => d.label);
    expect(labels).toContain('Main');
    expect(labels).not.toContain('US Checking');
    expect(cfg.data.datasets[0].currency).toBe('EUR');
    const label = cfg.options.plugins.tooltip.callbacks.label({ dataset: cfg.data.datasets[0], parsed: { y: 1950 } });
    expect(label).toContain('€1,950.00');
    view.destroy();
  });

  // ── History ───────────────────────────────────────────────────────────────

  it('History filtered to Main + US Checking', () => {
    S().dispatch('UPDATE_FILTERS', { page: 'history', filters: monthFilters([main, us]) });
    const html = global.window.Views.TransactionsView.render(S().getState());
    expect(html).toContain('€2,000.00'); // START
    expect(html).toContain('€1,950.00'); // END
    expect(html).not.toContain('€3,000.00');
    expect(html).not.toContain('€2,910.00');
    expect(html).toContain('sum: -€50.00');
    expect(html).toContain(CAPTION_ONE);
    // both rows still listed, each in its own currency
    expect(html).toContain('€50.00');
    expect(html).toContain('$40.00');
  });

  it('History opened from the US Checking tile formats in $', () => {
    S().dispatch('UPDATE_FILTERS', { page: 'history', filters: monthFilters([us]) });
    const html = global.window.Views.TransactionsView.render(S().getState());
    expect(html).toContain('$1,000.00'); // START
    expect(html).toContain('$960.00');   // END
    expect(html).toContain('sum: -$40.00');
    expect(html).not.toContain('€1,000.00');
    expect(html).not.toContain(CAPTION_ONE);
  });

  // ── Analytics ─────────────────────────────────────────────────────────────

  it('Analytics with a partial mixed selection shows the € hero, the Partial label AND the caption', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 300, openingDate: '2026-09-01' });
    S().dispatch('UPDATE_FILTERS', { page: 'analytics', filters: monthFilters([main, us]) });
    const html = global.window.Views.AnalyticsView.render(S().getState());
    expect(html).toContain('€1,950.00');
    expect(html).not.toContain('€2,910.00');
    expect(html).toContain('Partial accounts shown');
    expect(html).toContain(CAPTION_ONE);
  });

  it('Analytics donut total with filter [us] shows $40.00 (BUG-63)', () => {
    S().dispatch('UPDATE_FILTERS', { page: 'analytics', filters: monthFilters([us]) });
    const html = global.window.Views.AnalyticsView.render(S().getState());
    expect(html).toContain('<div class="donut-total-value">$40.00</div>');
    expect(html).toContain('$960.00'); // hero
    expect(html).not.toContain(CAPTION_ONE);
  });

  it('Analytics net-flow and donut charts format in the selection currency (BUG-63)', () => {
    S().dispatch('UPDATE_FILTERS', { page: 'analytics', filters: monthFilters([us]) });
    global.window.Chart = vi.fn(function (canvas, cfg) { this.cfg = cfg; this.destroy = vi.fn(); });
    global.window.Chart.getChart = () => null;
    const view = global.window.Views.AnalyticsView;
    const container = document.getElementById('router-view');
    container.innerHTML = view.render(S().getState());
    view.attachEvents(container, S().getState());
    const calls = global.window.Chart.mock.calls.map(c => c[1]);
    const bar = calls.find(c => c.type === 'bar');
    const donut = calls.find(c => c.type === 'doughnut');
    expect(bar.options.plugins.tooltip.callbacks.label({ parsed: { y: -40 } })).toBe('Net: -$40.00');
    expect(bar.options.scales.y.ticks.callback(100)).toBe('$100');
    expect(donut.options.plugins.tooltip.callbacks.label({ parsed: 40, dataset: { data: [40] } })).toContain('$40.00');
    view.destroy();
  });

  // ── Widgets ───────────────────────────────────────────────────────────────

  it('Net Worth widget configured [main, us] reads €1,950.00', () => {
    const html = renderWidget(widget('netWorth', 'small', { accountIds: [main, us] }));
    expect(html).toContain('€1,950.00');
    expect(html).not.toContain('€2,910.00');
  });

  it('Net Worth widget configured [us] reads $960.00 (BUG-63)', () => {
    const html = renderWidget(widget('netWorth', 'small', { accountIds: [us] }));
    expect(html).toContain('$960.00');
    expect(html).not.toContain('€960.00');
  });

  it('incomeExpense widget configured [us] shows its net in $ (BUG-63)', () => {
    const html = renderWidget(widget('incomeExpense', 'small', { accountIds: [us] }));
    expect(html).toContain('-$40.00');
    expect(html).not.toContain('€');
  });

  it('categories and savings widgets configured [us] read in $ (BUG-63)', () => {
    const cat = renderWidget(widget('categories', 'small', { accountIds: [us] }));
    expect(cat).toContain('$40.00');
    const sav = renderWidget(widget('savings', 'small', { accountIds: [us] }));
    expect(sav).toContain('-$40.00');
  });

  it('large Upcoming widget configured [main, us] lists both rows and nets only the € rows', () => {
    S().dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 10, accountId: main, categoryId: 'cat_utilities', date: '2026-10-20',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-03-20' }
    });
    S().dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 15, accountId: us, categoryId: 'cat_utilities', date: '2026-10-21',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-03-21' }
    });
    const html = renderWidget(widget('upcoming', 'large', { accountIds: [main, us], horizonDays: '30' }));
    expect(html).toContain('-€10.00');
    expect(html).toContain('-$15.00');
    const footer = html.slice(html.indexOf('widget-upcoming-footer'));
    expect(footer).toContain('-€10.00');
    expect(footer).not.toContain('25.00');
  });

  it('the widget config sheet notes the excluded account', () => {
    const state = S().getState();
    const mixed = W().registry.netWorth.renderConfig({ accountIds: [main, us] }, state);
    expect(mixed).toContain(CAPTION_ONE);
    const single = W().registry.netWorth.renderConfig({ accountIds: [us] }, state);
    expect(single).not.toContain(CAPTION_ONE);
    const all = W().registry.netWorth.renderConfig({ accountIds: [] }, state);
    expect(all).not.toContain(CAPTION_ONE);
  });

  it('pin: with all-base data the widgets keep the base currency and no note', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 300, openingDate: '2026-09-01' });
    const savings = id('Savings');
    const html = renderWidget(widget('netWorth', 'small', { accountIds: [main, savings] }));
    expect(html).toContain('€2,250.00');
    const cfg = W().registry.netWorth.renderConfig({ accountIds: [main, savings] }, S().getState());
    expect(cfg).not.toContain('another currency');
  });
});
