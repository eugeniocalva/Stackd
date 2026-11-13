// 1.3.0 (PL-3, docs/privacy-currencies-plan.md §4): App lock.
//
// A 4-digit PIN of the app's own, with the phone's biometrics as an optional
// shortcut. The lock is a SCREEN GATE, not encryption: the data on disk is
// what it was before. State lives in the store (`appLock`, SET_APP_LOCK); the
// PIN is never stored — only its PBKDF2-SHA-256 hash and salt.
//
//   boot()   main.js, after Store.init() and before the first render: when
//            the lock is on, #app-lock is up before any figure is drawn.
//   ready()  main.js, once the splash is gone: the biometric prompt.
//   Leaving and coming back: 'pause' / 'resume' (and visibilitychange) stamp
//   the moment the app left; a return after `delay` seconds locks. A plain
//   cover hides the content while the app is away, so nothing shows in the
//   frame the phone draws before this code runs again.
//   enable() / changePin() / disable() / setBiometrics() are the Settings
//   flows; they run in the same screen in 'setup' mode, with a Cancel.
//   handleBack() is asked first by Router.handleBack (Android Back).
//
// Native half: Capacitor.Plugins.StackdPrivacy (plugins/stackd-privacy) —
// status(), authenticate(), setPrivacyCover(). Tests and the web dev server
// reach the feature through window.__STACKD_LOCK_STUB__ (same three methods).
// The web build has no App lock (A1): a browser-only PIN is bypassed from the
// developer tools.
window.AppLock = {
  PIN_LENGTH: 4,
  ITERATIONS: 150000,
  FREE_TRIES: 4,                 // the 5th wrong PIN starts the first wait
  WAITS: [30, 60, 300, 900],     // seconds: 5th, 6th, 7th, then every later one
  RECENT_MS: 1500,               // a system prompt of ours just closed

  _booted: false,
  _mode: null,                   // null | 'locked' | 'setup'
  _view: 'pin',                  // 'pin' | 'forgot'
  _el: null,
  _cover: null,
  _entry: '',
  _busy: false,
  _msg: '',
  _flow: null,                   // setup: { kind, step, first, resolve }
  _leftAt: null,
  _authBusy: false,
  _authEndedAt: 0,
  _bioPrompted: false,
  _status: null,
  _timer: null,
  _keyHandler: null,

  // ── environment ──────────────────────────────────────────────────────────
  _plugin() {
    if (window.__STACKD_LOCK_STUB__) return window.__STACKD_LOCK_STUB__;
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    const p = cap.Plugins && cap.Plugins.StackdPrivacy;
    return p && typeof p.authenticate === 'function' ? p : null;
  },
  _subtle() {
    const c = window.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    return c && c.subtle && typeof c.getRandomValues === 'function' ? c : null;
  },
  _platform() {
    const cap = window.Capacitor;
    return cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';
  },
  _t(key, params) { return window.I18n.t(key, params); },
  // The Settings row shows only where the lock can do its whole job.
  available() { return !!this._plugin() && !!this._subtle(); },
  isLocked() { return this._mode === 'locked'; },
  isOpen() { return !!this._mode; },
  config() { return window.Store.getAppLock(); },

  // ── the phone's biometrics ───────────────────────────────────────────────
  _normalizeStatus(r) {
    const kinds = ['fingerprint', 'face', 'iris', 'generic'];
    const src = r && typeof r === 'object' ? r : {};
    return {
      biometry: kinds.includes(src.biometry) ? src.biometry : 'none',
      enrolled: src.enrolled === true,
      deviceSecure: src.deviceSecure === true
    };
  },
  cachedStatus() { return this._status || this._normalizeStatus(null); },
  async status() {
    const p = this._plugin();
    let next = this._normalizeStatus(null);
    if (p && typeof p.status === 'function') {
      try { next = this._normalizeStatus(await p.status()); } catch (e) { /* none */ }
    }
    this._status = next;
    return next;
  },
  // Settings: re-read, and redraw the card when the answer moved (a
  // fingerprint enrolled in the phone's settings while the app was away).
  async refreshStatus() {
    const before = JSON.stringify(this.cachedStatus());
    const after = await this.status();
    if (JSON.stringify(after) !== before && window.Store.getState().activeView === 'settings') window.Store.emit();
    return after;
  },
  bioLabelKey(status) {
    const st = status || this.cachedStatus();
    const ios = this._platform() === 'ios';
    if (st.biometry === 'face') return ios ? 'lock.bioFaceId' : 'lock.bioFace';
    if (st.biometry === 'fingerprint') return ios ? 'lock.bioTouchId' : 'lock.bioFingerprint';
    return 'lock.bioGeneric';
  },
  bioIcon(status) {
    return (status || this.cachedStatus()).biometry === 'face' ? 'scan-face' : 'fingerprint';
  },
  // One system prompt at a time; never rejects. While it is up (and just
  // after) the app's own pause / resume must not count as leaving.
  async _authenticate(opts) {
    const p = this._plugin();
    if (!p || this._authBusy) return { ok: false, code: 'unavailable' };
    this._authBusy = true;
    let r;
    try { r = await p.authenticate(opts); } catch (e) { r = { ok: false, code: 'failed' }; }
    this._authBusy = false;
    this._authEndedAt = Date.now();
    return r && typeof r === 'object' ? r : { ok: false, code: 'failed' };
  },
  _recent() { return Date.now() - this._authEndedAt < this.RECENT_MS; },
  _syncCover(on) {
    const p = this._plugin();
    try {
      if (p && typeof p.setPrivacyCover === 'function') Promise.resolve(p.setPrivacyCover({ enabled: !!on })).catch(() => {});
    } catch (e) { /* cosmetic */ }
  },

  // ── PIN hashing ──────────────────────────────────────────────────────────
  _hex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); },
  _bytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  },
  async _derive(pin, saltHex, iter) {
    const c = this._subtle();
    const raw = Uint8Array.from(String(pin), ch => ch.charCodeAt(0)); // digits: one byte each
    const key = await c.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveBits']);
    const bits = await c.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: this._bytes(saltHex), iterations: iter }, key, 256);
    return this._hex(new Uint8Array(bits));
  },
  async _record(pin) {
    const c = this._subtle();
    const salt = this._hex(c.getRandomValues(new Uint8Array(16)));
    return { salt, iter: this.ITERATIONS, hash: await this._derive(pin, salt, this.ITERATIONS) };
  },
  // A wrong PIN counts wherever it is typed (the lock screen, Change PIN,
  // turning the lock off): the 5th starts a wait. Returns true when right.
  async _check(pin) {
    const cfg = this.config();
    if (!cfg.enabled) return false;
    let ok = false;
    try { ok = (await this._derive(pin, cfg.salt, cfg.iter)) === cfg.hash; } catch (e) { ok = false; }
    if (ok) {
      if (cfg.fails || cfg.lockedUntil) window.Store.dispatch('SET_APP_LOCK', { fails: 0, lockedUntil: 0 });
      return true;
    }
    const fails = cfg.fails + 1;
    const over = fails - this.FREE_TRIES;
    const wait = over > 0 ? this.WAITS[Math.min(over - 1, this.WAITS.length - 1)] : 0;
    window.Store.dispatch('SET_APP_LOCK', { fails, lockedUntil: wait ? Date.now() + wait * 1000 : 0 });
    return false;
  },
  _waitLeft() {
    return Math.max(0, Math.ceil((this.config().lockedUntil - Date.now()) / 1000));
  },
  _clock(seconds) {
    const m = Math.floor(seconds / 60);
    return m + ':' + String(seconds % 60).padStart(2, '0');
  },

  // ── boot and the app's comings and goings ────────────────────────────────
  boot() {
    if (this._booted) return;
    this._booted = true;
    const cfg = this.config();
    this._syncCover(cfg.enabled);
    // The PIN alone can be checked without the plugin, so a stored lock
    // always holds; only its biometric and Forgot PIN halves need the plugin.
    if (cfg.enabled && this._subtle()) this.lock({ prompt: false });
    this._wireLifecycle();
    // the lock screen was drawn before the phone said what it has: give the
    // biometric key its real name and icon once it answers
    this.status().then(() => this._refreshBioKey());
  },
  ready() {
    if (this.isLocked()) this._autoBiometrics();
  },
  _wireLifecycle() {
    const doc = window.document || document;
    const left = () => {
      if (this._authBusy || this._recent()) return;
      const cfg = this.config();
      if (!cfg.enabled) return;
      if (this._leftAt == null) this._leftAt = Date.now();
      if (this.isLocked()) return;
      if (cfg.delay === 0) this.lock({ prompt: false });
      else this._showCover();
    };
    const back = () => {
      if (this._authBusy) return;
      const cfg = this.config();
      const leftAt = this._leftAt;
      this._leftAt = null;
      if (!cfg.enabled) { this._hideCover(); return; }
      if (this.isLocked()) { this._hideCover(); this._paint(); this._autoBiometrics(); return; }
      if (leftAt != null && !this._recent() && Date.now() - leftAt >= cfg.delay * 1000) this.lock();
      this._hideCover();
      if (!this.isLocked()) this.refreshStatus();
    };
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', () => (doc.visibilityState === 'hidden' ? left() : back()));
    }
    const cap = window.Capacitor;
    const app = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && cap.Plugins && cap.Plugins.App;
    if (app && typeof app.addListener === 'function') {
      app.addListener('pause', left);
      app.addListener('resume', back);
    }
    this._left = left;   // tests drive the two edges directly
    this._back = back;
  },
  _showCover() {
    if (this._cover || this._el) return;
    const el = document.createElement('div');
    el.id = 'app-lock-cover';
    el.className = 'app-lock app-lock--cover';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    this._cover = el;
  },
  _hideCover() {
    if (this._cover) this._cover.remove();
    this._cover = null;
  },

  // ── the screen ───────────────────────────────────────────────────────────
  lock(opts) {
    if (this._mode === 'locked') return;
    if (this._mode === 'setup') this._endFlow(false);
    this._mode = 'locked';
    this._view = 'pin';
    this._entry = '';
    this._msg = '';
    this._bioPrompted = false;
    this._mount();
    this._render();
    if (!opts || opts.prompt !== false) this._autoBiometrics();
  },
  _unlock() {
    this._mode = null;
    this._leftAt = null;
    this._authEndedAt = Date.now();
    this._unmount();
  },
  _mount() {
    if (this._el) return;
    this._hideCover();
    const el = document.createElement('div');
    el.id = 'app-lock';
    el.className = 'app-lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'app-lock-title');
    document.body.appendChild(el);
    // everything underneath is out of reach: pointer, keyboard, screen reader
    const app = document.getElementById('app');
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') active.blur();
    if (app) app.setAttribute('inert', '');
    el.addEventListener('click', (e) => this._onClick(e));
    this._keyHandler = (e) => this._onKey(e);
    document.addEventListener('keydown', this._keyHandler, true);
    this._el = el;
  },
  _unmount() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler, true);
    this._keyHandler = null;
    if (this._el) this._el.remove();
    this._el = null;
    const app = document.getElementById('app');
    if (app) app.removeAttribute('inert');
  },
  _titleKey() {
    if (this._mode === 'locked') return 'lock.enterTitle';
    const f = this._flow || {};
    if (f.step === 'current') return 'lock.currentTitle';
    if (f.step === 'repeat') return 'lock.repeatTitle';
    return f.kind === 'change' ? 'lock.newTitle' : 'lock.createTitle';
  },
  _subKey() {
    if (this._mode === 'locked') return 'lock.enterSub';
    const f = this._flow || {};
    if (f.step === 'current') return f.kind === 'disable' ? 'lock.currentSubOff' : 'lock.currentSub';
    if (f.step === 'repeat') return 'lock.repeatSub';
    return 'lock.createSub';
  },
  // Biometrics unlock the lock screen and stand in for the current PIN when
  // the lock is turned off; a new PIN is always typed.
  _bioOffered() {
    const cfg = this.config();
    if (!cfg.enabled || !cfg.biometrics || !this._plugin()) return false;
    if (this._mode === 'locked') return true;
    return !!this._flow && this._flow.kind === 'disable' && this._flow.step === 'current';
  },
  _render() {
    if (!this._el) return;
    const t = (k, p) => this._t(k, p);
    const esc = window.I18n.esc;
    if (this._view === 'forgot') { this._renderForgot(); return; }
    const key = (d) => `<button type="button" class="app-lock-key" data-key="${d}">${d}</button>`;
    const bio = this._bioOffered()
      ? `<button type="button" class="app-lock-key app-lock-key--icon" id="app-lock-bio" aria-label="${esc(t(this.bioLabelKey()))}"><i data-lucide="${this.bioIcon()}" aria-hidden="true"></i></button>`
      : '<span class="app-lock-key app-lock-key--gap" aria-hidden="true"></span>';
    const dots = Array.from({ length: this.PIN_LENGTH }, () => '<span class="app-lock-dot"></span>').join('');
    const foot = this._mode === 'locked'
      ? `<button type="button" class="app-lock-link" id="app-lock-forgot">${t('lock.forgot')}</button>`
      : `<button type="button" class="app-lock-link" id="app-lock-cancel" data-back-dismiss>${t('common.cancel')}</button>`;
    this._el.innerHTML = `
      <div class="app-lock-inner">
        <div class="app-lock-head">
          <div class="app-lock-badge" aria-hidden="true"><i data-lucide="lock"></i></div>
          <h1 class="app-lock-title" id="app-lock-title" tabindex="-1">${t(this._titleKey())}</h1>
          <p class="app-lock-sub" id="app-lock-sub">${t(this._subKey())}</p>
          <div class="app-lock-dots" id="app-lock-dots" role="img">${dots}</div>
          <p class="app-lock-msg" id="app-lock-msg" role="alert"></p>
        </div>
        <div class="app-lock-pad" id="app-lock-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('')}
          ${bio}
          ${key(0)}
          <button type="button" class="app-lock-key app-lock-key--icon" data-key="back" aria-label="${esc(t('lock.deleteDigit'))}"><i data-lucide="delete" aria-hidden="true"></i></button>
        </div>
        <div class="app-lock-foot">${foot}</div>
      </div>`;
    if (window.StackdHydrateIcons) window.StackdHydrateIcons(this._el);
    this._paint();
    const title = this._el.querySelector('#app-lock-title');
    if (title && typeof title.focus === 'function') title.focus({ preventScroll: true });
  },
  _renderForgot() {
    const t = (k, p) => this._t(k, p);
    const cfg = this.config();
    const canReset = cfg.deviceSecureAtSetup && !!this._plugin();
    this._el.innerHTML = `
      <div class="app-lock-inner app-lock-inner--text">
        <div class="app-lock-head">
          <div class="app-lock-badge" aria-hidden="true"><i data-lucide="lock"></i></div>
          <h1 class="app-lock-title" id="app-lock-title" tabindex="-1">${t('lock.forgotTitle')}</h1>
          <p class="app-lock-body" id="app-lock-forgot-body">${t(canReset ? 'lock.forgotBody' : 'lock.forgotNoReset')}</p>
          <p class="app-lock-msg" id="app-lock-msg" role="alert"></p>
        </div>
        <div class="app-lock-actions">
          ${canReset ? `<button type="button" class="btn btn-primary" id="app-lock-reset">${t('lock.forgotUse')}</button>` : ''}
          <button type="button" class="btn btn-secondary" id="app-lock-forgot-back" data-back-dismiss>${t('lock.backToPin')}</button>
        </div>
      </div>`;
    if (window.StackdHydrateIcons) window.StackdHydrateIcons(this._el);
    const title = this._el.querySelector('#app-lock-title');
    if (title && typeof title.focus === 'function') title.focus({ preventScroll: true });
  },
  _refreshBioKey() {
    const key = this._el && this._el.querySelector('#app-lock-bio');
    if (!key) return;
    key.setAttribute('aria-label', this._t(this.bioLabelKey()));
    key.innerHTML = `<i data-lucide="${this.bioIcon()}" aria-hidden="true"></i>`;
    if (window.StackdHydrateIcons) window.StackdHydrateIcons(this._el);
  },
  // Dots, message and the keys' state — without touching focus.
  _paint() {
    if (!this._el || this._view !== 'pin') return;
    const n = this._entry.length;
    const dots = this._el.querySelector('#app-lock-dots');
    if (dots) {
      dots.setAttribute('aria-label', this._t('lock.dots', { n, total: this.PIN_LENGTH }));
      Array.from(dots.children).forEach((d, i) => d.classList.toggle('is-on', i < n));
    }
    const wait = this._waitLeft();
    const msg = this._el.querySelector('#app-lock-msg');
    const text = wait ? this._t('lock.wait', { time: this._clock(wait) }) : this._msg;
    if (msg && msg.textContent !== text) msg.textContent = text;
    this._el.querySelectorAll('.app-lock-key[data-key]').forEach(b => { b.disabled = !!wait || this._busy; });
    if (wait && !this._timer) {
      this._timer = setInterval(() => {
        if (!this._waitLeft()) { clearInterval(this._timer); this._timer = null; this._msg = ''; }
        this._paint();
      }, 500);
    }
  },
  _say(key) {
    this._msg = key ? this._t(key) : '';
    this._paint();
  },

  // ── input ────────────────────────────────────────────────────────────────
  _onClick(e) {
    const el = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!el || el.disabled) return;
    if (el.dataset.key === 'back') { this._digit('back'); return; }
    if (el.dataset.key != null) { this._digit(el.dataset.key); return; }
    if (el.id === 'app-lock-bio') { this._bioTap(); return; }
    if (el.id === 'app-lock-forgot') { this._view = 'forgot'; this._render(); return; }
    if (el.id === 'app-lock-forgot-back') { this._view = 'pin'; this._entry = ''; this._msg = ''; this._render(); return; }
    if (el.id === 'app-lock-reset') { this._resetWithPhoneLock(); return; }
    if (el.id === 'app-lock-cancel') { this._endFlow(false); }
  },
  _onKey(e) {
    if (!this._mode || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this._view !== 'pin') return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); this._digit(e.key); return; }
    if (e.key === 'Backspace') { e.preventDefault(); this._digit('back'); return; }
    if (e.key === 'Escape' && this._mode === 'setup') { e.preventDefault(); this._endFlow(false); }
  },
  _haptic() {
    const H = window.Components && window.Components.Haptics;
    if (H && typeof H.light === 'function') H.light();
  },
  _digit(d) {
    if (this._busy || this._view !== 'pin' || this._waitLeft()) return;
    if (d === 'back') {
      if (!this._entry) return;
      this._entry = this._entry.slice(0, -1);
    } else {
      if (this._entry.length >= this.PIN_LENGTH) return;
      this._entry += d;
      this._msg = '';
    }
    this._haptic();
    this._paint();
    if (this._entry.length === this.PIN_LENGTH) this._submit();
  },
  _wrongShake() {
    const dots = this._el && this._el.querySelector('#app-lock-dots');
    if (!dots) return;
    dots.classList.remove('is-wrong');
    void dots.offsetWidth; // restart the animation
    dots.classList.add('is-wrong');
    const H = window.Components && window.Components.Haptics;
    if (H && typeof H.heavy === 'function') H.heavy();
  },
  async _submit() {
    const pin = this._entry;
    const mode = this._mode;
    const flow = this._flow;
    this._busy = true;
    this._paint();
    const done = () => { this._busy = false; };
    if (mode === 'locked' || (flow && flow.step === 'current')) {
      const ok = await this._check(pin);
      done();
      if (this._mode !== mode || this._flow !== flow) return; // the screen moved on meanwhile
      this._entry = '';
      if (!ok) { this._msg = this._t('lock.wrong'); this._paint(); this._wrongShake(); return; }
      if (mode === 'locked') { this._unlock(); return; }
      if (flow.kind === 'disable') { this._turnOff(); this._endFlow(true); return; }
      flow.step = 'new';
      this._msg = '';
      this._render();
      return;
    }
    done();
    if (!flow) return;
    this._entry = '';
    if (flow.step === 'new') {
      flow.first = pin;
      flow.step = 'repeat';
      this._msg = '';
      this._render();
      return;
    }
    // repeat
    if (pin !== flow.first) {
      flow.first = '';
      flow.step = 'new';
      this._render();
      this._say('lock.mismatch');
      this._wrongShake();
      return;
    }
    this._busy = true;
    let saved = false;
    try {
      const rec = await this._record(pin);
      const st = await this.status();
      if (this._flow !== flow) { this._busy = false; return; }
      const patch = Object.assign({ enabled: true, fails: 0, lockedUntil: 0, deviceSecureAtSetup: st.deviceSecure }, rec);
      if (flow.kind === 'enable') patch.biometrics = false;
      saved = window.Store.dispatch('SET_APP_LOCK', patch) !== false && this.config().enabled;
    } catch (e) { saved = false; }
    this._busy = false;
    if (this._flow !== flow) return;
    if (saved) this._syncCover(true);
    this._endFlow(saved);
  },
  _turnOff() {
    window.Store.dispatch('SET_APP_LOCK', { enabled: false });
    this._syncCover(false);
  },

  // ── biometrics on the lock screen ────────────────────────────────────────
  _autoBiometrics() {
    const doc = window.document || document;
    if (this._bioPrompted || !this.isLocked() || !this.config().biometrics || !this._plugin()) return;
    if (doc && doc.visibilityState === 'hidden') return;
    this._bioPrompted = true;
    this._bioUnlock();
  },
  async _bioUnlock() {
    const r = await this._authenticate({
      reason: this._t('lock.bioReason'), title: this._t('lock.title'),
      cancelTitle: this._t('lock.usePin'), allowDeviceCredential: false
    });
    if (!this.isLocked()) return false;
    if (r.ok) {
      // a fingerprint / face is a right answer too: earlier wrong PINs no
      // longer count towards a wait (found on the emulator, 2026-11-13)
      const cfg = this.config();
      if (cfg.fails || cfg.lockedUntil) window.Store.dispatch('SET_APP_LOCK', { fails: 0, lockedUntil: 0 });
      this._unlock();
      return true;
    }
    if (r.code === 'lockout') this._say('lock.bioLockout');
    return false;
  },
  async _bioTap() {
    if (this._mode === 'locked') { this._bioUnlock(); return; }
    const flow = this._flow;
    const r = await this._authenticate({
      reason: this._t('lock.bioOffReason'), title: this._t('lock.title'),
      cancelTitle: this._t('lock.usePin'), allowDeviceCredential: false
    });
    if (this._flow !== flow || !flow) return;
    if (r.ok) { this._turnOff(); this._endFlow(true); return; }
    if (r.code === 'lockout') this._say('lock.bioLockout');
  },
  // D2 / A3: the phone's own screen lock turns App lock off — offered only
  // when the phone had one when the PIN was created.
  async _resetWithPhoneLock() {
    const r = await this._authenticate({
      reason: this._t('lock.forgotReason'), title: this._t('lock.title'), allowDeviceCredential: true
    });
    if (!this.isLocked()) return;
    if (!r.ok) {
      const msg = this._el && this._el.querySelector('#app-lock-msg');
      if (msg && r.code !== 'cancel') msg.textContent = this._t('lock.forgotFailed');
      return;
    }
    this._turnOff();
    this._unlock();
    const N = window.Components && window.Components.NoticeSheet;
    if (N) N.show({ id: 'app-lock-off-sheet', title: this._t('lock.offTitle'), body: this._t('lock.offBody') });
  },

  // ── Settings flows ───────────────────────────────────────────────────────
  _startFlow(kind, step) {
    if (this._mode) return Promise.resolve(false);
    return new Promise((resolve) => {
      this._flow = { kind, step, first: '', resolve };
      this._mode = 'setup';
      this._view = 'pin';
      this._entry = '';
      this._msg = '';
      this._mount();
      this._render();
    });
  },
  _endFlow(result) {
    const flow = this._flow;
    this._flow = null;
    if (this._mode === 'setup') { this._mode = null; this._unmount(); }
    if (flow && typeof flow.resolve === 'function') flow.resolve(!!result);
  },
  // Each resolves true when the change was made, false when cancelled.
  enable() {
    if (!this.available() || this.config().enabled) return Promise.resolve(false);
    return this._startFlow('enable', 'new');
  },
  changePin() {
    if (!this.config().enabled) return Promise.resolve(false);
    return this._startFlow('change', 'current');
  },
  disable() {
    if (!this.config().enabled) return Promise.resolve(false);
    return this._startFlow('disable', 'current');
  },
  // Turning biometrics on asks for them once, so a switch that cannot work
  // never shows as on.
  async setBiometrics(on) {
    const cfg = this.config();
    if (!cfg.enabled) return false;
    if (!on) { window.Store.dispatch('SET_APP_LOCK', { biometrics: false }); return true; }
    const r = await this._authenticate({
      reason: this._t('lock.bioOnReason'), title: this._t('lock.title'),
      cancelTitle: this._t('common.cancel'), allowDeviceCredential: false
    });
    if (!r.ok) return false;
    window.Store.dispatch('SET_APP_LOCK', { biometrics: true });
    return true;
  },

  // ── Android Back (Router.handleBack asks first) ──────────────────────────
  // locked: Forgot PIN steps back to the pad; the pad itself leaves the app.
  // setup: Back is Cancel.
  handleBack() {
    if (this._mode === 'locked') {
      if (this._view === 'forgot') { this._view = 'pin'; this._entry = ''; this._msg = ''; this._render(); return 'step'; }
      return 'exit';
    }
    if (this._mode === 'setup') { this._endFlow(false); return 'sheet'; }
    return null;
  }
};
