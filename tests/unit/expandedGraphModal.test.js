import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('ExpandedGraphModal Unit Tests', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    global.document = {
      getElementById: vi.fn((id) => {
        if (id === 'modal-container') return global.document.body;
        return null;
      }),
      body: {
        appendChild: vi.fn(),
        querySelector: vi.fn()
      },
      createElement: (tag) => {
        const elem = {
          tagName: tag.toUpperCase(),
          className: '',
          id: '',
          innerHTML: '',
          style: {},
          classList: {
            add: vi.fn(),
            remove: vi.fn()
          },
          querySelector: vi.fn(),
          querySelectorAll: vi.fn(() => []),
          appendChild: vi.fn(),
          remove: vi.fn()
        };
        return elem;
      }
    };
    global.requestAnimationFrame = (cb) => cb();

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    global.window.Store.init();
  });

  it('provides ExpandedGraphModal component on window.Components', () => {
    expect(global.window.Components.ExpandedGraphModal).toBeDefined();
    expect(typeof global.window.Components.ExpandedGraphModal.show).toBe('function');
  });

  it('renders balance chart container with cursor pointer and click handler trigger', () => {
    const state = global.window.Store.getState();
    const html = global.window.Views.DashboardView.render(state);
    
    expect(html).toContain('id="chart-card-container"');
    expect(html).toContain('cursor: pointer');
    expect(html).toContain('title="Click to view expanded graph"');
  });

  it('computes 52 weeks for weekly with linear X coordinates and 100% matching monthLabels with monthly view', () => {
    const weekly = global.window.Store.computeGraphBalances({ interval: 'weekly' });
    expect(weekly.points).toHaveLength(52);
    expect(weekly.monthLabels).toHaveLength(12);
    expect(weekly.points[0]).toHaveProperty('x');
    expect(weekly.points[0]).toHaveProperty('y');
    expect(weekly.points[0]).toHaveProperty('fullLabel');
    expect(weekly.points[0].x).toBe(0);
    expect(weekly.points[51].x).toBe(11);

    const monthly = global.window.Store.computeGraphBalances({ interval: 'monthly' });
    expect(monthly.points).toHaveLength(12);
    expect(monthly.monthLabels).toHaveLength(12);

    expect(weekly.monthLabels).toEqual(monthly.monthLabels);

    const quarter = global.window.Store.computeGraphBalances({ interval: 'quarter' });
    expect(quarter.points).toHaveLength(4);
    expect(quarter.monthLabels).toHaveLength(4);
  });

  it('persists graph filter settings via SAVE_EXPANDED_GRAPH_FILTERS dispatch action', () => {
    global.window.Store.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', {
      interval: 'weekly',
      accounts: ['acc_1'],
      categories: ['cat_groceries']
    });

    const filters = global.window.Store.state.expandedGraphFilters;
    expect(filters.interval).toBe('weekly');
    expect(filters.accounts).toEqual(['acc_1']);
    expect(filters.categories).toEqual(['cat_groceries']);
  });

  it('resets graph filter settings via RESET_EXPANDED_GRAPH_FILTERS and renders Reset View button on Dashboard', () => {
    global.window.Store.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', {
      interval: 'weekly',
      accounts: ['acc_1'],
      categories: ['cat_groceries']
    });

    let html = global.window.Views.DashboardView.render(global.window.Store.getState());
    expect(html).toContain('id="btn-reset-graph-filters"');
    expect(html).toContain('Reset View');

    global.window.Store.dispatch('RESET_EXPANDED_GRAPH_FILTERS');

    const filters = global.window.Store.state.expandedGraphFilters;
    expect(filters.interval).toBe('monthly');
    expect(filters.accounts).toEqual([]);
    expect(filters.categories).toEqual([]);

    html = global.window.Views.DashboardView.render(global.window.Store.getState());
    expect(html).not.toContain('id="btn-reset-graph-filters"');
  });

  it('renders modal backdrop with canvas #expandedBalanceChart and initializes chart instance upon show()', () => {
    let appendedElem = null;
    global.window.Chart = vi.fn().mockImplementation(function() {
      this.destroy = vi.fn();
      this.resize = vi.fn();
      this.update = vi.fn();
    });

    const dummyCanvas = { getContext: vi.fn() };
    const origCreateElem = global.document.createElement;
    global.document.createElement = (tag) => {
      const elem = origCreateElem(tag);
      elem.querySelector = vi.fn((sel) => {
        if (sel === '#expandedBalanceChart') return dummyCanvas;
        return null;
      });
      return elem;
    };

    global.document.body.appendChild = vi.fn((elem) => {
      appendedElem = elem;
    });

    const state = global.window.Store.getState();
    global.window.Components.ExpandedGraphModal.show(state);

    expect(appendedElem).not.toBeNull();
    expect(appendedElem.id).toBe('expanded-graph-modal');
    expect(appendedElem.innerHTML).toContain('expandedBalanceChart');
    expect(appendedElem.innerHTML).toContain('Balance Trend');

    expect(global.window.Chart).toHaveBeenCalled();
    expect(global.window.Components.ExpandedGraphModal._chartInstance).toBeDefined();
  });
});

