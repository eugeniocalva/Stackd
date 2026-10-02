import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// 1.0.1 (BUG-03): Android Back (key + gesture, one Capacitor 'backButton'
// event) used to look only at activeView: exitApp() on Home, history.back()
// elsewhere — killing the app under an open sheet, leaving sheets floating
// over the previous view and silently dropping typed form input.
// Router.handleBack is the priority chain; Components.dismissTopSheet closes
// the topmost sheet through its own dismiss control.
const executeFile = (relativePath) => {
  const absolutePath = path.resolve(__dirname, '../../src', relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let state;
const C = () => window.Components;
const R = () => window.Router;
const openAll = () => document.querySelectorAll('.modal-backdrop').forEach(el => el.classList.add('open'));
const openSheets = () => [...document.querySelectorAll('.modal-backdrop.open')].map(el => el.id);

describe('Android Back (BUG-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1, 12, 0, 0));
    document.body.innerHTML = '<main id="router-view"></main><nav id="bottom-nav"></nav><div id="modal-container"></div>';
    window.location.hash = '#transactions';
    global.window.localStorage = { getItem: vi.fn(), setItem: vi.fn() };
    global.window.StackdHydrateIcons = vi.fn();
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    state = { activeView: 'dashboard', isSelectionMode: false, widgetEditMode: false, homeWidgets: [] };
    global.window.Store = {
      getState: () => state,
      dispatch: vi.fn(),
      getCurrencySymbol: () => '€'
    };
    global.window.BankConnect = { esc: (s) => s, revoke: vi.fn(() => Promise.resolve()) };
    executeFile('components.js');
    executeFile('router.js');
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('chain end points', () => {
    it('bare Home → exit (the caller minimizes the app)', () => {
      expect(R().handleBack({ canGoBack: true })).toBe('exit');
      expect(window.history.back).not.toHaveBeenCalled();
    });

    it('a non-Home view with history → history.back()', () => {
      state.activeView = 'analytics';
      expect(R().handleBack({ canGoBack: true })).toBe('back');
      expect(window.history.back).toHaveBeenCalledTimes(1);
    });

    it('a non-Home view with an empty WebView history → straight to #dashboard', () => {
      state.activeView = 'settings';
      expect(R().handleBack({ canGoBack: false })).toBe('back');
      expect(window.history.back).not.toHaveBeenCalled();
      expect(window.location.hash).toBe('#dashboard');
    });
  });

  describe('sheets', () => {
    it('a generic Modal closes through its Cancel, never navigating or exiting underneath', () => {
      state.activeView = 'analytics';
      const onSave = vi.fn();
      C().Modal.show({ title: 'Hello', content: '<p>x</p>', onSave });
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(document.getElementById('active-modal').classList.contains('open')).toBe(false);
      expect(onSave).not.toHaveBeenCalled();
      expect(window.history.back).not.toHaveBeenCalled();
    });

    it('on Home a sheet is closed instead of leaving the app', () => {
      C().Modal.show({ title: 'Hello', content: '<p>x</p>' });
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(R().handleBack({ canGoBack: true })).toBe('exit');
    });

    it('a delete sheet without #modal-cancel-btn closes via its backdrop / Modal.hide, firing no action', () => {
      const onSave = vi.fn();
      const onDelete = vi.fn();
      C().Modal.show({ title: 'Delete?', content: '<p>x</p>', showDelete: true, onSave, onDelete });
      // the new Modal contract (showCancel defaults to !showDelete) renders no Cancel
      const cancel = document.getElementById('modal-cancel-btn');
      if (cancel) cancel.remove();
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(document.getElementById('active-modal').classList.contains('open')).toBe(false);
      expect(onSave).not.toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('falls back to Modal.hide() when the generic modal has neither Cancel nor a backdrop handler', () => {
      document.getElementById('modal-container').innerHTML =
        '<div class="modal-backdrop open" id="active-modal"><button id="modal-save-btn">OK</button></div>';
      const hide = vi.spyOn(C().Modal, 'hide');
      expect(C().dismissTopSheet()).toBe(true);
      expect(hide).toHaveBeenCalledTimes(1);
      expect(document.getElementById('active-modal').classList.contains('open')).toBe(false);
    });

    it('an IconPicker stacked over a Modal: first Back closes only the picker, the second the modal', () => {
      C().Modal.show({ title: 'Edit', content: '<p>x</p>' });
      const onSelect = vi.fn();
      C().IconPicker.show({ initialIcon: 'pin', onSelect });
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(openSheets()).toEqual(['active-modal']);
      expect(onSelect).not.toHaveBeenCalled();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(openSheets()).toEqual([]);
    });

    it('ranks by computed z-index: a sheet without an inline z-index sits under an inline-10000 picker even when later in the DOM', () => {
      const pickerClose = vi.fn();
      const plainClose = vi.fn();
      document.getElementById('modal-container').innerHTML = `
        <div class="modal-backdrop open" id="picker" style="z-index: 10000;"><button id="pk-x" data-back-dismiss>x</button></div>
        <div class="modal-backdrop open" id="plain"><button id="modal-cancel-btn">Cancel</button></div>`;
      document.getElementById('pk-x').addEventListener('click', pickerClose);
      document.getElementById('modal-cancel-btn').addEventListener('click', plainClose);
      expect(C().dismissTopSheet()).toBe(true);
      expect(pickerClose).toHaveBeenCalledTimes(1);
      expect(plainClose).not.toHaveBeenCalled();
    });

    it('RecurringUpdateModal closes on Back without choosing any scope', () => {
      const onSelection = vi.fn();
      C().RecurringUpdateModal.show({ onSelection });
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(openSheets()).toEqual([]);
      expect(onSelection).not.toHaveBeenCalled();
    });

    it('MonthPicker closes on Back without selecting', () => {
      const onSelect = vi.fn();
      C().MonthPicker.show({ initialValue: '2026-10', onSelect });
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(openSheets()).toEqual([]);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('a sheet with no dismiss control and no handler swallows Back (never navigates)', () => {
      state.activeView = 'analytics';
      document.getElementById('modal-container').innerHTML = '<div class="modal-backdrop open" id="odd"><p>?</p></div>';
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(window.history.back).not.toHaveBeenCalled();
    });

    it('a hidden dismiss control means "not dismissable now": Back is swallowed', () => {
      C().Modal.show({ title: 'Busy', content: '<p>x</p>' });
      document.getElementById('modal-cancel-btn').style.display = 'none';
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(document.getElementById('active-modal').classList.contains('open')).toBe(true);
    });
  });

  describe('swallowed sheets (D4h)', () => {
    const welcomeContent = '<div id="setup-row-currency"></div><div id="setup-row-language"></div>';

    it('the mandatory welcome sheet with its Cancel hidden stays open', () => {
      C().Modal.show({ title: 'Welcome', content: welcomeContent, onSave: vi.fn() });
      document.getElementById('modal-cancel-btn').style.display = 'none';
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(document.getElementById('active-modal').classList.contains('open')).toBe(true);
    });

    it('the welcome sheet stays open even when it renders no Cancel at all (no backdrop fallback)', () => {
      const onSave = vi.fn();
      C().Modal.show({ title: 'Welcome', content: welcomeContent, onSave });
      document.getElementById('modal-cancel-btn').remove();
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(document.getElementById('active-modal').classList.contains('open')).toBe(true);
      expect(onSave).not.toHaveBeenCalled();
    });

    it('the setup picker over the welcome sheet still closes, the welcome sheet does not', () => {
      C().Modal.show({ title: 'Welcome', content: welcomeContent });
      document.getElementById('modal-cancel-btn').style.display = 'none';
      const sheet = document.createElement('div');
      sheet.className = 'modal-backdrop';
      sheet.id = 'setup-picker-sheet';
      sheet.style.cssText = 'z-index:10002;position:fixed;';
      sheet.innerHTML = '<div class="modal-content"><div class="setup-picker-opt" data-code="EUR"></div></div>';
      sheet.addEventListener('click', e => { if (e.target === sheet) sheet.classList.remove('open'); });
      document.body.appendChild(sheet);
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(openSheets()).toEqual(['active-modal']);
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(openSheets()).toEqual(['active-modal']);
    });

    it('the bank-waiting sheet swallows Back and never revokes the requisition', () => {
      C().BankWaitingModal.show({ bankName: 'Test Bank', ref: 'ref123' });
      openAll();
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(openSheets()).toEqual(['bank-waiting-modal']);
      expect(window.BankConnect.revoke).not.toHaveBeenCalled();
      expect(window.Store.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('menu and transient modes', () => {
    it('closes the + action menu', () => {
      const nav = document.getElementById('bottom-nav');
      nav.innerHTML = C().BottomNav.render();
      C().BottomNav.attachEvents(nav);
      nav.querySelector('#nav-fab-toggle').click();
      expect(nav.querySelector('#nav-fab-toggle').getAttribute('aria-expanded')).toBe('true');
      expect(R().handleBack({ canGoBack: true })).toBe('menu');
      expect(nav.querySelector('#nav-fab-toggle').getAttribute('aria-expanded')).toBe('false');
      expect(R().handleBack({ canGoBack: true })).toBe('exit');
    });

    it('exits History selection mode, and only on History', () => {
      state.activeView = 'transactions';
      state.isSelectionMode = true;
      expect(R().handleBack({ canGoBack: true })).toBe('mode');
      expect(window.Store.dispatch).toHaveBeenCalledWith('TOGGLE_SELECTION_MODE', { active: false });
      expect(window.history.back).not.toHaveBeenCalled();

      window.Store.dispatch.mockClear();
      state.activeView = 'analytics';
      expect(R().handleBack({ canGoBack: true })).toBe('back');
      expect(window.Store.dispatch).not.toHaveBeenCalled();
    });

    it('leaves Home widget edit mode when there are widgets; with none, Back exits', () => {
      state.widgetEditMode = true;
      state.homeWidgets = [{ id: 'w1', type: 'latest', size: 'large', config: {} }];
      expect(R().handleBack({ canGoBack: true })).toBe('mode');
      expect(window.Store.dispatch).toHaveBeenCalledWith('TOGGLE_WIDGET_EDIT_MODE', false);

      window.Store.dispatch.mockClear();
      state.homeWidgets = [];
      expect(R().handleBack({ canGoBack: true })).toBe('exit');
      expect(window.Store.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('unsaved-form confirm', () => {
    const mountTxForm = () => {
      state.activeView = 'add';
      document.getElementById('router-view').innerHTML = `
        <input type="number" id="tx-amount" value="">
        <input type="text" id="tx-comment" value="">
        <input type="checkbox" id="tx-is-paid" checked>`;
    };

    it('a touched-and-changed form asks first; Discard leaves, a second Back keeps editing', () => {
      mountTxForm();
      R()._armFormBaseline();
      document.getElementById('tx-amount').value = '12.50';

      expect(R().handleBack({ canGoBack: true })).toBe('confirm');
      expect(document.getElementById('modal-title').textContent).toBe('Discard changes?');
      expect(window.history.back).not.toHaveBeenCalled();
      openAll();

      // second Back = keep editing
      expect(R().handleBack({ canGoBack: true })).toBe('sheet');
      expect(document.getElementById('active-modal').classList.contains('open')).toBe(false);
      expect(window.history.back).not.toHaveBeenCalled();
      expect(document.getElementById('tx-amount').value).toBe('12.50');

      // ask again, then Discard
      expect(R().handleBack({ canGoBack: true })).toBe('confirm');
      document.getElementById('modal-save-btn').click();
      expect(window.history.back).toHaveBeenCalledTimes(1);
      expect(R()._formBaseline).toBeNull();
    });

    it('Discard with an empty WebView history goes to #dashboard', () => {
      mountTxForm();
      R()._armFormBaseline();
      document.getElementById('tx-comment').value = 'lunch';
      expect(R().handleBack({ canGoBack: false })).toBe('confirm');
      document.getElementById('modal-save-btn').click();
      expect(window.location.hash).toBe('#dashboard');
      expect(window.history.back).not.toHaveBeenCalled();
    });

    it('an untouched form, or one reverted to its baseline, leaves at once', () => {
      mountTxForm();
      expect(R().handleBack({ canGoBack: true })).toBe('back');
      expect(window.history.back).toHaveBeenCalledTimes(1);

      R()._armFormBaseline();
      const paid = document.getElementById('tx-is-paid');
      paid.checked = false;
      paid.checked = true;
      expect(R().handleBack({ canGoBack: true })).toBe('back');
      expect(window.history.back).toHaveBeenCalledTimes(2);
    });

    it('a picked icon (data-lucide) or colour swatch (aria-checked) counts as a change', () => {
      state.activeView = 'edit-account';
      document.getElementById('router-view').innerHTML = `
        <input type="text" id="acc-name" value="Bank">
        <i id="acc-icon-preview" data-lucide="landmark"></i>
        <button class="color-swatch-btn" data-color="#111" role="radio" aria-checked="true"></button>
        <button class="color-swatch-btn" data-color="#222" role="radio" aria-checked="false"></button>`;
      R()._armFormBaseline();
      document.getElementById('acc-icon-preview').setAttribute('data-lucide', 'wallet');
      expect(R()._isFormDirty()).toBe(true);
      document.getElementById('acc-icon-preview').setAttribute('data-lucide', 'landmark');
      expect(R()._isFormDirty()).toBe(false);

      const [a, b] = document.querySelectorAll('.color-swatch-btn');
      a.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-checked', 'true');
      expect(R()._isFormDirty()).toBe(true);
      expect(R().handleBack({ canGoBack: true })).toBe('confirm');
    });

    it('tag chips count, autocomplete suggestions do not', () => {
      mountTxForm();
      const rv = document.getElementById('router-view');
      R()._armFormBaseline();
      rv.insertAdjacentHTML('beforeend', '<div class="tag-suggestion" data-tag="food"></div>');
      expect(R()._isFormDirty()).toBe(false);
      rv.insertAdjacentHTML('beforeend', '<span class="tag-chip" data-tag="food"></span>');
      expect(R()._isFormDirty()).toBe(true);
    });

    it('non-form views never ask', () => {
      state.activeView = 'debt-sim';
      document.getElementById('router-view').innerHTML = '<input id="x" value="">';
      R()._armFormBaseline();
      document.getElementById('x').value = '5';
      expect(R().handleBack({ canGoBack: true })).toBe('back');
    });

    it('Router.init arms the baseline on the first touch (capture phase) and a route change resets it', () => {
      mountTxForm();
      window.location.hash = '#add';
      R().init();
      expect(R()._formBaseline).toBeNull();
      const amount = document.getElementById('tx-amount');
      amount.dispatchEvent(new Event('focusin', { bubbles: true }));
      expect(R()._formBaseline).not.toBeNull();
      amount.value = '3';
      // a later touch never re-baselines
      amount.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(R()._isFormDirty()).toBe(true);

      R().handleRouteChange();
      expect(R()._formBaseline).toBeNull();
      expect(R()._isFormDirty()).toBe(false);
    });
  });
});
