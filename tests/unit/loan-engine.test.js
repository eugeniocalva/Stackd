import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context (see store.test.js)
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Calibration loan from the reference app (docs/debt-rebuild-plan.md §6.6):
// 111,000 € @ 4.05% nominal, 30 years, first payment 06/09/2026.
const CALIBRATION = {
  principal: 111000,
  annualRate: 4.05,
  duration: 30,
  durationUnit: 'years',
  firstPaymentDate: '2026-09-06'
};

let LoanEngine;

beforeEach(() => {
  global.window = {};
  executeFile('loan-engine.js');
  LoanEngine = global.window.LoanEngine;
});

describe('LoanEngine — French amortization calibration', () => {
  it('reproduces the reference schedule exactly', () => {
    const res = LoanEngine.simulate(CALIBRATION);

    expect(res.initialPaymentC).toBe(53314); // 533.14 €/month
    expect(res.installmentCount).toBe(360);
    expect(res.lastPaymentDate).toBe('2056-08-06');
    expect(res.totalInterestC).toBe(8092705); // 80,927.05 €
    expect(res.financedPrincipalC).toBe(11100000);
    expect(res.totalPrincipalC).toBe(11100000);

    const rows = res.schedule;
    // Reference rows 06/09/26 → 06/12/26 (interest / principal / balance)
    expect(rows[0]).toMatchObject({ date: '2026-09-06', paymentC: 53314, interestC: 37463, principalC: 15851, balanceC: 11084149 });
    expect(rows[1]).toMatchObject({ date: '2026-10-06', paymentC: 53314, interestC: 37409, principalC: 15905, balanceC: 11068244 });
    expect(rows[2]).toMatchObject({ date: '2026-11-06', paymentC: 53314, interestC: 37355, principalC: 15959, balanceC: 11052285 });
    expect(rows[3]).toMatchObject({ date: '2026-12-06', paymentC: 53314, interestC: 37301, principalC: 16013, balanceC: 11036272 });

    // Final row absorbs rounding drift downward
    const last = rows[359];
    expect(last.paymentC).toBe(52979); // 529.79 €
    expect(last.balanceC).toBe(0);
    expect(last.events).toContain('finalAdjusted');

    // totalPaid = 359 × 533.14 + 529.79
    expect(res.totalPaidC).toBe(359 * 53314 + 52979);
    expect(res.grandTotalC).toBe(res.totalPaidC); // no expenses
    expect(res.savings).toBeNull();
  });

  it('clamp regression: payments that round DOWN still close the schedule (100,000 € case)', () => {
    // Without the `remaining === 1` clamp arm this leaves 1.77 € unpaid and
    // trips the principal invariant (adversarial review finding 1b).
    const res = LoanEngine.simulate({ ...CALIBRATION, principal: 100000 });
    expect(res.installmentCount).toBe(360);
    expect(res.schedule[359].balanceC).toBe(0);
    expect(res.totalPrincipalC).toBe(10000000);
    expect(res.schedule[359].events).toContain('finalAdjusted');
  });
});

describe('LoanEngine — 0% installment plans (rateizzazione)', () => {
  it('splits 1,200 € over 11 months as 10 × 109.09 + 109.10', () => {
    const res = LoanEngine.simulate({
      type: 'installment', principal: 1200, annualRate: 0,
      duration: 11, durationUnit: 'months', firstPaymentDate: '2026-08-06'
    });
    expect(res.installmentCount).toBe(11); // floor-then-absorb: never fewer rows than planned
    expect(res.totalInterestC).toBe(0);
    for (let i = 0; i < 10; i++) expect(res.schedule[i].paymentC).toBe(10909);
    expect(res.schedule[10].paymentC).toBe(10910);
    expect(res.schedule[10].balanceC).toBe(0);
  });

  it('emits exactly n rows even for degenerate cent amounts', () => {
    const res = LoanEngine.simulate({
      principal: 0.10, annualRate: 0, duration: 6, durationUnit: 'months',
      firstPaymentDate: '2026-08-06'
    });
    expect(res.installmentCount).toBe(6);
    expect(res.schedule[5].balanceC).toBe(0);
  });
});

