// bank-connect.js — v1.05 Bank Connect client (docs/bank-connect-ux-plan.md, B2)
//
// Thin client for the Stack'd broker (docs/bank-connect-plan.md §2). Loaded
// after import.js because later phases (B3) feed fetched statements into
// Views._ImportShared. Holds NO bank data: only the broker base URL, the
// institutions cache and the helpers the hub / picker / sheets share.
//
// Two rules that keep the privacy story honest:
//  - Nothing here is called while state.bankConnect.enabled is false — the
//    master toggle is the network consent switch (D-C10). Every caller must
//    check `isEnabled(state)` before `request()`; the institutions list is
//    the only unauthenticated endpoint and is still behind the toggle.
//  - The web build has no session mode until C5, so on web the feature
//    renders its "mobile only" state unless the e2e stub is present.
//
// Test hook: `window.__STACKD_BROKER_STUB__` — when set, `request()` /
// `purchase()` / `openSca()` are delegated to it so Playwright can drive the
// flow without a network. Never set in production code.
window.BankConnect = {
  BROKER_URL: 'https://api.stackdplatform.com', // D-C11
  CLIENT_ID: 'stackd-web',
  MAX_CONNECTIONS: 3, // D-C9: one product, up to 3 banks
  // Settings-sheet options. 0 = "Maximum" (the institution's own limit).
  HISTORY_OPTIONS: [30, 90, 180, 365, 0],
  VALIDITY_OPTIONS: [90, 180],
  // GoCardless Bank Account Data coverage (EEA + UK). Alpha-2 codes; labels
  // come from Intl.DisplayNames at render time so they follow the language.
  COUNTRIES: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB'],

  _instCache: {},

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

  // ── Broker transport ──────────────────────────────────────────────────────

  async request(path, options) {
    const opts = options || {};
    const stub = this.stub();
    if (stub && typeof stub.request === 'function') return stub.request(path, opts);
    const headers = { 'Content-Type': 'application/json', 'X-Stackd-Client': this.CLIENT_ID };
    if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
    const res = await fetch(this.brokerUrl() + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) {
      const err = new Error('broker_' + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },

  // Bank picker data. Cached per country for the session: the broker caches
  // it 24h on its side, and a re-render must never refetch.
  async listInstitutions(country) {
    const c = String(country || '').toUpperCase();
    if (this._instCache[c]) return this._instCache[c];
    const list = await this.request('/v1/institutions?country=' + encodeURIComponent(c));
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

  // ── Connect leg (B3 completes the return handling) ────────────────────────

  // Per-connection agreement parameters, clamped to the institution (D-C8).
  agreementParams(state, inst) {
    const p = this.prefs(state);
    const history = p.historyDays > 0 ? Math.min(p.historyDays, inst.historyDays) : inst.historyDays;
    const validity = Math.min(p.validityDays || 180, inst.maxValidityDays || 180);
    return { historyDays: history, validityDays: validity };
  },

  async startConnect(state, inst, country) {
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
    return 'GB'; // en-US: GoCardless has no US coverage; UK is the closest English market
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
