import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-04, BUG-05) History summary card.
// BUG-05: Start/End follow Store.getBalanceAtDate (unpaid rows and rows dated
//         before the account's opening date are not counted).
// BUG-04: a category/type/tag filter switches the card to In / Out / Net of the
//         visible rows ("Filtered total"), with the same rule as the day footers.
//         The Tags screen drill-down spans the tag's own rows.

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// The three summary cells, in order: [{ label, value }]
const summaryCells = (html) => {
  const re = /text-transform: uppercase;[^"]*">([^<]*)<\/div>\s*<div style="[^"]*font-variant-numeric: tabular-nums;[^"]*">([^<]*)<\/div>/g;
  return [...html.matchAll(re)].slice(0, 3).map((m) => ({ label: m[1], value: m[2] }));
};

// '-€1,234.50' → -1234.5
const parseMoney = (s) => parseFloat(String(s).replace(/[^0-9.-]/g, ''));

const dayFooterValues = (html) =>
  [...html.matchAll(/class="day-summary-footer"[^>]*>\s*sum: ([^<\s]+)/g)].map((m) => parseMoney(m[1]));

describe('History summary card (1.0.1 BUG-04 / BUG-05)', () => {
  let Store;
  const render = () => global.window.Views.TransactionsView.render(Store.getState());

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));

    global.window = {
      crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2, 11) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      StackdDB: {
        load: (key, def) => def,
        save: vi.fn(),
        generateId: () => 'id-' + Math.random().toString(36).slice(2, 11)
      },
      StackdHydrateIcons: vi.fn(),
      Router: { navigate: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    global.document = {
      getElementById: vi.fn(),
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      body: { appendChild: vi.fn() }
    };

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    Store = global.window.Store;
    Store.init();
    Store.state.currency = 'EUR';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('BUG-05: Start/End use the app-wide balance rule', () => {
    beforeEach(() => {
      // Opened BEFORE the current month: for an account opened this month,
      // computeBalanceForecast folds the opening row into its baseline, so the
      // NET === eomAbsDiff check below holds for this fixture only.
      Store.dispatch('ADD_ACCOUNT', { id: 'acc1', name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
      Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 950, accountId: 'acc1', categoryId: 'cat_rent', date: '2026-10-05' });
      Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: 'acc1', categoryId: 'cat_groceries', date: '2026-10-05', isPaid: false });
    });

    it('excludes unpaid rows from End and Net Change', () => {
      const cells = summaryCells(render());
      expect(cells.map((c) => c.label)).toEqual(['Start', 'End', 'Net Change']);
      expect(cells[0].value).toBe('€1,000.00');
      expect(cells[1].value).toBe('€50.00');
      expect(cells[2].value).toBe('-€950.00');
    });

    it('agrees with getBalanceAtDate(eom) and the Home EOM forecast', () => {
      const cells = summaryCells(render());
      expect(parseMoney(cells[1].value)).toBeCloseTo(Store.getBalanceAtDate('2026-10-31'), 2);
      expect(parseMoney(cells[2].value)).toBeCloseTo(Store.computeBalanceForecast([]).eomAbsDiff, 2);
    });

    it('excludes a row dated before the account opening date from Start', () => {
      Store.dispatch('ADD_TRANSACTION', { type: 'income', amount: 500, accountId: 'acc1', categoryId: 'cat_salary', date: '2025-12-15' });
      const cells = summaryCells(render());
      expect(cells[0].value).toBe('€1,000.00');
      expect(parseMoney(cells[0].value)).toBeCloseTo(Store.getBalanceAtDate('2026-09-30'), 2);
    });

    it('Start counts the last day of the previous period, not the first day of this one', () => {
      Store.dispatch('ADD_TRANSACTION', { type: 'income', amount: 100, accountId: 'acc1', categoryId: 'cat_salary', date: '2026-09-30' });
      Store.dispatch('ADD_TRANSACTION', { type: 'income', amount: 7, accountId: 'acc1', categoryId: 'cat_salary', date: '2026-10-01' });
      const cells = summaryCells(render());
      expect(cells[0].value).toBe('€1,100.00');
      expect(cells[1].value).toBe('€157.00');
    });

    it('an account-only filter keeps Start / End / Net Change', () => {
      Store.state.historyFilters.accounts = ['acc1'];
      const html = render();
      expect(html).not.toContain('Filtered total');
      expect(summaryCells(html).map((c) => c.label)).toEqual(['Start', 'End', 'Net Change']);
    });
  });

  describe('BUG-04: filtered mode (In / Out / Net)', () => {
    beforeEach(() => {
      Store.dispatch('ADD_ACCOUNT', { id: 'acc1', name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
      Store.dispatch('ADD_ACCOUNT', { id: 'acc2', name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
      Store.dispatch('ADD_TRANSACTION', { type: 'income', amount: 200, accountId: 'acc1', categoryId: 'cat_salary', date: '2026-10-02' });
      Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 85.4, accountId: 'acc1', categoryId: 'cat_groceries', date: '2026-10-03', tags: ['food'] });
      Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 950, accountId: 'acc1', categoryId: 'cat_rent', date: '2026-10-05' });
      Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 63.1, accountId: 'acc1', categoryId: 'cat_groceries', date: '2026-10-07', tags: ['food'] });
      // unpaid — visible in the list, never counted
      Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: 'acc1', categoryId: 'cat_groceries', date: '2026-10-08', tags: ['food'], isPaid: false });
      // transfer legs (categoryId '') tagged food — visible, never counted
      Store.dispatch('ADD_TRANSFER', { amount: 25, expenseAccountId: 'acc1', incomeAccountId: 'acc2', date: '2026-10-09', tags: ['food'] });
      // unrelated far-future row (stands in for a materialised recurring member)
      Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 10, accountId: 'acc1', categoryId: 'cat_rent', date: '2031-11-01' });
    });

    it('category filter shows In / Out / Net of the visible rows with a caption', () => {
      Store.state.historyFilters.categories = ['cat_groceries'];
      const html = render();
      expect(html).toContain('Filtered total');
      expect(html).not.toContain('>Start<');
      const cells = summaryCells(html);
      expect(cells.map((c) => c.label)).toEqual(['In', 'Out', 'Net']);
      expect(cells[0].value).toBe('€0.00');
      expect(cells[1].value).toBe('-€148.50'); // 85.40 + 63.10, unpaid 40 excluded
      expect(cells[2].value).toBe('-€148.50');
    });

    it('tag filter leaves the tagged transfer legs and the unpaid row out', () => {
      Store.state.historyFilters.tags = ['food'];
      const html = render();
      const cells = summaryCells(html);
      expect(cells.map((c) => c.label)).toEqual(['In', 'Out', 'Net']);
      expect(cells[0].value).toBe('€0.00');
      expect(cells[1].value).toBe('-€148.50');
      expect(cells[2].value).toBe('-€148.50');
    });

    it('type filter income shows In only', () => {
      Store.state.historyFilters.types = ['income'];
      const cells = summaryCells(render());
      expect(cells[0].value).toBe('€200.00'); // transfer income leg excluded
      expect(cells[1].value).toBe('€0.00');
      expect(cells[2].value).toBe('+€200.00');
    });

    it('an Uncategorized filter that only matches transfer legs reads 0 / 0 / 0', () => {
      Store.state.historyFilters.categories = ['uncategorized'];
      const html = render();
      const cells = summaryCells(html);
      expect(cells.map((c) => c.value)).toEqual(['€0.00', '€0.00', '€0.00']);
      expect(html).toContain('var(--color-balance-val);">€0.00<');
    });

    it('filtered Net equals the sum of the rendered day footers', () => {
      for (const f of [{ categories: ['cat_groceries'] }, { tags: ['food'] }, { types: ['expense'] }, { categories: ['cat_salary', 'cat_rent'] }]) {
        Object.assign(Store.state.historyFilters, { categories: [], types: [], tags: [] }, f);
        const html = render();
        const net = parseMoney(summaryCells(html)[2].value);
        const footers = dayFooterValues(html);
        expect(footers.length).toBeGreaterThan(0);
        expect(net).toBeCloseTo(footers.reduce((a, b) => a + b, 0), 2);
      }
    });

    it('Tags screen drill-down spans the tag\'s own rows, not every transaction', () => {
      let handler = null;
      const row = { dataset: { tagOpen: 'food' }, addEventListener: (ev, fn) => { if (ev === 'click') handler = fn; } };
      const container = { querySelectorAll: (sel) => (sel === '[data-tag-open]' ? [row] : []) };
      global.window.Views.TagsView.attachEvents(container, Store.getState());
      handler();
      const p = Store.state.historyFilters.period;
      expect(p.type).toBe('custom');
      expect(p.start).toBe('2026-10-03');
      expect(p.end).toBe('2026-10-09'); // last tagged row; NOT the 2031 row
      expect(Store.state.historyFilters.tags).toEqual(['food']);
      expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');
    });

    it('Tags drill-down ends today when every tagged row is in the past', () => {
      Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 5, accountId: 'acc1', categoryId: 'cat_groceries', date: '2026-03-02', tags: ['coffee'] });
      let handler = null;
      const row = { dataset: { tagOpen: 'coffee' }, addEventListener: (ev, fn) => { handler = fn; } };
      global.window.Views.TagsView.attachEvents({ querySelectorAll: () => [row] }, Store.getState());
      handler();
      const p = Store.state.historyFilters.period;
      expect(p.start).toBe('2026-03-02');
      expect(p.end).toBe('2026-10-01');
    });
  });
});
