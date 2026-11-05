// 1.2.0 (UX-5) — Home widgets: long-press wiggle edit mode, press-and-drag
// reorder, the x badge with its confirm, tap outside to leave edit mode.
// docs/ux-review-1.2-plan.md B.2. The controller is DOM-only until release:
// one dispatch on drop, never one mid-gesture.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const makeLocalStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
};

let uuid = 0;
let calls;
let emits;

const boot = () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  uuid = 0;
  document.body.innerHTML = '<div id="app"><main id="router-view"><div id="outside-thing">x</div></main><div id="modal-container"></div></div>';
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} })
  };
  global.localStorage = global.window.localStorage;
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  global.window.StackdHydrateIcons = () => {};
  const S = global.window.Store;
  S.init();
  ['latest', 'latest', 'latest'].forEach(type => S.dispatch('ADD_HOME_WIDGET', { type, size: 'small' }));

  calls = [];
  emits = 0;
  const realDispatch = S.dispatch.bind(S);
  S.dispatch = (action, payload) => { calls.push([action, payload]); return realDispatch(action, payload); };
  const realEmit = S.emit.bind(S);
  S.emit = (...args) => { emits++; return realEmit(...args); };
};

afterEach(() => {
  vi.useRealTimers();
});

const Store = () => global.window.Store;
const W = () => global.window.Widgets;
const rv = () => document.getElementById('router-view');
const ids = () => Store().getState().homeWidgets.map(w => w.id);
const domIds = () => [...document.querySelectorAll('#widgets-grid .widget-card')].map(c => c.dataset.widgetId);
const cards = () => [...document.querySelectorAll('#widgets-grid .widget-card')];
const ghost = () => document.querySelector('.widget-drag-ghost');

// One render pass, like main.js: innerHTML of the section, then attach.
const mount = () => {
  const state = Store().getState();
  const outside = '<div id="outside-thing">x</div>';
  rv().innerHTML = outside + W().renderSection(state);
  W().attachSection(rv(), state);
};

const mouse = (type, target, x = 100, y = 300) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
const press = (card, x, y) => mouse('mousedown', card.querySelector('.widget-card-body') || card, x, y);
const moveTo = (x, y) => mouse('mousemove', document, x, y);
const release = () => mouse('mouseup', document);

describe('Widgets._dropIndexFor (pure hit test)', () => {
  beforeEach(boot);

  // Grid of 2 columns, 100px cards, 10px gaps:
  //   row 0: S0 S1 | row 1: L2 (spans) | row 2: S3 S4
  const S = (left, top) => ({ left, top, width: 100, height: 100, large: false });
  const L = (top) => ({ left: 0, top, width: 210, height: 100, large: true });
  const layout = [S(0, 0), S(110, 0), L(110), S(0, 220), S(110, 220)];
  const drop = (x, y, from) => W()._dropIndexFor(layout, x, y, from);

  it('stays put over its own slot', () => {
    expect(drop(50, 50, 0)).toBe(0);
    expect(drop(160, 270, 4)).toBe(4);
  });

  it('swaps with its row partner past the partner centre (x axis)', () => {
    expect(drop(190, 50, 0)).toBe(1);   // S0 to the right of S1
    expect(drop(20, 50, 1)).toBe(0);    // S1 to the left of S0
    expect(drop(140, 50, 0)).toBe(0);   // not yet past S1's centre
  });

  it('a large card spans the row: the y axis decides', () => {
    expect(drop(200, 130, 0)).toBe(1);  // upper half of L2 → before it
    expect(drop(200, 200, 0)).toBe(2);  // lower half of L2 → after it
    expect(drop(10, 200, 4)).toBe(3);   // S4 up over L2's lower half → right after it
    expect(drop(10, 120, 4)).toBe(2);   // ... upper half → before it
  });

  it('moves a large card between rows of small ones', () => {
    expect(drop(50, 10, 2)).toBe(0);    // over S0's top half → first
    expect(drop(90, 290, 2)).toBe(3);   // over S3's right half → after S3 (same row: x)
    expect(drop(30, 290, 2)).toBe(2);   // ... left half → before it
  });

  it('a small card dropped across rows uses the y axis', () => {
    expect(drop(50, 205, 0)).toBe(2);   // inside L2, below its centre → after it
    expect(drop(50, 214, 0)).toBe(2);   // the gap under L2: nearest S3, above its centre → before it
  });

  it('is safe for degenerate input', () => {
    expect(W()._dropIndexFor([], 0, 0, 0)).toBe(0);
    expect(W()._dropIndexFor([S(0, 0)], 0, 0, 0)).toBe(0);
    expect(W()._dropIndexFor(null, 0, 0, 2)).toBe(2);
  });
});

