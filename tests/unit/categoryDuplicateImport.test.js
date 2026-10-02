import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-11, import side): a backup that holds two categories with the
// same name used to upsert both rows by name, so the second row (a custom
// "Groceries" with a pin) overwrote the seeded Groceries' cart icon. The
// import now keeps one row per (trimmed, case-insensitive) name — the row
// whose id is the existing same-name category, else the first — and skips
// the rest as 'duplicate category name'.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'c' + (++bootNo) + '-uuid-';
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.FileReader = class {
    readAsText(file) { this.onload({ target: { result: file.text } }); }
  };
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  global.window.Store.init();
};

const S = () => window.Store;
const named = (name) => S().getState().categories.filter(c => c.name.trim().toLowerCase() === name.toLowerCase());
const importFile = (csv) => {
  let out;
  window.StackdImport.importCSV({ text: csv }, S().getState(), (r) => { out = r; }, (err) => { throw err; });
  return out;
};

// A legacy file: the custom duplicate sorts FIRST, the seeded default second.
const DUP_CATEGORIES = [
  'id,name,icon,type_hint',
  'x-custom-1,groceries ,pin,both',
  'cat_groceries,Groceries,shopping-cart,expense',
  'x-hobby,Hobbies,guitar,expense'
].join('\n');

describe('1.0.1 (BUG-11) duplicate category names on import', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps the seeded default and skips the duplicate row', () => {
    const result = importFile(DUP_CATEGORIES);
    expect(result.kind).toBe('categories');
    expect(result.skipped['duplicate category name']).toBe(1);
    expect(result.importedCount).toBe(2);
    const groceries = named('Groceries');
    expect(groceries).toHaveLength(1);
    expect(groceries[0].id).toBe('cat_groceries');
    expect(groceries[0].icon).toBe('shopping-cart');
    expect(named('Hobbies')).toHaveLength(1);
  });

  it('same result when the transactions file came first', () => {
    const tx = [
      'Date,Time,Type,Amount,Account,Category,Note',
      '2026-09-03,10:00,expense,12.5,Main Bank,Groceries,milk',
      '2026-09-04,10:00,expense,30,Main Bank,Hobbies,strings'
    ].join('\n');
    expect(importFile(tx).kind).toBe('transactions');
    const result = importFile(DUP_CATEGORIES);
    expect(result.skipped['duplicate category name']).toBe(1);
    const groceries = named('Groceries');
    expect(groceries).toHaveLength(1);
    expect(groceries[0].icon).toBe('shopping-cart');
    // The category the transactions file created is updated by name.
    const hobbies = named('Hobbies');
    expect(hobbies).toHaveLength(1);
    expect(hobbies[0].icon).toBe('guitar');
    expect(hobbies[0].typeHint).toBe('expense');
  });

  it('with no id match, the first same-name row wins', () => {
    const csv = [
      'id,name,icon,type_hint',
      'a1,Pets,dog,expense',
      'a2,PETS,cat,income'
    ].join('\n');
    const result = importFile(csv);
    expect(result.skipped['duplicate category name']).toBe(1);
    const pets = named('Pets');
    expect(pets).toHaveLength(1);
    expect(pets[0].icon).toBe('dog');
    expect(pets[0].typeHint).toBe('expense');
  });

  it('a renamed default still upserts by name', () => {
    S().dispatch('UPDATE_CATEGORY', { id: 'cat_groceries', name: 'Food' });
    const csv = [
      'id,name,icon,type_hint',
      'other-install-id,Food,apple,expense'
    ].join('\n');
    const result = importFile(csv);
    expect(result.skippedCount).toBe(0);
    const food = named('Food');
    expect(food).toHaveLength(1);
    expect(food[0].id).toBe('cat_groceries');
    expect(food[0].icon).toBe('apple');
  });

  it('a duplicate already in this install: the row is applied to the category its id names', () => {
    S().dispatch('ADD_CATEGORY', { id: 'x-custom-1', name: 'Groceries', icon: 'pin', typeHint: 'both' });
    expect(named('Groceries')).toHaveLength(2);
    const csv = [
      'id,name,icon,type_hint',
      'x-custom-1,Groceries,carrot,both'
    ].join('\n');
    importFile(csv);
    expect(S().getState().categories.find(c => c.id === 'x-custom-1').icon).toBe('carrot');
    expect(S().getState().categories.find(c => c.id === 'cat_groceries').icon).toBe('shopping-cart');
  });

  it('a full export with a duplicate restores one category with the right icon', () => {
    S().dispatch('ADD_CATEGORY', { name: 'Groceries', icon: 'pin', typeHint: 'expense' });
    let csv;
    window.StackdExport._download = (name, content) => { csv = content; };
    window.StackdExport.exportCategories(S().getState());

    boot();
    const result = importFile(csv);
    expect(result.skipped['duplicate category name']).toBe(1);
    const groceries = named('Groceries');
    expect(groceries).toHaveLength(1);
    expect(groceries[0].icon).toBe('shopping-cart');
  });
});
