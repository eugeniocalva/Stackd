// 1.2.0 (UX-8): the amount caret drifted below the digits on iOS because the
// KeyboardManager smooth-scrolled the focused field (WebKit leaves the caret
// behind on a smooth programmatic scroll) and re-scrolled on every
// visualViewport event while the keyboard slid up.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.resolve(__dirname, '../../src/utils/keyboard.js'), 'utf8');

const listeners = {};
const fakeVV = () => ({
  height: 800,
  offsetTop: 0,
  addEventListener: (t, fn) => { listeners[t] = fn; }
});

describe('KeyboardManager keeps the caret on the text (1.2.0 UX-8)', () => {
  let KM;
  let input;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.keys(listeners).forEach(k => delete listeners[k]);
    document.body.innerHTML = '<div id="app"><input id="tx-amount" type="text" value="12.5"></div>';
    window.visualViewport = fakeVV();
    window.requestAnimationFrame = (fn) => setTimeout(fn, 16);
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    new Function(SRC)();
    KM = window.KeyboardManager;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    KM.init();
    input = document.getElementById('tx-amount');
    input.scrollIntoView = vi.fn();
    input.setSelectionRange = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.visualViewport;
  });

  const placeAt = (top, bottom) => {
    input.getBoundingClientRect = () => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top });
  };

  it('a field already visible above the keyboard is never scrolled, but its caret is redrawn', () => {
    placeAt(150, 192);
    input.focus();
    vi.advanceTimersByTime(400);
    expect(input.scrollIntoView).not.toHaveBeenCalled();
    expect(input.setSelectionRange).toHaveBeenCalled();
  });

  it('a hidden field is scrolled instantly, never smoothly', () => {
    placeAt(700, 742); // under a keyboard that leaves 400px
    window.visualViewport.height = 400;
    input.focus();
    vi.advanceTimersByTime(400);
    expect(input.scrollIntoView).toHaveBeenCalled();
    input.scrollIntoView.mock.calls.forEach(([arg]) => {
      expect(arg && arg.behavior).not.toBe('smooth');
    });
  });

  it('visualViewport scroll events never trigger a scroll of our own', () => {
    placeAt(700, 742);
    input.focus();
    vi.advanceTimersByTime(400);
    input.scrollIntoView.mockClear();
    window.visualViewport.height = 400;
    for (let i = 0; i < 10; i++) listeners.scroll();
    vi.advanceTimersByTime(500);
    expect(input.scrollIntoView).not.toHaveBeenCalled();
    expect(document.body.classList.contains('keyboard-active')).toBe(true);
  });

  it('the keyboard animation (many resize events) leads to one settled scroll', () => {
    placeAt(700, 742);
    input.focus();
    vi.advanceTimersByTime(400);
    input.scrollIntoView.mockClear();
    window.visualViewport.height = 400;
    for (let i = 0; i < 10; i++) { listeners.resize(); vi.advanceTimersByTime(16); }
    vi.advanceTimersByTime(300);
    expect(input.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('nothing scrolls for a field that lost focus in the meantime', () => {
    placeAt(700, 742);
    input.focus();
    input.blur();
    vi.advanceTimersByTime(400);
    expect(input.scrollIntoView).not.toHaveBeenCalled();
  });
});
