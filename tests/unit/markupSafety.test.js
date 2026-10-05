// 1.0.2 (BUG-24) — markup-safety guard: stored text must never become markup.
//
// Account, category and tag names, notes, account types, series ids and file
// text are free text and are escaped at every innerHTML sink. Account colours
// and icons are enumerations: every write path validates them and the boot
// heals what older builds stored. This guard seeds a marker payload into every
// one of those fields through the REAL write paths — typed (dispatch), the
// CSV importer (accounts, categories, transactions) and a poisoned pre-1.0.2
// localStorage booted through Store.init — then renders every screen, sheet
// and picker, and records every HTML string that reaches innerHTML /
// insertAdjacentHTML / outerHTML. A raw '<x-xss' anywhere = an unescaped sink.
// A new sink, or a new free-text field rendered raw, fails here. The full
// sweep (every view, every sheet, two levels of taps) is escapeGuard.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Breaks out of a double- or single-quoted attribute, then opens an element.
const P = (k) => `${k}"'><x-xss data-k="${k}"></x-xss>`;
const FIELDS = ['accname', 'acctype', 'color', 'accicon', 'csvacc', 'csvtype', 'csvcolor', 'csvicon',
  'catname', 'caticon', 'csvcat', 'csvcaticon', 'txacc', 'txcat', 'tag', 'note', 'series', 'bootcolor', 'booticon', 'bootcaticon',
  'rawtag', 'oldacc', 'oldtype', 'oldcat', 'oldtag', 'oldseries', 'oldnote',
  'csvaccid', 'csvcatid', 'txid', 'txaccid', 'linkid'];
const SAFE_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

let recorded;
let restoreSpies;
const spyHtmlSinks = () => {
  const EP = global.Element.prototype;
  const ih = Object.getOwnPropertyDescriptor(EP, 'innerHTML');
  const oh = Object.getOwnPropertyDescriptor(EP, 'outerHTML');
  const iah = EP.insertAdjacentHTML;
  Object.defineProperty(EP, 'innerHTML', { configurable: true, get() { return ih.get.call(this); }, set(v) { recorded.push(String(v)); ih.set.call(this, v); } });
  Object.defineProperty(EP, 'outerHTML', { configurable: true, get() { return oh.get.call(this); }, set(v) { recorded.push(String(v)); oh.set.call(this, v); } });
  EP.insertAdjacentHTML = function (pos, v) { recorded.push(String(v)); return iah.call(this, pos, v); };
  return () => {
    Object.defineProperty(EP, 'innerHTML', ih);
    Object.defineProperty(EP, 'outerHTML', oh);
    EP.insertAdjacentHTML = iah;
  };
};

const leaks = () => {
  const out = new Set();
  recorded.forEach(html => FIELDS.forEach(k => { if (html.includes(`<x-xss data-k="${k}"`)) out.add(k); }));
  if (document.querySelector('x-xss')) document.querySelectorAll('x-xss').forEach(el => out.add(el.getAttribute('data-k')));
  return [...out].sort();
};

const S = () => global.window.Store;

const boot = (poisonedStorage) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
  let uid = 0;
  const store = new Map(Object.entries(poisonedStorage || {}));
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    location: { hash: '' },
    StackdHydrateIcons: () => {},
    lucide: { createIcons: () => {} },
    Router: { navigate: () => {}, getParams: () => global.window.__params || {}, handleRouteChange: () => {} },
    alert: () => {}
  };
  global.window.Chart = function () { this.destroy = () => {}; this.update = () => {}; };
  global.window.Chart.getChart = () => null;
  global.localStorage = global.window.localStorage;
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
  global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  global.Element.prototype.scrollTo = () => {};
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'insights.js', 'views.js', 'export.js', 'import.js']) executeFile(f);
  S().init();
  S().dispatch('SET_CURRENCY', 'EUR');
};

const importCsv = (text) => {
  let out;
  global.window.StackdImport.importCSV({ text }, S().getState(), (r) => { out = r; }, (e) => { throw e; });
  return out;
};
const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

