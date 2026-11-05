import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.2.0 (UX-11, docs/ux-review-1.2-plan.md §E.1–E.2): the one-file backup.
// StackdBackup.buildBundle collects the six backup CSV texts through
// StackdExport._sink; StackdImport restores a bundle through the six restore
// routes inside ONE change; the daily run is opportunistic (boot + resume)
// with its guards; the log is capped at 20; automatic files are pruned to the
// ten newest; the destination is iCloud Drive (the local stackd-cloud
// plugin), the device's Documents folder, or a download on the web.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Functional localStorage with an optional character quota (storageFull.test.js).
const makeLocalStorage = () => {
  const map = new Map();
  const size = () => { let n = 0; map.forEach((v, k) => { n += k.length + v.length; }); return n; };
  const ls = {
    quota: null,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      if (ls.quota != null) {
        const cur = map.has(k) ? k.length + map.get(k).length : 0;
        if (size() - cur + k.length + s.length > ls.quota) {
          const e = new Error('The quota has been exceeded.');
          e.name = 'QuotaExceededError';
          throw e;
        }
      }
      map.set(k, s);
    },
    removeItem: (k) => { map.delete(k); },
    size
  };
  return ls;
};

// The Filesystem plugin proxy, in memory: { 'DIR:path': text }.
const makeFilesystem = () => {
  const files = new Map();
  const fs = {
    files,
    refuse: new Set(), // directories whose writes are refused (API ≤ 29 Documents)
    writeFile: vi.fn(async ({ path, data, directory }) => {
      if (fs.refuse.has(directory)) throw new Error('Permission denied');
      files.set(directory + ':' + path, { data, mtime: Date.now() });
      return { uri: 'file:///' + directory + '/' + path };
    }),
    readFile: vi.fn(async ({ path, directory }) => {
      const f = files.get(directory + ':' + path);
      if (!f) throw new Error('File does not exist');
      return { data: f.data };
    }),
    readdir: vi.fn(async ({ path, directory }) => {
      const prefix = directory + ':' + path + '/';
      const out = [];
      files.forEach((f, k) => {
        if (k.startsWith(prefix)) out.push({ name: k.slice(prefix.length), type: 'file', size: f.data.length, mtime: f.mtime });
      });
      if (!out.length) throw new Error('Directory does not exist');
      return { files: out };
    }),
    deleteFile: vi.fn(async ({ path, directory }) => {
      if (!files.delete(directory + ':' + path)) throw new Error('File does not exist');
    })
  };
  return fs;
};

// The stackd-cloud proxy (iOS): an in-memory ubiquity folder.
const makeCloud = (available = true) => {
  const files = new Map();
  return {
    files,
    available: vi.fn(async () => ({ available })),
    write: vi.fn(async ({ name, data }) => { files.set(name, data); return { uri: 'file:///icloud/' + name }; }),
    read: vi.fn(async ({ name }) => { if (!files.has(name)) throw new Error('not found'); return { data: files.get(name) }; }),
    list: vi.fn(async () => ({ files: [...files.keys()].map((name, i) => ({ name, size: files.get(name).length, mtime: i })) })),
    remove: vi.fn(async ({ name }) => { files.delete(name); })
  };
};

let ls;
let bootNo = 0;
const boot = ({ platform = null, plugins = {} } = {}) => {
  let uid = 0;
  const prefix = 'b' + (++bootNo) + '-u-';
  ls = makeLocalStorage();
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: ls,
    StackdHydrateIcons: vi.fn()
  };
  if (platform) {
    global.window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: plugins };
  }
  global.localStorage = ls;
  global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'export.js', 'import.js', 'backup.js'].forEach(executeFile);
  global.window.Components = { NoticeSheet: { show: vi.fn() } };
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', 'EUR');
  return global.window;
};

const S = () => global.window.Store;
const B = () => global.window.StackdBackup;
const E = () => global.window.StackdExport;
const I = () => global.window.StackdImport;
const DB = () => global.window.StackdDB;
const t = (k, p) => global.window.I18n.t(k, p);
const flush = () => new Promise((r) => setTimeout(r, 0));
const acc = (name) => S().getState().accounts.find(a => a.name === name);
const cat = (name) => S().getState().categories.find(c => c.name === name);