describe('LoanEngine — first installment interest-only', () => {
  it('extend-duration (default): IO row 0 + 360 amortizing rows, end shifts one month', () => {
    const res = LoanEngine.simulate({ ...CALIBRATION, firstInstallmentInterestOnly: true });
    expect(res.installmentCount).toBe(361);
    const io = res.schedule[0];
    expect(io).toMatchObject({ index: 0, date: '2026-09-06', paymentC: 37463, interestC: 37463, principalC: 0, balanceC: 11100000 });
    expect(io.events).toContain('interestOnly');
    expect(res.initialPaymentC).toBe(53314); // first AMORTIZING payment unchanged
    expect(res.schedule[1].date).toBe('2026-10-06');
    expect(res.lastPaymentDate).toBe('2056-09-06'); // +1 month vs baseline
    expect(res.schedule[360].balanceC).toBe(0);
  });

  it("don't-extend: 359 amortizing rows at the recomputed 533.90, original end kept", () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION, firstInstallmentInterestOnly: true, interestOnlyExtendsDuration: false
    });
    expect(res.installmentCount).toBe(360); // IO row + 359
    expect(res.initialPaymentC).toBe(53390); // annuity over 359
    expect(res.lastPaymentDate).toBe('2056-08-06'); // original end date
    expect(res.schedule[359].balanceC).toBe(0);
  });
});

describe('LoanEngine — rate changes', () => {
  it('re-amortizes over the remaining term including the current row (@ row 180 → 5%)', () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION,
      rateChanges: [{ annualRate: 5.00, effectiveFrom: '2041-08-06' }] // row 180's due date
    });
    const row180 = res.schedule[179];
    expect(row180.events).toContain('rateChange');
    expect(row180.annualRate).toBe(5);
    // remaining = 181 (incl. current row) → payment 568.21; the off-by-one
    // misread (remaining = 180) would give 570.33 (review check 3)
    expect(row180.paymentC).toBe(56821);
    expect(row180.interestC).toBe(30050);
    expect(row180.principalC).toBe(26771);
    expect(res.installmentCount).toBe(360);
    expect(res.schedule[359].paymentC).toBe(56797);
    expect(res.schedule[359].balanceC).toBe(0);
    expect(res.totalInterestC).toBe(8727783);
  });

  it('a change dated <= firstPaymentDate replaces the initial rate outright', () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION,
      rateChanges: [{ annualRate: 5.00, effectiveFrom: '2026-01-01' }]
    });
    // identical to simulating at 5% flat
    const flat = LoanEngine.simulate({ ...CALIBRATION, annualRate: 5.00 });
    expect(res.initialPaymentC).toBe(flat.initialPaymentC);
    expect(res.totalInterestC).toBe(flat.totalInterestC);
  });

  it('same-date changes: last entry wins', () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION,
      rateChanges: [
        { annualRate: 6.00, effectiveFrom: '2041-08-06' },
        { annualRate: 5.00, effectiveFrom: '2041-08-06' }
      ]
    });
    expect(res.schedule[179].annualRate).toBe(5);
  });
});

