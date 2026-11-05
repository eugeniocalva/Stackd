import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.2.0 (UX-10): Export → Receipts PDF. Every attachment of the rows in the
// Export period goes into ONE PDF (vendored pdf-lib, window.PDFLib): a page
// per image (embedJpg/embedPng), a caption page + the copied pages of each
// attached PDF. Native: a CACHE file written WITHOUT an encoding (base64) and
// the share sheet; web: a Blob download; nothing in the period: an info sheet.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 1, 2]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]);

// A PDFLib double recording what the export asks of it.
const makePdfLib = () => {
  const log = { pages: [], embedJpg: [], embedPng: [], copyPages: [], load: [], texts: [], images: [] };
  const page = (size) => {
    const p = { size, drawText: vi.fn((s) => log.texts.push(s)), drawImage: vi.fn((img, o) => log.images.push(o)) };
    log.pages.push(p);
    return p;
  };
  const doc = {
    embedFont: vi.fn(async () => ({ widthOfTextAtSize: (s, size) => s.length * size * 0.5 })),
    embedJpg: vi.fn(async (b) => { log.embedJpg.push(b); return { width: 1600, height: 1200 }; }),
    embedPng: vi.fn(async (b) => { log.embedPng.push(b); return { width: 400, height: 800 }; }),
    addPage: vi.fn((arg) => (Array.isArray(arg) ? page(arg) : (log.pages.push(arg), arg))),
    copyPages: vi.fn(async (src, idx) => { log.copyPages.push(idx); return idx.map(i => ({ copied: i })); }),
    save: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]))
  };
  const lib = {
    log,
    doc,
    StandardFonts: { Helvetica: 'Helvetica' },
    rgb: (r, g, b) => ({ r, g, b }),
    PDFDocument: {
      create: vi.fn(async () => doc),
      load: vi.fn(async (b) => { log.load.push(b); return { getPageIndices: () => [0, 1] }; })
    }
  };
  return lib;
};

let Filesystem;
let Share;
let files;
let pdfLib;
const S = () => global.window.Store;
const E = () => global.window.StackdExport;
const sheet = () => global.window.Components.NoticeSheet.show;

const boot = ({ native = false } = {}) => {
  let uid = 0;
  files = new Map();
  Filesystem = { writeFile: vi.fn(async ({ path }) => ({ uri: 'file:///cache/' + path })) };
  Share = { share: vi.fn(async () => ({})) };
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
  };
  if (native) global.window.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem, Share } };
  global.localStorage = global.window.localStorage;
  ['db.js', 'i18n.js', 'i18n/en.js', 'attachments.js', 'loan-engine.js', 'store.js', 'export.js'].forEach(executeFile);
  global.window.Components = { NoticeSheet: { show: vi.fn() } };
  // bytes by attachment id (the Attachments backend is not under test here)
  global.window.Attachments.read = vi.fn(async (m) => files.get(m.id) || null);
  pdfLib = makePdfLib();
  global.window.PDFLib = pdfLib;
  S().init();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
};

const meta = (id, kind) => ({ id, kind, name: id + (kind === 'pdf' ? '.pdf' : '.jpg'), ext: kind === 'pdf' ? 'pdf' : 'jpg', mime: kind === 'pdf' ? 'application/pdf' : 'image/jpeg', size: 1, addedAt: '' });
const add = (date, attachments, comment = 'row ' + date) => {
  const acc = S().getState().accounts[0];
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12.5, accountId: acc.id, categoryId: 'cat_groceries', date, comment, attachments });
};

