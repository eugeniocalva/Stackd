import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.1 (BUG-21): Components.NoticeSheet is the in-app replacement for
// window.alert() — used for the Settings "Import CSV" results.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const $ = (id) => document.getElementById(id);

const boot = () => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => ({}), navigate: vi.fn() },
    alert: vi.fn()
  };
  global.localStorage = global.window.localStorage;
  global.requestAnimationFrame = (cb) => cb();
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  global.window.Store.init();
};

describe('Components.NoticeSheet (1.0.1 BUG-21)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an escaped, labelled one-button sheet in #modal-container', () => {
    const backdrop = global.window.Components.NoticeSheet.show({ id: 'n', title: 'T <i>', body: 'line 1\n<b>bold</b>' });
    expect(backdrop).toBe($('n'));
    expect($('modal-container').contains(backdrop)).toBe(true);
    expect(backdrop.getAttribute('role')).toBe('dialog');
    expect(backdrop.getAttribute('aria-labelledby')).toBe('n-title');
    expect($('n-title').textContent).toBe('T <i>');
    expect($('n-body').textContent).toBe('line 1\n<b>bold</b>');
    expect(backdrop.querySelector('b')).toBeNull();
    expect(backdrop.getAttribute('aria-describedby')).toBe('n-body');
    expect($('n-ok').textContent).toBe('OK');
    expect($('n-ok').hasAttribute('data-back-dismiss')).toBe(true);
  });

  it('without a title the body labels the dialog', () => {
    const backdrop = global.window.Components.NoticeSheet.show({ id: 'n2', body: 'Hello' });
    expect(backdrop.getAttribute('aria-labelledby')).toBe('n2-title');
    expect($('n2-title').textContent).toBe('Hello');
    expect(backdrop.querySelector('h2')).toBeNull();
  });

  it('focuses OK, and OK closes it (removed after the 300 ms exit)', () => {
    const onClose = vi.fn();
    global.window.Components.NoticeSheet.show({ id: 'n', body: 'x', onClose });
    vi.advanceTimersByTime(60);
    expect(document.activeElement).toBe($('n-ok'));
    $('n-ok').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect($('n')).toBeNull();
    // idempotent
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape and a backdrop tap close it', () => {
    global.window.Components.NoticeSheet.show({ id: 'n', body: 'x' });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    vi.advanceTimersByTime(300);
    expect($('n')).toBeNull();

    const b = global.window.Components.NoticeSheet.show({ id: 'm', body: 'y' });
    b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    vi.advanceTimersByTime(300);
    expect($('m')).toBeNull();
  });

  it('a second notice with the same id replaces the first', () => {
    global.window.Components.NoticeSheet.show({ id: 'import-result-modal', body: 'first' });
    global.window.Components.NoticeSheet.show({ id: 'import-result-modal', body: 'second' });
    expect(document.querySelectorAll('#import-result-modal')).toHaveLength(1);
    expect($('import-result-modal').textContent).toContain('second');
  });
});

describe('Settings import results use the NoticeSheet (1.0.1 BUG-21)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    boot();
    global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0, openingDate: '2026-01-01' });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const pickFile = () => {
    const input = $('import-csv-file');
    Object.defineProperty(input, 'files', { value: [{ name: 'backup.csv' }], configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  const renderSettings = () => {
    const c = $('router-view');
    const state = global.window.Store.getState();
    c.innerHTML = global.window.Views.OthersView.render(state);
    global.window.Views.OthersView.attachEvents(c, state);
  };

  it('a restore result opens #import-result-modal (no alert)', () => {
    global.window.StackdImport = {
      importCSV: (file, state, ok) => ok({ kind: 'budgets', importedCount: 2, skippedCount: 0, skipped: {} })
    };
    renderSettings();
    pickFile();
    const sheet = $('import-result-modal');
    expect(sheet).not.toBeNull();
    expect($('import-result-modal-title').textContent).toBe('Import complete');
    expect(sheet.textContent).toContain('Imported 2 budgets');
    expect(global.window.alert).not.toHaveBeenCalled();
  });

  it('skip reasons keep their line breaks', () => {
    global.window.StackdImport = {
      importCSV: (file, state, ok) => ok({ kind: 'transactions', importedCount: 3, newAccounts: 0, newCategories: 0, skippedCount: 2, skipped: { 'invalid amount': 2 } })
    };
    renderSettings();
    pickFile();
    expect($('import-result-modal-body').textContent).toContain('\n');
    expect($('import-result-modal-body').textContent).toContain('invalid amount');
  });

  it('a failure opens the sheet with the error title', () => {
    global.window.StackdImport = {
      importCSV: (file, state, ok, fail) => fail(new Error('boom'))
    };
    renderSettings();
    pickFile();
    expect($('import-result-modal-title').textContent).toBe('Import failed');
    expect($('import-result-modal-body').textContent).toContain('boom');
    expect(global.window.alert).not.toHaveBeenCalled();
  });
});