const buildLedger = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', type: 'Bank', icon: 'landmark', color: '#123456', openingBalance: 1000, openingDate: '2026-01-01' });
  S().dispatch('ADD_ACCOUNT', { name: 'US Card', type: 'Card', icon: 'credit-card', color: '#abcdef', currency: 'USD', openingBalance: -500, openingDate: '2026-01-15' });
  S().dispatch('ADD_CATEGORY', { name: 'Hobbies', icon: 'guitar', typeHint: 'expense' });
  S().dispatch('ADD_CATEGORY', { name: 'Side gigs', icon: 'briefcase', typeHint: 'income' });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 40, accountId: acc('Main Bank').id, categoryId: 'cat_groceries', date: '2026-02-03' });
  S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 120, accountId: acc('Main Bank').id, categoryId: cat('Side gigs').id, date: '2026-02-10', comment: 'Café "Ü" ok' });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 15, accountId: acc('US Card').id, categoryId: cat('Hobbies').id, date: '2026-02-04' });
  S().dispatch('SAVE_BUDGET', { categoryId: cat('Hobbies').id, amount: 60, startDate: '2026-01', endDate: null, isCumulative: true });
  S().dispatch('ADD_IMPORT_RULE', { match: 'guitar shop', categoryId: cat('Hobbies').id });
  S().dispatch('ADD_LOAN', {
    name: 'Car', kind: 'sim',
    config: { type: 'personal', principal: 12000, downPayment: 0, duration: 4, durationUnit: 'years', annualRate: 5, firstPaymentDate: '2026-03-01', amortization: 'french' }
  });
};

const snapshot = () => {
  const st = S().getState();
  const catName = (id) => (st.categories.find(c => c.id === id) || {}).name;
  const accounts = {};
  st.accounts.forEach((a) => { accounts[a.name] = { balance: S().getAccountBalance(a.id), currency: a.currency, type: a.type, icon: a.icon, color: a.color }; });
  return {
    accounts,
    categories: st.categories.filter(c => !c.isDefault).map(c => [c.name, c.icon, c.typeHint]).sort(),
    budgets: st.budgets.filter(b => b.amount > 0).map(b => [catName(b.categoryId), b.amount, b.startDate]),
    rules: st.importRules.map(r => [r.match, catName(r.categoryId)]),
    loans: st.loans.map(l => [l.name, l.kind, l.config.principal]),
    notes: st.transactions.filter(x => x.comment).map(x => x.comment),
    rows: st.transactions.length
  };
};

// The texts the six backup buttons hand to _download.
const sixFiles = () => {
  const out = {};
  const spy = vi.spyOn(E(), '_download').mockImplementation((name, content) => { out[name] = content; return Promise.resolve(true); });
  const st = S().getState();
  E().exportAccounts(st); E().exportCategories(st); E().exportTransactions(st);
  E().exportLoans(st); E().exportBudgets(st); E().exportImportRules(st);
  spy.mockRestore();
  return out;
};

const restore = (text) => {
  let result = null;
  let error = null;
  I().importText(text, { mode: 'restore' }, (r) => { result = r; }, (e) => { error = e; });
  return { result, error };
};

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('1.2.0 (UX-11) backup bundle — build through the export sink', () => {
  beforeEach(() => { boot(); buildLedger(); });

  it('_download hands the raw text to a sink and delivers nothing', async () => {
    const sink = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    E()._sink = sink;
    const ok = await E()._download('x.csv', 'a,b', 'text/csv');
    E()._sink = null;
    expect(ok).toBe(true);
    expect(sink).toHaveBeenCalledWith('x.csv', 'a,b', 'text/csv');
    expect(click).not.toHaveBeenCalled();
  });

  it('holds the exact texts of the six backup exporters, and restores the sink', () => {
    const six = sixFiles();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const bundle = B().buildBundle(S().getState());
    expect(click).not.toHaveBeenCalled();
    expect(E()._sink).toBeNull();
    expect(bundle.format).toBe('stackd-backup');
    expect(bundle.version).toBe(1);
    expect(bundle.app).toBe("Stack'd 1.2.0");
    expect(bundle.language).toBe('en');
    expect(Number.isNaN(Date.parse(bundle.createdAt))).toBe(false);
    expect(Object.keys(bundle.files)).toEqual(['accounts', 'categories', 'transactions', 'loans', 'budgets', 'importRules']);
    expect(bundle.files).toEqual({
      accounts: six['stackd_accounts.csv'],
      categories: six['stackd_categories.csv'],
      transactions: six['stackd_transactions.csv'],
      loans: six['stackd_loans.csv'],
      budgets: six['stackd_budgets.csv'],
      importRules: six['stackd_import_rules.csv']
    });
    expect(bundle.files.transactions.charCodeAt(0)).not.toBe(0xFEFF); // the sink sees the text, never the BOM
  });

  it('analyzeText names a bundle with per-file row counts; other JSON is not a bundle', () => {
    const text = JSON.stringify(B().buildBundle(S().getState()));
    const a = I().analyzeText(text);
    expect(a.kind).toBe('bundle');
    expect(a.files.accounts.rowCount).toBe(2);
    expect(a.files.loans.rowCount).toBe(1);
    expect(a.files.importRules.rowCount).toBe(1);
    expect(a.rowCount).toBeGreaterThan(5);
    expect(I().analyzeText(JSON.stringify({ format: 'other', files: {} })).kind).not.toBe('bundle');
    expect(I()._parseBundle('{"format":"stackd-backup","files":[]}')).toBeNull();
    expect(I()._parseBundle('﻿  ' + text)).not.toBeNull();
  });
});

