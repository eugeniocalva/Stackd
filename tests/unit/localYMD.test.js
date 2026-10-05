import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-28) F0 shared helper: Store._localYMD(value), THE local
// calendar-day formatter. No argument = local today (same as _todayYMD());
// null / undefined / '' / an invalid value = ''; a bare 'YYYY-MM-DD' passes
// through unchanged; a Date, epoch ms or ISO timestamp = its LOCAL day.
// The zone is switched at runtime (as periodLabelYear.test.js does), east and
// west of UTC, so the UTC-day drift of toISOString() would fail here even on
// a UTC CI runner or the owner's Lisbon machine.

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let Store;
const boot = (iso) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  global.window = {
    crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2, 11) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'store.js']) executeFile(f);
  Store = global.window.Store;
};

const withZone = (tz) => {
  let prevTZ;
  beforeAll(() => {
    prevTZ = process.env.TZ;
    process.env.TZ = tz;
  });
  afterAll(() => {
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  });
  afterEach(() => { vi.useRealTimers(); });
};

describe('Store._localYMD east of UTC (Europe/Rome)', () => {
  withZone('Europe/Rome');

  it('the contract at 00:30 on 1 Nov (still 31 Oct in UTC)', () => {
    boot('2026-11-01T00:30:00+01:00'); // 23:30 UTC on 31 Oct
    expect(new Date().toISOString().split('T')[0]).toBe('2026-10-31'); // the zone switch took effect
    expect(Store._localYMD()).toBe('2026-11-01');
    expect(Store._todayYMD()).toBe('2026-11-01');
    expect(Store._localYMD(new Date())).toBe('2026-11-01');
    expect(Store._localYMD(new Date().toISOString())).toBe('2026-11-01');
    expect(Store._localYMD(Date.now())).toBe('2026-11-01');
    expect(Store._localYMD('2026-10-31T23:30:00.000Z')).toBe('2026-11-01');
    expect(Store._localYMD('2026-10-03')).toBe('2026-10-03');
    expect(Store._localYMD('not a date')).toBe('');
    expect(Store._localYMD(null)).toBe('');
    expect(Store._localYMD(undefined)).toBe('');
    expect(Store._localYMD('')).toBe('');
    expect(Store._localYMD(new Date('garbage'))).toBe('');
    expect(Store._localYMD(NaN)).toBe('');
  });

  it('local midnight is its own day, never the previous UTC day', () => {
    boot('2026-10-03T12:00:00+02:00');
    expect(Store._localYMD(new Date(2026, 9, 1))).toBe('2026-10-01');
    expect(Store._localYMD(new Date(2026, 9, 31, 23, 59, 59))).toBe('2026-10-31');
    expect(Store._localYMD(new Date(2026, 9, 1).getTime())).toBe('2026-10-01');
  });

  it('DST days: the autumn and spring changes keep the local day', () => {
    boot('2026-10-25T00:30:00+02:00'); // CEST, the night the clocks go back
    expect(Store._localYMD()).toBe('2026-10-25');
    expect(Store._localYMD('2026-10-25T01:30:00.000Z')).toBe('2026-10-25'); // 02:30 CET after the change
    expect(Store._localYMD('2026-10-25T22:59:00.000Z')).toBe('2026-10-25'); // 23:59 CET
    expect(Store._localYMD('2026-10-25T23:00:00.000Z')).toBe('2026-10-26'); // 00:00 CET
    expect(Store._localYMD(new Date(2026, 2, 29, 0, 30))).toBe('2026-03-29'); // spring-forward day, before 02:00
    expect(Store._localYMD(new Date(2026, 2, 29, 3, 30))).toBe('2026-03-29'); // after the skipped hour
    expect(Store._localYMD('2026-03-28T23:30:00.000Z')).toBe('2026-03-29'); // 00:30 CET
  });
});

describe('Store._localYMD west of UTC (America/Los_Angeles)', () => {
  withZone('America/Los_Angeles');

  it('the contract at 20:00 on 31 Oct (already 1 Nov in UTC)', () => {
    boot('2026-10-31T20:00:00-07:00'); // 03:00 UTC on 1 Nov
    expect(new Date().toISOString().split('T')[0]).toBe('2026-11-01'); // the zone switch took effect
    expect(Store._localYMD()).toBe('2026-10-31');
    expect(Store._todayYMD()).toBe('2026-10-31');
    expect(Store._localYMD(new Date())).toBe('2026-10-31');
    expect(Store._localYMD(new Date().toISOString())).toBe('2026-10-31');
    expect(Store._localYMD(Date.now())).toBe('2026-10-31');
    expect(Store._localYMD(null)).toBe('');
    expect(Store._localYMD(undefined)).toBe('');
    expect(Store._localYMD('')).toBe('');
  });

  it("a bare 'YYYY-MM-DD' is never parsed as UTC midnight", () => {
    boot('2026-10-03T12:00:00-07:00');
    // new Date('2026-10-03') is UTC midnight = 2 Oct 17:00 here; the string
    // itself is already a local day and comes back unchanged.
    expect(Store._localYMD(new Date('2026-10-03'))).toBe('2026-10-02');
    expect(Store._localYMD('2026-10-03')).toBe('2026-10-03');
  });

  it('DST day: the night the clocks go back (1 Nov 2026) stays one local day', () => {
    boot('2026-11-01T00:30:00-07:00'); // PDT
    expect(Store._localYMD()).toBe('2026-11-01');
    expect(Store._localYMD('2026-11-01T09:30:00.000Z')).toBe('2026-11-01'); // 01:30 PST (the repeated hour)
    expect(Store._localYMD('2026-11-02T07:59:00.000Z')).toBe('2026-11-01'); // 23:59 PST
    expect(Store._localYMD('2026-11-02T08:00:00.000Z')).toBe('2026-11-02'); // 00:00 PST
  });
});
