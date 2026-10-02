import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-14): deleting an account must not leave the OTHER account's
// transfer leg pointing at nothing. The survivor becomes a plain (Uncategorized)
// income/expense with a note, the series generator is handed over when the
// deleted account held it, and a boot heal repairs orphans already on devices.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const mapStorage = (seed = {}) => {
  const bag = { ...seed };
  return {
    getItem: k => (k in bag ? bag[k] : null),
    setItem: (k, v) => { bag[k] = String(v); },
    removeItem: k => { delete bag[k]; },
    _bag: bag,
  };
};

const makeWindow = (storage, extra = {}) => {
  global.window = {
    crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
    localStorage: storage,
    ...extra,
  };
  global.localStorage = global.window.localStorage;
};

const loadStore = (withLangs = false) => {
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  if (withLangs) executeFile('i18n/it.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  return global.window.Store;
};

const NOTE_TO = 'Transfer to deleted account “Visa Card”';
const NOTE_FROM = 'Transfer from deleted account “Visa Card”';

describe('DELETE_ACCOUNT unlinks transfer counterparts (1.0.1 BUG-14)', () => {
  let S, mainId, visaId, savingsId;

  const txs = () => S.getState().transactions;
  const singleUseRefs = () => {
    const counts = {};
    txs().forEach(t => { if (t.transferRef) counts[t.transferRef] = (counts[t.transferRef] || 0) + 1; });
    return Object.keys(counts).filter(r => counts[r] < 2);
  };
  const series = (sid) => txs().filter(t => t.recurrence && t.recurrence.seriesId === sid);
  const armed = (sid) => series(sid).filter(t => t.recurrence.nextDate);

  const transfer = (from, to, extra = {}) => {
    S.dispatch('ADD_TRANSFER', {
      amount: 200, expenseAccountId: from, incomeAccountId: to,
      date: '2026-09-10', note: 'Card payment', tags: [], ...extra,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0)); // 2026-10-01
    makeWindow(mapStorage());
    S = loadStore(true);
    S.init();
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-01-01' });
    S.dispatch('ADD_ACCOUNT', { name: 'Visa Card', openingBalance: 0, openingDate: '2026-01-01' });
    S.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
    const accs = S.getState().accounts;
    mainId = accs.find(a => a.name === 'Main').id;
    visaId = accs.find(a => a.name === 'Visa Card').id;
    savingsId = accs.find(a => a.name === 'Savings').id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('one-off Main -> Visa: the Main leg survives as a plain Uncategorized expense with a note', () => {
    transfer(mainId, visaId);
    const balanceBefore = S.getAccountBalance(mainId);
    const leg = txs().find(t => t.accountId === mainId && t.type === 'expense' && t.transferRef);

    S.dispatch('DELETE_ACCOUNT', { id: visaId });

    const after = txs().find(t => t.id === leg.id);
    expect(after).toBeTruthy();
    expect(after.transferRef).toBeFalsy();
    expect(after.type).toBe('expense');
    expect(after.amount).toBe(200);
    expect(after.date).toBe('2026-09-10');
    expect(after.categoryId).toBe('');
    expect(after.comment).toBe('Card payment · ' + NOTE_TO);
    expect(after.comment).not.toContain('"'); // typographic quotes only
    expect(after.updatedAt).toBeTruthy();
    expect(S.getAccountBalance(mainId)).toBe(balanceBefore);
    expect(txs().some(t => t.accountId === visaId)).toBe(false);
    expect(S.getState().accounts.some(a => a.id === visaId)).toBe(false);
    expect(singleUseRefs()).toEqual([]);
    // persisted
    const stored = JSON.parse(global.window.localStorage.getItem('stackd_v1_transactions'));
    expect(stored.find(t => t.id === leg.id).transferRef).toBeFalsy();
  });

  it('one-off Visa -> Main with no note: the income leg gets exactly the "from" note', () => {
    transfer(visaId, mainId, { note: '' });
    const leg = txs().find(t => t.accountId === mainId && t.type === 'income' && t.transferRef);

    S.dispatch('DELETE_ACCOUNT', { id: visaId });

    const after = txs().find(t => t.id === leg.id);
    expect(after.transferRef).toBeFalsy();
    expect(after.type).toBe('income');
    expect(after.comment).toBe(NOTE_FROM);
  });

  it('leaves an unrelated pair between two other accounts untouched', () => {
    transfer(mainId, visaId);
    transfer(mainId, savingsId, { note: 'Sweep' });
    const pair = txs().filter(t => t.comment === 'Sweep');
    const ref = pair[0].transferRef;
    const snapshot = JSON.stringify(pair);

    S.dispatch('DELETE_ACCOUNT', { id: visaId });

    const pairAfter = txs().filter(t => t.transferRef === ref);
    expect(pairAfter).toHaveLength(2);
    expect(JSON.stringify(pairAfter)).toBe(snapshot);
  });

  it('a converted leg now counts in analytics as an Uncategorized expense', () => {
    transfer(mainId, visaId);
    const filters = {
      period: { type: 'custom', start: '2026-09-01', end: '2026-09-30' },
      types: [], accounts: [], categories: [], sortOrder: 'desc',
    };
    expect(S.computeAnalyticalSummary(filters).expense).toBe(0);

    S.dispatch('DELETE_ACCOUNT', { id: visaId });

    expect(S.computeAnalyticalSummary(filters).expense).toBe(200);
  });

  it('keeps a legacy .note text, prefixed to the new comment', () => {
    transfer(mainId, visaId);
    const leg = txs().find(t => t.accountId === mainId && t.transferRef);
    delete leg.comment;
    leg.note = 'Old text';

    S.dispatch('DELETE_ACCOUNT', { id: visaId });

    expect(txs().find(t => t.id === leg.id).comment).toBe('Old text · ' + NOTE_TO);
  });

  it('writes the note in the UI language at deletion time and never rewrites it', () => {
    S.dispatch('SET_LANGUAGE', 'it');
    transfer(mainId, visaId);
    const leg = txs().find(t => t.accountId === mainId && t.transferRef);

    S.dispatch('DELETE_ACCOUNT', { id: visaId });
    const itNote = 'Card payment · Trasferimento verso il conto eliminato “Visa Card”';
    expect(txs().find(t => t.id === leg.id).comment).toBe(itNote);

    S.dispatch('SET_LANGUAGE', 'en');
    expect(txs().find(t => t.id === leg.id).comment).toBe(itNote);
  });

  it('an unknown account id changes no transaction', () => {
    transfer(mainId, visaId);
    const snapshot = JSON.stringify(txs());
    S.dispatch('DELETE_ACCOUNT', { id: 'no-such-account' });
    expect(JSON.stringify(txs())).toBe(snapshot);
    expect(S.getState().accounts).toHaveLength(3);
  });

  it('recurring Visa -> Main (Visa holds the armed tail): the generator is handed to the income chain', () => {
    transfer(visaId, mainId, {
      date: '2026-08-15', note: 'Card top-up',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-01-15' },
    });
    const sid = txs().find(t => t.comment === 'Card top-up').recurrence.seriesId;
    expect(armed(sid)).toHaveLength(1);
    expect(armed(sid)[0].accountId).toBe(visaId);

    S.dispatch('DELETE_ACCOUNT', { id: visaId });

    const members = series(sid);
    expect(members).toHaveLength(6); // Aug..Jan, income side only
    members.forEach(t => {
      expect(t.accountId).toBe(mainId);
      expect(t.type).toBe('income');
      expect(t.transferRef).toBeFalsy();
    });
    const gens = armed(sid);
    expect(gens).toHaveLength(1);
    const latest = members.map(t => t.date).sort().pop();
    expect(gens[0].date).toBe(latest);
    expect(gens[0].type).toBe('income');

    // Idempotent: further passes and the boot heal change nothing.
    const snapshot = JSON.stringify(txs());
    S._processRecurringTransactions();
    S._processRecurringTransactions();
    S._healRecurrenceGenerators();
    S._healOrphanTransferLegs();
    expect(JSON.stringify(txs())).toBe(snapshot);
    expect(singleUseRefs()).toEqual([]);
  });

  it('recurring Main -> Visa: the Main expense tail stays armed and extends with plain rows', () => {
    transfer(mainId, visaId, {
      date: '2026-08-15', note: 'Card payoff',
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-01-15' },
    });
    const sid = txs().find(t => t.comment === 'Card payoff').recurrence.seriesId;

    S.dispatch('DELETE_ACCOUNT', { id: visaId });

    const gens = armed(sid);
    expect(gens).toHaveLength(1);
    expect(gens[0].accountId).toBe(mainId);
    expect(gens[0].type).toBe('expense');
    expect(gens[0].transferRef).toBeFalsy();

    // Extend the series from its tail ("this and future"): new members are plain rows.
    const tail = gens[0];
    S.dispatch('UPDATE_TRANSACTION', {
      id: tail.id, type: tail.type, amount: tail.amount, accountId: tail.accountId,
      categoryId: 'cat_other', date: tail.date, time: undefined, comment: tail.comment,
      recurrence: {
        seriesId: sid, interval: 1, frequency: 'months', endDate: '2027-04-15',
        nextDate: S._calculateNextRecurrenceDate(tail.date, 1, 'months'),
      },
      tags: [], updateFuture: true, updateAll: false,
    });

    const dates = series(sid).map(t => t.date).sort();
    expect(dates[dates.length - 1]).toBe('2027-04-15');
    series(sid).forEach(t => expect(t.transferRef).toBeFalsy());
    expect(armed(sid)).toHaveLength(1);
    expect(singleUseRefs()).toEqual([]);
  });

  it('a partly generated daily series from the deleted account still runs to its endDate', () => {
    transfer(visaId, mainId, {
      date: '2026-01-01', note: 'Daily sweep', amount: 1,
      recurrence: { interval: 1, frequency: 'days', endDate: '2030-12-31' },
    });
    const sid = txs().find(t => t.comment === 'Daily sweep').recurrence.seriesId;
    const before = series(sid).map(t => t.date).sort();
    expect(before[before.length - 1] < '2030-12-31').toBe(true); // 1000-iteration cap

    S.dispatch('DELETE_ACCOUNT', { id: visaId });

    const members = series(sid);
    const dates = members.map(t => t.date).sort();
    expect(dates[0]).toBe('2026-01-01');
    expect(dates[dates.length - 1]).toBe('2030-12-31');
    expect(members).toHaveLength(1826);
    expect(armed(sid)).toHaveLength(1);
    expect(members.every(t => !t.transferRef && t.accountId === mainId)).toBe(true);
    expect(singleUseRefs()).toEqual([]);
  });
});

describe('Boot heal for orphaned transfer legs (1.0.1 BUG-14)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('unlinks single-use transferRefs before the first generation pass and keeps full pairs', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    const acc = { id: 'acc_main', name: 'Main', type: 'Checking', color: '#000', icon: 'wallet' };
    const acc2 = { id: 'acc_sav', name: 'Savings', type: 'Savings', color: '#000', icon: 'wallet' };
    const base = { categoryId: '', time: '12:00', tags: [], createdAt: '2026-01-01T00:00:00.000Z' };
    const seeded = [
      { ...base, id: 'ob1', type: 'opening_balance', amount: 500, accountId: 'acc_main', categoryId: 'cat_balance', date: '2026-01-01' },
      { ...base, id: 'ob2', type: 'opening_balance', amount: 0, accountId: 'acc_sav', categoryId: 'cat_balance', date: '2026-01-01' },
      // Orphan: an ARMED monthly expense tail whose income leg was deleted with its account.
      { ...base, id: 'orphan1', type: 'expense', amount: 50, accountId: 'acc_main', date: '2026-09-05', comment: 'Old card',
        transferRef: 'orphan',
        recurrence: { seriesId: 's_orphan', interval: 1, frequency: 'months', startDate: '2026-08-05', endDate: '2026-12-05', nextDate: '2026-10-05' } },
      // Healthy pair.
      { ...base, id: 'p1', type: 'expense', amount: 20, accountId: 'acc_main', date: '2026-09-02', transferRef: 'pair' },
      { ...base, id: 'p2', type: 'income', amount: 20, accountId: 'acc_sav', date: '2026-09-02', transferRef: 'pair' },
    ];
    makeWindow(mapStorage({
      stackd_v1_accounts: JSON.stringify([acc, acc2]),
      stackd_v1_transactions: JSON.stringify(seeded),
      stackd_v1_homeWidgets: '[]',
    }));
    const S = loadStore();
    S.init();

    const txs = S.getState().transactions;
    const orphan = txs.find(t => t.id === 'orphan1');
    expect(orphan.transferRef).toBeFalsy();
    expect(orphan.updatedAt).toBeTruthy();
    expect(txs.find(t => t.id === 'p1').transferRef).toBe('pair');
    expect(txs.find(t => t.id === 'p2').transferRef).toBe('pair');

    // The armed orphan generated PLAIN rows (Oct..Dec), not new orphan legs.
    const members = txs.filter(t => t.recurrence && t.recurrence.seriesId === 's_orphan');
    expect(members.map(t => t.date).sort()).toEqual(['2026-09-05', '2026-10-05', '2026-11-05', '2026-12-05']);
    expect(members.every(t => !t.transferRef)).toBe(true);
    expect(txs.filter(t => t.transferRef)).toHaveLength(2);

    const stored = JSON.parse(global.window.localStorage.getItem('stackd_v1_transactions'));
    expect(stored.find(t => t.id === 'orphan1').transferRef).toBeFalsy();
  });

  it('saves nothing when there is no orphan', () => {
    makeWindow(mapStorage());
    const S = loadStore();
    S.init();
    S.dispatch('ADD_ACCOUNT', { name: 'A', openingBalance: 0 });
    S.dispatch('ADD_ACCOUNT', { name: 'B', openingBalance: 0 });
    const [a, b] = S.getState().accounts;
    S.dispatch('ADD_TRANSFER', { amount: 5, expenseAccountId: a.id, incomeAccountId: b.id, date: '2026-09-01', tags: [] });
    const spy = vi.spyOn(global.window.StackdDB, 'save');
    S._healOrphanTransferLegs();
    expect(spy).not.toHaveBeenCalled();
    expect(S.getState().transactions.filter(t => t.transferRef)).toHaveLength(2);
  });
});

