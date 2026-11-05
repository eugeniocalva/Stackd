import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.2.0 (UX-10): attachment metas ride on transactions; the bytes live in
// window.Attachments. The store keeps a receipt on ONE row (never cloned onto
// generated series members or propagated by a scoped edit; a transfer keeps
// it on its expense leg) and hands the files of every meta no row references
// any more to Attachments.removeAll once a change lands — never inside
// Store.dryRun, never for a rolled-back change. RESET_APP wipes them all and
// the boot sweeps the orphans.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const makeLocalStorage = () => {
  const map = new Map();
  const size = () => { let n = 0; map.forEach((v, k) => { n += k.length + v.length; }); return n; };
  const ls = {
    quota: null,
    fail: false,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      if (ls.fail || ls.quota != null) {
        const cur = map.has(k) ? k.length + map.get(k).length : 0;
        if (ls.fail || size() - cur + k.length + s.length > ls.quota) {
          const e = new Error('The quota has been exceeded.');
          e.name = 'QuotaExceededError';
          throw e;
        }
      }
      map.set(k, s);
    },
    removeItem: (k) => { map.delete(k); },
    size
  };
  return ls;
};

let ls;
let uid = 0;
let Att;
const S = () => global.window.Store;
const txs = () => S().getState().transactions;

const load = () => {
  Att = { removeAll: vi.fn(async () => 0), clear: vi.fn(async () => true), sweep: vi.fn(async () => 0) };
  global.window = {
    crypto: { randomUUID: () => 'u-' + (++uid) },
    localStorage: ls,
    StackdHydrateIcons: vi.fn(),
    Attachments: Att
  };
  global.localStorage = ls;
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js'].forEach(executeFile);
  global.window.Components = { NoticeSheet: { show: vi.fn() } };
};
const boot = () => { ls = makeLocalStorage(); load(); S().init(); };
const relaunch = () => { load(); S().init(); };

const meta = (id, kind = 'image') => ({ id, kind, name: id + (kind === 'pdf' ? '.pdf' : '.jpg'), ext: kind === 'pdf' ? 'pdf' : 'jpg', mime: kind === 'pdf' ? 'application/pdf' : 'image/jpeg', size: 10, addedAt: '2026-11-05T10:00:00.000Z' });
const ids = (list) => (list || []).map(m => m.id).sort();

let main;
let savings;
beforeEach(() => {
  boot();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
  S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
  main = S().getState().accounts.find(a => a.name === 'Main');
  savings = S().getState().accounts.find(a => a.name === 'Savings');
  Att.removeAll.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); });

const addExpense = (extra = {}) => {
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12, accountId: main.id, categoryId: 'cat_groceries', date: '2026-09-01', comment: 'lunch', ...extra });
  return txs().find(t => t.comment === (extra.comment || 'lunch') && t.type === 'expense' && !t.transferRef);
};

