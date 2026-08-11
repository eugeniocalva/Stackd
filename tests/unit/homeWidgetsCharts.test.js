// v0.72 Phase 2 — chart widgets (incomeExpense, categories) + config step.
// docs/home-widgets-plan.md §8 Phase 2.
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
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dateOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Anchored inside the current month so month-bucketed aggregations see it.
const thisMonth = (day) => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`;
};

let uuid = 0;

// Chart.js is a canvas library; jsdom has no 2d context. A recording stub lets
// us assert on the chart CONFIG (datasets, scales) and on destroy() lifecycle.
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
  // Freeze mid-month so "earlier this month" and "later this month" are both
  // expressible; only Date is faked so timers still behave normally.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));

  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    document: { documentElement: { setAttribute: () => {}, classList: { add: () => {}, remove: () => {} } } }
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
  // Opening date must predate the seeded rows: transactions before an account's
  // opening date are excluded from every store aggregation.
  global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
};

afterEach(() => {
  vi.useRealTimers();
});

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

// Renders one widget instance and hands back its card HTML.
const renderOne = (type, size, config) => {
  Store().dispatch('ADD_HOME_WIDGET', { type, size, config });
  const widgets = Store().getState().homeWidgets;
  const instance = widgets[widgets.length - 1];
  return { instance, html: W().registry[type].render(instance, Store().getState()) };
};

describe('incomeExpense widget', () => {
  beforeEach(boot);

  it('shows an empty state when the month has no activity', () => {
    const { html } = renderOne('incomeExpense', 'small', {});
    expect(html).toContain('Nothing this month');
  });

  it('renders net plus in/out bars when small', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 3000, date: thisMonth(2) },
      { type: 'expense', amount: 1200, date: thisMonth(3) }
    ]);
    const { html } = renderOne('incomeExpense', 'small', {});
    expect(html).toContain('$1,800.00');       // net
    expect(html).toContain('$3,000.00');       // income bar
    expect(html).toContain('$1,200.00');       // expense bar
    expect(html).toContain('widget-minibar-fill');
    expect(html).not.toContain('<canvas');
  });

  it('shows a negative net as an expense colour', () => {
    seed([{ type: 'expense', amount: 500, date: thisMonth(2) }]);
    const { html } = renderOne('incomeExpense', 'small', {});
    expect(html).toContain('text-expense');
    expect(html).toContain('-$500.00');
  });

  it('renders a canvas when large', () => {
    seed([{ type: 'income', categoryId: 'cat_salary', amount: 100, date: thisMonth(2) }]);
    const { instance, html } = renderOne('incomeExpense', 'large', {});
    expect(html).toContain(`id="widget-canvas-${instance.id}"`);
  });

  it('includes future-dated (scheduled) transactions in the current month (v0.82 EOM)', () => {
    // v0.82: the clampEnd was dropped ON PURPOSE — this widget now answers
    // "how does this month end up", so scheduled rows later this month count.
    // The clock is frozen mid-month, so +3d is always still inside the month.
    const future = dateOffset(3);
    expect(future.slice(0, 7)).toBe(todayStr().slice(0, 7));
    seed([
      { type: 'expense', amount: 777, date: future },
      { type: 'expense', amount: 11, date: thisMonth(2) }
    ]);
    const { html } = renderOne('incomeExpense', 'small', {});
    expect(html).toContain('$788.00');
    expect(html).toContain('incl. scheduled');
  });

  it('honours the account filter', () => {
    Store().dispatch('ADD_ACCOUNT', { name: 'Second', openingBalance: 0, openingDate: '2020-01-01' });
    const [a1, a2] = Store().getState().accounts;
    seed([
      { type: 'expense', amount: 111, date: thisMonth(2), accountId: a1.id },
      { type: 'expense', amount: 222, date: thisMonth(2), accountId: a2.id }
    ]);
    const only1 = renderOne('incomeExpense', 'small', { accountIds: [a1.id] }).html;
    expect(only1).toContain('$111.00');
    expect(only1).not.toContain('$222.00');

    const both = renderOne('incomeExpense', 'small', { accountIds: [] }).html;
    expect(both).toContain('$333.00'); // combined expense bar
  });

  it('builds a two-dataset bar chart over the last 6 months', () => {
    seed([
      { type: 'income', categoryId: 'cat_salary', amount: 500, date: thisMonth(2) },
      { type: 'expense', amount: 300, date: thisMonth(3) }
    ]);
    const { instance } = renderOne('incomeExpense', 'large', {});
    const canvas = { id: `widget-canvas-${instance.id}` };
    const card = {
      addEventListener: () => {},
      querySelector: (sel) => (sel === `#widget-canvas-${instance.id}` ? canvas : null)
    };
    W().registry.incomeExpense.attach(instance, card, Store().getState());

    const chart = global.window.Chart._created[0];
    expect(chart.config.type).toBe('bar');
    expect(chart.config.data.datasets).toHaveLength(2);
    expect(chart.config.data.datasets.map(d => d.label)).toEqual(['Income', 'Expenses']);
    expect(chart.config.data.labels).toHaveLength(6);
    expect(chart.config.options.scales.y.min).toBe(0);
  });
});

