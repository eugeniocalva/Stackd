import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.06 U2 (docs/import-ux-plan.md §3): the import ending is a success sheet
// whose centrepiece is the reconciliation verdict. The verdict is computed as
// data by Views._ImportShared.reconcileVerdict so the sheet stays dumb.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Import success verdict (v1.06 U2)', () => {
  let accId;
  beforeEach(() => {
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
      StackdHydrateIcons: vi.fn(),
      location: { hash: '#import-preview' }
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    executeFile('router.js');
    global.window.Store.init();
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
    accId = global.window.Store.getState().accounts[0].id;
  });

  const S = () => global.window.Views._ImportShared;
  const draft = (over = {}) => ({
    kind: 'statement',
    accountId: accId,
    statement: { currency: 'USD', closingBalance: { amount: 954.1, date: '2026-01-31' }, ...over.statement },
    ...over
  });

  it('is null for mapped CSVs and for statements without a closing balance', () => {
    expect(S().reconcileVerdict({ kind: 'csv', accountId: accId })).toBeNull();
    expect(S().reconcileVerdict(draft({ statement: { currency: 'USD', closingBalance: null } }))).toBeNull();
    expect(S().reconcileVerdict(draft({ statement: { currency: 'USD', closingBalance: { amount: 1, date: '' } } }))).toBeNull();
    expect(S().reconcileVerdict(null)).toBeNull();
  });

  it('is null when the statement currency differs from the account currency (v1.02 guard)', () => {
    expect(S().reconcileVerdict(draft({ statement: { currency: 'EUR', closingBalance: { amount: 954.1, date: '2026-01-31' } } }))).toBeNull();
  });

  it('reports a match when the app balance at the closing date equals the bank figure', () => {
    global.window.Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 45.9, date: '2026-01-03', accountId: accId, categoryId: 'cat_groceries', comment: 'x' });
    const v = S().reconcileVerdict(draft());
    expect(v).toMatchObject({ ok: true, date: '2026-01-31', bank: '954.10 USD' });
    expect(v.app).toBe('$954.10');
  });

  it('reports a mismatch with both figures formatted when they differ', () => {
    const v = S().reconcileVerdict(draft());
    expect(v.ok).toBe(false);
    expect(v.bank).toBe('954.10 USD');
    expect(v.app).toBe('$1,000.00');
    expect(v.date).toBe('2026-01-31');
  });

  it('tolerates sub-cent rounding noise', () => {
    global.window.Store.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 45.9, date: '2026-01-03', accountId: accId, categoryId: 'cat_groceries', comment: 'x' });
    expect(S().reconcileVerdict(draft({ statement: { currency: 'USD', closingBalance: { amount: 954.104, date: '2026-01-31' } } })).ok).toBe(true);
    expect(S().reconcileVerdict(draft({ statement: { currency: 'USD', closingBalance: { amount: 954.2, date: '2026-01-31' } } })).ok).toBe(false);
  });
});