describe('1.2.0 (UX-11) backup bundle — restore', () => {
  it('restores onto a new install in ONE change, with the same counts as the six files one by one', () => {
    boot();
    buildLedger();
    const before = snapshot();
    const text = JSON.stringify(B().buildBundle(S().getState()));
    const six = sixFiles();

    // Reference: the six files through the old route, one by one.
    boot();
    const ref = {};
    [['accounts', 'stackd_accounts.csv'], ['categories', 'stackd_categories.csv'], ['transactions', 'stackd_transactions.csv'],
      ['loans', 'stackd_loans.csv'], ['budgets', 'stackd_budgets.csv'], ['importRules', 'stackd_import_rules.csv']]
      .forEach(([k, f]) => { ref[k] = restore(six[f]).result; });

    boot(); // the new phone
    let outer = 0;
    const begin = DB().begin.bind(DB());
    DB().begin = () => { if (!DB()._journal) outer += 1; begin(); };
    const { result, error } = restore(text);
    expect(error).toBeNull();
    expect(outer).toBe(1); // one change for the six files
    expect(result.kind).toBe('bundle');
    Object.keys(ref).forEach((k) => {
      expect(result.files[k].kind).toBe(ref[k].kind);
      expect(result.files[k].importedCount).toBe(ref[k].importedCount);
    });
    expect(result.importedCount).toBe(Object.values(ref).reduce((n, r) => n + r.importedCount, 0));
    expect(snapshot()).toEqual(before);

    // The same bundle again adds nothing.
    const again = restore(text).result;
    expect(again.files.transactions.importedCount).toBe(0);
    expect(again.files.loans.importedCount).toBe(0);
    expect(snapshot()).toEqual(before);
  });

  it('restores through importCSV (a picked .json file) and checkText reports the same counts writing nothing', () => {
    boot();
    buildLedger();
    const text = JSON.stringify(B().buildBundle(S().getState()));
    boot();
    const check = I().checkText(text);
    expect(check.kind).toBe('bundle');
    expect(S().getState().accounts).toHaveLength(0);
    expect(ls.getItem('stackd_v1_accounts')).toBeNull();
    let picked = null;
    I().importCSV({ text }, S().getState(), (r) => { picked = r; }, (e) => { throw e; });
    expect(picked.kind).toBe('bundle');
    Object.keys(picked.files).forEach((k) => expect(check.result.files[k].importedCount).toBe(picked.files[k].importedCount));
    expect(S().getState().accounts.map(a => a.name).sort()).toEqual(['Main Bank', 'US Card']);
  });

  it('a bundle that does not fit lands nothing and says storage is full', () => {
    boot();
    buildLedger();
    const text = JSON.stringify(B().buildBundle(S().getState()));
    boot();
    ls.quota = ls.size() + 600; // room for the accounts, not for the rest
    const { result, error } = restore(text);
    expect(result).toBeNull();
    expect(error.message).toBe(t('others.importStorageFull'));
    expect(S().getState().accounts).toHaveLength(0);
    expect(ls.getItem('stackd_v1_accounts')).toBeNull();
  });

  it('a damaged slot (a bank CSV where a backup text belongs) rolls the whole bundle back', () => {
    boot();
    buildLedger();
    const bundle = B().buildBundle(S().getState());
    bundle.files.loans = 'Datum;Betrag;Text\n01.02.2026;-5,00;Shop\n';
    boot();
    const { result, error } = restore(JSON.stringify(bundle));
    expect(result).toBeNull();
    expect(error.message).toBe(t('backup.badBundle'));
    expect(S().getState().accounts).toHaveLength(0);
    expect(restore(JSON.stringify({ format: 'stackd-backup', version: 1, files: {} })).error.message).toBe(t('backup.badBundle'));
  });
});

