import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { IDBFactory } from 'fake-indexeddb';

// 1.2.0 (UX-10): window.Attachments keeps attachment bytes OUTSIDE the store —
// IndexedDB on the web, the Capacitor Filesystem (binary: base64, no
// encoding) on native. Every method resolves; none throws to its caller.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const A = () => global.window.Attachments;
const bytes = (...b) => new Uint8Array(b);
const JPEG = bytes(0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2D, 0x31);

// In-memory Filesystem double recording every call (as db-native.test.js).
const makeFs = () => {
  const files = new Map();
  const fs = {
    files,
    writeFile: vi.fn(async ({ path, data, directory }) => { files.set(directory + ':' + path, data); return { uri: 'file:///' + directory + '/' + path }; }),
    readFile: vi.fn(async ({ path, directory }) => {
      const k = directory + ':' + path;
      if (!files.has(k)) throw new Error('File does not exist.');
      return { data: files.get(k) };
    }),
    deleteFile: vi.fn(async ({ path, directory }) => {
      const k = directory + ':' + path;
      if (!files.has(k)) throw new Error('File does not exist.');
      files.delete(k);
    }),
    readdir: vi.fn(async ({ path, directory }) => {
      const prefix = directory + ':' + path + '/';
      const out = [];
      files.forEach((v, k) => { if (k.startsWith(prefix)) out.push({ name: k.slice(prefix.length), size: v.length }); });
      if (!out.length) throw new Error('Folder does not exist.');
      return { files: out };
    }),
    rmdir: vi.fn(async ({ path, directory }) => {
      const prefix = directory + ':' + path + '/';
      Array.from(files.keys()).forEach(k => { if (k.startsWith(prefix)) files.delete(k); });
    }),
    getUri: vi.fn(async ({ path, directory }) => ({ uri: 'file:///' + directory + '/' + path }))
  };
  return fs;
};

const boot = ({ native = false, idb = true, store = false } = {}) => {
  let uid = 0;
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
  };
  if (idb) global.window.indexedDB = new IDBFactory();
  let fs = null;
  if (native) {
    fs = makeFs();
    global.window.Capacitor = {
      isNativePlatform: () => true,
      convertFileSrc: (u) => u.replace('file://', 'https://localhost/_capacitor_file_'),
      Plugins: { Filesystem: fs, Share: { share: vi.fn(async () => ({})) } }
    };
  }
  global.localStorage = global.window.localStorage;
  (store ? ['db.js', 'i18n.js', 'i18n/en.js', 'attachments.js', 'loan-engine.js', 'store.js'] : ['db.js', 'attachments.js']).forEach(executeFile);
  return fs;
};

