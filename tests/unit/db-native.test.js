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
// 1.0.2: optionally seeded (a "kill" reboots onto what leveldb held), with an
// optional character quota and a log of every setItem (key, value, ok).
const makeLocalStorage = (seed) => {
  const map = new Map(seed || []);
  const size = () => { let n = 0; map.forEach((v, k) => { n += k.length + v.length; }); return n; };
  const ls = {
    quota: null,
    failNthDataSet: 0, // throw QuotaExceededError on the n-th stackd_v1_ setItem (1-based), once
    _dataSets: 0,
    log: [],
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      const quotaError = () => { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; return e; };
      if (k.indexOf('stackd_v1_') === 0) {
        ls._dataSets += 1;
        if (ls.failNthDataSet && ls._dataSets === ls.failNthDataSet) { ls.log.push({ k, v: s, ok: false }); throw quotaError(); }
      }
      if (ls.quota != null) {
        const cur = map.has(k) ? k.length + map.get(k).length : 0;
        if (size() - cur + k.length + s.length > ls.quota) { ls.log.push({ k, v: s, ok: false }); throw quotaError(); }
      }
      ls.log.push({ k, v: s, ok: true });
      map.set(k, s);
    },
    removeItem: (k) => { map.delete(k); },
    size,
    _map: map
  };
  return ls;
};

// In-memory Capacitor Filesystem plugin mock (utf8 string contract only —
// the shape db.js actually uses: writeFile/readFile/deleteFile/readdir, and
// since 1.0.2 rename with Android semantics: delete the target, then move).
// cutAfter(n) lets n more calls through, then every call hangs forever — the
// process was killed mid-chain. tear(pred) stores half of a matching write,
// then hangs. failDelete(pred) makes deleteFile throw EACCES.
const makeFilesystem = () => {
  const files = new Map(); // full path -> data string
  const m = {
    files,
    calls: 0,
    _left: null,
    _tear: null,
    _failDelete: null,
    cutAfter(n) { m._left = n; },
    tear(pred) { m._tear = pred; },
    failDelete(pred) { m._failDelete = pred; },
    reset() { m._left = null; m._tear = null; m._failDelete = null; },
    _gate() {
      m.calls += 1;
      if (m._left === null) return false;
      if (m._left <= 0) return true;
      m._left -= 1;
      return false;
    },
    _hang() { return new Promise(() => {}); },
    async writeFile({ path, data }) {
      if (m._gate()) return m._hang();
      if (m._tear && m._tear(path)) { files.set(path, data.slice(0, Math.floor(data.length / 2))); return m._hang(); }
      files.set(path, data);
      return { uri: 'file:///data/' + path };
    },
    async readFile({ path }) {
      if (m._gate()) return m._hang();
      if (!files.has(path)) throw new Error('File does not exist.');
      return { data: files.get(path) };
    },
    async deleteFile({ path }) {
      if (m._gate()) return m._hang();
      if (m._failDelete && m._failDelete(path)) throw new Error('EACCES (Permission denied)');
      if (!files.delete(path)) throw new Error('File does not exist.');
    },
    async rename({ from, to }) {
      if (m._gate()) return m._hang();
      if (!files.has(from)) throw new Error('File does not exist.');
      const data = files.get(from);
      files.delete(to);
      files.set(to, data);
      files.delete(from);
    },
    async readdir({ path }) {
      if (m._gate()) return m._hang();
      const prefix = path + '/';
      const names = [...files.keys()]
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length));
      if (!names.length) throw new Error('Directory does not exist.');
      return { files: names.map((name) => ({ name, type: 'file' })) };
    }
  };
  return m;
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

