import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.2.0 (UX-11, docs/ux-review-1.2-plan.md §E.3): the Backup page. Cards in
// order: the one-file backup (automatic toggle on native only, Back up now
// everywhere), Recent backups (the log), Restore (bundles and the six CSVs)
// and the six individual exports — whose ids, like #import-csv-file and
// #btn-import-csv, e2e specs and unit gates still pin.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const memStorage = () => {
  const m = new Map();
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

const boot = ({ platform = null, plugins = {} } = {}) => {
  let uid = 0;
  global.window = {
    crypto: { randomUUID: () => 'v-' + (++uid) },
    localStorage: memStorage(),
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#backup', origin: 'https://localhost' }
  };
  if (platform) global.window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: plugins };
  global.localStorage = global.window.localStorage;
  global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js', 'router.js', 'export.js', 'import.js', 'backup.js'].forEach(executeFile);
  global.window.Store.init();
  global.window.Router.navigate = vi.fn();
  vi.spyOn(global.window.Components.NoticeSheet, 'show').mockImplementation(() => {});
  return global.window;
};

const S = () => global.window.Store;
const V = () => global.window.Views;
const B = () => global.window.StackdBackup;
const t = (k, p) => global.window.I18n.t(k, p);
const sheet = () => global.window.Components.NoticeSheet.show;
const flush = () => new Promise((r) => setTimeout(r, 0));

const mount = () => {
  document.body.innerHTML = '<div id="router-view"></div>';
  const root = document.getElementById('router-view');
  root.innerHTML = V().BackupView.render(S().getState());
  V().BackupView.attachEvents(root, S().getState());
  return root;
};