describe('Receipts PDF: content (1.2.0, UX-10)', () => {
  beforeEach(() => { boot(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('one page per image, a caption page + copied pages per PDF, oldest row first', async () => {
    files.set('img2', JPEG); files.set('png1', PNG); files.set('doc1', PDF);
    add('2026-09-10', [meta('img2', 'image')], 'later');
    add('2026-09-01', [meta('png1', 'image'), meta('doc1', 'pdf')], 'earlier');
    const out = await E().buildReceiptsPdf(S().getState(), {});
    expect(out).toBeInstanceOf(Uint8Array);
    expect(pdfLib.log.embedPng).toEqual([PNG]);
    expect(pdfLib.log.embedJpg).toEqual([JPEG]);
    expect(pdfLib.log.load).toEqual([PDF]);
    expect(pdfLib.log.copyPages).toEqual([[0, 1]]);
    // png page, doc1 caption page, 2 copied pages, jpg page
    expect(pdfLib.log.pages).toHaveLength(5);
    expect(pdfLib.log.pages[0].size).toEqual([595.28, 841.89]);
    expect(pdfLib.log.pages[2]).toEqual({ copied: 0 });
    // the earlier row's captions come first
    const captions = pdfLib.log.texts.filter(s => s.includes('·'));
    expect(captions[0]).toContain('earlier');
    expect(captions[captions.length - 1]).toContain('later');
    expect(captions[0]).toContain('Main');
    expect(captions[0]).toContain('-$12.50'); // Store.formatCurrency, the row's currency
  });

  it('an image is scaled to fit inside the margins, below the caption', async () => {
    files.set('img', JPEG);
    add('2026-09-01', [meta('img', 'image')]);
    await E().buildReceiptsPdf(S().getState(), {});
    const o = pdfLib.log.images[0];
    expect(o.width).toBeLessThanOrEqual(595.28 - 72 + 0.001);
    expect(o.height).toBeLessThanOrEqual(841.89 - 72 - 40 + 0.001);
    expect(o.width / o.height).toBeCloseTo(1600 / 1200, 5);
  });

  it('a file this device does not hold becomes a "file missing" caption page', async () => {
    add('2026-09-01', [meta('gone', 'image')]);
    await E().buildReceiptsPdf(S().getState(), {});
    expect(pdfLib.log.pages).toHaveLength(1);
    expect(pdfLib.log.texts).toContain(global.window.I18n.t('attach.missing'));
    expect(pdfLib.log.embedJpg).toHaveLength(0);
  });

  it('a file that is here but cannot be drawn says so instead of "file missing"', async () => {
    files.set('heic', new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])); // ftypheic
    add('2026-09-01', [meta('heic', 'image')]);
    await E().buildReceiptsPdf(S().getState(), {});
    expect(pdfLib.log.pages).toHaveLength(1);
    expect(pdfLib.log.texts).toContain(global.window.I18n.t('attach.noPreview'));
    expect(pdfLib.log.texts).not.toContain(global.window.I18n.t('attach.missing'));
  });

  it('follows the Export period and the planned-payments switch', async () => {
    files.set('a', JPEG); files.set('b', JPEG);
    add('2026-08-15', [meta('a', 'image')]);
    add('2099-01-01', [meta('b', 'image')]);
    expect(E().receiptsCount(S().getState(), { period: { start: '2026-09-01', end: '' } })).toBe(1);
    expect(E().receiptsCount(S().getState(), { includePlanned: false })).toBe(1);
    expect(E().receiptsCount(S().getState(), {})).toBe(2);
    await E().buildReceiptsPdf(S().getState(), { period: { start: '2026-08-01', end: '2026-08-31' } });
    expect(pdfLib.log.embedJpg).toHaveLength(1);
  });

  it('captions are WinAnsi-safe (Helvetica cannot draw every script)', () => {
    // ó is WinAnsi; ż/ć lose their accents; ł and Ω have no WinAnsi form
    expect(E()._winAnsi('Za\u017C\u00F3\u0142\u0107 \u2014 1\u202F234,50\u00A0\u20AC \u2212 \u03A9mega\nend')).toBe('Zaz\u00F3?c \u2014 1 234,50\u00A0\u20AC - ?mega end');
  });

  it('no rows with attachments → null (and no PDF is created)', async () => {
    add('2026-09-01', undefined);
    expect(await E().buildReceiptsPdf(S().getState(), {})).toBeNull();
    expect(pdfLib.PDFDocument.create).not.toHaveBeenCalled();
  });
});

describe('Receipts PDF: hand-out (1.2.0, UX-10)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('native: writes base64 to CACHE exports/ with NO encoding and opens the share sheet', async () => {
    boot({ native: true });
    files.set('img', JPEG);
    add('2026-09-01', [meta('img', 'image')]);
    const ok = await E().exportReceiptsPdf(S().getState(), { now: new Date(2026, 10, 5, 9, 8, 7) });
    expect(ok).toBe(true);
    const args = Filesystem.writeFile.mock.calls[0][0];
    expect(args).toEqual({ path: 'exports/Stackd_receipts_20261105090807.pdf', data: btoa('%PDF-'), directory: 'CACHE', recursive: true });
    expect('encoding' in args).toBe(false);
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/exports/Stackd_receipts_20261105090807.pdf'] }));
    expect(sheet()).not.toHaveBeenCalled();
  });

  it('web: a Blob download of application/pdf named Stackd_receipts_<stamp>.pdf', async () => {
    boot();
    files.set('img', JPEG);
    add('2026-09-01', [meta('img', 'image')]);
    const blobs = [];
    global.URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:x'; });
    global.URL.revokeObjectURL = vi.fn();
    let downloaded = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloaded = this.download; });
    const ok = await E().exportReceiptsPdf(S().getState(), { now: new Date(2026, 10, 5, 9, 8, 7) });
    expect(ok).toBe(true);
    expect(downloaded).toBe('Stackd_receipts_20261105090807.pdf');
    expect(blobs[0].type).toBe('application/pdf');
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
  });

  it('nothing in the period → an info NoticeSheet, no file', async () => {
    boot({ native: true });
    add('2026-09-01', undefined);
    const ok = await E().exportReceiptsPdf(S().getState(), {});
    expect(ok).toBe(false);
    expect(sheet()).toHaveBeenCalledWith(expect.objectContaining({ tone: 'info', body: global.window.I18n.t('export.receiptsNone') }));
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
  });

  it('a build failure → the export-failed sheet', async () => {
    boot({ native: true });
    files.set('img', JPEG);
    add('2026-09-01', [meta('img', 'image')]);
    pdfLib.PDFDocument.create = vi.fn(async () => { throw new Error('boom'); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await E().exportReceiptsPdf(S().getState(), {})).toBe(false);
    expect(sheet()).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
  });
});

