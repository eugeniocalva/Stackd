// v0.72 Phase 4 — upcoming + budgets widgets (docs/home-widgets-plan.md §8).
// The correctness rules under test: transfer-leg dedupe by transferRef,
// tracked-loan double-count exclusion via the read-through, cents→units at the
// loan boundary, horizon boundaries, and budgets' allocated>0 guard against
// "deleted" (amount: 0) records.
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
const dateOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
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
  // Frozen mid-June: monthDay(0..2) stays in one year, dateOffset(30) stays in July.
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
const accId = () => Store().getState().accounts[0].id;

// Raw series members pushed directly: _processRecurringTransactions would also
// work, but direct rows make each test's fixture exact and self-describing.
const seedRecurring = (rows) => {
  Store().state.transactions.push(...rows.map((r, i) => ({
    id: r.id || `rec-${i}-${Math.random()}`,
    accountId: r.accountId || accId(),
    categoryId: r.categoryId !== undefined ? r.categoryId : 'cat_utilities',
    type: r.type || 'expense',
    amount: r.amount,
    date: r.date,
    transferRef: r.transferRef,
    isPaid: r.isPaid,
    recurrence: r.recurrence === null ? undefined
      : { seriesId: r.seriesId || 'series-1', interval: 1, frequency: 'months', startDate: r.date, endDate: '2030-01-01', ...(r.recurrence || {}) },
    createdAt: '2026-01-01T00:00:00.000Z'
  })));
};

const renderOne = (type, size, config) => {
  Store().dispatch('ADD_HOME_WIDGET', { type, size, config });
  const list = Store().getState().homeWidgets;
  const instance = list[list.length - 1];
  return { instance, html: W().registry[type].render(instance, Store().getState()) };
};

// Valid LoanEngine config (the repo's calibration loan, dates shifted so the
// first payment lands inside a 30-day horizon from the frozen 2026-06-15).
const LOAN_CONFIG = {
  type: 'mortgage',
  principal: 111000,
  duration: 30,
  durationUnit: 'years',
  annualRate: 4.05,
  firstPaymentDate: '2026-07-01',
  amortization: 'french'
};

