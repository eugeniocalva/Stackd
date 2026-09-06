// v1.04 — The Analytics hero badge reports the change AGAINST the previous
// period (`pct`), while the NET CHANGE tile beneath it reports this period's own
// net flow (`delta`). They are different quantities and can carry opposite
// signs. The badge used to take its "+" from `delta`, so a positive net flow
// that was still below last period's rendered "+-2.5%".
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// A day inside a given month offset from today, clamped so it never lands in
// the future (the "today" balance mode ignores future-dated rows).
const dayIn = (monthOffset, day) => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, day, 12);
  if (monthOffset === 0 && d > now) d.setDate(Math.min(day, now.getDate()));
  return iso(d);
};

/** Renders Analytics with one account and the given transactions. */
const renderWith = (transactions) => {
  global.window.Store.state.accounts = [{ id: 'acc1', name: 'Bank', balance: 0, color: '#000' }];
  global.window.Store.state.transactions = transactions;
  return global.window.Views.AnalyticsView.render(global.window.Store.getState());
};

/** The percentage as printed inside the badge, e.g. "-2.5%". */
const badgePct = (html) => {
  const m = html.match(/data-lucide="(trending-up|trending-down)"[^>]*><\/i>\s*<span>([^<]*)<\/span>/);
  return m ? { arrow: m[1], text: m[2].trim() } : null;
};

describe('Analytics delta badge sign', () => {
  beforeEach(() => {
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    global.document = {
      getElementById: vi.fn(() => null),
      body: { appendChild: vi.fn(), querySelector: vi.fn() },
      createElement: () => ({
        className: '', id: '', innerHTML: '', style: {},
        classList: { add: vi.fn(), remove: vi.fn() },
        querySelector: vi.fn(), querySelectorAll: vi.fn(() => []),
        appendChild: vi.fn(), remove: vi.fn()
      })
    };

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    global.window.Store.init();
    global.window.Store.state.currency = 'EUR';
  });

  it('never prints a doubled sign when net flow is positive but below last period', () => {
    // Last month netted +2000, this month +1000: delta > 0, pct < 0.
    const html = renderWith([
      { id: 't1', type: 'income', amount: 2000, accountId: 'acc1', date: dayIn(-1, 5) },
      { id: 't2', type: 'income', amount: 1000, accountId: 'acc1', date: dayIn(0, 1) }
    ]);

    const badge = badgePct(html);
    expect(badge).not.toBeNull();
    expect(badge.text).not.toMatch(/\+-/);
    expect(badge.text.startsWith('-')).toBe(true);
    // The comparison worsened, so the badge reads as a fall.
    expect(badge.arrow).toBe('trending-down');
    expect(html).toContain('var(--color-expense-bg)');

    // The NET CHANGE tile still reports this period's own flow, which is positive.
    expect(html).toContain('+€1,000.00');
  });

  it('prints a single + when the period improved on the last one', () => {
    const html = renderWith([
      { id: 't1', type: 'income', amount: 1000, accountId: 'acc1', date: dayIn(-1, 5) },
      { id: 't2', type: 'income', amount: 2000, accountId: 'acc1', date: dayIn(0, 1) }
    ]);

    const badge = badgePct(html);
    expect(badge.text).toMatch(/^\+\d/);
    expect(badge.text).not.toMatch(/\+-/);
    expect(badge.arrow).toBe('trending-up');
  });

  it('signs the ±100% fallback by direction when the previous period was flat', () => {
    // No previous-period rows at all, and this period is a net loss.
    const html = renderWith([
      { id: 't1', type: 'expense', amount: 500, accountId: 'acc1', date: dayIn(0, 1) }
    ]);

    const badge = badgePct(html);
    expect(badge.text).toBe('-100.0%');
    expect(badge.arrow).toBe('trending-down');
  });

  it('agrees on sign, arrow and colour in every case', () => {
    const cases = [
      [2000, 1000], // worse
      [1000, 2000], // better
      [1000, 1000]  // unchanged
    ];
    for (const [prev, cur] of cases) {
      const html = renderWith([
        { id: 'p', type: 'income', amount: prev, accountId: 'acc1', date: dayIn(-1, 5) },
        { id: 'c', type: 'income', amount: cur, accountId: 'acc1', date: dayIn(0, 1) }
      ]);
      const badge = badgePct(html);
      const negative = badge.text.startsWith('-');
      expect(badge.arrow).toBe(negative ? 'trending-down' : 'trending-up');
      expect(html).toContain(negative ? 'var(--color-expense-bg)' : 'var(--color-income-bg)');
      expect(badge.text).not.toMatch(/\+-/);
    }
  });
});
