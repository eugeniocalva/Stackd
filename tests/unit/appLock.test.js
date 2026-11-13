// 1.3.0 (PL-3, docs/privacy-currencies-plan.md §4): App lock. A 4-digit PIN
// of the app's own (only its PBKDF2 hash is stored), biometrics as a
// shortcut, a lock delay, waits after wrong PINs, and the phone's own screen
// lock as the way out of a forgotten PIN — offered only when the phone had
// one when the PIN was created. The native half is stubbed through
// window.__STACKD_LOCK_STUB__.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { webcrypto } from 'node:crypto';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let store; // survives a "relaunch" (boot again with keep: true)
let S, L, V, plugin, appListeners;

const makeLocalStorage = () => ({
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
});

const makePlugin = (over) => Object.assign({
  status: vi.fn(async () => ({ biometry: 'fingerprint', enrolled: true, deviceSecure: true })),
  authenticate: vi.fn(async () => ({ ok: true })),
  setPrivacyCover: vi.fn(async () => ({}))
}, over || {});

const boot = ({ keep = false, stub = true, pluginOver, native = false } = {}) => {
  if (!keep) store = new Map([['stackd_v1_homeWidgets', '[]'], ['stackd_v1_setup_done', '1']]);
  document.body.innerHTML = '<div id="app"><main id="router-view"></main><nav id="bottom-nav"></nav><div id="modal-container"></div></div>';
  const localStorage = makeLocalStorage();
  plugin = makePlugin(pluginOver);
  appListeners = {};
  global.window = {
    crypto: webcrypto,
    localStorage,
    document,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    StackdHydrateIcons: vi.fn(),
    Router: { navigate: vi.fn(), getParams: () => ({}), handleRouteChange() {} },
    Capacitor: {
      isNativePlatform: () => native,
      getPlatform: () => (native ? 'android' : 'web'),
      Plugins: { App: { addListener: (name, fn) => { appListeners[name] = fn; } } }
    }
  };
  if (stub) global.window.__STACKD_LOCK_STUB__ = plugin;
  global.localStorage = localStorage;
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'views.js', 'app-lock.js'].forEach(executeFile);
  S = global.window.Store;
  L = global.window.AppLock;
  V = global.window.Views.OthersView;
  L.ITERATIONS = 1000; // the floor normalizeAppLock accepts: fast tests
  S.init();
  L.boot();
};

const screen = () => document.getElementById('app-lock');
const title = () => screen().querySelector('#app-lock-title').textContent;
const message = () => screen().querySelector('#app-lock-msg').textContent;
const dotsOn = () => screen().querySelectorAll('.app-lock-dot.is-on').length;
const press = (digits) => {
  for (const d of String(digits)) screen().querySelector(`.app-lock-key[data-key="${d}"]`).click();
};
// type a PIN and wait until the screen has taken it (the dots are empty again
// or the screen is gone)
const enter = async (pin) => {
  press(pin);
  await vi.waitFor(() => { if (screen() && (L._busy || dotsOn() !== 0)) throw new Error('busy'); });
};
const setUpPin = async (pin = '1234') => {
  const done = L.enable();
  await enter(pin);
  await enter(pin);
  expect(await done).toBe(true);
};

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 12, 10, 0, 0)); });
afterEach(() => {
  if (L && L._timer) clearInterval(L._timer);
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the appLock slice (PL-3)', () => {
  beforeEach(() => boot());

  it('is off by default and only a whole PIN record turns it on', () => {
    expect(S.getAppLock()).toEqual({ enabled: false, hash: '', salt: '', iter: 0, biometrics: false, delay: 60, deviceSecureAtSetup: false, fails: 0, lockedUntil: 0 });
    S.dispatch('SET_APP_LOCK', { enabled: true });
    expect(S.getAppLock().enabled).toBe(false);
    S.dispatch('SET_APP_LOCK', { enabled: true, hash: 'zz', salt: 'a'.repeat(32), iter: 1000 });
    expect(S.getAppLock().enabled).toBe(false);
    S.dispatch('SET_APP_LOCK', { enabled: true, hash: 'a'.repeat(64), salt: 'b'.repeat(32), iter: 1000, biometrics: 'yes', delay: 7 });
    const cfg = S.getAppLock();
    expect(cfg.enabled).toBe(true);
    expect(cfg.biometrics).toBe(false); // booleans only
    expect(cfg.delay).toBe(60);         // one of 0 | 60 | 300
    expect(JSON.parse(store.get('stackd_v1_appLock')).hash).toBe('a'.repeat(64));
  });

  it('turning it off forgets the hash, and a Factory reset removes it', () => {
    S.dispatch('SET_APP_LOCK', { enabled: true, hash: 'a'.repeat(64), salt: 'b'.repeat(32), iter: 1000, delay: 300 });
    S.dispatch('SET_APP_LOCK', { enabled: false });
    expect(store.has('stackd_v1_appLock')).toBe(false);
    expect(S.getAppLock().hash).toBe('');
    S.dispatch('SET_APP_LOCK', { enabled: true, hash: 'a'.repeat(64), salt: 'b'.repeat(32), iter: 1000 });
    S.dispatch('RESET_APP');
    expect(store.has('stackd_v1_appLock')).toBe(false);
    expect(S.getAppLock().enabled).toBe(false);
  });
});

