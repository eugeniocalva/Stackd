// v1.04 — The Analytics hero badge reports the change AGAINST the previous
// period (`pct`), while the NET CHANGE tile beneath it reports this period's own
// net flow (`delta`). They are different quantities and can carry opposite
// signs. The badge used to take its "+" from `delta`, so a positive net flow
// that was still below last period's rendered "+-2.5%".
//
// 1.0.1 (BUG-12): the NET CHANGE tile keeps a real minus on a net outflow, and
// a previous period with no net flow has no basis for a percentage — the pill
// is a neutral '—' instead of the old ±100% fallback.
// 1.0.1 (C-49b): the clock is pinned (2026-06-15 12:00 local) and the
// previous-month rows sit on day 1, so the like-for-like (month-to-date)
// comparison window always contains them — the suite used to fail on days 1-4
// of every month.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  const m = html.match(/data-lucide="(trending-up|trending-down|minus)"[^>]*><\/i>\s*<span[^>]*>([^<]*)<\/span>/);
  return m ? { arrow: m[1], text: m[2].trim() } : null;
};

/** The NET CHANGE tile value (the first stat tile after its label). */
const netChangeTile = (html) => {
  const m = html.match(/Net Change<\/span>\s*<span[^>]*>([^<]*)<\/span>/);
  return m ? m[1].trim() : null;
};

const boot = () => {
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
};

describe('Analytics delta badge sign', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    boot();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never prints a doubled sign when net flow is positive but below last period', () => {
    // Last month netted +2000, this month +1000: delta > 0, pct < 0.
    const html = renderWith([
      { id: 't1', type: 'income', amount: 2000, accountId: 'acc1', date: dayIn(-1, 1) },
      { id: 't2', type: 'income', amount: 1000, accountId: 'acc1', date: dayIn(0, 1) }
    ]);

    const badge = badgePct(html);
    expect(badge).not.toBeNull();
    expect(badge.text).not.toMatch(/\+-/);
    expect(badge.text).toBe('-50.0%');
    // The comparison worsened, so the badge reads as a fall.
    expect(badge.arrow).toBe('trending-down');
    expect(html).toContain('var(--color-expense-bg)');

    // The NET CHANGE tile still reports this period's own flow, which is positive.
    expect(html).toContain('+€1,000.00');
  });

  it('prints a single + when the period improved on the last one', () => {
    const html = renderWith([
      { id: 't1', type: 'income', amount: 1000, accountId: 'acc1', date: dayIn(-1, 1) },
      { id: 't2', type: 'income', amount: 2000, accountId: 'acc1', date: dayIn(0, 1) }
    ]);

    const badge = badgePct(html);
    expect(badge.text).toBe('+100.0%');
    expect(badge.text).not.toMatch(/\+-/);
    expect(badge.arrow).toBe('trending-up');
  });

  it('shows a neutral — pill when the previous period had no net flow (no basis)', () => {
    // No previous-period rows at all, and this period is a net loss.
    const html = renderWith([
      { id: 't1', type: 'expense', amount: 500, accountId: 'acc1', date: dayIn(0, 1) }
    ]);

    const badge = badgePct(html);
    expect(badge.text).toBe('—');
    expect(badge.arrow).toBe('minus');
    expect(html).toContain('background: var(--bg-surface-sunken); color: var(--text-secondary)');
    expect(html).not.toContain('-100.0%');
    expect(html).toContain('aria-label="No comparison available"');
  });

  it('treats a sub-cent previous net (float dust) as no basis', () => {
    // 0.1 + 0.2 - 0.3 nets ~5.5e-17 last month — not a real baseline.
    const html = renderWith([
      { id: 'p1', type: 'income', amount: 0.1, accountId: 'acc1', date: dayIn(-1, 1) },
      { id: 'p2', type: 'income', amount: 0.2, accountId: 'acc1', date: dayIn(-1, 1) },
      { id: 'p3', type: 'expense', amount: 0.3, accountId: 'acc1', date: dayIn(-1, 1) },
      { id: 'c', type: 'income', amount: 100, accountId: 'acc1', date: dayIn(0, 1) }
    ]);
    const badge = badgePct(html);
    expect(badge.text).toBe('—');
    expect(badge.arrow).toBe('minus');
  });

  it('agrees on sign, arrow and colour in every case', () => {
    const cases = [
      [2000, 1000], // worse
      [1000, 2000], // better
      [1000, 1000]  // unchanged
    ];
    for (const [prev, cur] of cases) {
      const html = renderWith([
        { id: 'p', type: 'income', amount: prev, accountId: 'acc1', date: dayIn(-1, 1) },
        { id: 'c', type: 'income', amount: cur, accountId: 'acc1', date: dayIn(0, 1) }
      ]);
      const badge = badgePct(html);
      const negative = badge.text.startsWith('-');
      expect(badge.arrow).toBe(negative ? 'trending-down' : 'trending-up');
      expect(html).toContain(negative ? 'var(--color-expense-bg)' : 'var(--color-income-bg)');
      expect(badge.text).not.toMatch(/\+-/);
    }
    // Unchanged reads a plain 0.0% (no '+', no '-').
    const flat = badgePct(renderWith([
      { id: 'p', type: 'income', amount: 1000, accountId: 'acc1', date: dayIn(-1, 1) },
      { id: 'c', type: 'income', amount: 1000, accountId: 'acc1', date: dayIn(0, 1) }
    ]));
    expect(flat.text).toBe('0.0%');
  });

  it('prints a real minus on the NET CHANGE tile for a net outflow', () => {
    const html = renderWith([
      { id: 'p', type: 'income', amount: 1000, accountId: 'acc1', date: dayIn(-1, 1) },
      { id: 'c', type: 'expense', amount: 500, accountId: 'acc1', date: dayIn(0, 1) }
    ]);
    expect(netChangeTile(html)).toBe('-€500.00');
    expect(html).toContain('var(--color-expense);">-€500.00');
    const badge = badgePct(html);
    expect(badge.text).toBe('-150.0%');
  });

  it('prints €0.00 (no sign) for a zero net change', () => {
    const html = renderWith([
      { id: 'p', type: 'income', amount: 100, accountId: 'acc1', date: dayIn(-1, 1) },
      { id: 'c1', type: 'income', amount: 40, accountId: 'acc1', date: dayIn(0, 1) },
      { id: 'c2', type: 'expense', amount: 40, accountId: 'acc1', date: dayIn(0, 1) }
    ]);
    expect(netChangeTile(html)).toBe('€0.00');
  });

  it('formats the badge in the UI language (Italian comma decimal)', () => {
    global.window.I18n.setLang('it');
    const html = renderWith([
      { id: 'p', type: 'income', amount: 2000, accountId: 'acc1', date: dayIn(-1, 1) },
      { id: 'c', type: 'income', amount: 1000, accountId: 'acc1', date: dayIn(0, 1) }
    ]);
    const badge = badgePct(html);
    const expected = '-' + new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0.5);
    expect(badge.text).toBe(expected);
    expect(badge.text).toContain(',');
  });
});

describe('Analytics delta badge on the 1st of the month', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows — (not -100.0%) when the one-day comparison window is empty', () => {
    const html = renderWith([
      { id: 'p', type: 'income', amount: 1000, accountId: 'acc1', date: '2026-09-15' },
      { id: 'c', type: 'expense', amount: 105.4, accountId: 'acc1', date: '2026-10-01' }
    ]);
    const badge = badgePct(html);
    expect(badge.text).toBe('—');
    expect(badge.arrow).toBe('minus');
    expect(netChangeTile(html)).toBe('-€105.40');
  });
});