describe('Attachments on the web: IndexedDB (1.2.0, UX-10)', () => {
  beforeEach(() => { boot(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('add stores the bytes and returns the row meta (id, kind, name, ext, mime, size, addedAt)', async () => {
    const meta = await A().add('tx1', { bytes: JPEG, name: 'Lunch.jpg', mime: 'image/jpeg' });
    expect(meta).toMatchObject({ kind: 'image', name: 'Lunch.jpg', ext: 'jpg', mime: 'image/jpeg', size: JPEG.length });
    expect(meta.id).toMatch(/^[\w-]+$/);
    expect(typeof meta.addedAt).toBe('string');
    const back = await A().read(meta);
    expect(Array.from(back)).toEqual(Array.from(JPEG));
  });

  it('a PDF is kept as a pdf; an unknown kind is refused', async () => {
    const pdf = await A().add('tx1', { bytes: PDF, name: 'bill.pdf', mime: 'application/pdf' });
    expect(pdf.kind).toBe('pdf');
    expect(await A().add('tx1', { bytes: PDF, name: 'notes.txt', mime: 'text/plain' })).toBeNull();
  });

  it('remove deletes one file; removeAll counts what it deleted', async () => {
    const a = await A().add('t', { bytes: JPEG, name: 'a.jpg', mime: 'image/jpeg' });
    const b = await A().add('t', { bytes: JPEG, name: 'b.jpg', mime: 'image/jpeg' });
    const c = await A().add('t', { bytes: PDF, name: 'c.pdf', mime: 'application/pdf' });
    expect(await A().remove(a)).toBe(true);
    expect(await A().read(a)).toBeNull();
    expect(await A().remove(a)).toBe(false); // already gone
    expect(await A().removeAll([b, c, a])).toBe(2);
    expect(await A().usage()).toEqual({ count: 0, bytes: 0 });
  });

  it('sweep deletes every file no row references any more', async () => {
    const keep = await A().add('t', { bytes: JPEG, name: 'k.jpg', mime: 'image/jpeg' });
    const orphan = await A().add('t', { bytes: PDF, name: 'o.pdf', mime: 'application/pdf' });
    expect(await A().sweep(new Set([keep.id]))).toBe(1);
    expect(await A().read(keep)).not.toBeNull();
    expect(await A().read(orphan)).toBeNull();
  });

  it('clear wipes the store; usage reports count and bytes', async () => {
    await A().add('t', { bytes: JPEG, name: 'k.jpg', mime: 'image/jpeg' });
    await A().add('t', { bytes: PDF, name: 'o.pdf', mime: 'application/pdf' });
    expect(await A().usage()).toEqual({ count: 2, bytes: JPEG.length + PDF.length });
    expect(await A().clear()).toBe(true);
    expect((await A().usage()).count).toBe(0);
  });

  it('displayUrl hands out one object URL per attachment, released by revoke', async () => {
    const created = [];
    const revoked = [];
    global.URL.createObjectURL = vi.fn(() => { const u = 'blob:' + created.length; created.push(u); return u; });
    global.URL.revokeObjectURL = vi.fn((u) => revoked.push(u));
    const meta = await A().add('t', { bytes: JPEG, name: 'k.jpg', mime: 'image/jpeg' });
    const url = await A().displayUrl(meta);
    expect(url).toBe('blob:0');
    expect(await A().displayUrl(meta)).toBe('blob:0'); // cached
    A().revoke(url);
    expect(revoked).toEqual(['blob:0']);
    expect(await A().displayUrl(meta)).toBe('blob:1');
  });

  it('prepare stores the original bytes when no decoder or canvas exists', async () => {
    const file = new Blob([JPEG], { type: 'image/png' });
    file.name = 'scan.png';
    const p = await A().prepare(file);
    expect(p).toMatchObject({ kind: 'image', ext: 'png', mime: 'image/png', name: 'scan.png' });
    expect(p.blob).toBe(file);
  });

  it('prepare re-encodes images through a canvas (max 1600 px, JPEG 0.82)', async () => {
    const drawn = [];
    const toBlob = vi.fn((cb, type, q) => cb(new Blob([JPEG], { type })));
    global.window.createImageBitmap = vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() }));
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag !== 'canvas') return realCreate(tag);
      const c = { width: 0, height: 0, toBlob, getContext: () => ({ drawImage: (img, x, y, w, h) => drawn.push([w, h]) }) };
      return c;
    });
    const file = new Blob([bytes(1, 2, 3)], { type: 'image/heic' });
    file.name = 'IMG_0001.HEIC';
    const p = await A().prepare(file);
    expect(p).toMatchObject({ kind: 'image', ext: 'jpg', mime: 'image/jpeg', name: 'IMG_0001.jpg' });
    expect(drawn).toEqual([[1600, 1200]]);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.82);
  });

  it('prepare refuses an image the decoder here cannot read (a HEIC on Android) instead of storing it raw', async () => {
    const toBlob = vi.fn((cb, type) => cb(new Blob([JPEG], { type })));
    global.window.createImageBitmap = vi.fn(async () => { throw new Error('InvalidStateError'); });
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag !== 'canvas') return realCreate(tag);
      return { width: 0, height: 0, toBlob, getContext: () => ({ drawImage: () => {} }) };
    });
    // the <img> fallback cannot read it either
    vi.stubGlobal('Image', class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } });
    const heic = new Blob([bytes(1, 2, 3)], { type: 'image/heic' });
    heic.name = 'IMG_0002.HEIC';
    try {
      expect(await A().prepare(heic)).toEqual({ error: 'unreadable' });
    } finally { vi.unstubAllGlobals(); }
    expect(toBlob).not.toHaveBeenCalled();
    // decodable, but the canvas writes nothing → failed (never the raw bytes)
    global.window.createImageBitmap = vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() }));
    toBlob.mockImplementation((cb) => cb(null));
    expect(await A().prepare(heic)).toEqual({ error: 'failed' });
  });

  it('prepare refuses a PDF over 10 MB and an unsupported type', async () => {
    const big = { name: 'huge.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 + 1 };
    expect(await A().prepare(big)).toEqual({ error: 'tooLarge' });
    expect(await A().prepare({ name: 'a.zip', type: 'application/zip', size: 3 })).toEqual({ error: 'unsupported' });
  });

  it('never throws: no backend → null / false / zero', async () => {
    boot({ idb: false });
    expect(A().available()).toBe(false);
    expect(await A().add('t', { bytes: JPEG, name: 'a.jpg', mime: 'image/jpeg' })).toBeNull();
    expect(await A().read({ id: 'x', ext: 'jpg' })).toBeNull();
    expect(await A().remove({ id: 'x', ext: 'jpg' })).toBe(false);
    expect(await A().sweep(new Set())).toBe(0);
  });
});

