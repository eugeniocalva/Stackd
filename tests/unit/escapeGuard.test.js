// 1.0.2 (BUG-24) — the sink crawl: no stored or imported text ever becomes markup.
//
// markupSafety.test.js pins the named sinks and the store validators. This
// guard is the sweep that keeps them complete. It seeds a marker into EVERY
// user-controlled field, through every way a value reaches the store:
//   - typed (dispatch): account name/type/colour/icon, category name/icon,
//     notes, tags, loan and extra-cost names, import rules, bank connections,
//     import presets, the History search;
//   - files (StackdImport.importCSV): the accounts, categories, transactions
//     and loans CSVs, including id, AccountId, Id, SeriesId and
//     LinkedSeriesId cells, and a bank statement (file name, descriptions,
//     currency);
//   - a poisoned pre-1.0.2 localStorage booted through Store.init (names,
//     types, tags, notes, series ids and linked ids that 1.0/1.0.1 stored
//     verbatim, plus icons and colours that the boot heals);
//   - route params (deep links with a hostile id).
// Then it renders every view and every sheet, including the 1.0.2 surfaces
// (opening-balance panel, recurring scope sheets, loan-sync sheet, import
// result lines, storage-full and export-failed sheets, Amount received,
// cross-currency captions and widget totals, Category-not-found, the budget
// editor), crawls every tappable element of every view two levels deep, and
// records every string that reaches innerHTML / outerHTML /
// insertAdjacentHTML. A raw '<x-FIELD' anywhere is an unescaped sink: the
// failure names the field, the step and the markup around it. Set
// ESCAPE_GUARD_OUT=<file.json> to dump every hit (and every field reached).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// Breaks out of a double- or single-quoted attribute, then opens an element.
const P = (k) => `${k}"'><x-${k}></x-${k}>`;

let recorded = [];
let step = 'boot';
let restoreSpies = () => {};
const spyHtmlSinks = () => {
  const EP = global.Element.prototype;
  const ih = Object.getOwnPropertyDescriptor(EP, 'innerHTML');
  const oh = Object.getOwnPropertyDescriptor(EP, 'outerHTML');
  const iah = EP.insertAdjacentHTML;
  Object.defineProperty(EP, 'innerHTML', { configurable: true, get() { return ih.get.call(this); }, set(v) { recorded.push({ step, html: String(v) }); ih.set.call(this, v); } });
  Object.defineProperty(EP, 'outerHTML', { configurable: true, get() { return oh.get.call(this); }, set(v) { recorded.push({ step, html: String(v) }); oh.set.call(this, v); } });
  EP.insertAdjacentHTML = function (pos, v) { recorded.push({ step, html: String(v) }); return iah.call(this, pos, v); };
  return () => {
    Object.defineProperty(EP, 'innerHTML', ih);
    Object.defineProperty(EP, 'outerHTML', oh);
    EP.insertAdjacentHTML = iah;
  };
};

// field -> [step :: context]
const scan = () => {
  const hits = {};
  recorded.forEach(r => {
    let idx = r.html.indexOf('<x-');
    while (idx !== -1) {
      const m = /^<x-([a-z0-9]+)/.exec(r.html.slice(idx));
      if (m) {
        const ctx = r.html.slice(Math.max(0, idx - 110), idx + m[0].length + 1).replace(/\s+/g, ' ');
        (hits[m[1]] = hits[m[1]] || new Set()).add(`${r.step} :: ${ctx}`);
      }
      idx = r.html.indexOf('<x-', idx + 1);
    }
  });
  const out = {};
  Object.keys(hits).sort().forEach(k => { out[k] = [...hits[k]]; });
  return out;
};
// Free-text fields the render pass must reach. The others are enumerations
// or ids that the store validates or maps on write (colours, icons, ids,
// currencies, times) or values no screen shows (preset signatures, bank refs).
const REACHED = ['accname', 'acctype', 'ambacc', 'bankaccname', 'bankaccname2', 'bankquery', 'catname', 'csvacc', 'csvcat',
  'csvdesc', 'csvdesc2', 'csvextra', 'csvloan', 'csvrule', 'csvrulecat', 'csvtype', 'extraname', 'filename', 'iban', 'instname',
  'instpick', 'loanname', 'note', 'noticebody', 'noticetitle', 'oldacc', 'oldcat', 'oldextra', 'oldloan', 'oldnote', 'oldrule',
  'oldseries', 'oldtag', 'oldtype', 'pricem', 'pricepm', 'pricey', 'rulematch', 'seriesnote', 'simname', 'stmtccy', 'stmtdate',
  'stmtdate2', 'stmtdesc', 'stmtdesc2', 'stmtfile', 'successacc', 'tag', 'trnote', 'trtag', 'txacc', 'txcat', 'txnote', 'txtag',
  'usdacc', 'waitbank', 'xccynote'];