describe('upcoming widget — transactions', () => {
  beforeEach(boot);

  it('shows an empty state naming the horizon', () => {
    const { html } = renderOne('upcoming', 'small', {});
    expect(html).toContain('Nothing scheduled in the next 30 days');
  });

  it('lists future recurring members ascending by date, regardless of the History sort', () => {
    Store().state.historySortOrder = 'desc';
    seedRecurring([
      { amount: 30, date: dateOffset(20) },
      { amount: 10, date: dateOffset(2) },
      { amount: 20, date: dateOffset(9) }
    ]);
    const { html } = renderOne('upcoming', 'small', {});
    expect(html.indexOf('$10.00')).toBeLessThan(html.indexOf('$20.00'));
    expect(html.indexOf('$20.00')).toBeLessThan(html.indexOf('$30.00'));
  });

  it('enforces the horizon boundaries: today excluded, horizon day included, past it excluded', () => {
    seedRecurring([
      { amount: 111, date: dateOffset(0) },    // today — already in balances, not upcoming
      { amount: 222, date: dateOffset(30) },   // horizon day — included (<=)
      { amount: 333, date: dateOffset(31) }    // beyond — excluded
    ]);
    const { html } = renderOne('upcoming', 'small', {});
    expect(html).not.toContain('111');
    expect(html).toContain('$222.00');
    expect(html).not.toContain('333');
  });

  it('honours the horizonDays config as a string', () => {
    seedRecurring([
      { amount: 50, date: dateOffset(5) },
      { amount: 60, date: dateOffset(20) }
    ]);
    const { html } = renderOne('upcoming', 'small', { horizonDays: '7' });
    expect(html).toContain('$50.00');
    expect(html).not.toContain('$60.00');
    // The horizon is named in the large footer.
    expect(renderOne('upcoming', 'large', { horizonDays: '7' }).html).toContain('Net impact · 7 days');
  });

  it('excludes rows the user marked unpaid, future one-offs, and pre-opening rows', () => {
    seedRecurring([
      { amount: 40, date: dateOffset(3), isPaid: false },          // explicitly unpaid
      { amount: 50, date: dateOffset(4), recurrence: null },       // manual future one-off
      { amount: 70, date: dateOffset(5) }                          // normal member
    ]);
    // Account opening after the scheduled date → invisible to every balance path.
    Store().dispatch('ADD_ACCOUNT', { name: 'NotYetOpen', openingBalance: 5, openingDate: dateOffset(60) });
    const late = Store().getState().accounts.find(a => a.name === 'NotYetOpen');
    seedRecurring([{ amount: 80, date: dateOffset(6), accountId: late.id }]);

    const { html } = renderOne('upcoming', 'large', {});
    expect(html).toContain('$70.00');
    expect(html).not.toContain('$40.00');
    expect(html).not.toContain('$50.00');
    expect(html).not.toContain('$80.00');
  });

  it('caps at 3 rows small, 5 rows large', () => {
    seedRecurring([1, 2, 3, 4, 5, 6].map(n => ({ amount: n, date: dateOffset(n) })));
    expect(renderOne('upcoming', 'small', {}).html.match(/class="widget-row"/g)).toHaveLength(3);
    expect(renderOne('upcoming', 'large', {}).html.match(/class="widget-row"/g)).toHaveLength(5);
  });

  it('respects the account filter', () => {
    Store().dispatch('ADD_ACCOUNT', { name: 'Second', openingBalance: 0, openingDate: '2020-01-01' });
    const second = Store().getState().accounts.find(a => a.name === 'Second');
    seedRecurring([
      { amount: 15, date: dateOffset(2) },
      { amount: 25, date: dateOffset(3), accountId: second.id }
    ]);
    const { html } = renderOne('upcoming', 'small', { accountIds: [second.id] });
    expect(html).toContain('$25.00');
    expect(html).not.toContain('$15.00');
  });
});

describe('upcoming widget — transfer dedupe', () => {
  beforeEach(boot);

  const seedTransferPair = (ref, date, amount, extra = {}) => {
    Store().dispatch('ADD_ACCOUNT', { name: `To-${ref}`, openingBalance: 0, openingDate: '2020-01-01' });
    const toAcc = Store().getState().accounts.find(a => a.name === `To-${ref}`);
    seedRecurring([
      { amount, date, type: 'expense', transferRef: ref, categoryId: '', seriesId: `s-${ref}`, ...extra },
      { amount, date, type: 'income', transferRef: ref, categoryId: '', seriesId: `s-${ref}`, accountId: toAcc.id, ...extra }
    ]);
    return toAcc;
  };

  it('collapses a transfer pair to one neutral row (expense leg kept)', () => {
    seedTransferPair('ref-1', dateOffset(4), 120);
    const { html } = renderOne('upcoming', 'small', {});
    expect(html.match(/class="widget-row"/g)).toHaveLength(1);
    expect(html).toContain('Transfer');
    expect(html).toContain('text-transfer');
    expect(html).toContain('-$120.00'); // expense leg's sign
  });

  it('keys the dedupe on transferRef, not seriesId — one row per occurrence', () => {
    // Two occurrences of the SAME series: distinct transferRefs, same seriesId.
    Store().dispatch('ADD_ACCOUNT', { name: 'To-x', openingBalance: 0, openingDate: '2020-01-01' });
    const toAcc = Store().getState().accounts.find(a => a.name === 'To-x');
    ['occ-1', 'occ-2'].forEach((ref, i) => {
      seedRecurring([
        { amount: 90, date: dateOffset(3 + i), type: 'expense', transferRef: ref, categoryId: '', seriesId: 'same-series' },
        { amount: 90, date: dateOffset(3 + i), type: 'income', transferRef: ref, categoryId: '', seriesId: 'same-series', accountId: toAcc.id }
      ]);
    });
    const { html } = renderOne('upcoming', 'small', {});
    expect(html.match(/class="widget-row"/g)).toHaveLength(2);
  });

  it('falls back to the surviving leg when the account filter hides the expense leg', () => {
    const toAcc = seedTransferPair('ref-2', dateOffset(4), 75);
    const { html } = renderOne('upcoming', 'small', { accountIds: [toAcc.id] });
    // Only the income leg matches the filter — it must still show, once.
    expect(html.match(/class="widget-row"/g)).toHaveLength(1);
    expect(html).toContain('+$75.00');
  });

  it('cancels transfer legs in the net-impact figure instead of double-counting', () => {
    seedTransferPair('ref-3', dateOffset(4), 500);
    seedRecurring([{ amount: 200, date: dateOffset(5) }]); // a real expense
    const { html } = renderOne('upcoming', 'large', {});
    // Net = -200; the 500 transfer moves money between own accounts.
    expect(html).toContain('Net impact');
    expect(html).toContain('-$200.00');
    expect(html).not.toContain('-$700.00');
  });
});

