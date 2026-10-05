// 1.0.2 (BUG-67 / BUG-68 / D-U4-4) The Custom Range sheet works in LOCAL
// days: 'today' is the device's day (not the UTC day toISOString() gave, which
// is yesterday in UTC+ zones until 01:00/02:00), presets cover exactly N units
// ending today with both ends included, bare 'YYYY-MM-DD' values are never
// parsed as UTC midnight (a day early west of UTC), and the month arrows
// browse each calendar's viewed month without moving the selection. Zones are
// pinned per test; only Date is faked.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const jsdomWindow = globalThis.window;

const exec = (p) => {
  const content = readFileSync(resolve(__dirname, '../../src', p), 'utf8');
  new Function('window', 'localStorage', 'crypto', content)(window, window.localStorage, window.crypto);
};

const setup = (tz, iso) => {
  process.env.TZ = tz;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
  global.window = jsdomWindow;
  window.localStorage.clear();
  document.body.innerHTML = '<div id="modal-container"></div>';
  window.StackdHydrateIcons = vi.fn();
  exec('db.js');
  exec('i18n.js');
  exec('i18n/en.js');
  exec('store.js');
  exec('components.js');
  window.Store.init();
  return window.Store;
};

const summary = () => document.getElementById('crm-range-summary').textContent;
const titles = () => [...document.querySelectorAll('.calendar-nav-title')].map((e) => e.textContent.trim());
const tap = (sel) => document.querySelector(sel).click();