// Fields that reached markup escaped: proves the crawl rendered them at all.
const seen = () => { const out = new Set(); recorded.forEach(r => { const re = /&lt;x-([a-z0-9]+)&gt;/g; let m; while ((m = re.exec(r.html))) out.add(m[1]); }); return out; };
const count = (hits) => Object.values(hits).reduce((n, a) => n + a.length, 0);
// The assertion shows at most 4 places per field; the count is in the key.
const brief = (hits) => { const o = {}; Object.keys(hits).forEach(k => { o[k + ' (' + hits[k].length + ')'] = hits[k].slice(0, 4); }); return o; };

const S = () => global.window.Store;
const W = () => global.window;

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
const NL = String.fromCharCode(10);
const importCsv = (text) => {
  let out;
  W().StackdImport.importCSV({ text, name: 'f.csv' }, S().getState(), (r) => { out = r; }, (e) => { out = { error: e && e.message }; });
  return out;
};

const MORTGAGE = { type: 'mortgage', principal: 100000, downPayment: 0, duration: 30, durationUnit: 'years',
  annualRate: 4, firstPaymentDate: '2026-07-01', amortization: 'french' };

let ctx = null;
let listenerErrors = 0;

const boot = () => {
  let uid = 0;
  const w = global.window;
  w.crypto.randomUUID = () => 'uuid-' + (++uid);
  w.localStorage.clear();
  // ── a pre-1.0.2 install: free text stored verbatim by 1.0/1.0.1 (escaped at
  // render, never rewritten), plus icons/colours that the boot heals.
  const oldTx = (id, extra) => Object.assign({ id, type: 'expense', amount: 4, accountId: 'olda', categoryId: 'oldc',
    date: '2026-09-02', time: '10:00:00', createdAt: '2026-09-02T10:00:00.000Z' }, extra);
  const seriesRec = { seriesId: P('oldseries'), interval: 1, frequency: 'months', startDate: '2026-08-02', endDate: '2026-12-02' };
  const ls = {
    accounts: [
      { id: 'olda', name: P('oldacc'), type: P('oldtype'), color: P('bootcolor'), icon: P('booticon'), currency: 'EUR', createdAt: '2026-01-01T00:00:00.000Z', openingDate: '2026-01-01' }
    ],
    categories: [
      { id: 'oldc', name: P('oldcat'), icon: P('bootcaticon'), isDefault: false, typeHint: 'both' }
    ],
    transactions: [
      oldTx('oldob', { type: 'opening_balance', amount: 500, categoryId: 'cat_balance', date: '2026-01-01' }),
      oldTx('oldt1', { comment: P('oldnote'), tags: [P('oldtag')], date: '2026-08-02', recurrence: { ...seriesRec } }),
      oldTx('oldt2', { comment: P('oldnote'), tags: [P('oldtag')], date: '2026-09-02', recurrence: { ...seriesRec, nextDate: '2026-10-02' } })
    ],
    loans: [
      { id: 'oldl', name: P('oldloan'), kind: 'active', config: { ...MORTGAGE, additionalExpenses: [{ name: P('oldextra'), amount: 5, frequency: 'monthly' }] },
        linkedSeriesId: P('oldseries'), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
    ],
    importRules: [{ id: 'oldr', match: P('oldrule'), categoryId: 'oldc', createdAt: '2026-01-01T00:00:00.000Z' }],
    importPresets: [{ id: 'oldp', signature: P('oldsig'), mapping: { date: 0, description: 1, amount: 2, debit: -1, credit: -1, bankRef: -1 }, createdAt: '2026-01-01T00:00:00.000Z' }],
    homeWidgets: [],
    currency: 'EUR',
    setup_done: true,
    catDebtSeeded: true
  };
  Object.keys(ls).forEach(k => w.localStorage.setItem('stackd_v1_' + k, JSON.stringify(ls[k])));
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'utils/scroll.js', 'utils/keyboard.js', 'loan-engine.js', 'store.js',
    'components.js', 'widgets.js', 'insights.js', 'views.js', 'export.js', 'import.js', 'bank-connect.js', 'pro.js']) executeFile(f);
  w.StackdExport._download = () => {};
  S().init();
  S().dispatch('SET_PRO', { active: true });

  // ── typed
  S().dispatch('ADD_ACCOUNT', { id: 'acc1', name: P('accname'), type: P('acctype'), color: P('color'), icon: P('accicon'), openingBalance: 1000, openingDate: '2026-01-01' });
  S().dispatch('ADD_ACCOUNT', { id: 'acc2', name: 'Plain', openingBalance: 50, openingDate: '2026-01-01' });
  S().dispatch('ADD_ACCOUNT', { id: 'acc3', name: P('usdacc'), currency: 'USD', openingBalance: 70, openingDate: '2026-01-01' });
  S().dispatch('ADD_CATEGORY', { name: P('catname'), icon: P('caticon'), typeHint: 'both' });
  const cat = S().getState().categories.find(c => c.name === P('catname'));
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12.5, accountId: 'acc1', categoryId: cat.id, date: '2026-10-02', comment: P('note'), tags: [P('tag')] });
  S().dispatch('ADD_TRANSACTION', { type: 'income', amount: 99, accountId: 'acc1', categoryId: cat.id, date: '2026-10-03', comment: 'n', tags: ['ok'] });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 3, accountId: 'acc3', categoryId: cat.id, date: '2026-10-01', comment: P('usdnote') });
  S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 7, accountId: 'acc1', categoryId: cat.id, date: '2026-10-20', comment: P('seriesnote'), isPaid: false,
    recurrence: { frequency: 'months', interval: 1, startDate: '2026-10-20', endDate: '2027-01-20' } });
  S().dispatch('ADD_TRANSFER', { amount: 10, expenseAccountId: 'acc1', incomeAccountId: 'acc2', date: '2026-10-02', note: P('trnote'), tags: [P('trtag')] });
  S().dispatch('ADD_TRANSFER', { amount: 10, receivedAmount: 11.7, expenseAccountId: 'acc1', incomeAccountId: 'acc3', date: '2026-10-02', note: P('xccynote') });
  S().dispatch('SAVE_BUDGET', { categoryId: cat.id, amount: 100, rollover: true });
  S().dispatch('ADD_LOAN', { name: P('loanname'), kind: 'active', config: { ...MORTGAGE, additionalExpenses: [{ name: P('extraname'), amount: 10, frequency: 'monthly' }] } });
  S().dispatch('ADD_LOAN', { name: P('simname'), kind: 'sim', config: { ...MORTGAGE } });
  S().dispatch('ADD_IMPORT_RULE', { match: P('rulematch'), categoryId: cat.id });
  S().dispatch('SAVE_IMPORT_PRESET', { signature: P('presetsig'), mapping: { date: 0, description: 1, amount: 2, debit: -1, credit: -1, bankRef: -1 } });
  S().dispatch('ADD_BANK_CONNECTION', { ref: 'r1', institutionId: P('instid'), institutionName: P('instname'), logo: P('logo'),
    accounts: [{ id: 'b1', name: P('bankaccname'), ibanTail: P('iban'), currency: 'EUR' }, { id: 'b2', name: P('bankaccname2'), currency: 'EUR' }],
    mappings: { b1: 'acc1' }, validUntil: '2027-01-01' });
  S().dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, consentAt: '2026-01-01T00:00:00.000Z', pendingRef: 'r2',
    pendingInstitution: { id: P('pendid'), name: P('pendname'), logo: P('pendlogo') } });
  W().Views._BankShared.resetPicker();
  Object.assign(W().Views._BankShared.picker, { country: 'IT', query: P('bankquery'), selectedId: 'i1',
    institutions: [{ id: 'i1', name: P('instpick'), logo: P('instlogo'), bic: P('bic'), maxHistoryDays: 90 }] });

  // ── files
  importCsv('id,name,opening_balance,created_at,currency,type,icon,color,opening_date' + NL
    + [P('csvaccid'), P('csvacc'), '300', '2026-09-01T00:00:00.000Z', P('csvccy'), P('csvtype'), P('csvicon'), P('csvcolor'), '2026-09-01'].map(csvCell).join(',') + NL);
  importCsv('id,name,icon,typeHint' + NL + [P('csvcatid'), P('csvcat'), P('csvcaticon'), 'expense'].map(csvCell).join(',') + NL);
  importCsv('Date,Time,Type,Amount,Account,Category,Note,Tags,SeriesId,Frequency,Interval,EndDate,AccountId,AccountCurrency,Id' + NL
    + ['2026-10-01', P('txtime'), 'expense', '12.50', P('txacc'), P('txcat'), P('txnote'), P('txtag'), P('txseries'), 'months', '1', '2026-12-01', P('txaccid'), P('txccy'), P('txid')].map(csvCell).join(',') + NL
    + ['2026-11-01', '10:00', 'expense', '12.50', P('txacc'), P('txcat'), P('txnote'), P('txtag'), P('txseries'), 'months', '1', '2026-12-01', P('txaccid'), '', P('txid2')].map(csvCell).join(',') + NL);
  importCsv('Name,Kind,Config,LinkedSeriesId' + NL + [P('csvloan'), 'active', JSON.stringify({ ...MORTGAGE, additionalExpenses: [{ name: P('csvextra'), amount: 3, frequency: 'monthly' }] }), P('txseries')].map(csvCell).join(',') + NL);
  importCsv('Match,Category' + NL + [P('csvrule'), P('csvrulecat')].map(csvCell).join(',') + NL);

  // ── widgets: every type, both sizes, configured onto the seeded data
  const ws = [];
  Object.keys(W().Widgets.registry || {}).forEach((t, i) => ['small', 'large'].forEach(size => ws.push({
    id: 'w' + i + size, type: t, size, config: { accountIds: ['acc1', 'acc3'], categoryIds: [cat.id], loanId: S().getState().loans[0].id },
    createdAt: '2026-01-01T00:00:00.000Z'
  })));
  S().state.homeWidgets = ws;
  S().state.expandedGraphFilters = { interval: 'monthly', accounts: ['acc1', 'acc3'], categories: [cat.id] };
  S().state.historyFilters.accounts = ['acc1'];
  S().state.historyFilters.categories = [cat.id];
  S().state.historyFilters.tags = [P('tag')];
  S().state.analyticsFilters && (S().state.analyticsFilters.accounts = ['acc1', 'acc3']);
  S().state.defaultAccountId = 'acc1';
  S()._openingIdx = null;
  S()._budgetSpendIdx = null;

  const st = S().getState();
  const loan = st.loans.find(l => l.name === P('loanname'));
  const txs = st.transactions;
  return {
    cat,
    loan,
    sim: st.loans.find(l => l.name === P('simname')),
    expense: txs.find(t => t.comment === P('note')),
    series: txs.find(t => t.comment === P('seriesnote')),
    oldSeries: txs.find(t => t.id === 'oldt2'),
    transfer: txs.find(t => t.comment === P('trnote') && t.type === 'expense'),
    xccy: txs.find(t => t.comment === P('xccynote') && t.type === 'expense'),
    imported: txs.find(t => t.comment === P('txnote')),
    opening: txs.find(t => t.type === 'opening_balance' && t.accountId === 'acc1'),
    csvCat: st.categories.find(c => c.name === P('csvcat')),
    csvAcc: st.accounts.find(a => a.name === P('csvacc')),
    csvLoan: st.loans.find(l => l.name === P('csvloan'))
  };
};

