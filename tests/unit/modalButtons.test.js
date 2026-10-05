import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.1 (BUG-20): Components.Modal.show used to render a footer Cancel on
// every sheet, so delete confirmations (whose saveText already IS the safe
// action) and dismiss-only sheets ("Done", "OK") showed the safe action
// twice. New options: showCancel (default !showDelete), saveClass, deleteText;
// footer order is destructive first, safe action last (D4f).
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const footerButtons = () => {
  const content = document.querySelector('#active-modal .modal-content');
  return Array.from(content.lastElementChild.querySelectorAll('button'));
};
const precedes = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('Modal footer buttons (BUG-20)', () => {
  let mem;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    mem = {};
    document.body.innerHTML = '<div id="modal-container"></div><div id="router-view"></div>';
    global.window.localStorage = {
      getItem: vi.fn((k) => (k in mem ? mem[k] : null)),
      setItem: vi.fn((k, v) => { mem[k] = String(v); }),
      removeItem: vi.fn((k) => { delete mem[k]; })
    };
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('components.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('default sheet: primary save + footer Cancel, no delete', () => {
    window.Components.Modal.show({ title: 'T', content: '<p>x</p>', saveText: 'Save' });
    const save = document.getElementById('modal-save-btn');
    expect(save.className).toContain('btn-primary');
    expect(document.getElementById('modal-cancel-btn')).not.toBeNull();
    expect(document.getElementById('modal-delete-btn')).toBeNull();
    expect(footerButtons().map(b => b.id)).toEqual(['modal-save-btn', 'modal-cancel-btn']);
  });

  it('delete confirmation: delete first, secondary safe action last, no duplicate Cancel', () => {
    window.Components.Modal.show({ title: 'Delete?', content: '<p>x</p>', saveText: 'Keep', showDelete: true });
    const save = document.getElementById('modal-save-btn');
    const del = document.getElementById('modal-delete-btn');
    expect(document.getElementById('modal-cancel-btn')).toBeNull();
    expect(save.className).toContain('btn-secondary');
    expect(save.className).not.toContain('btn-primary');
    expect(precedes(del, save)).toBe(true);
    expect(footerButtons().map(b => b.id)).toEqual(['modal-delete-btn', 'modal-save-btn']);
    // generic label keeps its descriptive aria-label
    expect(del.textContent).toBe(window.I18n.t('common.delete'));
    expect(del.getAttribute('aria-label')).toBe(window.I18n.t('modal.deleteAria'));
  });

  it('showCancel:false on a dismiss-only sheet renders the save button only', () => {
    window.Components.Modal.show({ title: 'Pick', content: '<p>x</p>', saveText: 'Done', showCancel: false });
    expect(document.getElementById('modal-cancel-btn')).toBeNull();
    expect(footerButtons().map(b => b.id)).toEqual(['modal-save-btn']);
    expect(document.getElementById('modal-save-btn').className).toContain('btn-primary');
  });

  it('showDelete + showCancel:true keeps an explicit Cancel last', () => {
    window.Components.Modal.show({ title: 'T', content: '', saveText: 'Archive', showDelete: true, showCancel: true, saveClass: 'btn-primary' });
    expect(footerButtons().map(b => b.id)).toEqual(['modal-delete-btn', 'modal-save-btn', 'modal-cancel-btn']);
    expect(document.getElementById('modal-save-btn').className).toContain('btn-primary');
  });

  it('deleteText labels the destructive button and drops the generic aria-label', () => {
    window.Components.Modal.show({ title: 'T', content: '', saveText: 'Cancel', showDelete: true, deleteText: 'Delete 2 Transactions' });
    const del = document.getElementById('modal-delete-btn');
    expect(del.textContent).toBe('Delete 2 Transactions');
    expect(del.hasAttribute('aria-label')).toBe(false);
  });

  it('saveClass is applied to the save button', () => {
    window.Components.Modal.show({ title: 'T', content: '', saveText: 'Cancel', showCancel: false, saveClass: 'btn-secondary' });
    const save = document.getElementById('modal-save-btn');
    expect(save.className).toBe('btn btn-secondary');
  });

  it('wires save and delete clicks to their callbacks with a close function', () => {
    const onSave = vi.fn();
    const onDelete = vi.fn();
    window.Components.Modal.show({ title: 'T', content: '', saveText: 'Keep', showDelete: true, onSave, onDelete });
    document.getElementById('modal-save-btn').click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(typeof onSave.mock.calls[0][0]).toBe('function');
    document.getElementById('modal-delete-btn').click();
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(typeof onDelete.mock.calls[0][0]).toBe('function');
  });

  it('a showDelete sheet stays dismissable without a footer Cancel (backdrop tap)', () => {
    window.Components.Modal.show({ title: 'T', content: '', saveText: 'Keep', showDelete: true });
    const backdrop = document.getElementById('active-modal');
    backdrop.classList.add('open');
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(backdrop.classList.contains('open')).toBe(false);
  });
});