describe('Receipts PDF with the real vendored pdf-lib (1.2.0, UX-10)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('builds a real PDF: %PDF- header, one page per image plus the attached PDF pages', async () => {
    boot();
    const lib = readFileSync(resolve(__dirname, '../../src/libs/pdf-lib.min.js'), 'utf8');
    const holder = {};
    new Function('self', 'exports', 'module', 'define', lib).call(holder, holder, undefined, undefined, undefined);
    const PDFLib = holder.PDFLib;
    expect(PDFLib && PDFLib.PDFDocument).toBeTruthy();
    global.window.PDFLib = PDFLib;
    // a real 1×1 JPEG and a real two-page PDF
    const jpeg = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='), c => c.charCodeAt(0));
    const two = await PDFLib.PDFDocument.create();
    two.addPage(); two.addPage();
    const pdf = await two.save();
    files.set('j', jpeg); files.set('p', pdf);
    add('2026-09-01', [meta('j', 'image'), meta('p', 'pdf')], 'Café — Zażółć');
    const out = await E().buildReceiptsPdf(S().getState(), {});
    expect(String.fromCharCode(...out.slice(0, 5))).toBe('%PDF-');
    const back = await PDFLib.PDFDocument.load(out);
    expect(back.getPageCount()).toBe(1 + 1 + 2);
  });
});