// ── 1.0.2 (BUG-90): one committed mirror change per store change ──────────
// The Android WebView flushes localStorage to disk about a second after a
// write; a kill inside that window used to revert the save (or resurrect a
// delete) because boot trusted the stale localStorage and overwrote the
// newer mirror. Every change now reaches the mirror as staging files + one
// commit record + promotion, so boot can trust a newer mirror.
describe('StackdDB committed mirror (1.0.2, BUG-90)', () => {
  let fs;
  const DB = () => global.window.StackdDB;
  const LS = () => global.localStorage;
  const settle = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0)); };

  const boot = async (seed, prep) => {
    global.window = { crypto: { randomUUID: () => 'test-uuid' }, localStorage: makeLocalStorage(seed) };
    global.localStorage = global.window.localStorage;
    if (prep) prep(global.localStorage);
    executeFile('db.js');
    global.window.Capacitor = { isNativePlatform: () => true, Plugins: { Filesystem: fs } };
    await global.window.StackdDB.initNative();
  };
  // What leveldb held when the process died: a copy of localStorage taken earlier.
  const snapshot = () => new Map(LS()._map);
  const killAndReboot = async (snap, fsPrep) => {
    fs.reset();
    if (fsPrep) fsPrep(fs);
    await boot(snap);
  };
  const file = (key) => fs.files.get('stackd_db/stackd_v1_' + key + '.json');
  const meta = () => JSON.parse(fs.files.get('stackd_db/_rev.json'));
  const localRev = () => { const v = LS().getItem('stackd_mirror_rev'); return v === null ? null : parseInt(v, 10); };
  const tmps = () => [...fs.files.keys()].filter((p) => p.endsWith('.tmp'));
  const dataWritesParse = () => LS().log
    .filter((e) => e.k.indexOf('stackd_v1_') === 0)
    .every((e) => { try { JSON.parse(e.v); return true; } catch (err) { return false; } });

  const A1 = { id: 'a1', name: 'Main' };
  const A2 = { id: 'a2', name: 'Fund 1' };
  const OB1 = { id: 'ob1', accountId: 'a1', amount: 100 };
  const OB2 = { id: 'ob2', accountId: 'a2', amount: 1000 };

  beforeEach(() => { fs = makeFilesystem(); });

  it('a kill inside the flush window keeps the newer save: the mirror wins', async () => {
    await boot();
    DB().save('transactions', [{ id: 't0' }]);
    await DB()._mirrorChain;
    const snap = snapshot();
    DB().save('transactions', [{ id: 't0' }, { id: 't1' }]);
    await DB()._mirrorChain;

    await killAndReboot(snap);

    expect(DB().load('transactions')).toEqual([{ id: 't0' }, { id: 't1' }]);
    expect(localRev()).toBe(meta().rev);
    expect(file('transactions')).toBe('[{"id":"t0"},{"id":"t1"}]');
  });

  it('a kill after a delete keeps it deleted', async () => {
    await boot();
    DB().save('transactions', [{ id: 't0' }, { id: 't1' }]);
    await DB()._mirrorChain;
    const snap = snapshot();
    DB().save('transactions', [{ id: 't0' }]);
    await DB()._mirrorChain;

    await killAndReboot(snap);

    expect(DB().load('transactions')).toEqual([{ id: 't0' }]);
    expect(file('transactions')).toBe('[{"id":"t0"}]');
  });

  it('a kill after a key removal does not resurrect the key', async () => {
    await boot();
    DB().save('setup_done', 1);
    await DB()._mirrorChain;
    const snap = snapshot();
    DB().remove('setup_done');
    await DB()._mirrorChain;

    await killAndReboot(snap);

    expect(LS().getItem('stackd_v1_setup_done')).toBeNull();
    expect(fs.files.has('stackd_db/stackd_v1_setup_done.json')).toBe(false);
  });

  it('a change cut before its commit point is never half-restored', async () => {
    await boot();
    DB().begin(); DB().save('accounts', [A1]); DB().save('transactions', [OB1]); DB().end();
    await DB()._mirrorChain;
    const snap = snapshot();

    fs.cutAfter(1); // the accounts staging file lands, then the process dies
    DB().begin(); DB().save('accounts', [A1, A2]); DB().save('transactions', [OB1, OB2]); DB().end();
    await settle();
    expect(tmps()).toHaveLength(1); // precondition: only the accounts staging file

    await killAndReboot(snap);

    expect(DB().load('accounts')).toEqual([A1]);
    expect(DB().load('transactions')).toEqual([OB1]);
    expect(JSON.parse(file('accounts'))).toEqual([A1]);
    expect(JSON.parse(file('transactions'))).toEqual([OB1]);
    expect(tmps()).toEqual([]); // the orphan staging file is cleaned up
  });

  it('a change cut during promotion is rolled forward at boot', async () => {
    await boot();
    DB().begin(); DB().save('accounts', [A1]); DB().save('transactions', [OB1]); DB().end();
    await DB()._mirrorChain;
    const snap = snapshot();

    // 2 staging files + commit record + (delete, rename) of accounts, then dead
    fs.cutAfter(5);
    DB().begin(); DB().save('accounts', [A1, A2]); DB().save('transactions', [OB1, OB2]); DB().end();
    await settle();
    expect(JSON.parse(file('accounts'))).toEqual([A1, A2]); // precondition
    expect(JSON.parse(file('transactions'))).toEqual([OB1]);

    await killAndReboot(snap);

    expect(DB().load('accounts')).toEqual([A1, A2]);
    expect(DB().load('transactions')).toEqual([OB1, OB2]);
    expect(JSON.parse(file('transactions'))).toEqual([OB1, OB2]);
    expect(localRev()).toBe(meta().rev);
    expect(tmps()).toEqual([]);
  });

  it('a torn staging file is never restored and is cleaned up', async () => {
    await boot();
    DB().begin(); DB().save('accounts', [A1]); DB().save('transactions', [OB1]); DB().end();
    await DB()._mirrorChain;
    const snap = snapshot();

    fs.tear((p) => p.indexOf('stackd_v1_transactions.json.') !== -1 && p.endsWith('.tmp'));
    DB().begin(); DB().save('accounts', [A1, A2]); DB().save('transactions', [OB1, OB2]); DB().end();
    await settle();
    expect(tmps()).toHaveLength(2); // precondition: one whole, one torn

    await killAndReboot(snap);

    expect(DB().load('accounts')).toEqual([A1]);
    expect(DB().load('transactions')).toEqual([OB1]);
    expect(dataWritesParse()).toBe(true);
    expect(tmps()).toEqual([]);
  });

  it('a torn live file under a newer commit record keeps localStorage and is rewritten', async () => {
    const local = '[{"id":"t0"},{"id":"t1"}]';
    fs.files.set('stackd_db/stackd_v1_transactions.json', '[{"id":"t0"},{"id":');
    fs.files.set('stackd_db/_rev.json', JSON.stringify({ rev: 5, writes: [], deletes: [] }));

    await boot(new Map([['stackd_v1_transactions', local], ['stackd_mirror_rev', '4']]));

    expect(LS().getItem('stackd_v1_transactions')).toBe(local);
    expect(file('transactions')).toBe(local);
    expect(dataWritesParse()).toBe(true);
  });

  it('an evicted store restores every valid file and skips a torn one', async () => {
    fs.files.set('stackd_db/stackd_v1_accounts.json', '[{"id":"a1","na');
    fs.files.set('stackd_db/stackd_v1_transactions.json', '[{"id":"t0"}]');

    await boot();

    expect(LS().getItem('stackd_v1_transactions')).toBe('[{"id":"t0"}]');
    expect(LS().getItem('stackd_v1_accounts')).toBeNull();
    expect(dataWritesParse()).toBe(true);
  });

  it('a newer mirror that does not fit leaves localStorage byte-identical and refreshes the mirror from it', async () => {
    const oldA = JSON.stringify([A1]);
    const oldT = JSON.stringify([OB1]);
    fs.files.set('stackd_db/stackd_v1_accounts.json', JSON.stringify([A1, A2]));
    fs.files.set('stackd_db/stackd_v1_transactions.json', JSON.stringify([OB1, OB2]));
    fs.files.set('stackd_db/_rev.json', JSON.stringify({ rev: 7, writes: [], deletes: [] }));

    await boot(
      new Map([['stackd_v1_accounts', oldA], ['stackd_v1_transactions', oldT], ['stackd_mirror_rev', '6']]),
      (ls) => { ls.failNthDataSet = 2; } // the second key of the restore hits the quota
    );

    expect(LS().log.filter((e) => !e.ok)).toHaveLength(1); // precondition: the restore was tried
    expect(LS().getItem('stackd_v1_accounts')).toBe(oldA);
    expect(LS().getItem('stackd_v1_transactions')).toBe(oldT);
    // not marked as restored at the mirror's revision: the local path committed a NEW one
    expect(localRev()).not.toBe(7);
    expect(meta().rev).toBe(8);
    expect(localRev()).toBe(8);
    expect(file('accounts')).toBe(oldA);
    expect(file('transactions')).toBe(oldT);
  });

  it('a commit whose delete failed is never restored: its keys go dirty and boot takes the local path', async () => {
    await boot();
    DB().begin(); DB().save('accounts', [A1]); DB().save('setup_done', 1); DB().end();
    await DB()._mirrorChain;
    const snap = snapshot();

    const refuse = (p) => p.endsWith('stackd_v1_setup_done.json');
    fs.failDelete(refuse);
    DB().begin(); DB().save('accounts', [A1, A2]); DB().remove('setup_done'); DB().end();
    await DB()._mirrorChain;
    expect([...DB()._mirrorDirty].sort()).toEqual(['stackd_v1_accounts', 'stackd_v1_setup_done']);
    expect(JSON.parse(file('accounts'))).toEqual([A1, A2]); // promoted before the delete failed

    // the device still refuses the delete at the next boot
    await killAndReboot(snap, (f) => f.failDelete(refuse));

    expect(DB().load('accounts')).toEqual([A1]);
    expect(LS().getItem('stackd_v1_setup_done')).toBe('1');
  });

  it('a rolled-back change also rolls back the mirror (BUG-34)', async () => {
    await boot();
    DB().save('accounts', [A1]);
    await DB()._mirrorChain;
    const before = LS().getItem('stackd_v1_accounts');
    LS().quota = LS().size() + 60;

    DB().begin();
    expect(DB().save('accounts', [A1, A2])).toBe(true);
    expect(DB().save('transactions', [{ id: 'x', comment: 'y'.repeat(500) }])).toBe(false);
    DB().end();
    await DB()._mirrorChain;

    expect(LS().getItem('stackd_v1_accounts')).toBe(before);
    expect(file('accounts')).toBe(before);
    expect(fs.files.has('stackd_db/stackd_v1_transactions.json')).toBe(false);
  });

  it('a commit queued behind a failed one waits, and the next change commits both', async () => {
    await boot();
    const write = fs.writeFile;
    let failOnce = true;
    fs.writeFile = async (o) => {
      if (failOnce && o.path.indexOf('stackd_v1_accounts') !== -1) { failOnce = false; throw new Error('EIO'); }
      return write(o);
    };
    DB().save('accounts', [A1]);   // its commit fails
    DB().save('budgets', [{ id: 'b1' }]); // queued before the failure was known
    await DB()._mirrorChain;
    expect(fs.files.has('stackd_db/_rev.json')).toBe(false); // no commit claims a revision without accounts
    expect(file('budgets')).toBeUndefined();

    DB().save('loans', []);
    await DB()._mirrorChain;

    expect(JSON.parse(file('accounts'))).toEqual([A1]);
    expect(JSON.parse(file('budgets'))).toEqual([{ id: 'b1' }]);
    expect(file('loans')).toBe('[]');
    expect(meta().rev).toBe(3);
    expect(meta().writes.sort()).toEqual(['stackd_v1_accounts', 'stackd_v1_budgets', 'stackd_v1_loans']);
  });

  // 1.0.2 review (round 1): a revision key the quota refused must never make
  // boot trust a mirror whose newer commit the process never finished.
  it('a full 1.0.1 store whose revision key never fits keeps an equal-length edit across a cut commit', async () => {
    const t1 = JSON.stringify([{ id: 't0', amt: '1' }]);
    seedFile(fs, 'stackd_v1_transactions', t1); // pre-1.0.2 mirror, no _rev.json
    await boot(new Map([['stackd_v1_transactions', t1]]), (ls) => { ls.quota = ls.size() + 5; });
    await DB()._mirrorChain;
    expect(meta().rev).toBe(1); // precondition: the boot committed rev 1 ...
    expect(LS().getItem('stackd_mirror_rev')).toBeNull(); // ... but its revision did not fit

    fs.cutAfter(0); // the next commit never finishes: the process dies
    expect(DB().save('transactions', [{ id: 't0', amt: '2' }])).toBe(true); // same length: fits
    await settle(); // the commit is now hung on the cut, as in a dead process
    const snap = snapshot();

    await killAndReboot(snap);

    expect(DB().load('transactions')).toEqual([{ id: 't0', amt: '2' }]);
    await DB()._mirrorChain;
    expect(JSON.parse(file('transactions'))).toEqual([{ id: 't0', amt: '2' }]); // mirror refreshed from local
  });

  it('the revision key is fixed-width: crossing 9 -> 10 at the quota still rewrites it', async () => {
    await boot();
    for (let i = 0; i < 9; i++) DB().save('budgets', [{ id: 'b' + i }]);
    await DB()._mirrorChain;
    expect(localRev()).toBe(9); // nine one-key changes (an empty boot commits nothing)
    LS().quota = LS().size(); // not one spare character

    expect(DB().save('budgets', [{ id: 'bX' }])).toBe(true); // same length as before
    await DB()._mirrorChain;

    expect(localRev()).toBe(10);
    expect(meta().rev).toBe(10);
  });

  it('a revision write that fails drops the key, so the next boot keeps localStorage', async () => {
    await boot();
    DB().save('transactions', [{ id: 't0', amt: '1' }]);
    await DB()._mirrorChain;
    const setItem = LS().setItem;
    LS().setItem = (k, v) => {
      if (k === 'stackd_mirror_rev') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      return setItem(k, v);
    };
    // change A: its revision does not fit, its mirror commit completes
    expect(DB().save('transactions', [{ id: 't0', amt: '2' }])).toBe(true);
    await DB()._mirrorChain;
    expect(LS().getItem('stackd_mirror_rev')).toBeNull(); // dropped, not left lagging behind the mirror
    // change B: same, but the process dies before its commit
    fs.cutAfter(0);
    expect(DB().save('transactions', [{ id: 't0', amt: '3' }])).toBe(true);
    await settle();
    const snap = snapshot();

    await killAndReboot(snap);

    expect(DB().load('transactions')).toEqual([{ id: 't0', amt: '3' }]);
  });

  // ── guards ──
  it('guard: local newer than the mirror (a failed commit) keeps local and refreshes the mirror as one commit', async () => {
    await boot();
    DB().save('budgets', [{ id: 'b1' }]);
    await DB()._mirrorChain;
    const write = fs.writeFile;
    fs.writeFile = async () => { throw new Error('disk full'); };
    DB().save('budgets', [{ id: 'b1' }, { id: 'b2' }]);
    await DB()._mirrorChain;
    const snap = snapshot(); // leveldb flushed everything
    fs.writeFile = write;

    await killAndReboot(snap);

    expect(DB().load('budgets')).toEqual([{ id: 'b1' }, { id: 'b2' }]);
    expect(JSON.parse(file('budgets'))).toEqual([{ id: 'b1' }, { id: 'b2' }]);
    expect(meta().rev).toBe(localRev());
  });

  it('guard: a readdir failure removes no local key and restores nothing', async () => {
    fs.files.set('stackd_db/stackd_v1_accounts.json', '[{"id":"mirror"}]');
    fs.files.set('stackd_db/_rev.json', JSON.stringify({ rev: 9, writes: [], deletes: [] }));
    fs.readdir = async () => { throw new Error('EIO'); };

    await boot(new Map([
      ['stackd_v1_accounts', '[{"id":"local"}]'],
      ['stackd_v1_budgets', '[]'],
      ['stackd_mirror_rev', '3']
    ]));

    expect(LS().getItem('stackd_v1_accounts')).toBe('[{"id":"local"}]');
    expect(LS().getItem('stackd_v1_budgets')).toBe('[]');
  });

  it('guard: on web no stackd_mirror_rev key is ever written', async () => {
    global.window = { crypto: { randomUUID: () => 'test-uuid' }, localStorage: makeLocalStorage() };
    global.localStorage = global.window.localStorage;
    executeFile('db.js');
    await DB().initNative();
    DB().save('accounts', [A1]);
    DB().begin(); DB().save('transactions', [OB1]); DB().remove('setup_done'); DB().end();
    expect(LS().getItem('stackd_mirror_rev')).toBeNull();
    expect(LS().log.map((e) => e.k)).toEqual(['stackd_v1_accounts', 'stackd_v1_transactions']);
  });
});
