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
    executeFile('i18n.js');
    executeFile('i18n/en.js');
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

  // 1.2.0 (UX-10): the attachment metas survive the round trip (their files
  // are already stored; the draft only carries the list the form holds).
  it('restores the draft attachments into the Attachments card', () => {
    global.window.Store.dispatch('ADD_ACCOUNT', { id: 'acc_1', name: 'Checking', type: 'checking', balance: 1000 });
    const state = global.window.Store.getState();
    const metas = [
      { id: 'att_1', kind: 'image', name: 'Receipt.jpg', ext: 'jpg', mime: 'image/jpeg', size: 10, addedAt: '' },
      { id: 'att_2', kind: 'pdf', name: 'Bill.pdf', ext: 'pdf', mime: 'application/pdf', size: 20, addedAt: '' }
    ];
    global.window._draftTxFormState = { type: 'expense', amount: '5', account: 'acc_1', date: '2026-07-25', note: '', tags: [], attachments: metas };

    const html = global.window.Views.AddTransactionView.render(state);

    expect(html).toContain('data-attachment="att_1"');
    expect(html).toContain('data-attachment="att_2"');
    expect(html).toContain('Receipt.jpg');
    expect(html).toContain('2 attachments');
    expect(html).toContain('id="tx-attachments-data" value="' + global.window.I18n.esc(JSON.stringify(metas)) + '"');
    expect(global.window._draftTxFormState).toBeUndefined();
  });
});
