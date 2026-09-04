import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Same executeFile pattern as store.test.js — src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Import match/link + transfer detection (v1.03, plan §7)', () => {
  let mainId, otherId;

  const item = (tx) => ({ tx, duplicate: false, error: null, include: true });
  const bankTx = (accountId, over = {}) => ({
    type: 'expense', amount: 45.9, accountId, categoryId: '',
    date: '2026-01-03', comment: 'SUPERMERCATO ROSSI',
    importKey: 'ref:' + accountId + '|' + (over.ref || 'R1'),
    ...over
  });

  beforeEach(() => {
    let uid = 0;
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + (++uid) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('import.js');

    global.window.Store.init();
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0 });
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
    const accs = window.Store.getState().accounts;
    mainId = accs.find(a => a.name === 'Main').id;
    otherId = accs.find(a => a.name === 'Savings').id;
  });

  // ── annotateImportMatches ──────────────────────────────────────────────────

  describe('annotateImportMatches', () => {
    it('suggests linking to a same-account, same-amount row within ±3 days', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: mainId,
        categoryId: 'cat_groceries', date: '2026-01-01', comment: 'Rent-ish manual entry'
      });
      const items = [item(bankTx(mainId))];
      window.StackdImport.annotateImportMatches(items, mainId);

      expect(items[0].match).toBeTruthy();
      expect(items[0].match.comment).toBe('Rent-ish manual entry');
      expect(items[0].matchAction).toBe('link');
      expect(items[0].transfer).toBeUndefined();
    });

    it('picks the closest date, never an imported or already-claimed row', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: mainId, categoryId: '', date: '2026-01-06', comment: 'far'
      });
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: mainId, categoryId: '', date: '2026-01-04', comment: 'near'
      });
      // an imported row can never be a link target
      window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', {
        transactions: [bankTx(mainId, { date: '2026-01-03', ref: 'ALREADY' })]
      });

      const items = [item(bankTx(mainId, { ref: 'A' })), item(bankTx(mainId, { ref: 'B' }))];
      window.StackdImport.annotateImportMatches(items, mainId);

      expect(items[0].match.comment).toBe('near');
      expect(items[1].match.comment).toBe('far'); // 'near' already claimed
    });

    it('rejects matches outside ±3 days and different amounts', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: mainId, categoryId: '', date: '2026-01-08'
      });
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 46.9, accountId: mainId, categoryId: '', date: '2026-01-03'
      });
      const items = [item(bankTx(mainId))];
      window.StackdImport.annotateImportMatches(items, mainId);
      expect(items[0].match).toBeUndefined();
    });

    it('suggests a transfer pair for an opposite-type row in another account within ±2 days', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'income', amount: 45.9, accountId: otherId, categoryId: 'cat_salary', date: '2026-01-04'
      });
      const items = [item(bankTx(mainId))];
      window.StackdImport.annotateImportMatches(items, mainId);

      expect(items[0].match).toBeUndefined();
      expect(items[0].transfer).toBeTruthy();
      expect(items[0].transfer.accountName).toBe('Savings');
      expect(items[0].transferAction).toBe('pair');
    });

    it('never offers transfer pairing for recurring, already-paired or foreign-currency rows', () => {
      // recurring
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'income', amount: 45.9, accountId: otherId, categoryId: '', date: '2026-01-03',
        recurrence: { interval: 1, frequency: 'months', endDate: '2026-06-01' }
      });
      const items1 = [item(bankTx(mainId))];
      window.StackdImport.annotateImportMatches(items1, mainId);
      expect(items1[0].transfer).toBeUndefined();

      // foreign currency account
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Euro', openingBalance: 0, currency: 'EUR' });
      const euroId = window.Store.getState().accounts.find(a => a.name === 'Euro').id;
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'income', amount: 45.9, accountId: euroId, categoryId: '', date: '2026-01-03'
      });
      const items2 = [item(bankTx(mainId, { ref: 'C' }))];
      window.StackdImport.annotateImportMatches(items2, mainId);
      expect(items2[0].transfer).toBeUndefined();
    });

    it('a same-account match wins over a cross-account transfer candidate', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: mainId, categoryId: '', date: '2026-01-03', comment: 'same acct'
      });
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'income', amount: 45.9, accountId: otherId, categoryId: '', date: '2026-01-03'
      });
      const items = [item(bankTx(mainId))];
      window.StackdImport.annotateImportMatches(items, mainId);
      expect(items[0].match).toBeTruthy();
      expect(items[0].transfer).toBeUndefined();
    });

    it('skips duplicate and error items entirely', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: mainId, categoryId: '', date: '2026-01-03'
      });
      const items = [
        { tx: bankTx(mainId), duplicate: true, error: null },
        { tx: null, duplicate: false, error: 'invalid amount' }
      ];
      window.StackdImport.annotateImportMatches(items, mainId);
      expect(items[0].match).toBeUndefined();
      expect(items[1].match).toBeUndefined();
    });
  });

  // ── APPLY_IMPORT_MATCHES ───────────────────────────────────────────────────

  describe('APPLY_IMPORT_MATCHES', () => {
    it('link stamps importKey/bankRef on the existing row and NOTHING else', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: mainId, categoryId: 'cat_groceries',
        date: '2026-01-01', comment: 'manual', recurrence: { interval: 1, frequency: 'months', endDate: '2026-12-01' }
      });
      // the series materializes its whole chain — grab one member and pin its
      // exact pre-link shape (whatever its date is within the chain)
      const target = window.Store.getState().transactions.find(t => t.comment === 'manual');
      const dateBefore = target.date;
      const recBefore = JSON.stringify(target.recurrence);
      const countBefore = window.Store.getState().transactions.length;

      window.Store.dispatch('APPLY_IMPORT_MATCHES', {
        links: [{ txId: target.id, importKey: 'ref:' + mainId + '|R1', bankRef: 'R1' }]
      });

      const after = window.Store.getState().transactions.find(t => t.id === target.id);
      expect(after.importKey).toBe('ref:' + mainId + '|R1');
      expect(after.bankRef).toBe('R1');
      expect(after.date).toBe(dateBefore);                    // date untouched
      expect(after.categoryId).toBe('cat_groceries');         // category untouched
      expect(JSON.stringify(after.recurrence)).toBe(recBefore); // recurrence untouched
      expect(window.Store.getState().transactions.length).toBe(countBefore); // no insert
      expect(window.Store.hasImportKey('ref:' + mainId + '|R1')).toBe(true); // future dedup
    });

    it('link refuses a target that already carries an importKey or a taken key', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: mainId, categoryId: '', date: '2026-01-01', comment: 'a'
      });
      const t1 = window.Store.getState().transactions.find(t => t.comment === 'a');
      window.Store.dispatch('APPLY_IMPORT_MATCHES', { links: [{ txId: t1.id, importKey: 'k1' }] });
      window.Store.dispatch('APPLY_IMPORT_MATCHES', { links: [{ txId: t1.id, importKey: 'k2' }] });
      expect(window.Store.getState().transactions.find(t => t.id === t1.id).importKey).toBe('k1');
    });

    it('pair inserts the leg, shares a fresh transferRef and empties both categories', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'income', amount: 45.9, accountId: otherId, categoryId: 'cat_salary', date: '2026-01-04', comment: 'incoming'
      });
      const existing = window.Store.getState().transactions.find(t => t.comment === 'incoming');

      window.Store.dispatch('APPLY_IMPORT_MATCHES', {
        transfers: [{ existingTxId: existing.id, tx: bankTx(mainId) }]
      });

      const state = window.Store.getState();
      const leg = state.transactions.find(t => t.importKey === 'ref:' + mainId + '|R1');
      const targetAfter = state.transactions.find(t => t.id === existing.id);
      expect(leg).toBeTruthy();
      expect(leg.transferRef).toBeTruthy();
      expect(leg.transferRef).toBe(targetAfter.transferRef);
      expect(leg.categoryId).toBe('');
      expect(targetAfter.categoryId).toBe('');
      // analytics excludes transfer legs — the pair adds no income/expense
      const filters = { period: { type: 'custom', start: '2026-01-01', end: '2026-01-31' }, types: [], accounts: [], categories: [], sortOrder: 'desc' };
      expect(window.Store.computeAnalyticalSummary(filters).income).toBe(0);
    });

    it('pair refuses recurring or already-paired targets', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'income', amount: 45.9, accountId: otherId, categoryId: '', date: '2026-01-04',
        comment: 'rec', recurrence: { interval: 1, frequency: 'months', endDate: '2026-12-01' }
      });
      const rec = window.Store.getState().transactions.find(t => t.comment === 'rec');
      const countBefore = window.Store.getState().transactions.length;

      window.Store.dispatch('APPLY_IMPORT_MATCHES', {
        transfers: [{ existingTxId: rec.id, tx: bankTx(mainId) }]
      });

      expect(window.Store.getState().transactions.length).toBe(countBefore);
      expect(window.Store.getState().transactions.find(t => t.id === rec.id).transferRef).toBeUndefined();
    });

    it('a linked row makes a re-import of the same statement flag as duplicate', () => {
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 45.9, accountId: mainId, categoryId: '', date: '2026-01-02', comment: 'manual rent'
      });
      const target = window.Store.getState().transactions.find(t => t.comment === 'manual rent');
      const incoming = bankTx(mainId);
      window.Store.dispatch('APPLY_IMPORT_MATCHES', {
        links: [{ txId: target.id, importKey: incoming.importKey, bankRef: 'R1' }]
      });

      const items = [item(bankTx(mainId))];
      // duplicate flag comes from the builder path; simulate it directly:
      expect(window.Store.hasImportKey(incoming.importKey)).toBe(true);
      window.StackdImport.annotateImportMatches(items, mainId);
      // and the linked row can no longer be matched again
      expect(items[0].match).toBeUndefined();
    });
  });
});
