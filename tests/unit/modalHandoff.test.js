import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Components.Modal.hide() animates out and then blanks #modal-container on a
// 300ms timer. When one flow hands off to another (e.g. the debt "Add to My
// Loans" naming modal closing, then the "Track this payment?" offer opening),
// the stale timer used to wipe the NEW modal out of the DOM. See
// docs/debt-rebuild-plan.md §8 Phase 4.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

describe('Modal handoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="modal-container"></div>';
    global.window.localStorage = { getItem: vi.fn(), setItem: vi.fn() };
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('components.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const titleNow = () => {
    const el = document.getElementById('modal-title');
    return el ? el.textContent : null;
  };

  it('keeps a modal opened during the previous one\'s exit animation', () => {
    window.Components.Modal.show({ title: 'Add to My Loans', content: '<p>a</p>' });
    expect(titleNow()).toBe('Add to My Loans');

    window.Components.Modal.hide();          // schedules the container wipe at +300ms
    vi.advanceTimersByTime(60);
    window.Components.Modal.show({ title: 'Track this payment?', content: '<p>b</p>' });
    expect(titleNow()).toBe('Track this payment?');

    // the stale timer fires — it must not take the new modal with it
    vi.advanceTimersByTime(300);
    expect(titleNow()).toBe('Track this payment?');
    expect(document.getElementById('active-modal')).not.toBeNull();

    // and the new modal still tears itself down normally
    window.Components.Modal.hide();
    vi.advanceTimersByTime(300);
    expect(document.getElementById('active-modal')).toBeNull();
    expect(document.getElementById('modal-container').innerHTML).toBe('');
  });

  it('still clears the container for an ordinary single close', () => {
    window.Components.Modal.show({ title: 'Solo', content: '<p>x</p>' });
    window.Components.Modal.hide();
    expect(document.getElementById('modal-container').innerHTML).not.toBe('');
    vi.advanceTimersByTime(300);
    expect(document.getElementById('modal-container').innerHTML).toBe('');
  });
});
