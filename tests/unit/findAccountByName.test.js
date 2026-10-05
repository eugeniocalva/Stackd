import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-30) F0 shared helper: Store.findAccountByName(name, exceptId),
// the account twin of findCategoryByName (1.0.1 BUG-11). Trimmed,
// case-insensitive, across every currency and type, because backups name an
// account by its name. Read-only and UI-only: ADD_ACCOUNT / UPDATE_ACCOUNT
// stay ungated (imports, tests, Bank Connect).

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let Store;
const boot = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
  let uid = 0;
  global.window = {
    crypto: { randomUUID: () => 'acc-' + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js']) executeFile(f);
  Store = global.window.Store;
  Store.init();
  Store.dispatch('SET_CURRENCY', 'EUR');
};
const acc = (name) => Store.getState().accounts.find(a => a.name === name);

describe('Store.findAccountByName (1.0.2 BUG-30)', () => {
  beforeEach(() => {
    boot();
    Store.dispatch('ADD_ACCOUNT', { name: 'Visa', type: 'Credit card', currency: 'EUR', openingBalance: 0 });
    Store.dispatch('ADD_ACCOUNT', { name: 'Revolut', type: 'Bank', currency: 'USD', openingBalance: 0 });
  });

  it('is trimmed, case-insensitive and currency/type-agnostic', () => {
    expect(Store.findAccountByName(' visa ')).toBe(acc('Visa'));
    expect(Store.findAccountByName('VISA')).toBe(acc('Visa'));
    expect(Store.findAccountByName('revolut')).toBe(acc('Revolut')); // USD account, EUR base
    expect(Store.findAccountByName('Revolut\t')).toBe(acc('Revolut'));
    expect(Store.findAccountByName('Visa Gold')).toBeNull();
    expect(Store.findAccountByName('Vis')).toBeNull();
  });

  it('matches a stored name that has stray spaces or another case', () => {
    Store.dispatch('ADD_ACCOUNT', { name: '  Cash Box ', openingBalance: 0 });
    expect(Store.findAccountByName('cash box')).toBe(acc('  Cash Box '));
  });

  it('honours exceptId (a rename that keeps its own name, re-cased, is no clash)', () => {
    const visa = acc('Visa');
    expect(Store.findAccountByName('visa', visa.id)).toBeNull();
    expect(Store.findAccountByName('Revolut', visa.id)).toBe(acc('Revolut'));
    // An existing duplicate pair: excepting one still finds the other.
    Store.dispatch('ADD_ACCOUNT', { name: 'VISA', openingBalance: 0 });
    const dup = Store.getState().accounts.find(a => a.name === 'VISA');
    expect(Store.findAccountByName('visa', visa.id)).toBe(dup);
    expect(Store.findAccountByName('visa', dup.id)).toBe(visa);
  });

  it("'' / blanks / null / undefined return null, and a nameless account never matches", () => {
    Store.dispatch('ADD_ACCOUNT', { name: undefined, openingBalance: 0 });
    expect(Store.findAccountByName('')).toBeNull();
    expect(Store.findAccountByName('   ')).toBeNull();
    expect(Store.findAccountByName(null)).toBeNull();
    expect(Store.findAccountByName(undefined)).toBeNull();
  });

  it('is read-only: no dispatch, no save, no state change', () => {
    const before = JSON.stringify(Store.getState().accounts);
    const saves = global.window.localStorage.setItem.mock.calls.length;
    Store.findAccountByName('visa');
    expect(JSON.stringify(Store.getState().accounts)).toBe(before);
    expect(global.window.localStorage.setItem.mock.calls.length).toBe(saves);
  });
});
