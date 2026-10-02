import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.1 (BUG-23): the "Repeats Every" picker squeezed its title to one word
// per line (.btn is width:100%, so both header buttons ate the row), and the
// absolutely positioned highlight band painted over the wheel columns at 60%
// opacity, greying out the selected row.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('FrequencyPicker layout (BUG-23)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    document.body.innerHTML = '<div id="modal-container"></div>';
    global.window.localStorage = { getItem: vi.fn(), setItem: vi.fn() };
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('components.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('header buttons size to their content and the title takes the rest', () => {
    window.Components.FrequencyPicker.show({ onSelect: vi.fn() });
    ['fp-cancel', 'fp-confirm'].forEach(id => {
      const btn = document.getElementById(id);
      expect(btn.style.width, id).toBe('auto');
      expect(btn.style.flexShrink, id).toBe('0');
    });
    const title = document.getElementById('fp-title');
    expect(title.style.flex.startsWith('1')).toBe(true);
    expect(title.style.minWidth).toBe('0px');
    expect(title.style.textAlign).toBe('center');
    expect(title.style.whiteSpace).not.toBe('nowrap');
    expect(title.parentElement.style.gap).toBe('var(--space-3)');
  });

  it('wheel columns sit above the highlight band, with a fade mask', () => {
    window.Components.FrequencyPicker.show({ onSelect: vi.fn() });
    const styleText = document.querySelector('#active-freq-picker style').textContent;
    const m = styleText.match(/#fp-col-interval,\s*#fp-col-freq\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/position:\s*relative/);
    expect(m[1]).toMatch(/z-index:\s*1/);
    expect(m[1]).toMatch(/-webkit-mask-image:\s*linear-gradient/);
    expect(m[1]).toMatch(/[^-]mask-image:\s*linear-gradient/);
  });

  it('Cancel is the Android Back dismiss target and closes the picker', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
    const onSelect = vi.fn();
    window.Components.FrequencyPicker.show({ onSelect });
    const cancel = document.getElementById('fp-cancel');
    expect(cancel.hasAttribute('data-back-dismiss')).toBe(true);
    cancel.click();
    vi.advanceTimersByTime(300);
    expect(document.getElementById('active-freq-picker')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Done reports the wheel selection (jsdom scrollTop is 0 → 1 day)', () => {
    const onSelect = vi.fn();
    window.Components.FrequencyPicker.show({ onSelect });
    document.getElementById('fp-confirm').click();
    expect(onSelect).toHaveBeenCalledWith({ interval: 1, frequency: 'days' });
  });
});
