import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-35): a transfer between accounts in different currencies stores
// each leg in its OWN currency — €100 out, $117 in — and no code path copies a
// figure from one currency into the other (ADD_TRANSFER, UPDATE_TRANSFER and
// its series propagation, UPDATE_TRANSACTION's counterpart sync and
// propagate(), the loan re-price mirrors). Within one currency the legs
// mirror whenever the sent amount or an account changes; a save that changes
// neither keeps the pair's own received side (D-U8-11).
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Cross-currency transfers (1.0.2 BUG-35)', () => {
  let Store;
  let main, us, savings, uk;

  const txs = () => Store.getState().transactions;
  const pairOf = (ref) => ({
    exp: txs().find(t => t.transferRef === ref && t.type === 'expense'),
    inc: txs().find(t => t.transferRef === ref && t.type === 'income')
  });
  const series = (sid) => txs().filter(t => t.recurrence && t.recurrence.seriesId === sid);
  const pairsOf = (sid) => {
    const map = new Map();
    series(sid).forEach(t => {
      if (!map.has(t.transferRef)) map.set(t.transferRef, {});
      map.get(t.transferRef)[t.type === 'expense' ? 'exp' : 'inc'] = t;
    });
    return [...map.values()].sort((a, b) => a.exp.date.localeCompare(b.exp.date));
  };
  const generators = (sid) => series(sid).filter(t => t.recurrence.nextDate);

  const addPair = (extra = {}) => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 100,
      receivedAmount: 117,
      expenseAccountId: main,
      incomeAccountId: us,
      date: '2026-10-02',
      note: 'FX',
      tags: [],
      ...extra
    });
    const exp = txs().filter(t => t.transferRef && t.type === 'expense' && t.comment === (extra.note || 'FX'));
    return exp[exp.length - 1].transferRef;
  };

  const addSeries = (extra = {}) => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 100,
      receivedAmount: 117,
      expenseAccountId: main,
      incomeAccountId: us,
      date: '2026-10-25',
      note: 'Top-up',
      recurrence: { interval: 1, frequency: 'months', endDate: '2031-10-25' },
      tags: [],
      ...extra
    });
    const head = txs().find(t => t.comment === (extra.note || 'Top-up') && t.type === 'expense' && t.date === (extra.date || '2026-10-25'));
    return head.recurrence.seriesId;
  };

  // The views.js transfer-edit payload: recurrence rebuilt from the form with
  // a freshly computed nextDate (the store must never accept it as-is).
  const editPayload = (leg, overrides = {}) => {
    const rec = leg.recurrence;
    const date = overrides.date || leg.date;
    const pair = pairOf(leg.transferRef);
    return {
      transferRef: leg.transferRef,
      amount: overrides.amount !== undefined ? overrides.amount : Math.abs(pair.exp.amount),
      ...(overrides.receivedAmount !== undefined ? { receivedAmount: overrides.receivedAmount } : {}),
      expenseAccountId: overrides.expenseAccountId || pair.exp.accountId,
      incomeAccountId: overrides.incomeAccountId || pair.inc.accountId,
      date,
      note: overrides.note !== undefined ? overrides.note : leg.comment,
      recurrence: rec ? {
        seriesId: rec.seriesId,
        interval: rec.interval,
        frequency: rec.frequency,
        endDate: rec.endDate,
        nextDate: Store._calculateNextRecurrenceDate(date, rec.interval, rec.frequency)
      } : null,
      tags: [],
      updateFuture: !!overrides.updateFuture,
      updateAll: !!overrides.updateAll
    };
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));
    let uid = 0;
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + (++uid) },
      localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    Store = global.window.Store;
    Store.init();
    Store.dispatch('SET_CURRENCY', 'EUR');
    Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2026-09-01' });
    Store.dispatch('ADD_ACCOUNT', { name: 'US Checking', openingBalance: 1000, openingDate: '2026-09-01', currency: 'USD' });
    Store.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 300, openingDate: '2026-09-01' });
    Store.dispatch('ADD_ACCOUNT', { name: 'UK Savings', openingBalance: 500, openingDate: '2026-09-01', currency: 'GBP' });
    const id = (n) => Store.getState().accounts.find(a => a.name === n).id;
    main = id('Main'); us = id('US Checking'); savings = id('Savings'); uk = id('UK Savings');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ADD_TRANSFER EUR→USD stores the amount that arrived', () => {
    const ref = addPair();
    const { exp, inc } = pairOf(ref);
    expect(exp.amount).toBe(100);
    expect(exp.accountId).toBe(main);
    expect(inc.amount).toBe(117);
    expect(inc.accountId).toBe(us);
    expect(Store.getAccountBalance(us)).toBe(1117);
    expect(Store.getAccountBalance(main)).toBe(1900);
  });

  it('a recurring cross-currency transfer materializes every pair as 100/117', () => {
    const sid = addSeries();
    const pairs = pairsOf(sid);
    expect(pairs).toHaveLength(61);
    pairs.forEach(p => {
      expect(p.exp.amount).toBe(100);
      expect(p.inc.amount).toBe(117);
      expect(p.exp.accountId).toBe(main);
      expect(p.inc.accountId).toBe(us);
    });
    const gens = generators(sid);
    expect(gens).toHaveLength(1);
    expect(gens[0].type).toBe('expense');
    expect(gens[0].date).toBe('2031-10-25');
  });

  it('UPDATE_TRANSFER writes each leg from its own field', () => {
    const ref = addPair();
    Store.dispatch('UPDATE_TRANSFER', editPayload(pairOf(ref).exp, { amount: 110, receivedAmount: 125 }));
    const { exp, inc } = pairOf(ref);
    expect(exp.amount).toBe(110);
    expect(inc.amount).toBe(125);
  });

  it('UPDATE_TRANSFER without receivedAmount leaves a cross-currency income leg alone', () => {
    const ref = addPair();
    Store.dispatch('UPDATE_TRANSFER', editPayload(pairOf(ref).exp, { amount: 120 }));
    const { exp, inc } = pairOf(ref);
    expect(exp.amount).toBe(120);
    expect(inc.amount).toBe(117);
  });

  it('this-and-future amount edit keeps each side in its own currency', () => {
    const sid = addSeries();
    const third = pairsOf(sid)[2];
    expect(third.exp.date).toBe('2026-12-25');
    Store.dispatch('UPDATE_TRANSFER', editPayload(third.exp, { amount: 105, receivedAmount: 121, updateFuture: true }));
    const pairs = pairsOf(sid);
    expect(pairs).toHaveLength(61);
    pairs.forEach(p => {
      if (p.exp.date >= '2026-12-25') {
        expect(p.exp.amount).toBe(105);
        expect(p.inc.amount).toBe(121);
      } else {
        expect(p.exp.amount).toBe(100);
        expect(p.inc.amount).toBe(117);
      }
    });
    expect(generators(sid)).toHaveLength(1);
  });

  it('a date-moving this-and-future edit regenerates with the received amount', () => {
    const sid = addSeries();
    const third = pairsOf(sid)[2];
    Store.dispatch('UPDATE_TRANSFER', editPayload(third.exp, {
      date: '2026-12-20', amount: 105, receivedAmount: 121, updateFuture: true
    }));
    const pairs = pairsOf(sid);
    const later = pairs.filter(p => p.exp.date >= '2026-12-20');
    expect(later.length).toBeGreaterThan(50);
    later.forEach(p => {
      expect(p.exp.amount).toBe(105);
      expect(p.inc.amount).toBe(121);
      expect(p.inc.accountId).toBe(us);
    });
    pairs.filter(p => p.exp.date < '2026-12-20').forEach(p => {
      expect(p.exp.amount).toBe(100);
      expect(p.inc.amount).toBe(117);
    });
    const gens = generators(sid);
    expect(gens).toHaveLength(1);
    expect(gens[0].type).toBe('expense');
  });

  it('UPDATE_TRANSACTION on one leg never copies its amount across currencies', () => {
    const ref = addPair();
    Store.dispatch('UPDATE_TRANSACTION', { id: pairOf(ref).exp.id, amount: 130 });
    const { exp, inc } = pairOf(ref);
    expect(exp.amount).toBe(130);
    expect(inc.amount).toBe(117);
  });

  it('UPDATE_TRANSACTION future scope never copies an amount across currencies', () => {
    const sid = addSeries();
    const third = pairsOf(sid)[2];
    Store.dispatch('UPDATE_TRANSACTION', { id: third.exp.id, amount: 130, updateFuture: true });
    const pairs = pairsOf(sid);
    pairs.forEach(p => {
      if (p.exp.date >= '2026-12-25') expect(p.exp.amount).toBe(130);
      else expect(p.exp.amount).toBe(100);
      expect(p.inc.amount).toBe(117);
    });
  });

  it('loan re-price never writes a figure into a leg in another currency', () => {
    const ref = addPair();
    const { exp } = pairOf(ref);
    Store._setLoanMemberAmount(exp, 42000, new Date().toISOString());
    expect(pairOf(ref).exp.amount).toBe(420);
    expect(pairOf(ref).inc.amount).toBe(117);
  });

  it('loan re-price still mirrors a same-currency pair', () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 100, expenseAccountId: main, incomeAccountId: savings, date: '2026-10-02', note: 'Same', tags: []
    });
    const ref = txs().find(t => t.comment === 'Same').transferRef;
    Store._setLoanMemberAmount(pairOf(ref).exp, 42000, new Date().toISOString());
    expect(pairOf(ref).exp.amount).toBe(420);
    expect(pairOf(ref).inc.amount).toBe(420);
  });

  // _applyLoanFinalInstalment's counterpart mirror (D-U8-5): a monthly
  // loan-linked series converted to a transfer pair, whose tail qualifies for
  // the schedule's cent-adjusted final instalment (1.0.1 BUG-17).
  const CAR = {
    type: 'personal', principal: 16000, duration: 48, durationUnit: 'months',
    annualRate: 4, firstPaymentDate: '2026-11-01', amortization: 'french'
  };
  const linkedTransferLoan = (incomeAccountId, receivedAmount) => {
    Store.dispatch('ADD_LOAN', { name: 'Car Loan', kind: 'active', config: CAR });
    const loan = Store.getState().loans[Store.getState().loans.length - 1];
    const p = Store.getLoanProgress(loan);
    const regularC = p.nextRegularPayment.amountC;
    const last = p.simulation.schedule[p.simulation.schedule.length - 1];
    const finalC = last.paymentC + last.extraPrincipalC;
    expect(finalC).not.toBe(regularC);
    const sid = addSeries({
      amount: regularC / 100,
      ...(receivedAmount !== undefined ? { receivedAmount } : {}),
      incomeAccountId,
      date: p.nextRegularPayment.date,
      note: 'Car',
      recurrence: { interval: 1, frequency: 'months', endDate: p.lastPaymentDate }
    });
    loan.linkedSeriesId = sid;
    return { loan, sid, regularC, finalC };
  };

  it('the final-instalment stamp never writes a figure into a leg in another currency', () => {
    const { loan, sid, regularC, finalC } = linkedTransferLoan(us, 380);
    const before = pairsOf(sid);
    expect(before).toHaveLength(48);
    expect(Store._applyLoanFinalInstalment(loan, regularC)).toBe(true);
    const after = pairsOf(sid);
    const tail = after[after.length - 1];
    expect(Math.round(tail.exp.amount * 100)).toBe(finalC);
    expect(tail.inc.accountId).toBe(us);
    expect(tail.inc.amount).toBe(380);
    after.slice(0, -1).forEach(p => {
      expect(Math.round(p.exp.amount * 100)).toBe(regularC);
      expect(p.inc.amount).toBe(380);
    });
  });

  it('pin: the final-instalment stamp still mirrors a same-currency pair', () => {
    const { loan, sid, regularC, finalC } = linkedTransferLoan(savings);
    expect(Store._applyLoanFinalInstalment(loan, regularC)).toBe(true);
    const after = pairsOf(sid);
    const tail = after[after.length - 1];
    expect(Math.round(tail.exp.amount * 100)).toBe(finalC);
    expect(Math.round(tail.inc.amount * 100)).toBe(finalC);
  });

  it('a relabelled pair keeps its received side on a save that changes neither amount nor accounts (D-U8-11)', () => {
    const ref = addPair();
    const sid = addSeries();
    Store.dispatch('SET_CURRENCY', { code: 'USD', relabel: true });
    expect(Store.getAccountCurrency(main)).toBe('USD');
    expect(Store._sameCurrency(main, us)).toBe(true);

    // note-only save of the single pair
    Store.dispatch('UPDATE_TRANSFER', editPayload(pairOf(ref).exp, { amount: 100, note: 'rent' }));
    expect(pairOf(ref).exp.amount).toBe(100);
    expect(pairOf(ref).inc.amount).toBe(117);
    expect(pairOf(ref).inc.comment).toBe('rent');

    // note-only this-and-future save of the series
    const second = pairsOf(sid)[1];
    Store.dispatch('UPDATE_TRANSFER', editPayload(second.exp, { note: 'monthly', updateFuture: true }));
    pairsOf(sid).forEach(p => {
      expect(p.exp.amount).toBe(100);
      expect(p.inc.amount).toBe(117);
    });
    expect(pairsOf(sid)[5].inc.comment).toBe('monthly');

    // an amount change mirrors within one currency
    Store.dispatch('UPDATE_TRANSFER', editPayload(pairOf(ref).exp, { amount: 110 }));
    expect(pairOf(ref).exp.amount).toBe(110);
    expect(pairOf(ref).inc.amount).toBe(110);
  });

  it('a relabelled pair keeps its received side on a single-leg UPDATE_TRANSACTION note edit', () => {
    const ref = addPair();
    Store.dispatch('SET_CURRENCY', { code: 'USD', relabel: true });
    Store.dispatch('UPDATE_TRANSACTION', { id: pairOf(ref).exp.id, amount: 100, comment: 'note' });
    expect(pairOf(ref).exp.amount).toBe(100);
    expect(pairOf(ref).inc.amount).toBe(117);
    Store.dispatch('UPDATE_TRANSACTION', { id: pairOf(ref).exp.id, amount: 90 });
    expect(pairOf(ref).inc.amount).toBe(90);
  });

  it('moving To from a $ account to a € account mirrors', () => {
    const ref = addPair();
    Store.dispatch('UPDATE_TRANSFER', editPayload(pairOf(ref).exp, { amount: 100, incomeAccountId: savings }));
    const { exp, inc } = pairOf(ref);
    expect(exp.amount).toBe(100);
    expect(inc.amount).toBe(100);
    expect(inc.accountId).toBe(savings);
  });

  it('moving To to another foreign currency takes the new received amount', () => {
    const ref = addPair();
    Store.dispatch('UPDATE_TRANSFER', editPayload(pairOf(ref).exp, { amount: 100, receivedAmount: 86, incomeAccountId: uk }));
    const { exp, inc } = pairOf(ref);
    expect(exp.amount).toBe(100);
    expect(inc.amount).toBe(86);
    expect(inc.accountId).toBe(uk);
  });

  // ── pins: pass before 1.0.2 and must keep passing ──────────────────────────

  it('pin: a same-currency ADD_TRANSFER / UPDATE_TRANSFER with a stray receivedAmount still mirrors', () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 100, receivedAmount: 117, expenseAccountId: main, incomeAccountId: savings,
      date: '2026-10-02', note: 'Same', tags: []
    });
    const ref = txs().find(t => t.comment === 'Same').transferRef;
    expect(pairOf(ref).inc.amount).toBe(100);
    Store.dispatch('UPDATE_TRANSFER', editPayload(pairOf(ref).exp, { amount: 140, receivedAmount: 117 }));
    expect(pairOf(ref).exp.amount).toBe(140);
    expect(pairOf(ref).inc.amount).toBe(140);
  });

  it('pin: a cross-currency ADD_TRANSFER without receivedAmount (imports, old callers) stays 1:1', () => {
    Store.dispatch('ADD_TRANSFER', {
      amount: 100, expenseAccountId: main, incomeAccountId: us, date: '2026-10-02', note: 'Old', tags: []
    });
    const ref = txs().find(t => t.comment === 'Old').transferRef;
    expect(pairOf(ref).exp.amount).toBe(100);
    expect(pairOf(ref).inc.amount).toBe(100);
  });

  it('pin: a same-currency series with a member edited to 80/80 becomes 100/100 on a future note-only edit', () => {
    const sid = addSeries({ incomeAccountId: savings, receivedAmount: undefined, note: 'Sweep' });
    const pairs0 = pairsOf(sid);
    // a single-member edit of pair 5 to 80 (mirrors within one currency)
    Store.dispatch('UPDATE_TRANSFER', { ...editPayload(pairs0[4].exp, { amount: 80 }), recurrence: undefined });
    expect(pairsOf(sid)[4].exp.amount).toBe(80);
    expect(pairsOf(sid)[4].inc.amount).toBe(80);
    // this-and-future note-only edit of pair 2
    Store.dispatch('UPDATE_TRANSFER', editPayload(pairsOf(sid)[1].exp, { note: 'Sweep 2', updateFuture: true }));
    const p5 = pairsOf(sid)[4];
    expect(p5.exp.amount).toBe(100);
    expect(p5.inc.amount).toBe(100);
    expect(p5.inc.comment).toBe('Sweep 2');
  });
});
