import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mock DOM environment helpers
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Opening Balance Numeric Input & Decimal Shift', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app"></div>
    `;

    // Global setup
    global.window = {
      Store: {
        // v0.89 P8d: EditAccountView renders its Type dropdown from these.
        ACCOUNT_TYPES: ['Bank', 'Debit card', 'Cash', 'Savings', 'Credit card', 'Investment', 'Wallet', 'Account'],
        accountTypeLabel: (v) => v || 'Account',
        getState: () => ({
          accounts: [],
          transactions: [],
          currency: 'USD',
          defaultAccountId: ''
        }),
        getCurrencySymbol: () => '$',
        _isPositiveTx: () => true
      },
      Router: {
        getParams: () => ({})
      },
      StackdHydrateIcons: vi.fn(),
      Views: {}
    };

    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('views.js');
  });

  it('renders opening balance input with type="text" and inputmode="numeric"', () => {
    const html = window.Views.EditAccountView.render(window.Store.getState());
    document.getElementById('app').innerHTML = html;

    const obInput = document.getElementById('edit-acc-balance');
    expect(obInput).not.toBeNull();
    expect(obInput.getAttribute('type')).toBe('text');
    expect(obInput.getAttribute('inputmode')).toBe('numeric');
    expect(obInput.value).toBe('0.00');
  });

  it('shifts digits right-to-left (e.g. typing 5-0-0 yields 5.00)', () => {
    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    window.Views.EditAccountView.attachEvents(container, window.Store.getState());

    const obInput = document.getElementById('edit-acc-balance');

    // Type '5' -> 0.05
    obInput.value = '0.005';
    obInput.dispatchEvent(new Event('input'));
    expect(obInput.value).toBe('0.05');

    // Type '0' -> 0.50
    obInput.value = '0.050';
    obInput.dispatchEvent(new Event('input'));
    expect(obInput.value).toBe('0.50');

    // Type '0' -> 5.00
    obInput.value = '0.500';
    obInput.dispatchEvent(new Event('input'));
    expect(obInput.value).toBe('5.00');
  });

  it('handles backspace digit deletion correctly', () => {
    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    window.Views.EditAccountView.attachEvents(container, window.Store.getState());

    const obInput = document.getElementById('edit-acc-balance');

    // Start at 5.00
    obInput.value = '0.500';
    obInput.dispatchEvent(new Event('input'));
    expect(obInput.value).toBe('5.00');

    // Backspace: input value becomes '5.0' -> 0.50
    obInput.value = '5.0';
    obInput.dispatchEvent(new Event('input'));
    expect(obInput.value).toBe('0.50');

    // Backspace: input value becomes '0.5' -> 0.05
    obInput.value = '0.5';
    obInput.dispatchEvent(new Event('input'));
    expect(obInput.value).toBe('0.05');

    // Backspace: input value becomes '0.0' -> 0.00
    obInput.value = '0.0';
    obInput.dispatchEvent(new Event('input'));
    expect(obInput.value).toBe('0.00');
  });

  it('blocks non-digit keypresses on keydown', () => {
    const container = document.getElementById('app');
    container.innerHTML = window.Views.EditAccountView.render(window.Store.getState());
    window.Views.EditAccountView.attachEvents(container, window.Store.getState());

    const obInput = document.getElementById('edit-acc-balance');

    const preventDefaultSpy = vi.fn();
    const event = new KeyboardEvent('keydown', { key: '.' });
    Object.defineProperty(event, 'preventDefault', { value: preventDefaultSpy });

    obInput.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
