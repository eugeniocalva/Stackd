import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Manual Time Input Toggle', () => {
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
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    
    global.window.Store.init();
  });

  it('should default enableTimeInput state to false (OFF)', () => {
    const state = global.window.Store.getState();
    expect(state.enableTimeInput).toBe(false);
  });

  it('should update enableTimeInput state and persist on SET_ENABLE_TIME_INPUT dispatch', () => {
    global.window.Store.dispatch('SET_ENABLE_TIME_INPUT', true);
    let state = global.window.Store.getState();
    expect(state.enableTimeInput).toBe(true);

    global.window.Store.dispatch('SET_ENABLE_TIME_INPUT', false);
    state = global.window.Store.getState();
    expect(state.enableTimeInput).toBe(false);
  });

  it('should render toggle switch under Data Visualization in OthersView', () => {
    const state = global.window.Store.getState();
    const html = global.window.Views.OthersView.render(state);
    
    expect(html).toContain('Data Visualization');
    expect(html).toContain('Enable transaction time input');
    expect(html).toContain('id="toggle-enable-time-input"');
    expect(html).not.toContain('id="toggle-enable-time-input" checked');
  });

  it('should reflect checked state in OthersView when enableTimeInput is true', () => {
    global.window.Store.dispatch('SET_ENABLE_TIME_INPUT', true);
    const state = global.window.Store.getState();
    const html = global.window.Views.OthersView.render(state);
    
    expect(html).toContain('id="toggle-enable-time-input" checked');
  });

  it('should hide manual time input in AddTransactionView when toggle is OFF', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet' });
    const state = global.window.Store.getState();
    const html = global.window.Views.AddTransactionView.render(state);
    
    expect(html).not.toContain('id="tx-time"');
  });

  it('should show manual time input in AddTransactionView when toggle is ON', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Wallet' });
    global.window.Store.dispatch('SET_ENABLE_TIME_INPUT', true);
    const state = global.window.Store.getState();
    const html = global.window.Views.AddTransactionView.render(state);
    
    expect(html).toContain('id="tx-time"');
  });
});
