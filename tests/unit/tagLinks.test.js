// 1.2.0 (UX-9, docs/ux-review-1.2-plan.md §C.1/§C.4) — category-scoped tags.
// The explicit tagLinks slice ({ tag: categoryId[] }), the derived links that
// saved transactions imply (lazy _tagCatIdx), the getters the tag picker
// reads, the four actions, the DELETE_CATEGORY hook, the boot heal (incl. the
// unreadable-categories guard that must NOT save), cross-tab, dryRun, and the
// categories CSV `tags` column.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let writes = [];
const makeLocalStorage = (seed = {}) => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { writes.push(k); map.set(k, String(v)); },
    removeItem: (k) => { writes.push(k); map.delete(k); },
    clear: () => map.clear(),
    _map: map
  };
};

let storageListener = null;
const boot = (seed = {}, { withIo = false } = {}) => {
  let uid = 0;
  writes = [];
  storageListener = null;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uid}` },
    localStorage: makeLocalStorage({ stackd_v1_homeWidgets: '[]', ...seed }),
    addEventListener: (type, fn) => { if (type === 'storage') storageListener = fn; },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} })
  };
  global.localStorage = global.window.localStorage;
  const files = ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js'];
  if (withIo) files.push('export.js', 'import.js');
  files.forEach(executeFile);
  global.window.Store.init();
};

const S = () => global.window.Store;
const disk = (key) => {
  const raw = global.window.localStorage.getItem('stackd_v1_' + key);
  return raw == null ? undefined : JSON.parse(raw);
};
const tick = () => new Promise(r => setTimeout(r, 0));
const addAccount = () => {
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0, openingDate: '2026-01-01' });
  return S().getState().accounts[0].id;
};
const addTx = (accId, over = {}) => S().dispatch('ADD_TRANSACTION', {
  type: 'expense', amount: 5, accountId: accId, categoryId: 'cat_groceries', date: '2026-10-02', tags: [], ...over
});

describe('tag links — actions', () => {
  beforeEach(() => boot());

  it('LINK_TAG normalises the key, links a known category and saves', () => {
    S().dispatch('LINK_TAG', { tag: '  #Road   Trip ', categoryId: 'cat_groceries' });
    expect(S().getState().tagLinks).toEqual({ 'road trip': ['cat_groceries'] });
    expect(disk('tagLinks')).toEqual({ 'road trip': ['cat_groceries'] });
  });

  it('LINK_TAG with no category creates an unlinked explicit tag; an unknown id is ignored', () => {
    S().dispatch('LINK_TAG', { tag: 'solo', categoryId: null });
    S().dispatch('LINK_TAG', { tag: 'ghost', categoryId: 'cat_nope' });
    expect(S().getState().tagLinks).toEqual({ solo: [], ghost: [] });
  });

  it('LINK_TAG rejects empty and reserved tags', () => {
    ['', '   ', '#', '__untagged__', '__all__', 'uncategorized'].forEach(tag =>
      S().dispatch('LINK_TAG', { tag, categoryId: 'cat_groceries' }));
    expect(S().getState().tagLinks).toEqual({});
    S().dispatch('LINK_TAG', { tag: '__untagged__x', categoryId: 'cat_groceries' }); // only the exact sentinels are reserved
    expect(S().getState().tagLinks).toEqual({ __untagged__x: ['cat_groceries'] });
  });

  it('LINK_TAG saves only on a change and links each id once', () => {
    S().dispatch('LINK_TAG', { tag: 'food', categoryId: 'cat_groceries' });
    writes = [];
    S().dispatch('LINK_TAG', { tag: 'FOOD', categoryId: 'cat_groceries' });
    expect(writes).not.toContain('stackd_v1_tagLinks');
    S().dispatch('LINK_TAG', { tag: 'food', categoryId: 'cat_dining' });
    expect(S().getState().tagLinks.food).toEqual(['cat_groceries', 'cat_dining']);
  });

  it('LINK_TAG {silent} saves without queuing a render; without silent it renders', async () => {
    await tick();
    const seen = vi.fn();
    S().subscribe(seen);
    S().dispatch('LINK_TAG', { tag: 'quiet', categoryId: 'cat_groceries', silent: true });
    expect(S()._emitQueued).toBeFalsy();
    await tick();
    expect(seen).not.toHaveBeenCalled();
    expect(disk('tagLinks')).toEqual({ quiet: ['cat_groceries'] });
    S().dispatch('LINK_TAG', { tag: 'loud', categoryId: 'cat_groceries' });
    await tick();
    expect(seen).toHaveBeenCalled();
  });

  it('UNLINK_TAG removes one id and keeps the tag; DELETE_TAG drops the key only', () => {
    const acc = addAccount();
    S().dispatch('LINK_TAG', { tag: 'trip', categoryId: 'cat_groceries' });
    S().dispatch('LINK_TAG', { tag: 'trip', categoryId: 'cat_dining' });
    S().dispatch('UNLINK_TAG', { tag: 'trip', categoryId: 'cat_groceries' });
    expect(S().getState().tagLinks.trip).toEqual(['cat_dining']);
    addTx(acc, { tags: ['trip'] });
    S().dispatch('DELETE_TAG', { tag: 'Trip' });
    expect(S().getState().tagLinks).toEqual({});
    expect(disk('tagLinks')).toEqual({});
    expect(S().getState().transactions.find(t => t.type === 'expense').tags).toEqual(['trip']);
    expect(S().getAllUniqueTags()).toEqual(['trip']); // still carried by the row
  });

  it('SET_TAG_LINKS merges by default (normalised, known ids only) and replaces with merge:false', () => {
    S().dispatch('LINK_TAG', { tag: 'keep', categoryId: 'cat_groceries' });
    S().dispatch('SET_TAG_LINKS', { links: { ' New ': ['cat_dining', 'cat_dining', 'cat_nope', 7], keep: ['cat_dining'], __all__: ['cat_dining'] } });
    expect(S().getState().tagLinks).toEqual({ keep: ['cat_groceries', 'cat_dining'], new: ['cat_dining'] });
    S().dispatch('SET_TAG_LINKS', { links: { only: [] }, merge: false });
    expect(S().getState().tagLinks).toEqual({ only: [] });
    expect(disk('tagLinks')).toEqual({ only: [] });
  });

  it('DELETE_CATEGORY strips the id from every link in the same change; the tags stay', () => {
    S().dispatch('ADD_CATEGORY', { id: 'c_hobby', name: 'Hobby', icon: 'pin', typeHint: 'expense' });
    S().dispatch('LINK_TAG', { tag: 'guitar', categoryId: 'c_hobby' });
    S().dispatch('LINK_TAG', { tag: 'guitar', categoryId: 'cat_groceries' });
    S().dispatch('LINK_TAG', { tag: 'strings', categoryId: 'c_hobby' });
    S().dispatch('DELETE_CATEGORY', { id: 'c_hobby' });
    expect(S().getState().categories.some(c => c.id === 'c_hobby')).toBe(false);
    expect(S().getState().tagLinks).toEqual({ guitar: ['cat_groceries'], strings: [] });
    expect(disk('tagLinks')).toEqual({ guitar: ['cat_groceries'], strings: [] });
  });

  it('a refused DELETE_CATEGORY (rows still use it) leaves the links alone', () => {
    const acc = addAccount();
    S().dispatch('LINK_TAG', { tag: 'milk', categoryId: 'cat_groceries' });
    addTx(acc);
    S().dispatch('DELETE_CATEGORY', { id: 'cat_groceries' });
    expect(S().getState().tagLinks).toEqual({ milk: ['cat_groceries'] });
  });

  // Review fix: a tag named after an Object.prototype member must behave
  // like any other tag, and '__proto__' must never become a key.
  it('tags named after Object.prototype members are plain tags', () => {
    const acc = addAccount();
    ['constructor', 'toString', 'hasOwnProperty'].forEach(tag => {
      expect(S().getTagLinks(tag)).toEqual([]);
      expect(() => S().dispatch('UNLINK_TAG', { tag, categoryId: 'cat_groceries' })).not.toThrow();
    });
    addTx(acc, { categoryId: 'cat_dining', tags: ['constructor'] });
    expect(S().getTagLinks('constructor')).toEqual(['cat_dining']);
    S().dispatch('LINK_TAG', { tag: 'constructor', categoryId: 'cat_groceries' });
    expect(S().getTagLinks('constructor')).toEqual(['cat_groceries', 'cat_dining']);
    expect(S().getTagsForCategory('cat_groceries').linked).toEqual(['constructor']);
    S().dispatch('UNLINK_TAG', { tag: 'constructor', categoryId: 'cat_groceries' });
    expect(disk('tagLinks')).toEqual({ constructor: [] });
  });

  it("'__proto__' is rejected and never swaps the slice's prototype", () => {
    expect(S().normalizeTag('__proto__')).toBe('');
    expect(S().normalizeTag(' #__PROTO__ ')).toBe('');
    writes = [];
    S().dispatch('LINK_TAG', { tag: '__proto__', categoryId: 'cat_groceries' });
    S().dispatch('SET_TAG_LINKS', { links: JSON.parse('{"__proto__":["cat_groceries"],"ok":["cat_groceries"]}') });
    const links = S().getState().tagLinks;
    expect(Object.getPrototypeOf(links)).toBe(Object.prototype);
    expect(Object.keys(links)).toEqual(['ok']);
    expect(disk('tagLinks')).toEqual({ ok: ['cat_groceries'] });
    ['map', 'filter', 'join'].forEach(tag => expect(S().getTagLinks(tag)).toEqual([]));
  });

  it('RESET_APP clears the slice', () => {
    S().dispatch('LINK_TAG', { tag: 'x', categoryId: 'cat_groceries' });
    expect(disk('tagLinks')).toEqual({ x: ['cat_groceries'] });
    S().dispatch('RESET_APP');
    expect(S().getState().tagLinks).toEqual({});
    expect(disk('tagLinks')).toEqual({});
  });
});

describe('tag links — getters and the derived index', () => {
  beforeEach(() => boot());

  it('getAllUniqueTags = transaction tags ∪ explicit tags, compareAlpha order, substring query', () => {
    const acc = addAccount();
    addTx(acc, { tags: ['tag10', 'zeta'] });
    addTx(acc, { tags: ['tag2'] });
    S().dispatch('LINK_TAG', { tag: 'Alpha', categoryId: null });
    expect(S().getAllUniqueTags()).toEqual(['alpha', 'tag2', 'tag10', 'zeta']);
    expect(S().getAllUniqueTags('TAG')).toEqual(['tag2', 'tag10']);
  });

  it('getTagsForCategory: explicit ∪ derived first (alphabetical), then every other tag', () => {
    const acc = addAccount();
    addTx(acc, { categoryId: 'cat_groceries', tags: ['milk', 'bread'] });
    addTx(acc, { categoryId: 'cat_dining', tags: ['pizza', 'bread'] });
    S().dispatch('LINK_TAG', { tag: 'apples', categoryId: 'cat_groceries' });
    S().dispatch('LINK_TAG', { tag: 'unused', categoryId: null });
    expect(S().getTagsForCategory('cat_groceries')).toEqual({ linked: ['apples', 'bread', 'milk'], others: ['pizza', 'unused'] });
    expect(S().getTagsForCategory('cat_dining')).toEqual({ linked: ['bread', 'pizza'], others: ['apples', 'milk', 'unused'] });
    expect(S().getTagsForCategory('')).toEqual({ linked: [], others: ['apples', 'bread', 'milk', 'pizza', 'unused'] });
  });

  it('getTagLinks lists explicit ids first, then derived ones, each once', () => {
    const acc = addAccount();
    S().dispatch('LINK_TAG', { tag: 'shared', categoryId: 'cat_dining' });
    addTx(acc, { categoryId: 'cat_groceries', tags: ['shared'] });
    addTx(acc, { categoryId: 'cat_dining', tags: ['shared'] });
    expect(S().getTagLinks('shared')).toEqual(['cat_dining', 'cat_groceries']);
    expect(S().getTagLinks('nobody')).toEqual([]);
  });

  it('derived links count every saved row (unpaid, transfers excluded by their empty category)', () => {
    const acc = addAccount();
    S().dispatch('ADD_ACCOUNT', { name: 'Second', openingBalance: 0, openingDate: '2026-01-01' });
    const acc2 = S().getState().accounts.find(a => a.name === 'Second').id;
    addTx(acc, { categoryId: 'cat_groceries', tags: ['later'], isPaid: false });
    S().dispatch('ADD_TRANSFER', { amount: 3, expenseAccountId: acc, incomeAccountId: acc2, date: '2026-10-02', note: '', tags: ['moving'] });
    expect(S().getTagsForCategory('cat_groceries').linked).toEqual(['later']);
    expect(S().getTagLinks('moving')).toEqual([]);
    expect(S().getAllUniqueTags()).toContain('moving');
  });

  it('the derived index is rebuilt after a dispatch, _sortData and dryRun', () => {
    const acc = addAccount();
    addTx(acc, { tags: ['one'] });
    expect(S().getTagsForCategory('cat_groceries').linked).toEqual(['one']);
    addTx(acc, { tags: ['two'] });
    expect(S().getTagsForCategory('cat_groceries').linked).toEqual(['one', 'two']);
    // a write that bypasses dispatch, then _sortData (the cross-tab path)
    S().state.transactions.push({ id: 'raw', type: 'expense', amount: 1, accountId: acc, categoryId: 'cat_groceries', date: '2026-10-03', tags: ['three'] });
    S()._sortData();
    expect(S().getTagsForCategory('cat_groceries').linked).toEqual(['one', 'three', 'two']);
    S().dryRun(() => {
      addTx(acc, { tags: ['dry'] });
      expect(S().getTagsForCategory('cat_groceries').linked).toContain('dry');
    });
    expect(S().getTagsForCategory('cat_groceries').linked).not.toContain('dry');
  });

  it('dryRun takes LINK_TAG back, in memory and on disk', () => {
    S().dispatch('LINK_TAG', { tag: 'real', categoryId: 'cat_groceries' });
    S().dryRun(() => {
      S().dispatch('LINK_TAG', { tag: 'dry', categoryId: 'cat_groceries' });
      S().dispatch('LINK_TAG', { tag: 'real', categoryId: 'cat_dining' });
      expect(Object.keys(S().getState().tagLinks)).toContain('dry');
    });
    expect(S().getState().tagLinks).toEqual({ real: ['cat_groceries'] });
    expect(disk('tagLinks')).toEqual({ real: ['cat_groceries'] });
  });
});

describe('tag links — boot heal and cross-tab', () => {
  afterEach(() => { storageListener = null; });

  it('a consistent install writes no tagLinks at boot', () => {
    boot({ stackd_v1_tagLinks: JSON.stringify({ food: ['cat_groceries'], solo: [] }) });
    expect(writes).not.toContain('stackd_v1_tagLinks');
    expect(S().getState().tagLinks).toEqual({ food: ['cat_groceries'], solo: [] });
    expect(S().getTagsForCategory('cat_groceries').linked).toEqual(['food']);
  });

  it('heals un-normalised keys, unknown ids, sentinels and duplicates, and saves once', () => {
    boot({ stackd_v1_tagLinks: JSON.stringify({ ' Food ': ['cat_groceries', 'cat_gone', 'cat_groceries'], food: ['cat_dining'], __untagged__: ['cat_dining'], bad: 'x' }) });
    const healed = { food: ['cat_groceries', 'cat_dining'], bad: [] };
    expect(S().getState().tagLinks).toEqual(healed);
    expect(disk('tagLinks')).toEqual(healed);
    expect(writes.filter(k => k === 'stackd_v1_tagLinks')).toHaveLength(1);
  });

  it("a stored '__proto__' key is dropped at load and heal, the prototype intact", () => {
    boot({ stackd_v1_tagLinks: '{"__proto__":["cat_groceries"],"food":["cat_groceries"]}' });
    const links = S().getState().tagLinks;
    expect(Object.getPrototypeOf(links)).toBe(Object.prototype);
    expect(Object.keys(links)).toEqual(['food']);
    expect(S().getTagLinks('map')).toEqual([]);
  });

  it('is idempotent: a second boot over the healed slice writes nothing', () => {
    boot({ stackd_v1_tagLinks: JSON.stringify({ ' A ': ['cat_groceries'] }) });
    const after = global.window.localStorage.getItem('stackd_v1_tagLinks');
    expect(JSON.parse(after)).toEqual({ a: ['cat_groceries'] });
    boot({ stackd_v1_tagLinks: after });
    expect(writes).not.toContain('stackd_v1_tagLinks');
  });

  it('a corrupt (non-object) slice loads as {} and is neither healed nor re-saved', () => {
    ['[1,2]', '"text"', '42', 'not json'].forEach(raw => {
      boot({ stackd_v1_tagLinks: raw });
      expect(S().getState().tagLinks).toEqual({});
      expect(writes).not.toContain('stackd_v1_tagLinks');
      S().dispatch('LINK_TAG', { tag: 'fresh', categoryId: null }); // the slice works again
      expect(disk('tagLinks')).toEqual({ fresh: [] });
    });
  });

  it('skips entirely (no save) when a transaction names a category this install lacks', () => {
    // An unreadable categories key boots with the defaults: the user's own
    // categories are "unknown" and healing would drop their links for good.
    const accounts = [{ id: 'a1', name: 'Main', type: 'checking', currency: 'EUR', icon: 'wallet', color: '#E60023', createdAt: '2026-01-01T00:00:00.000Z' }];
    const txs = [
      { id: 'ob', type: 'opening_balance', amount: 0, accountId: 'a1', categoryId: 'cat_balance', date: '2026-01-01' },
      { id: 't1', type: 'expense', amount: 5, accountId: 'a1', categoryId: 'c_mine', date: '2026-10-02', tags: ['x'] }
    ];
    const links = { ' Mine ': ['c_mine'], gone: ['c_gone'] };
    boot({
      stackd_v1_categories: '{corrupt',
      stackd_v1_accounts: JSON.stringify(accounts),
      stackd_v1_transactions: JSON.stringify(txs),
      stackd_v1_tagLinks: JSON.stringify(links)
    });
    expect(writes).not.toContain('stackd_v1_tagLinks');
    expect(disk('tagLinks')).toEqual(links);
    expect(S().getTagLinks('x')).toEqual(['c_mine']); // the row's own (derived) link still reads
  });

  it('another tab’s tagLinks write is reloaded here', async () => {
    boot();
    expect(typeof storageListener).toBe('function');
    global.window.localStorage._map.set('stackd_v1_tagLinks', JSON.stringify({ remote: ['cat_groceries'] }));
    await storageListener({ key: 'stackd_v1_tagLinks' });
    expect(S().getState().tagLinks).toEqual({ remote: ['cat_groceries'] });
    expect(S().getTagsForCategory('cat_groceries').linked).toEqual(['remote']);
  });

  it('the storage-failure rollback reloads the slice (it has a _reloadSlice case)', () => {
    boot();
    global.window.localStorage._map.set('stackd_v1_tagLinks', JSON.stringify({ ondisk: ['cat_dining'] }));
    expect(S()._reloadSlice('tagLinks')).toBe(true);
    S()._tagCatIdx = null;
    expect(S().getTagsForCategory('cat_dining').linked).toEqual(['ondisk']);
  });
});

describe('tag links — categories CSV `tags` column', () => {
  let csv;
  const exportCats = () => {
    csv = null;
    global.window.StackdExport._download = (name, content) => { csv = content; };
    global.window.StackdExport.exportCategories(S().getState());
    return csv;
  };
  const importFile = (text) => {
    let out;
    global.window.StackdImport.importCSV({ text }, S().getState(), (r) => { out = r; }, (err) => { throw err; });
    return out;
  };

  beforeEach(() => {
    global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
    boot({}, { withIo: true });
  });

  it('exports id,name,icon,type_hint,tags with the explicit links pipe-joined', () => {
    S().dispatch('LINK_TAG', { tag: 'milk', categoryId: 'cat_groceries' });
    S().dispatch('LINK_TAG', { tag: 'road trip', categoryId: 'cat_groceries' });
    S().dispatch('LINK_TAG', { tag: 'solo', categoryId: null });
    const lines = exportCats().split('\n');
    expect(lines[0]).toBe('id,name,icon,type_hint,tags');
    const groceries = lines.find(l => l.startsWith('cat_groceries,'));
    expect(groceries.endsWith(',milk|road trip')).toBe(true);
    const dining = lines.find(l => l.startsWith('cat_dining,'));
    expect(dining.endsWith(',')).toBe(true);
    expect(csv).not.toContain('solo'); // accepted limit: no category, no row
  });

  it('round-trips: a restore on a fresh install links the tags to the same-named categories', () => {
    S().dispatch('ADD_CATEGORY', { id: 'c_hobby', name: 'Hobby', icon: 'guitar', typeHint: 'expense' });
    S().dispatch('LINK_TAG', { tag: 'strings', categoryId: 'c_hobby' });
    S().dispatch('LINK_TAG', { tag: 'café', categoryId: 'cat_groceries' });
    const text = exportCats();
    boot({}, { withIo: true });
    const result = importFile(text);
    expect(result.kind).toBe('categories');
    const hobby = S().getState().categories.find(c => c.name === 'Hobby');
    expect(hobby).toBeTruthy();
    expect(S().getState().tagLinks).toEqual({ strings: [hobby.id], 'café': ['cat_groceries'] });
    expect(disk('tagLinks')).toEqual(S().getState().tagLinks);
  });

  it('merges into the links already here', () => {
    S().dispatch('LINK_TAG', { tag: 'mine', categoryId: 'cat_dining' });
    importFile(['id,name,icon,type_hint,tags', 'cat_dining,Dining Out,utensils,expense,Pizza|mine'].join('\n'));
    expect(S().getState().tagLinks).toEqual({ mine: ['cat_dining'], pizza: ['cat_dining'] });
  });

  it("a tags column naming 'constructor' / '__proto__' restores without throwing", () => {
    const result = importFile(['id,name,icon,type_hint,tags', 'cat_dining,Dining Out,utensils,expense,constructor|__proto__|pizza'].join('\n'));
    expect(result.kind).toBe('categories');
    const links = S().getState().tagLinks;
    expect(Object.getPrototypeOf(links)).toBe(Object.prototype);
    expect(links).toEqual({ constructor: ['cat_dining'], pizza: ['cat_dining'] });
    expect(disk('tagLinks')).toEqual(links);
  });

  it('an older 4-column file still restores, with no links', () => {
    const result = importFile(['id,name,icon,type_hint', 'x1,Pets,dog,expense'].join('\n'));
    expect(result.kind).toBe('categories');
    expect(S().getState().categories.some(c => c.name === 'Pets')).toBe(true);
    expect(S().getState().tagLinks).toEqual({});
    expect(writes).not.toContain('stackd_v1_tagLinks');
    // ...and this install's own export of it carries the new column
    expect(exportCats().split('\n').find(l => l.includes(',Pets,'))).toMatch(/,dog,expense,$/);
  });

  it('a header-only 5-column export is still recognised as categories', () => {
    const header = exportCats().split('\n')[0];
    expect(header).toBe('id,name,icon,type_hint,tags');
    expect(global.window.StackdImport._stackdKindOfHeaderOnly(header)).toBe('categories');
  });
});
