// v0.85 (docs/refactor-plan.md P7) — analytics category → tag drilldown.
// Covers the new tags clause in getFilteredTransactions (additive, guarded,
// '__untagged__' sentinel) and computeCategoryTagBreakdown.
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

let uuid = 0;

const boot = () => {
  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} })
  };
  global.localStorage = global.window.localStorage;
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');

  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  global.window.Store.init();
  global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2020-01-01' });
};

const Store = () => global.window.Store;

// A fixed period so the tests never depend on "today".
const PERIOD = { type: 'custom', value: '', start: '2026-08-01', end: '2026-08-31' };
const filters = (over = {}) => ({
  period: PERIOD, types: [], accounts: [], categories: [], tags: [], sortOrder: 'desc', ...over
});

const seed = (rows) => {
  const accId = Store().getState().accounts[0].id;
  Store().state.transactions.push(...rows.map((r, i) => ({
    id: `tx-${i}-${Math.random()}`,
    accountId: accId,
    categoryId: r.categoryId === undefined ? 'cat_rent' : r.categoryId, // '' = uncategorized
    type: r.type || 'expense',
    amount: r.amount,
    date: r.date || '2026-08-10',
    tags: r.tags,
    createdAt: '2026-01-01T00:00:00.000Z'
  })));
};

describe('tag filtering in getFilteredTransactions', () => {
  beforeEach(boot);

  it('matches everything when tags is empty, missing, or not an array', () => {
    seed([
      { amount: 10, tags: ['amazon'] },
      { amount: 20 }
    ]);
    expect(Store().getFilteredTransactions('history', filters()).length).toBe(2);

    const noKey = filters();
    delete noKey.tags; // older persisted filter objects predate the key
    expect(Store().getFilteredTransactions('history', noKey).length).toBe(2);

    expect(Store().getFilteredTransactions('history', filters({ tags: null })).length).toBe(2);
  });

  it('keeps only transactions carrying one of the selected tags', () => {
    seed([
      { amount: 10, tags: ['amazon'] },
      { amount: 20, tags: ['electricity'] },
      { amount: 30, tags: ['amazon', 'gift'] },
      { amount: 40 }
    ]);
    const res = Store().getFilteredTransactions('history', filters({ tags: ['amazon'] }));
    expect(res.map(t => t.amount).sort((a, b) => a - b)).toEqual([10, 30]);

    const multi = Store().getFilteredTransactions('history', filters({ tags: ['amazon', 'electricity'] }));
    expect(multi.length).toBe(3);
  });

  it("'__untagged__' matches transactions with no tags (missing or empty array)", () => {
    seed([
      { amount: 10, tags: ['amazon'] },
      { amount: 20, tags: [] },
      { amount: 30 }
    ]);
    const res = Store().getFilteredTransactions('history', filters({ tags: ['__untagged__'] }));
    expect(res.map(t => t.amount).sort((a, b) => a - b)).toEqual([20, 30]);
  });

  it('combines with the category filter (the drilldown handoff)', () => {
    seed([
      { amount: 10, categoryId: 'cat_rent', tags: ['electricity'] },
      { amount: 20, categoryId: 'cat_groceries', tags: ['electricity'] },
      { amount: 30, categoryId: 'cat_rent', tags: ['credito'] }
    ]);
    const res = Store().getFilteredTransactions('history', filters({ categories: ['cat_rent'], tags: ['electricity'] }));
    expect(res.map(t => t.amount)).toEqual([10]);
  });

  it('CLEAR_ALL_FILTERS resets the tag filter', () => {
    Store().state.historyFilters.tags = ['amazon'];
    Store().dispatch('CLEAR_ALL_FILTERS', { page: 'history' });
    expect(Store().getState().historyFilters.tags).toEqual([]);
  });
});

