import { describe, it, expect, beforeEach, vi } from 'vitest';
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
});