describe('Custom Range sheet uses local dates (1.0.2 BUG-67 / BUG-68)', () => {
  let prevTZ;
  beforeAll(() => { prevTZ = process.env.TZ; });
  afterAll(() => {
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('presets cover N units ending today, both ends included (Rome, Sat 3 Oct)', () => {
    const S = setup('Europe/Rome', '2026-10-03T15:00:00+02:00');
    const spy = vi.spyOn(S, 'dispatch');
    window.Components.CustomRangeModal.show('history');

    tap('[data-days="7"]');
    expect(summary()).toContain('Sep 27, 2026 - Oct 3, 2026');
    expect(summary()).toContain('(7 days)');

    tap('[data-days="30"]');
    expect(summary()).toContain('Sep 4, 2026 - Oct 3, 2026');
    expect(summary()).toContain('(30 days)');

    tap('[data-days="90"]');
    expect(summary()).toContain('Jul 6, 2026 - Oct 3, 2026');
    expect(summary()).toContain('(90 days)');

    // D-U4-1: from the day after the same date N months ago.
    tap('[data-months="6"]');
    expect(summary()).toContain('Apr 4, 2026 - Oct 3, 2026');
    expect(summary()).toContain('(183 days)');

    tap('[data-years="1"]');
    expect(summary()).toContain('Oct 4, 2025 - Oct 3, 2026');
    expect(summary()).toContain('(365 days)');

    tap('#crm-apply');
    const call = spy.mock.calls.find((c) => c[0] === 'UPDATE_FILTERS');
    expect(call[1]).toEqual({
      page: 'history',
      filters: { period: { type: 'custom', start: '2025-10-04', end: '2026-10-03', value: '' } }
    });
  });

  it('just after midnight the sheet opens on the local day (Rome, 00:30 on 1 Nov)', () => {
    setup('Europe/Rome', '2026-11-01T00:30:00+01:00'); // 23:30 UTC on 31 Oct
    window.Components.CustomRangeModal.show('history');
    expect(summary()).toContain('Nov 1, 2026 - Nov 1, 2026');
    expect(summary()).toContain('(1 day)');
    expect(titles()).toEqual(['November 2026', 'November 2026']);

    // Across the 25 Oct DST change: still exactly 30 days.
    tap('[data-days="30"]');
    expect(summary()).toContain('Oct 3, 2026 - Nov 1, 2026');
    expect(summary()).toContain('(30 days)');
  });

  it('a UTC- zone shows the right day and month (Martinique, 1 Oct)', () => {
    setup('America/Martinique', '2026-10-01T12:00:00-04:00');
    window.Components.CustomRangeModal.show('history');
    expect(summary()).toContain('Oct 1, 2026 - Oct 1, 2026');
    expect(titles()).toEqual(['October 2026', 'October 2026']);
  });

  it('a month-end 6 Months start clamps (Rome, 31 Aug)', () => {
    setup('Europe/Rome', '2026-08-31T12:00:00+02:00');
    window.Components.CustomRangeModal.show('history');
    tap('[data-months="6"]');
    expect(summary()).toContain('Mar 1, 2026 - Aug 31, 2026');
  });

  it('BUG-68: the month arrows browse the viewed month and leave the range alone', () => {
    setup('Europe/Rome', '2026-10-03T15:00:00+02:00');
    window.Components.CustomRangeModal.show('history');
    const before = summary();
    expect(titles()).toEqual(['October 2026', 'October 2026']);

    tap('.btn-month-nav[data-target="start"][data-offset="-1"]');
    expect(titles()).toEqual(['September 2026', 'October 2026']);
    expect(summary()).toBe(before);

    // A day in the browsed month becomes the start; the view stays put.
    tap('#calendar-container-start .calendar-day[data-date="2026-09-14"]');
    expect(summary()).toContain('Sep 14, 2026 - Oct 3, 2026');
    expect(titles()).toEqual(['September 2026', 'October 2026']);

    // The end calendar browses on its own.
    tap('.btn-month-nav[data-target="end"][data-offset="1"]');
    expect(titles()).toEqual(['September 2026', 'November 2026']);
    expect(summary()).toContain('Sep 14, 2026 - Oct 3, 2026');

    // A preset brings both calendars back to its own range.
    tap('[data-days="7"]');
    expect(titles()).toEqual(['September 2026', 'October 2026']);
    expect(summary()).toContain('Sep 27, 2026 - Oct 3, 2026');
  });

  it('BUG-68 review: an end picked before the start is applied in order, never reversed', () => {
    const S = setup('Europe/Rome', '2026-10-03T15:00:00+02:00');
    const spy = vi.spyOn(S, 'dispatch');
    window.Components.CustomRangeModal.show('history');

    // 'Set the end first': end ‹ to September, tap Sep 30 (start is still Oct 3).
    tap('.btn-month-nav[data-target="end"][data-offset="-1"]');
    tap('#calendar-container-end .calendar-day[data-date="2026-09-30"]');
    expect(summary()).toContain('Sep 30, 2026 - Oct 3, 2026');
    expect(summary()).toContain('(4 days)');
    // the highlight runs between the two picks, in order
    const sep30 = document.querySelector('#calendar-container-end .calendar-day[data-date="2026-09-30"]');
    expect(sep30.classList.contains('in-range')).toBe(true);
    expect(sep30.classList.contains('range-start')).toBe(true);

    tap('#crm-apply');
    const call = spy.mock.calls.find((c) => c[0] === 'UPDATE_FILTERS');
    expect(call[1].filters.period).toEqual({ type: 'custom', start: '2026-09-30', end: '2026-10-03', value: '' });
    expect(S.state.historyFilters.period).toMatchObject({ start: '2026-09-30', end: '2026-10-03' });
  });

  it('BUG-68 review: end first, then the start completes the intended past range', () => {
    const S = setup('Europe/Rome', '2026-10-03T15:00:00+02:00');
    const spy = vi.spyOn(S, 'dispatch');
    window.Components.CustomRangeModal.show('history');

    tap('.btn-month-nav[data-target="end"][data-offset="-1"]');
    tap('#calendar-container-end .calendar-day[data-date="2026-09-30"]');
    tap('.btn-month-nav[data-target="start"][data-offset="-1"]');
    tap('#calendar-container-start .calendar-day[data-date="2026-09-01"]');
    expect(summary()).toContain('Sep 1, 2026 - Sep 30, 2026');
    expect(summary()).toContain('(30 days)');

    tap('#crm-apply');
    const call = spy.mock.calls.find((c) => c[0] === 'UPDATE_FILTERS');
    expect(call[1].filters.period).toEqual({ type: 'custom', start: '2026-09-01', end: '2026-09-30', value: '' });
  });
});

describe('Previous period of a custom range across DST (1.0.2 D-U4-4)', () => {
  let prevTZ;
  beforeAll(() => { prevTZ = process.env.TZ; });
  afterAll(() => {
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('1–31 Oct (with the 25-hour 25 Oct) is 31 days, so the previous period is 31 Aug – 30 Sep', () => {
    const S = setup('Europe/Rome', '2026-11-05T12:00:00+01:00');
    expect(S._getPreviousPeriod({ type: 'custom', start: '2026-10-01', end: '2026-10-31', value: '' }))
      .toMatchObject({ type: 'custom', start: '2026-08-31', end: '2026-09-30' });
  });
});
