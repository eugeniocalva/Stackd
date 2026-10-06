// 1.0.3 (BUG-145, BUG-71, BUG-118) — loan simulator money and rate input.
// Money fields are text inputs read by Store.parseAmount (Italian '250.000'
// is 250000, not 250), the rate by _DebtShared.parseRate (decimal comma or
// point), a blank rate / decimal duration reach the engine's E_RATE /
// E_DURATION instead of becoming a 0% / truncated loan, and the add sheets
// and the loan name prompt explain a rejected input instead of ignoring it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const executeFile = (relativePath) => {
  const content = fs.readFileSync(path.resolve(__dirname, '../../src', relativePath), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const S = () => global.window.Views._DebtShared;
const Sim = () => global.window.Views.DebtSimView;

const draft = (patch) => ({ ...S().newDraft('personal'), firstPaymentDate: '2026-09-01', ...patch });

const engineCode = (config) => {
  try { global.window.LoanEngine.simulate({ ...config, computeSavings: false }); } catch (e) { return e.code; }
  return null;
};

const setLang = (lang) => {
  executeFile(`i18n/${lang}.js`);
  global.window.I18n.setLang(lang);
};

describe('Loan simulator input (1.0.3 BUG-145 / BUG-71 / BUG-118)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 7, 15, 12, 0, 0));
    document.body.innerHTML = '<div id="modal-container"></div>';
    global.window = {
      crypto: { randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      StackdHydrateIcons: vi.fn(),
      location: { hash: '#debt' }
    };
    global.localStorage = global.window.localStorage;
    ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js', 'router.js'].forEach(executeFile);
    global.window.Store.init();
    S().draft = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  describe('buildConfig', () => {
    it('reads Italian grouped amounts through Store.parseAmount', () => {
      setLang('it');
      const c = S().buildConfig(draft({ type: 'mortgage', principal: '250.000', downPayment: '50.000', duration: '25', annualRate: '3,2' }));
      expect(c.principal).toBe(250000);
      expect(c.downPayment).toBe(50000);
      expect(c.annualRate).toBe(3.2);
      expect(engineCode(c)).toBeNull();
    });

    it('reads English grouping and decimals', () => {
      const c = S().buildConfig(draft({ principal: '1,234.56', duration: '2', annualRate: '4.125' }));
      expect(c.principal).toBe(1234.56);
      expect(c.annualRate).toBe(4.125);
    });

    it('parseRate takes a decimal comma or point and an optional %, nothing else', () => {
      const r = (v) => S().parseRate(v);
      expect(r('3,2')).toBe(3.2);
      expect(r('4.125')).toBe(4.125);
      expect(r(' 3.5 % ')).toBe(3.5);
      expect(r('0')).toBe(0);
      expect(r('')).toBeNaN();
      expect(r('1.000,5')).toBeNaN();
      expect(r('abc')).toBeNaN();
      expect(r('-1')).toBeNaN();
    });

    it('a blank rate is E_RATE, not a 0% loan (BUG-71)', () => {
      const c = S().buildConfig(draft({ principal: '10000', duration: '5', annualRate: '' }));
      expect(engineCode(c)).toBe('E_RATE');
    });

    it('a decimal duration is E_DURATION, not truncated (BUG-71)', () => {
      const c = S().buildConfig(draft({ principal: '10000', duration: '2.5', annualRate: '5' }));
      expect(engineCode(c)).toBe('E_DURATION');
    });

    it('a blank amount stays the engine\'s "greater than zero" error', () => {
      const c = S().buildConfig(draft({ principal: '', duration: '5', annualRate: '5' }));
      expect(engineCode(c)).toBe('E_PRINCIPAL');
      expect(Sim().engineError({ name: 'LoanEngineError', code: 'E_PRINCIPAL' }, c).message).toBe('Enter a loan amount greater than zero.');
    });

    it('an unreadable amount or down payment says how to write one, on its own field', () => {
      const bad = S().buildConfig(draft({ principal: '12 50', duration: '5', annualRate: '5' }));
      expect(bad.principal).toBeNaN();
      const e1 = { name: 'LoanEngineError', code: engineCode(bad) };
      expect(Sim().engineError(e1, bad)).toEqual({ message: 'Enter a valid amount, like 1,234.56.', field: 'dsim-principal', details: false });

      const badDown = S().buildConfig(draft({ type: 'mortgage', principal: '200000', downPayment: 'abc', duration: '25', annualRate: '3' }));
      expect(badDown.downPayment).toBeNaN();
      const e2 = { name: 'LoanEngineError', code: engineCode(badDown) };
      expect(e2.code).toBe('E_DOWNPAYMENT');
      expect(Sim().engineError(e2, badDown)).toEqual({ message: 'Enter a valid amount, like 1,234.56.', field: 'dsim-down', details: false });
    });
  });

  describe('prefill and markup', () => {
    it('prefills a saved loan rounded to cents', () => {
      const d = S().newDraft(null, { id: 'L1', config: { type: 'mortgage', principal: 1.23456, downPayment: 0.996, duration: 2, durationUnit: 'years', annualRate: 3.25, firstPaymentDate: '2026-09-01' } });
      expect(d.principal).toBe('1.23');
      expect(d.downPayment).toBe('1');
      expect(d.annualRate).toBe('3.25');
    });

    it('money and rate fields are decimal text inputs; duration stays numeric', () => {
      global.window.location.hash = '#debt-sim?type=mortgage';
      const host = document.createElement('div');
      host.innerHTML = Sim().render(global.window.Store.getState());
      for (const id of ['dsim-principal', 'dsim-down', 'dsim-rate']) {
        const el = host.querySelector('#' + id);
        expect(el.getAttribute('type')).toBe('text');
        expect(el.getAttribute('inputmode')).toBe('decimal');
        expect(el.hasAttribute('min')).toBe(false);
        expect(el.hasAttribute('step')).toBe(false);
      }
      expect(host.querySelector('#dsim-duration').getAttribute('type')).toBe('number');
    });

    it('a typed draft value is escaped back into the attribute', () => {
      global.window.location.hash = '#debt-sim?type=personal';
      Sim().render(global.window.Store.getState());
      S().draft.principal = '1"><b id="x">';
      S().draft.annualRate = '"3';
      const html = Sim().render(global.window.Store.getState());
      expect(html).not.toContain('<b id="x">');
      const host = document.createElement('div');
      host.innerHTML = html;
      expect(host.querySelector('#dsim-principal').value).toBe('1"><b id="x">');
      expect(host.querySelector('#dsim-rate').value).toBe('"3');
      expect(host.querySelector('#x')).toBeNull();
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
    const type = (el, v) => { el.value = v; el.dispatchEvent(new document.defaultView.Event('input', { bubbles: true })); };

    it('Italian 250.000 simulates a 250,000 loan', () => {
      setLang('it');
      const host = mount('#debt-sim?type=mortgage');
      type(host.querySelector('#dsim-principal'), '250.000');
      type(host.querySelector('#dsim-down'), '50.000');
      type(host.querySelector('#dsim-duration'), '25');
      type(host.querySelector('#dsim-rate'), '3,2');
      expect(host.querySelector('#dsim-down-pct').textContent).toContain('20');
      host.querySelector('#btn-dsim-calculate').click();
      expect(host.querySelector('#dsim-error').style.display).toBe('none');
      const sim = global.window.Store.getState().debtSim;
      expect(sim.config.principal).toBe(250000);
      expect(sim.config.downPayment).toBe(50000);
      expect(sim.config.annualRate).toBe(3.2);
    });

    it('hides the down-payment share when an amount is unreadable', () => {
      const host = mount('#debt-sim?type=mortgage');
      type(host.querySelector('#dsim-principal'), '200000');
      type(host.querySelector('#dsim-down'), '40000');
      expect(host.querySelector('#dsim-down-pct').textContent).toBe('(20.0%)');
      type(host.querySelector('#dsim-down'), 'abc');
      expect(host.querySelector('#dsim-down-pct').textContent).toBe('');
    });

    it('an unreadable amount marks the amount field with the example', () => {
      const host = mount('#debt-sim?type=personal');
      type(host.querySelector('#dsim-principal'), '12 50');
      type(host.querySelector('#dsim-duration'), '5');
      type(host.querySelector('#dsim-rate'), '5');
      host.querySelector('#btn-dsim-calculate').click();
      expect(host.querySelector('#dsim-error').textContent).toBe('Enter a valid amount, like 1,234.56.');
      expect(host.querySelector('#dsim-principal').getAttribute('aria-invalid')).toBe('true');
      expect(global.window.Store.getState().debtSim).toBeFalsy();
    });

    it('a blank rate marks the rate field', () => {
      const host = mount('#debt-sim?type=personal');
      type(host.querySelector('#dsim-principal'), '10000');
      type(host.querySelector('#dsim-duration'), '5');
      host.querySelector('#btn-dsim-calculate').click();
      expect(host.querySelector('#dsim-error').textContent).toBe('The annual rate must be at least 0% and below 100%.');
      expect(host.querySelector('#dsim-rate').getAttribute('aria-invalid')).toBe('true');
    });
  });

  describe('add sheets (BUG-118)', () => {
    let host;
    const open = (kind) => {
      global.window.location.hash = '#debt-sim?type=personal';
      host = document.createElement('div');
      document.body.appendChild(host);
      host.innerHTML = Sim().render(global.window.Store.getState());
      Sim().attachEvents(host);
      host.querySelector(`.dsim-add[data-add="${kind}"]`).click();
    };
    const $ = (id) => document.getElementById(id);
    const save = () => $('modal-save-btn').click();
    const errOf = (id) => {
      const el = $(id);
      expect(el.getAttribute('aria-invalid')).toBe('true');
      return $(el.getAttribute('aria-describedby')).textContent;
    };

    it('the sheets use decimal text inputs for amounts and the rate', () => {
      for (const [kind, id] of [['rate', 'dsim-rc-rate'], ['er', 'dsim-er-amount'], ['expense', 'dsim-ex-amount']]) {
        open(kind);
        expect($(id).getAttribute('type')).toBe('text');
        expect($(id).getAttribute('inputmode')).toBe('decimal');
      }
    });

    it('rate change: out of range and missing date are explained; 3,5 is accepted', () => {
      open('rate');
      $('dsim-rc-rate').value = '150';
      save();
      expect(errOf('dsim-rc-rate')).toBe('The annual rate must be at least 0% and below 100%.');
      expect($('active-modal')).not.toBeNull();
      expect(S().draft.rateChanges).toHaveLength(0);

      $('dsim-rc-rate').value = '3,5';
      $('dsim-rc-date').value = '';
      save();
      expect($('dsim-rc-rate').hasAttribute('aria-invalid')).toBe(false);
      expect(errOf('dsim-rc-date')).toBe('Choose a date.');
      expect(document.querySelectorAll('#active-modal .field-error')).toHaveLength(1);

      $('dsim-rc-date').value = '2027-01-01';
      save();
      expect(S().draft.rateChanges).toEqual([{ annualRate: 3.5, effectiveFrom: '2027-01-01' }]);
    });

    it('early repayment: unreadable, missing and grouped amounts', () => {
      open('er');
      $('dsim-er-amount').value = 'abc';
      save();
      expect(errOf('dsim-er-amount')).toBe('Enter a valid amount, like 1,234.56.');
      $('dsim-er-amount').value = '';
      save();
      expect(errOf('dsim-er-amount')).toBe('Enter an amount greater than zero.');
      $('dsim-er-amount').value = '1,000';
      $('dsim-er-date').value = '';
      save();
      expect(errOf('dsim-er-date')).toBe('Choose a date.');
      $('dsim-er-date').value = '2027-01-01';
      save();
      expect(S().draft.earlyRepayments).toHaveLength(1);
      expect(S().draft.earlyRepayments[0].amount).toBe(1000);
    });

    it('early repayment reads an Italian 1.000 as one thousand', () => {
      setLang('it');
      open('er');
      $('dsim-er-amount').value = '1.000';
      save();
      expect(S().draft.earlyRepayments[0].amount).toBe(1000);
    });

    it('extra cost: missing name, negative and unreadable amounts; 0 is allowed', () => {
      open('expense');
      $('dsim-ex-amount').value = '10';
      save();
      expect(errOf('dsim-ex-name')).toBe('Enter a name for this cost.');
      $('dsim-ex-name').value = 'Insurance';
      $('dsim-ex-amount').value = '-1';
      save();
      expect(errOf('dsim-ex-amount')).toBe('Enter an amount of 0 or more.');
      $('dsim-ex-amount').value = 'x1';
      save();
      expect(errOf('dsim-ex-amount')).toBe('Enter a valid amount, like 1,234.56.');
      $('dsim-ex-amount').value = '';
      save();
      expect(errOf('dsim-ex-amount')).toBe('Enter an amount of 0 or more.');
      $('dsim-ex-amount').value = '0';
      save();
      expect(S().draft.additionalExpenses).toEqual([{ name: 'Insurance', amount: 0, frequency: 'once', date: S().draft.firstPaymentDate }]);
    });

    it('loan name prompt: an empty name is explained', () => {
      const Store = global.window.Store;
      Store.dispatch('SET_DEBT_SIM', {
        config: { type: 'personal', principal: 5000, downPayment: 0, duration: 2, durationUnit: 'years', annualRate: 4, firstPaymentDate: '2026-09-01', amortization: 'french' },
        fromForm: true, editingLoanId: null
      });
      global.window.location.hash = '#debt-results';
      const c = document.createElement('div');
      document.body.appendChild(c);
      const state = Store.getState();
      c.innerHTML = global.window.Views.DebtResultsView.render(state);
      global.window.Views.DebtResultsView.attachEvents(c, state);
      c.querySelector('#btn-dres-save').click();
      $('loan-name-input').value = '   ';
      save();
      expect(errOf('loan-name-input')).toBe('Enter a name for this loan.');
      expect(Store.getState().loans).toHaveLength(0);
    });
  });
});
