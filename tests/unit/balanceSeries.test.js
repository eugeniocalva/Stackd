// 1.2.0 (UX-1): Store.computeBalanceSeries — the Home curve for the range
// chips 1W/1M/6M/YTD/1Y/Max. One running-sum pass over the rows the
// aggregate rule keeps (same rows and sign as getBalanceAtDate), cutoffs
// clamped to today, '1y' identical to computeGraphBalances' monthly series.
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

let uid = 0;
const boot = (now = new Date(2026, 5, 15, 12)) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const localStorage = makeLocalStorage();
  localStorage.setItem('stackd_v1_homeWidgets', '[]');
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage,
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: { documentElement: { setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} } } }
  };
  global.localStorage = localStorage;
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  const S = global.window.Store;
  S.init();
  S.dispatch('SET_CURRENCY', 'EUR');
  return S;
};

const accId = (S, name) => S.getState().accounts.find(a => a.name === name).id;

// A Main account (EUR) with a year and a half of activity, plus future
// rows (a materialised recurring tail) the curve must never count.
const seed = (S) => {
  S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2025-01-01' });
  const main = accId(S, 'Main');
  const add = (type, amount, date, extra = {}) =>
    S.dispatch('ADD_TRANSACTION', { type, amount, accountId: main, categoryId: type === 'income' ? 'cat_salary' : 'cat_groceries', date, ...extra });
  // monthly salary + a few expenses, Jan 2025 → Jul 2026 (future rows included)
  for (let y = 2025; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 7) break;
      const mm = String(m).padStart(2, '0');
      add('income', 2000, `${y}-${mm}-01`);
      add('expense', 123.45, `${y}-${mm}-09`);
      add('expense', 61.1, `${y}-${mm}-17`);
      add('expense', 0.1, `${y}-${mm}-24`);
    }
  }
  // the last days, so the 1W/1M curves move
  add('expense', 40, '2026-06-10');
  add('expense', 15.5, '2026-06-13');
  add('income', 300, '2026-06-14');
  add('expense', 999, '2026-06-16'); // tomorrow: never on the curve
  return main;
};