describe('creating a PIN (PL-3)', () => {
  beforeEach(() => boot());

  it('asks twice, stores a salted hash and never the PIN', async () => {
    const done = L.enable();
    expect(title()).toBe('Create a PIN');
    expect(document.getElementById('app').hasAttribute('inert')).toBe(true);
    press('12');
    expect(dotsOn()).toBe(2);
    expect(screen().querySelector('#app-lock-dots').getAttribute('aria-label')).toBe('Digits entered: 2 of 4');
    await enter('34');
    expect(title()).toBe('Repeat the PIN');
    await enter('1234');
    expect(await done).toBe(true);
    expect(screen()).toBeNull();
    expect(document.getElementById('app').hasAttribute('inert')).toBe(false);
    const cfg = S.getAppLock();
    expect(cfg.enabled).toBe(true);
    expect(cfg.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(cfg.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(cfg.biometrics).toBe(false);
    expect(cfg.deviceSecureAtSetup).toBe(true);
    expect(store.get('stackd_v1_appLock')).not.toContain('"1234"');
    expect(plugin.setPrivacyCover).toHaveBeenLastCalledWith({ enabled: true });
  });

  it('two different entries start again; Cancel and Back leave it off', async () => {
    let done = L.enable();
    await enter('1234');
    await enter('4321');
    expect(title()).toBe('Create a PIN');
    expect(message()).toBe("The two PINs don't match. Start again.");
    screen().querySelector('#app-lock-cancel').click();
    expect(await done).toBe(false);
    expect(S.getAppLock().enabled).toBe(false);
    done = L.enable();
    expect(L.handleBack()).toBe('sheet'); // Android Back = Cancel
    expect(await done).toBe(false);
    expect(screen()).toBeNull();
  });

  it('the keyboard types digits and Backspace deletes', async () => {
    L.enable();
    ['1', '2', '9'].forEach(k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    expect(L._entry).toBe('12');
    screen().querySelector('.app-lock-key[data-key="back"]').click();
    expect(L._entry).toBe('1');
    L.handleBack();
  });

  it('records that the phone had no screen lock, and is not offered where it cannot work', async () => {
    boot({ pluginOver: { status: vi.fn(async () => ({ biometry: 'none', enrolled: false, deviceSecure: false })) } });
    await setUpPin();
    expect(S.getAppLock().deviceSecureAtSetup).toBe(false);
    boot({ stub: false }); // the web build: no plugin
    expect(L.available()).toBe(false);
    expect(await L.enable()).toBe(false);
    expect(screen()).toBeNull();
  });
});

describe('the lock screen (PL-3)', () => {
  beforeEach(async () => {
    boot();
    await setUpPin('2580');
    boot({ keep: true }); // relaunch
  });

  it('is up at boot, before anything else, and the right PIN opens it', async () => {
    expect(L.isLocked()).toBe(true);
    expect(title()).toBe('Enter your PIN');
    expect(screen().getAttribute('role')).toBe('dialog');
    expect(document.getElementById('app').hasAttribute('inert')).toBe(true);
    await enter('2580');
    expect(L.isLocked()).toBe(false);
    expect(screen()).toBeNull();
    expect(document.getElementById('app').hasAttribute('inert')).toBe(false);
  });

  it('a wrong PIN says so and counts; the 5th starts a wait that survives a relaunch', async () => {
    for (let i = 1; i <= 4; i++) {
      await enter('0000');
      expect(message()).toBe('Wrong PIN');
      expect(S.getAppLock().fails).toBe(i);
      expect(S.getAppLock().lockedUntil).toBe(0);
    }
    await enter('0000');
    expect(S.getAppLock().fails).toBe(5);
    expect(message()).toBe('Too many wrong PINs. Try again in 0:30.');
    expect(screen().querySelector('.app-lock-key[data-key="1"]').disabled).toBe(true);
    press('2580'); // ignored while waiting
    expect(L._entry).toBe('');
    boot({ keep: true });
    expect(L.isLocked()).toBe(true);
    expect(message()).toBe('Too many wrong PINs. Try again in 0:30.');
    vi.setSystemTime(Date.now() + 31000);
    L._paint();
    expect(screen().querySelector('.app-lock-key[data-key="1"]').disabled).toBe(false);
    await enter('2580');
    expect(L.isLocked()).toBe(false);
    expect(S.getAppLock().fails).toBe(0);
  });

  it('the waits grow: 30 s, 1 min, 5 min, then 15 min', async () => {
    const waits = [];
    for (let i = 1; i <= 9; i++) {
      await enter('0000');
      const until = S.getAppLock().lockedUntil;
      if (until) { waits.push(Math.round((until - Date.now()) / 1000)); vi.setSystemTime(until + 1000); L._paint(); }
    }
    expect(waits).toEqual([30, 60, 300, 900, 900]);
  });

  it('Android Back leaves the app while locked; from Forgot PIN it steps back to the pad', () => {
    expect(L.handleBack()).toBe('exit');
    screen().querySelector('#app-lock-forgot').click();
    expect(title()).toBe('Forgot your PIN?');
    expect(L.handleBack()).toBe('step');
    expect(title()).toBe('Enter your PIN');
    expect(L.isLocked()).toBe(true);
  });
});

describe('biometrics (PL-3)', () => {
  it('turning them on asks once; a refusal leaves the switch off', async () => {
    boot();
    await setUpPin();
    plugin.authenticate.mockResolvedValueOnce({ ok: false, code: 'cancel' });
    expect(await L.setBiometrics(true)).toBe(false);
    expect(S.getAppLock().biometrics).toBe(false);
    expect(await L.setBiometrics(true)).toBe(true);
    expect(S.getAppLock().biometrics).toBe(true);
    expect(plugin.authenticate).toHaveBeenLastCalledWith(expect.objectContaining({ allowDeviceCredential: false }));
    expect(await L.setBiometrics(false)).toBe(true);
    expect(S.getAppLock().biometrics).toBe(false);
  });

  it('unlock at launch once the splash is gone; a cancel leaves the PIN pad', async () => {
    boot();
    await setUpPin();
    await L.setBiometrics(true);
    boot({ keep: true, pluginOver: { authenticate: vi.fn(async () => ({ ok: false, code: 'cancel' })) } });
    expect(plugin.authenticate).not.toHaveBeenCalled(); // not before ready()
    expect(screen().querySelector('#app-lock-bio')).not.toBeNull();
    L.ready();
    await vi.waitFor(() => expect(plugin.authenticate).toHaveBeenCalledTimes(1));
    expect(L.isLocked()).toBe(true);
    L.ready(); // asked once per lock
    expect(plugin.authenticate).toHaveBeenCalledTimes(1);
    plugin.authenticate.mockResolvedValueOnce({ ok: true });
    screen().querySelector('#app-lock-bio').click();
    await vi.waitFor(() => expect(L.isLocked()).toBe(false));
  });

  it('without the switch there is no biometric key and no prompt', async () => {
    boot();
    await setUpPin();
    boot({ keep: true });
    L.ready();
    expect(screen().querySelector('#app-lock-bio')).toBeNull();
    expect(plugin.authenticate).not.toHaveBeenCalled();
  });
});

describe('leaving and coming back (PL-3)', () => {
  const away = (seconds) => {
    L._left();
    vi.setSystemTime(Date.now() + seconds * 1000);
    L._back();
  };

  beforeEach(async () => {
    boot();
    await setUpPin();
    vi.setSystemTime(Date.now() + 5000);
  });

  it('by default locks after a minute away, not before', () => {
    expect(S.getAppLock().delay).toBe(60);
    L._left();
    expect(document.getElementById('app-lock-cover')).not.toBeNull(); // nothing shows while away
    vi.setSystemTime(Date.now() + 30000);
    L._back();
    expect(L.isLocked()).toBe(false);
    expect(document.getElementById('app-lock-cover')).toBeNull();
    away(61);
    expect(L.isLocked()).toBe(true);
  });

  it('"Immediately" locks the moment the app leaves', () => {
    S.dispatch('SET_APP_LOCK', { delay: 0 });
    L._left();
    expect(L.isLocked()).toBe(true);
  });

  it('5 minutes means 5 minutes', () => {
    S.dispatch('SET_APP_LOCK', { delay: 300 });
    away(299);
    expect(L.isLocked()).toBe(false);
    away(301);
    expect(L.isLocked()).toBe(true);
  });

  it("our own system prompt is not 'leaving the app'", async () => {
    S.dispatch('SET_APP_LOCK', { delay: 0, biometrics: true });
    let finish;
    plugin.authenticate.mockImplementationOnce(() => new Promise(r => { finish = r; }));
    const asked = L.setBiometrics(true);
    L._left();   // the prompt covers the app
    L._back();
    expect(L.isLocked()).toBe(false);
    finish({ ok: true });
    await asked;
    L._left();   // the pause that trails the prompt
    expect(L.isLocked()).toBe(false);
    vi.setSystemTime(Date.now() + 2000);
    L._left();
    expect(L.isLocked()).toBe(true);
  });

  it('with the lock off nothing is stamped or covered', () => {
    S.dispatch('SET_APP_LOCK', { enabled: false });
    away(600);
    expect(L.isLocked()).toBe(false);
    expect(document.getElementById('app-lock-cover')).toBeNull();
  });

  it('listens to the native pause and resume', () => {
    boot({ keep: true, native: true });
    expect(typeof appListeners.pause).toBe('function');
    expect(typeof appListeners.resume).toBe('function');
  });
});

describe('Forgot PIN (PL-3, D2 / A3)', () => {
  it("the phone's screen lock turns App lock off and keeps the data", async () => {
    boot();
    await setUpPin();
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
    boot({ keep: true });
    screen().querySelector('#app-lock-forgot').click();
    expect(screen().querySelector('#app-lock-forgot-body').textContent).toContain("phone's screen lock");
    plugin.authenticate.mockResolvedValueOnce({ ok: false, code: 'failed' });
    screen().querySelector('#app-lock-reset').click();
    await vi.waitFor(() => expect(message()).toBe("Your phone's screen lock was not confirmed."));
    expect(L.isLocked()).toBe(true);
    screen().querySelector('#app-lock-reset').click();
    await vi.waitFor(() => expect(L.isLocked()).toBe(false));
    expect(plugin.authenticate).toHaveBeenLastCalledWith(expect.objectContaining({ allowDeviceCredential: true }));
    expect(S.getAppLock().enabled).toBe(false);
    expect(store.has('stackd_v1_appLock')).toBe(false);
    expect(S.getState().accounts.length).toBe(1);
    expect(plugin.setPrivacyCover).toHaveBeenLastCalledWith({ enabled: false });
    expect(document.getElementById('app-lock-off-sheet')).not.toBeNull();
  });

  it('is not offered when the phone had no screen lock when the PIN was created', async () => {
    boot({ pluginOver: { status: vi.fn(async () => ({ biometry: 'none', enrolled: false, deviceSecure: false })) } });
    await setUpPin();
    boot({ keep: true }); // the phone has a screen lock NOW — set by whoever holds it
    screen().querySelector('#app-lock-forgot').click();
    expect(screen().querySelector('#app-lock-reset')).toBeNull();
    expect(screen().querySelector('#app-lock-forgot-body').textContent).toContain("can't be reset");
    screen().querySelector('#app-lock-forgot-back').click();
    expect(title()).toBe('Enter your PIN');
  });
});

describe('changing the PIN and turning the lock off (PL-3)', () => {
  beforeEach(async () => { boot(); await setUpPin('1111'); });

  it('Change PIN asks for the current one first', async () => {
    const done = L.changePin();
    expect(title()).toBe('Enter your current PIN');
    await enter('9999');
    expect(message()).toBe('Wrong PIN');
    expect(S.getAppLock().fails).toBe(1);
    await enter('1111');
    expect(title()).toBe('Enter a new PIN');
    await enter('2222');
    await enter('2222');
    expect(await done).toBe(true);
    boot({ keep: true });
    await enter('1111');
    expect(L.isLocked()).toBe(true);
    await enter('2222');
    expect(L.isLocked()).toBe(false);
  });

  it('turning it off needs the PIN; Cancel keeps it on', async () => {
    let done = L.disable();
    screen().querySelector('#app-lock-cancel').click();
    expect(await done).toBe(false);
    expect(S.getAppLock().enabled).toBe(true);
    done = L.disable();
    await enter('1111');
    expect(await done).toBe(true);
    expect(S.getAppLock().enabled).toBe(false);
    expect(plugin.setPrivacyCover).toHaveBeenLastCalledWith({ enabled: false });
  });
});

describe('Settings → Privacy → App lock (PL-3)', () => {
  const settings = () => {
    S.dispatch('SET_VIEW', 'settings');
    const root = document.getElementById('router-view');
    root.innerHTML = V.render(S.getState());
    V.attachEvents(root, S.getState());
    return root;
  };

  it('shows one switch while off; the delay, Change PIN and the biometrics switch while on', async () => {
    boot();
    await L.status();
    let root = settings();
    expect(root.querySelector('#toggle-app-lock').checked).toBe(false);
    expect(root.querySelector('#btn-app-lock-delay')).toBeNull();
    await setUpPin();
    root = settings();
    expect(root.querySelector('#toggle-app-lock').checked).toBe(true);
    expect(root.querySelector('#toggle-app-lock-bio')).not.toBeNull();
    expect(root.querySelector('#label-app-lock-bio').textContent).toBe('Unlock with your fingerprint');
    expect(root.querySelector('#label-app-lock-delay-desc').textContent).toBe('1 minute away');
    expect(root.querySelector('#btn-app-lock-change')).not.toBeNull();
    expect(root.querySelector('.lock-hint').textContent).toContain('Hide balances');
  });

  it('the switch follows the outcome, not the tap', async () => {
    boot();
    const root = settings();
    const toggle = root.querySelector('#toggle-app-lock');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(toggle.checked).toBe(false);          // nothing saved yet
    expect(title()).toBe('Create a PIN');
    screen().querySelector('#app-lock-cancel').click();
    expect(S.getAppLock().enabled).toBe(false);
  });

  it('Lock after offers the three delays and saves the pick', async () => {
    boot();
    await setUpPin();
    const root = settings();
    root.querySelector('#btn-app-lock-delay').click();
    const items = [...document.querySelectorAll('.list-picker-item')];
    expect(items.map(i => i.textContent.trim())).toEqual(['Immediately', '1 minute away', '5 minutes away']);
    items[2].click();
    expect(S.getAppLock().delay).toBe(300);
  });

  it('no biometrics switch when the phone has none enrolled, and no row at all on the web build', async () => {
    boot({ pluginOver: { status: vi.fn(async () => ({ biometry: 'none', enrolled: false, deviceSecure: true })) } });
    await setUpPin();
    expect(settings().querySelector('#toggle-app-lock-bio')).toBeNull();
    boot({ stub: false });
    expect(settings().querySelector('#toggle-app-lock')).toBeNull();
  });
});