describe('LoanEngine — early repayments (accrue-first, bank-standard)', () => {
  it('one-off 10,000 € reduceDuration: term shortens, interest saved, invariant holds', () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION,
      earlyRepayments: [{ amount: 10000, date: '2031-09-06', mode: 'reduceDuration' }] // row 61
    });
    const row61 = res.schedule[60];
    expect(row61.extraPrincipalC).toBe(1000000);
    expect(row61.events).toContain('earlyRepayment');
    // interest for row 61 accrues on the OPENING balance — the extra payment
    // starts saving interest from the NEXT period (spec §6.4 point 2)
    expect(res.totalInterestC).toBe(6563051); // accrue-first figure from the adversarial review
    expect(res.installmentCount).toBeLessThan(360);
    expect(res.totalPrincipalC).toBe(11100000);
    expect(res.totalEarlyRepaymentsC).toBe(1000000);
    expect(res.savings).not.toBeNull();
    expect(res.savings.baselineTotalInterestC).toBe(8092705);
    expect(res.savings.interestSavedC).toBe(8092705 - 6563051);
    expect(res.savings.monthsSaved).toBe(360 - res.installmentCount);
    expect(res.schedule[res.schedule.length - 1].balanceC).toBe(0);
  });

  it('one-off reducePayment: payment drops, end date unchanged, monthsSaved 0', () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION,
      earlyRepayments: [{ amount: 10000, date: '2031-09-06', mode: 'reducePayment' }]
    });
    expect(res.installmentCount).toBe(360);
    expect(res.lastPaymentDate).toBe('2056-08-06');
    expect(res.schedule[61].paymentC).toBeLessThan(53314); // row after the ER
    expect(res.savings.monthsSaved).toBe(0);
    expect(res.savings.interestSavedC).toBeGreaterThan(0);
    expect(res.schedule[359].balanceC).toBe(0);
  });

  it('an early repayment larger than the balance is clamped and closes the loan', () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION,
      earlyRepayments: [{ amount: 200000, date: '2031-09-06', mode: 'reduceDuration' }]
    });
    expect(res.installmentCount).toBe(61);
    const last = res.schedule[60];
    expect(last.balanceC).toBe(0);
    expect(last.interestC).toBeGreaterThan(0); // the period's interest is still owed
    expect(res.totalEarlyRepaymentsC).toBeLessThan(20000000); // clamped, not the requested amount
    expect(res.totalPrincipalC).toBe(11100000);
  });

  it('monthly overpayment respects its endDate', () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION,
      earlyRepayments: [{
        amount: 100, date: '2027-09-06', endDate: '2028-08-06',
        frequency: 'monthly', mode: 'reducePayment'
      }]
    });
    // rows 13..24 inclusive → 12 applications of 100 €
    expect(res.totalEarlyRepaymentsC).toBe(12 * 10000);
    const withExtras = res.schedule.filter(r => r.extraPrincipalC > 0);
    expect(withExtras.length).toBe(12);
    expect(withExtras[0].date).toBe('2027-09-06');
    expect(withExtras[11].date).toBe('2028-08-06');
  });

  it('an ER dated before the first row snaps to row 1; one dated after the last row is ignored', () => {
    const early = LoanEngine.simulate({
      ...CALIBRATION,
      earlyRepayments: [{ amount: 5000, date: '2020-01-01', mode: 'reducePayment' }]
    });
    expect(early.schedule[0].extraPrincipalC).toBe(500000);

    const late = LoanEngine.simulate({
      ...CALIBRATION,
      earlyRepayments: [{ amount: 5000, date: '2090-01-01', mode: 'reducePayment' }]
    });
    expect(late.totalEarlyRepaymentsC).toBe(0);
    expect(late.totalInterestC).toBe(8092705); // identical to untouched loan
  });
});

describe('LoanEngine — savings are never negative (ceiling re-amortization)', () => {
  // Fuzz regression: at extreme rates/cent-scale principals, a re-amortized
  // payment that rounded DOWN amortized slower than baseline, producing a balloon
  // final row and negative savings. Re-amortizations now round up.
  it('cent-scale principal with a reducePayment overpayment', () => {
    const res = LoanEngine.simulate({
      principal: 1, annualRate: 5, duration: 9, durationUnit: 'years',
      firstPaymentDate: '2038-12-16',
      earlyRepayments: [{ amount: 0.84, date: '2039-12-16', mode: 'reducePayment' }]
    });
    expect(res.savings.interestSavedC).toBeGreaterThanOrEqual(0);
    expect(res.savings.monthsSaved).toBeGreaterThanOrEqual(0);
    expect(res.schedule[res.schedule.length - 1].balanceC).toBe(0);
  });

  it('extreme-rate loan with an early reducePayment overpayment', () => {
    const res = LoanEngine.simulate({
      principal: 239128.65, annualRate: 41.77, duration: 29, durationUnit: 'years',
      firstPaymentDate: '2065-06-29',
      earlyRepayments: [{ amount: 277, date: '2024-07-01', mode: 'reducePayment' }]
    });
    expect(res.savings.interestSavedC).toBeGreaterThanOrEqual(0);
    expect(res.savings.monthsSaved).toBeGreaterThanOrEqual(0);
    expect(res.installmentCount).toBeLessThanOrEqual(res.savings.baselineInstallmentCount);
  });
});

