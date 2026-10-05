import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-24) F0 shared helpers: the one HTML escaper (I18n.esc) and the
// store's markup-safety validators (normalizeAccountColor, isSafeIcon, safeId,
// fileId). U1 wires them into every sink and write path; U6 reads every id
// cell from a file through Store.fileId. These cases pin the helpers alone.

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const S = () => global.window.Store;
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
// Breaks out of a double- or single-quoted attribute, then opens an element.
const P = (k) => `${k}"'><x-xss data-k="${k}"></x-xss>`;

const boot = () => {
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 11) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'store.js']) executeFile(f);
};

describe('I18n.esc (1.0.2 BUG-24)', () => {
  beforeEach(boot);

  it('is null-safe and escapes & < > " \'', () => {
    const esc = global.window.I18n.esc.bind(global.window.I18n);
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc('')).toBe('');
    expect(esc(0)).toBe('0');
    expect(esc(12.5)).toBe('12.5');
    expect(esc('&<>"' + "'")).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(esc('Bob\'s "Big" R&D <3')).toBe('Bob&#39;s &quot;Big&quot; R&amp;D &lt;3');
    expect(esc('café · 東京 🍔')).toBe('café · 東京 🍔');
  });

  it('is valid as element content and inside double- or single-quoted attributes', () => {
    const esc = global.window.I18n.esc.bind(global.window.I18n);
    const raw = P('k');
    const host = document.createElement('div');
    host.innerHTML = `<span id="c">${esc(raw)}</span><b id="d" title="${esc(raw)}"></b><i id="s" title='${esc(raw)}'></i>`;
    expect(host.querySelector('x-xss')).toBeNull();
    expect(host.querySelector('#c').textContent).toBe(raw);
    expect(host.querySelector('#d').getAttribute('title')).toBe(raw);
    expect(host.querySelector('#s').getAttribute('title')).toBe(raw);
    expect(host.children).toHaveLength(3);
  });
});

describe('Store markup-safety validators (1.0.2 BUG-24)', () => {
  beforeEach(boot);

  it('normalizeAccountColor: palette (case-insensitive, trimmed) plus the legacy map; anything else is null', () => {
    expect(S().normalizeAccountColor('#e60023')).toBe('#E60023');
    expect(S().normalizeAccountColor('  #0075eb ')).toBe('#0075EB');
    expect(S().normalizeAccountColor('#FF9500')).toBe('#EA580C');
    expect(S().normalizeAccountColor('#ff9500')).toBe('#EA580C');
    expect(S().normalizeAccountColor('#16A34A')).toBeNull();
    expect(S().normalizeAccountColor('red')).toBeNull();
    expect(S().normalizeAccountColor(P('c'))).toBeNull();
    expect(S().normalizeAccountColor('')).toBeNull();
    expect(S().normalizeAccountColor(null)).toBeNull();
    expect(S().normalizeAccountColor(undefined)).toBeNull();
    S().ACCOUNT_COLORS.forEach(c => expect(S().normalizeAccountColor(c)).toBe(c));
  });

  it('isSafeIcon: Lucide names and emoji pass; whitespace, quotes, brackets, &, \\, ` and = fail; 1-40 characters', () => {
    ['hand-coins', 'wallet', 'pin', '\u{1F354}', '❤️', 'x'.repeat(40)].forEach(v =>
      expect(S().isSafeIcon(v)).toBe(true));
    ['pin"', "pin'", 'a b', 'a\tb', '<svg>', 'a>b', 'a&b', 'a\\b', 'a`b', 'a=b', '', 'x'.repeat(41), null, undefined, 123, {}].forEach(v =>
      expect(S().isSafeIcon(v)).toBe(false));
  });

  it('safeId: the trimmed id when it matches ^[A-Za-z0-9_.:-]{1,64}$, otherwise null', () => {
    expect(S().safeId('cat_salary')).toBe('cat_salary');
    expect(S().safeId('3f2b9c1e-0a4d-4c55-9b1e-7f6a2d8e9c10')).toBe('3f2b9c1e-0a4d-4c55-9b1e-7f6a2d8e9c10');
    expect(S().safeId('  keep-1 ')).toBe('keep-1');
    expect(S().safeId('a.b:c')).toBe('a.b:c');
    expect(S().safeId(123)).toBe('123');
    expect(S().safeId('x'.repeat(64))).toBe('x'.repeat(64));
    expect(S().safeId('x'.repeat(65))).toBeNull();
    expect(S().safeId('a"b')).toBeNull();
    expect(S().safeId('rent 2026')).toBeNull();
    expect(S().safeId('café')).toBeNull();
    expect(S().safeId('')).toBeNull();
    expect(S().safeId('   ')).toBeNull();
    expect(S().safeId(null)).toBeNull();
    expect(S().safeId(undefined)).toBeNull();
  });

  it('fileId: empty -> null; a safe id is kept (trimmed); anything else maps to a stable f-<16 hex> id', () => {
    expect(S().fileId('')).toBeNull();
    expect(S().fileId('   ')).toBeNull();
    expect(S().fileId(null)).toBeNull();
    expect(S().fileId(undefined)).toBeNull();
    expect(S().fileId('cat_salary')).toBe('cat_salary');
    expect(S().fileId(' cat_salary ')).toBe('cat_salary');
    const a = S().fileId('rent 2026');
    expect(a).toMatch(/^f-[0-9a-f]{16}$/);
    expect(a).toMatch(SAFE_ID);
    expect(S().fileId(' rent 2026')).toBe(a);
    expect(S().fileId('rent 2026 ')).toBe(a);
    expect(S().fileId('rent 2027')).not.toBe(a);
    expect(S().fileId('Rent 2026')).not.toBe(a);
    const x = S().fileId(P('id'));
    expect(x).toMatch(/^f-[0-9a-f]{16}$/);
    // An over-long cell made of safe characters is hashed too (safeId caps at 64).
    expect(S().fileId('y'.repeat(65))).toMatch(/^f-[0-9a-f]{16}$/);
  });

  it('fileId is pinned: the map may never change between builds', () => {
    // Ids already stored by a 1.0.2+ import were mapped by this function; a
    // later restore or re-import (U6's dedupe by Id, SeriesId <->
    // LinkedSeriesId) must map the same cell to the same id, on any build.
    expect(S().fileId('rent 2026')).toBe('f-38526af43cd073cf');
    expect(S().fileId('s1"><x>')).toBe('f-e7cc1dfd19a34d1c');
    expect(S().fileId('acc 1')).toBe('f-3fed136d47b6db00');
  });
});
