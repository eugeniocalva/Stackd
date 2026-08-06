import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// v0.67: recurring-transfer invariants — pair integrity, one generator per
// series (expense leg only), idempotent generation, scope edits.
describe('Recurring transfers and the generation engine', () => {
  let Store;
  let acctA, acctB;

  const txs = () => Store.getState().transactions;
  const series = (sid) => txs().filter(t => t.recurrence && t.recurrence.seriesId === sid);
  const pairsOf = (sid) => {
    const map = new Map();
    series(sid).forEach(t => {
      if (!map.has(t.transferRef)) map.set(t.transferRef, []);
      map.get(t.transferRef).push(t);
    });
    return map;
  };
  const generators = (sid) => series(sid).filter(t => t.recurrence.nextDate);

  // Replicates the views.js transfer-edit payload shape: recurrence rebuilt
  // from the (prefilled) form with a freshly computed nextDate from the date.
  const transferEditPayload = (pairLeg, overrides = {}) => {
    const rec = pairLeg.recurrence;
    const date = overrides.date || pairLeg.date;
    let recurrence;
    if (overrides.recurrence !== undefined) {
      recurrence = overrides.recurrence;
    } else if (rec) {
      recurrence = {
        seriesId: rec.seriesId,
        interval: overrides.interval || rec.interval,
        frequency: overrides.frequency || rec.frequency,
        endDate: overrides.endDate || rec.endDate,
        nextDate: Store._calculateNextRecurrenceDate(date, overrides.interval || rec.interval, overrides.frequency || rec.frequency)
      };
    } else {
      recurrence = null;
    }
    const p = {
      transferRef: pairLeg.transferRef,
      amount: overrides.amount !== undefined ? overrides.amount : Math.abs(pairLeg.amount),
      expenseAccountId: acctA,
      incomeAccountId: acctB,
      date,
      time: undefined,
      note: overrides.note !== undefined ? overrides.note : pairLeg.comment,
      recurrence,
      tags: [],
      updateFuture: !!overrides.updateFuture,
      updateAll: !!overrides.updateAll
    };
    delete p.interval; delete p.frequency; delete p.endDate;
    return p;
  };

  const createMonthlyTransfer = (endDate = '2027-01-15') => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 500,
      expenseAccountId: acctA,
      incomeAccountId: acctB,
      date: '2026-08-15',
      note: 'Savings sweep',
      recurrence: { interval: 1, frequency: 'months', endDate },
      tags: []
    });
    const head = txs().find(t => t.comment === 'Savings sweep' && t.date === '2026-08-15' && t.type === 'expense');
    return head.recurrence.seriesId;
  };

  beforeEach(() => {
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('store.js');
    global.window.Store.init();
    Store = global.window.Store;
    Store.dispatch('ADD_ACCOUNT', { name: 'Checking', openingBalance: 1000 });
    Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
    acctA = Store.getState().accounts[0].id;
    acctB = Store.getState().accounts[1].id;
  });

  // ── 1. ADD_TRANSFER materialization & one-generator-per-pair invariant ──
  it('materializes a monthly transfer series: N pairs, both legs per pair, exactly one generator overall', () => {
    const sid = createMonthlyTransfer(); // Aug..Jan = 6 occurrences
    const pairs = pairsOf(sid);
    expect(pairs.size).toBe(6);
    for (const [, legs] of pairs) {
      expect(legs).toHaveLength(2);
      const types = legs.map(l => l.type).sort();
      expect(types).toEqual(['expense', 'income']);
      expect(legs[0].date).toBe(legs[1].date);
      expect(Math.abs(legs[0].amount)).toBe(500);
      expect(Math.abs(legs[1].amount)).toBe(500);
    }
    const gens = generators(sid);
    expect(gens).toHaveLength(1);
    expect(gens[0].type).toBe('expense');
    // dates: Aug 15 .. Jan 15
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    expect(dates).toEqual(['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15']);
    // per-pair invariant: no pair has two armed legs
    for (const [, legs] of pairs) {
      expect(legs.filter(l => l.recurrence.nextDate).length).toBeLessThanOrEqual(1);
    }
  });

  it('re-running the generation pass is idempotent (no growth, no dupes)', () => {
    const sid = createMonthlyTransfer();
    const before = txs().length;
    Store._processRecurringTransactions();
    Store._processRecurringTransactions();
    expect(txs().length).toBe(before);
    expect(generators(sid)).toHaveLength(1);
  });

  // ── 2. Editing the TAIL pair with future scope + date change ──
  it('tail pair edit (future scope, date change) regenerates from the new date without duplicating', () => {
    const sid = createMonthlyTransfer();
    const tail = series(sid).find(t => t.date === '2027-01-15' && t.type === 'expense');
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(tail, { date: '2027-01-20', updateFuture: true }));

    const pairs = pairsOf(sid);
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    expect(dates).toEqual(['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15', '2027-01-20']);
    expect(generators(sid)).toHaveLength(1);
    expect(generators(sid)[0].type).toBe('expense');
    // every pair still has both legs
    for (const [, legs] of pairs) expect(legs).toHaveLength(2);
  });

  // ── 3. Mid-series edit with future scope + date change ──
  it('mid-series pair edit (future scope, date change) rebuilds the future from the new date', () => {
    const sid = createMonthlyTransfer(); // Aug..Jan
    const oct = series(sid).find(t => t.date === '2026-10-15' && t.type === 'expense');
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(oct, { date: '2026-10-01', updateFuture: true }));

    const pairs = pairsOf(sid);
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    // past kept: Aug/Sep on 15th; edited Oct 1; regenerated Nov 1, Dec 1, Jan 1
    expect(dates).toEqual(['2026-08-15', '2026-09-15', '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01']);
    expect(generators(sid)).toHaveLength(1);
    for (const [, legs] of pairs) expect(legs).toHaveLength(2);
  });

  // ── 4. Mid-series amount-only edit, future scope ──
  it('mid-series amount edit (future scope) updates both legs of future pairs only, keeps generator', () => {
    const sid = createMonthlyTransfer();
    const oct = series(sid).find(t => t.date === '2026-10-15' && t.type === 'expense');
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(oct, { amount: 750, updateFuture: true }));

    const pairs = pairsOf(sid);
    expect(pairs.size).toBe(6);
    for (const [, legs] of pairs) {
      const expected = legs[0].date >= '2026-10-15' ? 750 : 500;
      legs.forEach(l => expect(Math.abs(l.amount)).toBe(expected));
    }
    expect(generators(sid)).toHaveLength(1);
    // dates untouched
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    expect(dates).toEqual(['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15']);
  });

  // ── 5. Recurrence toggled ON during a transfer edit ──
  it('arming recurrence on an existing non-recurring transfer arms ONLY the expense leg and materializes pairs', () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 200, expenseAccountId: acctA, incomeAccountId: acctB,
      date: '2026-08-01', note: 'One-off', tags: []
    });
    const leg = txs().find(t => t.comment === 'One-off' && t.type === 'expense');
    expect(leg.recurrence).toBeUndefined();

    // views.js: recurrenceData with a fresh seriesId and nextDate computed from date
    const sid = 'new-series-1';
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(leg, {
      recurrence: {
        seriesId: sid, interval: 1, frequency: 'months',
        endDate: '2026-11-01',
        nextDate: Store._calculateNextRecurrenceDate('2026-08-01', 1, 'months')
      }
    }));

    const pairs = pairsOf(sid);
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    expect(dates).toEqual(['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
    for (const [, legs] of pairs) {
      expect(legs).toHaveLength(2);
      expect(legs.filter(l => l.recurrence && l.recurrence.nextDate).length).toBeLessThanOrEqual(1);
      const armed = legs.filter(l => l.recurrence && l.recurrence.nextDate);
      armed.forEach(a => expect(a.type).toBe('expense'));
    }
    expect(generators(sid)).toHaveLength(1);
  });

  // ── 6. recurrence:null with future scope (stop series) ──
  it('recurrence:null + future scope removes future pairs entirely (both legs) and leaves no generator', () => {
    const sid = createMonthlyTransfer(); // Aug..Jan
    const oct = series(sid).find(t => t.date === '2026-10-15' && t.type === 'expense');
    const octRef = oct.transferRef;
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(oct, { recurrence: null, updateFuture: true }));

    // edited pair still exists, recurrence null on both legs
    const editedLegs = txs().filter(t => t.transferRef === octRef);
    expect(editedLegs).toHaveLength(2);
    editedLegs.forEach(l => expect(l.recurrence).toBeNull());

    // future pairs gone (no orphan legs), past pairs intact
    const remaining = series(sid);
    const dates = [...new Set(remaining.map(t => t.date))].sort();
    expect(dates).toEqual(['2026-08-15', '2026-09-15']);
    remaining.forEach(t => {
      const legs = txs().filter(x => x.transferRef === t.transferRef);
      expect(legs).toHaveLength(2);
    });
    expect(generators(sid)).toHaveLength(0);
    // no orphan single legs anywhere
    const refCounts = {};
    txs().filter(t => t.transferRef).forEach(t => { refCounts[t.transferRef] = (refCounts[t.transferRef] || 0) + 1; });
    Object.values(refCounts).forEach(c => expect(c).toBe(2));
  });

  // ── 7. recurrence:null with all scope (unlink everything) ──
  it('recurrence:null + all scope unlinks past pairs and removes future pairs', () => {
    const sid = createMonthlyTransfer();
    const oct = series(sid).find(t => t.date === '2026-10-15' && t.type === 'expense');
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(oct, { recurrence: null, updateAll: true }));

    expect(series(sid)).toHaveLength(0); // nobody references the series anymore
    // past pairs still exist as plain transfers
    const aug = txs().filter(t => t.date === '2026-08-15' && t.transferRef);
    expect(aug).toHaveLength(2);
    aug.forEach(l => expect(l.recurrence).toBeNull());
    // future pairs are gone
    expect(txs().filter(t => t.date === '2026-12-15')).toHaveLength(0);
    // no orphan legs
    const refCounts = {};
    txs().filter(t => t.transferRef).forEach(t => { refCounts[t.transferRef] = (refCounts[t.transferRef] || 0) + 1; });
    Object.values(refCounts).forEach(c => expect(c).toBe(2));
  });

  // ── 8. Collision guard: regeneration over surviving members skips their dates ──
  it('collision guard skips dates already occupied by surviving members and terminates', () => {
    const sid = createMonthlyTransfer(); // Aug..Jan on the 15th
    const nov = series(sid).find(t => t.date === '2026-11-15' && t.type === 'expense');
    // Move Nov pair back to Sep 15 (same date as the surviving Sep pair) with future scope
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(nov, { date: '2026-09-15', updateFuture: true }));

    const pairs = pairsOf(sid);
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    // Aug15, Sep15(orig), Sep15(edited), then regen chain: Oct 15 collides -> skipped,
    // Nov 15 (freed by the edit) generated, Dec 15 + Jan 15 regenerated
    expect(dates.filter(d => d === '2026-10-15')).toHaveLength(1); // NOT duplicated
    expect(dates.filter(d => d === '2026-09-15')).toHaveLength(2); // user-made overlap allowed
    expect(dates.filter(d => d === '2026-11-15')).toHaveLength(1);
    expect(dates.filter(d => d === '2026-12-15')).toHaveLength(1);
    expect(dates.filter(d => d === '2027-01-15')).toHaveLength(1);
    expect(generators(sid)).toHaveLength(1);
    for (const [, legs] of pairs) expect(legs).toHaveLength(2);
  });

  // ── 9. Collision guard termination on fully-poisoned chain ──
  it('collision guard terminates when every future date collides (poisoned data)', () => {
    // Hand-craft: series with members on every monthly date, plus a generator
    // whose whole chain collides.
    const sid = 'poisoned';
    const mk = (date, extra = {}) => ({
      id: global.window.StackdDB.generateId(),
      type: 'expense', amount: 10, accountId: acctA, categoryId: 'cat_groceries',
      date, time: '12:00', comment: 'poison', tags: [],
      recurrence: { seriesId: sid, interval: 1, frequency: 'months', endDate: '2026-12-01', ...extra },
      createdAt: new Date().toISOString()
    });
    const state = Store.getState();
    state.transactions.push(mk('2026-08-01', { nextDate: '2026-09-01' })); // generator
    state.transactions.push(mk('2026-09-01'));
    state.transactions.push(mk('2026-10-01'));
    state.transactions.push(mk('2026-11-01'));
    state.transactions.push(mk('2026-12-01'));
    const before = state.transactions.length;
    Store._processRecurringTransactions();
    // No new members created, chain advanced past endDate and disarmed or > endDate
    expect(Store.getState().transactions.length).toBe(before);
    const gens = series(sid).filter(t => t.recurrence.nextDate && t.recurrence.nextDate <= t.recurrence.endDate);
    expect(gens).toHaveLength(0);
  });

  // ── 10. endDate extension on the tail, future scope ──
  it('extending endDate on the tail pair (future scope) grows the series to the new end', () => {
    const sid = createMonthlyTransfer('2027-01-15');
    const tail = series(sid).find(t => t.date === '2027-01-15' && t.type === 'expense');
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(tail, { endDate: '2027-03-15', updateFuture: true }));

    const pairs = pairsOf(sid);
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    expect(dates).toEqual(['2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15', '2027-03-15']);
    expect(generators(sid)).toHaveLength(1);
    for (const [, legs] of pairs) expect(legs).toHaveLength(2);
  });

  // ── 11. legacy poisoned pair: BOTH legs armed with the same nextDate ──
  it('legacy pair with both legs armed does not double-generate', () => {
    const sid = 'legacy';
    const ref = 'legacy-ref-1';
    const state = Store.getState();
    const shared = { seriesId: sid, interval: 1, frequency: 'months', endDate: '2026-10-01', nextDate: '2026-09-01' };
    state.transactions.push({
      id: 'leg-exp', type: 'expense', amount: 50, accountId: acctA, categoryId: '',
      date: '2026-08-01', time: '12:00', comment: 'legacy', transferRef: ref, tags: [],
      recurrence: shared, createdAt: new Date().toISOString()
    });
    state.transactions.push({
      id: 'leg-inc', type: 'income', amount: 50, accountId: acctB, categoryId: '',
      date: '2026-08-01', time: '12:00', comment: 'legacy', transferRef: ref, tags: [],
      recurrence: shared, createdAt: new Date().toISOString()
    });
    Store._processRecurringTransactions();
    const pairs = pairsOf(sid);
    // Aug (orig), Sep, Oct — exactly 3 pairs, no doubling
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    expect(dates).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
    for (const [, legs] of pairs) expect(legs).toHaveLength(2);
    expect(generators(sid).filter(t => t.recurrence.nextDate <= t.recurrence.endDate)).toHaveLength(0);
  });

  // ── 11b. 60-month cap applies to transfers too ──
  it('ADD_TRANSFER clamps a >60-month window (no materialization explosion)', () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 10, expenseAccountId: acctA, incomeAccountId: acctB,
      date: '2026-01-15', note: 'Cap me',
      recurrence: { interval: 1, frequency: 'months', endDate: '2036-01-15' },
      tags: []
    });
    const head = txs().find(t => t.comment === 'Cap me' && t.date === '2026-01-15' && t.type === 'expense');
    expect(head.recurrence.endDate).toBe('2031-01-15');
    const sid = head.recurrence.seriesId;
    expect(pairsOf(sid).size).toBe(61); // 60 months + head
  });

  // ── 11c. frequency change mid-series, future scope ──
  it('frequency change (months -> weeks) on a mid-series pair regenerates weekly', () => {
    const sid = createMonthlyTransfer('2026-12-15'); // Aug..Dec monthly
    const oct = series(sid).find(t => t.date === '2026-10-15' && t.type === 'expense');
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(oct, { frequency: 'weeks', updateFuture: true }));

    const pairs = pairsOf(sid);
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    // past monthly kept
    expect(dates).toContain('2026-08-15');
    expect(dates).toContain('2026-09-15');
    // regenerated weekly from Oct 15: Oct 22, Oct 29, ...
    expect(dates).toContain('2026-10-22');
    expect(dates).toContain('2026-10-29');
    // old monthly future members are gone
    expect(dates.filter(d => d === '2026-11-15').length + dates.filter(d => d === '2026-12-15').length)
      .toBe(dates.includes('2026-11-15') || dates.includes('2026-12-15') ? 1 : 0); // only if weekly chain lands there
    expect(generators(sid)).toHaveLength(1);
    for (const [, legs] of pairs) expect(legs).toHaveLength(2);
  });

  // ── 11d. date moved BEFORE surviving past members, future scope ──
  it('date moved into the past (future scope) terminates and keeps pair integrity', () => {
    const sid = createMonthlyTransfer(); // Aug..Jan on the 15th
    const nov = series(sid).find(t => t.date === '2026-11-15' && t.type === 'expense');
    Store.dispatch('UPDATE_TRANSFER', transferEditPayload(nov, { date: '2026-08-20', updateFuture: true }));

    const pairs = pairsOf(sid);
    const dates = [...pairs.values()].map(l => l[0].date).sort();
    // survivors Aug/Sep/Oct 15 + edited Aug 20 + regen Sep 20..Dec 20 (Jan 20 > endDate)
    expect(dates).toEqual(['2026-08-15', '2026-08-20', '2026-09-15', '2026-09-20', '2026-10-15', '2026-10-20', '2026-11-20', '2026-12-20']);
    expect(generators(sid)).toHaveLength(1);
    for (const [, legs] of pairs) expect(legs).toHaveLength(2);
  });

  // ── 12. _calculateNextRecurrenceDate math ──
  describe('_calculateNextRecurrenceDate', () => {
    const calc = (...a) => Store._calculateNextRecurrenceDate(...a);

    it('month-end: Jan 31 -> Feb 28 (non-leap), Feb 28 -> Mar 28 (chain sticks to 28)', () => {
      expect(calc('2026-01-31', 1, 'months')).toBe('2026-02-28');
      expect(calc('2026-02-28', 1, 'months')).toBe('2026-03-28');
    });

    it('leap year: Jan 31 2024 -> Feb 29 2024; Feb 29 -> Mar 29', () => {
      expect(calc('2024-01-31', 1, 'months')).toBe('2024-02-29');
      expect(calc('2024-02-29', 1, 'months')).toBe('2024-03-29');
    });

    it('interval > 1: Jan 31 + 2 months lands on Mar 31; Nov 30 + 3 months clamps to Feb 28', () => {
      expect(calc('2026-01-31', 2, 'months')).toBe('2026-03-31');
      expect(calc('2026-11-30', 3, 'months')).toBe('2027-02-28');
      expect(calc('2026-01-15', 6, 'months')).toBe('2026-07-15');
    });

    it('weeks and days cross month/year boundaries correctly', () => {
      expect(calc('2026-12-28', 1, 'weeks')).toBe('2027-01-04');
      expect(calc('2026-12-31', 1, 'days')).toBe('2027-01-01');
      expect(calc('2026-10-24', 2, 'weeks')).toBe('2026-11-07'); // across EU DST fall-back
      expect(calc('2027-03-27', 1, 'weeks')).toBe('2027-04-03'); // across EU DST spring-forward
    });

    it('yearly from Feb 29 (documenting behavior)', () => {
      // years branch has no month-end clamp: JS rolls Feb 29 -> Mar 1
      const r = calc('2024-02-29', 1, 'years');
      expect(['2025-02-28', '2025-03-01']).toContain(r);
    });

    it('rejects malformed input instead of NaN-ing', () => {
      expect(calc('', 1, 'months')).toBeUndefined();
      expect(calc(undefined, 1, 'months')).toBeUndefined();
      expect(calc('not-a-date', 1, 'months')).toBeUndefined();
    });

    it('monthly chain holds the day-of-month across a full year (DST drift fix)', () => {
      let d = '2026-08-15';
      for (let i = 0; i < 14; i++) {
        d = calc(d, 1, 'months');
        expect(d.endsWith('-15')).toBe(true);
      }
    });
  });
});
