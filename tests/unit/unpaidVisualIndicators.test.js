import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Unpaid Visual Indicators Unit Tests', () => {
  beforeEach(() => {
    global.window = {
      crypto: {
        randomUUID: () => 'test-id-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      StackdDB: {
        load: (key, def) => def,
        save: vi.fn(),
        generateId: () => 'test-id-' + Math.random().toString(36).substr(2, 9)
      },
      StackdHydrateIcons: vi.fn()
    };
    global.localStorage = global.window.localStorage;
    global.document = {
      getElementById: vi.fn(),
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      body: {
        appendChild: vi.fn()
      }
    };

    executeFile('db.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');

    global.window.Store.init();
  });

  it('renders yellow swipe button (.is-unpaid) and vertical yellow bar (.unpaid-edge-bar) when isPaid === false', () => {
    const tx = { id: 'tx_unpaid_vis', accountId: 'acc_1', amount: 50, type: 'expense', date: '2026-08-01', isPaid: false };
    const html = global.window.Components.TransactionItem.render(tx, null, null, {
      allowSwipeReveal: true
    });

    expect(html).toContain('class="unpaid-edge-bar"');
    expect(html).toContain('swipe-action-btn paid is-unpaid');
    expect(html).not.toContain('paid-badge');
  });

  it('renders green paid badge (.paid-badge) and green swipe button (.is-paid) when isPaid === true', () => {
    const tx = { id: 'tx_paid_vis', accountId: 'acc_1', amount: 50, type: 'expense', date: '2026-08-01', isPaid: true };
    const html = global.window.Components.TransactionItem.render(tx, null, null, {
      allowSwipeReveal: true
    });

    expect(html).not.toContain('class="unpaid-edge-bar"');
    expect(html).toContain('swipe-action-btn paid is-paid');
    expect(html).toContain('class="paid-badge"');
  });
});