const routerView = () => document.getElementById('router-view');
const renderView = (activeView, mod, params) => {
  W().__params = params || {};
  S().state.activeView = activeView;
  const V = W().Views[mod];
  routerView().innerHTML = V.render(S().getState());
  if (V.attachEvents) V.attachEvents(routerView(), S().getState(), true);
};
const flush = async (ms = 700) => { await vi.advanceTimersByTimeAsync(ms); };
const tryStep = async (name, fn) => {
  step = name;
  try { await fn(); } catch (e) { /* a crash is not a sink; the markup recorded so far still counts */ }
  try { await flush(); } catch (e) { /* ditto */ }
};
const clearSheets = () => {
  Array.from(document.body.children).forEach(el => { if (el.id !== 'app' && el.id !== 'modal-container') el.remove(); });
  const mc = document.getElementById('modal-container');
  if (mc) mc.innerHTML = '';
  document.body.className = '';
  document.body.style.overflow = '';
};

const VIEWS = (c) => [
  ['dashboard', 'DashboardView'], ['transactions', 'TransactionsView'], ['add', 'AddTransactionView'],
  ['categories', 'CategoriesView'], ['budget', 'BudgetView'], ['analytics', 'AnalyticsView'],
  ['settings', 'OthersView'], ['tags', 'TagsView'], ['debt', 'DebtHubView'], ['purchases', 'PurchasesView'],
  ['bank-connect', 'BankConnectHubView'], ['bank-connect-add', 'BankPickerView'],
  ['bank-connect-map', 'BankMapView', { ref: 'r1' }],
  ['edit', 'AddTransactionView', { id: c.expense.id }],
  ['edit', 'AddTransactionView', { id: c.series.id }],
  ['edit', 'AddTransactionView', { id: c.oldSeries.id }],
  ['edit', 'AddTransactionView', { id: c.transfer.id }],
  ['edit', 'AddTransactionView', { id: c.xccy.id }],
  ['edit', 'AddTransactionView', { id: c.imported.id }],
  ['edit', 'AddTransactionView', { id: c.opening.id }],
  ['edit', 'AddTransactionView', { id: 'oldob' }],
  ['category-detail', 'CategoryDetailView', { id: c.cat.id }],
  ['category-detail', 'CategoryDetailView', { id: 'oldc' }],
  ['edit-category', 'EditCategoryView', { id: c.cat.id }],
  ['edit-category', 'EditCategoryView', { id: c.csvCat.id }],
  ['edit-category', 'EditCategoryView', {}],
  ['edit-account', 'EditAccountView', { id: 'acc1' }],
  ['edit-account', 'EditAccountView', { id: 'olda' }],
  ['edit-account', 'EditAccountView', { id: c.csvAcc.id }],
  ['edit-account', 'EditAccountView', {}],
  ['debt-results', 'DebtResultsView', { id: c.loan.id }],
  ['debt-results', 'DebtResultsView', { id: 'oldl' }],
  ['debt-results', 'DebtResultsView', { id: c.sim.id }],
  ['debt-sim', 'DebtSimView', { id: c.loan.id }],
  ['debt-sim', 'DebtSimView', { id: 'oldl' }],
  ['debt-sim', 'DebtSimView', { id: c.csvLoan.id }],
  ['debt-sim', 'DebtSimView', {}],
  // deep links with a hostile id (Category-not-found, not-found pages)
  ['edit', 'AddTransactionView', { id: P('hashid') }],
  ['category-detail', 'CategoryDetailView', { id: P('hashid') }],
  ['edit-category', 'EditCategoryView', { id: P('hashid') }],
  ['edit-account', 'EditAccountView', { id: P('hashid') }],
  ['debt-results', 'DebtResultsView', { id: P('hashid') }],
  ['debt-sim', 'DebtSimView', { id: P('hashid') }],
  ['bank-connect-map', 'BankMapView', { ref: P('hashid') }],
  ['transactions', 'TransactionsView', { account: P('hashid') }]
];

