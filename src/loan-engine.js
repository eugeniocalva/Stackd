// v0.71 Loan Engine — pure amortization & simulation math for the debt rebuild (Phase 1).
// Normative spec: docs/debt-rebuild-plan.md §6. Zero dependencies on other Stack'd globals:
// no Store, no StackdDB, no Date objects (schedule dates are 'YYYY-MM-DD' string math,
// anchor-day derived — see spec §6.2 for why iterative month stepping is banned).
(function (global) {
  'use strict';

  function loanEngineError(code, message) {
    const err = new Error(message);
    err.name = 'LoanEngineError';
    err.code = code;
    return err;
  }

  // ── Money ─────────────────────────────────────────────────────────────────
  // Integer cents everywhere inside the engine. Half-up rounding is normative:
  // the calibration loan's first interest row is an exact float .5 tie and
  // half-up is what matches real schedules (banker's rounding fails it).
  // The 1e-9 epsilon guards near-tie float products; valid for balances < €100M.
  function centRound(x) { return Math.round(x + 1e-9); }
  function toCents(x) { return Math.round(x * 100 + 1e-9); }

  // Rates below this behave as 0%: r < 2^-53 makes (1 + r) === 1 and the annuity
  // denominator underflows to 0 (Infinity payment). Route them to the 0% branch.
  var RATE_EPS = 1e-12;

  // French annuity payment in cents. r === 0 uses floor-then-absorb so the plan
  // always emits exactly n rows (the final row absorbs the remainder upward);
  // centRound here could round up and silently shave a row off tiny plans.
  function annuityPaymentC(balC, r, n) {
    if (n <= 0) return 0;
    if (r < RATE_EPS) return Math.floor(balC / n);
    return centRound(balC * r / (1 - Math.pow(1 + r, -n)));
  }

  // In-loop re-amortizations (rate change, reducePayment) round UP instead: a
  // payment rounded down by half a cent amortizes slower than the plan it
  // replaces, which balloons the final row and can make "savings" negative in
  // high-rate regimes. Ceiling guarantees the recomputed payment covers the
  // exact annuity, so an extra repayment can never lengthen the schedule.
  function annuityPaymentCeilC(balC, r, n) {
    if (n <= 0) return 0;
    if (r < RATE_EPS) return Math.floor(balC / n);
    return Math.ceil(balC * r / (1 - Math.pow(1 + r, -n)) - 1e-9);
  }

  // ── Dates ─────────────────────────────────────────────────────────────────
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function parseYMD(s) {
    const p = s.split('-');
    return { y: Number(p[0]), m: Number(p[1]), d: Number(p[2]) };
  }

  function formatYMD(o) {
    const mm = String(o.m).padStart(2, '0');
    const dd = String(o.d).padStart(2, '0');
    return o.y + '-' + mm + '-' + dd;
  }

  function daysInMonth(y, m) {
    if (m === 2) return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28;
    return (m === 4 || m === 6 || m === 9 || m === 11) ? 30 : 31;
  }

  function isValidYMD(s) {
    if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
    const o = parseYMD(s);
    return o.m >= 1 && o.m <= 12 && o.d >= 1 && o.d <= daysInMonth(o.y, o.m);
  }

  // Anchor-day month stepping: every schedule date derives from the anchor, so
  // Jan 31 → Feb 28 → Mar 31 (a clamped month never decays the anchor).
  function addMonthsClamped(s, k, anchorDay) {
    const o = parseYMD(s);
    const m0 = (o.m - 1) + k;
    const y2 = o.y + Math.floor(m0 / 12);
    const m2 = ((m0 % 12) + 12) % 12 + 1;
    return formatYMD({ y: y2, m: m2, d: Math.min(anchorDay, daysInMonth(y2, m2)) });
  }

  // ── Config normalization + validation ─────────────────────────────────────
  const TYPES = ['mortgage', 'personal', 'installment'];
  const AMORTIZATIONS = ['french', 'italian'];
  const FREQUENCIES = ['once', 'monthly'];
  const ER_MODES = ['reducePayment', 'reduceDuration'];

  function isFiniteNumber(x) { return typeof x === 'number' && isFinite(x); }

  function assertDate(s, code, label) {
    if (!isValidYMD(s)) throw loanEngineError(code, label + " must be a zero-padded 'YYYY-MM-DD' date, got: " + s);
  }

  function ensureArray(v, label) {
    if (v !== undefined && v !== null && !Array.isArray(v)) {
      throw loanEngineError('E_CONFIG', label + ' must be an array');
    }
    return v || [];
  }

  function normalizeConfig(raw) {
    if (!raw || typeof raw !== 'object') throw loanEngineError('E_CONFIG', 'config must be an object');

    const cfg = {
      type: raw.type === undefined ? 'personal' : raw.type,
      principal: raw.principal,
      downPayment: raw.downPayment === undefined ? 0 : raw.downPayment,
      duration: raw.duration,
      durationUnit: raw.durationUnit === undefined ? 'years' : raw.durationUnit,
      annualRate: raw.annualRate,
      firstPaymentDate: raw.firstPaymentDate,
      amortization: raw.amortization === undefined ? 'french' : raw.amortization,
      firstInstallmentInterestOnly: !!raw.firstInstallmentInterestOnly,
      interestOnlyExtendsDuration: raw.interestOnlyExtendsDuration !== false,
      rateChanges: ensureArray(raw.rateChanges, 'rateChanges').map(function (rc) {
        return { annualRate: rc.annualRate, effectiveFrom: rc.effectiveFrom };
      }),
      earlyRepayments: ensureArray(raw.earlyRepayments, 'earlyRepayments').map(function (er) {
        return {
          amount: er.amount,
          date: er.date,
          frequency: er.frequency === undefined ? 'once' : er.frequency,
          endDate: er.endDate === undefined ? null : er.endDate,
          mode: er.mode === undefined ? 'reduceDuration' : er.mode
        };
      }),
      additionalExpenses: ensureArray(raw.additionalExpenses, 'additionalExpenses').map(function (ex) {
        return {
          name: typeof ex.name === 'string' ? ex.name : '',
          amount: ex.amount,
          frequency: ex.frequency === undefined ? 'once' : ex.frequency,
          date: ex.date === undefined ? null : ex.date
        };
      }),
      computeSavings: raw.computeSavings !== false
    };

    if (TYPES.indexOf(cfg.type) === -1) throw loanEngineError('E_CONFIG', 'unknown type: ' + cfg.type);
    if (!isFiniteNumber(cfg.principal) || cfg.principal <= 0) throw loanEngineError('E_PRINCIPAL', 'principal must be > 0');
    if (!isFiniteNumber(cfg.downPayment) || cfg.downPayment < 0 || cfg.downPayment >= cfg.principal) {
      throw loanEngineError('E_DOWNPAYMENT', 'downPayment must be >= 0 and < principal');
    }
    if (toCents(cfg.principal - cfg.downPayment) < 1) {
      throw loanEngineError('E_DOWNPAYMENT', 'financed principal (principal - downPayment) must be at least 0.01');
    }
    if (['years', 'months'].indexOf(cfg.durationUnit) === -1) throw loanEngineError('E_DURATION', 'unknown durationUnit: ' + cfg.durationUnit);
    if (!Number.isInteger(cfg.duration) || cfg.duration < 1) throw loanEngineError('E_DURATION', 'duration must be an integer >= 1');
    const n = cfg.durationUnit === 'years' ? cfg.duration * 12 : cfg.duration;
    if (n < 1 || n > 600) throw loanEngineError('E_DURATION', 'total months must be in [1, 600], got ' + n);
    if (!isFiniteNumber(cfg.annualRate) || cfg.annualRate < 0 || cfg.annualRate >= 100) {
      throw loanEngineError('E_RATE', 'annualRate must be a percent in [0, 100)');
    }
    assertDate(cfg.firstPaymentDate, 'E_DATE', 'firstPaymentDate');
    if (AMORTIZATIONS.indexOf(cfg.amortization) === -1) throw loanEngineError('E_AMORTIZATION', 'unknown amortization: ' + cfg.amortization);
    if (cfg.firstInstallmentInterestOnly && !cfg.interestOnlyExtendsDuration && n < 2) {
      throw loanEngineError('E_IO', "interest-only with 'don't extend duration' needs at least 2 months");
    }

    cfg.rateChanges.forEach(function (rc) {
      if (!isFiniteNumber(rc.annualRate) || rc.annualRate < 0 || rc.annualRate >= 100) {
        throw loanEngineError('E_RATECHANGE', 'rateChanges[].annualRate must be a percent in [0, 100)');
      }
      assertDate(rc.effectiveFrom, 'E_RATECHANGE', 'rateChanges[].effectiveFrom');
    });
    cfg.earlyRepayments.forEach(function (er) {
      if (!isFiniteNumber(er.amount) || toCents(er.amount) < 1) throw loanEngineError('E_EARLYREPAYMENT', 'earlyRepayments[].amount must be at least 0.01');
      assertDate(er.date, 'E_EARLYREPAYMENT', 'earlyRepayments[].date');
      if (FREQUENCIES.indexOf(er.frequency) === -1) throw loanEngineError('E_EARLYREPAYMENT', 'unknown earlyRepayments[].frequency: ' + er.frequency);
      if (er.endDate !== null) {
        assertDate(er.endDate, 'E_EARLYREPAYMENT', 'earlyRepayments[].endDate');
        if (er.endDate < er.date) throw loanEngineError('E_EARLYREPAYMENT', 'earlyRepayments[].endDate must be >= date');
      }
      if (ER_MODES.indexOf(er.mode) === -1) throw loanEngineError('E_EARLYREPAYMENT', 'unknown earlyRepayments[].mode: ' + er.mode);
    });
    cfg.additionalExpenses.forEach(function (ex) {
      if (!isFiniteNumber(ex.amount) || ex.amount < 0) throw loanEngineError('E_EXPENSE', 'additionalExpenses[].amount must be >= 0');
      if (FREQUENCIES.indexOf(ex.frequency) === -1) throw loanEngineError('E_EXPENSE', 'unknown additionalExpenses[].frequency: ' + ex.frequency);
      if (ex.frequency === 'once') {
        if (ex.date === null) ex.date = cfg.firstPaymentDate;
        else assertDate(ex.date, 'E_EXPENSE', 'additionalExpenses[].date');
      } else {
        // monthly expenses are charged per emitted row; a date is meaningless,
        // but if one was provided it must still be well-formed
        if (ex.date !== null) assertDate(ex.date, 'E_EXPENSE', 'additionalExpenses[].date');
        ex.date = null;
      }
    });

    // Stable sorts: same-date rate changes apply in input order (last wins in the
    // while-loop); same-slot early repayments apply in input order.
    cfg.rateChanges.sort(function (a, b) { return a.effectiveFrom < b.effectiveFrom ? -1 : (a.effectiveFrom > b.effectiveFrom ? 1 : 0); });
    cfg.earlyRepayments.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

    return cfg;
  }

  // ── Simulation ────────────────────────────────────────────────────────────
  function simulate(rawConfig) {
    const cfg = normalizeConfig(rawConfig);
    const n = cfg.durationUnit === 'years' ? cfg.duration * 12 : cfg.duration;
    const anchorDay = parseYMD(cfg.firstPaymentDate).d;
    const financedPrincipalC = toCents(cfg.principal - cfg.downPayment);
    const io = cfg.firstInstallmentInterestOnly;

    // Planned amortizing rows. IO+extend keeps n amortizing rows shifted +1 month;
    // IO+don't-extend spends slot 1 on the IO row (n-1 amortizing, end date kept).
    const N = (io && !cfg.interestOnlyExtendsDuration) ? n - 1 : n;
    const dateOffset = io ? 1 : 0;
    const dates = new Array(N);
    for (let i = 1; i <= N; i++) dates[i - 1] = addMonthsClamped(cfg.firstPaymentDate, i - 1 + dateOffset, anchorDay);

    // Snap early repayments to schedule slots: first row whose date >= er.date.
    // One dated during the IO period snaps to the first amortizing row (the IO row
    // never takes principal); one dated after the last planned row is ignored.
    const ers = cfg.earlyRepayments.map(function (er) {
      let slot = null;
      if (er.date <= dates[N - 1]) {
        slot = 1;
        while (dates[slot - 1] < er.date) slot++;
      }
      return { amountC: toCents(er.amount), frequency: er.frequency, endDate: er.endDate, mode: er.mode, slot: slot };
    }).filter(function (er) { return er.slot !== null; });

    function erActiveAt(er, k) {
      if (er.frequency === 'once') return k === er.slot;
      return k >= er.slot && (er.endDate === null || dates[k - 1] <= er.endDate);
    }

    let balC = financedPrincipalC;
    let annualPct = cfg.annualRate;
    let r = annualPct / 100 / 12;
    let rcIdx = 0;
    const rcs = cfg.rateChanges;
    const schedule = [];
    let totalInterestC = 0, totalPrincipalC = 0, totalExtraC = 0, totalPaymentC = 0;

    // Interest-only row (index 0), emitted even at 0% so dates stay aligned.
    if (io) {
      while (rcIdx < rcs.length && rcs[rcIdx].effectiveFrom <= cfg.firstPaymentDate) { annualPct = rcs[rcIdx].annualRate; rcIdx++; }
      r = annualPct / 100 / 12;
      const ioIntC = centRound(balC * r);
      schedule.push({
        index: 0, date: cfg.firstPaymentDate, paymentC: ioIntC, interestC: ioIntC,
        principalC: 0, balanceC: balC, annualRate: annualPct, extraPrincipalC: 0, events: ['interestOnly']
      });
      totalInterestC += ioIntC;
      totalPaymentC += ioIntC;
    }

    // Rate changes dated on/before the first amortizing due date define the loan's
    // OPENING rate: the initial payment uses the standard (round) rule. Only
    // changes landing mid-schedule re-amortize with the ceiling rule below.
    while (rcIdx < rcs.length && rcs[rcIdx].effectiveFrom <= dates[0]) { annualPct = rcs[rcIdx].annualRate; rcIdx++; }
    r = annualPct / 100 / 12;

    let pmtC = 0, prinShareC = 0;
    if (cfg.amortization === 'french') pmtC = annuityPaymentC(balC, r, N);
    else prinShareC = Math.floor(balC / N); // italian: constant principal, final row absorbs

    for (let k = 1; k <= N; k++) {
      if (balC === 0) break;
      const dk = dates[k - 1];
      // 'remaining' INCLUDES the row being processed (spec §6.4 — the off-by-one
      // alternative silently mis-prices re-amortizations by ~2€/month).
      const remaining = N - k + 1;
      const events = [];

      // 1. Rate change: an entry effective exactly on the due date governs this
      // installment; whole-period repricing, no day-count pro-rata.
      let rateChanged = false;
      while (rcIdx < rcs.length && rcs[rcIdx].effectiveFrom <= dk) { annualPct = rcs[rcIdx].annualRate; rcIdx++; rateChanged = true; }
      if (rateChanged) {
        r = annualPct / 100 / 12;
        events.push('rateChange');
        if (cfg.amortization === 'french') pmtC = annuityPaymentCeilC(balC, r, remaining);
      }

      // 2. Interest accrual on the opening balance (bank-standard: before any
      // extra repayment lands — spec §6.4 point 2).
      const intC = centRound(balC * r);

      // 3. Regular payment. The `remaining === 1` arm of the clamp is load-bearing:
      // without it, loans whose payment rounds down leave cents unpaid at row N.
      let prinC = cfg.amortization === 'french' ? pmtC - intC : prinShareC;
      if (remaining === 1 || prinC >= balC) { prinC = balC; events.push('finalAdjusted'); }
      const paymentC = prinC + intC;
      balC -= prinC;

      // 4. Early repayments snapped to this row, in date order.
      let extraC = 0;
      for (let e = 0; e < ers.length; e++) {
        const er = ers[e];
        if (!erActiveAt(er, k)) continue;
        const appliedC = Math.min(er.amountC, balC);
        if (appliedC <= 0) continue;
        balC -= appliedC;
        extraC += appliedC;
        if (events.indexOf('earlyRepayment') === -1) events.push('earlyRepayment');
        if (er.mode === 'reducePayment' && balC > 0 && remaining - 1 > 0) {
          if (cfg.amortization === 'french') pmtC = annuityPaymentCeilC(balC, r, remaining - 1);
          else prinShareC = Math.floor(balC / (remaining - 1));
        }
        // reduceDuration keeps the payment; the prinC >= balC clamp ends the plan early.
      }

      schedule.push({
        index: k, date: dk, paymentC: paymentC, interestC: intC, principalC: prinC,
        balanceC: balC, annualRate: annualPct, extraPrincipalC: extraC, events: events
      });
      totalInterestC += intC;
      totalPrincipalC += prinC;
      totalExtraC += extraC;
      totalPaymentC += paymentC;
    }

    if (balC !== 0) throw loanEngineError('E_INTERNAL', 'schedule did not close: residual balance ' + balC + ' cents');
    if (totalPrincipalC + totalExtraC !== financedPrincipalC) {
      throw loanEngineError('E_INTERNAL', 'principal invariant violated: ' + (totalPrincipalC + totalExtraC) + ' !== ' + financedPrincipalC);
    }

    // Additional expenses never touch amortization; monthly ones are charged once
    // per emitted row (IO row included) and stop at payoff. One-offs count even if
    // dated past payoff — the user entered a real cost.
    let totalExpensesC = 0;
    cfg.additionalExpenses.forEach(function (ex) {
      totalExpensesC += ex.frequency === 'monthly' ? toCents(ex.amount) * schedule.length : toCents(ex.amount);
    });

    let firstAmortizing = null;
    for (let i = 0; i < schedule.length; i++) { if (schedule[i].index >= 1) { firstAmortizing = schedule[i]; break; } }

    const result = {
      config: cfg,
      financedPrincipalC: financedPrincipalC,
      downPaymentC: toCents(cfg.downPayment),
      downPaymentPct: cfg.downPayment / cfg.principal * 100,
      initialPaymentC: firstAmortizing ? firstAmortizing.paymentC : 0,
      installmentCount: schedule.length,
      firstPaymentDate: cfg.firstPaymentDate,
      lastPaymentDate: schedule[schedule.length - 1].date,
      totalInterestC: totalInterestC,
      totalPrincipalC: totalPrincipalC + totalExtraC,
      totalEarlyRepaymentsC: totalExtraC,
      totalExpensesC: totalExpensesC,
      totalPaidC: totalPaymentC + totalExtraC,
      grandTotalC: totalPaymentC + totalExtraC + totalExpensesC,
      savings: null,
      schedule: schedule
    };

    if (cfg.computeSavings && cfg.earlyRepayments.length > 0) {
      const baselineCfg = Object.assign({}, cfg, { earlyRepayments: [], computeSavings: false });
      const baseline = simulate(baselineCfg);
      result.savings = {
        baselineTotalInterestC: baseline.totalInterestC,
        baselineInstallmentCount: baseline.installmentCount,
        baselineLastPaymentDate: baseline.lastPaymentDate,
        interestSavedC: baseline.totalInterestC - totalInterestC,
        monthsSaved: baseline.installmentCount - schedule.length,
        // In sub-cent regimes (exact payment within a cent of interest-only —
        // usury-level rates or cent-scale principals over decades) cent
        // quantization cannot track the contractual schedule and reducePayment's
        // re-spread-to-term can exceed the baseline. Flagged so the UI can
        // message it instead of displaying a negative saving as a benefit.
        degenerate: false
      };
      if (result.savings.interestSavedC < 0 || result.savings.monthsSaved < 0) result.savings.degenerate = true;
    }

    return result;
  }

  global.LoanEngine = {
    simulate: simulate,
    // exported internals for unit tests:
    centRound: centRound,
    toCents: toCents,
    annuityPaymentC: annuityPaymentC,
    parseYMD: parseYMD,
    formatYMD: formatYMD,
    daysInMonth: daysInMonth,
    addMonthsClamped: addMonthsClamped
  };
})(typeof window !== 'undefined' ? window : this);
