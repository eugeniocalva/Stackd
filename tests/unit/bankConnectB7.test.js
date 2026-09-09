import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.11 Bank Connect, phase B7 (docs/bank-connect-ux-plan.md §16): web
// session mode — the deployed web build authenticates with an HttpOnly
// cookie + CSRF header, pairs with the phone through a code, and never mints
// a device of its own. Plus the native "Pair a browser" sheet.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

const CONNECTION = {
  ref: '0123456789abcdef_fedcba9876543210', status: 'LN', institutionId: 'IT:Test Bank', institutionName: 'Test Bank', institutionLogo: '',
  accounts: [{ id: 'acc_1', ibanTail: '1234', currency: 'USD', name: 'Current' }],
  historyDays: 90, validityDays: 180, createdAt: '2026-09-07T10:00:00.000Z', linkedAt: '2026-09-07T10:01:00.000Z',
  expiresAt: '2027-03-06T10:00:00.000Z', lastError: null
};

// Fake broker over the real transport. `broker.session` = what GET /v1/session
// answers (null → 401 no_session); `broker.csrf` = the token it accepts.
const boot = (opts = {}) => {
  const broker = { calls: [], session: opts.session === undefined ? null : opts.session, csrf: 'csrf-1', connections: [CONNECTION], devices: [], offline: false, claimError: null };
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  global.window = {
    // v1.15 (A-04): Bank Connect is BUILD-TIME off for the first store
    // release. These suites exercise the feature itself, so they turn it
    // on explicitly — the shipped default is covered by
    // tests/unit/bankConnectHidden.test.js.
    __STACKD_BANK_CONNECT__: true,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: memStorage(),
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#bank-connect', origin: opts.origin || 'http://localhost:3000' },
    requestAnimationFrame: (cb) => cb(),
    alert: vi.fn(),
    __STACKD_BROKER_URL__: 'https://broker.test',
    _broker: broker
  };
  if (opts.webFlag) global.window.__STACKD_WEB_SESSION__ = true;
  if (opts.native) global.window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };
  global.localStorage = global.window.localStorage;
  global.requestAnimationFrame = global.window.requestAnimationFrame;
  global.alert = global.window.alert;
  global.fetch = vi.fn(async (url, init) => {
    const path = new URL(url).pathname;
    const method = (init && init.method) || 'GET';
    const body = init && init.body ? JSON.parse(init.body) : {};
    broker.calls.push({ path, method, body, headers: init.headers, credentials: init.credentials });
    if (broker.offline) throw new TypeError('Failed to fetch');
    const res = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
    const cookieAuth = !init.headers.Authorization && init.credentials === 'include';
    if (cookieAuth && method !== 'GET' && path !== '/v1/pair/claim') {
      if (!broker.session) return res({ error: 'no_session' }, 401);
      if (!init.headers['X-Stackd-CSRF']) return res({ error: 'csrf_required' }, 403);
      if (init.headers['X-Stackd-CSRF'] !== broker.csrf) return res({ error: 'csrf_invalid' }, 403);
    }
    if (path === '/v1/session') return broker.session ? res({ ...broker.session, csrf: broker.csrf }) : res({ error: 'no_session' }, 401);
    if (path === '/v1/pair/claim') {
      if (broker.claimError) return res({ error: broker.claimError }, broker.claimError === 'code_expired' ? 410 : 400);
      broker.session = { ownerId: 'owner_phone', active: true, expiresAt: '2027-01-01T00:00:00.000Z' };
      return res({ ...broker.session, csrf: broker.csrf, sessionExpiresAt: '2026-12-06T10:00:00.000Z' }, 201);
    }
    if (path === '/v1/session/logout') { broker.session = null; return res({ ok: true }); }
    if (path === '/v1/connections') return cookieAuth && !broker.session ? res({ error: 'no_session' }, 401) : res({ connections: broker.connections });
    if (path === '/v1/entitlement/verify') return res({ ownerId: init.headers.Authorization ? 'owner_native' : 'owner_phone', deviceToken: init.headers.Authorization ? undefined : 'minted.token', active: true, expiresAt: null });
    if (path === '/v1/pair/code') return res({ code: 'ABCDEFGH', expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() }, 201);
    if (path === '/v1/devices') return res({ devices: broker.devices });
    if (path.startsWith('/v1/devices/')) { broker.devices = broker.devices.filter(d => d.id !== decodeURIComponent(path.split('/').pop())); return res({ ok: true }); }
    if (path === '/v1/connect/start') return res({ ref: 'ref_new', bankRedirectUrl: 'https://bank.example/sca' }, 201);
    return res({ error: 'unexpected ' + path }, 500);
  });
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js', 'router.js', 'export.js', 'import.js', 'bank-connect.js'].forEach(executeFile);
  global.window.Store.init();
  global.window.Router.navigate = vi.fn();
  return global.window;
};
const state = () => global.window.Store.getState();
const flush = () => new Promise(r => setTimeout(r, 0));
const renderHub = (w) => {
  const root = document.getElementById('router-view');
  root.innerHTML = w.Views.BankConnectHubView.render(state());
  w.Views.BankConnectHubView.attachEvents(root, state());
  return root;
};

