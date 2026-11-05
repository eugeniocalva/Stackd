// 1.2.0 (UX-8) — Components.AmountCaret: the amount fields draw their own
// caret. iOS WebKit left the system caret behind when the form scrolled with
// the field focused (it hung below the digits, seen on the owner's iPhone),
// so the system caret is hidden and a bar is drawn in an invisible copy of
// the text laid over the input, split at the selection.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let seq = 0;
const boot = () => {
  document.body.innerHTML = '<div id="app"><main id="router-view"></main><div id="modal-container"></div></div>';
  const map = new Map([['stackd_v1_homeWidgets', '[]']]);
  global.window = {
    crypto: { randomUUID: () => `uuid-${++seq}` },
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k)
    },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Router: { getParams: () => ({}), navigate: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
};

const C = () => global.window.Components;
const mountField = (value = '') => {
  const group = document.createElement('div');
  group.className = 'amount-input-group';
  group.innerHTML = '<span class="currency-symbol">$</span><input type="text" id="tx-amount" class="amount-input text-expense">';
  document.getElementById('router-view').appendChild(group);
  const input = group.querySelector('input');
  input.value = value;
  return { group, input };
};
const overlayOf = (group) => group.querySelector('.amount-caret-overlay');
const textAround = (group) => {
  const line = group.querySelector('.amount-caret-line');
  return [line.firstChild.nodeValue, line.lastChild.nodeValue];
};

describe('Components.AmountCaret (1.2.0 UX-8)', () => {
  beforeEach(() => boot());

  it('hides the system caret and adds one invisible overlay inside the group', () => {
    const { group, input } = mountField('12');
    C().AmountCaret.attach(input);
    expect(input.classList.contains('amount-input--own-caret')).toBe(true);
    expect(group.querySelectorAll('.amount-caret-overlay')).toHaveLength(1);
    expect(overlayOf(group).getAttribute('aria-hidden')).toBe('true');
    // inside the group: the group's next sibling (the field error slot) is untouched
    expect(group.lastElementChild).toBe(overlayOf(group));
  });

  it('attaching twice is a no-op', () => {
    const { group, input } = mountField('12');
    C().AmountCaret.attach(input);
    C().AmountCaret.attach(input);
    expect(group.querySelectorAll('.amount-caret-overlay')).toHaveLength(1);
  });

  it('shows the bar only while the field has focus', () => {
    const { group, input } = mountField('12');
    C().AmountCaret.attach(input);
    expect(overlayOf(group).classList.contains('is-active')).toBe(false);
    input.focus();
    expect(overlayOf(group).classList.contains('is-active')).toBe(true);
    input.blur();
    expect(overlayOf(group).classList.contains('is-active')).toBe(false);
  });

  it('splits the copy at the cursor, so the bar sits where the cursor is', () => {
    const { group, input } = mountField('1234.56');
    C().AmountCaret.attach(input);
    input.focus();
    input.setSelectionRange(7, 7);
    input.dispatchEvent(new Event('keyup'));
    expect(textAround(group)).toEqual(['1234.56', '']);
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new Event('keyup'));
    expect(textAround(group)).toEqual(['12', '34.56']);
  });

  it('follows typing', () => {
    const { group, input } = mountField('');
    C().AmountCaret.attach(input);
    input.focus();
    input.value = '9.5';
    input.setSelectionRange(3, 3);
    input.dispatchEvent(new Event('input'));
    expect(textAround(group)).toEqual(['9.5', '']);
  });

  it('a selected range hides the bar (the system highlight shows)', () => {
    const { group, input } = mountField('1234');
    C().AmountCaret.attach(input);
    input.focus();
    input.setSelectionRange(0, 4);
    input.dispatchEvent(new Event('select'));
    expect(group.querySelector('.amount-caret').style.visibility).toBe('hidden');
    input.setSelectionRange(4, 4);
    input.dispatchEvent(new Event('keyup'));
    expect(group.querySelector('.amount-caret').style.visibility).toBe('visible');
  });

  it('the type buttons rewriting className do not bring the system caret back', () => {
    const { input } = mountField('5');
    C().AmountCaret.attach(input);
    input.className = 'amount-input text-income';
    input.focus();
    expect(input.classList.contains('amount-input--own-caret')).toBe(true);
  });

  it('the value only ever reaches the copy as text', () => {
    const { group, input } = mountField('<img src=x onerror=alert(1)>');
    C().AmountCaret.attach(input);
    input.focus();
    input.dispatchEvent(new Event('input'));
    expect(group.querySelector('img')).toBeNull();
  });

  it('a re-rendered form drops the old field\'s document listener', () => {
    const { group, input } = mountField('1');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    C().AmountCaret.attach(input);
    group.remove();
    document.dispatchEvent(new Event('selectionchange'));
    expect(removeSpy).toHaveBeenCalledWith('selectionchange', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('the transaction form and the loan simulator attach it', () => {
    const src = readFileSync(resolve(__dirname, '../../src/views.js'), 'utf8');
    expect(src).toMatch(/AmountCaret\.attach\(amountInput\)/);
    expect(src).toMatch(/AmountCaret\.attach\(\$\('dsim-principal'\)\)/);
  });

  it('the CSS hides the system caret only where ours is drawn', () => {
    const css = readFileSync(resolve(__dirname, '../../src/styles/components.css'), 'utf8');
    expect(css).toMatch(/\.amount-input\.amount-input--own-caret\s*\{\s*caret-color:\s*transparent;/);
    expect(css).toMatch(/\.amount-input-group\s*\{\s*position:\s*relative;/);
  });
});
