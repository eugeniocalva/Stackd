// 1.0.1 (BUG-10) — the loan simulator never shows LoanEngine's developer
// English ("principal must be > 0"). Engine error CODES map to localized
// debt.err.* messages, the offending field is marked aria-invalid (+ described
// by #dsim-error) and focused, list faults open the Details section, and any
// edit clears the marks. Stored/imported invalid loans get the same message
// inside the results view's computeError wrapper.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const executeFile = (relativePath) => {
  const content = fs.readFileSync(path.resolve(__dirname, '../../src', relativePath), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const VALID = {
  type: 'personal',
  principal: 10000,
  downPayment: 0,
  duration: 5,
  durationUnit: 'years',
  annualRate: 5,
  firstPaymentDate: '2026-07-01',
  amortization: 'french'
};

// Developer phrases the engine uses; none may reach the user.
const ENGINE_JARGON = /principal must|downPayment|annualRate|firstPaymentDate|rateChanges\[|earlyRepayments\[|additionalExpenses\[|>=|financed principal|percent in \[|integer >= 1/;

const engineErrorFor = (config) => {
  try {
    global.window.LoanEngine.simulate({ ...config, computeSavings: false });
  } catch (e) {
    return e;
  }
  throw new Error('expected the engine to reject ' + JSON.stringify(config));
};

const Sim = () => global.window.Views.DebtSimView;

describe('LoanEngine error mapping (1.0.1 BUG-10)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      StackdHydrateIcons: vi.fn(),
      location: { hash: '#debt' }
    };
    global.localStorage = global.window.localStorage;

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('loan-engine.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    executeFile('router.js');

    global.window.Store.init();
    global.window.Views._DebtShared.draft = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('DebtSimView.engineError', () => {
    const cases = [
      ['zero principal', { principal: 0 }, 'E_PRINCIPAL', 'Enter a loan amount greater than zero.', 'dsim-principal', false],
      ['down payment >= principal', { type: 'mortgage', principal: 100000, downPayment: 100000 }, 'E_DOWNPAYMENT',
        'The down payment must be less than the loan amount.', 'dsim-down', false],
      ['negative rate', { annualRate: -1 }, 'E_RATE', 'The annual rate must be at least 0% and below 100%.', 'dsim-rate', false],
      ['zero duration', { duration: 0 }, 'E_DURATION', 'Enter a whole-number duration between 1 month and 50 years.', 'dsim-duration', false],
      ['over 50 years', { duration: 51 }, 'E_DURATION', 'Enter a whole-number duration between 1 month and 50 years.', 'dsim-duration', false],
      ['empty first payment date', { firstPaymentDate: '' }, 'E_DATE', 'Choose a valid first payment date.', 'dsim-first-date', false],
      ['interest-only stub on a 1-month loan', { duration: 1, durationUnit: 'months', firstInstallmentInterestOnly: true, interestOnlyExtendsDuration: false },
        'E_IO', 'An interest-only first installment that keeps the duration needs a loan of at least 2 months.', null, true],
      ['rate change at 100%', { rateChanges: [{ annualRate: 100, effectiveFrom: '2027-01-01' }] }, 'E_RATECHANGE',
        'Check your rate changes: each one needs a rate below 100% and a valid date.', null, true],
      ['early repayment ending before it starts', { earlyRepayments: [{ amount: 100, date: '2027-06-01', frequency: 'monthly', endDate: '2027-01-01', mode: 'reduceDuration' }] },
        'E_EARLYREPAYMENT', 'Check your early repayments: each one needs an amount and a valid date, and an end date can’t be before its start.', null, true],
      ['negative extra cost', { additionalExpenses: [{ name: 'Fee', amount: -1, frequency: 'once' }] }, 'E_EXPENSE',
        'Check your extra costs: each one needs an amount of 0 or more and a valid date.', null, true]
    ];

    it.each(cases)('maps %s', (label, patch, code, message, field, details) => {
      const config = { ...VALID, ...patch };
      const e = engineErrorFor(config);
      expect(e.code).toBe(code);
      const out = Sim().engineError(e, config);
      expect(out).toEqual({ message, field, details });
      expect(out.message).not.toMatch(ENGINE_JARGON);
    });

    it('remaps the overloaded E_DOWNPAYMENT ("financed principal < 0.01") to the amount when no down payment was entered', () => {
      const config = { ...VALID, principal: 0.004 };
      const e = engineErrorFor(config);
      expect(e.code).toBe('E_DOWNPAYMENT');
      expect(Sim().engineError(e, config)).toEqual({
        message: 'Enter a loan amount greater than zero.', field: 'dsim-principal', details: false
      });
    });

    // 1.0.1 (BUG-10) review fix: a NEGATIVE down payment is the down-payment
    // field's fault — it used to be remapped to "Enter a loan amount…" and
    // mark a valid Loan Amount.
    it('keeps a negative down payment on the down-payment field with its own message', () => {
      const config = { ...VALID, type: 'mortgage', principal: 200000, downPayment: -5000, duration: 25, annualRate: 3 };
      const e = engineErrorFor(config);
      expect(e.code).toBe('E_DOWNPAYMENT');
      const out = Sim().engineError(e, config);
      expect(out).toEqual({ message: 'The down payment can’t be negative.', field: 'dsim-down', details: false });
      expect(out.message).not.toMatch(ENGINE_JARGON);
    });

    it('still remaps when the down payment is missing or empty (not just 0)', () => {
      const e = engineErrorFor({ ...VALID, principal: 0.004 });
      const principalErr = { message: 'Enter a loan amount greater than zero.', field: 'dsim-principal', details: false };
      expect(Sim().engineError(e, { ...VALID, downPayment: undefined })).toEqual(principalErr);
      expect(Sim().engineError(e, null)).toEqual(principalErr);
      expect(Sim().engineError(e, undefined)).toEqual(principalErr);
    });

    it('localizes the negative down-payment message', () => {
      executeFile('i18n/fr.js');
      global.window.I18n.setLang('fr');
      const config = { ...VALID, type: 'mortgage', principal: 200000, downPayment: -1 };
      expect(Sim().engineError(engineErrorFor(config), config).message).toBe('L’apport ne peut pas être négatif.');
    });

    it('falls back to the generic message for non-engine and structural errors', () => {
      const generic = { message: 'Please check your inputs.', field: null, details: false };
      expect(Sim().engineError(new Error('boom'), VALID)).toEqual(generic);
      expect(Sim().engineError(null, VALID)).toEqual(generic);
      const cfgErr = engineErrorFor({ ...VALID, type: 'bogus' });
      expect(cfgErr.code).toBe('E_CONFIG');
      expect(Sim().engineError(cfgErr, VALID)).toEqual(generic);
      const amErr = engineErrorFor({ ...VALID, amortization: 'weird' });
      expect(amErr.code).toBe('E_AMORTIZATION');
      expect(Sim().engineError(amErr, VALID)).toEqual(generic);
    });

    it('localizes by the UI language at call time (Italian)', () => {
      executeFile('i18n/it.js');
      global.window.I18n.setLang('it');
      const config = { ...VALID, principal: 0 };
      const out = Sim().engineError(engineErrorFor(config), config);
      expect(out.message).toBe('Inserisci un importo del prestito maggiore di zero.');
    });
  });

  describe('DebtResultsView', () => {
    it('shows the mapped message for a stored loan whose config the engine rejects', () => {
      global.window.Store.dispatch('ADD_LOAN', { name: 'Imported', kind: 'sim', config: { ...VALID } });
      const loan = global.window.Store.getState().loans[0];
      loan.config = { ...loan.config, principal: 0 }; // e.g. a hand-edited CSV restore
      global.window.location.hash = `#debt-results?id=${loan.id}`;
      const html = global.window.Views.DebtResultsView.render(global.window.Store.getState());
      expect(html).toContain('This simulation could not be computed: Enter a loan amount greater than zero.');
      expect(html).not.toContain('principal must be');
    });
  });

  describe('simulator form (DOM)', () => {
    const mount = (hash) => {
      global.window.location.hash = hash;
      const host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = Sim().render(global.window.Store.getState());
      Sim().attachEvents(host);
      return host;
    };
    const q = (host, id) => host.querySelector('#' + id);

    it('marks and focuses the offending field, and any edit clears the mark', () => {
      const host = mount('#debt-sim?type=personal');
      const principal = q(host, 'dsim-principal');
      principal.value = '';
      principal.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
      global.window.Views._DebtShared.draft.principal = '';

      q(host, 'btn-dsim-calculate').click();

      const errEl = q(host, 'dsim-error');
      expect(errEl.style.display).toBe('block');
      expect(errEl.textContent).toBe('Enter a loan amount greater than zero.');
      expect(errEl.getAttribute('role')).toBe('alert');
      expect(principal.getAttribute('aria-invalid')).toBe('true');
      expect(principal.getAttribute('aria-describedby')).toBe('dsim-error');
      expect(document.activeElement).toBe(principal);

      // Typing anywhere in the form clears every mark and the message.
      principal.value = '5000';
      principal.dispatchEvent(new document.defaultView.Event('input', { bubbles: true }));
      expect(principal.hasAttribute('aria-invalid')).toBe(false);
      expect(principal.hasAttribute('aria-describedby')).toBe(false);
      expect(errEl.style.display).toBe('none');
    });

    it('a negative mortgage down payment marks #dsim-down, not the valid Loan Amount', () => {
      const host = mount('#debt-sim?type=mortgage');
      const down = q(host, 'dsim-down');
      expect(down.getAttribute('min')).toBe('0');
      const S = global.window.Views._DebtShared;
      S.draft.principal = '200000';
      S.draft.downPayment = '-5000';
      S.draft.duration = '25';
      S.draft.annualRate = '3';
      q(host, 'btn-dsim-calculate').click();
      expect(q(host, 'dsim-error').textContent).toBe('The down payment can’t be negative.');
      expect(down.getAttribute('aria-invalid')).toBe('true');
      expect(q(host, 'dsim-principal').hasAttribute('aria-invalid')).toBe(false);
      expect(document.activeElement).toBe(down);
    });

    it('clears a duration mark when the user fixes it through the unit select', () => {
      const host = mount('#debt-sim?type=personal');
      const S = global.window.Views._DebtShared;
      S.draft.principal = '1000';
      S.draft.duration = '51';
      S.draft.durationUnit = 'years';
      q(host, 'btn-dsim-calculate').click();
      const duration = q(host, 'dsim-duration');
      expect(duration.getAttribute('aria-invalid')).toBe('true');
      const unit = q(host, 'dsim-duration-unit');
      unit.dispatchEvent(new document.defaultView.Event('change', { bubbles: true }));
      expect(duration.hasAttribute('aria-invalid')).toBe(false);
    });

    it('opens Details for a fault in the lists and marks no field', () => {
      const host = mount('#debt-sim?type=personal');
      const S = global.window.Views._DebtShared;
      S.draft.principal = '1000';
      S.draft.duration = '2';
      S.draft.additionalExpenses.push({ name: 'Fee', amount: -5, frequency: 'once' });
      const body = q(host, 'dsim-details-body');
      expect(body.style.display).toBe('none');
      q(host, 'btn-dsim-calculate').click();
      expect(q(host, 'dsim-error').textContent).toBe('Check your extra costs: each one needs an amount of 0 or more and a valid date.');
      expect(body.style.display).toBe('block');
      expect(host.querySelectorAll('[aria-invalid]').length).toBe(0);
    });
  });
});