describe('Bank Connect B7 (v1.11) — web session + pairing', () => {
  describe('availability and broker URL', () => {
    it('web session mode = the deployed origin or the explicit flag; never on native', () => {
      let w = boot();
      expect(w.BankConnect.isWebSession()).toBe(false);
      expect(w.BankConnect.isAvailable()).toBe(false);
      w = boot({ webFlag: true });
      expect(w.BankConnect.isWebSession()).toBe(true);
      expect(w.BankConnect.isAvailable()).toBe(true);
      expect(w.BankConnect.storeAvailable()).toBe(false); // no web payment path
      w = boot({ origin: 'https://app.stackdplatform.com' });
      expect(w.BankConnect.isWebSession()).toBe(true);
      delete w.__STACKD_BROKER_URL__;
      expect(w.BankConnect.brokerUrl()).toBe('https://api.stackdplatform.com'); // production broker for the deployed build
      w = boot({ native: true, webFlag: true });
      expect(w.BankConnect.isWebSession()).toBe(false);
    });
  });

  describe('transport', () => {
    it('sends the cookie on every call and the CSRF header on mutations only; never a bearer', async () => {
      const w = boot({ webFlag: true, session: { ownerId: 'owner_phone', active: true, expiresAt: null } });
      const BC = w.BankConnect;
      await BC.checkSession();
      expect(BC.hasWebSession()).toBe(true);
      await BC.request('/v1/connections');
      await BC.request('/v1/connect/start', { method: 'POST', body: { country: 'IT' } });
      const [sess, get, post] = w._broker.calls;
      expect(sess.credentials).toBe('include');
      expect(get.headers.Authorization).toBeUndefined();
      expect(get.headers['X-Stackd-CSRF']).toBeUndefined();
      expect(post.headers['X-Stackd-CSRF']).toBe('csrf-1');
      expect(post.credentials).toBe('include');
      expect(w.localStorage.getItem('stackd_device_token')).toBeNull();
    });

    it('a rotated CSRF token (another tab) is picked up with one retry', async () => {
      const w = boot({ webFlag: true, session: { ownerId: 'owner_phone', active: true, expiresAt: null } });
      const BC = w.BankConnect;
      await BC.checkSession();
      w._broker.csrf = 'csrf-2';
      const res = await BC.request('/v1/connect/start', { method: 'POST', body: {} });
      expect(res.ref).toBe('ref_new');
      const paths = w._broker.calls.map(c => c.path);
      expect(paths).toEqual(['/v1/session', '/v1/connect/start', '/v1/session', '/v1/connect/start']);
      expect(w._broker.calls[3].headers['X-Stackd-CSRF']).toBe('csrf-2');
    });

    it('no session: ensureDevice throws web_unpaired and never mints; the cached entitlement is dropped', async () => {
      const w = boot({ webFlag: true });
      const BC = w.BankConnect;
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { ownerId: 'stale', entitlement: { active: true, expiresAt: null } });
      await expect(BC.ensureDevice()).rejects.toMatchObject({ code: 'web_unpaired' });
      expect(w._broker.calls.map(c => c.path)).toEqual(['/v1/session']);
      expect(BC.webSessionKnown()).toBe(true);
      expect(BC.hasWebSession()).toBe(false);
      expect(state().bankConnect.ownerId).toBeNull();
      expect(state().bankConnect.entitlement.active).toBe(false);
      await expect(BC.startConnect(state(), { id: 'IT:X', name: 'X', historyDays: 90, maxValidityDays: 90 }, 'IT')).rejects.toMatchObject({ code: 'web_unpaired' });
      expect(BC.fetchErrorKey({ code: 'web_unpaired' })).toBe('bank.webUnpaired');
    });

    it('a session that dies mid-way (revoked from the phone) becomes web_unpaired on the next mutation', async () => {
      const w = boot({ webFlag: true, session: { ownerId: 'owner_phone', active: true, expiresAt: null } });
      const BC = w.BankConnect;
      await BC.checkSession();
      w._broker.session = null;
      await expect(BC.request('/v1/connect/start', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'web_unpaired', status: 401 });
      expect(BC.hasWebSession()).toBe(false);
    });

    it('offline: the boot check keeps the last answer instead of showing the pairing screen', async () => {
      const w = boot({ webFlag: true, session: { ownerId: 'owner_phone', active: true, expiresAt: null } });
      const BC = w.BankConnect;
      await BC.checkSession();
      w._broker.offline = true;
      await expect(BC.checkSession()).rejects.toBeInstanceOf(TypeError);
      expect(BC.hasWebSession()).toBe(true);
    });

    it('refreshOnOpen on web runs the session check (a GET), not the POST entitlement verify', async () => {
      const w = boot({ webFlag: true, session: { ownerId: 'owner_phone', active: true, expiresAt: '2027-01-01T00:00:00.000Z' } });
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      await w.BankConnect.refreshOnOpen();
      expect(w._broker.calls.map(c => c.path + ' ' + c.method)).toEqual(['/v1/session GET']);
      expect(state().bankConnect).toMatchObject({ ownerId: 'owner_phone', entitlement: { active: true, expiresAt: '2027-01-01T00:00:00.000Z' } });
    });
  });

  describe('pairing and logout', () => {
    it('pairClaim posts the code, adopts the session and rebuilds the list from the broker', async () => {
      const w = boot({ webFlag: true });
      const BC = w.BankConnect;
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      const s = await BC.pairClaim('abcd efgh');
      expect(s).toMatchObject({ ownerId: 'owner_phone', csrf: 'csrf-1', active: true });
      const claim = w._broker.calls.find(c => c.path === '/v1/pair/claim');
      expect(claim.body).toEqual({ code: 'abcd efgh' }); // the broker normalizes
      expect(claim.headers.Authorization).toBeUndefined();
      expect(w._broker.calls.map(c => c.path)).toContain('/v1/connections');
      expect(state().bankConnections).toHaveLength(1);
      expect(state().bankConnections[0]).toMatchObject({ ref: CONNECTION.ref, institutionName: 'Test Bank' });
      expect(state().bankConnect.ownerId).toBe('owner_phone');
      expect(BC.entitlement(state()).active).toBe(true);
    });

    it('logoutWeb posts with the CSRF header, then forgets the session, the mirrored list and the entitlement', async () => {
      const w = boot({ webFlag: true });
      const BC = w.BankConnect;
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, pendingRef: 'x' });
      await BC.pairClaim('ABCDEFGH');
      BC._pending['k|a'] = { newCount: 1 };
      await BC.logoutWeb();
      const out = w._broker.calls.find(c => c.path === '/v1/session/logout');
      expect(out.headers['X-Stackd-CSRF']).toBe('csrf-1');
      expect(BC.hasWebSession()).toBe(false);
      expect(state().bankConnections).toEqual([]);
      expect(state().bankConnect).toMatchObject({ enabled: true, ownerId: null, pendingRef: null, entitlement: { active: false } });
      expect(BC._pending).toEqual({});
      expect(BC._listSynced).toBe(false);
    });

    it('native: pairCode mints a device first, then asks for a code; devices can be listed and revoked', async () => {
      const w = boot({ native: true });
      const BC = w.BankConnect;
      w._broker.devices = [{ id: '0011223344556677', kind: 'web', label: 'Chrome · Windows', createdAt: '2026-09-07T10:00:00.000Z', current: false }];
      const code = await BC.pairCode();
      expect(code.code).toBe('ABCDEFGH');
      expect(w._broker.calls.map(c => c.path)).toEqual(['/v1/entitlement/verify', '/v1/pair/code']);
      expect(w._broker.calls[1].headers.Authorization).toBe('Bearer minted.token');
      expect(w._broker.calls[1].credentials).toBeUndefined();
      expect(await BC.listDevices()).toHaveLength(1);
      await BC.revokeDevice('0011223344556677');
      expect(await BC.listDevices()).toEqual([]);
    });
  });

  describe('hub (web build)', () => {
    it('toggle on + unknown session → checking card, then the pairing screen; the add CTA stays hidden', async () => {
      const w = boot({ webFlag: true });
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      let root = renderHub(w);
      expect(root.querySelector('#bank-pair-checking')).not.toBeNull();
      expect(root.querySelector('#bank-add').hidden).toBe(true);
      await flush();
      root = renderHub(w);
      expect(root.querySelector('#bank-pair')).not.toBeNull();
      expect(root.querySelector('#bank-mobile-only')).toBeNull();
      expect(root.querySelector('#bank-add').hidden).toBe(true);
      expect(root.querySelector('#bank-open-settings')).not.toBeNull();
      expect(w.BankConnect.settingsSubtitle(state())).toBe('Pair this browser with your phone to use it here.');
    });

    it('toggle off keeps the explainer (consent comes before any network call)', () => {
      const w = boot({ webFlag: true });
      const root = renderHub(w);
      expect(root.querySelector('#bank-explainer')).not.toBeNull();
      expect(root.querySelector('#bank-pair')).toBeNull();
      expect(w._broker.calls).toEqual([]);
    });

    it('the pairing form validates length locally, maps broker errors to copy, and pairs on success', async () => {
      const w = boot({ webFlag: true });
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      renderHub(w);
      await flush();
      let root = renderHub(w);
      const input = root.querySelector('#bank-pair-code');
      const btn = root.querySelector('#bank-pair-submit');
      input.value = 'abc';
      btn.click();
      expect(root.querySelector('#bank-pair-error').textContent).toBe('That code isn’t valid. Check it and try again.');
      expect(w._broker.calls.some(c => c.path === '/v1/pair/claim')).toBe(false);

      w._broker.claimError = 'code_expired';
      input.value = 'abcd-efgh';
      btn.click();
      await flush();
      expect(root.querySelector('#bank-pair-error').textContent).toBe('That code has expired. Get a new one on your phone.');
      expect(btn.disabled).toBe(false);

      w._broker.claimError = 'invalid_code';
      btn.click();
      await flush();
      expect(root.querySelector('#bank-pair-error').textContent).toBe('That code isn’t valid. Check it and try again.');

      w._broker.claimError = null;
      btn.click();
      await flush();
      await flush();
      expect(w._broker.calls.find(c => c.path === '/v1/pair/claim').body).toEqual({ code: 'ABCDEFGH' });
      root = renderHub(w);
      expect(root.querySelector('#bank-pair')).toBeNull();
      expect(root.querySelector('#bank-conn-list')).not.toBeNull();
      expect(root.querySelector('#bank-add').hidden).toBe(false);
    });

    it('a paired browser resumes a pending web return like native does', async () => {
      const w = boot({ webFlag: true, session: { ownerId: 'owner_phone', active: true, expiresAt: null } });
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, pendingRef: CONNECTION.ref });
      const BC = w.BankConnect;
      BC.resumeConnection = vi.fn(async () => true);
      renderHub(w);
      await flush();
      renderHub(w);
      expect(BC.resumeConnection).toHaveBeenCalledWith(CONNECTION.ref);
    });
  });

  describe('sheets', () => {
    it('paywall on web: no store buttons, the copy points at the phone, Pair goes to the hub', () => {
      const w = boot({ webFlag: true });
      w.Components.PaywallModal.show({ bankName: 'Test Bank' });
      const sheet = document.getElementById('bank-paywall');
      expect(sheet.querySelector('#bank-paywall-subscribe')).toBeNull();
      expect(sheet.querySelector('#bank-paywall-restore')).toBeNull();
      expect(sheet.querySelector('#bank-paywall-web').textContent).toContain('Subscribe on your phone');
      sheet.querySelector('#bank-paywall-pair').click();
      expect(w.Router.navigate).toHaveBeenCalledWith('#bank-connect');
      // Already paired (phone not subscribed): no Pair button.
      w.BankConnect._webSession = { ownerId: 'x', csrf: 'c', active: false };
      w.Components.PaywallModal.show({});
      expect(document.getElementById('bank-paywall').querySelector('#bank-paywall-pair')).toBeNull();
    });

    it('settings on web: a Log out row instead of Restore; confirming logs out', async () => {
      const w = boot({ webFlag: true });
      await w.BankConnect.pairClaim('ABCDEFGH');
      w.Components.BankSettingsModal.show();
      const sheet = document.getElementById('bank-settings-modal');
      expect(sheet.querySelector('#bank-set-restore')).toBeNull();
      expect(sheet.querySelector('#bank-set-pair')).toBeNull();
      sheet.querySelector('#bank-set-logout').click();
      await new Promise(r => setTimeout(r, 350));
      const confirm = document.getElementById('active-modal');
      expect(confirm.textContent).toContain('Your banks stay connected on your phone');
      confirm.querySelector('#modal-save-btn').click();
      await flush();
      expect(w._broker.calls.some(c => c.path === '/v1/session/logout')).toBe(true);
      expect(w.BankConnect.hasWebSession()).toBe(false);
    });

    it('settings on native: Pair a browser (entitled only) with the paired list and Remove', async () => {
      const w = boot({ native: true });
      w.Components.BankSettingsModal.show();
      expect(document.getElementById('bank-settings-modal').querySelector('#bank-set-pair')).toBeNull(); // not entitled yet
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: { active: true, expiresAt: null } });
      w.localStorage.setItem('stackd_device_token', 'dev.token');
      w._broker.devices = [{ id: '0011223344556677', kind: 'web', label: 'Firefox · macOS', createdAt: '2026-09-07T10:00:00.000Z', current: false }];
      w.Components.BankSettingsModal.show();
      const sheet = document.getElementById('bank-settings-modal');
      expect(sheet.querySelector('#bank-set-restore')).not.toBeNull();
      expect(sheet.querySelector('#bank-set-logout')).toBeNull();
      await flush();
      expect(sheet.querySelector('#bank-set-devices').textContent).toContain('Firefox · macOS');
      sheet.querySelector('.bank-device-remove').click();
      await flush();
      expect(sheet.querySelector('#bank-set-devices').textContent).toContain('No browser is paired.');
      expect(w._broker.calls.some(c => c.path === '/v1/devices/0011223344556677' && c.method === 'DELETE')).toBe(true);

      sheet.querySelector('#bank-set-pair').click();
      await new Promise(r => setTimeout(r, 350));
      const code = document.getElementById('bank-pair-code-modal');
      expect(code.querySelector('#bank-pair-code-value').textContent).toBe('ABCD EFGH');
      expect(code.querySelector('#bank-pair-code-countdown').textContent).toMatch(/^Expires in [45]:\d\d$/);
      code.querySelector('#bank-pair-code-done').click();
    });
  });
});