const nativeFs = () => ({
  writeFile: vi.fn(async ({ path, directory }) => ({ uri: 'file:///' + directory + '/' + path })),
  readFile: vi.fn(async () => ({ data: '{}' })),
  readdir: vi.fn(async () => ({ files: [] })),
  deleteFile: vi.fn(async () => {})
});

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('1.2.0 (UX-11) Backup page — render', () => {
  it('web: Back up now, the log, restore and the six exports; no automatic-backup toggle', () => {
    boot();
    const root = mount();
    ['btn-backup-now', 'backup-log', 'backup-log-empty', 'import-csv-file', 'btn-import-csv',
      'btn-export-accounts', 'btn-export-categories', 'btn-export-transactions', 'btn-export-loans', 'btn-export-budgets', 'btn-export-rules']
      .forEach(id => expect(root.querySelector('#' + id), id).not.toBeNull());
    expect(root.querySelector('#toggle-backup-daily')).toBeNull();
    expect(root.querySelector('#backup-auto-row')).toBeNull();
    expect(root.querySelector('#import-csv-file').getAttribute('accept')).toMatch(/(^|,)\.json(,|$)/);
    expect(root.querySelector('#import-csv-file').getAttribute('accept')).toContain('.csv');
    expect(root.querySelector('#btn-import-csv').textContent.trim()).toBe(t('backup.restoreBtn'));
    expect(root.querySelector('#backup-log-empty').textContent).toBe(t('backup.logEmpty'));
    const titles = [...root.querySelectorAll('.section-title')].map(n => n.textContent.trim());
    const at = (k) => titles.indexOf(t(k));
    expect(at('backup.logTitle')).toBeGreaterThan(-1);
    expect(at('backup.logTitle')).toBeLessThan(at('backup.restoreTitle'));
    expect(at('backup.restoreTitle')).toBeLessThan(at('backup.filesTitle'));
  });

  it('native: the toggle reflects the prefs, the subtitle names the destination and the last backup', () => {
    boot({ platform: 'android', plugins: { Filesystem: nativeFs() } });
    let root = mount();
    const toggle = root.querySelector('#toggle-backup-daily');
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(false);
    expect(root.querySelector('#backup-auto-subtitle').textContent).toContain(t('backup.target.documents'));
    expect(root.querySelector('#backup-auto-subtitle').textContent).toContain(t('backup.never'));
    S().dispatch('SET_BACKUP_PREFS', { daily: true, lastAutoAt: '2026-11-04T08:30:00.000Z' });
    root = mount();
    expect(root.querySelector('#toggle-backup-daily').checked).toBe(true);
    expect(root.querySelector('#backup-auto-subtitle').textContent).not.toContain(t('backup.never'));
    expect(root.querySelector('#backup-auto-subtitle').textContent).toContain(t('backup.lastAt', { when: '' }).trim());
  });

  it('log rows: newest first, stored names escaped, history only (no Restore/Share)', () => {
    boot({ platform: 'android', plugins: { Filesystem: nativeFs() } });
    S().dispatch('APPEND_BACKUP_LOG', { kind: 'auto', target: 'documents', name: 'Stackd_auto_20261101_080000.json', bytes: 4096, ok: true });
    S().dispatch('APPEND_BACKUP_LOG', { kind: 'manual', target: 'documents', name: '<img src=x onerror=alert(1)>.json', bytes: 10, ok: false, error: '<b>disk</b>' });
    S().dispatch('APPEND_BACKUP_LOG', { kind: 'restore', target: 'documents', name: 'Stackd_backup_20261102_080000.json', ok: true });
    const root = mount();
    const rows = root.querySelectorAll('.backup-log-row');
    expect(rows).toHaveLength(3);
    expect(root.querySelector('#backup-log-empty')).toBeNull();
    expect(rows[0].textContent).toContain(t('backup.kind.restore'));
    expect(rows[1].querySelector('img')).toBeNull();
    expect(rows[1].querySelector('b')).toBeNull();
    expect(rows[1].textContent).toContain('<img src=x onerror=alert(1)>.json');
    expect(rows[1].textContent).toContain(t('backup.statusFailed'));
    expect(rows[2].textContent).toContain(t('backup.kind.auto'));
    expect(rows[2].textContent).toContain(t('backup.sizeKb', { n: '4' }));
    // Review fix: the actions sit on the folder listing, never on the log.
    expect(root.querySelector('#backup-log [data-backup-restore]')).toBeNull();
    expect(root.querySelector('#backup-log [data-backup-share]')).toBeNull();
  });

  it('web log rows (downloads) carry no actions', () => {
    boot();
    S().dispatch('APPEND_BACKUP_LOG', { kind: 'manual', target: 'download', name: 'Stackd_backup_20261101_080000.json', bytes: 2048, ok: true });
    const root = mount();
    expect(root.querySelectorAll('.backup-log-row')).toHaveLength(1);
    expect(root.querySelector('[data-backup-restore]')).toBeNull();
    expect(root.querySelector('#backup-files')).toBeNull(); // no folder on the web
    expect(root.querySelector('.backup-log-row').textContent).toContain(t('backup.target.download'));
  });

  it('native: Saved backups lists the folder itself — a file with no log row, after a reset too', async () => {
    const fsx = nativeFs();
    fsx.readdir.mockImplementation(async ({ directory }) => (directory === 'DOCUMENTS'
      ? { files: [
        { name: 'Stackd_auto_20261101_080000.json', type: 'file', size: 4096, mtime: new Date(2026, 10, 1, 8).getTime() },
        { name: 'Stackd_backup_20261103_080000.json', type: 'file', size: 2048, mtime: new Date(2026, 10, 3, 8).getTime() },
        { name: 'notes.txt', type: 'file', size: 1, mtime: 1 }
      ] }
      : { files: [] }));
    boot({ platform: 'android', plugins: { Filesystem: fsx } });
    S().dispatch('RESET_APP');
    let root = mount();
    expect(S().getState().backupLog).toEqual([]);
    expect(root.querySelector('#backup-files-empty').textContent).toBe(t('backup.savedEmpty'));
    const titles = [...root.querySelectorAll('.section-title')].map(n => n.textContent.trim());
    expect(titles.indexOf(t('backup.savedTitle'))).toBeGreaterThan(titles.indexOf(t('backup.logTitle')));
    expect(titles.indexOf(t('backup.savedTitle'))).toBeLessThan(titles.indexOf(t('backup.restoreTitle')));
    await flush(); await flush(); await flush();
    const rows = root.querySelectorAll('#backup-files .backup-file-row');
    expect(rows).toHaveLength(2);
    expect(root.querySelector('#backup-files-empty')).toBeNull();
    expect(rows[0].textContent).toContain('Stackd_backup_20261103_080000.json');
    expect(rows[0].textContent).toContain(t('backup.kind.manual'));
    expect(rows[1].textContent).toContain(t('backup.kind.auto'));
    expect(rows[1].textContent).toContain(t('backup.sizeKb', { n: '4' }));
    expect(rows[0].querySelector('[data-backup-restore]').getAttribute('data-backup-target')).toBe('documents');
    expect(rows[0].querySelector('[data-backup-share]')).not.toBeNull();
    // a re-render shows the last listing at once
    root = mount();
    expect(root.querySelectorAll('#backup-files .backup-file-row')).toHaveLength(2);
  });

  it('iOS: once probe() finds iCloud Drive, the destination icon follows the label', async () => {
    const cloud = { available: vi.fn(async () => ({ available: true })), write: vi.fn(), read: vi.fn(), list: vi.fn(async () => ({ files: [] })), remove: vi.fn() };
    boot({ platform: 'ios', plugins: { Filesystem: nativeFs(), StackdCloud: cloud } });
    const root = mount();
    expect(root.querySelector('#backup-target-icon i').getAttribute('data-lucide')).toBe('folder-open');
    await flush();
    expect(root.querySelector('#backup-target-label').textContent).toBe(t('backup.target.icloud'));
    expect(root.querySelector('#backup-target-icon i').getAttribute('data-lucide')).toBe('cloud-upload');
    expect(root.querySelector('#backup-target-icon').getAttribute('data-target')).toBe('icloud');
  });

  it('the individual-files card explains the CSV files, and the folder name matches the real one', () => {
    boot();
    const root = mount();
    expect(root.textContent).toContain(t('backup.filesDesc'));
    expect(t('backup.target.documents')).toContain(global.window.StackdBackup.FOLDER);
  });
});