describe('Edit form after the counterpart account is deleted (1.0.1 BUG-14)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    makeWindow(mapStorage(), {
      document: {
        getElementById: () => null,
        createElement: () => ({ style: {}, classList: { add: vi.fn() }, appendChild: vi.fn() }),
      },
      requestAnimationFrame: (cb) => cb(),
      StackdHydrateIcons: vi.fn(),
      Components: {},
      Views: {},
      Router: { getParams: () => ({}) },
    });
    global.document = global.window.document;
    loadStore();
    executeFile('views.js');
    global.window.Store.init();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the surviving leg as a plain expense in its own account, with the note', () => {
    const S = global.window.Store;
    S.dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 1000, openingDate: '2026-01-01' });
    S.dispatch('ADD_ACCOUNT', { name: 'Visa Card', openingBalance: 0, openingDate: '2026-01-01' });
    const bankId = S.getState().accounts.find(a => a.name === 'Bank').id;
    const visaId = S.getState().accounts.find(a => a.name === 'Visa Card').id;
    S.dispatch('ADD_TRANSFER', { amount: 250, expenseAccountId: bankId, incomeAccountId: visaId, date: '2026-09-20', note: 'Card payment', tags: [] });
    const leg = S.getState().transactions.find(t => t.accountId === bankId && t.transferRef);

    S.dispatch('DELETE_ACCOUNT', { id: visaId });

    global.window.Router = { getParams: () => ({ id: leg.id }) };
    const html = global.window.Views.AddTransactionView.render(S.getState());
    expect(html).not.toContain('id="tx-transfer-ref"');
    expect(html).toContain('id="tx-type" value="expense"');
    const open = html.indexOf('id="tx-account"');
    const block = html.slice(open, html.indexOf('</select>', open));
    expect(block).toMatch(new RegExp(`<option value="${bankId}"\\s+selected>`));
    expect(html).toContain('Card payment · Transfer to deleted account “Visa Card”');
  });
});