describe('edit chrome (1.2.0)', () => {
  beforeEach(boot);

  it('the remove control is an x badge; arrows stay for keyboards; a drag hint is spoken', () => {
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    const html = W().renderSection(Store().getState());
    expect(html).toMatch(/class="widget-remove-btn" data-widget-action="remove"[^>]*>\s*<i data-lucide="x"/);
    expect(html).not.toContain('data-lucide="minus"');
    expect(html.match(/class="widget-chrome-btn widget-move-btn" data-widget-action="move-up"/g)).toHaveLength(3);
    expect(html).toContain('<span class="visually-hidden">Touch and hold a widget, then drag it to move it.</span>');
  });
});

describe('drag in edit mode', () => {
  beforeEach(() => {
    boot();
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    mount();
    calls = [];
    emits = 0;
  });

  it('lifts after the short hold, reorders the DOM only, dispatches once on release', () => {
    const before = ids();
    W()._dropIndexFor = () => 2; // the geometry is covered above; jsdom has no layout
    const card = cards()[0];
    press(card);
    vi.advanceTimersByTime(160);
    expect(ghost()).not.toBeNull();
    expect(ghost().parentNode.id).toBe('app');
    expect(ghost().hasAttribute('data-widget-id')).toBe(false);
    expect(ghost().querySelector('[data-widget-action]')).toBeNull();
    expect(card.classList.contains('is-dragging')).toBe(true);

    moveTo(150, 320);
    moveTo(180, 340);
    expect(domIds()).toEqual([before[1], before[2], before[0]]);
    expect(ghost().style.translate).toBe('80px 40px');
    expect(calls).toEqual([]); // nothing until the finger lifts
    expect(ids()).toEqual(before);

    release();
    expect(ghost()).toBeNull();
    expect(card.classList.contains('is-dragging')).toBe(false);
    expect(calls).toEqual([['REORDER_HOME_WIDGETS', { orderedIds: [before[1], before[2], before[0]] }]]);
    expect(ids()).toEqual([before[1], before[2], before[0]]);
  });

  it('a release without a move changes nothing and dispatches nothing', () => {
    press(cards()[1]);
    vi.advanceTimersByTime(200);
    expect(ghost()).not.toBeNull();
    release();
    expect(ghost()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('a move before the hold is a scroll: no lift, no dispatch', () => {
    W()._dropIndexFor = () => 2;
    const before = domIds();
    press(cards()[0], 100, 300);
    moveTo(100, 330); // 30px vertical: the page scrolls
    vi.advanceTimersByTime(500);
    expect(ghost()).toBeNull();
    moveTo(200, 400);
    release();
    expect(domIds()).toEqual(before);
    expect(calls).toEqual([]);
    // ...while the same press held still lifts the card
    press(cards()[0], 100, 300);
    vi.advanceTimersByTime(160);
    expect(ghost()).not.toBeNull();
    release();
  });

  it('presses on chrome buttons are taps, never drags', () => {
    press(cards()[0].querySelector('[data-widget-action="remove"]'));
    vi.advanceTimersByTime(500);
    expect(ghost()).toBeNull();
    release();
    press(cards()[0]); // the card body is
    vi.advanceTimersByTime(160);
    expect(ghost()).not.toBeNull();
    release();
  });

  it('Escape cancels: the DOM is redrawn from the state, nothing is dispatched', () => {
    W()._dropIndexFor = () => 2;
    const before = ids();
    press(cards()[0]);
    vi.advanceTimersByTime(160);
    moveTo(150, 320);
    expect(ghost()).not.toBeNull();
    expect(emits).toBe(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ghost()).toBeNull();
    expect(emits).toBeGreaterThan(0);
    release();
    expect(calls).toEqual([]);
    expect(ids()).toEqual(before);
  });

  it('a re-render mid-gesture ends it: no ghost left, no stray dispatch', () => {
    W()._dropIndexFor = () => 2;
    press(cards()[0]);
    vi.advanceTimersByTime(160);
    moveTo(150, 320);
    expect(ghost()).not.toBeNull();
    mount(); // any dispatch while Home is open re-renders the section
    expect(ghost()).toBeNull();
    moveTo(200, 340);
    release();
    expect(calls).toEqual([]);
  });

  it('leaving Home (DashboardView.destroy → destroyCharts) removes the ghost', () => {
    press(cards()[0]);
    vi.advanceTimersByTime(160);
    expect(ghost()).not.toBeNull();
    W().destroyCharts();
    expect(ghost()).toBeNull();
    release();
    expect(calls).toEqual([]);
  });

  it('touch: a drag cancels the page scroll and suppresses the click', () => {
    W()._dropIndexFor = () => 1;
    const before = ids();
    const card = cards()[0];
    const body = card.querySelector('.widget-card-body');
    const touch = (type, x, y) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      const t = [{ clientX: x, clientY: y }];
      ev.touches = type === 'touchend' ? [] : t;
      ev.changedTouches = t;
      body.dispatchEvent(ev);
      return ev;
    };
    touch('touchstart', 100, 300);
    vi.advanceTimersByTime(160);
    const mv = touch('touchmove', 140, 300);
    expect(mv.defaultPrevented).toBe(true);
    const end = touch('touchend', 140, 300);
    expect(end.defaultPrevented).toBe(true);
    expect(calls).toEqual([['REORDER_HOME_WIDGETS', { orderedIds: [before[1], before[0], before[2]] }]]);
  });
});

describe('long press outside edit mode', () => {
  beforeEach(() => {
    boot();
    mount();
    calls = [];
  });

  it('a short tap is just a tap', () => {
    expect(typeof W()._sectionTeardown).toBe('function'); // the controller is live
    press(cards()[0]);
    vi.advanceTimersByTime(100);
    release();
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('#widgets-grid').classList.contains('is-editing')).toBe(false);
    expect(calls).toEqual([]);
  });

  it('builds the edit chrome in place (no dispatch), then enters edit mode on release', () => {
    press(cards()[1]);
    vi.advanceTimersByTime(300);
    expect(document.querySelector('[data-widget-action]')).toBeNull();
    vi.advanceTimersByTime(200); // 450ms hold
    const grid = document.querySelector('#widgets-grid');
    expect(grid.classList.contains('is-editing')).toBe(true);
    expect(cards().every(c => c.classList.contains('is-editing'))).toBe(true);
    expect(document.querySelectorAll('#widgets-grid [data-widget-action="remove"]')).toHaveLength(3);
    expect(document.querySelectorAll('#widgets-grid [data-widget-action="move-up"][disabled]')).toHaveLength(1);
    expect(ghost()).not.toBeNull();
    expect(calls).toEqual([]);
    expect(Store().getState().widgetEditMode).toBe(false);

    release();
    expect(calls).toEqual([['TOGGLE_WIDGET_EDIT_MODE', true]]);
    expect(Store().getState().widgetEditMode).toBe(true);
  });

  it('the same gesture continues as a drag: reorder first, then edit mode', () => {
    W()._dropIndexFor = () => 0;
    const before = ids();
    press(cards()[2]);
    vi.advanceTimersByTime(460);
    moveTo(20, 280);
    expect(calls).toEqual([]);
    release();
    expect(calls).toEqual([
      ['REORDER_HOME_WIDGETS', { orderedIds: [before[2], before[0], before[1]] }],
      ['TOGGLE_WIDGET_EDIT_MODE', true]
    ]);
  });
});

describe('leaving edit mode by tapping outside', () => {
  beforeEach(() => {
    boot();
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    calls = [];
  });

  // 1.2.0 review: a tap (click) leaves edit mode; a bare pointerdown — the
  // start of a scroll — does not.  The helper keeps its old name.
  const pointerdown = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  it('a press outside the widget section leaves edit mode; inside it does not', () => {
    mount();
    pointerdown(document.querySelector('#widgets-grid .widget-card'));
    expect(calls).toEqual([]);
    // Done is inside the section: only its own handler toggles, once.
    pointerdown(document.querySelector('#btn-widgets-edit'));
    expect(calls.filter(c => c[0] === 'TOGGLE_WIDGET_EDIT_MODE').length).toBeLessThanOrEqual(1);
    calls = [];
    mount();
    if (!Store().getState().widgetEditMode) Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    mount();
    calls = [];
    pointerdown(document.getElementById('outside-thing'));
    expect(calls).toEqual([['TOGGLE_WIDGET_EDIT_MODE', false]]);
  });

  it('a scroll that starts outside keeps edit mode, and the tapped control does not fire', () => {
    mount();
    const out = document.getElementById('outside-thing');
    out.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(calls).toEqual([]);
    let fired = 0;
    out.addEventListener('click', () => { fired++; });
    pointerdown(out);
    expect(calls).toEqual([['TOGGLE_WIDGET_EDIT_MODE', false]]);
    expect(fired).toBe(0);
  });

  it('the listener on the persistent root never piles up across re-renders', () => {
    mount();
    mount();
    mount();
    pointerdown(document.getElementById('outside-thing'));
    expect(calls).toEqual([['TOGGLE_WIDGET_EDIT_MODE', false]]);
    // and once edit mode is off, the next render registers none
    calls = [];
    mount();
    pointerdown(document.getElementById('outside-thing'));
    expect(calls).toEqual([]);
  });

  it('sheets (the modal container) do not count as outside', () => {
    mount();
    const mc = document.getElementById('modal-container');
    rv().appendChild(mc); // even if it were inside the root
    pointerdown(mc);
    expect(calls).toEqual([]);
    pointerdown(document.getElementById('outside-thing'));
    expect(calls).toEqual([['TOGGLE_WIDGET_EDIT_MODE', false]]);
  });
});

describe('the x badge asks first', () => {
  beforeEach(() => {
    boot();
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    mount();
    calls = [];
  });

  it('opens a "Remove widget?" sheet; only Remove removes', () => {
    const id = ids()[0];
    cards()[0].querySelector('[data-widget-action="remove"]').click();
    expect(calls).toEqual([]);
    expect(document.getElementById('modal-title').textContent).toBe('Remove widget?');
    expect(document.getElementById('modal-delete-btn').textContent).toBe('Remove');
    expect(document.getElementById('modal-save-btn').textContent).toBe('Cancel');

    document.getElementById('modal-delete-btn').click();
    expect(calls).toEqual([['REMOVE_HOME_WIDGET', { id }]]);
    expect(ids()).not.toContain(id);
  });

  it('Cancel keeps the widget', () => {
    const before = ids();
    cards()[1].querySelector('[data-widget-action="remove"]').click();
    document.getElementById('modal-save-btn').click();
    expect(calls).toEqual([]);
    expect(ids()).toEqual(before);
  });

  it('the keyboard arrows still reorder (visually hidden until focused)', () => {
    const before = ids();
    expect(cards()[0].querySelector('[data-widget-action="move-down"]').classList.contains('widget-move-btn')).toBe(true);
    cards()[0].querySelector('[data-widget-action="move-down"]').click();
    expect(ids()).toEqual([before[1], before[0], before[2]]);
  });
});
