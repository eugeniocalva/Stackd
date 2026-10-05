// db.js - LocalStorage Wrapper (+ native file mirror, v0.97; write journal and
// committed mirror, 1.0.2)
window.StackdDB = {
  PREFIX: 'stackd_v1_',

  // ── Native durability mirror (v0.97) ────────────────────────────────────
  // iOS can evict WKWebView localStorage under storage pressure (and
  // "Offload Unused Apps" clears it), which for a 100%-local finance app
  // means silent total data loss. On native builds every stackd_v1_* key is
  // therefore mirrored to a real file (Capacitor Filesystem, Directory DATA:
  // private app storage, included in OS device backups). localStorage stays
  // the synchronous source of truth; the mirror restores it at boot
  // (initNative, awaited by main.js before Store.init). All mirror I/O is
  // serialized on one promise chain so writes/deletes can never race.
  // Writes must go through save()/remove() — a raw localStorage write would
  // bypass the journal, the revision and the mirror.
  //
  // 1.0.2 (BUG-90): every CHANGE reaches the mirror as ONE commit:
  //   1. its files are written as stackd_db/<key>.json.<rev>.tmp,
  //   2. one commit record stackd_db/_rev.json {rev, writes, deletes} is
  //      written — the commit point,
  //   3. the staging files are promoted onto <key>.json (deletes applied).
  // A kill before the commit point leaves the previous change intact; a kill
  // after it is rolled forward at the next boot. The mirror therefore only
  // ever holds whole changes, and its revision (also kept in localStorage
  // under stackd_mirror_rev, written in the same task as the data) lets boot
  // trust a mirror that is NEWER than a localStorage the WebView never
  // flushed (a kill within about a second of a save).
  _fs: null,             // Capacitor Filesystem plugin proxy (native only)
  _FS_DIR: 'DATA',
  _FS_FOLDER: 'stackd_db',
  _mirrorChain: Promise.resolve(),
  _REV_KEY: 'stackd_mirror_rev',  // NOT stackd_v1_: never enumerated, mirrored, restored or reset as data
  _META: 'stackd_db/_rev.json',   // last commit record; the PREFIX filters skip it
  _rev: 0,                        // revision of the last closed change
  _stage: null,                   // Map fullKey -> string | null (delete) for the open change
  _mirrorDirty: new Set(),        // keys of a commit that failed: re-staged from localStorage next time

  _enqueueMirror(op) {
    this._mirrorChain = this._mirrorChain
      .then(op)
      .catch((error) => console.error('StackdDB mirror error:', error));
    return this._mirrorChain;
  },
  _mirrorPath(fullKey) {
    return this._FS_FOLDER + '/' + fullKey + '.json';
  },
  // 1.0.2 (BUG-90): the local revision is written at a FIXED width, so once it
  // exists a rewrite never grows and cannot hit the quota. A write that fails
  // anyway removes the key: boot then trusts localStorage (the 1.0.1 path)
  // instead of comparing against a revision that lags the mirror.
  _writeRev(rev) {
    try {
      localStorage.setItem(this._REV_KEY, String(rev).padStart(12, '0'));
    } catch (e) {
      try { localStorage.removeItem(this._REV_KEY); } catch (e2) { /* nothing to drop */ }
    }
  },
  _tmpName(fullKey, rev) {
    return fullKey + '.json.' + rev + '.tmp';
  },
  _tmpPath(fullKey, rev) {
    return this._FS_FOLDER + '/' + this._tmpName(fullKey, rev);
  },
  // Only "does not exist" counts as success — any other failure (EACCES, …)
  // must surface, or a delete that never happened would be committed.
  async _deleteIfPresent(path) {
    try {
      await this._fs.deleteFile({ path, directory: this._FS_DIR });
    } catch (e) {
      const text = String((e && e.code) || '') + ' ' + String((e && e.message) || e);
      if (!/does not exist|OS-PLUG-FILE-0008/i.test(text)) throw e;
    }
  },

  // 1.0.2 (BUG-90): record a key's new value (null = deleted) for the open
  // change; a save outside a change (main.js setup_done) is a one-key change.
  _stageMirror(fullKey, value) {
    if (!this._fs) return; // web / tests: no mirror, no revision
    (this._stage || (this._stage = new Map())).set(fullKey, value);
    if (!this._journal) this._closeChange();
  },

  // Close the open change: bump the revision in the same task as the data
  // (so the WebView flushes them together) and queue ONE commit.
  _closeChange() {
    const stage = this._stage;
    this._stage = null;
    if (!this._fs || !stage || !stage.size) return;
    this._mirrorDirty.forEach((k) => { if (!stage.has(k)) stage.set(k, localStorage.getItem(k)); });
    this._mirrorDirty.clear();
    const rev = ++this._rev;
    this._writeRev(rev);
    this._enqueueMirror(() => this._commit(rev, stage));
  },

  async _commit(rev, stage) {
    // A commit queued before an earlier one failed would record a revision
    // whose files miss that earlier change: defer it — the next change
    // re-stages every dirty key from localStorage as one consistent commit.
    if (this._mirrorDirty.size) {
      stage.forEach((v, k) => this._mirrorDirty.add(k));
      return;
    }
    const writes = [];
    const deletes = [];
    stage.forEach((v, k) => (v === null ? deletes : writes).push(k));
    try {
      for (const k of writes) {
        await this._fs.writeFile({ path: this._tmpPath(k, rev), data: stage.get(k), directory: this._FS_DIR, encoding: 'utf8', recursive: true });
      }
      // The commit point: before it the mirror is still the previous change;
      // after it boot finishes this one.
      await this._fs.writeFile({ path: this._META, data: JSON.stringify({ rev, writes, deletes }), directory: this._FS_DIR, encoding: 'utf8', recursive: true });
      await this._rollForward({ rev, writes, deletes }, null);
    } catch (error) {
      stage.forEach((v, k) => this._mirrorDirty.add(k));
      throw error; // logged by _enqueueMirror; the chain stays usable
    }
  },

  // Idempotent: also finishes a commit a kill interrupted (listed = the boot
  // listing; a staging file no longer listed was already promoted).
  async _rollForward(meta, listed) {
    for (const k of meta.writes) {
      if (listed && !listed.has(this._tmpName(k, meta.rev))) continue;
      // Android's rename deletes the target itself; iOS's may refuse to replace.
      await this._deleteIfPresent(this._mirrorPath(k));
      await this._fs.rename({ from: this._tmpPath(k, meta.rev), to: this._mirrorPath(k), directory: this._FS_DIR });
    }
    for (const k of meta.deletes) await this._deleteIfPresent(this._mirrorPath(k));
  },

  async _readMeta() {
    try {
      const res = await this._fs.readFile({ path: this._META, directory: this._FS_DIR, encoding: 'utf8' });
      const m = JSON.parse(res && res.data);
      const keys = (a) => Array.isArray(a) && a.every((k) => typeof k === 'string' && k.indexOf(this.PREFIX) === 0 && /^[\w.-]+$/.test(k));
      return m && Number.isInteger(m.rev) && m.rev > 0 && keys(m.writes) && keys(m.deletes) ? m : null;
    } catch (e) {
      return null; // pre-1.0.2 mirror, or a torn record: revision unknown
    }
  },

  // A torn or empty file is never restored.
  async _readValid(fullKey) {
    try {
      const res = await this._fs.readFile({ path: this._mirrorPath(fullKey), directory: this._FS_DIR, encoding: 'utf8' });
      if (!res || typeof res.data !== 'string') return null;
      JSON.parse(res.data);
      return res.data;
    } catch (e) {
      console.error('StackdDB mirror read failed:', fullKey, e);
      return null;
    }
  },

  // 1.0.2 (BUG-34): write a set of values (Map fullKey -> string | null),
  // the most-shrinking key first, so no intermediate total exceeds
  // max(before, after) — both of which fit. Returns the first error.
  _applyShrinkFirst(values) {
    const len = (v) => (v == null ? 0 : v.length);
    let first = null;
    [...values]
      .filter(([k, v]) => localStorage.getItem(k) !== v)
      .map(([k, v]) => [k, v, len(v) - len(localStorage.getItem(k))])
      .sort((a, b) => a[2] - b[2])
      .forEach(([k, v]) => {
        try {
          if (v == null) localStorage.removeItem(k);
          else localStorage.setItem(k, v);
        } catch (error) {
          if (!first) first = error;
        }
      });
    return first;
  },

  // 1.0.2 (BUG-90): all or nothing — every mirror file must parse, and any
  // throw while applying puts localStorage back byte for byte.
  async _restoreNewer(fileKeys, localKeys) {
    const next = new Map();
    for (const k of fileKeys) {
      const v = await this._readValid(k);
      if (v === null) return false; // keep local (at most one flush behind)
      next.set(k, v);
    }
    localKeys.forEach((k) => { if (!next.has(k)) next.set(k, null); }); // deleted after the last flush
    const prior = new Map();
    next.forEach((v, k) => prior.set(k, localStorage.getItem(k)));
    if (!this._applyShrinkFirst(next)) return true;
    this._applyShrinkFirst(prior);
    return false;
  },

  // Boot handshake. Must complete before anything reads localStorage.
  async initNative() {
    const cap = window.Capacitor;
    const fs = cap && typeof cap.isNativePlatform === 'function' &&
      cap.isNativePlatform() && cap.Plugins && cap.Plugins.Filesystem;
    if (!fs) return; // web / tests: mirror stays off, everything is a no-op
    this._fs = fs;
    try {
      const localKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(this.PREFIX) === 0) localKeys.push(k);
      }

      const list = async () => {
        try {
          const res = await fs.readdir({ path: this._FS_FOLDER, directory: this._FS_DIR });
          return ((res && res.files) || [])
            .map((f) => (typeof f === 'string' ? f : f && f.name))
            .filter(Boolean);
        } catch (error) {
          return null; // folder doesn't exist yet — first boot with the mirror
        }
      };
      let names = await list();
      // 1.0.2 (BUG-90): finish the last commit a kill interrupted. Only when
      // that succeeds is the mirror's revision known.
      const meta = names ? await this._readMeta() : null;
      let mirrorRev = 0;
      if (meta) {
        try {
          await this._rollForward(meta, new Set(names));
          const relisted = await list();
          if (relisted) { names = relisted; mirrorRev = meta.rev; } // else: listing unknown, revision unknown
        } catch (error) {
          console.error('StackdDB mirror roll-forward failed:', error);
        }
      }
      const fileKeys = (names || [])
        .filter((n) => n.indexOf(this.PREFIX) === 0 && n.slice(-5) === '.json')
        .map((n) => n.slice(0, -5));
      if (!meta || mirrorRev) {
        // staging files no commit owns (a change killed before its commit point)
        (names || [])
          .filter((n) => n.indexOf(this.PREFIX) === 0 && n.slice(-4) === '.tmp')
          .forEach((n) => this._enqueueMirror(() => this._deleteIfPresent(this._FS_FOLDER + '/' + n)));
      }
      const revText = localStorage.getItem(this._REV_KEY);
      const localRev = parseInt(revText, 10) || 0;
      this._rev = Math.max(localRev, meta ? meta.rev : 0);

      if (!localKeys.length && fileKeys.length) {
        // WebView storage was evicted/wiped — the mirror is the only copy:
        // restore every file that parses, key by key.
        for (const fullKey of fileKeys) {
          const v = await this._readValid(fullKey);
          if (v === null) continue;
          try { localStorage.setItem(fullKey, v); } catch (error) { console.error('StackdDB restore failed:', fullKey, error); }
        }
        if (mirrorRev) this._writeRev(mirrorRev);
        await this._mirrorChain;
        return;
      }

      // 1.0.2 (BUG-90): a kill inside the WebView's lazy flush left the
      // mirror NEWER than localStorage — it wins, deletes included (a key
      // whose last change was a remove has no file left at all). Only a
      // PRESENT local revision is compared: data without one (a 1.0.1 store,
      // or a revision write the quota refused) keeps localStorage.
      if (revText !== null && mirrorRev > localRev && (fileKeys.length || localKeys.length) &&
          await this._restoreNewer(fileKeys, localKeys)) {
        this._writeRev(mirrorRev);
        await this._mirrorChain;
        return;
      }

      // Normal boot: localStorage is authoritative. Refresh the mirror (also
      // seeds it on the first boot after an update) and drop stale files for
      // keys that no longer exist locally, so a wiped key can't resurrect
      // itself through a future restore — as ONE committed change.
      this._stage = new Map();
      localKeys.forEach((k) => this._stage.set(k, localStorage.getItem(k)));
      fileKeys.forEach((k) => { if (!this._stage.has(k)) this._stage.set(k, null); });
      this._closeChange();
      await this._mirrorChain;
    } catch (error) {
      console.error('StackdDB native mirror init failed:', error);
    }
  },

  // ── Write journal (1.0.2, BUG-34) ─────────────────────────────────────────
  // A change (Store.batch: one dispatch, or a multi-dispatch flow) is
  // all-or-nothing. begin()/end() nest by depth; save()/remove() record each
  // key's prior raw value on its first write in the change. After a failure
  // the change's later writes are refused, and end() at depth 0 puts every
  // key back, the most-shrinking first. Outside a change save()/remove()
  // behave as before.
  _journal: null,

  begin() {
    if (this._journal) this._journal.depth += 1;
    else this._journal = { depth: 1, prior: new Map(), touched: new Set(), failed: null };
  },

  abort(error) {
    const j = this._journal;
    if (j && !j.failed) j.failed = error || new Error('change aborted');
  },

  // Returns the settled journal at depth 0, null for a nested scope.
  end() {
    const j = this._journal;
    if (!j) return null;
    j.depth -= 1;
    if (j.depth > 0) return null; // nested: the outermost scope settles
    if (j.failed) {
      const err = this._applyShrinkFirst(j.prior);
      if (err) console.error('StackdDB rollback failed:', err);
      // the mirror follows the disk
      j.prior.forEach((v, k) => this._stageMirror(k, localStorage.getItem(k)));
    }
    this._journal = null;
    this._closeChange(); // 1.0.2 (BUG-90): change + rollback = ONE mirror commit
    return j;
  },

  isQuotaError(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 || e.code === 1014);
  },

  load(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(this.PREFIX + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('Error loading DB key:', key, error);
      return defaultValue;
    }
  },
  save(key, data) {
    const fullKey = this.PREFIX + key;
    const j = this._journal;
    if (j) {
      j.touched.add(key);
      if (j.failed) return false; // this change is already lost
    }
    try {
      const json = JSON.stringify(data);
      if (j && !j.prior.has(fullKey)) j.prior.set(fullKey, localStorage.getItem(fullKey));
      localStorage.setItem(fullKey, json);
      this._stageMirror(fullKey, json);
      return true;
    } catch (error) {
      console.error('Error saving DB key:', key, error);
      if (j) j.failed = error;
      return false;
    }
  },
  remove(key) {
    const fullKey = this.PREFIX + key;
    const j = this._journal;
    if (j) {
      j.touched.add(key);
      if (j.failed) return false;
    }
    try {
      if (j && !j.prior.has(fullKey)) j.prior.set(fullKey, localStorage.getItem(fullKey));
      localStorage.removeItem(fullKey);
      this._stageMirror(fullKey, null);
      return true;
    } catch (error) {
      console.error('Error removing DB key:', key, error);
      if (j) j.failed = error;
      return false;
    }
  },

  // ── ID generation ─────────────────────────────────────────────────────────
  generateId() {
    // Basic fallback since crypto.randomUUID isn't always available on file:// or older environments
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};