describe('LoanEngine — italian amortization (constant principal)', () => {
  it('12,000 € @ 12% / 12m: constant 1,000 € principal, declining interest', () => {
    const res = LoanEngine.simulate({
      principal: 12000, annualRate: 12, duration: 12, durationUnit: 'months',
      firstPaymentDate: '2026-08-06', amortization: 'italian'
    });
    expect(res.installmentCount).toBe(12);
    expect(res.schedule[0]).toMatchObject({ principalC: 100000, interestC: 12000, paymentC: 112000 }); // 1% of 12,000
    expect(res.schedule[11]).toMatchObject({ principalC: 100000, interestC: 1000, paymentC: 101000 }); // 1% of 1,000
    expect(res.schedule[11].balanceC).toBe(0);
    // payments strictly decreasing
    for (let i = 1; i < 12; i++) expect(res.schedule[i].paymentC).toBeLessThan(res.schedule[i - 1].paymentC);
  });
});

describe('LoanEngine — additional expenses & down payment', () => {
  it('monthly fees are charged per emitted row, one-offs once; never touch amortization', () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION,
      additionalExpenses: [
        { name: 'Insurance', amount: 12, frequency: 'monthly' },
        { name: 'Origination', amount: 500, frequency: 'once' }
      ]
    });
    expect(res.totalExpensesC).toBe(360 * 1200 + 50000);
    expect(res.totalInterestC).toBe(8092705); // amortization untouched
    expect(res.grandTotalC).toBe(res.totalPaidC + res.totalExpensesC);
  });

  it('down payment reduces the financed principal, is excluded from grandTotal', () => {
    const res = LoanEngine.simulate({
      ...CALIBRATION, type: 'mortgage', principal: 121000, downPayment: 10000
    });
    expect(res.financedPrincipalC).toBe(11100000);
    expect(res.initialPaymentC).toBe(53314); // amortizes exactly like the calibration loan
    expect(res.downPaymentC).toBe(1000000);
    expect(res.downPaymentPct).toBeCloseTo(8.264, 3);
    expect(res.grandTotalC).toBe(res.totalPaidC);
  });
});

