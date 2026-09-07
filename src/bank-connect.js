// bank-connect.js — Bank Connect client (docs/bank-connect-ux-plan.md)
//   v1.05 B2: hub / picker / settings / paywall shell, broker transport.
//   v1.07 B3: device identity, the return leg (App Link or stackd://), account
//             mapping, the first fetch → normalizer → the statement pipeline.
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
//  - The web build has no session mode until C5, so on web the feature
//    renders its "mobile only" state unless the e2e stub is present.
//
// Test hook: `window.__STACKD_BROKER_STUB__` — when set, `request()` /
// `purchase()` / `openSca()` are delegated to it so Playwright can drive the
// flow without a network. Never set in production code.
window.BankConnect = {
  BROKER_URL: 'https://api-staging.stackdplatform.com', // D-C11 (staging until B6; production = api.)
  CLIENT_ID: 'stackd-web',
  MAX_CONNECTIONS: 3, // D-C9: one product, up to 3 banks
  // Settings-sheet options. 0 = "Maximum" (the institution's own limit).
  HISTORY_OPTIONS: [30, 90, 180, 365, 0],
  VALIDITY_OPTIONS: [90, 180],
  // Aggregator coverage (EEA + UK). Alpha-2 codes; labels come from
  // Intl.DisplayNames at render time so they follow the language.
  COUNTRIES: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB'],
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

  stub() {
    return window.__STACKD_BROKER_STUB__ || null;
  },

  isNative() {
    const cap = window.Capacitor;
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  },

  // v1.05: native only (plus the stub) until C5 adds the web cookie session.
  isAvailable() {
    return this.isNative() || !!this.stub();
  },

  brokerUrl() {
    return window.__STACKD_BROKER_URL__ || this.BROKER_URL;
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

  // ── Device identity (v1.07 B3) ────────────────────────────────────────────

  _secureStorage() {
    const cap = window.Capacitor;
    const plugins = cap && cap.Plugins;
    if (!this.isNative() || !plugins) return null;
    // @aparajita/capacitor-secure-storage (D-C15) or capacitor-secure-storage-plugin
    return plugins.SecureStorage || plugins.SecureStoragePlugin || null;
  },

  async tokenGet() {
    if (this._token) return this._token;
    const ss = this._secureStorage();
    try {
      if (ss && typeof ss.get === 'function') {
        const r = await ss.get(ss === window.Capacitor.Plugins.SecureStoragePlugin ? { key: this.TOKEN_KEY } : this.TOKEN_KEY);
        const v = r && typeof r === 'object' ? (r.value || r.data || null) : r;
        this._token = typeof v === 'string' && v ? v : null;
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
    try {
      if (ss && typeof ss.set === 'function') {
        if (ss === window.Capacitor.Plugins.SecureStoragePlugin) await ss.set({ key: this.TOKEN_KEY, value: token || '' });
        else await ss.set(this.TOKEN_KEY, token || '');
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

  // ── Broker transport ──────────────────────────────────────────────────────

  async request(path, options) {
    const opts = options || {};
    const stub = this.stub();
    if (stub && typeof stub.request === 'function') return stub.request(path, opts);
    const headers = { 'Content-Type': 'application/json', 'X-Stackd-Client': this.CLIENT_ID };
    const token = opts.auth === false ? null : (opts.token || await this.tokenGet());
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(this.brokerUrl() + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      keepalive: !!opts.keepalive // factory reset revokes right before a reload
    });
    if (!res.ok) {
      let code = 'broker_' + res.status;
      try { const b = await res.json(); if (b && b.error) code = b.error; } catch (e) { /* no body */ }
      if (res.status === 401 && code === 'invalid_device_token') await this.tokenClear();
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
    const token = await this.tokenGet();
    if (!token) return;
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
      if (!(await this.tokenGet())) return { fetched: 0, newTotal: 0, failed: 0 };
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
    if (!this.isEnabled(state) || !this.connections(state).length) return null;
    return this.refreshDue(state).catch(() => null);
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
    return 'bank.fetchError';
  },

  // ── Entitlement (B5 wires the store plugin; the stub stands in until then) ─

  // Store prices for the paywall, or null when no store is reachable.
  prices() {
    const stub = this.stub();
    if (stub && stub.prices) return stub.prices;
    return null;
  },

  async purchase(plan) {
    const stub = this.stub();
    if (stub && typeof stub.purchase === 'function') {
      const ent = await stub.purchase(plan);
      if (ent) window.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: ent, ownerId: ent.ownerId || this.prefs(window.Store.getState()).ownerId });
      return ent;
    }
    return null; // B5: cordova-plugin-purchase → /v1/entitlement/verify
  },

  async restorePurchase() {
    const stub = this.stub();
    if (stub && typeof stub.restore === 'function') {
      const ent = await stub.restore();
      if (ent) window.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: ent, ownerId: ent.ownerId || this.prefs(window.Store.getState()).ownerId });
      return ent;
    }
    return null;
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
    if (!conns.length) return t('bank.emptyTitle');
    if (conns.some(c => this.connectionStatus(state, c) === 'expired')) return t('bank.chipExpired');
    if (!this.entitlement(state).active) return t('bank.chipSubscription');
    return t('bank.statusBanks', { count: conns.length });
  }
};