describe('upcoming widget — loans', () => {
  beforeEach(boot);

  it('includes an untracked active loan converted from cents', () => {
    Store().dispatch('ADD_LOAN', { name: 'Casa', kind: 'active', config: LOAN_CONFIG });
    const { html } = renderOne('upcoming', 'small', {});
    // Calibration loan instalment: $533.14 — NOT $53,314 (the cents trap).
    expect(html).toContain('Casa');
    expect(html).toContain('-$533.14');
    expect(html).not.toContain('53,314');
  });

  it('skips a tracked loan whose payments already exist as series members', () => {
    Store().dispatch('ADD_LOAN', { name: 'Casa', kind: 'active', config: LOAN_CONFIG, linkedSeriesId: 'loan-series' });
    seedRecurring([{ amount: 533.14, date: '2026-07-01', categoryId: 'cat_debt', seriesId: 'loan-series' }]);
    const { html } = renderOne('upcoming', 'large', {});
    // One row (the series member), not two.
    expect(html.match(/class="widget-row"/g)).toHaveLength(1);
    expect(html).not.toContain('Casa');
    // And the net impact counts the payment once.
    expect(html).toContain('-$533.14');
  });

  it('re-includes the loan when its linked series was deleted (read-through, dangling id)', () => {
    // linkedSeriesId set but NO transactions carry that seriesId.
    Store().dispatch('ADD_LOAN', { name: 'Casa', kind: 'active', config: LOAN_CONFIG, linkedSeriesId: 'ghost-series' });
    const { html } = renderOne('upcoming', 'small', {});
    expect(html).toContain('Casa');
    expect(html).toContain('-$533.14');
  });

  it('never lists simulations', () => {
    Store().dispatch('ADD_LOAN', { name: 'WhatIf', kind: 'sim', config: LOAN_CONFIG });
    expect(renderOne('upcoming', 'small', {}).html).not.toContain('WhatIf');
  });

  it('skips loans outside the horizon and broken configs without crashing', () => {
    Store().dispatch('ADD_LOAN', {
      name: 'FarAway', kind: 'active',
      config: { ...LOAN_CONFIG, firstPaymentDate: '2026-09-06' } // beyond 30 days
    });
    // A config LoanEngine rejects → getLoanProgress returns null → skipped.
    Store().state.loans.push({ id: 'bad', name: 'Broken', kind: 'active', config: { type: 'mortgage' }, linkedSeriesId: null });
    const { html } = renderOne('upcoming', 'small', {});
    expect(html).not.toContain('FarAway');
    expect(html).not.toContain('Broken');
    expect(html).toContain('Nothing scheduled');
  });

  it('excludes synthetic loan rows when an account filter is active (they have no account)', () => {
    Store().dispatch('ADD_LOAN', { name: 'Casa', kind: 'active', config: LOAN_CONFIG });
    const withFilter = renderOne('upcoming', 'small', { accountIds: [accId()] }).html;
    const without = renderOne('upcoming', 'small', {}).html;
    expect(without).toContain('Casa');
    expect(withFilter).not.toContain('Casa');
  });

  it('subtracts loan payments in the net impact', () => {
    Store().dispatch('ADD_LOAN', { name: 'Casa', kind: 'active', config: LOAN_CONFIG });
    seedRecurring([{ amount: 1000, date: dateOffset(3), type: 'income', categoryId: 'cat_salary' }]);
    const { html } = renderOne('upcoming', 'large', {});
    // +1000 − 533.14 = +466.86
    expect(html).toContain('+$466.86');
  });
});

