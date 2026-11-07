// 1.0.2 (BUG-67 / BUG-68 / D-U4-4) The custom-range calendar works in LOCAL
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

const status = () => document.querySelector('#period-sheet .period-cal-status').textContent;
const navTitle = () => document.querySelector('#period-sheet .period-nav-title').textContent.trim();
const tap = (sel) => document.querySelector(sel).click();
const openCustom = () => {
  window.Components.PeriodSheet.show('history');
  tap('#period-sheet [data-k="custom"]');
};

// 1.2.2 (HG-10 P5) the Custom Range sheet became the Period sheet's calendar
// step (Components.PeriodSheet); its presets are gone (decision Q3). The
// local-date guarantees and the BUG-68 rules carry over.
describe('The Period sheet calendar uses local dates (1.0.2 BUG-67 / BUG-68)', () => {
  let prevTZ;
  beforeAll(() => { prevTZ = process.env.TZ; });
  afterAll(() => {
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  });
  afterEach(() => { vi.useRealTimers(); });

  it('just after midnight the sheet opens on the local month and marks the local day (Rome, 00:30 on 1 Nov)', () => {
    setup('Europe/Rome', '2026-11-01T00:30:00+01:00'); // 23:30 UTC on 31 Oct
    window.Components.PeriodSheet.show('history');
    expect(document.querySelector('#period-sheet .period-cell.is-current').dataset.value).toBe('2026-11-01');
    tap('#period-sheet [data-k="custom"]');
    expect(navTitle()).toBe('November 2026');
    expect(document.querySelector('#period-sheet .period-day.is-today').dataset.day).toBe('2026-11-01');
    // the shown month, pre-selected: 1–30 Nov
    expect(status()).toMatch(/· 30 days$/);
  });

  it('a UTC- zone shows the right day and month (Martinique, 1 Oct)', () => {
    setup('America/Martinique', '2026-10-01T12:00:00-04:00');
    openCustom();
    expect(navTitle()).toBe('October 2026');
    expect(document.querySelector('#period-sheet .period-day.is-today').dataset.day).toBe('2026-10-01');
  });

  it('a 30-day range across the 25 Oct DST change counts 30 days (Rome)', () => {
    const S = setup('Europe/Rome', '2026-11-01T12:00:00+01:00');
    openCustom();
    tap('#period-sheet [data-k="c-prev"]');
    tap('#period-sheet [data-day="2026-10-03"]');
    tap('#period-sheet [data-k="c-next"]');
    tap('#period-sheet [data-day="2026-11-01"]');
    expect(status()).toMatch(/· 30 days$/);
    tap('#period-sheet [data-k="done"]');
    expect(S.state.historyFilters.period).toMatchObject({ type: 'custom', start: '2026-10-03', end: '2026-11-01' });
  });

  it('BUG-68: the month arrows browse the viewed month and leave the range alone', () => {
    const S = setup('Europe/Rome', '2026-10-03T15:00:00+02:00');
    openCustom();
    const before = status();
    expect(navTitle()).toBe('October 2026');
    tap('#period-sheet [data-k="c-prev"]');
    expect(navTitle()).toBe('September 2026');
    expect(status()).toBe(before);
    // a day in the browsed month starts the range; the view stays put
    tap('#period-sheet [data-day="2026-09-14"]');
    expect(navTitle()).toBe('September 2026');
    expect(status()).toBe('Now pick the last day');
    tap('#period-sheet [data-k="c-next"]');
    tap('#period-sheet [data-day="2026-10-03"]');
    expect(status()).toMatch(/^Sep 14\s?[–-]\s?Oct 3, 2026 · 20 days$/);
    tap('#period-sheet [data-k="done"]');
    expect(S.state.historyFilters.period).toMatchObject({ type: 'custom', start: '2026-09-14', end: '2026-10-03' });
  });

  it('BUG-68 review: an end picked before the start is applied in order, never reversed', () => {
    const S = setup('Europe/Rome', '2026-10-03T15:00:00+02:00');
    const spy = vi.spyOn(S, 'dispatch');
    openCustom();
    tap('#period-sheet [data-day="2026-10-03"]');
    tap('#period-sheet [data-k="c-prev"]');
    tap('#period-sheet [data-day="2026-09-30"]');
    expect(status()).toMatch(/· 4 days$/);
    // the highlight runs between the two picks, in order
    const sep30 = document.querySelector('#period-sheet [data-day="2026-09-30"]');
    expect(sep30.classList.contains('is-end')).toBe(true);
    expect(sep30.getAttribute('aria-label')).toMatch(/, start$/);
    tap('#period-sheet [data-k="done"]');
    const call = spy.mock.calls.find((c) => c[0] === 'UPDATE_FILTERS');
    expect(call[1].filters.period).toEqual({ type: 'custom', start: '2026-09-30', end: '2026-10-03', value: '' });
    expect(S.state.historyFilters.period).toMatchObject({ start: '2026-09-30', end: '2026-10-03' });
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
