// @vitest-environment jsdom
// 1.2.2 (HG-15, docs/phone-widgets-plan.md WG-1) — the phone widgets'
// snapshot: every figure equals the matching Home card, hidden balances mask
// it, and a write only goes out when something changed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'document', 'localStorage', 'crypto', content);
  fn(window, document, window.localStorage, window.crypto);
};

const S = () => window.Store;
const N = () => window.StackdWidgets;
let n = 0;

const boot = () => {
  window.localStorage.clear();
  window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
  Object.defineProperty(window, 'crypto', { value: { randomUUID: () => 'uuid-' + (++n) }, writable: true, configurable: true });
  delete window.Capacitor;
  ['db.js', 'i18n.js', 'i18n/en.js', 'i18n/it.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'widgets-native.js'].forEach(executeFile);
  S().init();
};

const seed = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
  S().dispatch('ADD_ACCOUNT', { name: 'Travel', openingBalance: 50, openingDate: '2026-01-01', currency: 'EUR' });
  const main = S().getState().accounts.find(a => a.name === 'Main').id;
  const tx = (type, amount, categoryId, date, extra) => S().dispatch('ADD_TRANSACTION', { type, amount, accountId: main, categoryId, date, ...extra });
  tx('income', 2000, 'cat_salary', '2026-11-02');
  tx('expense', 300, 'cat_groceries', '2026-11-05');
  tx('expense', 100, 'cat_dining', '2026-11-08');
  tx('expense', 50, 'cat_dining', '2026-11-20'); // future one-off: EOM, not MTD, not "upcoming"
  tx('expense', 700, 'cat_rent', '2026-11-12', { recurrence: { interval: 1, frequency: 'months', endDate: '2027-03-12' } });
  S().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 200, isCumulative: false });
};

describe('StackdWidgets snapshot (HG-15 WG-1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 9, 10, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('an install with no accounts writes an empty snapshot the widgets show as "Open Stack\'d"', () => {
    const snap = N().buildSnapshot();
    expect(snap).toMatchObject({ v: 1, empty: true, day: '2026-11-09', masked: false });
    expect(snap.labels.open).toBe("Open Stack'd");
  });

  describe('with data', () => {
    beforeEach(seed);

    it('Account balances: the total leaves the other-currency account out; every account is listed in its own currency', () => {
      const snap = N().buildSnapshot();
      const main = S().getAccountBalance(S().getState().accounts.find(a => a.name === 'Main').id);
      expect(snap.total.text).toBe(S().formatCurrency(main, 'USD', { plain: true }));
      expect(snap.accounts.map(a => a.name)).toEqual(['Main', 'Travel']);
      expect(snap.accounts[1]).toMatchObject({ text: '€50.00', other: true });
      expect(snap.accountCount).toBe(2);
      expect(snap.moreOther).toBe('+{n} more');
    });

    it('Income vs Expenses is the whole month (EOM), with the net signed', () => {
      const m = N().buildSnapshot().month;
      expect(m.incomeText).toBe('$2,000.00');
      expect(m.expenseText).toBe('$1,150.00'); // 300 + 100 + the 20th's 50 + rent 700
      expect(m.netText).toBe('+$850.00');
      expect(m.netTrend).toBe('up');
      expect(m.incomeBar).toBe(1);
      expect(m.expenseBar).toBeCloseTo(0.575, 3);
    });

    it('Categories is spending so far this month (MTD)', () => {
      const c = N().buildSnapshot().categories;
      expect(c.spentText).toBe('$400.00');
      expect(c.slices.map(s => [s.name, s.share])).toEqual([['Groceries', 0.75], ['Dining Out', 0.25]]);
      expect(c.slices[0].color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('Budget goals reads Goals\' figures and flags the over-limit category', () => {
      const b = N().buildSnapshot().budgets;
      expect(b.over).toBe(true);
      expect(b.ratio).toBe(1);
      expect(b.rows).toHaveLength(1);
      expect(b.rows[0]).toMatchObject({ name: 'Groceries', over: true, ratio: 1 });
      expect(b.rows[0].pctText).toContain('150');
    });

    it('Upcoming lists the scheduled payments of the next 35 days with their dates', () => {
      const up = N().buildSnapshot().upcoming;
      expect(up.map(r => r.date)).toEqual(['2026-11-12', '2026-12-12']);
      expect(up[0]).toMatchObject({ name: 'Rent', text: '-$700.00', kind: 'expense' });
      expect(up[0].dayText).toMatch(/12/);
    });

    it('Balance curve: 30 points in 0–1, ending on today\'s total', () => {
      const snap = N().buildSnapshot();
      expect(snap.curve.points).toHaveLength(30);
      expect(snap.curve.points.every(p => p >= 0 && p <= 1)).toBe(true);
      expect(snap.curve.totalText).toBe(snap.total.text);
      expect(snap.curve.range).toBe('1m');
    });

    it('hidden balances mask every amount, on any screen', () => {
      S().dispatch('SET_PRIVACY', { hide: true });
      S().dispatch('SET_VIEW', 'transactions');
      const snap = N().buildSnapshot();
      expect(snap.masked).toBe(true);
      const texts = [snap.total.text, ...snap.accounts.map(a => a.text), snap.month.incomeText, snap.month.netText,
        snap.categories.spentText, snap.budgets.spentText, ...snap.upcoming.map(r => r.text), snap.curve.totalText];
      texts.forEach(t => {
        expect(t).toContain('••••');
        expect(t).not.toMatch(/\d/);
      });
      expect(snap.curve.points).toHaveLength(30); // the shape stays, as on Home
    });

    it('labels follow the app language', () => {
      S().dispatch('SET_LANGUAGE', 'it');
      const snap = N().buildSnapshot();
      expect(snap.labels.tomorrow).toBe('Domani');
      expect(snap.labels.expenseBtn).not.toBe('Expense');
    });

    it('text is plain and bounded', () => {
      expect(N()._clip('a\nb\u0007c', 10)).toBe('a b c');
      expect(N()._clip('x'.repeat(50), 10)).toHaveLength(10);
    });
  });

  describe('sync', () => {
    const native = (write) => {
      window.Capacitor = { isNativePlatform: () => true, Plugins: { StackdWidgets: { write } } };
    };

    it('does nothing without the native plugin (the web build)', async () => {
      seed();
      expect(await N().sync()).toBe(false);
      expect(N().last).toBe(null);
    });

    it('writes once, skips an unchanged snapshot, writes again after a change', async () => {
      seed();
      const write = vi.fn(() => Promise.resolve());
      native(write);
      expect(await N().sync()).toBe(true);
      expect(JSON.parse(write.mock.calls[0][0].json)).toMatchObject({ v: 1, empty: false });
      vi.setSystemTime(new Date(2026, 10, 9, 10, 5, 0)); // later build time alone is no change
      expect(await N().sync()).toBe(false);
      S().dispatch('SET_PRIVACY', { hide: true });
      expect(await N().sync()).toBe(true);
      expect(write).toHaveBeenCalledTimes(2);
      expect(await N().sync({ force: true })).toBe(true);
    });

    it('a failing plugin never throws into the app', async () => {
      seed();
      native(() => Promise.reject(new Error('no container')));
      await expect(N().sync()).resolves.toBe(false);
    });
  });
});
