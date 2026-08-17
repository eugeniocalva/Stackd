import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Helper to execute vanilla JS files in the global context (store.test.js pattern)
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Functional localStorage mock — the mirror walks length/key(i), so the usual
// vi.fn() stubs aren't enough here.
const makeLocalStorage = () => {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map
  };
};

// In-memory Capacitor Filesystem plugin mock (utf8 string contract only —
// the shape db.js actually uses: writeFile/readFile/deleteFile/readdir).
const makeFilesystem = () => {
  const files = new Map(); // full path -> data string
  return {
    files,
    async writeFile({ path, data }) { files.set(path, data); },
    async readFile({ path }) {
      if (!files.has(path)) throw new Error('File does not exist.');
      return { data: files.get(path) };
    },
    async deleteFile({ path }) {
      if (!files.delete(path)) throw new Error('File does not exist.');
    },
    async readdir({ path }) {
      const prefix = path + '/';
      const names = [...files.keys()]
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length));
      if (!names.length) throw new Error('Directory does not exist.');
      return { files: names.map((name) => ({ name, type: 'file' })) };
    }
  };
};

const seedFile = (fs, fullKey, value) => {
  fs.files.set('stackd_db/' + fullKey + '.json', value);
};

describe('StackdDB native file mirror', () => {
  let fs;

  const bootNative = () => {
    global.window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { Filesystem: fs }
    };
  };

  beforeEach(() => {
    fs = makeFilesystem();
    global.window = {
      crypto: { randomUUID: () => 'test-uuid' },
      localStorage: makeLocalStorage()
    };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
  });

  it('is a no-op on web (no Capacitor)', async () => {
    await global.window.StackdDB.initNative();
    expect(global.window.StackdDB.save('accounts', [{ id: 'a1' }])).toBe(true);
    expect(global.window.StackdDB.load('accounts')).toEqual([{ id: 'a1' }]);
    expect(global.window.StackdDB.remove('accounts')).toBe(true);
    expect(global.window.StackdDB.load('accounts')).toBeNull();
  });

  it('restores an evicted localStorage from the mirror at boot', async () => {
    seedFile(fs, 'stackd_v1_accounts', '[{"id":"a1"}]');
    seedFile(fs, 'stackd_v1_setup_done', '1');
    bootNative();

    await global.window.StackdDB.initNative();

    expect(global.window.StackdDB.load('accounts')).toEqual([{ id: 'a1' }]);
    expect(global.localStorage.getItem('stackd_v1_setup_done')).toBe('1');
  });

  it('seeds the mirror from localStorage and drops stale files on a normal boot', async () => {
    global.localStorage.setItem('stackd_v1_transactions', '[]');
    global.localStorage.setItem('other_app_key', 'x'); // must not be mirrored
    seedFile(fs, 'stackd_v1_setup_done', '1'); // deleted locally since last mirror
    bootNative();

    await global.window.StackdDB.initNative();

    expect(fs.files.get('stackd_db/stackd_v1_transactions.json')).toBe('[]');
    expect(fs.files.has('stackd_db/stackd_v1_setup_done.json')).toBe(false);
    expect(fs.files.has('stackd_db/other_app_key.json')).toBe(false);
    // localStorage untouched (it was authoritative)
    expect(global.localStorage.getItem('stackd_v1_transactions')).toBe('[]');
  });

  it('does NOT restore from the mirror when localStorage has data', async () => {
    global.localStorage.setItem('stackd_v1_accounts', '[{"id":"live"}]');
    seedFile(fs, 'stackd_v1_accounts', '[{"id":"stale"}]');
    bootNative();

    await global.window.StackdDB.initNative();

    expect(global.window.StackdDB.load('accounts')).toEqual([{ id: 'live' }]);
    expect(fs.files.get('stackd_db/stackd_v1_accounts.json')).toBe('[{"id":"live"}]');
  });

  it('mirrors save() and remove() after boot', async () => {
    bootNative();
    await global.window.StackdDB.initNative();

    global.window.StackdDB.save('budgets', [{ id: 'b1' }]);
    await global.window.StackdDB._mirrorChain;
    expect(fs.files.get('stackd_db/stackd_v1_budgets.json')).toBe('[{"id":"b1"}]');

    global.window.StackdDB.remove('budgets');
    await global.window.StackdDB._mirrorChain;
    expect(fs.files.has('stackd_db/stackd_v1_budgets.json')).toBe(false);
    expect(global.window.StackdDB.load('budgets')).toBeNull();
  });

  it('survives a mirror write failure without breaking save()', async () => {
    bootNative();
    await global.window.StackdDB.initNative();
    fs.writeFile = async () => { throw new Error('disk full'); };

    expect(global.window.StackdDB.save('loans', [])).toBe(true);
    await global.window.StackdDB._mirrorChain; // must not reject
    expect(global.window.StackdDB.load('loans')).toEqual([]);

    // Chain must stay usable after the failure
    fs.writeFile = async ({ path, data }) => { fs.files.set(path, data); };
    global.window.StackdDB.save('loans', [{ id: 'l1' }]);
    await global.window.StackdDB._mirrorChain;
    expect(fs.files.get('stackd_db/stackd_v1_loans.json')).toBe('[{"id":"l1"}]');
  });
});
