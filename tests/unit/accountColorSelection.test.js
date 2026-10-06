import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Account Color Selection', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app"></div>
    `;

    global.window = {
      Store: {
        // v0.89 P8d: EditAccountView renders its Type dropdown from these.
        ACCOUNT_TYPES: ['Bank', 'Debit card', 'Cash', 'Savings', 'Credit card', 'Investment', 'Wallet', 'Account'],
        accountTypeLabel: (v) => v || 'Account',
        ACCOUNT_COLORS: ['#E60023', '#FF9500', '#FFD600', '#32D74B', '#0075EB'],
        getState: () => ({
          accounts: [
            { id: 'acc1', name: 'Checking', color: '#E60023', icon: 'wallet', type: 'Bank' }
          ],
          transactions: [],
          currency: 'USD',
          defaultAccountId: 'acc1'
        }),
        getCurrencySymbol: () => '$',
        getAccountBalance: () => 100,
        // 1.0.2 (BUG-30): new-mode saves look the name up (unguarded, as BUG-11's category call).
        findAccountByName: () => null,
        dispatch: vi.fn(),
        _isPositiveTx: () => true,
        // 1.0.2 (BUG-25/BUG-38): EditAccountView's opening-balance date default
        _todayYMD: () => '2026-07-01',
        // 1.0.3 (BUG-46/BUG-153/BUG-137): Opening Balance decimals, name keys
        // and the opening-date check (nothing newly left out here)
        currencyDigits: () => 2,
        _collapseName: (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim(),
        _nameKey: (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(),
        openingDateImpact: () => ({ count: 0, net: 0, earliest: null })
      },
      Router: {
        getParams: () => ({ id: 'acc1' }),
        navigate: vi.fn()
      },
      StackdHydrateIcons: vi.fn(),
      StackdDB: {
        generateId: () => 'acc_new_123'
      },
      Views: {}
    };

    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('views.js');
  });

  it('renders account color swatches in EditAccountView', () => {
    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    
    const swatches = container.querySelectorAll('.color-swatch-btn');
    expect(swatches.length).toBe(5);
    // First swatch should be active for acc1 (#E60023)
    expect(swatches[0].classList.contains('active')).toBe(true);
  });

  it('updates selected color when swatch is clicked and dispatches UPDATE_ACCOUNT', () => {
    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    window.Views.EditAccountView.attachEvents(container, window.Store.getState());

    const swatches = container.querySelectorAll('.color-swatch-btn');
    // Click 2nd swatch (#FF9500)
    swatches[1].click();

    expect(swatches[1].classList.contains('active')).toBe(true);
    expect(swatches[0].classList.contains('active')).toBe(false);

    // Click save
    const btnSave = document.getElementById('btn-edit-acc-save');
    btnSave.click();

    expect(window.Store.dispatch).toHaveBeenCalledWith('UPDATE_ACCOUNT', expect.objectContaining({
      id: 'acc1',
      color: '#FF9500'
    }));
  });

  it('dispatches ADD_ACCOUNT with selected color for new accounts', () => {
    global.window.Router.getParams = () => ({}); // new account

    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    window.Views.EditAccountView.attachEvents(container, window.Store.getState());

    const swatches = container.querySelectorAll('.color-swatch-btn');
    // Click 4th swatch (#32D74B)
    swatches[3].click();

    const nameInput = document.getElementById('edit-acc-name');
    nameInput.value = 'Savings Wallet';

    const btnSave = document.getElementById('btn-edit-acc-save');
    btnSave.click();

    expect(window.Store.dispatch).toHaveBeenCalledWith('ADD_ACCOUNT', expect.objectContaining({
      name: 'Savings Wallet',
      color: '#32D74B'
    }));
  });
});