describe('1.2.0 (UX-11) Backup page — actions', () => {
  it('turning the toggle on saves the pref and asks for a daily run', () => {
    boot({ platform: 'android', plugins: { Filesystem: nativeFs() } });
    const root = mount();
    const daily = vi.spyOn(B(), 'maybeDaily').mockReturnValue(false);
    const toggle = root.querySelector('#toggle-backup-daily');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    expect(S().getBackupPrefs().daily).toBe(true);
    expect(daily).toHaveBeenCalledTimes(1);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(S().getBackupPrefs().daily).toBe(false);
    expect(daily).toHaveBeenCalledTimes(1);
  });

  it('Back up now runs a manual backup and reports it in one sheet', async () => {
    boot();
    const root = mount();
    const run = vi.spyOn(B(), 'backupNow').mockResolvedValue({ kind: 'manual', target: 'download', name: 'Stackd_backup_20261105_090000.json', bytes: 10, ok: true, error: '' });
    root.querySelector('#btn-backup-now').click();
    expect(run).toHaveBeenCalledWith({ kind: 'manual' });
    expect(root.querySelector('#btn-backup-now').disabled).toBe(true);
    await flush();
    expect(sheet()).toHaveBeenCalledWith(expect.objectContaining({ id: 'backup-result-modal', tone: 'success', title: t('backup.doneTitle'),
      body: t('backup.doneBody', { name: 'Stackd_backup_20261105_090000.json', target: t('backup.target.download') }) }));

    run.mockResolvedValueOnce({ kind: 'manual', ok: false, error: 'disk full' });
    root.querySelector('#btn-backup-now').click();
    await flush();
    expect(sheet()).toHaveBeenLastCalledWith(expect.objectContaining({ tone: 'error', title: t('backup.failedTitle') }));
  });

  it('a saved file Restore asks first, then restores that file and logs the restore', async () => {
    const fsx = nativeFs();
    fsx.readdir.mockImplementation(async ({ directory }) => (directory === 'DOCUMENTS'
      ? { files: [{ name: 'Stackd_auto_20261101_080000.json', type: 'file', size: 4096, mtime: 1 }] } : { files: [] }));
    boot({ platform: 'android', plugins: { Filesystem: fsx } });
    const root = mount();
    await flush(); await flush(); await flush();
    let opts = null;
    vi.spyOn(global.window.Components.Modal, 'show').mockImplementation((o) => { opts = o; });
    const result = { kind: 'bundle', files: { accounts: { kind: 'accounts', importedCount: 2 }, transactions: { kind: 'transactions', importedCount: 7, skipped: {} } },
      importedCount: 9, skippedCount: 0, duplicateCount: 0, newAccounts: 0, newCategories: 0, ambiguousRows: 0, ambiguousAccounts: [] };
    const restoreFrom = vi.spyOn(B(), 'restoreFrom').mockImplementation((name, target, ok) => { ok(result); return Promise.resolve(); });
    root.querySelector('[data-backup-restore]').click();
    expect(restoreFrom).not.toHaveBeenCalled();
    expect(opts.title).toBe(t('backup.restoreConfirmTitle'));
    expect(opts.content).toContain('Stackd_auto_20261101_080000.json');
    const close = vi.fn();
    opts.onSave(close);
    expect(close).toHaveBeenCalled();
    expect(restoreFrom).toHaveBeenCalledWith('Stackd_auto_20261101_080000.json', 'documents', expect.any(Function), expect.any(Function));
    const shown = sheet().mock.calls.at(-1)[0];
    expect(shown.title).toBe(t('backup.restoredTitle'));
    expect(shown.body).toContain(t('backup.file.accounts') + ': 2');
    expect(shown.body).toContain(t('backup.file.transactions') + ': 7');
    expect(S().getState().backupLog[0]).toMatchObject({ kind: 'restore', target: 'documents', name: 'Stackd_auto_20261101_080000.json', ok: true });
  });

  it('a picked .json bundle restores through #import-csv-file with the combined sheet', () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12, accountId: S().getState().accounts[0].id, categoryId: 'cat_groceries', date: '2026-09-01' });
    const text = JSON.stringify(B().buildBundle(S().getState()));
    boot(); // an empty install
    const root = mount();
    const input = root.querySelector('#import-csv-file');
    Object.defineProperty(input, 'files', { value: [{ name: 'Stackd_backup_20261105_090000.json', text }] });
    input.dispatchEvent(new Event('change'));
    const shown = sheet().mock.calls.at(-1)[0];
    expect(shown.id).toBe('import-result-modal');
    expect(shown.title).toBe(t('backup.restoredTitle'));
    expect(shown.body).toContain(t('backup.file.accounts') + ': 1');
    expect(S().getState().accounts.map(a => a.name)).toEqual(['Main']);
    expect(S().getState().backupLog[0]).toMatchObject({ kind: 'restore', ok: true, name: 'Stackd_backup_20261105_090000.json' });
    expect(root.querySelector('#btn-import-csv').disabled).toBe(false);
  });
});

