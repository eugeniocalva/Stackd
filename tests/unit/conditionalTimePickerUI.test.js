import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Conditional Time Picker UI', () => {
  beforeEach(() => {
    // Reset window and localStorage
    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    
    // Load dependencies in order
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    
    // Mock system time to 15:45:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T15:45:00'));

    global.window.Store.init();
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Checking Account' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not render time picker input field when enableTimeInput is OFF', () => {
    global.window.Store.dispatch('SET_ENABLE_TIME_INPUT', false);
    const state = global.window.Store.getState();
    const html = global.window.Views.AddTransactionView.render(state);

    expect(html).toContain('id="tx-date"');
    expect(html).not.toContain('id="tx-time"');
  });

  it('should render time picker input field after date picker when enableTimeInput is ON', () => {
    global.window.Store.dispatch('SET_ENABLE_TIME_INPUT', true);
    const state = global.window.Store.getState();
    const html = global.window.Views.AddTransactionView.render(state);

    expect(html).toContain('id="tx-date"');
    expect(html).toContain('id="tx-time"');

    // Verify time field appears after date field in HTML structure
    const dateIndex = html.indexOf('id="tx-date"');
    const timeIndex = html.indexOf('id="tx-time"');
    expect(timeIndex).toBeGreaterThan(dateIndex);
  });

  it('should pre-fill time picker with current system time (HH:mm) for new logs when enableTimeInput is ON', () => {
    global.window.Store.dispatch('SET_ENABLE_TIME_INPUT', true);
    const state = global.window.Store.getState();
    const html = global.window.Views.AddTransactionView.render(state);

    // Mock time is 15:45:00, so value should be "15:45"
    expect(html).toContain('id="tx-time" class="form-control" value="15:45"');
  });

  it('should pre-fill time picker with existing transaction time when editing an entry', () => {
    global.window.Store.dispatch('SET_ENABLE_TIME_INPUT', true);
    const account = global.window.Store.getState().accounts[0];

    global.window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense',
      amount: 25.00,
      accountId: account.id,
      date: '2026-07-31',
      time: '10:20:00'
    });

    const tx = global.window.Store.getState().transactions.find(t => t.amount === 25.00);
    global.window.Router = { getParams: () => ({ id: tx.id }) };

    const state = global.window.Store.getState();
    const html = global.window.Views.AddTransactionView.render(state);

    expect(html).toContain('value="10:20"');
    delete global.window.Router;
  });
});
