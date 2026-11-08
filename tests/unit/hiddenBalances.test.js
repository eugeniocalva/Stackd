// 1.2.2 (HG-4): hidden balances. The privacy pref (hide / shake) is a
// per-device setting; while hide is on, every amount on Home formats as a
// fixed mask (sign and symbol kept, percentages untouched) and a pill opens
// the Show / Done sheet. Other screens, files and prices stay plain. A shake
// (three strong jolts in under a second) flips hide while Home is on screen.
// Boot follows homeGraphScrub.test.js.
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

const makeChartStub = () => {
  const Chart = function (canvas, config) {
    this.config = config;
    this.data = config.data;
    this.destroy = () => {};
    this.update = () => {};
    this.scales = { x: { getValueForPixel: (px) => px / 10 } };
  };
  Chart.getChart = () => null;
  return Chart;
};

let uid = 0;
let S, C, V, container, listeners, haptics;

const boot = ({ stored, native = false } = {}) => {
  const localStorage = makeLocalStorage();
  localStorage.setItem('stackd_v1_homeWidgets', JSON.stringify([
    { id: 'w1', type: 'latest', size: 'large', config: {}, createdAt: 1 }
  ]));
  if (stored !== undefined) localStorage.setItem('stackd_v1_privacy', JSON.stringify(stored));
  listeners = {};
  haptics = { impact: vi.fn(() => Promise.resolve()) };
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    StackdHydrateIcons: vi.fn(),
    Router: { navigate: vi.fn(), getParams: () => ({}), handleRouteChange() {} },
    Capacitor: { isNativePlatform: () => native, Plugins: { Haptics: haptics } },
    DeviceMotionEvent: function () {}
  };
  global.localStorage = localStorage;
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  executeFile('views.js');
  global.window.Chart = makeChartStub();
  S = global.window.Store;
  C = global.window.Components;
  S.init();
  S.dispatch('SET_CURRENCY', 'EUR');
  V = global.window.Views.DashboardView;
  S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2026-01-01' });
  const id = S.getState().accounts[0].id;
  S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 42.5, accountId: id, categoryId: 'cat_groceries', date: S._todayYMD() });
};

const mount = () => {
  const state = S.getState();
  container.innerHTML = V.render(state);
  V.attachEvents(container, state, false);
};

const motion = (x, now) => C.PrivacyShake._sample({ acceleration: { x, y: 0, z: 0 } }, now);

beforeEach(() => {
  document.body.innerHTML = '<main id="router-view"></main><div id="modal-container"></div>';
  container = document.getElementById('router-view');
});

afterEach(() => {
  if (global.window && global.window.Components) global.window.Components.PrivacyShake.stop();
  document.body.innerHTML = '';
});

describe('the privacy pref (HG-4)', () => {
  it('defaults to off, keeps booleans only, and persists', () => {
    boot();
    expect(S.getPrivacy()).toEqual({ hide: false, shake: false });
    S.dispatch('SET_PRIVACY', { hide: true, shake: 'yes', extra: 1 });
    expect(S.getPrivacy()).toEqual({ hide: true, shake: false });
    expect(JSON.parse(global.window.localStorage.getItem('stackd_v1_privacy'))).toEqual({ hide: true, shake: false });
    S.dispatch('SET_PRIVACY', { shake: true });
    expect(S.getPrivacy()).toEqual({ hide: true, shake: true }); // merged
  });

  it('is read back at boot and survives a slice reload', () => {
    boot({ stored: { hide: true, shake: true } });
    expect(S.getPrivacy()).toEqual({ hide: true, shake: true });
    global.window.localStorage.setItem('stackd_v1_privacy', JSON.stringify({ hide: false }));
    S._reloadSlice('privacy');
    expect(S.getPrivacy()).toEqual({ hide: false, shake: false });
  });

  it('a reset is a fresh install: balances shown again', () => {
    boot({ stored: { hide: true, shake: true } });
    S.dispatch('RESET_APP');
    expect(S.getPrivacy()).toEqual({ hide: false, shake: false });
    expect(global.window.localStorage.getItem('stackd_v1_privacy')).toBeNull();
  });
});

