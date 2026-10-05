import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-34): when localStorage is full, StackdDB.save returned false,
// dispatch ignored it, mutated memory and emitted — entries showed as saved
// and vanished at the next start, and a multi-key change (ADD_ACCOUNT) could
// land half (an account without its opening balance). Every change is now
// journaled: all or nothing, memory reloaded from disk on failure, dispatch
// returns false and ONE deferred "Storage is full" sheet explains it.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Functional localStorage with a character quota (keys + values, like the
// WebView's) that throws a real-looking QuotaExceededError, a log of every
// setItem, and an optional forced error for every setItem.
const makeLocalStorage = () => {
  const map = new Map();
  const size = () => { let n = 0; map.forEach((v, k) => { n += k.length + v.length; }); return n; };
  const ls = {
    quota: null,
    failWith: null,
    log: [],
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      if (ls.failWith) { ls.log.push({ k, ok: false }); throw ls.failWith; }
      if (ls.quota != null) {
        const cur = map.has(k) ? k.length + map.get(k).length : 0;
        if (size() - cur + k.length + s.length > ls.quota) {
          ls.log.push({ k, ok: false });
          const e = new Error('The quota has been exceeded.');
          e.name = 'QuotaExceededError';
          throw e;
        }
      }
      ls.log.push({ k, ok: true });
      map.set(k, s);
    },
    removeItem: (k) => { map.delete(k); },
    size,
    _map: map
  };
  return ls;
};

let ls;
let uid = 0;
const FILES = ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'pro.js', 'export.js', 'import.js'];

// (Re)load the app scripts over the SAME localStorage — a relaunch.
const load = () => {
  global.window = {
    crypto: { randomUUID: () => 'u-' + (++uid) },
    localStorage: ls,
    StackdHydrateIcons: vi.fn()
  };
  global.localStorage = ls;
  global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
  FILES.forEach(executeFile);
  global.window.Components = { NoticeSheet: { show: vi.fn() } };
};
const boot = () => { ls = makeLocalStorage(); load(); return S().init(); };
const relaunch = () => { load(); return S().init(); };

const S = () => global.window.Store;
const DB = () => global.window.StackdDB;
const sheet = () => global.window.Components.NoticeSheet.show;
const t = (key) => global.window.I18n.t(key);
const flush = () => new Promise((r) => setTimeout(r, 5)); // the sheet is deferred by setTimeout 0
const full = (room = 0) => { ls.quota = ls.size() + room; ls.log = []; };
const disk = (key) => ls.getItem('stackd_v1_' + key);
const addMain = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
  return S().getState().accounts.find(a => a.name === 'Main');
};
const expense = (accountId, comment = 'lunch') => ({
  type: 'expense', amount: 12, accountId, categoryId: 'cat_groceries', date: '2026-09-01', comment
});