describe('Delete sheets in views pass deleteText up front (BUG-20)', () => {
  let mem;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    mem = { stackd_v1_homeWidgets: '[]' };
    document.body.innerHTML = '<div id="modal-container"></div><div id="router-view"></div>';
    global.window.localStorage = {
      getItem: vi.fn((k) => (k in mem ? mem[k] : null)),
      setItem: vi.fn((k, v) => { mem[k] = String(v); }),
      removeItem: vi.fn((k) => { delete mem[k]; })
    };
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('components.js');
    executeFile('views.js');
    window.Store.init();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('account delete: "Yes, Delete Everything" first, Cancel last, no duplicate', () => {
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Checking' });
    const acc = window.Store.getState().accounts[0];
    window.Router = { getParams: () => ({ id: acc.id }), navigate: vi.fn() };
    const view = window.Views.EditAccountView;
    const root = document.getElementById('router-view');
    const state = window.Store.getState();
    root.innerHTML = view.render(state);
    view.attachEvents(root, state);
    document.getElementById('btn-edit-acc-delete').click();

    const del = document.getElementById('modal-delete-btn');
    expect(del.textContent).toBe(window.I18n.t('account.deleteEverything'));
    expect(document.getElementById('modal-cancel-btn')).toBeNull();
    const save = document.getElementById('modal-save-btn');
    expect(save.textContent).toBe(window.I18n.t('common.cancel'));
    expect(save.className).toContain('btn-secondary');
    expect(precedes(del, save)).toBe(true);
  });
});

// 1.0.2 (BUG-40): Modal.show({ dismissible: false }) is a mandatory sheet (the
// first-run welcome): no backdrop-tap close, no swipe-down close, the drag
// handle kept as an invisible spacer and [data-back-swallow] for Android Back.
describe('Non-dismissible sheets (1.0.2 BUG-40)', () => {
  let mem;
  const touch = (el, type, y) => {
    const ev = new Event(type, { bubbles: true });
    Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [{ clientY: y }] });
    el.dispatchEvent(ev);
  };
  const swipe = (el, dy) => {
    touch(el, 'touchstart', 100);
    touch(el, 'touchmove', 100 + dy);
    touch(el, 'touchend');
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    mem = {};
    document.body.innerHTML = '<div id="modal-container"></div><div id="router-view"></div>';
    global.window.localStorage = {
      getItem: vi.fn((k) => (k in mem ? mem[k] : null)),
      setItem: vi.fn((k, v) => { mem[k] = String(v); }),
      removeItem: vi.fn((k) => { delete mem[k]; })
    };
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('components.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('(a) a backdrop tap does not close it', () => {
    window.Components.Modal.show({ title: 'Welcome', content: '<p>x</p>', showCancel: false, dismissible: false });
    const backdrop = document.getElementById('active-modal');
    backdrop.classList.add('open');
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(backdrop.classList.contains('open')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(document.getElementById('active-modal')).toBe(backdrop);
  });

  it('(b) a swipe down longer than 150 px does not close it', () => {
    window.Components.Modal.show({ title: 'Welcome', content: '<p>x</p>', showCancel: false, dismissible: false });
    const backdrop = document.getElementById('active-modal');
    backdrop.classList.add('open');
    swipe(backdrop, 250);
    vi.advanceTimersByTime(300);
    expect(backdrop.classList.contains('open')).toBe(true);
    expect(document.getElementById('modal-container').contains(backdrop)).toBe(true);
    expect(backdrop.querySelector('.modal-content').style.transform).not.toContain('100%');
  });

  it('(c) keeps an invisible handle spacer and swallows Back; a default sheet does neither', () => {
    window.Components.Modal.show({ title: 'Welcome', content: '<p>x</p>', showCancel: false, dismissible: false });
    let backdrop = document.getElementById('active-modal');
    let handle = backdrop.querySelector('.modal-handle');
    expect(handle).not.toBeNull();
    expect(handle.style.visibility).toBe('hidden');
    expect(handle.getAttribute('aria-hidden')).toBe('true');
    expect(backdrop.hasAttribute('data-back-swallow')).toBe(true);

    window.Components.Modal.show({ title: 'T', content: '<p>x</p>' });
    backdrop = document.getElementById('active-modal');
    handle = backdrop.querySelector('.modal-handle');
    expect(handle.style.visibility).toBe('');
    expect(handle.hasAttribute('aria-hidden')).toBe(false);
    expect(backdrop.hasAttribute('data-back-swallow')).toBe(false);
  });

  it('(d) guard: a default sheet still closes on a backdrop tap and on a long swipe', () => {
    window.Components.Modal.show({ title: 'T', content: '<p>x</p>' });
    let backdrop = document.getElementById('active-modal');
    backdrop.classList.add('open');
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(backdrop.classList.contains('open')).toBe(false);
    vi.advanceTimersByTime(400);

    window.Components.Modal.show({ title: 'T', content: '<p>x</p>' });
    backdrop = document.getElementById('active-modal');
    backdrop.classList.add('open');
    swipe(backdrop, 250);
    vi.advanceTimersByTime(250);
    expect(backdrop.classList.contains('open')).toBe(false);
    vi.advanceTimersByTime(400);
    expect(document.getElementById('modal-container').innerHTML).toBe('');
  });
});
