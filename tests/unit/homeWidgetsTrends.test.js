// v0.72 Phase 3 — trend widgets (netWorth, savings) + the detail/preview step.
// docs/home-widgets-plan.md §8 Phase 3.
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

const pad = (n) => String(n).padStart(2, '0');
// Frozen clock (see boot) makes these deterministic.
const monthDay = (monthsBack, day) => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1 - monthsBack)}-${pad(day)}`;
};

let uuid = 0;

const makeChartStub = () => {
  const created = [];
  const Chart = function (canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.destroyed = false;
    this.destroy = function () { this.destroyed = true; };
    created.push(this);
  };
  Chart.getChart = () => null;
  Chart._created = created;
  return Chart;
};

const boot = () => {
  // Frozen to June so monthDay(0..5) stays inside one calendar year.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));

  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} })
  };
  global.localStorage = global.window.localStorage;
  // Deliberately-empty widget area: an absent key fires the v0.72 Phase 5
  // upgrade seed (covered in homeWidgets.test.js), shifting instance indices.
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');

  executeFile('db.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  global.window.Chart = makeChartStub();
  global.window.Store.init();
  global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
};

afterEach(() => { vi.useRealTimers(); });

const Store = () => global.window.Store;
const W = () => global.window.Widgets;

const seed = (rows) => {
  const accId = Store().getState().accounts[0].id;
  Store().state.transactions.push(...rows.map((r, i) => ({
    id: `tx-${i}-${Math.random()}`,
    accountId: r.accountId || accId,
    categoryId: r.categoryId || 'cat_groceries',
    type: r.type || 'expense',
    amount: r.amount,
    date: r.date,
    createdAt: '2026-01-01T00:00:00.000Z'
  })));
};

const renderOne = (type, size, config) => {
  Store().dispatch('ADD_HOME_WIDGET', { type, size, config });
  const list = Store().getState().homeWidgets;
  const instance = list[list.length - 1];
  return { instance, html: W().registry[type].render(instance, Store().getState()) };
};

const mount = (type, instance) => {
  const canvas = { id: `widget-canvas-${instance.id}` };
  const card = { addEventListener: () => {}, querySelector: () => canvas };
  W().registry[type].attach(instance, card, Store().getState());
  return global.window.Chart._created[global.window.Chart._created.length - 1];
};

describe('netWorth widget', () => {
  beforeEach(boot);

  it('shows the latest balance and a delta badge', () => {
    const { html } = renderOne('netWorth', 'small', {});
    expect(html).toContain('$1,000.00');       // opening balance only
    expect(html).toContain('widget-delta');
    expect(html).toContain('<canvas');
  });

  it('renders a dash when there is no baseline to compare against', () => {
    // An account with no opening balance has a zero start-of-month baseline, so
    // computeBalanceForecast returns null rather than a misleading percentage.
    Store().dispatch('ADD_ACCOUNT', { name: 'Fresh', openingBalance: 0 });
    const fresh = Store().getState().accounts.find(a => a.name === 'Fresh');
    const { html } = renderOne('netWorth', 'small', { accountIds: [fresh.id] });
    expect(html).toContain('—');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('shows a real percentage when a baseline does exist', () => {
    const { html } = renderOne('netWorth', 'small', {});
    expect(html).toMatch(/widget-delta[^>]*>[+-]?\d+\.\d%/);
  });

  it('reflects transactions in the headline balance', () => {
    seed([{ type: 'expense', amount: 250, date: monthDay(0, 2) }]);
    const { html } = renderOne('netWorth', 'small', {});
    expect(html).toContain('$750.00');
  });

  it('delegates to computeGraphBalances and takes the last 6 months', () => {
    const spy = vi.spyOn(Store(), 'computeGraphBalances');
    const { instance } = renderOne('netWorth', 'large', {});
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ interval: 'monthly' }));
    const chart = mount('netWorth', instance);
    expect(chart.config.data.labels).toHaveLength(6);
    spy.mockRestore();
  });

  it('honours the account filter', () => {
    Store().dispatch('ADD_ACCOUNT', { name: 'Second', openingBalance: 4000, openingDate: '2020-01-01' });
    const [a1] = Store().getState().accounts;
    const scoped = renderOne('netWorth', 'small', { accountIds: [a1.id] }).html;
    const all = renderOne('netWorth', 'small', { accountIds: [] }).html;
    expect(scoped).toContain('$1,000.00');
    expect(all).toContain('$5,000.00');
  });

  it('draws a filled line, and hides axes plus tooltip when small', () => {
    const small = mount('netWorth', renderOne('netWorth', 'small', {}).instance);
    expect(small.config.type).toBe('line');
    expect(small.config.data.datasets[0].fill).toBe(true);
    expect(small.config.options.scales.x.display).toBe(false);
    expect(small.config.options.plugins.tooltip.enabled).toBe(false);

    const large = mount('netWorth', renderOne('netWorth', 'large', {}).instance);
    expect(large.config.options.scales.x.display).toBe(true);
    expect(large.config.options.plugins.tooltip.callbacks).toBeDefined();
  });

  it('uses a sparkline height only when small', () => {
    expect(renderOne('netWorth', 'small', {}).html).toContain('widget-chart-wrap--spark');
    expect(renderOne('netWorth', 'large', {}).html).not.toContain('widget-chart-wrap--spark');
  });
});

describe('savings widget', () => {
  beforeEach(boot);

  it('shows this month net saved', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 2000, date: monthDay(0, 1) },
      { type: 'expense', amount: 800, date: monthDay(0, 2) }
    ]);
    const { html } = renderOne('savings', 'small', {});
    expect(html).toContain('$1,200.00');
    expect(html).toContain('text-income');
  });

  it('reads as a loss when the month overspends', () => {
    seed([{ type: 'expense', amount: 300, date: monthDay(0, 2) }]);
    const { html } = renderOne('savings', 'small', {});
    expect(html).toContain('-$300.00');
    expect(html).toContain('text-expense');
  });

  it('computes the percentage change against the previous month', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 1000, date: monthDay(1, 1) },
      { type: 'expense', amount: 500, date: monthDay(1, 2) },     // prev month net = 500
      { type: 'income', categoryId: 'cat_salary', amount: 1000, date: monthDay(0, 1) },
      { type: 'expense', amount: 250, date: monthDay(0, 2) }      // this month net = 750
    ]);
    const { html } = renderOne('savings', 'small', {});
    expect(html).toContain('$750.00');
    expect(html).toContain('+50.0%');   // 750 vs 500
  });

  it('shows a dash rather than a bogus percentage when the previous month is zero', () => {
    // Months with no transactions bucket to net 0; dividing by that is undefined.
    seed([{ type: 'income', categoryId: 'cat_salary', amount: 400, date: monthDay(0, 1) }]);
    const { html } = renderOne('savings', 'small', {});
    expect(html).toContain('$400.00');
    expect(html).toContain('—');
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('NaN');
  });

  it('handles empty months without dropping buckets', () => {
    seed([{ type: 'income', categoryId: 'cat_salary', amount: 900, date: monthDay(3, 1) }]);
    const { instance } = renderOne('savings', 'large', {});
    const chart = mount('savings', instance);
    expect(chart.config.data.labels).toHaveLength(6);
    expect(chart.config.data.datasets[0].data.filter(v => v === 0)).toHaveLength(5);
  });

  it('colours each bar by whether that month saved or lost', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 900, date: monthDay(1, 1) },
      { type: 'expense', amount: 400, date: monthDay(0, 2) }
    ]);
    const { instance } = renderOne('savings', 'large', {});
    const chart = mount('savings', instance);
    const colors = chart.config.data.datasets[0].backgroundColor;
    expect(colors[colors.length - 1]).toContain('239, 68, 68');   // this month: lost
    expect(colors[colors.length - 2]).toContain('16, 185, 129');  // last month: saved
  });

  it('agrees with incomeExpense on past-only months, diverges on scheduled rows (v0.82)', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 2000, date: monthDay(0, 1) },
      { type: 'expense', amount: 800, date: monthDay(0, 2) }
    ]);
    // With only past-dated rows the two still report the same net.
    expect(renderOne('savings', 'small', {}).html).toContain('$1,200.00');
    expect(renderOne('incomeExpense', 'small', {}).html).toContain('$1,200.00');

    // v0.82: a scheduled row later this month splits them by design —
    // savings stays month-to-date (money actually put aside so far), while
    // incomeExpense is whole-month/EOM (how the month ends up).
    seed([{ type: 'expense', amount: 300, date: monthDay(0, 25) }]);
    expect(renderOne('savings', 'small', {}).html).toContain('$1,200.00');
    expect(renderOne('incomeExpense', 'small', {}).html).toContain('$900.00');
  });
});

describe('add-widget preview', () => {
  beforeEach(boot);

  it('renders a real card inside a preview stage', () => {
    const html = W().renderPreview('netWorth', 'small', {}, Store().getState());
    expect(html).toContain('widget-preview-stage');
    expect(html).toContain('widgets-grid--preview');
    expect(html).toContain('widget-card');
    expect(html).toContain('Net worth');
    expect(html).toContain(`data-widget-id="${W().PREVIEW_ID}"`);
  });

  it('reflects the chosen size', () => {
    expect(W().renderPreview('netWorth', 'large', {}, Store().getState())).toContain('widget-card--large');
    expect(W().renderPreview('netWorth', 'small', {}, Store().getState())).not.toContain('widget-card--large');
  });

  it('never shows edit chrome', () => {
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    const html = W().renderPreview('netWorth', 'small', {}, Store().getState());
    expect(html).not.toContain('data-widget-action');
  });

  it('renders the widget empty state rather than failing with no data', () => {
    const html = W().renderPreview('categories', 'small', {}, Store().getState());
    expect(html).toContain('No spending this month');
    expect(html).not.toContain('undefined');
  });

  it('returns nothing for an unknown type', () => {
    expect(W().renderPreview('nope', 'small', {}, Store().getState())).toBe('');
  });

  it('mounts and releases the preview chart', () => {
    const card = { addEventListener: () => {}, querySelector: () => ({ id: 'c' }) };
    const root = { querySelector: () => card };
    W().attachPreview(root, 'netWorth', 'small', {}, Store().getState());
    expect(W()._charts[W().PREVIEW_ID]).toBeDefined();

    W().destroyPreview();
    expect(W()._charts[W().PREVIEW_ID]).toBeUndefined();
    expect(global.window.Chart._created[0].destroyed).toBe(true);
  });

  it('applies the draft config to the preview', () => {
    seed([
      { amount: 300, date: monthDay(0, 2), categoryId: 'cat_groceries' },
      { amount: 200, date: monthDay(0, 3), categoryId: 'cat_transport' }
    ]);
    const html = W().renderPreview('categories', 'large',
      { direction: 'expense', mode: 'selected', categoryIds: ['cat_groceries'], accountIds: [] },
      Store().getState());
    expect(html).toContain('Groceries');
    expect(html).not.toContain('Transport');
  });
});

describe('registry shape', () => {
  beforeEach(boot);

  it('keeps the phase 1-3 types in the gallery, trends after charts', () => {
    // The exact full-gallery order is pinned in homeWidgetsGoals.test.js —
    // one place, so adding a widget type breaks one assertion, not two.
    const types = W().listTypes().map(t => t.type);
    ['latest', 'incomeExpense', 'categories', 'netWorth', 'savings'].forEach(t =>
      expect(types).toContain(t));
    expect(types.indexOf('netWorth')).toBeGreaterThan(types.indexOf('categories'));
  });

  it('gives every type a title, description, icon and at least one size', () => {
    W().listTypes().forEach(t => {
      expect(t.title, t.type).toBeTruthy();
      expect(t.description, t.type).toBeTruthy();
      expect(t.icon, t.type).toBeTruthy();
      expect(t.sizes.length, t.type).toBeGreaterThan(0);
      expect(typeof W().registry[t.type].render, t.type).toBe('function');
    });
  });

  it('gives every configurable type both a renderConfig and an attachConfig', () => {
    W().listTypes().filter(t => t.hasConfig).forEach(t => {
      expect(typeof W().registry[t.type].renderConfig, t.type).toBe('function');
      expect(typeof W().registry[t.type].attachConfig, t.type).toBe('function');
    });
  });

  it('renders every type in both sizes without throwing, with and without data', () => {
    W().listTypes().forEach(t => {
      t.sizes.forEach(size => {
        expect(() => renderOne(t.type, size, {}), `${t.type}/${size} empty`).not.toThrow();
      });
    });
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 2000, date: monthDay(0, 1) },
      { type: 'expense', amount: 500, date: monthDay(0, 2) }
    ]);
    W().listTypes().forEach(t => {
      t.sizes.forEach(size => {
        const { html } = renderOne(t.type, size, {});
        expect(html, `${t.type}/${size} data`).not.toContain('undefined');
        expect(html, `${t.type}/${size} data`).not.toContain('NaN');
      });
    });
  });
});
