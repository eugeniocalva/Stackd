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

    it('renders a fallback card when there is nothing to show', () => {
      global.window.location.hash = '#debt-results';
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).toContain('Nothing to show');
      expect(html).toContain('href="#debt"');
    });
  });
});
