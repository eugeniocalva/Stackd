// attachments.js — 1.2.0 (UX-10): transaction attachments (receipt photos and
// PDFs). Bytes live OUTSIDE the store: on native in the Capacitor Filesystem
// (Directory DATA, folder stackd_attachments/ — a sibling of db.js's
// stackd_db/, never inside it), on the web in IndexedDB. Only small metadata
// rides on the transaction ({ id, kind, name, ext, mime, size, addedAt }).
// Loaded after db.js/i18n and before store.js; every method returns a
// Promise and never throws to its caller (null / false + console.error).
//
// Layout: one flat file per attachment, `stackd_attachments/<id>.<ext>` —
// a NEW log writes its files before the row exists (so a thumbnail can show),
// so the file is keyed on the attachment id the meta carries, not on a row id.
// The native plugin is reached through window.Capacitor.Plugins (no JS
// wrapper is bundled, as in db.js); omitting `encoding` makes writeFile take
// and readFile return base64 (the plugin's binary contract).
window.Attachments = {
  VERSION: '1.2.0',
  FOLDER: 'stackd_attachments',
  DIR: 'DATA',
  DB_NAME: 'stackd_attachments',
  DB_VERSION: 1,
  STORE: 'files',
  MAX_PER_TX: 8,
  MAX_PDF_BYTES: 10 * 1024 * 1024,
  MAX_IMAGE_PX: 1600,
  JPEG_QUALITY: 0.82,

  _chain: Promise.resolve(),
  _dbPromise: null,
  _urls: {}, // meta.id -> object URL handed out by displayUrl (web only)

  // ── platform ──────────────────────────────────────────────────────────────
  isNative() {
    const cap = window.Capacitor;
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  },

  _fs() {
    const cap = window.Capacitor;
    return (this.isNative() && cap.Plugins && cap.Plugins.Filesystem) || null;
  },

  _idb() {
    return (typeof window.indexedDB !== 'undefined' && window.indexedDB) || null;
  },

  // Whether any backend exists (false on file:// without IndexedDB, in unit
  // tests without fake-indexeddb). Every method is a quiet no-op then.
  available() {
    return !!(this._fs() || this._idb());
  },

  // Mutations (add/remove/sweep/clear) run one after another, so a boot sweep
  // can never judge a file the form is writing at the same moment.
  _serial(fn) {
    const run = this._chain.then(fn, fn);
    this._chain = run.then(() => undefined, () => undefined);
    return run;
  },

  // ── classification ────────────────────────────────────────────────────────
  _IMAGE_EXTS: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'avif'],

  _extOf(name, mime) {
    const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || ''));
    if (m) return m[1].toLowerCase();
    const type = String(mime || '').toLowerCase();
    if (type === 'image/jpeg') return 'jpg';
    if (type === 'application/pdf') return 'pdf';
    const t = /^image\/([a-z0-9]{1,8})$/.exec(type);
    return t ? t[1] : '';
  },

  _mimeFor(ext) {
    const e = String(ext || '').toLowerCase();
    if (e === 'pdf') return 'application/pdf';
    if (e === 'jpg' || e === 'jpeg') return 'image/jpeg';
    if (e === 'png') return 'image/png';
    if (e === 'gif') return 'image/gif';
    if (e === 'webp') return 'image/webp';
    if (e === 'heic' || e === 'heif') return 'image/heic';
    return 'application/octet-stream';
  },

  // 'image' | 'pdf' | null
  kindOf(name, mime) {
    const type = String(mime || '').toLowerCase();
    if (type === 'application/pdf') return 'pdf';
    if (type.indexOf('image/') === 0) return 'image';
    const ext = this._extOf(name, '');
    if (ext === 'pdf') return 'pdf';
    if (this._IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    return null;
  },

  // One line, bounded, never empty (stored on the row and shown in the UI —
  // escaped at render by the views).
  _cleanName(name, kind, ext) {
    let s = String(name || '').replace(/[\r\n\t]+/g, ' ').replace(/[\\/]/g, '_').trim();
    if (s.length > 120) s = s.slice(0, 120);
    if (!s) s = (kind === 'pdf' ? 'document' : 'receipt') + '.' + (ext || (kind === 'pdf' ? 'pdf' : 'jpg'));
    return s;
  },

  _withExt(name, ext) {
    const base = String(name || '').replace(/\.[a-z0-9]{1,8}$/i, '');
    return (base || 'receipt') + '.' + ext;
  },

  // A share-sheet file name: the display name with path-unsafe characters
  // replaced, always ending in the stored extension.
  _shareName(meta) {
    const ext = String(meta.ext || '').toLowerCase() || (meta.kind === 'pdf' ? 'pdf' : 'jpg');
    let base = String(meta.name || '').replace(/\.[a-z0-9]{1,8}$/i, '').replace(/[^\w.\- ]+/g, '_').trim();
    if (!base) base = meta.kind === 'pdf' ? 'document' : 'receipt';
    return base.slice(0, 80) + '.' + ext;
  },

  // ── preparation ───────────────────────────────────────────────────────────
  // Images are ALWAYS re-encoded before storage (createImageBitmap → canvas,
  // longest side MAX_IMAGE_PX, JPEG JPEG_QUALITY): HEIC/PNG/orientation are
  // normalised and the size bounded. An image this WebView has a decoder and
  // a canvas for but cannot decode (a HEIC picked on Android) is refused
  // ('unreadable'): stored raw it could never be shown or put in the
  // receipts PDF. Only with no decoder or canvas at all (an old WebView,
  // jsdom) are the original bytes stored as they are.
  // PDFs are stored as-is up to MAX_PDF_BYTES.
  // → { blob, name, mime, kind, ext } or { error: 'unsupported'|'unreadable'|'tooLarge'|'failed' }
  async prepare(file) {
    try {
      if (!file) return { error: 'failed' };
      const kind = this.kindOf(file.name, file.type);
      if (!kind) return { error: 'unsupported' };
      if (kind === 'pdf') {
        if (file.size > this.MAX_PDF_BYTES) return { error: 'tooLarge' };
        return { blob: file, name: this._cleanName(file.name, kind, 'pdf'), mime: 'application/pdf', kind, ext: 'pdf' };
      }
      const encoded = await this._encodeImage(file);
      if (encoded && encoded.error) return { error: encoded.error };
      if (encoded) {
        return { blob: encoded, name: this._withExt(this._cleanName(file.name, kind, 'jpg'), 'jpg'), mime: 'image/jpeg', kind, ext: 'jpg' };
      }
      if (file.size > this.MAX_PDF_BYTES) return { error: 'tooLarge' };
      const ext = this._extOf(file.name, file.type) || 'jpg';
      return { blob: file, name: this._cleanName(file.name, kind, ext), mime: file.type || this._mimeFor(ext), kind, ext };
    } catch (error) {
      console.error('Attachments: prepare failed', error);
      return { error: 'failed' };
    }
  },

  _canvasContext(w, h) {
    try {
      if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
      const canvas = document.createElement('canvas');
      if (!canvas || typeof canvas.getContext !== 'function') return null;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      return ctx ? { canvas, ctx } : null;
    } catch (error) {
      return null;
    }
  },

  // ImageBitmap (orientation applied) or an <img>, null when nothing can decode.
  async _decode(blob) {
    if (typeof window.createImageBitmap === 'function') {
      try {
        return await window.createImageBitmap(blob, { imageOrientation: 'from-image' });
      } catch (error) {
        try { return await window.createImageBitmap(blob); } catch (error2) { /* not decodable here */ }
      }
    }
    if (!this._canvasContext(1, 1) || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Image === 'undefined') return null;
    return new Promise((resolve) => {
      let url = null;
      try { url = URL.createObjectURL(blob); } catch (error) { resolve(null); return; }
      const img = new Image();
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { URL.revokeObjectURL(url); } catch (error) { /* already gone */ }
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 15000);
      img.onload = () => finish(img);
      img.onerror = () => finish(null);
      img.src = url;
    });
  },

  _toBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      try {
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob((b) => resolve(b || null), type, quality);
          return;
        }
        if (typeof canvas.toDataURL === 'function') {
          const dataUrl = canvas.toDataURL(type, quality);
          const comma = dataUrl.indexOf(',');
          if (comma === -1) { resolve(null); return; }
          resolve(new Blob([this._fromBase64(dataUrl.slice(comma + 1))], { type }));
          return;
        }
      } catch (error) { /* fall through */ }
      resolve(null);
    });
  },

  // Whether this WebView can re-encode at all: a 2D canvas and a decoder
  // (createImageBitmap, or an <img> fed by an object URL).
  _canReencode() {
    if (!this._canvasContext(1, 1)) return false;
    if (typeof window.createImageBitmap === 'function') return true;
    return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Image !== 'undefined';
  },

  // → a JPEG Blob; null when nothing here can re-encode (store the original);
  // { error: 'unreadable' } when the decoder cannot read the image,
  // { error: 'failed' } when the canvas could not write it.
  async _encodeImage(blob) {
    let bmp = null;
    try {
      if (!this._canReencode()) return null;
      bmp = await this._decode(blob);
      if (!bmp) return { error: 'unreadable' };
      const w = bmp.width || bmp.naturalWidth || 0;
      const h = bmp.height || bmp.naturalHeight || 0;
      if (!w || !h) return { error: 'unreadable' };
      const scale = Math.min(1, this.MAX_IMAGE_PX / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const c = this._canvasContext(tw, th);
      if (!c) return { error: 'failed' };
      c.ctx.drawImage(bmp, 0, 0, tw, th);
      return (await this._toBlob(c.canvas, 'image/jpeg', this.JPEG_QUALITY)) || { error: 'failed' };
    } catch (error) {
      console.error('Attachments: image re-encode failed', error);
      return { error: 'failed' };
    } finally {
      if (bmp && typeof bmp.close === 'function') { try { bmp.close(); } catch (error) { /* already closed */ } }
    }
  },

  // ── bytes ─────────────────────────────────────────────────────────────────
  async _bytesOf(src) {
    if (src instanceof Uint8Array) return src;
    if (typeof ArrayBuffer !== 'undefined' && src instanceof ArrayBuffer) return new Uint8Array(src);
    if (src && typeof src.arrayBuffer === 'function') return new Uint8Array(await src.arrayBuffer());
    if (typeof FileReader === 'undefined') throw new Error('no byte reader');
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result));
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsArrayBuffer(src);
    });
  },

  _toBase64(bytes) {
    let s = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    }
    return btoa(s);
  },

  _fromBase64(str) {
    const bin = atob(String(str || '').replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },

  _uuid() {
    if (window.StackdDB && typeof window.StackdDB.generateId === 'function') return window.StackdDB.generateId();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  // The file's path, null for a meta whose id or extension could leave the
  // folder (metas also arrive from CSV restores: never trust them as paths).
  _path(meta) {
    if (!meta) return null;
    const id = String(meta.id || '');
    const ext = String(meta.ext || '').toLowerCase() || (meta.kind === 'pdf' ? 'pdf' : 'jpg');
    if (!this._SAFE_ID.test(id) || !this._SAFE_EXT.test(ext)) return null;
    return this.FOLDER + '/' + id + '.' + ext;
  },

  _SAFE_ID: /^[A-Za-z0-9_-]{1,80}$/,
  _SAFE_EXT: /^[a-z0-9]{1,8}$/,

  // A stored/restored meta list made safe: ids through Store.fileId (D10),
  // a known kind, a one-line bounded name, a plain extension and mime, at
  // most MAX_PER_TX entries, duplicates dropped. Anything unusable is left out.
  sanitizeMetas(list) {
    if (!Array.isArray(list)) return [];
    const S = window.Store;
    const seen = new Set();
    const out = [];
    list.forEach((m) => {
      if (!m || typeof m !== 'object' || out.length >= this.MAX_PER_TX) return;
      const raw = String(m.id == null ? '' : m.id).trim();
      const id = (S && typeof S.fileId === 'function') ? S.fileId(raw) : (this._SAFE_ID.test(raw) ? raw : null);
      if (!id || !this._SAFE_ID.test(id) || seen.has(id)) return;
      const kind = m.kind === 'pdf' || m.kind === 'image' ? m.kind : this.kindOf(m.name, m.mime);
      if (!kind) return;
      let ext = String(m.ext || '').toLowerCase();
      if (!this._SAFE_EXT.test(ext)) ext = this._extOf(m.name, m.mime) || (kind === 'pdf' ? 'pdf' : 'jpg');
      if (!this._SAFE_EXT.test(ext)) ext = kind === 'pdf' ? 'pdf' : 'jpg';
      const mime = /^[a-z]+\/[a-z0-9.+-]{1,60}$/i.test(String(m.mime || '')) ? String(m.mime).toLowerCase() : this._mimeFor(ext);
      const size = Math.max(0, Math.floor(Number(m.size) || 0));
      const addedAt = typeof m.addedAt === 'string' ? m.addedAt.slice(0, 40) : '';
      seen.add(id);
      out.push({ id, kind, name: this._cleanName(m.name, kind, ext), ext, mime, size, addedAt });
    });
    return out;
  },

  // What the bytes really are: 'jpg' | 'png' | 'pdf' | null (magic numbers —
  // the receipts PDF embeds by content, not by a stored extension).
  sniff(bytes) {
    if (!bytes || bytes.length < 4) return null;
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg';
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
    return null;
  },

  _isMissing(error) {
    return /not exist|OS-PLUG-FILE-0008|ENOENT|No such file|not found/i.test(String((error && error.message) || error));
  },

  // ── IndexedDB (web) ───────────────────────────────────────────────────────
  _openDb() {
    if (this._dbPromise) return this._dbPromise;
    const idb = this._idb();
    if (!idb) return Promise.resolve(null);
    const self = this;
    this._dbPromise = new Promise((resolve) => {
      let req;
      try {
        req = idb.open(self.DB_NAME, self.DB_VERSION);
      } catch (error) {
        console.error('Attachments: IndexedDB open failed', error);
        self._dbPromise = null;
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(self.STORE)) {
          const store = db.createObjectStore(self.STORE, { keyPath: 'id' });
          store.createIndex('txId', 'txId', { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { try { db.close(); } catch (error) { /* closing */ } self._dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => {
        console.error('Attachments: IndexedDB unavailable', req.error);
        self._dbPromise = null;
        resolve(null);
      };
      req.onblocked = () => { /* another tab holds an old version open; onsuccess follows once it closes */ };
    });
    return this._dbPromise;
  },

  _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('request failed'));
    });
  },

  // One transaction on the files store; resolves with run(store)'s value once
  // the transaction completed, null when IndexedDB is unavailable.
  async _store(mode, run) {
    const db = await this._openDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(this.STORE, mode);
      } catch (error) {
        reject(error);
        return;
      }
      let out;
      let failed = null;
      tx.oncomplete = () => { if (failed) reject(failed); else resolve(out); };
      tx.onerror = () => { failed = tx.error || new Error('transaction failed'); };
      tx.onabort = () => reject(failed || tx.error || new Error('transaction aborted'));
      // run() places its first request synchronously, while the transaction
      // is surely active (follow-up requests go in the request callbacks).
      let pending;
      try {
        pending = Promise.resolve(run(tx.objectStore(this.STORE)));
      } catch (error) {
        pending = Promise.reject(error);
      }
      pending.then((v) => { out = v; }, (error) => {
        failed = error;
        try { tx.abort(); } catch (error2) { reject(error); }
      });
    });
  },

  // ── native helpers ────────────────────────────────────────────────────────
  async _listNative(fs) {
    try {
      const res = await fs.readdir({ path: this.FOLDER, directory: this.DIR });
      const files = (res && res.files) || [];
      return files.map((f) => (typeof f === 'string' ? { name: f } : f)).filter((f) => f && f.name);
    } catch (error) {
      return []; // no folder yet
    }
  },

  async _deleteNative(fs, path) {
    try {
      await fs.deleteFile({ path, directory: this.DIR });
      return true;
    } catch (error) {
      if (this._isMissing(error)) return false;
      throw error;
    }
  },

  // ── public API ────────────────────────────────────────────────────────────
  // add(txId, { blob|bytes, name, mime [, kind, ext] }) → meta | null. The
  // txId is recorded on the web record only (the file layout is flat).
  add(txId, input) {
    const src = input || {};
    const data = src.blob || src.bytes;
    if (!data) return Promise.resolve(null);
    const kind = src.kind || this.kindOf(src.name, src.mime);
    if (!kind) return Promise.resolve(null);
    const ext = String(src.ext || this._extOf(src.name, src.mime) || (kind === 'pdf' ? 'pdf' : 'jpg')).toLowerCase();
    const mime = src.mime || this._mimeFor(ext);
    const name = this._cleanName(src.name, kind, ext);
    const meta = { id: this._uuid(), kind, name, ext, mime, size: 0, addedAt: new Date().toISOString() };
    return this._serial(async () => {
      try {
        const bytes = await this._bytesOf(data);
        meta.size = bytes.length;
        const fs = this._fs();
        if (fs) {
          const path = this._path(meta);
          if (!path) return null;
          await fs.writeFile({ path, data: this._toBase64(bytes), directory: this.DIR, recursive: true });
          return meta;
        }
        if (!this._idb()) return null;
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const ok = await this._store('readwrite', (store) => this._req(store.put({
          id: meta.id, txId: String(txId || ''), bytes: buffer, name, mime, size: bytes.length, createdAt: meta.addedAt
        })).then(() => true));
        return ok ? meta : null;
      } catch (error) {
        console.error('Attachments: add failed', error);
        return null;
      }
    });
  },

  // The stored bytes, null when the file is gone or no backend exists.
  async read(meta) {
    if (!meta || !meta.id) return null;
    try {
      const fs = this._fs();
      if (fs) {
        const path = this._path(meta);
        if (!path) return null;
        const res = await fs.readFile({ path, directory: this.DIR });
        const data = res && res.data;
        if (data == null) return null;
        if (typeof data === 'string') return this._fromBase64(data);
        return this._bytesOf(data);
      }
      const rec = await this._store('readonly', (store) => this._req(store.get(meta.id)));
      if (!rec || !rec.bytes) return null;
      return new Uint8Array(rec.bytes);
    } catch (error) {
      if (!this._isMissing(error)) console.error('Attachments: read failed', error);
      return null;
    }
  },

  // A URL an <img> can load: the WebView file URL on native, an object URL
  // (cached per id, released by revoke) on the web. null when gone.
  async displayUrl(meta) {
    if (!meta || !meta.id) return null;
    try {
      const fs = this._fs();
      if (fs) {
        const path = this._path(meta);
        if (typeof fs.getUri !== 'function' || !path) return null;
        const res = await fs.getUri({ path, directory: this.DIR });
        const uri = res && res.uri;
        if (!uri) return null;
        const cap = window.Capacitor;
        return (cap && typeof cap.convertFileSrc === 'function') ? cap.convertFileSrc(uri) : uri;
      }
      if (this._urls[meta.id]) return this._urls[meta.id];
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
      const rec = await this._store('readonly', (store) => this._req(store.get(meta.id)));
      if (!rec || !rec.bytes) return null;
      const url = URL.createObjectURL(new Blob([rec.bytes], { type: rec.mime || meta.mime || '' }));
      this._urls[meta.id] = url;
      return url;
    } catch (error) {
      console.error('Attachments: displayUrl failed', error);
      return null;
    }
  },

  revoke(url) {
    if (!url) return;
    Object.keys(this._urls).forEach((id) => { if (this._urls[id] === url) delete this._urls[id]; });
    try {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    } catch (error) { /* already revoked */ }
  },

  _forget(id) {
    const url = this._urls[id];
    if (url) this.revoke(url);
  },

  // true when the file was deleted, false when it was already gone / no backend.
  remove(meta) {
    if (!meta || !meta.id) return Promise.resolve(false);
    return this._serial(async () => {
      try {
        this._forget(meta.id);
        const fs = this._fs();
        if (fs) {
          const path = this._path(meta);
          return path ? this._deleteNative(fs, path) : false;
        }
        const ok = await this._store('readwrite', (store) => new Promise((resolve, reject) => {
          const get = store.get(meta.id);
          get.onerror = () => reject(get.error || new Error('get failed'));
          get.onsuccess = () => {
            if (get.result === undefined) { resolve(false); return; }
            const del = store.delete(meta.id);
            del.onerror = () => reject(del.error || new Error('delete failed'));
            del.onsuccess = () => resolve(true);
          };
        }));
        return !!ok;
      } catch (error) {
        console.error('Attachments: remove failed', error);
        return false;
      }
    });
  },

  // The number of files deleted.
  async removeAll(metas) {
    let n = 0;
    for (const meta of (Array.isArray(metas) ? metas : [])) {
      if (await this.remove(meta)) n++;
    }
    return n;
  },

  // Deletes every stored file whose attachment id is not in liveIds (the ids
  // every transaction still references). Returns the number deleted.
  sweep(liveIds) {
    const live = liveIds instanceof Set ? liveIds : new Set(Array.isArray(liveIds) ? liveIds : []);
    return this._serial(async () => {
      try {
        const fs = this._fs();
        if (fs) {
          let n = 0;
          for (const f of await this._listNative(fs)) {
            const id = String(f.name).replace(/\.[^.]*$/, '');
            if (live.has(id)) continue;
            this._forget(id);
            if (await this._deleteNative(fs, this.FOLDER + '/' + f.name)) n++;
          }
          return n;
        }
        const n = await this._store('readwrite', (store) => new Promise((resolve, reject) => {
          let removed = 0;
          const req = store.openCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { resolve(removed); return; }
            if (!live.has(cursor.key)) { this._forget(cursor.key); cursor.delete(); removed++; }
            cursor.continue();
          };
          req.onerror = () => reject(req.error || new Error('cursor failed'));
        }));
        return n == null ? 0 : n;
      } catch (error) {
        console.error('Attachments: sweep failed', error);
        return 0;
      }
    });
  },

  // Everything goes (RESET_APP).
  clear() {
    return this._serial(async () => {
      try {
        Object.keys(this._urls).forEach((id) => this._forget(id));
        const fs = this._fs();
        if (fs) {
          try {
            await fs.rmdir({ path: this.FOLDER, directory: this.DIR, recursive: true });
          } catch (error) {
            if (!this._isMissing(error)) throw error;
          }
          return true;
        }
        const ok = await this._store('readwrite', (store) => this._req(store.clear()).then(() => true));
        return !!ok;
      } catch (error) {
        console.error('Attachments: clear failed', error);
        return false;
      }
    });
  },

  // { count, bytes } of everything stored.
  async usage() {
    try {
      const fs = this._fs();
      if (fs) {
        const files = await this._listNative(fs);
        return { count: files.length, bytes: files.reduce((n, f) => n + (Number.isFinite(Number(f.size)) ? Number(f.size) : 0), 0) };
      }
      const out = await this._store('readonly', (store) => new Promise((resolve, reject) => {
        const acc = { count: 0, bytes: 0 };
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) { resolve(acc); return; }
          acc.count++;
          acc.bytes += Number(cursor.value && cursor.value.size) || 0;
          cursor.continue();
        };
        req.onerror = () => reject(req.error || new Error('cursor failed'));
      }));
      return out || { count: 0, bytes: 0 };
    } catch (error) {
      console.error('Attachments: usage failed', error);
      return { count: 0, bytes: 0 };
    }
  },

  // Hands the file to the system: native through a CACHE copy and the share
  // sheet (the FileProvider covers the cache, not DATA), web by opening the
  // object URL in a new tab. false when cancelled, missing or unavailable.
  async share(meta) {
    if (!meta || !meta.id) return false;
    try {
      const fs = this._fs();
      if (fs) {
        const P = (window.Capacitor && window.Capacitor.Plugins) || {};
        const path = this._path(meta);
        if (!P.Share || !path) return false;
        const res = await fs.readFile({ path, directory: this.DIR });
        const data = res && res.data;
        if (data == null) return false;
        const base64 = typeof data === 'string' ? data : this._toBase64(await this._bytesOf(data));
        const name = this._shareName(meta);
        const written = await fs.writeFile({ path: 'exports/' + name, data: base64, directory: 'CACHE', recursive: true });
        if (!written || !written.uri) return false;
        await P.Share.share({
          title: name,
          files: [written.uri],
          dialogTitle: window.I18n ? window.I18n.t('export.shareTitle', { file: name }) : name
        });
        return true;
      }
      const url = await this.displayUrl(meta);
      if (!url || typeof window.open !== 'function') return false;
      window.open(url, '_blank');
      return true;
    } catch (error) {
      if (/cancel/i.test(String((error && error.message) || error))) return false;
      if (!this._isMissing(error)) console.error('Attachments: share failed', error);
      return false;
    }
  }
};