describe('LoanEngine — date math', () => {
  it('anchor-day stepping: Jan 31 clamps to Feb 28 but recovers to Mar 31 (leap-aware)', () => {
    const { addMonthsClamped } = LoanEngine;
    expect(addMonthsClamped('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-01-31', 2, 31)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-01-31', 3, 31)).toBe('2026-04-30');
    expect(addMonthsClamped('2026-01-31', 25, 31)).toBe('2028-02-29'); // leap year
    expect(addMonthsClamped('2026-11-15', 2, 15)).toBe('2027-01-15'); // year rollover
  });

  it('schedule dates derive from the anchor, not iterative stepping', () => {
    const res = LoanEngine.simulate({
      principal: 1200, annualRate: 0, duration: 5, durationUnit: 'months',
      firstPaymentDate: '2026-01-31'
    });
    expect(res.schedule.map(r => r.date)).toEqual(
      ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']
    );
  });

  it('daysInMonth handles leap-year February', () => {
    expect(LoanEngine.daysInMonth(2028, 2)).toBe(29);
    expect(LoanEngine.daysInMonth(2100, 2)).toBe(28); // century, not leap
    expect(LoanEngine.daysInMonth(2000, 2)).toBe(29); // 400-year rule
  });
});

describe('LoanEngine — validation', () => {
  const bad = (config, code) => {
    try {
      LoanEngine.simulate(config);
    } catch (e) {
      expect(e.name).toBe('LoanEngineError');
      expect(e.code).toBe(code);
      return;
    }
    throw new Error('expected LoanEngineError ' + code);
  };

  it('rejects invalid configs with typed errors', () => {
    bad({ ...CALIBRATION, principal: 0 }, 'E_PRINCIPAL');
    bad({ ...CALIBRATION, downPayment: 111000 }, 'E_DOWNPAYMENT');
    bad({ ...CALIBRATION, duration: 0 }, 'E_DURATION');
    bad({ ...CALIBRATION, duration: 101 }, 'E_DURATION'); // 1212 months > 1200
    bad({ ...CALIBRATION, annualRate: 100 }, 'E_RATE');
    bad({ ...CALIBRATION, annualRate: -1 }, 'E_RATE');
    bad({ ...CALIBRATION, firstPaymentDate: '2026-9-6' }, 'E_DATE'); // unpadded
    bad({ ...CALIBRATION, firstPaymentDate: '2026-02-30' }, 'E_DATE');
    bad({ ...CALIBRATION, amortization: 'german' }, 'E_AMORTIZATION');
    bad({
      principal: 1000, annualRate: 0, duration: 1, durationUnit: 'months',
      firstPaymentDate: '2026-08-06',
      firstInstallmentInterestOnly: true, interestOnlyExtendsDuration: false
    }, 'E_IO');
    bad({ ...CALIBRATION, rateChanges: [{ annualRate: -1, effectiveFrom: '2030-01-01' }] }, 'E_RATECHANGE');
    bad({ ...CALIBRATION, earlyRepayments: [{ amount: 0, date: '2030-01-01' }] }, 'E_EARLYREPAYMENT');
    bad({ ...CALIBRATION, earlyRepayments: [{ amount: 100, date: '2030-01-01', endDate: '2029-01-01', frequency: 'monthly' }] }, 'E_EARLYREPAYMENT');
    bad({ ...CALIBRATION, additionalExpenses: [{ amount: -5 }] }, 'E_EXPENSE');
  });

  it('rejects a financed principal below one cent with a typed error, not a TypeError', () => {
    // fuzz finding: toCents(principal - downPayment) === 0 → empty schedule → crash
    bad({ ...CALIBRATION, principal: 0.004 }, 'E_DOWNPAYMENT');
    bad({ ...CALIBRATION, principal: 100, downPayment: 99.996 }, 'E_DOWNPAYMENT');
  });

  it('rejects non-array list fields with a typed error', () => {
    bad({ ...CALIBRATION, rateChanges: 'nope' }, 'E_CONFIG');
    bad({ ...CALIBRATION, earlyRepayments: 42 }, 'E_CONFIG');
    bad({ ...CALIBRATION, additionalExpenses: {} }, 'E_CONFIG');
  });

  it('rejects early repayments below one cent (they would silently no-op)', () => {
    bad({ ...CALIBRATION, earlyRepayments: [{ amount: 0.004, date: '2030-01-01' }] }, 'E_EARLYREPAYMENT');
  });

  it('rejects a malformed date on a monthly additional expense', () => {
    bad({ ...CALIBRATION, additionalExpenses: [{ amount: 5, frequency: 'monthly', date: 'garbage' }] }, 'E_EXPENSE');
  });

  it('sub-epsilon rates behave exactly like 0% instead of underflowing to Infinity', () => {
    // fuzz finding: annualRate 1e-13 made (1+r) === 1 → Infinity payment → 1-row payoff
    const res = LoanEngine.simulate({
      principal: 12000, annualRate: 1e-13, duration: 120, durationUnit: 'months',
      firstPaymentDate: '2026-08-06'
    });
    expect(res.installmentCount).toBe(120);
    expect(res.schedule[0].paymentC).toBe(10000); // 100.00 €, floor-then-absorb
    expect(res.totalInterestC).toBe(0);
    expect(res.schedule[119].balanceC).toBe(0);
  });

  it('single-installment loan: one payment of principal + one month interest', () => {
    const res = LoanEngine.simulate({
      principal: 1000, annualRate: 12, duration: 1, durationUnit: 'months',
      firstPaymentDate: '2026-08-06'
    });
    expect(res.installmentCount).toBe(1);
    expect(res.schedule[0].interestC).toBe(1000); // 1% of 1,000 €
    expect(res.schedule[0].paymentC).toBe(101000);
    expect(res.schedule[0].balanceC).toBe(0);
  });
});