describe('categories widget', () => {
  beforeEach(boot);

  it('shows a direction-specific empty state', () => {
    expect(renderOne('categories', 'small', {}).html).toContain('No spending this month');
    expect(renderOne('categories', 'small', { direction: 'income' }).html).toContain('No income this month');
  });

  it('renders a donut with the period total in the centre', () => {
    seed([
      { amount: 60, date: thisMonth(2), categoryId: 'cat_groceries' },
      { amount: 40, date: thisMonth(3), categoryId: 'cat_transport' }
    ]);
    const { html } = renderOne('categories', 'small', {});
    expect(html).toContain('widget-donut');
    expect(html).toContain('$100.00');
    expect(html).not.toContain('widget-donut-legend'); // legend is large-only
  });

  it('adds a percentage legend when large', () => {
    seed([
      { amount: 75, date: thisMonth(2), categoryId: 'cat_groceries' },
      { amount: 25, date: thisMonth(3), categoryId: 'cat_transport' }
    ]);
    const { html } = renderOne('categories', 'large', {});
    expect(html).toContain('widget-donut-legend');
    expect(html).toContain('75.0%');
    expect(html).toContain('25.0%');
  });

  it('caps at top 5 plus Others', () => {
    const cats = ['cat_groceries', 'cat_transport', 'cat_dining', 'cat_shopping', 'cat_health', 'cat_utilities', 'cat_rent'];
    seed(cats.map((c, i) => ({ amount: 100 - i * 5, date: thisMonth(2), categoryId: c })));
    const { html } = renderOne('categories', 'large', {});
    expect(html).toContain('Others');
    expect(html.match(/class="widget-legend-item"/g)).toHaveLength(6); // 5 + Others
  });

  it('switches to the income breakdown', () => {
    seed([
      { amount: 500, date: thisMonth(2), categoryId: 'cat_groceries', type: 'expense' },
      { amount: 900, date: thisMonth(2), categoryId: 'cat_salary', type: 'income' }
    ]);
    const html = renderOne('categories', 'large', { direction: 'income' }).html;
    expect(html).toContain('Salary');
    expect(html).not.toContain('Groceries');
  });

  it('restricts to the picked categories in selected mode', () => {
    seed([
      { amount: 300, date: thisMonth(2), categoryId: 'cat_groceries' },
      { amount: 200, date: thisMonth(2), categoryId: 'cat_transport' }
    ]);
    const html = renderOne('categories', 'large', { mode: 'selected', categoryIds: ['cat_groceries'] }).html;
    expect(html).toContain('Groceries');
    expect(html).not.toContain('Transport');
    expect(html).toContain('$300.00');
  });

  it('falls back to all categories when selected mode has an empty pick', () => {
    seed([
      { amount: 300, date: thisMonth(2), categoryId: 'cat_groceries' },
      { amount: 200, date: thisMonth(2), categoryId: 'cat_transport' }
    ]);
    const html = renderOne('categories', 'large', { mode: 'selected', categoryIds: [] }).html;
    expect(html).toContain('Groceries');
    expect(html).toContain('Transport');
  });

  it('excludes future-dated transactions from the month total', () => {
    // Regression: computeCategoryDistribution honours the whole calendar month,
    // so without a month-to-date clamp the donut counts scheduled rows that
    // have not happened yet — and disagrees with the incomeExpense widget.
    seed([
      { amount: 100, date: thisMonth(2), categoryId: 'cat_groceries' },
      { amount: 330, date: dateOffset(3), categoryId: 'cat_rent' }
    ]);
    const html = renderOne('categories', 'large', {}).html;
    expect(html).toContain('$100.00');
    expect(html).not.toContain('Rent');
    expect(html).not.toContain('430');
  });

  it('deliberately DISAGREES with the incomeExpense widget for the current month (v0.82)', () => {
    // Pinning the intended divergence: categories stays month-to-date (money
    // already spent), incomeExpense is whole-month/EOM (incl. scheduled rows).
    // Do not "re-fix" this back to agreement — see home-widgets-plan.md §8b.
    seed([
      { amount: 100, date: thisMonth(2), categoryId: 'cat_groceries' },
      { amount: 330, date: dateOffset(3), categoryId: 'cat_rent' }
    ]);
    const donut = renderOne('categories', 'small', {}).html;
    const bars = renderOne('incomeExpense', 'small', {}).html;
    expect(donut).toContain('$100.00');   // MTD: scheduled 330 not spent yet
    expect(bars).toContain('$430.00');    // EOM: 100 + scheduled 330
    expect(bars).toContain('incl. scheduled');
  });

  it('builds a doughnut chart', () => {
    seed([{ amount: 50, date: thisMonth(2), categoryId: 'cat_groceries' }]);
    const { instance } = renderOne('categories', 'small', {});
    const canvas = { id: `widget-canvas-${instance.id}` };
    const card = { addEventListener: () => {}, querySelector: () => canvas };
    W().registry.categories.attach(instance, card, Store().getState());
    const chart = global.window.Chart._created[0];
    expect(chart.config.type).toBe('doughnut');
    expect(chart.config.options.cutout).toBe('72%');
  });
});

