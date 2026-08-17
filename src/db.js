// db.js - LocalStorage Wrapper (+ native file mirror, v0.97)
window.StackdDB = {
  PREFIX: 'stackd_v1_',

  // ── Native durability mirror (v0.97) ────────────────────────────────────
  // iOS can evict WKWebView localStorage under storage pressure (and
  // "Offload Unused Apps" clears it), which for a 100%-local finance app
  // means silent total data loss. On native builds every stackd_v1_* key is
  // therefore mirrored to a real file (Capacitor Filesystem, Directory DATA:
  // private app storage, included in OS device backups). localStorage stays
  // the synchronous source of truth; the mirror only restores it at boot
  // (initNative, awaited by main.js before Store.init) when the WebView
  // store came up empty. All mirror I/O is serialized on one promise chain
  // so writes/deletes can never race. Writes must go through save()/remove()
  // — a raw localStorage write would bypass the mirror.
  _fs: null,             // Capacitor Filesystem plugin proxy (native only)
  _FS_DIR: 'DATA',
  _FS_FOLDER: 'stackd_db',
  _mirrorChain: Promise.resolve(),

  _enqueueMirror(op) {
    this._mirrorChain = this._mirrorChain
      .then(op)
      .catch((error) => console.error('StackdDB mirror error:', error));
    return this._mirrorChain;
  },
  _mirrorPath(fullKey) {
    return this._FS_FOLDER + '/' + fullKey + '.json';
  },
  _mirrorWrite(fullKey, value) {
    if (!this._fs) return;
    this._enqueueMirror(() => this._fs.writeFile({
      path: this._mirrorPath(fullKey),
      data: value,
      directory: this._FS_DIR,
      encoding: 'utf8',
      recursive: true
    }));
  },
  _mirrorDelete(fullKey) {
    if (!this._fs) return;
    this._enqueueMirror(() => this._fs.deleteFile({
      path: this._mirrorPath(fullKey),
      directory: this._FS_DIR
    }).catch(() => { /* already absent — deletes are idempotent */ }));
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

      let fileKeys = [];
      try {
        const res = await fs.readdir({ path: this._FS_FOLDER, directory: this._FS_DIR });
        fileKeys = (res.files || [])
          .map((f) => (typeof f === 'string' ? f : f.name))
          .filter((n) => n && n.indexOf(this.PREFIX) === 0 && n.slice(-5) === '.json')
          .map((n) => n.slice(0, -5));
      } catch (error) {
        // Folder doesn't exist yet — first boot with the mirror.
      }

      if (!localKeys.length && fileKeys.length) {
        // WebView storage was evicted/wiped — restore it from the mirror.
        for (const fullKey of fileKeys) {
          const res = await fs.readFile({
            path: this._mirrorPath(fullKey),
            directory: this._FS_DIR,
            encoding: 'utf8'
          });
          if (res && typeof res.data === 'string') localStorage.setItem(fullKey, res.data);
        }
        return;
      }

      // Normal boot: localStorage is authoritative. Refresh the mirror (also
      // seeds it on the first boot after this update) and drop stale files
      // for keys that no longer exist locally, so a wiped key can't
      // resurrect itself through a future restore.
      for (const fullKey of localKeys) {
        this._mirrorWrite(fullKey, localStorage.getItem(fullKey));
      }
      const localSet = new Set(localKeys);
      for (const fullKey of fileKeys) {
        if (!localSet.has(fullKey)) this._mirrorDelete(fullKey);
      }
      await this._mirrorChain;
    } catch (error) {
      console.error('StackdDB native mirror init failed:', error);
    }
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
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(this.PREFIX + key, json);
      this._mirrorWrite(this.PREFIX + key, json);
      return true;
    } catch (error) {
      console.error('Error saving DB key:', key, error);
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(this.PREFIX + key);
      this._mirrorDelete(this.PREFIX + key);
      return true;
    } catch (error) {
      console.error('Error removing DB key:', key, error);
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
