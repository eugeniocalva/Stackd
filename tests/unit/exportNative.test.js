import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-37): StackdExport._download clicked a hidden <a download> on a
// blob: URL. The Android WebView has no DownloadListener (and iOS's WKWebView
// no download delegate), so in the native apps every CSV export did nothing —
// no file, no share sheet, no message. Natively the file is now written to the
// app cache and handed to the system share sheet (@capacitor/share, through
// the native plugin proxies); the web path is unchanged.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let Filesystem;
let Share;
let anchorClick;

const E = () => global.window.StackdExport;
const S = () => global.window.Store;
const sheet = () => global.window.Components.NoticeSheet.show;

const boot = ({ native = true } = {}) => {
  let uid = 0;
  Filesystem = { writeFile: vi.fn(async ({ path }) => ({ uri: 'file:///cache/' + path })) };
  Share = { share: vi.fn(async () => ({})) };
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
  };
  if (native) global.window.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem, Share } };
  global.localStorage = global.window.localStorage;
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'export.js'].forEach(executeFile);
  global.window.Components = { NoticeSheet: { show: vi.fn() } };
  S().init();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
  const acc = S().getState().accounts[0];
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12, accountId: acc.id, categoryId: 'cat_groceries', date: '2026-09-01', comment: 'lunch' });
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {});
};

// Run an exporter and await the promise its _download returned.
const run = async (method) => {
  const spy = vi.spyOn(E(), '_download');
  E()[method](S().getState());
  const result = await spy.mock.results[0].value;
  spy.mockRestore();
  return result;
};

describe('Native CSV export goes through the share sheet (1.0.2, BUG-37)', () => {
  beforeEach(() => { boot(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('writes the CSV (with its BOM) to the cache and opens the share sheet on it', async () => {
    const ok = await run('exportTransactions');

    expect(ok).toBe(true);
    expect(Filesystem.writeFile).toHaveBeenCalledTimes(1);
    const arg = Filesystem.writeFile.mock.calls[0][0];
    expect(arg).toMatchObject({ path: 'exports/stackd_transactions.csv', directory: 'CACHE', encoding: 'utf8' });
    expect(arg.data.startsWith('﻿Date,Time,Type')).toBe(true);
    expect(arg.data).toContain('lunch');
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({
      files: ['file:///cache/exports/stackd_transactions.csv'],
      dialogTitle: 'Save or send stackd_transactions.csv'
    }));
    expect(anchorClick).not.toHaveBeenCalled();
    expect(sheet()).not.toHaveBeenCalled(); // D-U7-2: the system sheet is the confirmation
  });

  it('every other exporter reaches the share sheet with its own file name', async () => {
    const cases = [
      ['exportAccounts', 'stackd_accounts.csv'],
      ['exportCategories', 'stackd_categories.csv'],
      ['exportLoans', 'stackd_loans.csv'],
      ['exportBudgets', 'stackd_budgets.csv'],
      ['exportImportRules', 'stackd_import_rules.csv']
    ];
    for (const [method, name] of cases) {
      Share.share.mockClear();
      expect(await run(method)).toBe(true);
      expect(Share.share).toHaveBeenCalledTimes(1);
      expect(Share.share.mock.calls[0][0].files).toEqual(['file:///cache/exports/' + name]);
    }
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it('a cancelled share sheet is silent', async () => {
    Share.share.mockRejectedValueOnce(new Error('Share canceled'));

    expect(await run('exportAccounts')).toBe(false);

    expect(Share.share).toHaveBeenCalledTimes(1);
    expect(sheet()).not.toHaveBeenCalled();
  });

  it('a file that cannot be written shows the "Export failed" sheet', async () => {
    Filesystem.writeFile.mockRejectedValueOnce(new Error('ENOSPC'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await run('exportAccounts')).toBe(false);

    expect(Share.share).not.toHaveBeenCalled();
    expect(sheet()).toHaveBeenCalledWith(expect.objectContaining({
      id: 'export-result-modal', tone: 'error', title: 'Export failed', body: "The file couldn't be created. Please try again."
    }));
  });

  it('a build without the Share plugin shows the "Export failed" sheet instead of nothing', async () => {
    delete global.window.Capacitor.Plugins.Share;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await run('exportTransactions')).toBe(false);

    expect(sheet()).toHaveBeenCalledWith(expect.objectContaining({ id: 'export-result-modal', title: 'Export failed' }));
    expect(anchorClick).not.toHaveBeenCalled();
  });

  it('a second tap while the share sheet is open does not open another', async () => {
    let close;
    Share.share.mockImplementationOnce(() => new Promise((r) => { close = r; }));
    const spy = vi.spyOn(E(), '_download');
    E().exportAccounts(S().getState());
    await new Promise((r) => setTimeout(r, 0)); // the first share sheet is up
    E().exportAccounts(S().getState());
    expect(await spy.mock.results[1].value).toBe(false);
    close({});
    expect(await spy.mock.results[0].value).toBe(true);

    expect(Share.share).toHaveBeenCalledTimes(1);
    // and once it closed, the next tap works again
    expect(await run('exportAccounts')).toBe(true);
    expect(Share.share).toHaveBeenCalledTimes(2);
  });
});

describe('Web CSV export is unchanged (guard)', () => {
  let created;
  beforeEach(() => {
    boot({ native: false });
    created = [];
    global.URL.createObjectURL = vi.fn((blob) => { created.push(blob); return 'blob:stackd-test'; });
    global.URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.URL.createObjectURL;
    delete global.URL.revokeObjectURL;
  });

  it('downloads through a clicked <a download> on a blob URL', async () => {
    let clicked = null;
    anchorClick.mockImplementation(function () { clicked = { href: this.href, download: this.download }; });

    E().exportAccounts(S().getState());

    expect(created).toHaveLength(1);
    expect(clicked).toEqual({ href: 'blob:stackd-test', download: 'stackd_accounts.csv' });
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
    expect(Share.share).not.toHaveBeenCalled();
  });
});
