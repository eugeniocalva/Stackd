import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.3 review of the recurrence fixes: anchorDay survives a CSV restore
// (inferred from the chain, never the startDate guess), a deleted LAST
// payment stays deleted after a rebuild, an untouched 1.0.2 End Date past the
// cap (29 Feb start) is no schedule change, and a transfer chain converted on
// its own day keeps the anchor.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const pin = (y, m, d) => vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The 1.0.2 stepper, verbatim: each payment stepped from the previous one.
const legacyStep = (s, n, f) => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (f === 'months') {
    const od = dt.getDate();
    dt.setMonth(dt.getMonth() + n);
    if (dt.getDate() !== od) dt.setDate(0);
  } else if (f === 'years') dt.setFullYear(dt.getFullYear() + n);
  return fmt(dt);
};

describe("1.0.3 review findings on the recurrence engine", () => {
  let Store;
  let main, savings;

  const txs = () => Store.getState().transactions;
  const members = (sid) => txs().filter(t => t.recurrence && t.recurrence.seriesId === sid)
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  const dates = (sid) => [...new Set(members(sid).map(t => t.date))];
  const armed = (sid) => members(sid).filter(t => t.recurrence.nextDate);
  const at = (sid, date, type) => members(sid).find(t => t.date === date && (!type || t.type === type));

  const load = () => {
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
  };
  const rebootOn = (stored) => {
    const setItem = vi.fn();
    global.window.localStorage.getItem = (k) => (k in stored ? stored[k] : null);
    global.window.localStorage.setItem = setItem;
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
    return setItem;
  };
  const snapshot = () => ({
    stackd_v1_accounts: JSON.stringify(Store.getState().accounts),
    stackd_v1_transactions: JSON.stringify(Store.getState().transactions)
  });
  const savedTx = (setItem) => setItem.mock.calls.some(([k]) => k === 'stackd_v1_transactions');

  const addSeries = ({ comment, date, endDate, frequency = 'months', interval = 1, type = 'income' }) => {
    Store.dispatch('ADD_TRANSACTION', {
      type, amount: 1800, accountId: main, categoryId: type === 'income' ? 'cat_salary' : 'cat_other', date, comment,
      recurrence: { interval, frequency, endDate }
    });
    return txs().find(t => t.comment === comment && t.date === date).recurrence.seriesId;
  };

  // A series as 1.0.2 stored it: legacy dates, no anchorDay.
  const legacySeries = ({ sid, comment, start, endDate, frequency = 'months', transfer = false }) => {
    const out = [];
    let d = start;
    let n = 0;
    while (d <= endDate && n++ < 200) {
      const rec = { seriesId: sid, interval: 1, frequency, startDate: start, endDate };
      if (transfer) {
        const ref = `${sid}-ref-${n}`;
        out.push({ id: `${sid}-e${n}`, type: 'expense', amount: 50, accountId: main, categoryId: '', date: d, time: '09:00:00', comment, transferRef: ref, tags: [], recurrence: { ...rec }, createdAt: '2026-01-01T00:00:00.000Z' });
        out.push({ id: `${sid}-i${n}`, type: 'income', amount: 50, accountId: savings, categoryId: '', date: d, time: '09:00:00', comment, transferRef: ref, tags: [], recurrence: { ...rec }, createdAt: '2026-01-01T00:00:00.000Z' });
      } else {
        out.push({ id: `${sid}-${n}`, type: 'income', amount: 1800, accountId: main, categoryId: 'cat_salary', date: d, time: '09:00:00', comment, tags: [], recurrence: { ...rec }, createdAt: '2026-01-01T00:00:00.000Z' });
      }
      d = legacyStep(d, 1, frequency);
    }
    const tail = out.filter(t => t.type !== 'income' || !transfer).pop();
    tail.recurrence.nextDate = d;
    Store.state.transactions.push(...out);
    return out;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    pin(2026, 10, 6);
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 11) },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    load();
    Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2500, openingDate: '2026-01-01' });
    Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
    main = Store.getState().accounts.find(a => a.name === 'Main').id;
    savings = Store.getState().accounts.find(a => a.name === 'Savings').id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const stripAnchors = () => {
    Store.state.transactions.forEach(t => {
      if (t.recurrence) { const r = { ...t.recurrence }; delete r.anchorDay; t.recurrence = r; }
    });
  };

  it('a chain re-anchored to the 31st keeps its day after a restore drops anchorDay', () => {
    const sid = addSeries({ comment: 'Pay', date: '2026-10-15', endDate: '2027-09-30' });
    const dec = at(sid, '2026-12-15');
    Store.dispatch('UPDATE_TRANSACTION', { id: dec.id, date: '2026-12-31', recurrence: { interval: 1, frequency: 'months', endDate: '2027-09-30' }, updateFuture: true });
    expect(dates(sid)).toContain('2027-02-28');
    expect(dates(sid)).toContain('2027-03-31');
    stripAnchors(); // what a CSV restore brings back
    const setItem = rebootOn(snapshot());
    expect(savedTx(setItem)).toBe(true);
    expect(at(sid, '2026-11-15').recurrence.anchorDay).toBe(15);
    expect(at(sid, '2027-02-28').recurrence.anchorDay).toBe(31);
    // a 'future' End Date extension from 31 Jan regenerates on the 31st
    const jan = at(sid, '2027-01-31');
    Store.dispatch('UPDATE_TRANSACTION', { id: jan.id, recurrence: { interval: 1, frequency: 'months', endDate: '2027-11-30' }, updateFuture: true });
    const after = dates(sid).filter(d => d > '2027-01-31');
    expect(after.slice(0, 4)).toEqual(['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
    expect(armed(sid)).toHaveLength(1);
    // idempotent: a second boot stamps nothing
    expect(savedTx(rebootOn(snapshot()))).toBe(false);
  });

  it('a 1.0.2 chain the user moved from the 31st to the 30th stays on the 30th', () => {
    const sid = 'legacy-30';
    const ds = ['2026-07-31', '2026-08-30', '2026-09-30', '2026-10-30', '2026-11-30', '2026-12-30'];
    ds.forEach((d, i) => Store.state.transactions.push({
      id: `l30-${i}`, type: 'income', amount: 100, accountId: main, categoryId: 'cat_salary', date: d, time: '09:00:00', comment: 'L30', tags: [],
      recurrence: { seriesId: sid, interval: 1, frequency: 'months', startDate: '2026-07-31', endDate: '2027-06-30', ...(i === ds.length - 1 ? { nextDate: '2027-01-30' } : {}) },
      createdAt: '2026-01-01T00:00:00.000Z'
    }));
    rebootOn(snapshot());
    const tail = at(sid, '2026-12-30');
    expect(tail.recurrence.anchorDay).toBe(30);
    expect(Store._nextSeriesDate('2027-04-30', tail.recurrence)).toBe('2027-05-30');
    expect(dates(sid)).toContain('2027-01-30');
    expect(dates(sid)).toContain('2027-05-30');
    expect(dates(sid)).not.toContain('2027-05-31');
  });

  it('a payment deleted with "Only this" on the last slot stays deleted after a rebuild', () => {
    const sid = addSeries({ comment: 'Rent', date: '2026-11-01', endDate: '2027-06-01', type: 'expense' });
    Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-03-01').id });
    Store.dispatch('UPDATE_TRANSACTION', { id: at(sid, '2026-12-01').id, recurrence: { interval: 1, frequency: 'months', endDate: '2027-03-01' }, updateFuture: true });
    expect(dates(sid)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
    expect(armed(sid)).toHaveLength(1);
    expect(armed(sid)[0].date).toBe('2027-02-01');
    // nothing comes back on the next processing pass
    rebootOn(snapshot());
    expect(dates(sid)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
  });

  it('the same with a date move: the deleted last payment is not rebuilt on its new day', () => {
    const sid = addSeries({ comment: 'Rent2', date: '2026-11-01', endDate: '2027-06-01', type: 'expense' });
    Store.dispatch('DELETE_TRANSACTION', { id: at(sid, '2027-03-01').id });
    Store.dispatch('UPDATE_TRANSACTION', { id: at(sid, '2026-12-01').id, date: '2026-12-02', recurrence: { interval: 1, frequency: 'months', endDate: '2027-03-02' }, updateFuture: true });
    expect(dates(sid)).toEqual(['2026-11-01', '2026-12-02', '2027-01-02', '2027-02-02']);
    expect(armed(sid)).toHaveLength(1);
  });

  it('an untouched 1.0.2 End Date past the cap (29 Feb start) is no schedule change', () => {
    legacySeries({ sid: 'leap', comment: 'Ins', start: '2024-02-29', endDate: '2029-03-01', frequency: 'years' });
    rebootOn(snapshot());
    const future = members('leap').filter(t => t.date > '2026-10-06');
    const custom = future[1];
    Store.dispatch('UPDATE_TRANSACTION', { id: custom.id, isPaid: false });
    const ids = members('leap').map(t => t.id).sort();
    const sched = Store.getSeriesSchedule('leap');
    Store.dispatch('UPDATE_TRANSACTION', {
      id: future[0].id, amount: 1900,
      recurrence: { interval: 1, frequency: 'years', endDate: sched.endDate }, updateFuture: true
    });
    expect(members('leap').map(t => t.id).sort()).toEqual(ids); // no rebuild
    expect(members('leap').find(t => t.id === custom.id).isPaid).toBe(false);
    expect(members('leap').find(t => t.id === custom.id).amount).toBe(1900);
  });

  it('a transfer chain created with an anchorDay keeps it (plain → transfer on its own day)', () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 50, expenseAccountId: main, incomeAccountId: savings, date: '2026-11-30', note: 'Conv', tags: [],
      recurrence: { interval: 1, frequency: 'months', endDate: '2027-03-31', seriesId: 'conv', anchorDay: 31 }
    });
    expect(dates('conv')).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
  });
});
