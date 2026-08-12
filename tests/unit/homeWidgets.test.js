// v0.72 Phase 1 — home dashboard widgets (docs/home-widgets-plan.md §8).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Real in-memory localStorage: these tests assert persistence round-trips, so a
// no-op mock would pass while the slice never actually reached disk.
const makeLocalStorage = () => {
  const map = new Map();
  return {
    _map: map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
};

const pad = (n) => String(n).padStart(2, '0');
const dateOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

let uuidCounter = 0;

const bootStore = (opts = {}) => {
  uuidCounter = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuidCounter}` },
    localStorage: makeLocalStorage()
  };
  global.localStorage = global.window.localStorage;
  // Deliberately-empty widget area by default: an ABSENT key triggers the
  // v0.72 Phase 5 upgrade seed (tested explicitly below), which would shift
  // every count in this file by one.
  if (!opts.freshInstall) {
    global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
  }

  // Same order as index.html; widgets.js sits after store.js.
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('widgets.js');
  global.window.Store.init();
};

const Store = () => global.window.Store;
const stored = () => JSON.parse(global.window.localStorage.getItem('stackd_v1_homeWidgets'));

describe('Home widgets — store slice', () => {
  beforeEach(bootStore);

  it('stays empty when the user deliberately emptied the widget area', () => {
    // Key present as [] — the seed must NOT fire.
    expect(Store().getState().homeWidgets).toEqual([]);
    expect(stored()).toEqual([]);
  });

  describe('v0.72 Phase 5 upgrade seed', () => {
    it('seeds a large latest widget when the key has never existed', () => {
      bootStore({ freshInstall: true });
      const widgets = Store().getState().homeWidgets;
      expect(widgets).toHaveLength(1);
      expect(widgets[0]).toMatchObject({ type: 'latest', size: 'large' });
      // Persisted immediately — the migration is one-shot.
      expect(stored()).toHaveLength(1);
    });

    it('leaves an existing configuration untouched', () => {
      Store().dispatch('ADD_HOME_WIDGET', { type: 'categories' });
      const before = stored();

      // Re-boot against the SAME storage object, as a reload would.
      const carried = global.window.localStorage;
      global.window = {
        crypto: { randomUUID: () => `uuid-${++uuidCounter}` },
        localStorage: carried
      };
      global.localStorage = carried;
      executeFile('db.js');
      executeFile('i18n.js');
      executeFile('i18n/en.js');
      executeFile('loan-engine.js');
      executeFile('store.js');
      executeFile('widgets.js');
      global.window.Store.init();

      expect(JSON.parse(carried.getItem('stackd_v1_homeWidgets'))).toEqual(before);
      expect(global.window.Store.getState().homeWidgets).toEqual(before);
    });

    it('re-seeds after RESET_APP (reset = fresh-install experience)', () => {
      Store().dispatch('ADD_HOME_WIDGET', { type: 'categories' });
      Store().dispatch('RESET_APP');
      expect(Store().getState().homeWidgets).toHaveLength(1);
      expect(Store().getState().homeWidgets[0].type).toBe('latest');
      expect(stored()[0].type).toBe('latest');
    });
  });

  it('adds a widget with defaults and persists it', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });

    const widgets = Store().getState().homeWidgets;
    expect(widgets).toHaveLength(1);
    expect(widgets[0]).toMatchObject({ type: 'latest', size: 'small', config: {} });
    expect(widgets[0].id).toBeTruthy();
    expect(widgets[0].createdAt).toBeTruthy();
    expect(stored()).toHaveLength(1);
  });

  it('honours an explicit large size and config', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest', size: 'large', config: { foo: 1 } });
    expect(Store().getState().homeWidgets[0]).toMatchObject({ size: 'large', config: { foo: 1 } });
  });

  it('ignores an add with no type', () => {
    Store().dispatch('ADD_HOME_WIDGET', {});
    Store().dispatch('ADD_HOME_WIDGET', null);
    expect(Store().getState().homeWidgets).toEqual([]);
  });

  it('reloads the persisted slice on init', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest', size: 'large' });
    const saved = global.window.localStorage._map;

    // Re-boot against the same storage, as a page reload would.
    const carried = new Map(saved);
    global.window = {
      crypto: { randomUUID: () => `uuid-${++uuidCounter}` },
      localStorage: makeLocalStorage()
    };
    carried.forEach((v, k) => global.window.localStorage.setItem(k, v));
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    global.window.Store.init();

    expect(global.window.Store.getState().homeWidgets).toHaveLength(1);
    expect(global.window.Store.getState().homeWidgets[0].size).toBe('large');
  });

  describe('UPDATE_HOME_WIDGET', () => {
    beforeEach(() => {
      Store().dispatch('ADD_HOME_WIDGET', { type: 'latest', config: { a: 1, b: 2 } });
    });

    it('changes size', () => {
      const id = Store().getState().homeWidgets[0].id;
      Store().dispatch('UPDATE_HOME_WIDGET', { id, size: 'large' });
      expect(Store().getState().homeWidgets[0].size).toBe('large');
      expect(stored()[0].size).toBe('large');
    });

    it('merges config rather than replacing it', () => {
      const id = Store().getState().homeWidgets[0].id;
      Store().dispatch('UPDATE_HOME_WIDGET', { id, config: { b: 99, c: 3 } });
      expect(Store().getState().homeWidgets[0].config).toEqual({ a: 1, b: 99, c: 3 });
    });

    it('ignores an invalid size', () => {
      const id = Store().getState().homeWidgets[0].id;
      Store().dispatch('UPDATE_HOME_WIDGET', { id, size: 'gigantic' });
      expect(Store().getState().homeWidgets[0].size).toBe('small');
    });

    it('is a no-op for an unknown id', () => {
      Store().dispatch('UPDATE_HOME_WIDGET', { id: 'nope', size: 'large' });
      expect(Store().getState().homeWidgets[0].size).toBe('small');
    });
  });

  describe('REMOVE_HOME_WIDGET', () => {
    it('removes the matching widget and persists', () => {
      Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
      Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
      const id = Store().getState().homeWidgets[0].id;

      Store().dispatch('REMOVE_HOME_WIDGET', { id });

      expect(Store().getState().homeWidgets).toHaveLength(1);
      expect(Store().getState().homeWidgets[0].id).not.toBe(id);
      expect(stored()).toHaveLength(1);
    });

    it('is a no-op for an unknown id', () => {
      Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
      Store().dispatch('REMOVE_HOME_WIDGET', { id: 'nope' });
      expect(Store().getState().homeWidgets).toHaveLength(1);
    });
  });

  describe('REORDER_HOME_WIDGETS', () => {
    let ids;
    beforeEach(() => {
      Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
      Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
      Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
      ids = Store().getState().homeWidgets.map(w => w.id);
    });

    it('applies a valid permutation', () => {
      const next = [ids[2], ids[0], ids[1]];
      Store().dispatch('REORDER_HOME_WIDGETS', { orderedIds: next });
      expect(Store().getState().homeWidgets.map(w => w.id)).toEqual(next);
      expect(stored().map(w => w.id)).toEqual(next);
    });

    it('rejects a short list rather than dropping widgets', () => {
      Store().dispatch('REORDER_HOME_WIDGETS', { orderedIds: [ids[1], ids[0]] });
      expect(Store().getState().homeWidgets.map(w => w.id)).toEqual(ids);
    });

    it('rejects duplicate ids', () => {
      Store().dispatch('REORDER_HOME_WIDGETS', { orderedIds: [ids[0], ids[0], ids[1]] });
      expect(Store().getState().homeWidgets.map(w => w.id)).toEqual(ids);
    });

    it('rejects an id set that does not match the current widgets', () => {
      Store().dispatch('REORDER_HOME_WIDGETS', { orderedIds: [ids[0], ids[1], 'ghost'] });
      expect(Store().getState().homeWidgets.map(w => w.id)).toEqual(ids);
    });

    it('rejects a non-array payload', () => {
      Store().dispatch('REORDER_HOME_WIDGETS', { orderedIds: 'nope' });
      expect(Store().getState().homeWidgets.map(w => w.id)).toEqual(ids);
    });
  });

  describe('edit mode', () => {
    it('toggles and accepts an explicit boolean', () => {
      expect(Store().getState().widgetEditMode).toBe(false);
      Store().dispatch('TOGGLE_WIDGET_EDIT_MODE');
      expect(Store().getState().widgetEditMode).toBe(true);
      Store().dispatch('TOGGLE_WIDGET_EDIT_MODE');
      expect(Store().getState().widgetEditMode).toBe(false);
      Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
      expect(Store().getState().widgetEditMode).toBe(true);
    });

    it('is never persisted', () => {
      Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
      expect(global.window.localStorage.getItem('stackd_v1_widgetEditMode')).toBeNull();
    });

    it('clears when navigating away from the dashboard', () => {
      Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
      Store().dispatch('SET_VIEW', 'transactions');
      expect(Store().getState().widgetEditMode).toBe(false);
    });

    it('survives a SET_VIEW back to the dashboard itself', () => {
      Store().dispatch('SET_VIEW', 'transactions');
      Store().dispatch('SET_VIEW', 'dashboard');
      Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
      Store().dispatch('SET_VIEW', 'dashboard');
      expect(Store().getState().widgetEditMode).toBe(true);
    });
  });

  it('drops the user configuration on RESET_APP, back to the fresh-install seed', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'categories' });
    Store().dispatch('ADD_HOME_WIDGET', { type: 'netWorth' });
    Store().dispatch('RESET_APP');
    // v0.72 Phase 5: reset = fresh install = the seeded latest widget, since
    // Recent Activities no longer exists outside the widget area.
    expect(Store().getState().homeWidgets).toHaveLength(1);
    expect(Store().getState().homeWidgets[0].type).toBe('latest');
    expect(stored()).toHaveLength(1);
  });
});

describe('Home widgets — section render', () => {
  beforeEach(bootStore);

  const render = () => global.window.Widgets.renderSection(Store().getState());

  it('renders the empty CTA when there are no widgets', () => {
    const html = render();
    expect(html).toContain('btn-widgets-add-empty');
    expect(html).toContain('Add your first widget');
    expect(html).not.toContain('widgets-grid');
    expect(html).not.toContain('btn-widgets-edit');
  });

  it('renders a grid and the Edit button once a widget exists', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
    const html = render();
    expect(html).toContain('widgets-grid');
    expect(html).toContain('btn-widgets-edit');
    expect(html).toContain('Latest transactions');
    expect(html).not.toContain('btn-widgets-add-empty');
  });

  it('marks large widgets so they span the full row', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest', size: 'large' });
    expect(render()).toContain('widget-card--large');
  });

  it('shows edit chrome only in edit mode', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
    expect(render()).not.toContain('data-widget-action="remove"');

    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    const html = render();
    expect(html).toContain('data-widget-action="remove"');
    expect(html).toContain('data-widget-action="move-up"');
    expect(html).toContain('data-widget-action="toggle-size"');
  });

  it('disables the move arrows at the ends of the list', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest' });
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    const html = render();
    // First card: up disabled. Last card: down disabled. One each.
    expect(html.match(/data-widget-action="move-up"[^>]*disabled/g)).toHaveLength(1);
    expect(html.match(/data-widget-action="move-down"[^>]*disabled/g)).toHaveLength(1);
  });

  it('renders a placeholder instead of throwing for an unknown widget type', () => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'from-the-future' });
    const html = render();
    expect(html).toContain('Unavailable');
    expect(html).toContain('not supported in this version');
  });

  it('contains a failing widget instead of taking the dashboard down', () => {
    global.window.Widgets.registry.boom = {
      title: 'Boom', description: 'x', icon: 'zap', sizes: ['small'], hasConfig: false,
      render() { throw new Error('kaboom'); }
    };
    Store().dispatch('ADD_HOME_WIDGET', { type: 'boom' });
    expect(() => render()).not.toThrow();
    expect(render()).toContain('Could not load this widget');
    delete global.window.Widgets.registry.boom;
  });
});

describe('Home widgets — latest transactions widget', () => {
  beforeEach(() => {
    bootStore();
    Store().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 500 });
  });

  const seed = (txs) => {
    const accId = Store().getState().accounts[0].id;
    Store().state.transactions.push(...txs.map((t, i) => ({
      id: `tx-${i}`,
      accountId: accId,
      categoryId: 'cat_groceries',
      type: 'expense',
      amount: 10,
      ...t
    })));
  };

  const renderLatest = (size = 'small') => {
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest', size });
    return global.window.Widgets.renderSection(Store().getState());
  };

  it('shows an empty state when there is nothing to show', () => {
    // The account seed creates only an opening_balance row, which is excluded.
    expect(renderLatest()).toContain('No transactions yet');
  });

  it('excludes future-dated (scheduled) transactions', () => {
    seed([
      { id: 'past', date: dateOffset(-1), amount: 11 },
      { id: 'future', date: dateOffset(30), amount: 999 }
    ]);
    const html = renderLatest();
    expect(html).toContain('11.00');
    expect(html).not.toContain('999.00');
  });

  it('sorts newest first and caps at 3 rows when small', () => {
    seed([
      { id: 'a', date: dateOffset(-4), amount: 1 },
      { id: 'b', date: dateOffset(-3), amount: 2 },
      { id: 'c', date: dateOffset(-2), amount: 3 },
      { id: 'd', date: dateOffset(-1), amount: 4 }
    ]);
    const html = renderLatest('small');
    expect(html.match(/class="widget-row"/g)).toHaveLength(3);
    // Oldest of the four is dropped; newest appears first.
    expect(html).not.toContain('1.00');
    expect(html.indexOf('4.00')).toBeLessThan(html.indexOf('2.00'));
  });

  it('shows up to 5 rows and a subtitle when large', () => {
    seed([1, 2, 3, 4, 5, 6].map((n, i) => ({ id: `t${n}`, date: dateOffset(-n), amount: n })));
    const html = renderLatest('large');
    expect(html.match(/class="widget-row"/g)).toHaveLength(5);
    expect(html).toContain('widget-row-sub');
    expect(html).toContain('Main');
  });

  it('signs and colours income and expense differently', () => {
    seed([
      { id: 'inc', date: dateOffset(-1), type: 'income', categoryId: 'cat_salary', amount: 100 },
      { id: 'exp', date: dateOffset(-2), type: 'expense', amount: 20 }
    ]);
    const html = renderLatest();
    expect(html).toContain('text-income');
    expect(html).toContain('text-expense');
    expect(html).toContain('+$100.00');
    expect(html).toContain('-$20.00');
  });

  it('escapes user-supplied text', () => {
    Store().dispatch('ADD_CATEGORY', { name: '<img src=x onerror=alert(1)>', icon: 'tag', typeHint: 'expense' });
    const evilCat = Store().getState().categories.find(c => c.name.startsWith('<img'));
    seed([{ id: 'evil', date: dateOffset(-1), categoryId: evilCat.id }]);
    const html = renderLatest();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