describe('Storage full: every change is all or nothing (1.0.2, BUG-34)', () => {
  beforeEach(() => { boot(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('an ADD_TRANSACTION that does not fit returns false and leaves memory and disk as they were', () => {
    const main = addMain();
    const before = disk('transactions');
    full(20);

    const ok = S().dispatch('ADD_TRANSACTION', expense(main.id));

    expect(ok).toBe(false);
    expect(S().getState().transactions.some(x => x.comment === 'lunch')).toBe(false);
    expect(disk('transactions')).toBe(before);
  });

  it('ADD_ACCOUNT lands whole or not at all (never an account without its opening balance)', () => {
    const accountsBefore = disk('accounts');
    const defaultBefore = disk('defaultAccountId');
    full(170); // the account fits, its opening-balance row does not

    const ok = S().dispatch('ADD_ACCOUNT', { name: 'Fund 1', openingBalance: 1000 });

    // precondition: the accounts write itself succeeded, the row did not
    expect(ls.log.find(e => e.k === 'stackd_v1_accounts')).toEqual({ k: 'stackd_v1_accounts', ok: true });
    expect(ls.log.find(e => e.k === 'stackd_v1_transactions')).toEqual({ k: 'stackd_v1_transactions', ok: false });
    expect(ok).toBe(false);
    expect(S().getState().accounts.some(a => a.name === 'Fund 1')).toBe(false);
    expect(disk('accounts')).toBe(accountsBefore);
    expect(String(disk('accounts')).includes('Fund 1')).toBe(false);
    expect(S().getState().defaultAccountId).toBe('');
    expect(disk('defaultAccountId')).toBe(defaultBefore);
  });

  it('three failing dispatches in one tick show exactly one "Storage is full" sheet', async () => {
    const main = addMain();
    full(0);
    S().dispatch('ADD_TRANSACTION', expense(main.id, 'a'));
    S().dispatch('ADD_TRANSACTION', expense(main.id, 'b'));
    S().dispatch('ADD_TRANSACTION', expense(main.id, 'c'));
    expect(sheet()).not.toHaveBeenCalled(); // deferred past this change's render

    await flush();

    expect(sheet()).toHaveBeenCalledTimes(1);
    expect(sheet()).toHaveBeenCalledWith({
      id: 'storage-full-modal',
      tone: 'error',
      title: 'Storage is full',
      body: t('storage.fullBody')
    });
  });

  it('a flow that reports the failure itself claims it: takeSaveFailure() and no sheet', async () => {
    const main = addMain();
    full(0);
    S().dispatch('ADD_TRANSACTION', expense(main.id));

    expect(S().takeSaveFailure()).toEqual({ quota: true, boot: false });
    expect(S().takeSaveFailure()).toBeNull();
    await flush();
    expect(sheet()).not.toHaveBeenCalled();
  });

  it('a non-quota storage error still rolls back, with the "Couldn\'t save" sheet', async () => {
    const main = addMain();
    ls.failWith = Object.assign(new Error('denied'), { name: 'SecurityError' });

    expect(S().dispatch('ADD_TRANSACTION', expense(main.id))).toBe(false);

    expect(S().getState().transactions.some(x => x.comment === 'lunch')).toBe(false);
    await flush();
    expect(sheet()).toHaveBeenCalledWith(expect.objectContaining({
      id: 'storage-full-modal', tone: 'error', title: "Couldn't save", body: t('storage.failedBody')
    }));
  });

  it('Store.batch makes a delete + add one change: the deleted row comes back when the add does not fit', () => {
    const main = addMain();
    S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0 });
    const savings = S().getState().accounts.find(a => a.name === 'Savings');
    S().dispatch('ADD_TRANSACTION', expense(main.id, 't1'));
    const t1 = S().getState().transactions.find(x => x.comment === 't1');
    const before = disk('transactions');
    full(0);

    const ok = S().batch(() => {
      S().dispatch('DELETE_TRANSACTION', { id: t1.id });
      S().dispatch('ADD_TRANSFER', {
        amount: 12, expenseAccountId: main.id, incomeAccountId: savings.id,
        date: '2026-09-01', note: 'x'.repeat(400), tags: []
      });
    });

    expect(ok).toBe(false);
    expect(S().getState().transactions.some(x => x.id === t1.id)).toBe(true);
    expect(S().getState().transactions.some(x => x.transferRef)).toBe(false);
    expect(disk('transactions')).toBe(before);
  });

  it('a throw inside Store.batch rolls the change back and is rethrown', async () => {
    expect(() => S().batch(() => {
      S().dispatch('ADD_ACCOUNT', { name: 'Ghost', openingBalance: 5 });
      throw new Error('boom');
    })).toThrow('boom');

    expect(S().getState().accounts.some(a => a.name === 'Ghost')).toBe(false);
    expect(String(disk('accounts')).includes('Ghost')).toBe(false);
    await flush();
    expect(sheet()).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't save", body: t('storage.failedBody') }));
  });

  it('an ordinary dispatch writes the same keys and values as before, returns true and no revision key on web', () => {
    const main = addMain();
    ls.log = [];

    const ok = S().dispatch('ADD_TRANSACTION', expense(main.id));

    expect(ok).toBe(true);
    expect(ls.log.map(e => e.k)).toEqual(['stackd_v1_transactions']);
    expect(disk('transactions')).toBe(JSON.stringify(S().getState().transactions));
    expect(ls.getItem('stackd_mirror_rev')).toBeNull();
  });

  it('SET_DEFAULT_ACCOUNT ignores an id that names no account', () => {
    const main = addMain();
    expect(S().getState().defaultAccountId).toBe(main.id);
    const before = disk('defaultAccountId');

    S().dispatch('SET_DEFAULT_ACCOUNT', 'ghost-id');

    expect(S().getState().defaultAccountId).toBe(main.id);
    expect(disk('defaultAccountId')).toBe(before);
    S().dispatch('SET_DEFAULT_ACCOUNT', ''); // clearing still works
    expect(S().getState().defaultAccountId).toBe('');
  });

  it('a Pro unlock that cannot be saved is held for the session, with no storage sheet', async () => {
    full(0);
    global.window.Pro._activate({});

    expect(global.window.Pro.isActive(S().getState())).toBe(true);
    expect(disk('pro')).toBeNull();
    await flush();
    expect(sheet()).not.toHaveBeenCalled();
  });

  it('every persisted key has a _reloadSlice entry (static scan of store.js and main.js)', () => {
    const src = ['store.js', 'main.js'].map(f => readFileSync(resolve(__dirname, '../../src', f), 'utf8')).join('\n');
    const keys = new Set([...src.matchAll(/StackdDB\.(?:save|remove)\('(\w+)'/g)].map(m => m[1]));
    expect(keys.size).toBeGreaterThan(15);
    keys.forEach((key) => {
      expect(S()._reloadSlice(key), key).toBe(true);
    });
  });
});

describe('Storage full: the journal at the db level (1.0.2, BUG-34)', () => {
  beforeEach(() => { boot(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('refuses the rest of a failed change and rolls back the most-shrinking key first', () => {
    DB().save('a', 'x'.repeat(100));
    DB().save('b', 'y'.repeat(300));
    const a0 = disk('a');
    const b0 = disk('b');
    const t0 = ls.size();
    ls.quota = t0 + 50;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    DB().begin();
    expect(DB().save('b', 'y'.repeat(50))).toBe(true);  // shrinks by 250
    expect(DB().save('a', 'x'.repeat(250))).toBe(true); // grows by 150
    expect(DB().save('c', 'z'.repeat(1000))).toBe(false);
    ls.log = [];
    expect(DB().save('d', 1)).toBe(false); // the change is already lost
    expect(DB().remove('a')).toBe(false);
    expect(ls.log).toEqual([]);           // …so nothing is even attempted
    // precondition: putting b back first would exceed the quota
    expect(ls.size() + 250).toBeGreaterThan(ls.quota);
    const j = DB().end();

    expect(j.failed.name).toBe('QuotaExceededError');
    expect(disk('a')).toBe(a0);
    expect(disk('b')).toBe(b0);
    expect(disk('c')).toBeNull();
    expect(disk('d')).toBeNull();
    expect(err.mock.calls.some(c => String(c[0]).includes('rollback failed'))).toBe(false);
  });

  it('nested scopes join the outer change', () => {
    DB().begin();
    DB().begin();
    DB().save('n', 1);
    expect(DB().end()).toBeNull(); // nested: nothing settled yet
    expect(DB()._journal).not.toBeNull();
    const j = DB().end();
    expect(j.touched.has('n')).toBe(true);
    expect(DB()._journal).toBeNull();
  });
});

describe('Storage full at launch (1.0.2, BUG-34, D-U7-10)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('a boot whose recurring pass does not fit keeps memory equal to disk and says so', async () => {
    boot();
    const main = addMain();
    // an armed tail whose Feb..Dec members are not materialized yet
    const tail = {
      id: 'r1', type: 'expense', amount: 10, accountId: main.id, categoryId: 'cat_rent',
      date: '2026-01-05', time: '09:00', comment: 'rent', createdAt: '2026-01-05T09:00:00.000Z',
      recurrence: { seriesId: 's1', interval: 1, frequency: 'months', startDate: '2026-01-05', endDate: '2026-12-05', nextDate: '2026-02-05' }
    };
    ls.setItem('stackd_v1_transactions', JSON.stringify([...S().getState().transactions, tail]));
    const onDisk = disk('transactions');
    full(0);

    const ok = relaunch();

    expect(ok).toBe(false);
    expect(ls.log.some(e => e.k === 'stackd_v1_transactions' && !e.ok)).toBe(true); // precondition
    expect(S().getState().transactions).toEqual(JSON.parse(onDisk));
    expect(disk('transactions')).toBe(onDisk);
    await flush();
    expect(sheet()).toHaveBeenCalledWith({
      id: 'storage-full-modal', tone: 'error', title: 'Storage is full', body: t('storage.bootBody')
    });

    // the advice works: a delete fits, because memory equals disk
    const ob = S().getState().transactions.find(x => x.type === 'opening_balance');
    expect(S().dispatch('DELETE_TRANSACTION', { id: ob.id })).toBe(true);
    expect(JSON.parse(disk('transactions')).some(x => x.id === ob.id)).toBe(false);
  });

  it('a boot rolled back at the quota still holds safe icons and colours in memory (1.0.2, BUG-24)', () => {
    boot();
    const main = addMain();
    const evil = 'x"><img src=x onerror=alert(1)>';
    const accs = JSON.parse(disk('accounts')).map(a => ({ ...a, icon: evil, color: '#16A34A;"><img src=x>' }));
    ls.setItem('stackd_v1_accounts', JSON.stringify(accs));
    const cats = JSON.parse(disk('categories'));
    cats[0] = { ...cats[0], icon: evil };
    ls.setItem('stackd_v1_categories', JSON.stringify(cats));
    const tail = {
      id: 'r1', type: 'expense', amount: 10, accountId: main.id, categoryId: 'cat_rent',
      date: '2026-01-05', time: '09:00', comment: 'rent', createdAt: '2026-01-05T09:00:00.000Z',
      recurrence: { seriesId: 's1', interval: 1, frequency: 'months', startDate: '2026-01-05', endDate: '2026-12-05', nextDate: '2026-02-05' }
    };
    ls.setItem('stackd_v1_transactions', JSON.stringify([...S().getState().transactions, tail]));
    full(0);

    expect(relaunch()).toBe(false);
    expect(ls.log.some(e => e.k === 'stackd_v1_transactions' && !e.ok)).toBe(true); // precondition
    expect(disk('accounts')).toContain('onerror'); // disk is not healed until a boot fits

    const st = S().getState();
    expect(st.accounts.every(a => S().isSafeIcon(a.icon) && S().ACCOUNT_COLORS.includes(a.color))).toBe(true);
    expect(st.accounts[0].icon).toBe('wallet');
    expect(st.categories.every(c => S().isSafeIcon(c.icon))).toBe(true);
    expect(st.categories[0].icon).toBe('pin');
  });

  it('a boot seed that does not fit leaves the key absent and memory as init would have it', () => {
    boot();
    ls.removeItem('stackd_v1_homeWidgets');
    full(0);

    expect(relaunch()).toBe(false);

    expect(ls.getItem('stackd_v1_homeWidgets')).toBeNull();
    const seed = S()._defaultHomeWidgets();
    expect(S().getState().homeWidgets).toHaveLength(1);
    expect(S().getState().homeWidgets[0]).toMatchObject({ type: seed[0].type, size: seed[0].size, config: {} });
  });
});

describe('Storage full: a CSV restore is all or nothing (1.0.2, BUG-34, D-U7-5)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  // A two-account Stack'd backup, produced by the real exporter.
  const makeBackup = () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Alpha Bank', openingBalance: 500, openingDate: '2026-01-01' });
    S().dispatch('ADD_ACCOUNT', { name: 'Beta Card', openingBalance: 50, openingDate: '2026-01-01' });
    const st = S().getState();
    const alpha = st.accounts.find(a => a.name === 'Alpha Bank');
    const beta = st.accounts.find(a => a.name === 'Beta Card');
    for (let i = 0; i < 30; i++) {
      S().dispatch('ADD_TRANSACTION', { ...expense(i % 2 ? alpha.id : beta.id, 'row ' + i), date: '2026-03-' + String(1 + (i % 28)).padStart(2, '0') });
    }
    let csv = '';
    global.window.StackdExport._download = (name, content) => { csv = content; };
    global.window.StackdExport.exportTransactions(S().getState());
    return csv;
  };
  const importCsv = (csv) => {
    const out = { done: vi.fn(), fail: vi.fn() };
    global.window.StackdImport.importCSV({ text: csv }, S().getState(), out.done, out.fail);
    return out;
  };

  it('a backup whose rows do not fit lands nothing and reports "storage is full"', async () => {
    const csv = makeBackup();
    expect(csv.split('\n').length).toBeGreaterThan(30); // precondition
    boot(); // a new phone
    full(600);

    const out = importCsv(csv);

    expect(out.done).not.toHaveBeenCalled();
    expect(out.fail).toHaveBeenCalledTimes(1);
    expect(out.fail.mock.calls[0][0].message).toBe(t('others.importStorageFull'));
    expect(S().getState().accounts).toHaveLength(0);
    expect(String(disk('accounts'))).not.toMatch(/Alpha Bank|Beta Card/);
    expect(String(disk('transactions'))).not.toContain('row ');
    await flush();
    expect(sheet()).not.toHaveBeenCalled(); // the import flow reports it itself
  });

  it('a route that fails part-way rolls back what it already wrote', () => {
    const csv = makeBackup();
    boot();
    const boom = new Error('parse exploded');
    vi.spyOn(global.window.StackdImport, 'buildTransactions').mockImplementation(() => {
      S().dispatch('ADD_ACCOUNT', { name: 'Half Account', openingBalance: 0 });
      throw boom;
    });

    const out = importCsv(csv);

    expect(out.done).not.toHaveBeenCalled();
    expect(out.fail).toHaveBeenCalledWith(boom);
    expect(S().getState().accounts.some(a => a.name === 'Half Account')).toBe(false);
    expect(String(disk('accounts'))).not.toContain('Half Account');
  });

  it('guard: a throwing onComplete still ends in onError', () => {
    const csv = makeBackup();
    boot();
    const oops = new Error('render failed');
    const fail = vi.fn();
    global.window.StackdImport.importCSV({ text: csv }, S().getState(), () => { throw oops; }, fail);
    expect(fail).toHaveBeenCalledWith(oops);
  });
});