// 1.0.2 (BUG-36): a mixed-currency selection in the expanded graph sums the
// base accounts only (with the caption), draws no line for the excluded
// account, formats tooltips per line and the y-axis in the selection's
// currency, and an exactly-base selection IS the default view — saved as []
// (D-U8-7).
describe('ExpandedGraphModal — mixed currencies (1.0.2 BUG-36)', () => {
  const CAPTION_ONE = '1 account in another currency is excluded from these totals.';
  let main, us, appended, buttons;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    let uid = 0;
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + (++uid) },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    appended = null;
    buttons = {};
    const canvas = { getContext: vi.fn() };
    global.document = {
      getElementById: vi.fn((id) => (id === 'modal-container' ? global.document.body : null)),
      body: { appendChild: vi.fn((el) => { appended = el; }), querySelector: vi.fn() },
      createElement: (tag) => ({
        tagName: tag.toUpperCase(), className: '', id: '', innerHTML: '', style: {},
        classList: { add: vi.fn(), remove: vi.fn() },
        querySelector: vi.fn((sel) => {
          if (sel === '#expandedBalanceChart') return canvas;
          if (sel === '#egm-save-filters' || sel === '#egm-toggle-all-accounts') {
            return (buttons[sel] = buttons[sel] || {});
          }
          return null;
        }),
        querySelectorAll: vi.fn(() => []),
        appendChild: vi.fn(),
        remove: vi.fn()
      })
    };
    global.requestAnimationFrame = () => {};
    global.window.Chart = vi.fn(function (cv, cfg) {
      this.cfg = cfg;
      this.destroy = vi.fn();
      this.resize = vi.fn();
    });

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');
    const S = global.window.Store;
    S.init();
    S.dispatch('SET_CURRENCY', 'EUR');
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2026-09-01' });
    S.dispatch('ADD_ACCOUNT', { name: 'US Checking', openingBalance: 1000, openingDate: '2026-09-01', currency: 'USD' });
    main = S.getState().accounts.find(a => a.name === 'Main').id;
    us = S.getState().accounts.find(a => a.name === 'US Checking').id;
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 50, accountId: main, categoryId: 'cat_groceries', date: '2026-10-02' });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: us, categoryId: 'cat_groceries', date: '2026-10-02' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const show = () => global.window.Components.ExpandedGraphModal.show(global.window.Store.getState());
  const lastChart = () => {
    const calls = global.window.Chart.mock.calls;
    return calls[calls.length - 1][1];
  };

  it('Select All with a foreign account keeps the € total and explains it', () => {
    global.window.Store.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'monthly', accounts: [main, us], categories: [] });
    show();
    expect(appended.innerHTML).toContain('€1,950.00');
    expect(appended.innerHTML).not.toContain('€2,910.00');
    expect(appended.innerHTML).toContain(CAPTION_ONE);
    const cfg = lastChart();
    expect(cfg.data.datasets.map(d => d.label)).toEqual(['Total Net Balance', 'Main']);
    const tip = cfg.options.plugins.tooltip.callbacks.label({ dataset: cfg.data.datasets[1], parsed: { y: 1950 } });
    expect(tip).toContain('€1,950.00');
  });

  it('the y-axis follows the selection currency', () => {
    global.window.Store.dispatch('SAVE_EXPANDED_GRAPH_FILTERS', { interval: 'monthly', accounts: [us], categories: [] });
    show();
    expect(appended.innerHTML).toContain('$960.00');
    const cfg = lastChart();
    expect(cfg.options.scales.y.ticks.callback(1000).startsWith('$')).toBe(true);
    const tip = cfg.options.plugins.tooltip.callbacks.label({ dataset: cfg.data.datasets[0], parsed: { y: 960 } });
    expect(tip).toContain('$960.00');
  });

  it('the default view shows the caption', () => {
    show();
    expect(appended.innerHTML).toContain('€1,950.00');
    expect(appended.innerHTML).toContain(CAPTION_ONE);
  });

  it('Save View on the untouched default persists []', () => {
    show();
    buttons['#egm-save-filters'].onclick();
    expect(global.window.Store.state.expandedGraphFilters.accounts).toEqual([]);
  });

  it('Save after Select All persists the full list', () => {
    show();
    buttons['#egm-toggle-all-accounts'].onclick();
    buttons['#egm-save-filters'].onclick();
    expect([...global.window.Store.state.expandedGraphFilters.accounts].sort()).toEqual([main, us].sort());
    expect(appended.innerHTML).toContain('€1,950.00');
    expect(appended.innerHTML).toContain(CAPTION_ONE);
  });
});