describe('the mask (HG-4)', () => {
  beforeEach(() => boot({ stored: { hide: true } }));

  it('masks amounts on Home only, keeping sign and symbol', () => {
    expect(S.getState().activeView).toBe('dashboard');
    expect(S.formatCurrency(1234.56)).toBe('€••••');
    expect(S.formatCurrency(-7)).toBe('-€••••');
    expect(S.formatCurrency(99999999, 'USD')).toBe('$••••'); // no length hint
    S.dispatch('SET_VIEW', 'transactions');
    expect(S.formatCurrency(1234.56)).toBe('€1,234.56');
  });

  it('never masks a file or a price ({ plain: true }), nor percentages', () => {
    expect(S.formatCurrency(1234.56, 'EUR', { plain: true })).toBe('€1,234.56');
    expect(S.formatPercent(12.3, { digits: 1, signed: true })).toBe('+12.3%');
  });

  it('is off while hide is off', () => {
    S.dispatch('SET_PRIVACY', { hide: false });
    expect(S.formatCurrency(5)).toBe('€5.00');
  });
});

describe('Home while balances are hidden (HG-4)', () => {
  it('shows the pill and masks the header and the widgets, never a real figure', () => {
    boot({ stored: { hide: true } });
    mount();
    expect(container.querySelector('#privacy-pill')).not.toBeNull();
    expect(container.querySelector('#dash-total').textContent).toBe('€••••');
    const html = container.innerHTML;
    expect(html).not.toMatch(/€\s?\d/); // no formatted amount anywhere on Home
    expect(html).toContain('-€••••'); // the latest widget's expense row
  });

  it('has no pill and plain figures while shown', () => {
    boot();
    mount();
    expect(container.querySelector('#privacy-pill')).toBeNull();
    expect(container.querySelector('#dash-total').textContent).toBe('€4,957.50');
  });

  it('the pill opens the sheet: Done keeps them hidden, Show reveals them', async () => {
    boot({ stored: { hide: true } });
    mount();
    container.querySelector('#privacy-pill').click();
    let sheet = document.getElementById('hidden-balances-sheet');
    expect(sheet).not.toBeNull();
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.querySelector('[data-back-dismiss]').id).toBe('hidden-balances-sheet-done');
    sheet.querySelector('#hidden-balances-sheet-done').click();
    expect(S.getPrivacy().hide).toBe(true);

    container.querySelector('#privacy-pill').click();
    sheet = document.getElementById('hidden-balances-sheet');
    sheet.querySelector('#hidden-balances-sheet-show').click();
    // 1.2.2 (HG-13): through Home's reveal motion, one dispatch at its end
    await vi.waitFor(() => expect(S.getPrivacy().hide).toBe(false));
  });
});

