import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Calibration config (docs/debt-rebuild-plan.md §6.6): 111,000 @ 4.05% / 30y
const CAL_CONFIG = {
  type: 'mortgage',
  principal: 111000,
  duration: 30,
  durationUnit: 'years',
  annualRate: 4.05,
  firstPaymentDate: '2026-09-06',
  amortization: 'french'
};

describe('Debt views (hub / simulator / results)', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      StackdHydrateIcons: vi.fn(),
      location: { hash: '#debt' }
    };
    global.localStorage = global.window.localStorage;

    executeFile('db.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    executeFile('router.js');

    global.window.Store.init();
    global.window.Views._DebtShared.draft = null;
  });

  describe('DebtHubView', () => {
    it('renders the back link, type tiles, and the My Loans empty state', () => {
      const html = global.window.Views.DebtHubView.render(global.window.Store.getState());
      expect(html).toContain('Loans');
      expect(html).toContain('href="#dashboard"');
      expect(html).toContain('data-type="mortgage"');
      expect(html).toContain('data-type="personal"');
      expect(html).toContain('data-type="installment"');
      expect(html).toContain('debt-loans-empty');
      expect(html).not.toContain('Simulations'); // section hidden with no sims
    });

    it('lists saved simulations with engine-derived figures', () => {
      global.window.Store.dispatch('ADD_LOAN', { name: 'Casa', kind: 'sim', config: CAL_CONFIG });
      const html = global.window.Views.DebtHubView.render(global.window.Store.getState());
      expect(html).toContain('Simulations');
      expect(html).toContain('Casa');
      expect(html).toContain('$533.14'); // default currency USD
      expect(html).toContain('debt-sim-item');
    });

    it('lists active loans under My Loans', () => {
      global.window.Store.dispatch('ADD_LOAN', { name: 'Mutuo', kind: 'active', config: CAL_CONFIG });
      const html = global.window.Views.DebtHubView.render(global.window.Store.getState());
      expect(html).toContain('debt-loan-item');
      expect(html).not.toContain('debt-loans-empty');
    });

    it('shows amortized progress on tracked loan cards', () => {
      global.window.Store.dispatch('ADD_LOAN', { name: 'Mutuo', kind: 'active', config: CAL_CONFIG });
      const loan = global.window.Store.getState().loans[0];
      const p = global.window.Store.getLoanProgress(loan);
      const html = global.window.Views.DebtHubView.render(global.window.Store.getState());
      // paid / remaining come from the schedule, not straight-line math
      expect(html).toContain(`${p.paidCount}/${p.totalCount}`);
      expect(html).toContain('paid');
      expect(html).toContain('remaining');
      expect(html).toContain(`${p.pct.toFixed(0)}%`);
      // untracked loans show no recurring badge
      expect(html).not.toContain('debt-tracked-badge');
    });
  });

  describe('DebtSimView', () => {
    it('creates a typed draft from the route and renders the form', () => {
      global.window.location.hash = '#debt-sim?type=mortgage';
      const html = global.window.Views.DebtSimView.render(global.window.Store.getState());
      expect(html).toContain('Mortgage');
      expect(html).toContain('dsim-principal');
      expect(html).toContain('dsim-down'); // mortgage-only field
      expect(html).toContain('btn-dsim-calculate');
      expect(html).toContain('href="#debt"'); // ✕ target
      const draft = global.window.Views._DebtShared.draft;
      expect(draft.type).toBe('mortgage');
      expect(draft.durationUnit).toBe('years');
      expect(draft.firstPaymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('defaults installment plans to 0% and months, without a down payment field', () => {
      global.window.location.hash = '#debt-sim?type=installment';
      const html = global.window.Views.DebtSimView.render(global.window.Store.getState());
      expect(html).not.toContain('dsim-down');
      const draft = global.window.Views._DebtShared.draft;
      expect(draft.annualRate).toBe('0');
      expect(draft.durationUnit).toBe('months');
    });

    it('prefills the draft from a saved loan when editing', () => {
      global.window.Store.dispatch('ADD_LOAN', { name: 'Casa', kind: 'sim', config: CAL_CONFIG });
      const id = global.window.Store.getState().loans[0].id;
      global.window.location.hash = `#debt-sim?id=${id}`;
      const html = global.window.Views.DebtSimView.render(global.window.Store.getState());
      expect(html).toContain('Edit Simulation');
      const draft = global.window.Views._DebtShared.draft;
      expect(draft.editingLoanId).toBe(id);
      expect(draft.principal).toBe('111000');
      expect(draft.annualRate).toBe('4.05');
    });

    it('keeps the same draft across re-renders of the same route', () => {
      global.window.location.hash = '#debt-sim?type=personal';
      global.window.Views.DebtSimView.render(global.window.Store.getState());
      global.window.Views._DebtShared.draft.principal = '9000';
      const html = global.window.Views.DebtSimView.render(global.window.Store.getState());
      expect(html).toContain('value="9000"');
    });
  });

  describe('DebtResultsView', () => {
    it('renders calibration figures from a fresh simulation hand-off', () => {
      global.window.location.hash = '#debt-results';
      global.window.Store.dispatch('SET_DEBT_SIM', { config: CAL_CONFIG, fromForm: true, editingLoanId: null });
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).toContain('$533.14');    // monthly payment
      expect(html).toContain('$80,927.05'); // total interest
      expect(html).toContain('360');        // installments
      expect(html).toContain('06/08/56');   // last payment
      expect(html).toContain('btn-dres-save');
      expect(html).toContain('btn-dres-promote');
      expect(html).not.toContain('btn-dres-menu'); // no ⋯ on unsaved sims
    });

    it('renders a saved simulation by id with the ⋯ menu and no save buttons', () => {
      global.window.Store.dispatch('ADD_LOAN', { name: 'Casa', kind: 'sim', config: CAL_CONFIG });
      const id = global.window.Store.getState().loans[0].id;
      global.window.location.hash = `#debt-results?id=${id}`;
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).toContain('Casa');
      expect(html).toContain('btn-dres-menu');
      expect(html).not.toContain('btn-dres-save');
      expect(html).toContain('$533.14');
    });

    it('shows the degenerate-savings notice instead of a negative saving', () => {
      global.window.location.hash = '#debt-results';
      global.window.Store.dispatch('SET_DEBT_SIM', {
        config: {
          principal: 109874.92, annualRate: 0, duration: 600, durationUnit: 'months',
          firstPaymentDate: '2076-08-07', amortization: 'french',
          rateChanges: [{ annualRate: 35.37, effectiveFrom: '2084-10-07' }],
          earlyRepayments: [{ amount: 2.59, date: '2090-11-07', mode: 'reducePayment', frequency: 'monthly' }]
        },
        fromForm: true
      });
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).toContain("doesn't reduce the loan's cost");
      expect(html).not.toContain('Interest Saved');
    });

    it('shows progress, next payment and the tracking CTA for an active loan', () => {
      global.window.Store.dispatch('ADD_LOAN', { name: 'Mutuo', kind: 'active', config: CAL_CONFIG });
      const id = global.window.Store.getState().loans[0].id;
      global.window.location.hash = `#debt-results?id=${id}`;
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).toContain('dres-progress');
      expect(html).toContain('Next Payment');
      expect(html).toContain('btn-dres-track');
      expect(html).not.toContain('dres-tracked');
    });

    it('shows the tracked state once a linked series exists', () => {
      global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 9000 });
      const account = global.window.Store.getState().accounts[0];
      global.window.Store.dispatch('ADD_LOAN', { name: 'Mutuo', kind: 'active', config: CAL_CONFIG });
      const loan = global.window.Store.getState().loans[0];
      global.window.Store.dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId: 'series-x' });
      global.window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 533.14, accountId: account.id, categoryId: 'cat_debt',
        date: '2026-09-06',
        recurrence: { seriesId: 'series-x', interval: 1, frequency: 'months', endDate: '2028-09-06' }
      });

      global.window.location.hash = `#debt-results?id=${loan.id}`;
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).toContain('dres-tracked');
      expect(html).toContain('Tracked as a monthly expense');
      expect(html).not.toContain('btn-dres-track');

      // the hub badges it too
      const hub = global.window.Views.DebtHubView.render(global.window.Store.getState());
      expect(hub).toContain('debt-tracked-badge');
    });

    it('does not offer tracking for a finished loan (no back-dated series)', () => {
      // Regression: nextPayment is null once every instalment is in the past;
      // the prefill used to fall back to firstPaymentDate and fabricate years
      // of historical expenses.
      const past = {
        principal: 8000, duration: 3, durationUnit: 'years', annualRate: 6,
        firstPaymentDate: '2018-04-10', amortization: 'french'
      };
      global.window.Store.dispatch('ADD_LOAN', { name: 'Vecchio', kind: 'active', config: past });
      const loan = global.window.Store.getState().loans[0];
      const p = global.window.Store.getLoanProgress(loan);
      expect(p.isPaidOff).toBe(true);
      expect(p.nextPayment).toBeNull();
      expect(global.window.Views._DebtShared.trackablePayment(p)).toBeNull();

      global.window.location.hash = `#debt-results?id=${loan.id}`;
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).toContain('dres-progress');
      expect(html).not.toContain('btn-dres-track');

      // and the prefill refuses to arm anything
      delete global.window._draftTxFormState;
      global.window.Views._DebtShared.startRecurringPrefill(loan);
      expect(global.window._draftTxFormState).toBeUndefined();
      expect(global.window.Store.getState().pendingLoanLink).toBeNull();
    });

    it('arms the regular instalment, not the interest-only stub', () => {
      // Regression: index-0 IO row leaked into the series, under-charging every
      // month for the life of the loan.
      const ioConfig = {
        principal: 90000, duration: 20, durationUnit: 'years', annualRate: 3.5,
        firstPaymentDate: '2026-09-01', amortization: 'french',
        firstInstallmentInterestOnly: true
      };
      global.window.Store.dispatch('ADD_LOAN', { name: 'Mutuo IO', kind: 'active', config: ioConfig });
      const loan = global.window.Store.getState().loans[0];
      const p = global.window.Store.getLoanProgress(loan, '2026-08-01');

      const ioRow = p.simulation.schedule[0];
      expect(ioRow.index).toBe(0);
      expect(p.nextPayment.amountC).toBe(ioRow.paymentC);          // display = the real next row
      expect(p.nextRegularPayment.amountC).toBe(p.initialPaymentC); // prefill = a true instalment
      expect(p.nextRegularPayment.amountC).toBeGreaterThan(ioRow.paymentC);

      delete global.window._draftTxFormState;
      global.window.Views._DebtShared.startRecurringPrefill(loan);
      const draft = global.window._draftTxFormState;
      expect(draft.amount).toBe((p.initialPaymentC / 100).toFixed(2));
      expect(draft.date).toBe(p.nextRegularPayment.date);
      expect(draft.recurrenceSeriesId).toBe(global.window.Store.getState().pendingLoanLink.seriesId);
    });

    it('prefills the default account and survives quotes in the loan name', () => {
      global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet', openingBalance: 100 });
      const accountId = global.window.Store.getState().accounts[0].id;
      global.window.Store.dispatch('ADD_LOAN', {
        name: 'Bob\'s "Big" Loan', kind: 'active', config: CAL_CONFIG
      });
      const loan = global.window.Store.getState().loans[1] || global.window.Store.getState().loans[0];

      delete global.window._draftTxFormState;
      global.window.Views._DebtShared.startRecurringPrefill(loan);
      const draft = global.window._draftTxFormState;
      expect(draft.account).toBe(accountId); // was '' → alphabetically-first account
      expect(draft.note).toBe('Bob\'s "Big" Loan — loan payment'); // raw text, escaped at render

      // the form must not let the quote break out of the value attribute
      global.window.location.hash = '#add';
      const formHtml = global.window.Views.AddTransactionView.render(global.window.Store.getState());
      expect(formHtml).toContain('value="Bob&#39;s &quot;Big&quot; Loan — loan payment"');
      expect(formHtml).not.toContain('value="Bob\'s "Big"');
    });

    it('never rounds progress up to 100% while money is owed', () => {
      const S = global.window.Views._DebtShared;
      expect(S.pctLabel({ pct: 99.6, isPaidOff: false })).toBe('99');
      expect(S.pctLabel({ pct: 99.99, isPaidOff: false })).toBe('99');
      expect(S.pctLabel({ pct: 100, isPaidOff: true })).toBe('100');
      expect(S.pctLabel({ pct: 16.05, isPaidOff: false })).toBe('16');
    });

    it('does not show progress for saved simulations', () => {
      global.window.Store.dispatch('ADD_LOAN', { name: 'Casa', kind: 'sim', config: CAL_CONFIG });
      const id = global.window.Store.getState().loans[0].id;
      global.window.location.hash = `#debt-results?id=${id}`;
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).not.toContain('dres-progress');
    });

    it('renders a fallback card when there is nothing to show', () => {
      global.window.location.hash = '#debt-results';
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).toContain('Nothing to show');
      expect(html).toContain('href="#debt"');
    });
  });
});
