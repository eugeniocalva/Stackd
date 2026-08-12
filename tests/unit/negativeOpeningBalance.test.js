import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Negative Opening Balance Support', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app"></div>
    `;

    global.window = {
      Store: {
        ACCOUNT_COLORS: ['#0075EB', '#E60023'],
        getState: () => ({
          accounts: [
            { id: 'acc_cc', name: 'Credit Card', color: '#E60023', icon: 'credit-card', type: 'Credit card' }
          ],
          transactions: [
            { id: 'ob_1', type: 'opening_balance', amount: -250.00, accountId: 'acc_cc', date: '2026-07-01' }
          ],
          currency: 'USD',
          defaultAccountId: 'acc_cc'
        }),
        getCurrencySymbol: () => '$',
        getAccountBalance: (id) => -250.00,
        dispatch: vi.fn(),
        _isPositiveTx: (t) => t.type === 'opening_balance' ? t.amount >= 0 : (t.type === 'income' || t.type === 'transfer_in')
      },
      Router: {
        getParams: () => ({ id: 'acc_cc' }),
        navigate: vi.fn()
      },
      StackdHydrateIcons: vi.fn(),
      StackdDB: {
        generateId: () => 'acc_new_456'
      },
      Views: {}
    };

    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('views.js');
  });

  it('renders negative sign toggle and red negative balance UI when opening balance is negative', () => {
    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    
    const btnNeg = container.querySelector('#btn-ob-neg');
    const symbol = container.querySelector('#ob-sign-symbol');
    const obInput = container.querySelector('#edit-acc-balance');

    expect(btnNeg.getAttribute('aria-pressed')).toBe('true');
    expect(symbol.textContent).toBe('-$');
    expect(obInput.value).toBe('250.00');
  });

  it('toggles to positive sign when + Positive button is clicked', () => {
    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    window.Views.EditAccountView.attachEvents(container, window.Store.getState());

    const btnPos = container.querySelector('#btn-ob-pos');
    const symbol = container.querySelector('#ob-sign-symbol');
    btnPos.click();

    expect(btnPos.getAttribute('aria-pressed')).toBe('true');
    expect(symbol.textContent).toBe('$');

    // Click save
    const btnSave = document.getElementById('btn-edit-acc-save');
    btnSave.click();

    expect(window.Store.dispatch).toHaveBeenCalledWith('UPDATE_ACCOUNT', expect.objectContaining({
      id: 'acc_cc',
      openingBalance: 250.00
    }));
  });

  it('dispatches negative opening balance when - Negative is selected on save', () => {
    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    window.Views.EditAccountView.attachEvents(container, window.Store.getState());

    const obInput = container.querySelector('#edit-acc-balance');
    obInput.value = '500.00';

    const btnSave = document.getElementById('btn-edit-acc-save');
    btnSave.click();

    expect(window.Store.dispatch).toHaveBeenCalledWith('UPDATE_ACCOUNT', expect.objectContaining({
      id: 'acc_cc',
      openingBalance: -500.00
    }));
  });

  it('auto-selects negative balance toggle when type is changed to Credit card for a new account', () => {
    global.window.Router.getParams = () => ({}); // new account

    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    window.Views.EditAccountView.attachEvents(container, window.Store.getState());

    const typeSelect = container.querySelector('#edit-acc-type');
    typeSelect.value = 'Credit card';
    typeSelect.dispatchEvent(new Event('change'));

    const btnNeg = container.querySelector('#btn-ob-neg');
    const symbol = container.querySelector('#ob-sign-symbol');

    expect(btnNeg.getAttribute('aria-pressed')).toBe('true');
    expect(symbol.textContent).toBe('-$');
  });
});