describe('Attachments stay on one row (1.2.0, UX-10)', () => {
  it('ADD_TRANSACTION keeps the metas; generated series members never carry them', () => {
    const rec = { interval: 1, frequency: 'months', endDate: '2027-01-01' };
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 50, accountId: main.id, categoryId: 'cat_rent', date: '2026-09-01', comment: 'rent', recurrence: rec, attachments: [meta('a1')] });
    const series = txs().filter(t => t.comment === 'rent');
    expect(series.length).toBeGreaterThan(3);
    const withAtt = series.filter(t => Array.isArray(t.attachments) && t.attachments.length);
    expect(withAtt).toHaveLength(1);
    expect(withAtt[0].date).toBe('2026-09-01');
    expect(ids(withAtt[0].attachments)).toEqual(['a1']);
  });

  it("a scoped edit ('this and future' / 'all') never copies the edited payment's receipts", () => {
    const rec = { interval: 1, frequency: 'months', endDate: '2027-01-01' };
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 50, accountId: main.id, categoryId: 'cat_rent', date: '2026-09-01', comment: 'rent', recurrence: rec });
    const first = txs().filter(t => t.comment === 'rent').sort((a, b) => a.date.localeCompare(b.date))[0];
    S().dispatch('UPDATE_TRANSACTION', { id: first.id, comment: 'rent2', attachments: [meta('b1')], updateAll: true });
    const series = txs().filter(t => t.comment === 'rent2');
    expect(series.length).toBeGreaterThan(3);
    expect(series.filter(t => t.attachments && t.attachments.length).map(t => t.id)).toEqual([first.id]);
  });

  it('ADD_TRANSFER stores the metas on the expense leg only; generated pairs carry none', () => {
    const rec = { interval: 1, frequency: 'months', endDate: '2026-12-01' };
    S().dispatch('ADD_TRANSFER', { amount: 20, expenseAccountId: main.id, incomeAccountId: savings.id, date: '2026-09-01', note: 'move', recurrence: rec, attachments: [meta('t1', 'pdf')] });
    const legs = txs().filter(t => t.transferRef && t.comment === 'move');
    expect(legs.length).toBeGreaterThan(2);
    const carrying = legs.filter(t => t.attachments && t.attachments.length);
    expect(carrying).toHaveLength(1);
    expect(carrying[0].type).toBe('expense');
    expect(carrying[0].date).toBe('2026-09-01');
  });

  it('UPDATE_TRANSFER sets the expense leg, clears any copy on the income leg, [] removes', () => {
    S().dispatch('ADD_TRANSFER', { amount: 20, expenseAccountId: main.id, incomeAccountId: savings.id, date: '2026-09-01', note: 'move' });
    const ref = txs().find(t => t.comment === 'move').transferRef;
    const inc = txs().find(t => t.transferRef === ref && t.type === 'income');
    inc.attachments = [meta('legacy')]; // e.g. a hand-edited backup
    S().dispatch('UPDATE_TRANSFER', { transferRef: ref, attachments: [meta('t2')] });
    const leg = (type) => txs().find(t => t.transferRef === ref && t.type === type);
    expect(ids(leg('expense').attachments)).toEqual(['t2']);
    expect(leg('income').attachments).toBeUndefined();
    S().dispatch('UPDATE_TRANSFER', { transferRef: ref, attachments: [] });
    expect(leg('expense').attachments).toBeUndefined();
    // an edit that does not send the key leaves them alone
    S().dispatch('UPDATE_TRANSFER', { transferRef: ref, attachments: [meta('t3')] });
    S().dispatch('UPDATE_TRANSFER', { transferRef: ref, note: 'moved' });
    expect(ids(leg('expense').attachments)).toEqual(['t3']);
  });
});