describe('1.2.0 (UX-11) backup log and prefs', () => {
  beforeEach(() => boot());

  it('APPEND_BACKUP_LOG keeps the 20 newest, newest first, with bounded normalized values', () => {
    for (let i = 0; i < 25; i++) S().dispatch('APPEND_BACKUP_LOG', { kind: 'manual', target: 'download', name: 'f' + i + '.json', bytes: 100, ok: true });
    const log = S().getState().backupLog;
    expect(log).toHaveLength(20);
    expect(log[0].name).toBe('f24.json');
    expect(log[19].name).toBe('f5.json');
    expect(JSON.parse(ls.getItem('stackd_v1_backupLog'))).toHaveLength(20);
    S().dispatch('APPEND_BACKUP_LOG', { kind: 'weird', target: 'mars', name: 'x'.repeat(500), ok: true, error: 'ignored', bytes: -3 });
    const e = S().getState().backupLog[0];
    expect(e.kind).toBe('manual');
    expect(e.target).toBe('');
    expect(e.name).toHaveLength(200);
    expect(e.error).toBe('');
    expect(e.bytes).toBe(0);
    expect(typeof e.id).toBe('string');
    expect(Number.isNaN(Date.parse(e.at))).toBe(false);
  });

  it('SET_BACKUP_PREFS merges and keeps only known values; RESET_APP clears both slices', () => {
    expect(S().getBackupPrefs()).toEqual({ daily: false, lastAutoAt: null, lastFailDay: '' });
    S().dispatch('SET_BACKUP_PREFS', { daily: true, junk: 1 });
    S().dispatch('SET_BACKUP_PREFS', { lastAutoAt: 'not a date', silent: true });
    expect(S().getBackupPrefs()).toEqual({ daily: true, lastAutoAt: null, lastFailDay: '' });
    expect(JSON.parse(ls.getItem('stackd_v1_backupPrefs'))).toEqual({ daily: true, lastAutoAt: null, lastFailDay: '' });
    S().dispatch('APPEND_BACKUP_LOG', { kind: 'auto', ok: true });
    S().dispatch('RESET_APP');
    expect(S().getBackupPrefs().daily).toBe(false);
    expect(S().getState().backupLog).toEqual([]);
  });
});

