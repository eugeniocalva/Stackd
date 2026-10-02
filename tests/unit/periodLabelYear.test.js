import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-19) Period labels are unambiguous about the year, and the
// Today/Yesterday labels and the boot month use LOCAL dates (no toISOString
// drift). The zone is pinned to a UTC+ zone so the drift cases fail on the old
// code even on a UTC CI runner.

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Period labels (1.0.1 BUG-19)', () => {
  let prevTZ;
  let Store;

  beforeAll(() => {
    prevTZ = process.env.TZ;
    process.env.TZ = 'Europe/Lisbon'; // UTC+1 in October (WEST)
  });

  afterAll(() => {
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  });

  const boot = (lang) => {
    global.window = {
      crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2, 11) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      StackdDB: {
        load: (key, def) => def,
        save: vi.fn(),
        generateId: () => 'id-' + Math.random().toString(36).slice(2, 11)
      }
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('i18n/fr.js');
    executeFile('store.js');
    Store = global.window.Store;
    Store.init();
    global.window.I18n.setLang(lang || 'en');
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const custom = (start, end) => Store._getPeriodLabel({ type: 'custom', value: '', start, end });

  describe('custom ranges', () => {
    beforeEach(() => boot());

    it('shows the year on both sides when the years differ', () => {
      expect(custom('2026-09-01', '2031-11-01')).toBe('Sep 1, 2026 – Nov 1, 2031');
    });

    it('omits the year for a range inside the current year', () => {
      expect(custom('2026-09-01', '2026-09-30')).toBe('Sep 1 – Sep 30');
    });

    it('shows the year once, at the end, for a past-year range', () => {
      expect(custom('2024-03-01', '2024-03-31')).toBe('Mar 1 – Mar 31, 2024');
    });

    it('keeps the Custom Range fallback for an empty bound', () => {
      expect(custom('', '2026-09-30')).toBe('Custom Range');
      expect(custom('2026-09-01', '')).toBe('Custom Range');
    });
  });

  describe('week ranges', () => {
    beforeEach(() => boot());

    it('labels the current week "This Week"', () => {
      expect(Store._getPeriodLabel({ type: 'week', value: '2026-10-01' })).toBe('This Week');
    });

    it('labels a week across New Year with both years', () => {
      expect(Store._getPeriodLabel({ type: 'week', value: '2025-12-31' })).toBe('Dec 29, 2025 – Jan 4, 2026');
    });

    it('labels a past-year week with the year once', () => {
      expect(Store._getPeriodLabel({ type: 'week', value: '2024-03-06' })).toBe('Mar 4 – Mar 10, 2024');
    });

    it('labels another week of this year without a year', () => {
      expect(Store._getPeriodLabel({ type: 'week', value: '2026-09-16' })).toBe('Sep 14 – Sep 20');
    });
  });

  describe('other languages', () => {
    it('French multi-year range carries both years', () => {
      boot('fr');
      const label = custom('2026-09-01', '2031-11-01');
      expect(label).toContain('2026');
      expect(label).toContain('2031');
      expect(label).toContain(' – ');
    });
  });

  describe('local-date Today / Yesterday (UTC+ zone, just after midnight)', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date(2026, 9, 1, 0, 30, 0));
      boot();
    });

    it('today reads "Today"', () => {
      expect(Store._getPeriodLabel({ type: 'today', value: '2026-10-01' })).toBe('Today');
    });

    it('yesterday reads "Yesterday"', () => {
      expect(Store._getPeriodLabel({ type: 'today', value: '2026-09-30' })).toBe('Yesterday');
    });

    it('boots History and Analytics on the local month', () => {
      expect(Store.state.historyFilters.period.value).toBe('2026-10-01');
      expect(Store.state.analyticsFilters.period.value).toBe('2026-10-01');
      expect(Store.state.activeMonthFilter).toBe('2026-10');
      expect(Store._getPeriodLabel(Store.state.historyFilters.period)).toBe('This Month');
    });
  });
});