describe('computeCategoryTagBreakdown', () => {
  beforeEach(boot);

  it('groups a category by tag, sorted by amount, with counts and percentages', () => {
    seed([
      { amount: 460, categoryId: 'cat_rent', tags: ['credito'] },
      { amount: 74, categoryId: 'cat_rent', tags: ['electricity'] },
      { amount: 26, categoryId: 'cat_rent', tags: ['electricity'] },
      { amount: 999, categoryId: 'cat_groceries', tags: ['credito'] } // other category
    ]);
    const res = Store().computeCategoryTagBreakdown(filters(), 'expense', 'cat_rent');

    expect(res.total).toBe(560);
    expect(res.count).toBe(3);
    expect(res.rows.map(r => r.tag)).toEqual(['credito', 'electricity']);
    expect(res.rows[0]).toMatchObject({ amount: 460, count: 1 });
    expect(res.rows[1]).toMatchObject({ amount: 100, count: 2 });
    expect(Math.round(res.rows[0].percentage)).toBe(82);
  });

  it('puts untagged transactions in a trailing __untagged__ bucket, omitted when empty', () => {
    seed([
      { amount: 100, categoryId: 'cat_rent', tags: ['credito'] },
      { amount: 50, categoryId: 'cat_rent' },
      { amount: 25, categoryId: 'cat_rent', tags: [] }
    ]);
    const res = Store().computeCategoryTagBreakdown(filters(), 'expense', 'cat_rent');
    const last = res.rows[res.rows.length - 1];
    expect(last.tag).toBe('__untagged__');
    expect(last.isUntagged).toBe(true);
    expect(last.amount).toBe(75);
    expect(last.count).toBe(2);

    boot();
    seed([{ amount: 100, categoryId: 'cat_rent', tags: ['credito'] }]);
    const tagged = Store().computeCategoryTagBreakdown(filters(), 'expense', 'cat_rent');
    expect(tagged.rows.some(r => r.isUntagged)).toBe(false);
  });

  it('counts a multi-tag transaction once per tag (documented overlap)', () => {
    seed([{ amount: 100, categoryId: 'cat_rent', tags: ['a', 'b'] }]);
    const res = Store().computeCategoryTagBreakdown(filters(), 'expense', 'cat_rent');
    expect(res.total).toBe(100); // the category total single-counts
    expect(res.rows.reduce((s, r) => s + r.amount, 0)).toBe(200); // tag rows overlap
    expect(res.rows.every(r => r.count === 1)).toBe(true);
  });

  it('honours the income lens and the uncategorized pseudo-category', () => {
    seed([
      { amount: 900, type: 'income', categoryId: 'cat_salary', tags: ['bonus'] },
      { amount: 40, categoryId: '', tags: ['misc'] }
    ]);
    const income = Store().computeCategoryTagBreakdown(filters(), 'income', 'cat_salary');
    expect(income.rows[0]).toMatchObject({ tag: 'bonus', amount: 900 });

    const uncat = Store().computeCategoryTagBreakdown(filters(), 'expense', 'uncategorized');
    expect(uncat.rows[0]).toMatchObject({ tag: 'misc', amount: 40 });
  });

  it('inherits the analytics exclusions (unpaid, transfers, adjustments)', () => {
    seed([
      { amount: 100, categoryId: 'cat_rent', tags: ['keep'] },
      { amount: 200, categoryId: 'cat_rent', tags: ['unpaid'] },
      { amount: 300, categoryId: 'cat_balance', tags: ['adjust'] }
    ]);
    Store().state.transactions.find(t => t.amount === 200).isPaid = false;
    Store().state.transactions.push({
      id: 'tx-transfer-leg', accountId: Store().getState().accounts[0].id,
      categoryId: 'cat_rent', type: 'expense', amount: 400, date: '2026-08-12',
      tags: ['moved'], transferRef: 'pair-1', createdAt: '2026-01-01T00:00:00.000Z'
    });

    const res = Store().computeCategoryTagBreakdown(filters(), 'expense', 'cat_rent');
    expect(res.rows.map(r => r.tag)).toEqual(['keep']);
    expect(res.total).toBe(100);
  });

  it('returns an empty shape for a category with nothing in the period', () => {
    const res = Store().computeCategoryTagBreakdown(filters(), 'expense', 'cat_rent');
    expect(res).toEqual({ total: 0, count: 0, rows: [] });
  });
});
