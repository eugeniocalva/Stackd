import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Pulls every `font-size: <value>;` out of a style attribute soup.
const fontSizesIn = (html) =>
  [...html.matchAll(/font-size:\s*([^;"]+)/g)].map((m) => m[1].trim());

describe('Dynamic Numeric Tile Sizing (v0.61)', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-id-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn()
      },
      StackdDB: {
        load: (key, def) => def,
        save: vi.fn(),
        generateId: () => 'test-id-' + Math.random().toString(36).substr(2, 9)
      },
      StackdHydrateIcons: vi.fn()
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
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    global.window.Store.init();
    global.window.Store.state.currency = 'EUR';

    vi.setSystemTime(new Date(2026, 7, 15));
  });

  describe('Components.fitNumericFontSize', () => {
    it('emits a clamp() bounded by the requested min and max', () => {
      const size = global.window.Components.fitNumericFontSize(['€10.00'], 0.95, 0.6, '(300px)');
      expect(size).toMatch(/^clamp\(0\.6rem, calc\(\(300px\) \/ [\d.]+\), 0\.95rem\)$/);
    });

    it('sizes the whole group off its longest value', () => {
      const short = global.window.Components.fitNumericFontSize(['€1.00'], 0.95, 0.6, '(300px)');
      const mixed = global.window.Components.fitNumericFontSize(
        ['€1.00', '+€1,234,567.89'],
        0.95,
        0.6,
        '(300px)'
      );

      // 5 chars vs 14 chars -> the divisor grows, so the preferred size shrinks.
      expect(short).toContain('/ 3.10)');
      expect(mixed).toContain('/ 8.68)');
      expect(mixed).not.toEqual(short);
    });

    it('divides by more as the value gets longer', () => {
      const divisorOf = (s) => parseFloat(s.match(/\/ ([\d.]+)\)/)[1]);
      const a = divisorOf(global.window.Components.fitNumericFontSize(['€100.00'], 1, 0.6, '(300px)'));
      const b = divisorOf(global.window.Components.fitNumericFontSize(['€100,000.00'], 1, 0.6, '(300px)'));
      expect(b).toBeGreaterThan(a);
    });

    it('falls back to the max size for an empty group', () => {
      expect(global.window.Components.fitNumericFontSize([], 0.95, 0.6, '(300px)')).toBe('0.95rem');
      expect(global.window.Components.fitNumericFontSize(null, 2.5, 1.4, '(300px)')).toBe('2.5rem');
    });

    it('does not break on null or undefined entries', () => {
      expect(() =>
        global.window.Components.fitNumericFontSize([null, undefined, '€5.00'], 1, 0.6, '(300px)')
      ).not.toThrow();
    });
  });

  describe('History summary bar', () => {
    const renderHistory = () => {
      const state = global.window.Store.getState();
      return global.window.Views.TransactionsView.render(state);
    };

    beforeEach(() => {
      global.window.Store.dispatch('ADD_ACCOUNT', {
        id: 'acc-hist',
        name: 'Main',
        openingBalance: 19481.7,
        openingDate: '2026-07-01'
      });
      global.window.Store.dispatch('ADD_TRANSACTION', {
        type: 'income',
        amount: 2310.5,
        accountId: 'acc-hist',
        date: '2026-08-10'
      });
    });

    it('gives Start, End and Net Change one shared font-size', () => {
      const html = renderHistory();
      const summary = html.slice(html.indexOf('>Start<'), html.indexOf('>Net Change<') + 200);
      const sizes = fontSizesIn(summary).filter((s) => s.startsWith('clamp('));

      expect(sizes).toHaveLength(3);
      expect(new Set(sizes).size).toBe(1);
    });

    it('never lets a figure wrap mid-number', () => {
      const html = renderHistory();
      // One nowrap per value, and the divider cells cannot self-widen.
      expect(html).toContain('white-space: nowrap; font-variant-numeric: tabular-nums;');
      expect(html).toContain('padding: var(--space-3); min-width: 0;');
    });

    it('no longer hardcodes the old fixed size or heavier Net Change weight', () => {
      const html = renderHistory();
      const summary = html.slice(html.indexOf('>Start<'), html.indexOf('>Net Change<') + 200);
      expect(summary).not.toContain('font-size: 0.95rem');
      expect(summary).not.toContain('font-weight: 800');
    });

    it('still renders the correct figures, sign included', () => {
      const html = renderHistory();
      expect(html).toContain('>€19,481.70</div>');
      expect(html).toContain('>+€2,310.50</div>');
      expect(html).toContain('>€21,792.20</div>');
    });

    it('shrinks the group when a balance grows to seven figures', () => {
      const divisorOf = (html) => {
        const summary = html.slice(html.indexOf('>Start<'), html.indexOf('>Net Change<') + 200);
        return parseFloat(fontSizesIn(summary)[0].match(/\/ ([\d.]+)\)/)[1]);
      };
      const before = divisorOf(renderHistory());

      global.window.Store.dispatch('ADD_TRANSACTION', {
        type: 'income',
        amount: 2000000,
        accountId: 'acc-hist',
        date: '2026-08-11'
      });

      expect(divisorOf(renderHistory())).toBeGreaterThan(before);
    });
  });

  describe('Analytics balance card', () => {
    beforeEach(() => {
      global.window.Store.dispatch('ADD_ACCOUNT', {
        id: 'acc-an',
        name: 'Main',
        openingBalance: 5000,
        openingDate: '2026-07-01'
      });
      global.window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense',
        amount: 250,
        accountId: 'acc-an',
        date: '2026-08-05'
      });
    });

    it('autosizes the hero balance instead of pinning it at 2.5rem', () => {
      const html = global.window.Views.AnalyticsView.render(global.window.Store.getState());
      expect(html).toContain('clamp(1.4rem,');
      expect(html).not.toContain('font-size: 2.5rem');
    });

    it('gives Net Change and Previous one shared font-size', () => {
      const html = global.window.Views.AnalyticsView.render(global.window.Store.getState());
      const tiles = html.slice(html.indexOf('>Net Change</span>'), html.indexOf('>Previous</span>') + 300);
      const sizes = fontSizesIn(tiles).filter((s) => s.startsWith('clamp('));

      expect(sizes).toHaveLength(2);
      expect(new Set(sizes).size).toBe(1);
      expect(tiles).not.toContain('font-size: 1.05rem');
    });
  });
});