const startCsvImport = () => {
  W().Views._ImportShared.start('Date,Description,Amount' + NL + '2026-10-01,' + csvCell(P('csvdesc') + ' rulematch') + ',-3.50' + NL
    + '2026-10-02,' + csvCell(P('csvdesc2')) + ',-4.00' + NL, P('filename') + '.csv', S().getState());
};
const startStatement = () => {
  W().Views._ImportShared.startStatement({ format: 'camt', currency: P('stmtccy'),
    entries: [{ date: '2026-10-01', description: P('stmtdesc'), amount: -3.5, bankRef: P('stmtref') }, { date: '2026-10-02', description: P('stmtdesc2'), amount: 12 }, { date: P('stmtedate'), description: 'x', amount: 1 }],
    openingBalance: { amount: 10, date: P('stmtdate') }, closingBalance: { amount: 18.5, date: P('stmtdate2') } }, P('stmtfile') + '.xml', S().getState());
};

describe('Escape guard: the sink crawl (1.0.2 BUG-24)', () => {
  let snapshot;
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
    const w = global.window;
    document.body.innerHTML = '<div id="app"><div id="router-view"></div><nav id="bottom-nav"></nav><div id="modal-container"></div></div>';
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    global.Element.prototype.scrollTo = function () {};
    global.Element.prototype.scrollBy = function () {};
    global.Element.prototype.scrollIntoView = function () {};
    w.scrollTo = () => {};
    w.HTMLCanvasElement.prototype.getContext = function () { return null; };
    w.Chart = function () { this.destroy = () => {}; this.update = () => {}; this.data = { datasets: [] }; this.options = {}; };
    w.Chart.getChart = () => null;
    w.Chart.register = () => {};
    w.lucide = { createIcons() {} };
    w.StackdHydrateIcons = () => {};
    w.Router = { navigate() {}, replace() {}, leave() {}, getParams() { return w.__params || {}; }, handleRouteChange() {}, handleBack() {}, _confirmDiscard() {} };
    w.alert = () => {};
    w.confirm = () => true;
    w.open = () => null;
    w.fetch = () => Promise.reject(new Error('offline'));
    global.fetch = w.fetch;
    w.__STACKD_BANK_CONNECT__ = true;
    // broker text is user-visible too (bank and account names, logos, prices)
    w.__STACKD_BROKER_STUB__ = {
      prices: { monthly: { price: P('pricem') }, yearly: { price: P('pricey'), perMonth: P('pricepm') } },
      async request(path) {
        if (path.startsWith('/v1/institutions')) {
          return [{ id: P('brokerid'), name: P('brokername'), logo: P('brokerlogo'), transaction_total_days: 90, max_access_valid_for_days: 90 }];
        }
        const e = new Error('offline'); e.code = 'offline'; throw e;
      }
    };
    global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
    // A handler that throws on a half-torn-down sheet is not a sink: count it, do not fail on it.
    w.addEventListener('error', (e) => { listenerErrors++; e.preventDefault(); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    restoreSpies = spyHtmlSinks();
    step = 'seed';
    ctx = boot();
    snapshot = JSON.stringify(S().state);
  });
  afterAll(() => {
    restoreSpies();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  const restore = () => {
    const o = JSON.parse(snapshot);
    Object.keys(S().state).forEach(k => { if (!(k in o)) delete S().state[k]; });
    Object.assign(S().state, o);
    S()._openingIdx = null;
    S()._budgetSpendIdx = null;
    W().Views.BudgetView.editCategoryId = null;
  };

  const report = (label, hits) => {
    if (process.env.ESCAPE_GUARD_OUT) {
      let prev = {};
      try { prev = JSON.parse(readFileSync(process.env.ESCAPE_GUARD_OUT, 'utf8')); } catch (e) { /* first write */ }
      const places = new Set();
      Object.keys(hits).forEach(k => hits[k].forEach(h => places.add(k + ' :: ' + h.split(' :: ').slice(1).join(' :: '))));
      prev[label] = { seen: [...seen()].sort(), fields: Object.keys(hits).length, hits: count(hits), places: places.size, listenerErrors, detail: hits };
      writeFileSync(process.env.ESCAPE_GUARD_OUT, JSON.stringify(prev, null, 1));
    }
  };

  it('every view, every sheet and the 1.0.2 surfaces render seeded text as text', async () => {
    recorded = [];
    const c = ctx;
    const C = W().Components;
    for (const [av, mod, params] of VIEWS(c)) {
      clearSheets(); restore();
      await tryStep(`view:${mod}${params ? JSON.stringify(params).slice(0, 40) : ''}`, () => renderView(av, mod, params));
    }
    clearSheets(); restore();
    await tryStep('view:Budget editor', () => { W().Views.BudgetView.editCategoryId = c.cat.id; renderView('budget', 'BudgetView'); });
    restore();
    await tryStep('view:Budget editor (csv category)', () => { W().Views.BudgetView.editCategoryId = c.csvCat.id; renderView('budget', 'BudgetView'); });
    restore();
    await tryStep('view:History search', () => { S().state.historyFilters.search = P('search'); renderView('transactions', 'TransactionsView'); });
    restore();
    await tryStep('view:History selection', () => { S().state.selectionMode = true; renderView('transactions', 'TransactionsView'); });
    restore();
    await tryStep('view:Analytics', () => { S().state.analyticsFilters.accounts = []; renderView('analytics', 'AnalyticsView'); });
    restore();
    await tryStep('view:Widget edit mode', () => { S().state.widgetEditMode = true; renderView('dashboard', 'DashboardView'); });
    restore();
    await tryStep('import:csv', () => { startCsvImport(); renderView('import-map', 'ImportMapView'); });
    await tryStep('import:csv preview', () => renderView('import-preview', 'ImportPreviewView'));
    await tryStep('import:statement', () => { startStatement(); renderView('import-map', 'ImportMapView'); });
    await tryStep('import:statement preview', () => renderView('import-preview', 'ImportPreviewView'));
    restore();

    const sheets = {
      TransactionItem: () => document.body.insertAdjacentHTML('beforeend', C.TransactionItem.render(c.imported,
        S().getState().categories.find(x => x.id === c.imported.categoryId), S().getState().accounts.find(a => a.id === c.imported.accountId), {})),
      AccountCard: () => document.body.insertAdjacentHTML('beforeend', C.AccountCard.render(S().getState().accounts[0], 10)),
      AdvancedFilterBar: () => document.body.insertAdjacentHTML('beforeend', C.AdvancedFilterBar.render('transactions', S().getState().historyFilters)),
      'FilterModal:history': () => C.FilterModal.show('history'),
      'FilterModal:analytics': () => C.FilterModal.show('analytics'),
      CustomRangeModal: () => C.CustomRangeModal.show('transactions'),
      CategorySelectionModal: () => C.CategorySelectionModal.show({ type: 'expense', selectedId: c.cat.id, onSelect() {} }),
      ExpandedGraphModal: () => { C.ExpandedGraphModal.show(S().getState()); const b = document.getElementById('egm-filter'); if (b) b.click(); },
      TagsModal: () => C.TagsModal.show({ selectedTags: [P('tag')], onSave() {} }),
      ImportRulesModal: () => C.ImportRulesModal.show(),
      ListPicker: () => C.ListPicker.show({ title: 't', items: S().getState().accounts.map(a => ({ id: a.id, name: a.name })), selectedId: 'acc1', onSelect() {} }),
      AddWidgetModal: () => C.AddWidgetModal.show({}),
      IconPicker: () => C.IconPicker.show({ selected: P('pickicon'), onSelect() {} }),
      RecurringCreationModal: () => C.RecurringCreationModal.show({ initialRecurrence: c.series.recurrence, onSave() {} }),
      RecurringSettingsModal: () => C.RecurringSettingsModal.show({ onlyThis() {}, allTransactions() {} }),
      RecurringDeleteModal: () => C.RecurringDeleteModal.show({ transaction: c.series, onlyThis() {}, thisAndFuture() {}, allTransactions() {} }),
      'RecurringUpdateModal:schedule': () => C.RecurringUpdateModal.show({ transaction: c.series, scheduleChanged: true, paidNote: 'rebuild', onSelection() {} }),
      'RecurringUpdateModal:date': () => C.RecurringUpdateModal.show({ transaction: c.oldSeries, dateChanged: true, paidNote: 'paid', onSelection() {} }),
      FrequencyPicker: () => C.FrequencyPicker.show({ onSelect() {} }),
      PeriodPicker: () => C.PeriodPicker.show({ type: 'month', initialValue: '2026-10', onSelect() {} }),
      MonthPicker: () => C.MonthPicker.show({ initialValue: '2026-10', onSelect() {} }),
      BankSettingsModal: () => C.BankSettingsModal.show(),
      BankManageModal: () => { C.BankManageModal.show({ ref: 'r1' }); document.querySelectorAll('#modal-container button').forEach(b => b.click()); },
      BankDisclosureModal: () => C.BankDisclosureModal.show({ onAccept() {}, onDecline() {} }),
      BankWaitingModal: () => C.BankWaitingModal.show({ bankName: P('waitbank'), ref: 'r2' }),
      BankConnectErrorModal: () => C.BankConnectErrorModal.show({ code: 'X', message: 'm' }),
      BankPairCodeModal: () => C.BankPairCodeModal.show({}),
      PaywallModal: () => C.PaywallModal.show({}),
      'ProLockModal:accounts': () => C.ProLockModal.show({ feature: 'accounts' }),
      'ProLockModal:categories': () => C.ProLockModal.show({ feature: 'categories' }),
      CurrencySwitchConfirm: () => C.CurrencySwitchConfirm.show({ prev: 'EUR', next: 'USD', onConfirm() {}, onCancel() {} }),
      ImportSuccessModal: () => C.ImportSuccessModal.show({ imported: 2, accountName: P('successacc'), linked: 1, paired: 1, verdict: { ok: false, bank: '1', app: '2', date: '2026-10-01' } }),
      NoticeSheet: () => C.NoticeSheet.show({ title: P('noticetitle'), body: P('noticebody') }),
      FaqModal: () => C.FaqModal.show(),
      ManualModal: () => C.ManualModal.show(),
      TermsModal: () => C.TermsModal.show({}),
      'DebtShared.offerRecurringExpense': () => W().Views._DebtShared.offerRecurringExpense(ctx.loan),
      'DebtResults.offerSeriesSync': () => W().Views.DebtResultsView._offerSeriesSync(ctx.loan.id, { ...MORTGAGE, annualRate: 9 }),
      'DebtResults.offerAfterPromote': () => W().Views.DebtResultsView._offerAfterPromote(ctx.sim.id),
      'storage-full sheet': () => S()._announceSaveFailure({ quota: true }),
      'storage-failed sheet': () => S()._announceSaveFailure({ quota: false }),
      'export-failed sheet': () => W().StackdExport._shareNative && W().StackdExport._shareNative('x.csv', 'a', 'text/csv')
    };
    for (const [k, fn] of Object.entries(sheets)) {
      clearSheets(); restore();
      await tryStep('sheet:' + k, fn);
    }
    // config panels of every widget type
    clearSheets(); restore();
    await tryStep('widgets:config', () => S().state.homeWidgets.forEach(inst => {
      const def = W().Widgets.registry[inst.type];
      if (def && def.renderConfig) document.body.insertAdjacentHTML('beforeend', def.renderConfig(inst, S().getState()));
      C.AddWidgetModal.show({ editId: inst.id });
    }));
    // the import flow's result lines (duplicates, ambiguous same-named accounts)
    clearSheets(); restore();
    await tryStep('settings:import result', async () => {
      renderView('settings', 'OthersView');
      const input = document.getElementById('import-csv-file');
      const amb = 'Date,Type,Amount,Account,Category,Note' + NL + ['2026-10-01', 'expense', '1', P('ambacc'), 'Rent', 'x'].map(csvCell).join(',') + NL;
      S().dispatch('ADD_ACCOUNT', { name: P('ambacc'), openingBalance: 0, openingDate: '2026-01-01' });
      S().dispatch('ADD_ACCOUNT', { name: P('ambacc'), openingBalance: 0, openingDate: '2026-01-01' });
      for (const text of [amb, amb]) {
        Object.defineProperty(input, 'files', { configurable: true, value: [{ name: P('upload') + '.csv', text, size: text.length }] });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await flush();
      }
    });

    const hits = scan();
    report('render', hits);
    expect(brief(hits)).toEqual({});
    // The guard is only as good as its reach: every free-text field must have
    // reached markup (escaped) at least once. A field missing here means a
    // seed or a step stopped rendering, not that the app got safer.
    const reached = seen();
    expect(REACHED.filter(f => !reached.has(f))).toEqual([]);
  }, 120000);

  it('every tappable element of every view, two levels deep, keeps seeded text as text', async () => {
    recorded = [];
    const c = ctx;
    const clickables = (root) => Array.from(root.querySelectorAll('button, [role="button"], .touch-target, a[href], [data-id], .list-item, .tag-chip, .multi-select-chip, label, select, input[type="checkbox"], summary'));
    const fire = (el) => {
      try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) { /* ignore */ }
      if (el.tagName === 'SELECT' || el.tagName === 'INPUT') { try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { /* ignore */ } }
    };
    const targets = VIEWS(c).filter(([, , p]) => !p || !String(p.id || p.ref || p.account || '').includes('<x-'));
    targets.push(['budget-editor', 'BudgetView', {}, () => { W().Views.BudgetView.editCategoryId = c.cat.id; }]);
    for (const [av, mod, params, pre] of targets) {
      const label = `${mod}${params && Object.keys(params).length ? JSON.stringify(params).slice(0, 30) : ''}`;
      clearSheets(); restore();
      let n = 0;
      try { if (pre) pre(); renderView(av === 'budget-editor' ? 'budget' : av, mod, params); n = clickables(routerView()).length; } catch (e) { continue; }
      for (let i = 0; i < Math.min(n, 90); i++) {
        clearSheets(); restore();
        step = `click:${label}#${i}`;
        try { if (pre) pre(); renderView(av === 'budget-editor' ? 'budget' : av, mod, params); } catch (e) { break; }
        const el = clickables(routerView())[i];
        if (!el) continue;
        step = `click:${label}#${i}:${String(el.id || el.className || el.tagName).slice(0, 30)}`;
        fire(el);
        try { await flush(); } catch (e) { /* ignore */ }
        const sheetRoots = Array.from(document.body.children).filter(x => x.id !== 'app' && x.id !== 'modal-container')
          .concat(Array.from((document.getElementById('modal-container') || { children: [] }).children));
        const outer = step;
        for (const sr of sheetRoots) {
          const sub = clickables(sr).slice(0, 30);
          for (let j = 0; j < sub.length; j++) {
            if (!sub[j].isConnected) continue;
            step = `${outer}>${j}:${String(sub[j].id || sub[j].className || sub[j].tagName).slice(0, 24)}`;
            fire(sub[j]);
            try { await flush(400); } catch (e) { /* ignore */ }
          }
        }
        step = outer;
      }
    }
    const hits = scan();
    report('crawl', hits);
    expect(brief(hits)).toEqual({});
  }, 600000);

  // U1 review (sinks-U1-SINK-1): a statement's opening-balance date is file
  // text. Confirmed with "set opening balance", it used to become the
  // account's opening row date verbatim and reach the Edit account date
  // input raw. The crawl above never confirms an import, so this walks it.
  it('a statement opening-balance date never reaches the opening row or the Edit account form as markup', async () => {
    recorded = [];
    clearSheets(); restore();
    const xmlEsc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
    const camt = (obDate) => '<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>'
      + '<Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">10.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>' + xmlEsc(obDate) + '</Dt></Dt></Bal>'
      + '<Ntry><Amt Ccy="EUR">3.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-01</Dt></BookgDt><AddtlNtryInf>x</AddtlNtryInf></Ntry>'
      + '</Stmt></BkToCstmrStmt></Document>';
    // 1. the parser keeps only a real YMD
    const I = W().StackdImport;
    expect(I.parseCamt(camt('"><s>x</s>')).openingBalance.date).toBe('');
    expect(I.parseCamt(camt(P('obdate'))).openingBalance.date).toBe('');
    expect(I.parseCamt(camt('2026-09-30')).openingBalance.date).toBe('2026-09-30');

    // 2. a statement whose date slipped past the parser (any other producer):
    // the confirm step and UPDATE_ACCOUNT both drop it.
    step = 'ob:confirm';
    S().dispatch('ADD_ACCOUNT', { name: 'Fresh', openingBalance: 0, openingDate: '2026-01-01', currency: 'EUR' });
    const fresh = S().getState().accounts.find(a => a.name === 'Fresh');
    S().state.defaultAccountId = fresh.id;
    const Sh = W().Views._ImportShared;
    Sh.startStatement({ format: 'camt', currency: 'EUR',
      entries: [{ date: '2026-10-01', type: 'expense', description: 'x', amount: 3.5, bankRef: 'ob-ref-1' }],
      openingBalance: { amount: 10, date: P('obdate') }, closingBalance: null }, 'ob.xml', S().getState());
    expect(Sh.draft.accountId).toBe(fresh.id);
    expect(Sh.draft.setOpening).toBe(true);
    Sh.rebuildItems(Sh.draft);
    renderView('import-preview', 'ImportPreviewView');
    document.getElementById('btn-iprev-confirm').click();
    await flush();
    const ob = S().getState().transactions.find(t => t.accountId === fresh.id && t.type === 'opening_balance');
    expect(ob.amount).toBe(10);
    expect(ob.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(S().getState().transactions.some(t => t.accountId === fresh.id && t.type === 'expense')).toBe(true);
    // the store backstop on its own
    S().dispatch('UPDATE_ACCOUNT', { id: fresh.id, openingDate: P('obdate') });
    expect(S().getState().transactions.find(t => t.id === ob.id).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    clearSheets();

    // 3. a row poisoned before 1.0.2 still renders as text in the date input
    step = 'ob:edit-account';
    S().state.transactions.find(t => t.id === ob.id).date = P('obdate');
    S()._openingIdx = null;
    renderView('edit-account', 'EditAccountView', { id: fresh.id });
    expect(routerView().querySelector('x-obdate')).toBeNull();
    expect(document.getElementById('edit-acc-date')).not.toBeNull();
    await flush();

    const hits = scan();
    report('opening date', hits);
    expect(brief(hits)).toEqual({});
    expect(seen().has('obdate')).toBe(true);
    restore();
  }, 60000);
});