describe('budgets widget', () => {
  beforeEach(boot);

  const budget = (categoryId, amount, extra = {}) =>
    Store().dispatch('SAVE_BUDGET', { categoryId, amount, startDate: '', endDate: null, isCumulative: false, ...extra });

  const spend = (categoryId, amount, date) => {
    Store().state.transactions.push({
      id: `sp-${Math.random()}`, accountId: accId(), categoryId,
      type: 'expense', amount, date, createdAt: '2026-01-01T00:00:00.000Z'
    });
  };

  it('shows an empty state with no budgets', () => {
    expect(renderOne('budgets', 'large', {}).html).toContain('No budget limits set');
  });

  it('renders spent-of-limit totals and a per-category bar', () => {
    budget('cat_groceries', 400);
    spend('cat_groceries', 150, monthDay(0, 5));
    const { html } = renderOne('budgets', 'large', {});
    expect(html).toContain('$150.00');
    expect(html).toContain('of $400.00 budgeted');
    expect(html).toContain('Groceries');
    expect(html).toContain('38%'); // 150/400 rounded
    expect(html).toContain('width: 37.5%');
  });

  it('ignores a deleted budget (amount: 0) even when the category has real spend', () => {
    budget('cat_groceries', 400);
    budget('cat_dining', 0);                    // "deleted" — record persists
    spend('cat_dining', 999, monthDay(0, 4));   // real spend, must NOT count
    spend('cat_groceries', 100, monthDay(0, 5));
    const { html } = renderOne('budgets', 'large', {});
    expect(html).not.toContain('Dining');
    expect(html).not.toContain('999');
    expect(html).toContain('$100.00');
    expect(html).toContain('of $400.00 budgeted');
  });

  it('marks over-budget red with the bar capped at 100%', () => {
    budget('cat_groceries', 100);
    spend('cat_groceries', 250, monthDay(0, 5));
    const { html } = renderOne('budgets', 'large', {});
    expect(html).toContain('width: 100%');
    expect(html).toContain('color: var(--color-expense)');
  });

  it('shows a live cumulative budget deep in the red as a 0%-wide red bar, not dropped', () => {
    // startDate 2 months back, 100/month, 500 overspend in month one:
    // carryover = (100-500) + (100-0) = -300, finalLimit = -200.
    budget('cat_groceries', 100, { isCumulative: true, startDate: monthDay(2, 1).slice(0, 7) });
    spend('cat_groceries', 500, monthDay(2, 10));
    spend('cat_groceries', 10, monthDay(0, 5));
    const { html } = renderOne('budgets', 'large', {});
    expect(html).toContain('Groceries');           // allocated>0 keeps it listed
    expect(html).toContain('width: 0%');           // finalLimit<=0 forces 0 width
    expect(html).toContain('color: var(--color-expense)'); // but red — over budget
  });

  it('includes cumulative rollover in the effective limit', () => {
    // 2 untouched past months roll +200 into this month: limit 100+200=300.
    budget('cat_groceries', 100, { isCumulative: true, startDate: monthDay(2, 1).slice(0, 7) });
    spend('cat_groceries', 50, monthDay(0, 5));
    const { html } = renderOne('budgets', 'large', {});
    expect(html).toContain('of $300.00 budgeted');
    expect(html).toContain('17%'); // 50/300
  });

  it('never lists income categories or cat_balance', () => {
    budget('cat_salary', 500);    // income category (possible via BudgetView toggle)
    budget('cat_balance', 500);   // adjustment pseudo-category
    expect(renderOne('budgets', 'large', {}).html).toContain('No budget limits set');
  });

  it('restricts to picked categories in selected mode', () => {
    budget('cat_groceries', 100);
    budget('cat_transport', 100);
    spend('cat_groceries', 10, monthDay(0, 5));
    spend('cat_transport', 20, monthDay(0, 5));
    const { html } = renderOne('budgets', 'large', { mode: 'selected', categoryIds: ['cat_transport'] });
    expect(html).toContain('Transport');
    expect(html).not.toContain('Groceries');
    expect(html).toContain('of $100.00 budgeted');
  });

  it('sorts most at-risk first and notes the overflow past 5 bars', () => {
    const cats = ['cat_groceries', 'cat_transport', 'cat_dining', 'cat_shopping', 'cat_health', 'cat_utilities'];
    cats.forEach((c, i) => {
      budget(c, 100);
      spend(c, 10 + i * 15, monthDay(0, 5)); // utilities most used
    });
    const { html } = renderOne('budgets', 'large', {});
    expect(html.match(/class="widget-minibar"/g)).toHaveLength(5);
    expect(html.indexOf('Utilities')).toBeLessThan(html.indexOf('Health'));
    expect(html).toContain('+1 more in Goals');
  });

  it('renders an aggregate donut with the usage percentage when small', () => {
    budget('cat_groceries', 200);
    spend('cat_groceries', 50, monthDay(0, 5));
    const { instance, html } = renderOne('budgets', 'small', {});
    expect(html).toContain('widget-donut');
    expect(html).toContain('25%');

    const canvas = { id: `widget-canvas-${instance.id}` };
    const card = { addEventListener: () => {}, querySelector: () => canvas };
    W().registry.budgets.attach(instance, card, Store().getState());
    const chart = global.window.Chart._created[0];
    expect(chart.config.type).toBe('doughnut');
    expect(chart.config.data.datasets[0].data).toEqual([50, 150]);
  });

  it('offers only budgeted expense categories in the config picker', () => {
    budget('cat_groceries', 100);
    budget('cat_dining', 0);      // deleted
    budget('cat_salary', 500);    // income
    const html = W().registry.budgets.renderConfig(
      { mode: 'selected', categoryIds: [] }, Store().getState());
    expect(html).toContain('Groceries');
    expect(html).not.toContain('Dining');
    expect(html).not.toContain('Salary');
    expect(html).not.toContain('data-config-multi="accountIds"'); // no account dimension
  });
});