// Review fix (UX-11): the confirm's Components.Modal clears #modal-container
// 300 ms after close(); the restore result must be shown after that.
describe('1.2.0 (UX-11) Backup page — restore result outlives the confirm', () => {
  it('real Modal + NoticeSheet: the result sheet is still there 400 ms later', async () => {
    const fsx = nativeFs();
    fsx.readdir.mockImplementation(async ({ directory }) => (directory === 'DOCUMENTS'
      ? { files: [{ name: 'Stackd_backup_20261101_080000.json', type: 'file', size: 10, mtime: 1 }] } : { files: [] }));
    boot({ platform: 'android', plugins: { Filesystem: fsx } });
    global.window.Components.NoticeSheet.show.mockRestore();
    const result = { kind: 'bundle', files: { accounts: { kind: 'accounts', importedCount: 1 } },
      importedCount: 1, skippedCount: 0, duplicateCount: 0, newAccounts: 0, newCategories: 0, ambiguousRows: 0, ambiguousAccounts: [] };
    const restoreFrom = vi.spyOn(B(), 'restoreFrom').mockImplementation((name, target, ok) => { ok(result); return Promise.resolve(); });
    document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
    const root = document.getElementById('router-view');
    root.innerHTML = V().BackupView.render(S().getState());
    V().BackupView.attachEvents(root, S().getState());
    await flush(); await flush(); await flush();
    vi.useFakeTimers();
    try {
      root.querySelector('#backup-files [data-backup-restore]').click();
      expect(document.getElementById('active-modal')).not.toBeNull();
      document.getElementById('modal-save-btn').click();
      expect(restoreFrom).not.toHaveBeenCalled(); // waits for the teardown
      vi.advanceTimersByTime(400);
      expect(restoreFrom).toHaveBeenCalledTimes(1);
      expect(document.getElementById('import-result-modal')).not.toBeNull();
      vi.advanceTimersByTime(400);
      expect(document.getElementById('import-result-modal')).not.toBeNull();
      expect(document.getElementById('import-result-modal').textContent).toContain(t('backup.restoredTitle'));
    } finally {
      vi.useRealTimers();
    }
  });
});