describe('1.2.0 (UX-11) destinations', () => {
  it('web: the target is a download, and Back up now downloads the bundle as JSON without a BOM', async () => {
    boot();
    buildLedger();
    expect(B().target()).toBe('download');
    expect(await B().probe()).toBe('download');
    const orig = E()._download;
    const delivered = [];
    vi.spyOn(E(), '_download').mockImplementation(function (...args) {
      if (E()._sink) return orig.apply(E(), args); // the bundle's own collection
      delivered.push(args);
      return Promise.resolve(true);
    });
    const entry = await B().backupNow({ kind: 'manual' });
    expect(entry.ok).toBe(true);
    expect(entry.target).toBe('download');
    expect(entry.name).toMatch(/^Stackd_backup_\d{8}_\d{6}\.json$/);
    expect(delivered).toHaveLength(1); // one file: the bundle, not six CSVs
    const [name, text, type, opts] = delivered[0];
    expect(name).toBe(entry.name);
    expect(type).toMatch(/^application\/json/);
    expect(opts).toEqual({ bom: false });
    expect(JSON.parse(text).format).toBe('stackd-backup');
    expect(S().getState().backupLog[0]).toMatchObject({ kind: 'manual', target: 'download', name: entry.name, ok: true, bytes: entry.bytes });
    expect(B().maybeDaily(Date.now() + 10 * 86400000)).toBe(false); // never on the web
  });

  it('Android: StackdCloud answers unavailable, the bundle goes to public Documents', async () => {
    const fs = makeFilesystem();
    boot({ platform: 'android', plugins: { Filesystem: fs, StackdCloud: makeCloud(false) } });
    expect(await B().probe()).toBe('documents');
    const entry = await B().backupNow({ kind: 'manual' });
    expect(entry).toMatchObject({ ok: true, target: 'documents' });
    expect(fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'Stackd Backups/' + entry.name, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true }));
    expect(await B().read(entry.name)).toContain('"format":"stackd-backup"');
  });

  it('Android: refused public Documents (API <= 29) falls back to the app folder', async () => {
    const fs = makeFilesystem();
    fs.refuse.add('DOCUMENTS');
    boot({ platform: 'android', plugins: { Filesystem: fs } });
    const entry = await B().backupNow({ kind: 'manual' });
    expect(entry).toMatchObject({ ok: true, target: 'documents' });
    expect(fs.files.has('DATA:Stackd Backups/' + entry.name)).toBe(true);
  });

  it('iOS: iCloud Drive when the plugin says so; a failed iCloud write lands in the app folder', async () => {
    const fs = makeFilesystem();
    const cloud = makeCloud(true);
    boot({ platform: 'ios', plugins: { Filesystem: fs, StackdCloud: cloud } });
    expect(B().target()).toBe('documents'); // not probed yet
    expect(await B().probe()).toBe('icloud');
    const entry = await B().backupNow({ kind: 'manual' });
    expect(entry).toMatchObject({ ok: true, target: 'icloud' });
    expect(cloud.write).toHaveBeenCalledWith({ name: entry.name, data: expect.stringContaining('stackd-backup') });
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(await B().read(entry.name, 'icloud')).toContain('stackd-backup');

    cloud.write.mockRejectedValueOnce(new Error('quota'));
    vi.spyOn(B(), 'probe').mockResolvedValue('icloud');
    B()._cloudAvailable = true;
    const second = await B().backupNow({ kind: 'manual' });
    expect(second).toMatchObject({ ok: true, target: 'documents' });
    expect(fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({ directory: 'DATA', path: 'Stackd Backups/' + second.name }));
  });

  it('iOS without the plugin (or signed out of iCloud): the app Documents folder', async () => {
    const fs = makeFilesystem();
    boot({ platform: 'ios', plugins: { Filesystem: fs } });
    expect(await B().probe()).toBe('documents');
    boot({ platform: 'ios', plugins: { Filesystem: fs, StackdCloud: makeCloud(false) } });
    expect(await B().probe()).toBe('documents');
    const entry = await B().backupNow({ kind: 'manual' });
    expect(fs.files.has('DATA:Stackd Backups/' + entry.name)).toBe(true);
  });

  it('a failed write is logged, not thrown', async () => {
    const fs = makeFilesystem();
    fs.refuse.add('DOCUMENTS');
    fs.refuse.add('DATA');
    boot({ platform: 'android', plugins: { Filesystem: fs } });
    const entry = await B().backupNow({ kind: 'manual' });
    expect(entry.ok).toBe(false);
    expect(S().getState().backupLog[0]).toMatchObject({ ok: false, kind: 'manual', error: 'Permission denied' });
  });

  it('file names never carry a path', async () => {
    boot({ platform: 'android', plugins: { Filesystem: makeFilesystem() } });
    await expect(B().write('../stackd_db/x.json', '{}')).rejects.toThrow();
    await expect(B().read('a/b.json')).rejects.toThrow();
    expect(await B().remove('..')).toBe(false);
  });
});