const seed = () => {
  // typed: Home → Add wallet / "+ Add custom"
  S().dispatch('ADD_ACCOUNT', { name: P('accname'), type: P('acctype'), color: P('color'), icon: P('accicon'), openingBalance: 1000, openingDate: '2026-01-01' });
  S().dispatch('ADD_CATEGORY', { name: P('catname'), icon: P('caticon'), typeHint: 'both' });
  // accounts CSV (a "budget template" / tampered backup)
  importCsv('id,name,opening_balance,created_at,currency,type,icon,color,opening_date\n'
    + [P('csvaccid'), P('csvacc'), '300', '2026-09-01T00:00:00.000Z', 'EUR', P('csvtype'), P('csvicon'), P('csvcolor'), '2026-09-01'].map(csvCell).join(',') + '\n');
  // categories CSV
  importCsv('id,name,icon,typeHint\n' + [P('csvcatid'), P('csvcat'), P('csvcaticon'), 'expense'].map(csvCell).join(',') + '\n');
  // transactions CSV: auto-created account + category, tags, note, series id
  importCsv('Date,Type,Amount,Account,Category,Note,Tags,SeriesId,Frequency,Interval,EndDate,AccountId,Id\n'
    + ['2026-10-01', 'expense', '12.50', P('txacc'), P('txcat'), P('note'), P('tag'), P('series'), 'months', '1', '2026-12-01', P('txaccid'), P('txid')].map(csvCell).join(',') + '\n');
  const st = S().getState();
  const tx = st.transactions.find(t => t.type === 'expense');
  const cat = st.categories.find(c => c.name === P('txcat'));
  S().dispatch('SAVE_BUDGET', { categoryId: cat.id, amount: 100 });
  st.historyFilters.tags = (tx.tags || []).slice();
  return { tx, cat, acc: st.accounts.find(a => a.name === P('accname')) };
};

const VIEWS = [
  ['dashboard', 'DashboardView'], ['transactions', 'TransactionsView'], ['add', 'AddTransactionView'],
  ['categories', 'CategoriesView'], ['budget', 'BudgetView'], ['analytics', 'AnalyticsView'],
  ['settings', 'OthersView'], ['tags', 'TagsView'], ['debt', 'DebtHubView']
];
const renderView = (activeView, mod, params) => {
  global.window.__params = params || {};
  S().state.activeView = activeView;
  const root = document.getElementById('router-view');
  const V = global.window.Views[mod];
  root.innerHTML = V.render(S().getState());
  if (V.attachEvents) V.attachEvents(root, S().getState(), true);
  return root;
};
const click = (el) => { if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };

describe('Markup safety (1.0.2 BUG-24)', () => {
  beforeEach(() => { recorded = []; restoreSpies = spyHtmlSinks(); });
  afterEach(() => { restoreSpies(); vi.useRealTimers(); document.body.innerHTML = ''; });

  it('typed and imported names, types, tags, notes and series ids render as text on every screen', () => {
    boot();
    const { tx, cat, acc } = seed();
    VIEWS.forEach(([v, m]) => renderView(v, m));
    renderView('edit', 'AddTransactionView', { id: tx.id });
    renderView('category-detail', 'CategoryDetailView', { id: cat.id });
    renderView('edit-category', 'EditCategoryView', { id: cat.id });
    renderView('edit-account', 'EditAccountView', { id: acc.id });
    global.window.Views.BudgetView.editCategoryId = cat.id;
    renderView('budget', 'BudgetView');
    global.window.Views.BudgetView.editCategoryId = null;
    expect(leaks()).toEqual([]);
  });

  it('sheets and pickers: Manage accounts, delete account, filters, category picker, graph filters', () => {
    boot();
    const { tx, acc } = seed();
    click(renderView('settings', 'OthersView').querySelector('#btn-manage-accounts'));
    click(renderView('edit-account', 'EditAccountView', { id: acc.id }).querySelector('#btn-edit-acc-delete'));
    global.window.Components.FilterModal.show('transactions');
    global.window.Components.CategorySelectionModal.show({ type: 'expense', selectedId: '', onSelect: () => {} });
    global.window.Components.ExpandedGraphModal.show(S().getState());
    click(document.getElementById('egm-filter'));
    document.body.insertAdjacentHTML('beforeend', global.window.Components.TransactionItem.render(tx,
      S().getState().categories.find(c => c.id === tx.categoryId), S().getState().accounts.find(a => a.id === tx.accountId), {}));
    expect(leaks()).toEqual([]);
  });

  it('colours and icons are validated on write (typed and imported)', () => {
    boot();
    seed();
    const st = S().getState();
    st.accounts.forEach(a => {
      expect(S().ACCOUNT_COLORS).toContain(a.color);
      expect(a.icon).not.toMatch(/[<>"'&\s]/);
    });
    st.categories.forEach(c => expect(c.icon).not.toMatch(/[<>"'&\s]/));
  });

  it('boot heals colours and icons stored by 1.0/1.0.1 imports', () => {
    boot({
      stackd_v1_accounts: JSON.stringify([{ id: 'old1', name: 'Old', color: P('bootcolor'), icon: P('booticon'), type: 'Bank', currency: 'EUR', createdAt: '2026-01-01T00:00:00.000Z' }]),
      stackd_v1_categories: JSON.stringify([{ id: 'oldc', name: 'Oldcat', icon: P('bootcaticon'), isDefault: false, typeHint: 'both' }])
    });
    renderView('dashboard', 'DashboardView');
    renderView('categories', 'CategoriesView');
    expect(leaks()).toEqual([]);
    expect(S().getState().accounts[0].icon).toBe('wallet');
    expect(S().getState().categories.find(c => c.id === 'oldc').icon).toBe('pin');
  });

  it('data stored by 1.0/1.0.1 (names, types, tags, series ids) renders as text and is not rewritten', () => {
    const tx = { id: 'oldtx', type: 'expense', amount: 5, accountId: 'olda', categoryId: 'oldc', date: '2026-10-02', time: '10:00',
      comment: P('oldnote'), tags: [P('oldtag')], recurrence: { seriesId: P('oldseries'), frequency: 'months', interval: 1, startDate: '2026-10-02', endDate: '2026-10-02' } };
    boot({
      stackd_v1_accounts: JSON.stringify([{ id: 'olda', name: P('oldacc'), color: '#E60023', icon: 'wallet', type: P('oldtype'), currency: 'EUR', createdAt: '2026-01-01T00:00:00.000Z' }]),
      stackd_v1_categories: JSON.stringify([{ id: 'oldc', name: P('oldcat'), icon: 'pin', isDefault: false, typeHint: 'both' }]),
      stackd_v1_transactions: JSON.stringify([tx])
    });
    S().getState().historyFilters.tags = [P('oldtag')];
    VIEWS.forEach(([v, m]) => renderView(v, m));
    renderView('edit', 'AddTransactionView', { id: 'oldtx' });
    renderView('category-detail', 'CategoryDetailView', { id: 'oldc' });
    expect(leaks()).toEqual([]);
    const st = S().getState();
    expect(st.accounts[0].name).toBe(P('oldacc'));
    expect(st.transactions.find(t => t.id === 'oldtx').tags).toEqual([P('oldtag')]);
    expect(st.transactions.find(t => t.id === 'oldtx').recurrence.seriesId).toBe(P('oldseries'));
  });

  it('a raw stored tag stays text in the tag chips and the tag autocomplete', async () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { id: 'a', name: 'Main', openingBalance: 0, openingDate: '2026-01-01' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 1, accountId: 'a', categoryId: 'cat_rent', date: '2026-10-02', tags: [P('rawtag')] });
    const tx = S().getState().transactions.find(t => t.type === 'expense');
    const root = renderView('edit', 'AddTransactionView', { id: tx.id });
    const input = root.querySelector('#tx-tags-input') || root.querySelector('input[id*="tag"]');
    input.value = 'raw';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 350));
    expect(leaks()).toEqual([]);
  });

  it('imported tags stay verbatim (escaped at render); hostile series ids map to one stable safe id', () => {
    boot();
    const I = global.window.StackdImport;
    expect(I._parseTags('Café|road trip')).toEqual(['café', 'road trip']);
    const NL = String.fromCharCode(10);
    importCsv('Date,Type,Amount,Account,Category,SeriesId,Frequency,Interval,EndDate' + NL
      + ['2026-09-01', 'expense', '5', 'Main', 'Rent', 's1"><x>', 'months', '1', '2026-10-01'].map(csvCell).join(',') + NL
      + ['2026-10-01', 'expense', '5', 'Main', 'Rent', 's1"><x>', 'months', '1', '2026-10-01'].map(csvCell).join(',') + NL);
    const ids = new Set(S().getState().transactions.filter(t => t.recurrence).map(t => t.recurrence.seriesId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(SAFE_ID);
    expect([...ids][0]).toBe(S().fileId('s1"><x>'));
  });

  it('every id that came from a file is safe (accounts, categories, transactions, series, loans)', () => {
    boot();
    seed();
    const NL = String.fromCharCode(10);
    const cfg = JSON.stringify({ type: 'personal', principal: 5000, downPayment: 0, duration: 2, durationUnit: 'years', annualRate: 5, firstPaymentDate: '2026-11-01', amortization: 'french' });
    importCsv('Name,Kind,Config,LinkedSeriesId' + NL + ['Car', 'active', cfg, P('linkid')].map(csvCell).join(',') + NL);
    const st = S().getState();
    expect(st.loans.length).toBeGreaterThan(0);
    const ids = [];
    st.accounts.forEach(a => ids.push(a.id));
    st.categories.forEach(c => ids.push(c.id));
    st.transactions.forEach(t => { ids.push(t.id); if (t.recurrence) ids.push(t.recurrence.seriesId); if (t.transferRef) ids.push(t.transferRef); });
    st.loans.forEach(l => { ids.push(l.id); if (l.linkedSeriesId) ids.push(l.linkedSeriesId); });
    ids.forEach(id => expect(id).toMatch(SAFE_ID));
    VIEWS.forEach(([v, m]) => renderView(v, m));
    expect(leaks()).toEqual([]);
  });
});

describe('Markup safety: validators and ids from a file (1.0.2 BUG-24)', () => {
  beforeEach(() => { recorded = []; restoreSpies = spyHtmlSinks(); });
  afterEach(() => { restoreSpies(); vi.useRealTimers(); document.body.innerHTML = ''; });

  it('validators: I18n.esc, normalizeAccountColor, isSafeIcon, safeId, fileId', () => {
    boot();
    expect(global.window.I18n.esc(null)).toBe('');
    expect(global.window.I18n.esc('&<>"' + "'")).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(S().normalizeAccountColor('#e60023')).toBe('#E60023');
    expect(S().normalizeAccountColor('#FF9500')).toBe('#EA580C');
    expect(S().normalizeAccountColor('#16A34A')).toBeNull();
    expect(S().normalizeAccountColor(P('c'))).toBeNull();
    ['hand-coins', '\u{1F354}', '\u2764\uFE0F'].forEach(v => expect(S().isSafeIcon(v)).toBe(true));
    ['pin"', 'a b', '', 'x'.repeat(41), null].forEach(v => expect(S().isSafeIcon(v)).toBe(false));
    expect(S().safeId('cat_salary')).toBe('cat_salary');
    expect(S().safeId('a"b')).toBeNull();
    expect(S().safeId('')).toBeNull();
    expect(S().fileId('')).toBeNull();
    expect(S().fileId(' cat_salary ')).toBe('cat_salary');
    expect(S().fileId('rent 2026')).toMatch(/^f-[0-9a-f]{16}$/);
    expect(S().fileId('rent 2026')).toBe(S().fileId(' rent 2026'));
    expect(S().fileId('rent 2026')).not.toBe(S().fileId('rent 2027'));
  });

  it('store backstops: ADD_ACCOUNT / ADD_CATEGORY / BATCH_IMPORT_TRANSACTIONS never keep an unsafe id; updates ignore an unsafe colour or icon', () => {
    boot();
    S().dispatch('ADD_ACCOUNT', { id: 'x"y', name: 'A', openingBalance: 0, openingDate: '2026-01-01' });
    S().dispatch('ADD_ACCOUNT', { id: 'keep-1', name: 'B', openingBalance: 0, openingDate: '2026-01-01', color: '#E60023', icon: 'wallet' });
    S().dispatch('ADD_CATEGORY', { id: '<c>', name: 'C', icon: 'pin' });
    let st = S().getState();
    expect(st.accounts.some(a => a.id === 'x"y')).toBe(false);
    expect(st.accounts.some(a => a.id === 'keep-1')).toBe(true);
    expect(st.categories.some(c => c.id === '<c>')).toBe(false);
    S().dispatch('UPDATE_ACCOUNT', { id: 'keep-1', color: 'red', icon: 'x"' });
    S().dispatch('UPDATE_ACCOUNT_COLOR', { id: 'keep-1', color: P('c') });
    const b = S().getState().accounts.find(a => a.id === 'keep-1');
    expect(b.color).toBe('#E60023');
    expect(b.icon).toBe('wallet');
    S().dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: [
      { id: 'x"><img>', type: 'expense', amount: 1, accountId: 'keep-1', categoryId: 'cat_rent', date: '2026-10-01' },
      { id: 'tx-keep', type: 'expense', amount: 2, accountId: 'keep-1', categoryId: 'cat_rent', date: '2026-10-01' }
    ] });
    st = S().getState();
    const txIds = st.transactions.map(t => t.id);
    expect(txIds).toContain('tx-keep');
    txIds.forEach(id => expect(id).toMatch(SAFE_ID));
    // ADD_ACCOUNT / ADD_CATEGORY fall back; UPDATE_CATEGORY ignores an unsafe icon
    S().dispatch('ADD_ACCOUNT', { id: 'keep-2', name: 'D', openingBalance: 0, openingDate: '2026-01-01', color: 'javascript:x', icon: 'a b' });
    const d = S().getState().accounts.find(a => a.id === 'keep-2');
    expect(S().ACCOUNT_COLORS).toContain(d.color);
    expect(d.icon).toBe('wallet');
    S().dispatch('ADD_CATEGORY', { id: 'cat-keep', name: 'E', icon: '<i>' });
    expect(S().getState().categories.find(c => c.id === 'cat-keep').icon).toBe('pin');
    S().dispatch('UPDATE_CATEGORY', { id: 'cat-keep', icon: 'x"y' });
    expect(S().getState().categories.find(c => c.id === 'cat-keep').icon).toBe('pin');
    S().dispatch('UPDATE_CATEGORY', { id: 'cat-keep', icon: 'hand-coins' });
    expect(S().getState().categories.find(c => c.id === 'cat-keep').icon).toBe('hand-coins');
    // a lowercase palette swatch is stored normalized
    S().dispatch('UPDATE_ACCOUNT_COLOR', { id: 'keep-1', color: '#0075eb' });
    expect(S().getState().accounts.find(a => a.id === 'keep-1').color).toBe('#0075EB');
  });

  it('the icon heal is idempotent and saves nothing when nothing is unsafe', () => {
    boot({
      stackd_v1_accounts: JSON.stringify([{ id: 'a1', name: 'Main', color: '#E60023', icon: 'wallet', type: 'Bank', currency: 'EUR', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'a2', name: 'Bad', color: '#E60023', icon: 'x"><b>', type: 'Bank', currency: 'EUR', createdAt: '2026-01-01T00:00:00.000Z' }]),
      stackd_v1_categories: JSON.stringify([{ id: 'c1', name: 'Food', icon: 'hand-coins', isDefault: false, typeHint: 'both' }])
    });
    // the boot already healed a2 and kept the safe icons
    expect(S().getState().accounts.find(a => a.id === 'a2').icon).toBe('wallet');
    expect(S().getState().categories.find(c => c.id === 'c1').icon).toBe('hand-coins');
    const save = vi.spyOn(global.window.StackdDB, 'save');
    expect(S()._healMarkupFields()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    // an unsafe icon written later is healed once, then the heal is a no-op again
    S().state.categories.find(c => c.id === 'c1').icon = 'a b';
    expect(S()._healMarkupFields()).toBe(true);
    expect(save.mock.calls.map(c => c[0])).toEqual(['categories']);
    expect(S()._healMarkupFields()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    save.mockRestore();
  });

  it('restore by id: an unsafe accounts-file id and the same AccountId still meet; no payload id is stored', () => {
    boot();
    const NL = String.fromCharCode(10);
    importCsv('id,name,opening_balance,created_at,currency,type,icon,color,opening_date' + NL
      + ['acc 1', 'Conto', '100', '2026-09-01T00:00:00.000Z', 'EUR', 'Bank', 'landmark', '#0075EB', '2026-09-01'].map(csvCell).join(',') + NL);
    importCsv('Date,Type,Amount,Account,Category,Note,AccountId,Id' + NL
      + ['2026-10-01', 'expense', '5', 'Conto', 'Rent', 'x', 'acc 1', P('txid')].map(csvCell).join(',') + NL);
    const st = S().getState();
    const accs = st.accounts.filter(a => a.name === 'Conto');
    expect(accs).toHaveLength(1);
    const tx = st.transactions.find(t => t.type === 'expense');
    expect(tx.accountId).toBe(accs[0].id);
    expect(accs[0].id).toMatch(SAFE_ID);
    expect(tx.id).toMatch(SAFE_ID);
    renderView('transactions', 'TransactionsView');
    renderView('edit', 'AddTransactionView', { id: tx.id });
    expect(leaks()).toEqual([]);
  });
});