describe('computeBalanceSeries — shapes per range (today 2026-06-15)', () => {
  let S;
  beforeEach(() => { S = boot(); seed(S); });
  afterEach(() => vi.useRealTimers());

  const series = (range, o = {}) => S.computeBalanceSeries({ range, ...o });

  it('1w: 7 daily points ending today, weekday ticks', () => {
    const s = series('1w');
    expect(s.range).toBe('1w');
    expect(s.points).toHaveLength(7);
    expect(s.points.map(p => p.date)).toEqual(
      ['2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15']);
    expect(s.points.map(p => p.x)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.tickLabels).toHaveLength(7);
    expect(s.tickLabels[6]).toBe(new Date(2026, 5, 15, 12).toLocaleDateString('en-US', { weekday: 'short' }));
    expect(s.points[6].fullLabel).toBe(new Date(2026, 5, 15, 12).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    expect(s.start).toBe('2026-06-09');
    expect(s.end).toBe('2026-06-15');
  });

  it('1m: 30 daily points, a tick every 7th day anchored on today', () => {
    const s = series('1m');
    expect(s.points).toHaveLength(30);
    expect(s.points[0].date).toBe('2026-05-17');
    expect(s.points[29].date).toBe('2026-06-15');
    const ticked = s.tickLabels.map((t, i) => (t ? i : -1)).filter(i => i >= 0);
    expect(ticked).toEqual([1, 8, 15, 22, 29]);
    expect(s.tickLabels[29]).toBe('15');
  });

  it('6m: 26 weekly points, a tick at the first point of each month', () => {
    const s = series('6m');
    expect(s.points).toHaveLength(26);
    expect(s.points[25].date).toBe('2026-06-15');
    expect(s.points[24].date).toBe('2026-06-08');
    expect(s.points[0].date).toBe('2025-12-22');
    const ticks = s.tickLabels.filter(Boolean);
    expect(ticks).toEqual(['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
  });

  it('ytd: weekly points from Jan 1 plus today', () => {
    const s = series('ytd');
    expect(s.points[0].date).toBe('2026-01-01');
    expect(s.points[1].date).toBe('2026-01-08');
    expect(s.points[s.points.length - 1].date).toBe('2026-06-15');
    expect(s.points[s.points.length - 2].date).toBe('2026-06-11');
    expect(s.points).toHaveLength(25);
    expect(s.tickLabels.filter(Boolean)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
  });

  it('1y: the 12 points of computeGraphBalances monthly (labels, x and balances)', () => {
    const s = series('1y');
    const g = S.computeGraphBalances({ interval: 'monthly' });
    expect(s.points).toHaveLength(12);
    expect(s.tickLabels).toEqual(g.monthLabels);
    s.points.forEach((p, i) => {
      expect(p.x).toBe(g.points[i].x);
      expect(p.label).toBe(g.points[i].label);
      expect(p.fullLabel).toBe(g.points[i].fullLabel);
      expect(p.balance).toBeCloseTo(g.points[i].balance, 2);
      expect(p.y).toBe(p.balance);
    });
    expect(s.points[11].date).toBe('2026-06-15'); // clamped to today
    expect(s.points[0].date).toBe('2025-07-31');
  });

  it('max: monthly from the earliest row, at most 12 tick labels, the last one this month', () => {
    const s = series('max');
    expect(s.points[0].date).toBe('2025-01-31');
    expect(s.points[s.points.length - 1].date).toBe('2026-06-15');
    expect(s.points).toHaveLength(18);
    const ticks = s.tickLabels.filter(Boolean);
    expect(ticks.length).toBeLessThanOrEqual(12);
    expect(s.tickLabels[s.points.length - 1]).toBe(
      new Date(2026, 5, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
  });

  it('an unknown range falls back to 1y', () => {
    expect(series('5d').range).toBe('1y');
    expect(series('5d').points).toHaveLength(12);
  });

  it('baseline is the first point; every cutoff is clamped to today', () => {
    ['1w', '1m', '6m', 'ytd', '1y', 'max'].forEach(r => {
      const s = series(r);
      expect(s.baseline).toBe(s.points[0].balance);
      s.points.forEach(p => expect(p.date <= '2026-06-15').toBe(true));
      expect(s.end).toBe('2026-06-15');
    });
  });

  it('the last point of every range is today\'s balance — tomorrow\'s row is not on it', () => {
    const today = S.getBalanceAtDate('2026-06-15');
    expect(S.getBalanceAtDate('2026-06-16')).toBeCloseTo(today - 999, 2);
    ['1w', '1m', '6m', 'ytd', '1y', 'max'].forEach(r => {
      const s = series(r);
      expect(s.points[s.points.length - 1].balance).toBeCloseTo(today, 2);
    });
  });

  it('the running sum equals getBalanceAtDate at three random cutoffs', () => {
    // deterministic "random" picks across three ranges
    let seedN = 7;
    const rnd = (n) => { seedN = (seedN * 9301 + 49297) % 233280; return Math.floor((seedN / 233280) * n); };
    ['1m', '6m', 'max'].forEach(r => {
      const s = series(r);
      const p = s.points[rnd(s.points.length)];
      expect(p.balance).toBeCloseTo(S.getBalanceAtDate(p.date), 2);
    });
    const ytd = series('ytd');
    [3, 11, 19].forEach(i => expect(ytd.points[i].balance).toBeCloseTo(S.getBalanceAtDate(ytd.points[i].date), 2));
  });

  it('never calls getBalanceAtDate (one pass)', () => {
    const spy = vi.spyOn(S, 'getBalanceAtDate');
    ['1w', '1m', '6m', 'ytd', '1y', 'max'].forEach(r => series(r));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a flat line stays exactly flat (cents rounding, no float noise)', () => {
    const s = series('1w', { categoryIds: ['cat_rent'] }); // only uncategorised rows pass
    const last = s.points[s.points.length - 1].balance;
    expect(last).toBe(s.baseline);
  });
});

describe('computeBalanceSeries — the aggregate rule', () => {
  afterEach(() => vi.useRealTimers());

  it('a row dated before its account\'s opening date is excluded', () => {
    const S = boot();
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 500, openingDate: '2026-06-01' });
    const main = accId(S, 'Main');
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 80, accountId: main, categoryId: 'cat_groceries', date: '2026-05-20' });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 20, accountId: main, categoryId: 'cat_groceries', date: '2026-06-05' });
    const s = S.computeBalanceSeries({ range: '1m' });
    expect(s.points[s.points.length - 1].balance).toBe(480);
    const may25 = s.points.find(p => p.date === '2026-05-25');
    expect(may25.balance).toBe(0);
    expect(S.getBalanceAtDate('2026-06-15')).toBe(480);
  });

  it('a foreign-currency account is excluded under [] (exclude, never convert)', () => {
    const S = boot();
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2026-01-01' });
    S.dispatch('ADD_ACCOUNT', { name: 'US Checking', openingBalance: 1000, openingDate: '2026-01-01', currency: 'USD' });
    const us = accId(S, 'US Checking');
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: us, categoryId: 'cat_groceries', date: '2026-06-02' });
    const all = S.computeBalanceSeries({ range: '1y' });
    expect(all.points[11].balance).toBe(2000);
    const usOnly = S.computeBalanceSeries({ range: '1y', accountIds: [us] });
    expect(usOnly.points[11].balance).toBe(960);
  });

  it('unpaid rows are excluded; rows without a category pass a category filter', () => {
    const S = boot();
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
    const main = accId(S, 'Main');
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 30, accountId: main, categoryId: 'cat_groceries', date: '2026-06-03', isPaid: false });
    S.dispatch('ADD_TRANSACTION', { type: 'income', amount: 50, accountId: main, categoryId: 'cat_salary', date: '2026-06-04' });
    expect(S.computeBalanceSeries({ range: '1w' }).points[6].balance).toBe(150);
    // cat_groceries filter: the salary is out, the opening balance (cat_balance) is out
    const groc = S.computeBalanceSeries({ range: '1m', categoryIds: ['cat_groceries'] });
    expect(groc.points[29].balance).toBeCloseTo(S.getBalanceAtDate('2026-06-15', [], ['cat_groceries']), 2);
  });

  it('an empty install yields flat zero points for every range', () => {
    const S = boot();
    ['1w', '1m', '6m', 'ytd', '1y', 'max'].forEach(r => {
      const s = S.computeBalanceSeries({ range: r });
      expect(s.points.length).toBeGreaterThanOrEqual(2);
      expect(s.points.every(p => p.balance === 0)).toBe(true);
    });
    expect(S.computeBalanceSeries({ range: 'max' }).points).toHaveLength(12);
  });
});

describe('computeBalanceSeries — January YTD and short Max', () => {
  afterEach(() => vi.useRealTimers());

  it('a January run shows daily points from Jan 1', () => {
    const S = boot(new Date(2026, 0, 10, 12));
    const s = S.computeBalanceSeries({ range: 'ytd' });
    expect(s.points).toHaveLength(10);
    expect(s.points[0].date).toBe('2026-01-01');
    expect(s.points[9].date).toBe('2026-01-10');
    expect(s.tickLabels[9]).toBe('10');
  });

  it('on Jan 1 the YTD curve still has two points (Dec 31 → today)', () => {
    const S = boot(new Date(2026, 0, 1, 12));
    const s = S.computeBalanceSeries({ range: 'ytd' });
    expect(s.points.map(p => p.date)).toEqual(['2025-12-31', '2026-01-01']);
  });

  it('Max with rows only this month still draws two points', () => {
    const S = boot();
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-06-02' });
    const s = S.computeBalanceSeries({ range: 'max' });
    expect(s.points.map(p => p.date)).toEqual(['2026-05-31', '2026-06-15']);
    expect(s.baseline).toBe(0);
    expect(s.points[1].balance).toBe(100);
  });
});