describe('widget chart lifecycle', () => {
  beforeEach(boot);

  it('destroys the previous chart instance when the same widget remounts', () => {
    seed([{ amount: 50, date: thisMonth(2), categoryId: 'cat_groceries' }]);
    const { instance } = renderOne('categories', 'small', {});
    const card = { addEventListener: () => {}, querySelector: () => ({ id: 'c' }) };

    W().registry.categories.attach(instance, card, Store().getState());
    const first = global.window.Chart._created[0];
    expect(first.destroyed).toBe(false);

    // A second dashboard render mounts the same widget again.
    W().registry.categories.attach(instance, card, Store().getState());
    expect(first.destroyed).toBe(true);
    expect(global.window.Chart._created).toHaveLength(2);
  });

  it('destroyCharts releases every tracked instance', () => {
    seed([{ amount: 50, date: thisMonth(2), categoryId: 'cat_groceries' }]);
    const a = renderOne('categories', 'small', {}).instance;
    const b = renderOne('categories', 'small', {}).instance;
    const card = { addEventListener: () => {}, querySelector: () => ({ id: 'c' }) };
    W().registry.categories.attach(a, card, Store().getState());
    W().registry.categories.attach(b, card, Store().getState());

    W().destroyCharts();
    expect(global.window.Chart._created.every(c => c.destroyed)).toBe(true);
    expect(Object.keys(W()._charts)).toHaveLength(0);
  });
});

