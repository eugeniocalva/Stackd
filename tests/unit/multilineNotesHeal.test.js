import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (R1, BUG-33 follow-up): camt imports before 1.0.2 stored line breaks
// in notes. The note field is a one-line input that drops them, so opening and
// saving such a row merged the words ('SupermercatoRossi'). The boot heal
// flattens them once, the same rule every import applies since 1.0.2.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const P = 'stackd_v1_';
let saveSpy;
const boot = (transactions) => {
  const m = new Map(Object.entries({
    [P + 'accounts']: JSON.stringify([{ id: 'A', name: 'Main', color: '#0075EB', icon: 'wallet', type: 'Account', currency: 'EUR', createdAt: '2026-01-01T10:00:00.000Z' }]),
    [P + 'transactions']: JSON.stringify(transactions),
    [P + 'currency']: JSON.stringify('EUR'),
    [P + 'homeWidgets']: '[]'
  }));
  let uid = 0;
  global.window = {
    crypto: { randomUUID: () => 'h-uuid-' + (++uid) },
    localStorage: {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); }
    }
  };
  global.localStorage = global.window.localStorage;
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'store.js']) executeFile(f);
  saveSpy = vi.fn(global.window.StackdDB.save.bind(global.window.StackdDB));
  global.window.StackdDB.save = saveSpy;
  global.window.Store.init();
  return m;
};
const ROW = (id, comment, extra = {}) => ({ id, type: 'expense', amount: 54.3, accountId: 'A', categoryId: '', date: '2026-01-03',
  time: '10:00:00', comment, createdAt: '2026-01-03T10:00:00.000Z', ...extra });
const txSaves = () => saveSpy.mock.calls.filter(c => c[0] === 'transactions').length;

describe('1.0.2 (R1) multi-line notes already stored are flattened at boot', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('flattens a stored line break once; the import key is untouched', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    const key = 'fp:A|2026-01-03|expense|5430|supermercato rossi spesa';
    const m = boot([
      ROW('t1', 'Supermercato\nRossi — Spesa', { importKey: key }),
      ROW('t2', 'PAGAMENTO POS \r\n  BAR CENTRALE', { amount: 3.2 }),
      ROW('t3', 'Plain note', { amount: 1 })
    ]);
    const t = (id) => window.Store.getState().transactions.find(x => x.id === id);
    expect(t('t1').comment).toBe('Supermercato Rossi — Spesa');
    expect(t('t1').importKey).toBe(key);
    expect(t('t2').comment).toBe('PAGAMENTO POS BAR CENTRALE');
    expect(t('t3').comment).toBe('Plain note');
    expect(txSaves()).toBeGreaterThan(0);
    expect(m.get(P + 'transactions')).not.toMatch(/\\n|\\r/);
  });

  it('guard: a store without line breaks is not saved', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot([ROW('t1', 'Supermercato Rossi — Spesa'), ROW('t2', '', { amount: 2 })]);
    expect(txSaves()).toBe(0);
  });
});