describe('shake to hide (HG-4)', () => {
  it('three strong jolts inside the window fire once; a cooldown follows', () => {
    boot();
    const fired = vi.fn();
    C.PrivacyShake.start(fired);
    motion(20, 1000);
    motion(-20, 1200);
    expect(fired).not.toHaveBeenCalled();
    motion(20, 1400);
    expect(fired).toHaveBeenCalledTimes(1);
    motion(20, 1600); motion(-20, 1800); motion(20, 2000); // inside the cooldown
    expect(fired).toHaveBeenCalledTimes(1);
    motion(20, 3100); motion(-20, 3300); motion(20, 3500);
    expect(fired).toHaveBeenCalledTimes(2);
  });

  it('ignores gentle motion, slow jolts and one jolt sampled many times', () => {
    boot();
    const fired = vi.fn();
    C.PrivacyShake.start(fired);
    for (let t = 0; t < 2000; t += 16) motion(8, t); // walking-level motion
    expect(fired).not.toHaveBeenCalled();
    motion(20, 5000); motion(20, 5010); motion(20, 5020); // one jolt at 60 Hz
    expect(fired).not.toHaveBeenCalled();
    motion(20, 8000); motion(20, 8600); motion(20, 9200); // too slow
    expect(fired).not.toHaveBeenCalled();
  });

  it('falls back to gravity-included acceleration', () => {
    boot();
    expect(C.PrivacyShake._magnitude({ acceleration: null, accelerationIncludingGravity: { x: 0, y: 9.81, z: 20 } })).toBeGreaterThan(12);
    expect(C.PrivacyShake._magnitude({ acceleration: null, accelerationIncludingGravity: { x: 0, y: 9.81, z: 0 } })).toBeLessThan(0.01);
  });

  it('runs on Home only while the pref is on, and a shake flips hide with a haptic tap', async () => {
    boot({ native: true });
    mount();
    expect(C.PrivacyShake.isRunning()).toBe(false);
    S.dispatch('SET_PRIVACY', { shake: true });
    mount();
    expect(C.PrivacyShake.isRunning()).toBe(true);
    expect((listeners.devicemotion || []).length).toBe(1);
    const now = Date.now();
    motion(20, now); motion(-20, now + 200); motion(20, now + 400);
    // 1.2.2 (HG-13): the balls cover first, then one dispatch; a light tap
    // per ball and a heavy seal
    expect(S.getPrivacy().hide).toBe(false);
    await vi.waitFor(() => expect(S.getPrivacy().hide).toBe(true));
    expect(haptics.impact.mock.calls.filter(c => c[0].style === 'LIGHT').length).toBe(4);
    expect(haptics.impact).toHaveBeenCalledWith({ style: 'HEAVY' });
    V.destroy();
    expect(C.PrivacyShake.isRunning()).toBe(false);
    expect((listeners.devicemotion || []).length).toBe(0);
  });

  it('asks iOS for motion access and reports a refusal', async () => {
    boot();
    global.window.DeviceMotionEvent.requestPermission = vi.fn(() => Promise.resolve('denied'));
    expect(await C.PrivacyShake.requestPermission()).toBe('denied');
    global.window.DeviceMotionEvent.requestPermission = vi.fn(() => Promise.reject(new Error('no gesture')));
    expect(await C.PrivacyShake.requestPermission()).toBe('denied');
    delete global.window.DeviceMotionEvent.requestPermission;
    expect(await C.PrivacyShake.requestPermission()).toBe('granted'); // Android / desktop
  });
});

describe('Settings → Privacy (HG-4)', () => {
  const settings = () => {
    S.dispatch('SET_VIEW', 'settings');
    const view = global.window.Views.OthersView;
    container.innerHTML = view.render(S.getState());
    view.attachEvents(container, S.getState());
  };

  it('has the two switches, reflecting the pref', () => {
    boot({ stored: { hide: true } });
    settings();
    expect(container.innerHTML).toContain('Privacy');
    expect(container.querySelector('#toggle-hide-balances').checked).toBe(true);
    expect(container.querySelector('#toggle-shake-to-hide').checked).toBe(false);
    expect(container.querySelector('#toggle-hide-balances').getAttribute('aria-labelledby')).toBe('label-hide-balances');
  });

  it('Hide balances dispatches; Shake to hide turns back off when motion is refused', async () => {
    boot();
    settings();
    const hide = container.querySelector('#toggle-hide-balances');
    hide.checked = true;
    hide.dispatchEvent(new Event('change'));
    expect(S.getPrivacy().hide).toBe(true);

    global.window.DeviceMotionEvent.requestPermission = vi.fn(() => Promise.resolve('denied'));
    const shake = container.querySelector('#toggle-shake-to-hide');
    shake.checked = true;
    shake.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(document.getElementById('motion-denied-sheet')).not.toBeNull());
    expect(shake.checked).toBe(false);
    expect(S.getPrivacy().shake).toBe(false);

    global.window.DeviceMotionEvent.requestPermission = vi.fn(() => Promise.resolve('granted'));
    shake.checked = true;
    shake.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(S.getPrivacy().shake).toBe(true));
  });
});
