// bank-connect.js — Bank Connect client (docs/bank-connect-ux-plan.md)
//   v1.05 B2: hub / picker / settings / paywall shell, broker transport.
//   v1.07 B3: device identity, the return leg (App Link or stackd://), account
//             mapping, the first fetch → normalizer → the statement pipeline.
//   v1.11 B7: web session mode (UX plan §16) — the deployed web build pairs
//             with the phone through a code and talks to the broker with an
//             HttpOnly cookie + CSRF header instead of a device token.
//   v1.12 B8: native wiring (UX plan §16.7) — the token adapter talks to the
//             SecureStorage plugin's real native methods; App Links / the
//             stackd:// scheme live in android/ and ios/.
//
// Thin client for the Stack'd broker (docs/bank-connect-plan.md §2). Loaded
// after import.js because fetches feed Views._ImportShared.startStatement.
// Holds NO bank data: only the broker base URL, the institutions cache and
// the helpers the hub / picker / mapping / sheets share.
//
// Rules that keep the privacy story honest:
//  - Nothing here is called while state.bankConnect.enabled is false — the
//    master toggle is the network consent switch (D-C10). Every caller must
//    check `isEnabled(state)` before `request()`.
//  - The device token never enters `stackd_v1_*` (not mirrored, not in the
//    CSV backup): native SecureStorage when a plugin is present, otherwise a
//    plain localStorage key OUTSIDE the prefix (web build / dev).
//  - On the web build the feature works only in "web session mode"
//    (`isWebSession()`: the deployed origin, or `window.__STACKD_WEB_SESSION__`
//    for local development against `wrangler dev`); otherwise it renders its
//    "mobile only" state unless the e2e stub is present. There is no web
//    payment path (D-C2/D-C3): the browser pairs with a subscribed phone.
//
// Test hook: `window.__STACKD_BROKER_STUB__` — when set, `request()` /
// `purchase()` / `openSca()` are delegated to it so Playwright can drive the
// flow without a network. Never set in production code.
window.BankConnect = {
  BROKER_URL: 'https://api-staging.stackdplatform.com', // staging: browser dev servers only (see brokerUrl)
  PROD_BROKER_URL: 'https://api.stackdplatform.com',    // v1.11 B7: what the deployed web build talks to
  WEB_ORIGIN: 'https://app.stackdplatform.com',         // v1.11 B7: the deployed web build (UX plan §16.4)
  CLIENT_ID: 'stackd-web',
  MAX_CONNECTIONS: 3, // D-C9: one product, up to 3 banks
  // Settings-sheet options. 0 = "Maximum" (the institution's own limit).
  HISTORY_OPTIONS: [30, 90, 180, 365, 0],
  VALIDITY_OPTIONS: [90, 180],
  // Aggregator coverage (EEA + UK). Alpha-2 codes; labels come from
  // Intl.DisplayNames at render time so they follow the language.
  COUNTRIES: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB'],
  // v1.09 B5 (D-C9/D-C12): one product, two plans. Ids must match Play
  // Console and App Store Connect exactly, and the broker's PRODUCT_IDS.
  PRODUCTS: { monthly: 'stackd_bank_connect_monthly', yearly: 'stackd_bank_connect_yearly' },
  PURCHASE_WAIT_MS: 3 * 60 * 1000, // the store sheet + the broker round-trip
  RESTORE_WAIT_MS: 8000,           // no approved transaction by then = nothing to restore
  _iap: null,
  TOKEN_KEY: 'stackd_device_token', // deliberately NOT stackd_v1_
  REFRESH_OVERLAP_DAYS: 7, // §4: subsequent fetches re-read a week (dedup absorbs it)
  REFRESH_AFTER_MS: 6 * 60 * 60 * 1000, // §3.10: refresh on open once the last fetch is older
  REFRESH_RECHECK_MS: 30 * 60 * 1000,   // a foreground return re-arms the check at most this often

  _instCache: {},
  _token: null,
  _resuming: null,
  _listSynced: false,
  // v1.08 B4: fetched-but-unreviewed statements, in MEMORY only (never
  // persisted — nothing lands in the store until the user confirms the
  // preview). Key = `${ref}|${bankAccountId}`.
  _pending: {},
  _refreshing: null,
  _lastRefreshCheck: 0,
  // v1.11 B7: the browser's session with the broker. undefined = not checked
  // yet this page load, null = none (pairing screen), else {ownerId, csrf,
  // active}. The cookie itself is HttpOnly — JS never sees it.
  _webSession: undefined,

  stub() {
    return window.__STACKD_BROKER_STUB__ || null;
  },

  isNative() {
    const cap = window.Capacitor;
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  },

  // v1.05: native (plus the stub); v1.11 B7: or the web build in session mode.
  isAvailable() {
    return this.isNative() || !!this.stub() || this.isWebSession();
  },

  // v1.11 B7 (UX plan §16.3): the deployed web build, or an explicit flag for
  // local development (`window.__STACKD_WEB_SESSION__ = true` with the dev
  // server pointed at `wrangler dev`, same-site on localhost).
  isWebSession() {
    if (this.isNative()) return false;
    if (window.__STACKD_WEB_SESSION__ === true) return true;
    try { return !!window.location && window.location.origin === this.WEB_ORIGIN; } catch (e) { return false; }
  },

  // v1.14: PRODUCTION is the default everywhere. Until now this returned the
  // staging host unless the origin was exactly the deployed web build, so a
  // store build would have talked to staging — open entitlement mode, sandbox
  // banks, no receipt checks. Only a browser dev server still defaults to
  // staging; the native WebView (https://localhost on Android,
  // capacitor://localhost on iOS) must never match that branch, hence the
  // isNative() guard. __STACKD_BROKER_URL__ stays the explicit dev override.
  brokerUrl() {
    if (window.__STACKD_BROKER_URL__) return window.__STACKD_BROKER_URL__;
    try {
      const origin = window.location && window.location.origin;
      if (origin && !this.isNative() && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return this.BROKER_URL;
      }
    } catch (e) { /* no location */ }
    return this.PROD_BROKER_URL;
  },

  // ── Prefs helpers (state.bankConnect, see Store._bankConnectDefaults) ─────

  prefs(state) {
    const defaults = window.Store && window.Store._bankConnectDefaults
      ? window.Store._bankConnectDefaults()
      : { enabled: false, entitlement: { active: false, expiresAt: null } };
    const p = (state && state.bankConnect) || {};
    return Object.assign(defaults, p, { entitlement: Object.assign(defaults.entitlement, p.entitlement || {}) });
  },

  isEnabled(state) {
    return !!this.prefs(state).enabled;
  },

  // The broker is the authority (D-C3); this is the cached UI gate only.
  entitlement(state) {
    const e = this.prefs(state).entitlement;
    const active = !!e.active && (!e.expiresAt || new Date(e.expiresAt).getTime() > Date.now());
    return { active, expiresAt: e.expiresAt || null };
  },

  // Consent is versioned by the English terms date, so a terms change re-shows
  // the disclosure sheet (UX plan §3.3) without a new key per revision.
  termsVersion() {
    const en = window.I18n && window.I18n.dicts && window.I18n.dicts.en;
    return (en && en['terms.updatedDate']) || '';
  },

  needsDisclosure(state) {
    const p = this.prefs(state);
    return !p.consentAt || p.consentVersion !== this.termsVersion();
  },

  // 8-char tail of the opaque owner id, for support tickets (UX plan §3.9).
  supportId(state) {
    const id = this.prefs(state).ownerId;
    return id ? String(id).slice(-8).toUpperCase() : null;
  },

  connections(state) {
    return (state && state.bankConnections) || [];
  },

  findConnection(state, ref) {
    return this.connections(state).find(c => c.ref === ref) || null;
  },

  // ── Device identity (v1.07 B3, v1.12 B8) ─────────────────────────────────

  // Native Keystore / Keychain for the device token (D-C15). The app has no
  // bundler, so a plugin's JS wrapper is never loaded: we talk to the native
  // methods on the bridge proxy directly. `@aparajita/capacitor-secure-storage`
  // exposes internalGetItem / internalSetItem / internalRemoveItem (its
  // wrapper prefixes keys with 'capacitor-storage_' and JSON-encodes values —
  // mirrored here so the wrapper would read the same item); the older
  // `capacitor-secure-storage-plugin` exposes get / set / remove natively.
  SECURE_PREFIX: 'capacitor-storage_',

  _secureStorage() {
    const cap = window.Capacitor;
    const plugins = cap && cap.Plugins;
    if (!this.isNative() || !plugins) return null;
    return plugins.SecureStorage || plugins.SecureStoragePlugin || null;
  },

  _secureKind(ss) {
    if (!ss) return null;
    if (typeof ss.internalGetItem === 'function' && typeof ss.internalSetItem === 'function') return 'aparajita';
    if (typeof ss.get === 'function' && typeof ss.set === 'function') return 'legacy';
    return null;
  },

  async _secureRead(ss, kind) {
    if (kind === 'aparajita') {
      const r = await ss.internalGetItem({ prefixedKey: this.SECURE_PREFIX + this.TOKEN_KEY });
      const raw = r && typeof r === 'object' ? r.data : r;
      if (typeof raw !== 'string' || !raw) return null;
      try {
        const v = JSON.parse(raw);
        return typeof v === 'string' && v ? v : null;
      } catch (e) {
        return raw; // not JSON: a value written by something else — take it as is
      }
    }
    const r = await ss.get({ key: this.TOKEN_KEY });
    const v = r && typeof r === 'object' ? (r.value || r.data || null) : r;
    return typeof v === 'string' && v ? v : null;
  },

  async _secureWrite(ss, kind, token) {
    if (kind === 'aparajita') {
      if (token) await ss.internalSetItem({ prefixedKey: this.SECURE_PREFIX + this.TOKEN_KEY, data: JSON.stringify(token) });
      else await ss.internalRemoveItem({ prefixedKey: this.SECURE_PREFIX + this.TOKEN_KEY });
      return;
    }
    if (token) await ss.set({ key: this.TOKEN_KEY, value: token });
    else if (typeof ss.remove === 'function') await ss.remove({ key: this.TOKEN_KEY });
    else await ss.set({ key: this.TOKEN_KEY, value: '' });
  },

  async tokenGet() {
    if (this._token) return this._token;
    const ss = this._secureStorage();
    const kind = this._secureKind(ss);
    try {
      if (kind) {
        let v = await this._secureRead(ss, kind);
        // v1.12 B8: a pre-B8 native build kept the token in localStorage —
        // move it into the keystore once, then forget the plain copy.
        if (!v) {
          const legacy = localStorage.getItem(this.TOKEN_KEY);
          if (legacy) {
            await this._secureWrite(ss, kind, legacy);
            localStorage.removeItem(this.TOKEN_KEY);
            v = legacy;
          }
        }
        this._token = v || null;
        return this._token;
      }
      const v = localStorage.getItem(this.TOKEN_KEY);
      this._token = v || null;
    } catch (e) {
      this._token = null;
    }
    return this._token;
  },

  async tokenSet(token) {
    this._token = token || null;
    const ss = this._secureStorage();
    const kind = this._secureKind(ss);
    try {
      if (kind) {
        await this._secureWrite(ss, kind, token || null);
        return;
      }
      if (token) localStorage.setItem(this.TOKEN_KEY, token);
      else localStorage.removeItem(this.TOKEN_KEY);
    } catch (e) { /* storage unavailable: the in-memory copy still serves this session */ }
  },

  async tokenClear() {
    await this.tokenSet(null);
  },

  // First contact mints the owner + device token at the broker (UX plan §3.5,
  // architecture §2). Re-used for every later call; a 401 clears it.
  async ensureDevice() {
    // v1.11 B7: a browser never mints — it pairs. No session = the pairing
    // screen; callers surface `web_unpaired` like any other broker error.
    if (this.isWebSession()) {
      if (this._webSession === undefined) await this.checkSession();
      if (!this._webSession) throw Object.assign(new Error('web_unpaired'), { code: 'web_unpaired', status: 401 });
      return null; // cookie-authenticated: there is no token to hand back
    }
    const existing = await this.tokenGet();
    if (existing) return existing;
    const res = await this.request('/v1/entitlement/verify', { method: 'POST', body: { kind: this.isNative() ? 'native' : 'web' }, auth: false });
    if (!res || !res.deviceToken) throw new Error('no_device_token');
    await this.tokenSet(res.deviceToken);
    window.Store.dispatch('SET_BANK_CONNECT_PREFS', {
      ownerId: res.ownerId || null,
      entitlement: { active: !!res.active, expiresAt: res.expiresAt || null }
    });
    return res.deviceToken;
  },

  // Re-checks the cached entitlement with the broker (open mode on staging
  // makes every device entitled; B5 sends store receipts here).
  async verifyEntitlement() {
    await this.ensureDevice();
    const res = await this.request('/v1/entitlement/verify', { method: 'POST', body: {} });
    if (res) {
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', {
        ownerId: res.ownerId || this.prefs(window.Store.getState()).ownerId,
        entitlement: { active: !!res.active, expiresAt: res.expiresAt || null }
      });
    }
    return res;
  },

  // ── Web session + pairing (v1.11 B7, UX plan §16.3) ───────────────────────

  hasWebSession() {
    return !!this._webSession;
  },

  // false only until the first /v1/session answer of this page load.
  webSessionKnown() {
    return this._webSession !== undefined;
  },

  // Native (or any identity): does this client have something to authenticate
  // with, without minting? Web: a live session; else: a stored token.
  async hasIdentity() {
    if (this.isWebSession()) {
      if (this._webSession === undefined) await this.checkSession().catch(() => null);
      return !!this._webSession;
    }
    return !!(await this.tokenGet());
  },

  _applySession(res) {
    this._webSession = { ownerId: res.ownerId || null, csrf: res.csrf || null, active: !!res.active };
    window.Store.dispatch('SET_BANK_CONNECT_PREFS', {
      ownerId: res.ownerId || null,
      entitlement: { active: !!res.active, expiresAt: res.expiresAt || null }
    });
  },

  _forgetSession() {
    this._webSession = null;
    const p = this.prefs(window.Store.getState());
    if (p.ownerId || p.entitlement.active) {
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { ownerId: null, entitlement: { active: false, expiresAt: null } });
    }
  },

  // The boot check (`GET /v1/session`): a cookie session slides another 90
  // days and hands back a fresh CSRF token. 401 = not paired (or logged out
  // elsewhere / revoked from the phone); anything else leaves the last
  // answer alone (offline).
  async checkSession() {
    if (!this.isWebSession()) return null;
    try {
      const res = await this.request('/v1/session', { auth: false });
      if (res && res.csrf) {
        this._applySession(res);
        return this._webSession;
      }
    } catch (e) {
      if (!(e && e.status === 401)) throw e;
    }
    this._forgetSession();
    return null;
  },

  // Web: the code typed on the pairing screen → a session on the phone's
  // owner. The connection list is rebuilt from the broker right away.
  async pairClaim(code) {
    const res = await this.request('/v1/pair/claim', { method: 'POST', body: { code: String(code || '') }, auth: false });
    this._applySession(res);
    this._listSynced = false;
    await this.syncConnections(window.Store.getState()).catch(() => {});
    return this._webSession;
  },

  // Native, entitled: mint a code for the "Pair a browser" sheet.
  async pairCode() {
    await this.ensureDevice();
    return this.request('/v1/pair/code', { method: 'POST', body: {} });
  },

  // Web: forget this browser at the broker and locally. The phone and its
  // connections are untouched; the local list was only ever a mirror.
  async logoutWeb() {
    try {
      await this.request('/v1/session/logout', { method: 'POST', body: {} });
    } catch (e) {
      if (!(e && (e.status === 401 || e.code === 'web_unpaired'))) throw e;
    }
    this._forgetSession();
    this.clearPending();
    this._listSynced = false;
    this.connections(window.Store.getState()).forEach(c => window.Store.dispatch('REMOVE_BANK_CONNECTION', c.ref));
    window.Store.dispatch('SET_BANK_CONNECT_PREFS', { pendingRef: null, pendingInstitution: null, pendingReplaceRef: null });
  },

  // D-C20: the paired browsers, from any device; revoke by id.
  async listDevices() {
    const res = await this.request('/v1/devices');
    return (res && res.devices) || [];
  },

  async revokeDevice(id) {
    return this.request('/v1/devices/' + encodeURIComponent(id), { method: 'DELETE' });
  },

  // ── Broker transport ──────────────────────────────────────────────────────

  async request(path, options) {
    const opts = options || {};
    const stub = this.stub();
    if (stub && typeof stub.request === 'function') return stub.request(path, opts);
    const web = this.isWebSession();
    const method = String(opts.method || 'GET').toUpperCase();
    const headers = { 'Content-Type': 'application/json', 'X-Stackd-Client': this.CLIENT_ID };
    // v1.11 B7: web = cookie (sent by the browser, never seen here) + CSRF on
    // anything that is not a GET; native = bearer.
    const token = web || opts.auth === false ? null : (opts.token || await this.tokenGet());
    if (token) headers.Authorization = 'Bearer ' + token;
    if (web && method !== 'GET' && this._webSession && this._webSession.csrf) headers['X-Stackd-CSRF'] = this._webSession.csrf;
    const init = {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      keepalive: !!opts.keepalive // factory reset revokes right before a reload
    };
    if (web) init.credentials = 'include';
    const res = await fetch(this.brokerUrl() + path, init);
    if (!res.ok) {
      let code = 'broker_' + res.status;
      try { const b = await res.json(); if (b && b.error) code = b.error; } catch (e) { /* no body */ }
      if (res.status === 401 && code === 'invalid_device_token') await this.tokenClear();
      if (web) {
        // Another tab's boot check rotated the CSRF token: pick up the new
        // one and retry once. A dead session becomes the pairing screen.
        if (res.status === 403 && (code === 'csrf_invalid' || code === 'csrf_required') && !opts._retried) {
          const s = await this.checkSession();
          if (s) return this.request(path, Object.assign({}, opts, { _retried: true }));
        }
        if (res.status === 401 && (code === 'no_session' || code === 'invalid_session' || code === 'session_expired')) {
          this._forgetSession();
          if (path !== '/v1/session') code = 'web_unpaired';
        }
      }
      const err = new Error(code);
      err.status = res.status;
      err.code = code;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  },

  // Bank picker data. Cached per country for the session: the broker caches
  // it 24h on its side, and a re-render must never refetch.
  async listInstitutions(country) {
    const c = String(country || '').toUpperCase();
    if (this._instCache[c]) return this._instCache[c];
    const list = await this.request('/v1/institutions?country=' + encodeURIComponent(c), { auth: false });
    const norm = (Array.isArray(list) ? list : []).map(i => ({
      id: i.id,
      name: i.name || i.id,
      logo: i.logo || null,
      historyDays: Number(i.transaction_total_days || i.historyDays || 90),
      maxValidityDays: Number(i.max_access_valid_for_days || i.maxValidityDays || 90)
    }));
    this._instCache[c] = norm;
    return norm;
  },

  // ── Connect leg ───────────────────────────────────────────────────────────

  // Per-connection agreement parameters, clamped to the institution (D-C8).
  agreementParams(state, inst) {
    const p = this.prefs(state);
    const history = p.historyDays > 0 ? Math.min(p.historyDays, inst.historyDays) : inst.historyDays;
    const validity = Math.min(p.validityDays || 180, inst.maxValidityDays || 180);
    return { historyDays: history, validityDays: validity };
  },

  async startConnect(state, inst, country) {
    await this.ensureDevice();
    const params = this.agreementParams(state, inst);
    const res = await this.request('/v1/connect/start', {
      method: 'POST',
      body: { country, institutionId: inst.id, historyDays: params.historyDays, validityDays: params.validityDays }
    });
    // Survives a cold start from the App Link (UX plan §3.6).
    window.Store.dispatch('SET_BANK_CONNECT_PREFS', { pendingRef: res.ref, pendingInstitution: { id: inst.id, name: inst.name, logo: inst.logo } });
    await this.openSca(res.bankRedirectUrl);
    return res;
  },

  async openSca(url) {
    const stub = this.stub();
    if (stub && typeof stub.openSca === 'function') return stub.openSca(url);
    const cap = window.Capacitor;
    const Browser = cap && cap.Plugins && cap.Plugins.Browser;
    if (this.isNative() && Browser && typeof Browser.open === 'function') {
      return Browser.open({ url });
    }
    window.location.assign(url);
  },

  async closeSca() {
    const cap = window.Capacitor;
    const Browser = cap && cap.Plugins && cap.Plugins.Browser;
    if (this.isNative() && Browser && typeof Browser.close === 'function') {
      try { await Browser.close(); } catch (e) { /* already closed */ }
    }
  },

  // The bank sends the user back through the broker: an https App Link on a
  // verified install, the stackd:// scheme from the hand-off page otherwise.
  parseReturnUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(String(url));
      const isReturn = /\/connect\/return$/.test(u.pathname) || u.host === 'connect' || u.pathname.startsWith('//connect/return') || /connect\/return/.test(String(url));
      if (!isReturn) return null;
      const ref = u.searchParams.get('ref') || u.searchParams.get('state') || '';
      return /^[0-9a-f]{16}_[0-9a-f]{16}$/.test(ref) || /^[\w-]{3,64}$/.test(ref) ? ref : null;
    } catch (e) {
      const m = /[?&](?:ref|state)=([\w-]+)/.exec(String(url));
      return m && /connect\/return/.test(String(url)) ? m[1] : null;
    }
  },

  // Entry point for appUrlOpen / getLaunchUrl (main.js) and the hub's resume.
  async handleReturn(url) {
    const state = window.Store.getState();
    const ref = this.parseReturnUrl(url) || this.prefs(state).pendingRef;
    if (!ref) return false;
    await this.closeSca();
    return this.resumeConnection(ref);
  },

  // Polls the broker for the connection's outcome (the aggregator exchange
  // happens on the return, so it is usually decided at once), records the
  // connection and routes to mapping — or shows the error sheet.
  async resumeConnection(ref) {
    if (this._resuming) return this._resuming;
    const run = async () => {
      let status = null;
      for (let i = 0; i < 6; i++) {
        status = await this.request('/v1/connect/status?ref=' + encodeURIComponent(ref));
        if (!status || status.status !== 'CR') break;
        await new Promise(r => setTimeout(r, 1500));
      }
      const clearPending = () => window.Store.dispatch('SET_BANK_CONNECT_PREFS', { pendingRef: null, pendingInstitution: null, pendingReplaceRef: null });
      if (window.Components.BankWaitingModal) window.Components.BankWaitingModal.hide();
      if (status && status.status === 'LN') {
        // v1.08 B4: a reconnect (§3.11) replaces the expired connection —
        // mappings carry over by IBAN tail / name, the old ref is revoked.
        const replaceRef = this.prefs(window.Store.getState()).pendingReplaceRef;
        clearPending();
        const rec = this.recordConnection(status, replaceRef && replaceRef !== ref ? replaceRef : null);
        if (replaceRef && replaceRef !== ref) {
          this.clearPending(replaceRef);
          window.Store.dispatch('REMOVE_BANK_CONNECTION', replaceRef);
          this.request('/v1/connections/' + encodeURIComponent(replaceRef), { method: 'DELETE' }).catch(() => {});
        }
        const allMapped = rec.accounts.length > 0 && rec.accounts.every(a => a.stackdAccountId);
        window.Router.navigate(allMapped ? '#bank-connect' : '#bank-connect-map?ref=' + encodeURIComponent(ref));
        return true;
      }
      if (status && status.status !== 'CR') clearPending();
      window.Router.navigate('#bank-connect');
      if (window.Components.BankConnectErrorModal) {
        window.Components.BankConnectErrorModal.show({ status: status ? status.status : 'RJ', institutionName: status && status.institutionName });
      }
      return false;
    };
    this._resuming = run().finally(() => { this._resuming = null; });
    return this._resuming;
  },

  // Broker connection (public shape) → local record. Existing local mappings
  // (stackdAccountId) are preserved when the same ref is re-recorded.
  recordConnection(pub, carryFromRef) {
    const state = window.Store.getState();
    const existing = this.findConnection(state, pub.ref);
    const prior = existing ? existing.accounts || [] : [];
    // v1.08 B4: on a reconnect the bank issues NEW account ids — carry the
    // old mappings over by IBAN tail, else by name + currency.
    const carry = carryFromRef ? this.findConnection(state, carryFromRef) : null;
    const carried = carry ? (carry.accounts || []) : [];
    const accounts = (pub.accounts || []).map(a => {
      const old = prior.find(x => x.bankAccountId === a.id)
        || carried.find(x => x.stackdAccountId && ((a.ibanTail && x.ibanTail === a.ibanTail) || (!a.ibanTail && a.name && x.name === a.name && x.currency === (a.currency || null))));
      return { bankAccountId: a.id, stackdAccountId: old ? old.stackdAccountId : null, ibanTail: a.ibanTail || '', currency: a.currency || null, name: a.name || null };
    });
    const rec = {
      ref: pub.ref,
      institutionId: pub.institutionId,
      institutionName: pub.institutionName,
      logo: pub.institutionLogo || null,
      accounts,
      connectedAt: existing ? existing.connectedAt : (pub.linkedAt || pub.createdAt || new Date().toISOString()),
      lastFetchAt: existing ? existing.lastFetchAt : null,
      expiresAt: pub.expiresAt || null,
      historyLimitDays: pub.historyDays || null,
      status: pub.status || 'LN'
    };
    window.Store.dispatch(existing ? 'UPDATE_BANK_CONNECTION' : 'ADD_BANK_CONNECTION', rec);
    return rec;
  },

  // Rebuilds the local list from the broker (reinstall / restored device).
  // Once per session; never while the toggle is off.
  async syncConnections(state) {
    if (this._listSynced || !this.isEnabled(state)) return;
    if (!(await this.hasIdentity())) return;
    this._listSynced = true;
    const res = await this.request('/v1/connections');
    const list = (res && res.connections) || [];
    list.filter(c => c.status === 'LN' || c.status === 'EX').forEach(c => this.recordConnection(c));
    const brokerRefs = new Set(list.map(c => c.ref));
    this.connections(window.Store.getState()).forEach(c => {
      if (!brokerRefs.has(c.ref)) window.Store.dispatch('REMOVE_BANK_CONNECTION', c.ref);
    });
  },

  async revoke(ref) {
    try {
      await this.request('/v1/connections/' + encodeURIComponent(ref), { method: 'DELETE' });
    } catch (e) {
      if (!(e && e.status === 404)) throw e;
    }
    this.clearPending(ref);
    window.Store.dispatch('REMOVE_BANK_CONNECTION', ref);
  },

  // Factory reset (§3.11): best-effort revocation of every connection at the
  // broker before the slices are wiped. `keepalive` lets the requests outlive
  // the reload that follows.
  async revokeAll(state, keepalive) {
    const refs = this.connections(state).map(c => c.ref);
    this.clearPending();
    await Promise.all(refs.map(ref => this.request('/v1/connections/' + encodeURIComponent(ref), { method: 'DELETE', keepalive: !!keepalive }).catch(() => {})));
    return refs.length;
  },

  // ── Refresh lifecycle (v1.08 B4, UX plan §3.10 / §3.11) ──────────────────

  pendingKey(ref, bankAccountId) {
    return ref + '|' + bankAccountId;
  },

  pendingFor(ref, bankAccountId) {
    return this._pending[this.pendingKey(ref, bankAccountId)] || null;
  },

  clearPending(ref) {
    Object.keys(this._pending).forEach(k => { if (!ref || k.startsWith(ref + '|')) delete this._pending[k]; });
  },

  // What the dashboard insight and the hub badges read: rows waiting for review.
  pendingSummary(state) {
    const banks = [];
    let total = 0;
    this.connections(state).forEach(conn => {
      let count = 0;
      (conn.accounts || []).forEach(a => {
        const p = this.pendingFor(conn.ref, a.bankAccountId);
        if (p && p.newCount > 0) count += p.newCount;
      });
      if (count > 0) {
        banks.push({ ref: conn.ref, name: conn.institutionName, count });
        total += count;
      }
    });
    return { total, banks };
  },

  // The rows the pipeline would actually insert (importKey dedup-aware).
  countNew(statement, stackdAccountId) {
    try {
      return window.StackdImport.buildStatementTransactions(statement, stackdAccountId).stats.ok;
    } catch (e) {
      return (statement && statement.entries ? statement.entries.length : 0);
    }
  },

  _accountsDue(state, conn, now, force) {
    if (!conn || conn.status !== 'LN') return [];
    const kind = this.connectionStatus(state, conn);
    if (kind === 'expired' || kind === 'paused' || kind === 'subscription') return [];
    const stale = force || !conn.lastFetchAt || (now - Date.parse(conn.lastFetchAt)) > this.REFRESH_AFTER_MS;
    if (!stale) return [];
    return (conn.accounts || []).filter(a => a.stackdAccountId && (force || !this.pendingFor(conn.ref, a.bankAccountId)));
  },

  async _refreshAccount(conn, a, state, now) {
    const at = new Date(now).toISOString();
    try {
      const { statement } = await this.fetchStatement(conn, a, state, now);
      const newCount = this.countNew(statement, a.stackdAccountId);
      this._pending[this.pendingKey(conn.ref, a.bankAccountId)] = { statement, newCount, fetchedAt: now };
      window.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: conn.ref, lastFetchAt: at, lastError: null, lastErrorAt: null });
      return newCount;
    } catch (e) {
      const code = (e && (e.code || e.message)) || 'fetch_failed';
      const patch = { ref: conn.ref, lastError: code, lastErrorAt: at };
      if (code === 'consent_expired') patch.status = 'EX';
      window.Store.dispatch('UPDATE_BANK_CONNECTION', patch);
      throw e;
    }
  },

  // Refresh-on-open (§3.10): every mapped account of every live connection
  // whose last fetch is older than 6h, one at a time, never auto-committing —
  // results wait in memory until the user reviews them. Never mints a device
  // and never runs while the toggle is off.
  async refreshDue(state, options) {
    const opts = options || {};
    const now = opts.now || Date.now();
    if (this._refreshing) return this._refreshing;
    if (!this.isEnabled(state) || !this.isAvailable()) return { fetched: 0, newTotal: 0, failed: 0 };
    const run = async () => {
      if (!(await this.hasIdentity())) return { fetched: 0, newTotal: 0, failed: 0 };
      let fetched = 0, newTotal = 0, failed = 0;
      for (const conn of this.connections(state)) {
        if (opts.ref && conn.ref !== opts.ref) continue;
        for (const a of this._accountsDue(state, conn, now, !!opts.force)) {
          try {
            newTotal += await this._refreshAccount(conn, a, window.Store.getState(), now);
            fetched++;
          } catch (e) {
            failed++; // recorded on the connection; keep going
          }
        }
      }
      if (fetched) window.Store.emit(); // pending lives outside state → repaint the insight/badges
      return { fetched, newTotal, failed };
    };
    this._refreshing = run().finally(() => { this._refreshing = null; });
    return this._refreshing;
  },

  refreshNow(conn, state) {
    return this.refreshDue(state, { ref: conn.ref, force: true });
  },

  // main.js: after boot (off the critical path) and on foreground returns.
  refreshOnOpen() {
    const now = Date.now();
    if (now - this._lastRefreshCheck < this.REFRESH_RECHECK_MS) return null;
    this._lastRefreshCheck = now;
    const state = window.Store.getState();
    if (!this.isEnabled(state)) return null;
    // v1.09 B5: the broker re-checks the subscription with the store when it
    // nears expiry (throttled there) — the cached gate follows it.
    // v1.11 B7: on web the boot check IS the entitlement read (the session
    // answer carries the phone's subscription) and slides the cookie.
    const check = this.isWebSession()
      ? this.checkSession().catch(() => null)
      : this.tokenGet().then(tok => (tok ? this.verifyEntitlement().catch(() => null) : null));
    if (!this.connections(state).length) return check;
    return check.then(() => this.refreshDue(window.Store.getState())).catch(() => null);
  },

  // Review from the insight / hub badge: reuse the cached statement.
  async startImportFromPending(conn, bankAccountId, state) {
    const p = this.pendingFor(conn.ref, bankAccountId);
    if (!p) return this.startImport(conn, bankAccountId, state);
    delete this._pending[this.pendingKey(conn.ref, bankAccountId)];
    return this.startImport(conn, bankAccountId, state, p.statement);
  },

  // §3.11 reconnect: a new authorization for the same institution; the
  // mappings carry over on the return (resumeConnection → recordConnection).
  async reconnect(conn, state) {
    const country = (String(conn.institutionId || '').split(':')[0] || this.countryFromLocale()).toUpperCase();
    let inst = null;
    try {
      inst = (await this.listInstitutions(country)).find(i => i.id === conn.institutionId) || null;
    } catch (e) { /* offline or unlisted: synthesize from the record */ }
    if (!inst) inst = { id: conn.institutionId, name: conn.institutionName, logo: conn.logo || null, historyDays: conn.historyLimitDays || 365, maxValidityDays: 180 };
    window.Store.dispatch('SET_BANK_CONNECT_PREFS', { pendingReplaceRef: conn.ref });
    return this.startConnect(state, inst, country);
  },

  // ── Fetch → normalize → the statement pipeline (v1.07 B3, UX plan §3.8) ──

  _isoDay(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  },

  _addDays(iso, days) {
    const t = Date.parse(iso + 'T12:00:00Z');
    return this._isoDay(t + days * 86400000);
  },

  newestImportedDate(state, stackdAccountId) {
    let newest = null;
    for (const t of (state.transactions || [])) {
      if (t.accountId === stackdAccountId && t.importKey && t.date && (!newest || t.date > newest)) newest = t.date;
    }
    return newest;
  },

  // D-C8: first fetch = historyDays back, clamped to the institution, never
  // before the day after the account's newest imported row; a one-shot
  // `importFrom` override widens/narrows it. Later fetches re-read a
  // 7-day overlap before lastFetchAt (importKeys dedup the overlap).
  fetchWindow(state, conn, stackdAccountId, now) {
    const today = this._isoDay(now || Date.now());
    const p = this.prefs(state);
    let from;
    if (p.importFrom && /^\d{4}-\d{2}-\d{2}$/.test(p.importFrom)) {
      from = p.importFrom;
    } else if (conn.lastFetchAt) {
      from = this._addDays(String(conn.lastFetchAt).slice(0, 10), -this.REFRESH_OVERLAP_DAYS);
    } else {
      const prefDays = p.historyDays > 0 ? p.historyDays : Infinity;
      const days = Math.min(prefDays, conn.historyLimitDays || prefDays, 730);
      from = this._addDays(today, -(isFinite(days) ? days : 730));
      const newest = this.newestImportedDate(state, stackdAccountId);
      if (newest) {
        const after = this._addDays(newest, 1);
        if (after > from) from = after;
      }
    }
    if (from > today) from = today;
    return { dateFrom: from, dateTo: today, overrode: !!p.importFrom };
  },

  _counterparty(t) {
    const dbit = t.credit_debit_indicator === 'DBIT';
    const party = dbit ? (t.creditor && t.creditor.name) : (t.debtor && t.debtor.name);
    return party || (dbit ? (t.debtor && t.debtor.name) : (t.creditor && t.creditor.name)) || '';
  },

  // Enable Banking transaction/balance JSON (UX plan §11) → the statement
  // shape the v1.00 pipeline consumes. Booked only (D-C4); pending rows lack
  // stable ids. Amounts are absolute + a type, like the camt/MT940 parsers.
  normalize(txJson, balJson, fallbackCurrency) {
    const list = (txJson && Array.isArray(txJson.transactions)) ? txJson.transactions : [];
    const entries = [];
    let currency = fallbackCurrency || null;
    list.forEach(t => {
      if (t.status && t.status !== 'BOOK') return;
      const amt = t.transaction_amount || {};
      const amount = Math.abs(Number(amt.amount));
      if (!isFinite(amount)) return;
      if (!currency && amt.currency) currency = amt.currency;
      const date = t.booking_date || t.value_date || t.transaction_date || '';
      const remittance = Array.isArray(t.remittance_information) ? t.remittance_information.filter(Boolean).join(' ') : (t.remittance_information || '');
      const party = this._counterparty(t);
      const btc = t.bank_transaction_code && t.bank_transaction_code.description;
      const description = [party, remittance].filter(Boolean).join(' — ') || btc || 'Bank transaction';
      const dbit = t.credit_debit_indicator === 'DBIT' || (t.credit_debit_indicator == null && Number(amt.amount) < 0);
      entries.push({
        date,
        description: String(description).replace(/\s+/g, ' ').trim().slice(0, 200),
        type: dbit ? 'expense' : 'income',
        amount,
        bankRef: String(t.entry_reference || t.transaction_id || '').trim()
      });
    });
    const balances = (balJson && Array.isArray(balJson.balances)) ? balJson.balances : [];
    const pref = ['CLBD', 'CLAV', 'ITAV', 'XPCD', 'OTHR'];
    const chosen = balances.slice().sort((a, b) => {
      const ia = pref.indexOf(String(a.balance_type || '').toUpperCase()); const ib = pref.indexOf(String(b.balance_type || '').toUpperCase());
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })[0];
    let closingBalance = null;
    if (chosen && chosen.balance_amount && isFinite(Number(chosen.balance_amount.amount))) {
      closingBalance = { amount: Number(chosen.balance_amount.amount), date: chosen.reference_date || this._isoDay(Date.now()) };
      if (!currency && chosen.balance_amount.currency) currency = chosen.balance_amount.currency;
    }
    return { format: 'connect', currency, entries, openingBalance: null, closingBalance };
  },

  async fetchStatement(conn, bankAccount, state, now) {
    await this.ensureDevice();
    const win = this.fetchWindow(state, conn, bankAccount.stackdAccountId, now);
    const q = '?date_from=' + win.dateFrom + '&date_to=' + win.dateTo;
    const [bal, tx] = await Promise.all([
      this.request('/v1/accounts/' + encodeURIComponent(bankAccount.bankAccountId) + '/balances'),
      this.request('/v1/accounts/' + encodeURIComponent(bankAccount.bankAccountId) + '/transactions' + q)
    ]);
    return { statement: this.normalize(tx, bal, bankAccount.currency), window: win };
  },

  accountLabel(conn, a) {
    const t = (k, p) => window.I18n.t(k, p);
    if (a.ibanTail) return t('bank.newAccountName', { bank: conn.institutionName, tail: a.ibanTail });
    return a.name ? `${conn.institutionName} · ${a.name}` : conn.institutionName;
  },

  // Fetch one mapped account and hand the statement to the import pipeline
  // (details step → preview → confirm → the U2 success sheet).
  async startImport(conn, bankAccountId, state, cachedStatement) {
    const a = (conn.accounts || []).find(x => x.bankAccountId === bankAccountId);
    if (!a || !a.stackdAccountId) throw new Error('unmapped_account');
    // v1.08 B4: a background refresh may already hold the statement.
    const fetched = cachedStatement
      ? { statement: cachedStatement, window: { overrode: false } }
      : await this.fetchStatement(conn, a, state);
    const statement = fetched.statement;
    const win = fetched.window;
    delete this._pending[this.pendingKey(conn.ref, bankAccountId)];
    window.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: conn.ref, lastFetchAt: new Date().toISOString(), lastError: null, lastErrorAt: null });
    if (win.overrode) window.Store.dispatch('SET_BANK_CONNECT_PREFS', { importFrom: null }); // one-shot
    const fresh = window.Store.getState();
    window.Views._ImportShared.startStatement(statement, this.accountLabel(conn, a), fresh);
    window.Views._ImportShared.draft.accountId = a.stackdAccountId; // the mapping wins over defaultAccountId
    window.Views._ImportShared.draft.connectRef = conn.ref;
    window.Router.navigate('#import-map');
    return statement;
  },

  // User-facing message for a failed fetch (UX plan §3.10 / §3.11).
  fetchErrorKey(err) {
    const code = err && (err.code || err.message) || '';
    if (code === 'account_rate_limited') return 'bank.rateLimited';
    if (code === 'consent_expired') return 'bank.consentExpiredMsg';
    if (code === 'subscription_required') return 'bank.chipSubscription';
    if (code === 'web_unpaired') return 'bank.webUnpaired'; // v1.11 B7
    return 'bank.fetchError';
  },

  // ── Entitlement (v1.09 B5, UX plan §14) ───────────────────────────────────
  // cordova-plugin-purchase (D-C12) drives the store sheet; the RECEIPT goes
  // to the broker, which asks the store and is the only judge (D-C3). The
  // client caches {active, expiresAt} for UI gating. The e2e stub replaces
  // the plugin on the web build.

  platform() {
    const cap = window.Capacitor;
    const p = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
    return p === 'ios' ? 'appstore' : (p === 'android' ? 'play' : 'web');
  },

  _storeApi() {
    const Cdv = window.CdvPurchase;
    return Cdv && Cdv.store ? Cdv : null;
  },

  storeAvailable() {
    if (this.isWebSession()) return false; // v1.11 B7: no web payment path, stub or not
    return !!this.stub() || (this.isNative() && !!this._storeApi());
  },

  // Registers the two plans once and initializes the platform. Idempotent.
  async initStore() {
    if (this._iap) return this._iap.ready;
    const Cdv = this._storeApi();
    if (!Cdv) return null;
    const { store, ProductType, Platform } = Cdv;
    const platform = this.platform() === 'appstore' ? Platform.APPLE_APPSTORE : Platform.GOOGLE_PLAY;
    const iap = { store, platform, prices: null, resolvers: [], ready: null };
    this._iap = iap;
    const products = Object.values(this.PRODUCTS).map(id => ({ id, type: ProductType.PAID_SUBSCRIPTION, platform }));
    // v1.13: Stack'd Pro (a non-consumable, docs/pro-unlock.md) rides the same
    // store session — registered here, its transactions routed to window.Pro
    // (they must NOT reach the broker, which only knows the plans).
    const Pro = window.Pro && ProductType.NON_CONSUMABLE ? window.Pro : null;
    if (Pro) products.push({ id: Pro.PRODUCT_ID, type: ProductType.NON_CONSUMABLE, platform });
    store.register(products);
    const refresh = () => { iap.prices = this._readPrices(); if (Pro) Pro._onProductUpdated(iap); };
    store.when()
      .productUpdated(refresh)
      .approved(tx => { if (Pro && Pro.ownsTransaction(tx)) Pro._onApproved(tx); else this._onApproved(tx); });
    if (typeof store.error === 'function') store.error(err => { this._settlePurchase(null, err); if (Pro) Pro._settle(null, err); });
    iap.ready = Promise.resolve(store.initialize([platform]))
      .then(() => { refresh(); return iap; })
      .catch(() => { refresh(); return iap; });
    return iap.ready;
  },

  _offerPrice(product) {
    if (!product) return null;
    if (product.pricing && product.pricing.price) return product.pricing;
    const offer = product.offers && product.offers[0];
    const phase = offer && offer.pricingPhases && offer.pricingPhases[0];
    return phase && phase.price ? phase : null;
  },

  _readPrices() {
    const iap = this._iap;
    if (!iap) return null;
    const get = (id) => { try { return iap.store.get(id, iap.platform); } catch (e) { return null; } };
    const m = this._offerPrice(get(this.PRODUCTS.monthly));
    const y = this._offerPrice(get(this.PRODUCTS.yearly));
    if (!m && !y) return null;
    let perMonth = null;
    if (y && y.priceMicros && y.currency) {
      try { perMonth = window.Store.formatCurrency(y.priceMicros / 12e6, y.currency); } catch (e) { perMonth = null; }
    }
    return { monthly: { price: m ? m.price : null }, yearly: { price: y ? y.price : null, perMonth } };
  },

  // Store prices for the paywall, or null when no store is reachable (yet).
  prices() {
    const stub = this.stub();
    if (stub && stub.prices) return stub.prices;
    return this._iap ? this._iap.prices : null;
  },

  async loadPrices() {
    if (this.stub()) return this.prices();
    const iap = await this.initStore();
    return iap ? iap.prices : null;
  },

  // What the broker needs from an approved transaction (UX plan §14).
  receiptFrom(tx) {
    const products = Array.isArray(tx.products) ? tx.products : [];
    const productId = (products[0] && products[0].id) || null;
    if (this.platform() === 'appstore') {
      return { platform: 'appstore', originalTransactionId: String(tx.originalTransactionId || tx.transactionId || ''), productId };
    }
    const np = tx.nativePurchase || {};
    return { platform: 'play', purchaseToken: String(np.purchaseToken || tx.purchaseToken || tx.purchaseId || ''), productId: productId || (Array.isArray(np.productIds) ? np.productIds[0] : null) };
  },

  async submitReceipt(receipt) {
    await this.ensureDevice();
    const res = await this.request('/v1/entitlement/verify', { method: 'POST', body: receipt });
    if (res) {
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', {
        ownerId: res.ownerId || this.prefs(window.Store.getState()).ownerId,
        entitlement: { active: !!res.active, expiresAt: res.expiresAt || null, platform: res.platform || receipt.platform, productId: res.productId || receipt.productId || null }
      });
    }
    return res;
  },

  async _onApproved(tx) {
    try {
      const res = await this.submitReceipt(this.receiptFrom(tx));
      if (res && res.active && typeof tx.finish === 'function') await tx.finish(); // acknowledge/consume only once entitled
      this._settlePurchase(res, null);
    } catch (e) {
      this._settlePurchase(null, e);
    }
  },

  _settlePurchase(res, err) {
    const rs = this._iap ? this._iap.resolvers.splice(0) : [];
    rs.forEach(r => { clearTimeout(r.timer); if (err) r.reject(err); else r.resolve(res); });
  },

  _awaitApproval(ms) {
    return new Promise((resolve, reject) => {
      const r = { resolve, reject, timer: null };
      r.timer = setTimeout(() => { this._settlePurchase(null, null); }, ms);
      this._iap.resolvers.push(r);
    });
  },

  async purchase(plan) {
    const stub = this.stub();
    if (stub && typeof stub.purchase === 'function') {
      const ent = await stub.purchase(plan);
      if (ent) window.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: ent, ownerId: ent.ownerId || this.prefs(window.Store.getState()).ownerId });
      return ent;
    }
    const iap = await this.initStore();
    if (!iap) return null;
    const product = iap.store.get(this.PRODUCTS[plan] || this.PRODUCTS.yearly, iap.platform);
    const offer = product && typeof product.getOffer === 'function' ? product.getOffer() : null;
    if (!offer) throw new Error('product_unavailable');
    const outcome = this._awaitApproval(this.PURCHASE_WAIT_MS);
    const err = await iap.store.order(offer);
    if (err) {
      const cancelled = /cancel/i.test(String(err.code || '')) || /cancel/i.test(String(err.message || ''));
      this._settlePurchase(null, cancelled ? Object.assign(new Error('cancelled'), { cancelled: true }) : new Error(err.message || 'purchase_failed'));
    }
    return outcome; // {active, expiresAt, …} from the broker, or null
  },

  async restorePurchase() {
    const stub = this.stub();
    if (stub && typeof stub.restore === 'function') {
      const ent = await stub.restore();
      if (ent) window.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: ent, ownerId: ent.ownerId || this.prefs(window.Store.getState()).ownerId });
      return ent;
    }
    const iap = await this.initStore();
    if (!iap) return null;
    const outcome = this._awaitApproval(this.RESTORE_WAIT_MS);
    await iap.store.restorePurchases();
    return outcome; // null when no transaction shows up
  },

  // ── Presentation helpers shared by views and sheets ───────────────────────

  countryFromLocale() {
    const loc = window.Store && window.Store.getLocale ? window.Store.getLocale() : 'en-US';
    const region = (loc.split('-')[1] || '').toUpperCase();
    if (this.COUNTRIES.includes(region)) return region;
    return 'GB'; // en-US: no US coverage; UK is the closest English market
  },

  _displayNames: null,
  countryLabel(code) {
    try {
      const locale = window.Store && window.Store.getLocale ? window.Store.getLocale() : 'en-US';
      if (!this._displayNames || this._displayNames.locale !== locale) {
        this._displayNames = { locale, dn: (typeof Intl !== 'undefined' && Intl.DisplayNames) ? new Intl.DisplayNames([locale], { type: 'region' }) : null };
      }
      return this._displayNames.dn ? (this._displayNames.dn.of(code) || code) : code;
    } catch (e) {
      return code;
    }
  },

  initials(name) {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || '?';
  },

  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  },

  // Logo tile (D-C14): the image sits over an initials tile and hides itself
  // on error — the listener is attached by the view, not inline.
  logoHtml(inst, size) {
    const px = size || 40;
    const initials = this.esc(this.initials(inst.name));
    const img = inst.logo
      ? `<img class="bank-logo-img" src="${this.esc(inst.logo)}" alt="" loading="lazy" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #fff;">`
      : '';
    return `<div class="bank-logo" style="position: relative; width: ${px}px; height: ${px}px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: var(--bg-surface-sunken); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: ${Math.round(px * 0.35)}px; color: var(--text-secondary);">${initials}${img}</div>`;
  },

  attachLogoFallbacks(root) {
    (root || document).querySelectorAll('.bank-logo-img').forEach(img => {
      img.addEventListener('error', () => { img.remove(); }, { once: true });
    });
  },

  formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    const locale = window.Store && window.Store.getLocale ? window.Store.getLocale() : 'en-US';
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  },

  daysUntil(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (isNaN(ms)) return null;
    return Math.ceil(ms / 86400000);
  },

  // Status chip for a connection card (UX plan §3.2).
  connectionStatus(state, conn) {
    if (!this.isEnabled(state)) return 'paused';
    if (conn.status === 'EX' || (conn.expiresAt && this.daysUntil(conn.expiresAt) <= 0)) return 'expired';
    if (!this.entitlement(state).active) return 'subscription';
    const d = this.daysUntil(conn.expiresAt);
    if (d != null && d <= 14) return 'expiring';
    return 'active';
  },

  // One-line status for the Settings row (UX plan §3.1).
  settingsSubtitle(state) {
    const t = window.I18n.t.bind(window.I18n);
    if (!this.isAvailable()) return t('bank.webOnlyDesc');
    const conns = this.connections(state);
    if (!this.isEnabled(state)) return conns.length ? t('bank.chipPaused') : t('bank.settingsDesc');
    if (this.isWebSession() && this.webSessionKnown() && !this.hasWebSession()) return t('bank.webUnpaired'); // v1.11 B7
    if (!conns.length) return t('bank.emptyTitle');
    if (conns.some(c => this.connectionStatus(state, c) === 'expired')) return t('bank.chipExpired');
    if (!this.entitlement(state).active) return t('bank.chipSubscription');
    return t('bank.statusBanks', { count: conns.length });
  }
};