describe('Attachments on native: Filesystem, binary (1.2.0, UX-10)', () => {
  let fs;
  beforeEach(() => { fs = boot({ native: true }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('writes base64 under DATA/stackd_attachments with NO encoding, reads it back the same way', async () => {
    const meta = await A().add('tx1', { bytes: JPEG, name: 'r.jpg', mime: 'image/jpeg' });
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const args = fs.writeFile.mock.calls[0][0];
    expect(args).toEqual({ path: 'stackd_attachments/' + meta.id + '.jpg', data: btoa(String.fromCharCode(...JPEG)), directory: 'DATA', recursive: true });
    expect('encoding' in args).toBe(false);
    const back = await A().read(meta);
    expect(Array.from(back)).toEqual(Array.from(JPEG));
    const readArgs = fs.readFile.mock.calls[0][0];
    expect(readArgs).toEqual({ path: 'stackd_attachments/' + meta.id + '.jpg', directory: 'DATA' });
    expect('encoding' in readArgs).toBe(false);
  });

  it('never writes inside stackd_db/ (db.js owns that folder)', async () => {
    await A().add('tx1', { bytes: PDF, name: 'b.pdf', mime: 'application/pdf' });
    fs.writeFile.mock.calls.forEach(([a]) => expect(a.path.startsWith('stackd_db/')).toBe(false));
  });

  it('displayUrl is the WebView file URL (convertFileSrc of getUri)', async () => {
    const meta = await A().add('tx1', { bytes: JPEG, name: 'r.jpg', mime: 'image/jpeg' });
    expect(await A().displayUrl(meta)).toBe('https://localhost/_capacitor_file_/DATA/stackd_attachments/' + meta.id + '.jpg');
  });

  it('remove / removeAll delete the files; a missing file is not an error', async () => {
    const a = await A().add('t', { bytes: JPEG, name: 'a.jpg', mime: 'image/jpeg' });
    const b = await A().add('t', { bytes: PDF, name: 'b.pdf', mime: 'application/pdf' });
    expect(await A().removeAll([a, b])).toBe(2);
    expect(fs.deleteFile).toHaveBeenCalledWith({ path: 'stackd_attachments/' + a.id + '.jpg', directory: 'DATA' });
    expect(await A().remove(a)).toBe(false);
    expect(fs.files.size).toBe(0);
  });

  it('sweep lists the folder and deletes the unreferenced files', async () => {
    const keep = await A().add('t', { bytes: JPEG, name: 'k.jpg', mime: 'image/jpeg' });
    const gone = await A().add('t', { bytes: PDF, name: 'g.pdf', mime: 'application/pdf' });
    expect(await A().sweep(new Set([keep.id]))).toBe(1);
    expect(fs.files.has('DATA:stackd_attachments/' + keep.id + '.jpg')).toBe(true);
    expect(fs.files.has('DATA:stackd_attachments/' + gone.id + '.pdf')).toBe(false);
  });

  it('clear removes the whole folder', async () => {
    await A().add('t', { bytes: JPEG, name: 'k.jpg', mime: 'image/jpeg' });
    expect(await A().clear()).toBe(true);
    expect(fs.rmdir).toHaveBeenCalledWith({ path: 'stackd_attachments', directory: 'DATA', recursive: true });
  });

  it('a restored meta whose id or extension could leave the folder is never used as a path', async () => {
    expect(await A().read({ id: '../stackd_db/stackd_v1_accounts', ext: 'json' })).toBeNull();
    expect(await A().remove({ id: 'ok', ext: '../x' })).toBe(false);
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.deleteFile).not.toHaveBeenCalled();
  });

  it('share copies the file to CACHE exports/ (no encoding) and opens the share sheet', async () => {
    const meta = await A().add('t', { bytes: PDF, name: 'Electricity bill.pdf', mime: 'application/pdf' });
    expect(await A().share(meta)).toBe(true);
    const cacheWrite = fs.writeFile.mock.calls.map(c => c[0]).find(a => a.directory === 'CACHE');
    expect(cacheWrite).toEqual({ path: 'exports/Electricity bill.pdf', data: btoa(String.fromCharCode(...PDF)), directory: 'CACHE', recursive: true });
    expect(global.window.Capacitor.Plugins.Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///CACHE/exports/Electricity bill.pdf'] }));
  });
});

describe('Attachments.sanitizeMetas / sniff (1.2.0, UX-10)', () => {
  beforeEach(() => { boot({ store: true }); });

  it('keeps safe metas, maps unsafe ids, drops unusable entries and caps at 8', () => {
    const list = A().sanitizeMetas([
      { id: 'a1', kind: 'image', name: 'x\ny.jpg', ext: 'jpg', mime: 'image/jpeg', size: 10, addedAt: '2026-11-05T10:00:00.000Z' },
      { id: '<img src=x>', kind: 'pdf', name: 'b.pdf', ext: 'pdf' },
      { id: 'a1', kind: 'image' }, // duplicate
      { id: 'z', kind: 'video', name: 'v.mp4' }, // unknown kind
      null,
      'nope'
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ id: 'a1', kind: 'image', name: 'x y.jpg', ext: 'jpg', mime: 'image/jpeg', size: 10, addedAt: '2026-11-05T10:00:00.000Z' });
    expect(list[1].id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(list[1].id).not.toContain('<');
    const many = Array.from({ length: 12 }, (_, i) => ({ id: 'm' + i, kind: 'pdf', name: i + '.pdf', ext: 'pdf' }));
    expect(A().sanitizeMetas(many)).toHaveLength(8);
    expect(A().sanitizeMetas('[]')).toEqual([]);
  });

  it('sniff tells JPEG, PNG and PDF by their bytes', () => {
    expect(A().sniff(JPEG)).toBe('jpg');
    expect(A().sniff(bytes(0x89, 0x50, 0x4E, 0x47, 0x0D))).toBe('png');
    expect(A().sniff(PDF)).toBe('pdf');
    expect(A().sniff(bytes(1, 2, 3, 4))).toBeNull();
  });
});