describe('widget config', () => {
  beforeEach(boot);

  it('merges instance config over the registry defaults', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'categories', config: { direction: 'income' } });
    const inst = Store().getState().homeWidgets[0];
    expect(W()._cfg(inst)).toEqual({
      direction: 'income', mode: 'top', categoryIds: [], accountIds: []
    });
  });

  it('renders controls reflecting the current config', () => {
    const state = Store().getState();
    const html = W().registry.categories.renderConfig(
      { direction: 'income', mode: 'selected', categoryIds: ['cat_salary'], accountIds: [] }, state
    );
    expect(html).toContain('data-config-key="direction"');
    expect(html).toContain('data-config-key="mode"');
    expect(html).toContain('data-config-multi="categoryIds"');   // shown in selected mode
    expect(html).toContain('data-config-multi="accountIds"');
    // The active chips are the configured ones.
    expect(html).toMatch(/data-config-value="income"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-config-value="selected"[^>]*aria-pressed="true"/);
  });

  it('hides the category picker in top mode', () => {
    const html = W().registry.categories.renderConfig(
      { direction: 'expense', mode: 'top', categoryIds: [], accountIds: [] }, Store().getState()
    );
    expect(html).not.toContain('data-config-multi="categoryIds"');
  });

  it('offers income categories when the direction is income', () => {
    const expenseHtml = W().registry.categories.renderConfig(
      { direction: 'expense', mode: 'selected', categoryIds: [], accountIds: [] }, Store().getState()
    );
    const incomeHtml = W().registry.categories.renderConfig(
      { direction: 'income', mode: 'selected', categoryIds: [], accountIds: [] }, Store().getState()
    );
    expect(expenseHtml).toContain('Groceries');
    expect(expenseHtml).not.toContain('>Salary<');
    expect(incomeHtml).toContain('Salary');
    expect(incomeHtml).not.toContain('>Groceries<');
  });

  it('treats an empty multi-select as "All"', () => {
    const html = W()._multiChips('accountIds', [{ id: 'a1', name: 'One' }], []);
    expect(html).toMatch(/data-config-value="__all__"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/data-config-value="a1"[^>]*aria-pressed="false"/);
  });

  it('clears picked categories when the direction flips', () => {
    // Simulates the shared-config click path without a DOM.
    let draft = { direction: 'expense', mode: 'selected', categoryIds: ['cat_groceries'], accountIds: [] };
    const ctx = {
      getConfig: () => draft,
      setConfig: (patch) => { draft = { ...draft, ...patch }; },
      rerender: () => {}
    };
    const handlers = [];
    const fakeRoot = {
      querySelectorAll: (sel) => (sel === '[data-config-key]'
        ? [{ dataset: { configKey: 'direction', configValue: 'income' }, addEventListener: (_, fn) => handlers.push(fn) }]
        : [])
    };
    W().registry.categories.attachConfig(fakeRoot, ctx);
    handlers.forEach(fn => fn());

    expect(draft.direction).toBe('income');
    expect(draft.categoryIds).toEqual([]);
  });

  it('marks configurable widgets with a gear in edit mode', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'categories' });
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    const html = W().renderSection(Store().getState());
    // categories hasConfig, latest does not — exactly one gear.
    expect(html.match(/data-widget-action="configure"/g)).toHaveLength(1);
  });
});

describe('shared chart helpers stay reused, not duplicated', () => {
  beforeEach(boot);

  it('exposes NetFlowChart._computeYScale for widgets', () => {
    const s = global.window.Components.NetFlowChart._computeYScale([12, 35]);
    expect(s).toEqual({ min: 0, max: 40, stepSize: 10 });
  });

  it('exposes theme colours that follow the active theme', () => {
    global.window.Store.state.activeTheme = 'dark';
    expect(global.window.Components.NetFlowChart._themeColors().isDark).toBe(true);
    global.window.Store.state.activeTheme = 'light';
    const light = global.window.Components.NetFlowChart._themeColors();
    expect(light.isDark).toBe(false);
    expect(light.tooltipBg).toBe('#ffffff');
  });
});