describe('1.2.0 (UX-11) automatic backups', () => {
  const T0 = new Date(2026, 10, 5, 9, 0, 0).getTime();

  const nativeBoot = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const fs = makeFilesystem();
    boot({ platform: 'android', plugins: { Filesystem: fs } });
    buildLedger();
    return fs;
  };
  const autoFiles = (fs) => [...fs.files.keys()].filter(k => /Stackd_auto_/.test(k));

  it('maybeDaily runs once a day when the toggle is on, never within 3 s of boot', async () => {
    const fs = nativeBoot();
    expect(B().maybeDaily(T0 + 60000)).toBe(false); // toggle off
    S().dispatch('SET_BACKUP_PREFS', { daily: true });
    expect(B().maybeDaily(T0 + 1000)).toBe(false); // boot grace
    vi.setSystemTime(T0 + 5000);
    expect(B().maybeDaily(T0 + 5000)).toBe(true);
    expect(B().maybeDaily(T0 + 5001)).toBe(false); // a run is in progress
    await flush(); await flush();
    expect(autoFiles(fs)).toHaveLength(1);
    expect(autoFiles(fs)[0]).toMatch(/^DOCUMENTS:Stackd Backups\/Stackd_auto_20261105_090005\.json$/);
    const log = S().getState().backupLog;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: 'auto', target: 'documents', ok: true });
    expect(S().getBackupPrefs().lastAutoAt).toBe(new Date(T0 + 5000).toISOString());

    expect(B().maybeDaily(T0 + 5000 + 23 * 3600000)).toBe(false); // less than a day
    vi.setSystemTime(T0 + 5000 + 24 * 3600000);
    expect(B().maybeDaily(T0 + 5000 + 24 * 3600000)).toBe(true);
    await flush(); await flush();
    expect(autoFiles(fs)).toHaveLength(2);
  });

  it('never runs while a share sheet is up, inside a dry run or with a save failure pending', () => {
    nativeBoot();
    S().dispatch('SET_BACKUP_PREFS', { daily: true });
    const at = T0 + 10000;
    E()._busy = true;
    expect(B().maybeDaily(at)).toBe(false);
    E()._busy = false;
    DB()._dry = { touched: new Set() };
    expect(B().maybeDaily(at)).toBe(false);
    DB()._dry = null;
    S()._saveFailure = { quota: true, boot: false };
    expect(B().maybeDaily(at)).toBe(false);
    S()._saveFailure = null;
    const spy = vi.spyOn(B(), 'backupNow').mockResolvedValue({ ok: true });
    expect(B().maybeDaily(at)).toBe(true);
    expect(spy).toHaveBeenCalledWith({ kind: 'auto', silent: true });
  });

  it('keeps the ten newest automatic files and never touches manual ones', async () => {
    const fs = nativeBoot();
    for (let i = 1; i <= 12; i++) fs.files.set('DOCUMENTS:Stackd Backups/Stackd_auto_202610' + String(i).padStart(2, '0') + '_080000.json', { data: '{}', mtime: i });
    fs.files.set('DOCUMENTS:Stackd Backups/Stackd_backup_20260101_080000.json', { data: '{}', mtime: 0 });
    fs.files.set('DOCUMENTS:Stackd Backups/notes.txt', { data: 'x', mtime: 0 });
    const entry = await B().backupNow({ kind: 'auto' });
    expect(entry.ok).toBe(true);
    const autos = autoFiles(fs).map(k => k.split('/').pop()).sort();
    expect(autos).toHaveLength(10);
    expect(autos[autos.length - 1]).toBe(entry.name);
    expect(autos).not.toContain('Stackd_auto_20261001_080000.json');
    expect(autos).not.toContain('Stackd_auto_20261003_080000.json');
    expect(autos).toContain('Stackd_auto_20261004_080000.json');
    expect(fs.files.has('DOCUMENTS:Stackd Backups/Stackd_backup_20260101_080000.json')).toBe(true);
    expect(fs.files.has('DOCUMENTS:Stackd Backups/notes.txt')).toBe(true);
  });

  it('a failing automatic run shows one sheet a day, logs and waits before retrying', async () => {
    const fs = nativeBoot();
    fs.refuse.add('DOCUMENTS');
    fs.refuse.add('DATA');
    S().dispatch('SET_BACKUP_PREFS', { daily: true });
    const sheet = global.window.Components.NoticeSheet.show;
    expect(B().maybeDaily(T0 + 5000)).toBe(true);
    await flush(); await flush();
    expect(sheet).toHaveBeenCalledTimes(1);
    expect(sheet.mock.calls[0][0]).toMatchObject({ id: 'backup-result-modal', tone: 'error', title: t('backup.failedTitle') });
    expect(S().getState().backupLog[0]).toMatchObject({ kind: 'auto', ok: false });
    expect(S().getBackupPrefs().lastAutoAt).toBeNull();
    expect(B().maybeDaily(T0 + 5000 + 60000)).toBe(false); // the retry waits an hour
    expect(B().maybeDaily(T0 + 5000 + 2 * 3600000)).toBe(true);
    await flush(); await flush();
    expect(sheet).toHaveBeenCalledTimes(1); // same day: no second sheet
  });

  it('restoreFrom reads a file of the backup folder and restores it through the one route', async () => {
    const fs = nativeBoot();
    const entry = await B().backupNow({ kind: 'manual' });
    const before = snapshot();
    boot({ platform: 'android', plugins: { Filesystem: fs } }); // a new install, same Documents folder
    expect(S().getState().accounts).toHaveLength(0);
    let result = null;
    await B().restoreFrom(entry.name, 'documents', (r) => { result = r; }, (e) => { throw e; });
    expect(result.kind).toBe('bundle');
    expect(snapshot()).toEqual(before);
    let err = null;
    await B().restoreFrom('Stackd_backup_19990101_000000.json', 'documents', () => {}, (e) => { err = e; });
    expect(err.message).toBe(t('backup.notFound'));
    expect(fs.readFile).toHaveBeenCalled();
  });
});