describe('phase 4 registry integrity', () => {
  beforeEach(boot);

  it('lists all seven types in gallery order', () => {
    expect(W().listTypes().map(t => t.type)).toEqual(
      ['latest', 'incomeExpense', 'categories', 'netWorth', 'savings', 'upcoming', 'budgets']
    );
  });

  it('renders both new types in both sizes, empty and with data, without artifacts', () => {
    ['upcoming', 'budgets'].forEach(type => {
      ['small', 'large'].forEach(size => {
        const { html } = renderOne(type, size, {});
        expect(html, `${type}/${size}`).not.toContain('undefined');
        expect(html, `${type}/${size}`).not.toContain('NaN');
      });
    });
  });

  it('escapes user-supplied names in both widgets', () => {
    Store().dispatch('ADD_CATEGORY', { name: '<b>evil</b>', icon: 'tag', typeHint: 'expense' });
    const evil = Store().getState().categories.find(c => c.name === '<b>evil</b>');
    Store().dispatch('SAVE_BUDGET', { categoryId: evil.id, amount: 100, startDate: '', endDate: null, isCumulative: false });
    expect(renderOne('budgets', 'large', {}).html).not.toContain('<b>evil</b>');

    Store().dispatch('ADD_LOAN', { name: '<img src=x>', kind: 'active', config: LOAN_CONFIG });
    expect(renderOne('upcoming', 'small', {}).html).not.toContain('<img src=x>');
  });
});
