import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('CategorySelectionModal', () => {
  beforeEach(() => {
    // Setup minimal DOM environment in global.window
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
        querySelector: vi.fn(function(selector) {
          if (!this._queriedElements) this._queriedElements = {};
          if (!this._queriedElements[selector]) {
            this._queriedElements[selector] = { id: selector.replace('#', ''), onclick: null, style: {} };
          }
          return this._queriedElements[selector];
        }),
        querySelectorAll: vi.fn(function(selector) {
          if (!this._queriedElements) this._queriedElements = {};
          if (!this._queriedElements[selector]) {
            this._queriedElements[selector] = [
              { dataset: { id: '' }, onclick: null },
              { dataset: { id: 'cat_groceries' }, onclick: null },
              { dataset: { id: 'cat_rent' }, onclick: null }
            ];
          }
          return this._queriedElements[selector];
        }),
        addEventListener: vi.fn(),
        onclick: null
      };
      return el;
    };

    const container = createElement('div');
    container.id = 'modal-container';

    global.window = {
      crypto: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9)
      },
      localStorage: {
        getItem: vi.fn(),
        setItem: vi.fn()
      },
      document: {
        getElementById: (id) => (id === 'modal-container' ? container : null),
        createElement: createElement
      },
      requestAnimationFrame: (cb) => cb(),
      StackdHydrateIcons: vi.fn(),
      Components: {}
    };
    global.localStorage = global.window.localStorage;
    global.requestAnimationFrame = global.window.requestAnimationFrame;
    global.document = global.window.document;

    executeFile('db.js');
    executeFile('store.js');
    executeFile('components.js');

    global.window.Store.init();
  });

  it('should define CategorySelectionModal component', () => {
    expect(global.window.Components.CategorySelectionModal).toBeDefined();
    expect(typeof global.window.Components.CategorySelectionModal.show).toBe('function');
  });

  it('should render CategorySelectionModal with No category selected and sorted list', () => {
    const onSelect = vi.fn();
    const onAddNewCategory = vi.fn();

    global.window.Components.CategorySelectionModal.show({
      selectedCategoryId: 'cat_groceries',
      typeHint: 'expense',
      onSelect,
      onAddNewCategory
    });

    const container = global.window.document.getElementById('modal-container');
    expect(container.children.length).toBe(1);

    const backdrop = container.children[0];
    expect(backdrop.id).toBe('category-selection-modal');
    expect(backdrop.innerHTML).toContain('No category selected');
    expect(backdrop.innerHTML).toContain('Select Category');
    expect(backdrop.innerHTML).toContain('csm-close');
    expect(backdrop.innerHTML).toContain('csm-add-new');
  });

  it('should trigger onAddNewCategory when + button is clicked', () => {
    const onSelect = vi.fn();
    const onAddNewCategory = vi.fn((cb) => cb({ id: 'new_cat_1', name: 'New Cat' }));

    global.window.Components.CategorySelectionModal.show({
      selectedCategoryId: '',
      typeHint: 'expense',
      onSelect,
      onAddNewCategory
    });

    const backdrop = global.window.document.getElementById('modal-container').children[0];
    const addNewBtn = backdrop.querySelector('#csm-add-new');
    expect(addNewBtn).toBeDefined();
    
    addNewBtn.onclick();
    expect(onAddNewCategory).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith({ id: 'new_cat_1', name: 'New Cat' });
  });

  it('should trigger onSelect when a category item is clicked', () => {
    const onSelect = vi.fn();

    global.window.Components.CategorySelectionModal.show({
      selectedCategoryId: '',
      typeHint: 'expense',
      onSelect
    });

    const backdrop = global.window.document.getElementById('modal-container').children[0];
    const items = backdrop.querySelectorAll('.category-select-item');
    expect(items.length).toBeGreaterThan(0);

    items[1].onclick();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'cat_groceries' }));
  });
});