// Review fixes (UX-11): the page lists the backup folder itself, so a file
// whose log row is gone (cap of 20, RESET_APP) stays restorable and a pruned
// automatic file is never offered.
describe('1.2.0 (UX-11) listAll — the saved files the page offers', () => {
  it('web: nothing to list', async () => {
    boot();
    expect(await B().listAll()).toEqual([]);
    expect(B()._files).toEqual([]);
  });

  it('Android: every backup .json of the folder, newest first, nothing else; pruned files are gone', async () => {
    const fs = makeFilesystem();
    boot({ platform: 'android', plugins: { Filesystem: fs } });
    for (let i = 1; i <= 12; i++) fs.files.set('DOCUMENTS:Stackd Backups/Stackd_auto_202610' + String(i).padStart(2, '0') + '_080000.json', { data: '{}', mtime: 1000 + i });
    fs.files.set('DOCUMENTS:Stackd Backups/Stackd_backup_20260101_080000.json', { data: '{"a":1}', mtime: 5 });
    fs.files.set('DOCUMENTS:Stackd Backups/notes.txt', { data: 'x', mtime: 9999 });
    fs.files.set('DOCUMENTS:Stackd Backups/../evil.json', { data: 'x', mtime: 9999 });
    let files = await B().listAll();
    expect(files.map(f => f.name)).toEqual([
      ...Array.from({ length: 12 }, (_, i) => 'Stackd_auto_202610' + String(12 - i).padStart(2, '0') + '_080000.json'),
      'Stackd_backup_20260101_080000.json'
    ]);
    expect(files.every(f => f.target === 'documents')).toBe(true);
    expect(files.at(-1).bytes).toBe(7);
    await B().pruneAuto('documents');
    files = await B().listAll();
    expect(files.filter(f => B().isAutoFile(f.name))).toHaveLength(10);
    expect(files.map(f => f.name)).not.toContain('Stackd_auto_20261001_080000.json');
    expect(B()._files).toBe(files);
  });

  it('a manual file outlives its log row and a factory reset', async () => {
    const fs = makeFilesystem();
    boot({ platform: 'android', plugins: { Filesystem: fs } });
    buildLedger();
    const entry = await B().backupNow({ kind: 'manual' });
    for (let i = 0; i < 25; i++) S().dispatch('APPEND_BACKUP_LOG', { kind: 'restore', target: 'documents', name: 'x.json', ok: false });
    expect(S().getState().backupLog.some(e => e.name === entry.name)).toBe(false);
    S().dispatch('RESET_APP');
    expect(S().getState().backupLog).toEqual([]);
    const files = await B().listAll();
    expect(files.map(f => f.name)).toEqual([entry.name]);
  });

  it('iOS: iCloud Drive and the device folder (a fallback write) together; a file with no mtime sorts by its stamp', async () => {
    const fs = makeFilesystem();
    const cloud = makeCloud(true);
    boot({ platform: 'ios', plugins: { Filesystem: fs, StackdCloud: cloud } });
    cloud.files.set('Stackd_auto_20261103_080000.json', '{}');
    cloud.list.mockResolvedValueOnce({ files: [{ name: 'Stackd_auto_20261103_080000.json', size: 2 }] });
    fs.files.set('DATA:Stackd Backups/Stackd_backup_20261104_080000.json', { data: '{}', mtime: new Date(2026, 10, 4, 8).getTime() });
    await B().probe();
    const files = await B().listAll();
    expect(files.map(f => [f.name, f.target])).toEqual([
      ['Stackd_backup_20261104_080000.json', 'documents'],
      ['Stackd_auto_20261103_080000.json', 'icloud']
    ]);
    expect(files[1].mtime).toBe(new Date(2026, 10, 3, 8, 0, 0).getTime());
  });
});