// Post-integration (U7 x U5): RESET_APP writes the shrinking slices first and
// the growing ones (categories back to DEFAULT_CATEGORIES, the widget seed,
// the view/default resets) last, so a factory reset at the quota lands.
describe('Storage full: a factory reset at the quota (1.0.2, BUG-34 x BUG-29)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('RESET_APP at the quota, with fewer categories stored than the defaults, returns true and empties the transactions', async () => {
    boot();
    const main = addMain();
    for (let i = 0; i < 40; i++) S().dispatch('ADD_TRANSACTION', expense(main.id, 'row ' + i));
    const fewCats = JSON.stringify(JSON.parse(disk('categories')).slice(0, 2));
    ls.setItem('stackd_v1_categories', fewCats);
    full(0);

    const ok = S().dispatch('RESET_APP');

    expect(ok).toBe(true);
    expect(disk('transactions')).toBe('[]');
    expect(disk('accounts')).toBe('[]');
    // the categories write grew the slice back to the defaults, at the quota
    expect(ls.log.find(e => e.k === 'stackd_v1_categories')).toEqual({ k: 'stackd_v1_categories', ok: true });
    expect(disk('categories').length).toBeGreaterThan(fewCats.length);
    expect(JSON.parse(disk('categories')).length).toBeGreaterThan(2);
    expect(ls.getItem('stackd_v1_setup_done')).toBeNull();
    await flush();
    expect(sheet()).not.toHaveBeenCalled();
  });
});
