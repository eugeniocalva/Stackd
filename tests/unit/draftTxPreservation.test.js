import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Draft Transaction State Preservation', () => {
  beforeEach(() => {
    const createElement = (tagName) => {
      const el = {
        tagName: tagName.toUpperCase(),
        id: '',
        className: '',
        style: {},
        attributes: {},
        children: [],
        innerHTML: '',
        innerText: '',
        value: '',
        dataset: {},
        classList: {
          add: vi.fn(function(cls) { this.className = this.className ? `${this.className} ${cls}` : cls; }),
          remove: vi.fn(function(cls) { this.className = this.className.replace(cls, '').trim(); }),
          contains: function(cls) { return this.className.includes(cls); }
        },
        setAttribute: vi.fn(function(attr, val) { this.attributes[attr] = val; }),
        getAttribute: vi.fn(function(attr) { return this.attributes[attr] || null; }),
        appendChild: vi.fn(function(child) { this.children.push(child); return child; }),
        remove: vi.fn(),
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        addEventListener: vi.fn(),
        onclick: null
      };
      return el;
    };

    const container = createElement('div');
    container.id = 'router-view';

    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn()
      },
      document: {
        getElementById: (id) => (id === 'router-view' ? container : null),
        createElement: createElement
      },
      requestAnimationFrame: (cb) => cb(),
      StackdHydrateIcons: vi.fn(),
      Components: {},
      Views: {},
      Router: { getParams: () => ({}) }
    };
    global.localStorage = global.window.localStorage;
    global.requestAnimationFrame = global.window.requestAnimationFrame;
    global.document = global.window.document;

    executeFile('db.js');
    executeFile('store.js');
    executeFile('views.js');

    global.window.Store.init();
  });

  it('should capture draft form state and restore it in AddTransactionView render', () => {
    // Setup state with an account
    global.window.Store.dispatch('ADD_ACCOUNT', { id: 'acc_1', name: 'Checking', type: 'checking', balance: 1000 });
    const state = global.window.Store.getState();

    // Set draft transaction state simulating captured inputs
    global.window._draftTxFormState = {
      type: 'expense',
      amount: '88.50',
      account: 'acc_1',
      date: '2026-07-25',
      note: 'Grocery haul',
      tags: ['supermarket', 'food'],
      category: '',
      isRecurrent: false
    };
    global.window._pendingCategorySelection = 'cat_new_supermarket';

    const html = global.window.Views.AddTransactionView.render(state);

    expect(html).toContain('value="88.50"');
    expect(html).toContain('Grocery haul');
    expect(html).toContain('#supermarket');
    expect(html).toContain('#food');
    expect(html).toContain('data-initial="cat_new_supermarket"');
    expect(global.window._draftTxFormState).toBeUndefined();
    expect(global.window._pendingCategorySelection).toBeUndefined();
  });
});
