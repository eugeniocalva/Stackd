// backup.js — 1.2.0 (UX-11): the Backup page's engine. One JSON bundle per
// backup (the six backup CSV texts inside), written silently to the device's
// backup folder (iCloud Drive through the StackdCloud plugin when present,
// else the app's Documents folder on iOS / public Documents on Android, a
// download on the web), an opportunistic daily run (boot + resume, never a
// background task) and a capped log in state.backupLog. Loaded after
// import.js; talks to StackdExport/StackdImport/Store at call time only.
// docs/ux-review-1.2-plan.md §E. Every file method returns a Promise; the
// plugins are reached only through window.Capacitor.Plugins proxies (no
// plugin JS wrapper is bundled — see db.js / export.js) and feature-detected,
// so the page works without any of them (web: download only).
window.StackdBackup = {
  VERSION: '1.2.0',
  FOLDER: 'Stackd Backups',
  AUTO_KEEP: 10, // automatic files kept per folder (the newest)
  DAY_MS: 24 * 60 * 60 * 1000,
  BOOT_GRACE_MS: 3000, // never within 3 s of boot (the boot change may still be settling)
  RETRY_MS: 60 * 60 * 1000, // after a failed automatic run, no retry for an hour
  _loadedAt: Date.now(),
  _running: false,
  _lastFailAt: 0,
  _cloudAvailable: null, // null = not probed yet; probe() decides
  _docDir: null, // Android: the Directory the Documents folder answered from
  _files: null, // the last listAll() answer (null = not listed yet)

  // ── platform ──────────────────────────────────────────────────────────────
  _cap() {
    const cap = window.Capacitor;
    return cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() ? cap : null;
  },

  isNative() {
    return !!this._cap();
  },

  platform() {
    const cap = this._cap();
    if (!cap) return 'web';
    return typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'native';
  },

  _plugins() {
    const cap = this._cap();
    return (cap && cap.Plugins) || {};
  },

  _fs() {
    const fs = this._plugins().Filesystem;
    return fs && typeof fs.writeFile === 'function' ? fs : null;
  },

  // The local stackd-cloud plugin (plugins/stackd-cloud): iOS writes the
  // ubiquity container, Android answers available:false. Only its presence
  // is checked here — probe() asks whether iCloud Drive is really there.
  _cloud() {
    const c = this._plugins().StackdCloud;
    return c && typeof c.available === 'function' && typeof c.write === 'function' ? c : null;
  },

  // 'icloud' | 'documents' | 'download' — the synchronous best answer (the
  // page renders from it). iCloud only once probe() said it is available.
  target() {
    if (!this.isNative()) return 'download';
    return this._cloudAvailable === true ? 'icloud' : 'documents';
  },

  // Asks the cloud plugin whether the ubiquity container is reachable (the
  // user may not be signed in to iCloud) and caches the answer.
  async probe() {
    if (!this.isNative()) return 'download';
    const cloud = this._cloud();
    if (!cloud) { this._cloudAvailable = false; return 'documents'; }
    try {
      const r = await cloud.available();
      this._cloudAvailable = !!(r && r.available);
    } catch (e) {
      this._cloudAvailable = false;
    }
    return this.target();
  },

  // ── names ─────────────────────────────────────────────────────────────────
  _p2(n) {
    return String(n).padStart(2, '0');
  },

  // yyyyMMdd_HHmmss from the LOCAL clock, so the files sort by name.
  stamp(now) {
    const d = now instanceof Date ? now : new Date();
    return d.getFullYear() + this._p2(d.getMonth() + 1) + this._p2(d.getDate()) + '_' +
      this._p2(d.getHours()) + this._p2(d.getMinutes()) + this._p2(d.getSeconds());
  },

  fileName(kind, now) {
    return (kind === 'auto' ? 'Stackd_auto_' : 'Stackd_backup_') + this.stamp(now) + '.json';
  },

  isAutoFile(name) {
    return /^Stackd_auto_\d{8}_\d{6}\.json$/.test(String(name || ''));
  },

  // A file name this page wrote or may read: no path parts, bounded.
  _safeName(name) {
    const s = String(name || '');
    return s.length > 0 && s.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(s) && s.indexOf('..') === -1;
  },

  byteLength(text) {
    // UTF-8 length counted by code point (no TextEncoder in every test double)
    const s = String(text || '');
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { n += 4; i += 1; } // surrogate pair
      else n += 3;
    }
    return n;
  },

  _errorText(error) {
    return String((error && error.message) || error || 'error').slice(0, 200);
  },

  // ── the bundle ────────────────────────────────────────────────────────────
  // { format, version, createdAt, app, language, files: { accounts,
  //   categories, transactions, loans, budgets, importRules } } — each value
  // is the exact text the matching backup exporter produces, collected
  // through StackdExport._sink (no download, no share sheet). import.js reads
  // it back (_parseBundle / _restoreBundle).
  buildBundle(state) {
    const E = window.StackdExport;
    // Bundle key → exporter, in the restore order. Each exporter's text is
    // caught by the sink set for its own call (the file name is not relied on).
    const plan = [['accounts', 'exportAccounts'], ['categories', 'exportCategories'],
      ['transactions', 'exportTransactions'], ['loans', 'exportLoans'],
      ['budgets', 'exportBudgets'], ['importRules', 'exportImportRules']];
    const files = {};
    const prev = E._sink;
    try {
      plan.forEach(([key, fn]) => {
        files[key] = '';
        E._sink = (name, text) => { files[key] = String(text == null ? '' : text); };
        E[fn](state);
      });
    } finally {
      E._sink = prev || null;
    }
    return {
      format: 'stackd-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      app: "Stack'd " + this.VERSION,
      language: (state && state.language) || 'en',
      files
    };
  },

  // ── files per target ──────────────────────────────────────────────────────
  // Android: the public Documents folder (visible in Files); when it is
  // refused (API ≤ 29 without the storage permission) the app folder.
  // iOS: Directory DATA is the app's own Documents folder (private — not in
  // the Files app; "Share" hands a copy out). The Directory that answered
  // is remembered for the session.
  _docDirs() {
    if (this._docDir) return [this._docDir];
    return this.platform() === 'android' ? ['DOCUMENTS', 'DATA'] : ['DATA'];
  },

  _notFound() {
    return new Error(window.I18n ? window.I18n.t('backup.notFound') : 'backup not found');
  },

  async _writeDocuments(name, text) {
    const fs = this._fs();
    if (!fs) throw new Error('Filesystem plugin unavailable');
    let last = null;
    for (const dir of this._docDirs()) {
      try {
        const r = await fs.writeFile({ path: this.FOLDER + '/' + name, data: text, directory: dir, encoding: 'utf8', recursive: true });
        this._docDir = dir;
        return { target: 'documents', dir, uri: (r && r.uri) || '' };
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error('write failed');
  },

  async _listDocuments() {
    const fs = this._fs();
    if (!fs) return [];
    const out = [];
    const seen = new Set();
    for (const dir of this._docDirs()) {
      let r = null;
      try { r = await fs.readdir({ path: this.FOLDER, directory: dir }); } catch (e) { r = null; } // no folder yet
      const files = (r && Array.isArray(r.files)) ? r.files : [];
      files.forEach((f) => {
        const name = f && typeof f === 'object' ? f.name : f;
        if (typeof name !== 'string' || seen.has(name) || (f && f.type === 'directory')) return;
        seen.add(name);
        out.push({ name, bytes: Number(f && f.size) || 0, mtime: Number(f && f.mtime) || 0, dir });
      });
    }
    return out;
  },

  async _readDocuments(name) {
    const fs = this._fs();
    if (!fs) throw this._notFound();
    for (const dir of this._docDirs()) {
      try {
        const r = await fs.readFile({ path: this.FOLDER + '/' + name, directory: dir, encoding: 'utf8' });
        if (r && typeof r.data === 'string') return r.data;
      } catch (e) { /* try the next folder */ }
    }
    throw this._notFound();
  },

  async _removeDocuments(name) {
    const fs = this._fs();
    if (!fs) return false;
    for (const dir of this._docDirs()) {
      try {
        await fs.deleteFile({ path: this.FOLDER + '/' + name, directory: dir });
        return true;
      } catch (e) { /* not there */ }
    }
    return false;
  },

  // [{ name, bytes, mtime }] of the backup folder, newest first; [] on the
  // web and when the folder does not exist yet.
  async list(target) {
    const t = target || this.target();
    let files = [];
    if (t === 'icloud') {
      const cloud = this._cloud();
      if (!cloud) return [];
      const r = await cloud.list();
      files = ((r && Array.isArray(r.files)) ? r.files : [])
        .filter(f => f && typeof f.name === 'string')
        .map(f => ({ name: f.name, bytes: Number(f.size) || 0, mtime: Number(f.mtime) || 0 }));
    } else if (t === 'documents') {
      files = await this._listDocuments();
    }
    return files.sort((a, b) => (b.mtime - a.mtime) || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  },

  // Every backup file the page can restore, across the folders a run may
  // have written (iCloud Drive and, after a fallback, the device folder):
  // [{ name, bytes, mtime, target }], newest first. Only `.json` names this
  // page could have written are listed; a folder that does not answer is
  // skipped. [] on the web. The last answer is kept in `_files` (null = not
  // listed yet) so a re-render shows it at once while the page re-lists.
  // Review fix (UX-11): the page lists the folder, not only the log — a file
  // whose row left the log (cap, RESET_APP) stays reachable, and a pruned
  // file is no longer offered.
  async listAll() {
    if (!this.isNative()) { this._files = []; return []; }
    const targets = this._cloud() && this._cloudAvailable === true ? ['icloud', 'documents'] : ['documents'];
    const out = [];
    const seen = new Set();
    for (const t of targets) {
      let files = [];
      try { files = await this.list(t); } catch (e) { files = []; }
      files.forEach((f) => {
        if (!this._safeName(f.name) || !/\.json$/i.test(f.name) || seen.has(t + '/' + f.name)) return;
        seen.add(t + '/' + f.name);
        out.push({ name: f.name, bytes: f.bytes, mtime: f.mtime || this._stampTime(f.name), target: t });
      });
    }
    out.sort((a, b) => (b.mtime - a.mtime) || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    this._files = out;
    return out;
  },

  // The local time a Stackd_auto_/Stackd_backup_ name carries, in ms; 0 for
  // another name (a folder that reports no mtime still sorts by stamp).
  _stampTime(name) {
    const m = /_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.json$/i.exec(String(name || ''));
    if (!m) return 0;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  },

  // Writes the text as `name` on the target. An iCloud write that fails
  // falls back to the device folder (and the target is re-probed later), so
  // a daily run always leaves a file somewhere; the entry records where.
  // Web: the browser download.
  async write(name, text, target) {
    if (!this._safeName(name)) throw new Error('invalid backup name');
    const t = target || this.target();
    const bytes = this.byteLength(text);
    if (t === 'download') {
      await window.StackdExport._download(name, text, 'application/json;charset=utf-8;', { bom: false });
      return { target: 'download', bytes };
    }
    if (t === 'icloud') {
      const cloud = this._cloud();
      if (cloud) {
        try {
          const r = await cloud.write({ name, data: text });
          return { target: 'icloud', bytes, uri: (r && r.uri) || '' };
        } catch (e) {
          console.error('iCloud backup failed, using the device folder:', e);
          this._cloudAvailable = false;
        }
      }
    }
    const r = await this._writeDocuments(name, text);
    return Object.assign(r, { bytes });
  },

  async read(name, target) {
    if (!this._safeName(name)) throw this._notFound();
    const t = target || this.target();
    if (t === 'download') throw this._notFound();
    if (t === 'icloud') {
      const cloud = this._cloud();
      if (!cloud) throw this._notFound();
      let r = null;
      try { r = await cloud.read({ name }); } catch (e) { throw this._notFound(); }
      if (!r || typeof r.data !== 'string') throw this._notFound();
      return r.data;
    }
    return this._readDocuments(name);
  },

  async remove(name, target) {
    if (!this._safeName(name)) return false;
    const t = target || this.target();
    if (t === 'download') return false;
    if (t === 'icloud') {
      const cloud = this._cloud();
      if (!cloud) return false;
      try { await cloud.remove({ name }); return true; } catch (e) { return false; }
    }
    return this._removeDocuments(name);
  },

  // Keeps the AUTO_KEEP newest automatic files (by their stamp); manual
  // backups are never touched. Returns the names removed.
  async pruneAuto(target) {
    const t = target || this.target();
    const files = await this.list(t);
    const auto = files.map(f => f.name).filter(n => this.isAutoFile(n)).sort().reverse();
    const stale = auto.slice(this.AUTO_KEEP);
    for (const name of stale) {
      try { await this.remove(name, t); } catch (e) { console.error('Backup prune failed:', name, e); }
    }
    return stale;
  },

  // ── runs ──────────────────────────────────────────────────────────────────
  // Builds the bundle, writes it (auto: Stackd_auto_<stamp>.json, pruned to
  // the newest AUTO_KEEP; manual: Stackd_backup_<stamp>.json), logs the run
  // and, for a successful automatic run, stamps lastAutoAt. Resolves the log
  // entry; never rejects. `silent` saves the log without a render (the daily
  // run fires under whatever screen is open).
  async backupNow(opts) {
    const o = opts || {};
    const kind = o.kind === 'auto' ? 'auto' : 'manual';
    const S = window.Store;
    const entry = { kind, target: '', name: '', bytes: 0, ok: true, error: '' };
    if (this._running) { entry.ok = false; entry.error = 'busy'; return entry; } // not logged
    this._running = true;
    try {
      const state = S.getState();
      await this.probe();
      entry.target = this.target();
      entry.name = this.fileName(kind, new Date());
      const text = JSON.stringify(this.buildBundle(state));
      entry.bytes = this.byteLength(text);
      const r = await this.write(entry.name, text, entry.target);
      entry.target = r.target;
      if (kind === 'auto') {
        try { await this.pruneAuto(r.target); } catch (e) { console.error('Backup prune failed:', e); }
      }
    } catch (error) {
      entry.ok = false;
      entry.error = this._errorText(error);
      console.error('Backup failed:', error);
    } finally {
      this._running = false;
    }
    const silent = o.silent === true;
    S.dispatch('APPEND_BACKUP_LOG', Object.assign({ silent }, entry));
    if (kind === 'auto' && entry.ok) S.dispatch('SET_BACKUP_PREFS', { lastAutoAt: new Date().toISOString(), silent });
    return entry;
  },

  // The opportunistic daily run (main.js: after boot and on every return to
  // the foreground). Runs when the toggle is on and the last automatic
  // backup is a day old or older; never on the web, within 3 s of boot,
  // while a share sheet is up (StackdExport._busy), inside Store.dryRun,
  // with a save failure pending, or while a run is in progress. Silent; one
  // failure sheet per day. Returns whether a run was started.
  maybeDaily(now) {
    const S = window.Store;
    const db = window.StackdDB;
    const E = window.StackdExport;
    const at = typeof now === 'number' ? now : Date.now();
    if (!S || !S.state || typeof S.getBackupPrefs !== 'function') return false;
    if (!this.isNative()) return false;
    const prefs = S.getBackupPrefs();
    if (!prefs.daily) return false;
    if (at - this._loadedAt < this.BOOT_GRACE_MS) return false;
    if (this._running) return false;
    if (E && E._busy) return false;
    if (db && db._dry) return false;
    if (S._saveFailure) return false;
    if (prefs.lastAutoAt && at - Date.parse(prefs.lastAutoAt) < this.DAY_MS) return false;
    if (this._lastFailAt && at - this._lastFailAt < this.RETRY_MS) return false;
    const silent = S.state.activeView !== 'backup';
    this.backupNow({ kind: 'auto', silent })
      .then((entry) => { if (!entry.ok) this._reportAutoFailure(entry, at); })
      .catch(() => {});
    return true;
  },

  _reportAutoFailure(entry, at) {
    this._lastFailAt = at;
    const S = window.Store;
    const today = S._todayYMD();
    if (S.getBackupPrefs().lastFailDay === today) return; // one sheet per day
    S.dispatch('SET_BACKUP_PREFS', { lastFailDay: today, silent: true });
    const C = window.Components;
    const I = window.I18n;
    if (!C || !C.NoticeSheet || !I) return;
    C.NoticeSheet.show({
      id: 'backup-result-modal',
      tone: 'error',
      title: I.t('backup.failedTitle'),
      body: I.t('backup.failedBody')
    });
  },

  // Restores a file of the backup folder (a "Recent backups" row): reads it
  // on its target and hands the text to the one restore route, so the
  // callbacks are those of a picked file. Resolves once they have run.
  restoreFrom(name, target, onComplete, onError) {
    const I = window.StackdImport;
    // Two-argument then: a callback that throws is importText's to report,
    // never a second onError from here.
    return this.read(name, target).then((text) => {
      if (!I) { if (onError) onError(new Error(window.I18n.t('others.importModuleMissing'))); return; }
      I.importText(text, { mode: 'restore' }, onComplete, onError);
    }, (error) => { if (onError) onError(error); });
  }
};