describe('Attachment files follow their rows (1.2.0, UX-10)', () => {
  it('DELETE_TRANSACTION hands the deleted row’s metas to Attachments.removeAll', () => {
    const tx = addExpense({ attachments: [meta('d1'), meta('d2', 'pdf')] });
    expect(Att.removeAll).not.toHaveBeenCalled();
    S().dispatch('DELETE_TRANSACTION', { id: tx.id });
    expect(Att.removeAll).toHaveBeenCalledTimes(1);
    expect(ids(Att.removeAll.mock.calls[0][0])).toEqual(['d1', 'd2']);
  });

  it('a receipt removed in an edit is deleted once the save lands; the kept one stays', () => {
    const tx = addExpense({ attachments: [meta('k1'), meta('r1')] });
    S().dispatch('UPDATE_TRANSACTION', { id: tx.id, attachments: [meta('k1')] });
    expect(ids(Att.removeAll.mock.calls[0][0])).toEqual(['r1']);
  });

  it('DELETE_BULK_TRANSACTIONS and DELETE_ACCOUNT clean up too', () => {
    const a = addExpense({ comment: 'a', attachments: [meta('b1')] });
    const b = addExpense({ comment: 'b', attachments: [meta('b2')] });
    S().dispatch('DELETE_BULK_TRANSACTIONS', { ids: [a.id, b.id] });
    expect(ids(Att.removeAll.mock.calls[0][0])).toEqual(['b1', 'b2']);
    Att.removeAll.mockClear();
    addExpense({ comment: 'c', attachments: [meta('acc1')] });
    S().dispatch('DELETE_ACCOUNT', { id: main.id });
    expect(ids(Att.removeAll.mock.calls[0][0])).toEqual(['acc1']);
  });

  it('a meta that moves to another row in the same change is not deleted (regular → transfer)', () => {
    const tx = addExpense({ attachments: [meta('m1')] });
    S().batch(() => {
      S().dispatch('DELETE_TRANSACTION', { id: tx.id });
      S().dispatch('ADD_TRANSFER', { amount: 12, expenseAccountId: main.id, incomeAccountId: savings.id, date: '2026-09-01', note: 'lunch', attachments: tx.attachments });
    });
    expect(Att.removeAll).not.toHaveBeenCalled();
    expect(txs().some(t => t.attachments && t.attachments[0].id === 'm1')).toBe(true);
  });

  it('nothing is deleted inside Store.dryRun (an import Check) — and the row is back afterwards', () => {
    const tx = addExpense({ attachments: [meta('dry1')] });
    S().dryRun(() => {
      S().dispatch('DELETE_TRANSACTION', { id: tx.id });
      S().dispatch('RESET_APP');
    });
    expect(Att.removeAll).not.toHaveBeenCalled();
    expect(Att.clear).not.toHaveBeenCalled();
    expect(txs().some(t => t.id === tx.id)).toBe(true);
    // the index survived the dry run: a real delete afterwards still cleans up
    S().dispatch('DELETE_TRANSACTION', { id: tx.id });
    expect(ids(Att.removeAll.mock.calls[0][0])).toEqual(['dry1']);
  });

  it('a delete that does not save (storage full) keeps every file', () => {
    const tx = addExpense({ attachments: [meta('full1')] });
    ls.fail = true; // every write refused
    const ok = S().dispatch('DELETE_TRANSACTION', { id: tx.id });
    expect(ok).toBe(false);
    expect(txs().some(t => t.id === tx.id)).toBe(true);
    expect(Att.removeAll).not.toHaveBeenCalled();
    // control: the same delete, once it saves, does hand the file over
    ls.fail = false;
    expect(S().dispatch('DELETE_TRANSACTION', { id: tx.id })).not.toBe(false);
    expect(Att.removeAll).toHaveBeenCalledTimes(1);
    expect(ids(Att.removeAll.mock.calls[0][0])).toEqual(['full1']);
  });

  it('RESET_APP wipes every attachment once it lands', () => {
    addExpense({ attachments: [meta('z1')] });
    S().dispatch('RESET_APP');
    expect(Att.clear).toHaveBeenCalledTimes(1);
  });
});

describe('Boot sweep (1.2.0, UX-10)', () => {
  it('sweeps with the ids every row still references', () => {
    addExpense({ attachments: [meta('s1'), meta('s2')] });
    addExpense({ comment: 'other', attachments: [meta('s3', 'pdf')] });
    relaunch();
    expect(Att.sweep).toHaveBeenCalledTimes(1);
    const live = Att.sweep.mock.calls[0][0];
    expect(live instanceof Set).toBe(true);
    expect([...live].sort()).toEqual(['s1', 's2', 's3']);
  });

  it('is skipped when there are no rows (an unreadable transactions key never wipes the receipts)', () => {
    addExpense({ attachments: [meta('k1')] });
    // control: a boot with rows sweeps
    relaunch();
    expect(Att.sweep).toHaveBeenCalledTimes(1);
    ls.setItem('stackd_v1_transactions', '{not json');
    relaunch(); // a fresh Attachments mock
    expect(S().getState().transactions).toHaveLength(0);
    expect(Att.sweep).not.toHaveBeenCalled();
  });
});
