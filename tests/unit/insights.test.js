// Smart Insights — v0.84 rules; 1.2.2 (HG-7): the Insights page.
// docs/smart-insights-plan.md. Data tiers from counted rows, the ranking
// (attention first, then score + a daily offset), the six kept rules in
// whole-sentence copy, the page markup (headings, lists, real links, the
// starter card, Unlocks with more data) and the deep links.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const makeLocalStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear()
  };
};

const pad = (n) => String(n).padStart(2, '0');
// The clock is pinned to 15 June 2026.
const june = (day) => `2026-06-${pad(day)}`;

let uuid = 0;

const boot = (lang) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));

  uuid = 0;
  document.body.innerHTML = '<div id="router-view"></div>';
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    Router: { navigate: vi.fn(), getParams: () => ({}) }
  };
  global.localStorage = global.window.localStorage;
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');

  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  if (lang) executeFile(`i18n/${lang}.js`);
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  executeFile('insights.js');
  global.window.Store.init();
  if (lang) global.window.Store.dispatch('SET_LANGUAGE', lang);
};

afterEach(() => { vi.useRealTimers(); });

const Store = () => global.window.Store;
const Insights = () => global.window.Insights;
const state = () => Store().getState();

const addAccount = (name, openingBalance, extra) => {
  Store().dispatch('ADD_ACCOUNT', { name, openingBalance, openingDate: '2020-01-01', ...extra });
  // accounts are kept sorted by name: find the new one by its name
  return Store().getState().accounts.find(a => a.name === name).id;
};

const addTx = (over) => {
  Store().dispatch('ADD_TRANSACTION', {
    type: 'expense', categoryId: 'cat_groceries', amount: 10,
    accountId: Store().getState().accounts[0].id, date: june(2), ...over
  });
};

const byId = () => {
  const map = {};
  Insights().compute(state()).forEach(c => { map[c.id] = c; });
  return map;
};

const mountPage = () => {
  const root = document.getElementById('router-view');
  root.innerHTML = Insights().renderPage(state());
  Insights().attachPage(root);
  return root;
};

// Five counted rows in a month (the tier threshold).
const fillMonth = (ym) => {
  for (let i = 1; i <= 5; i++) addTx({ date: `${ym}-${pad(i + 2)}`, amount: 5 });
};

describe('data tiers', () => {
  beforeEach(() => boot());

  it('an empty install is tier 0', () => {
    expect(Insights().analyze(state()).tier).toBe(0);
  });

  it('5 counted rows reach tier 1; whole earlier months raise it to 2, 3 and 4', () => {
    addAccount('Main', 100);
    for (let i = 0; i < 4; i++) addTx({ date: june(1 + i) });
    expect(Insights().analyze(state()).tier).toBe(0); // the opening balance is not an entry
    addTx({ date: june(6) });
    expect(Insights().analyze(state()).tier).toBe(1);
    fillMonth('2026-05');
    expect(Insights().analyze(state()).tier).toBe(2);
    fillMonth('2026-04');
    fillMonth('2026-03');
    expect(Insights().analyze(state()).tier).toBe(3);
    ['2026-02', '2026-01', '2025-12', '2025-11', '2025-10', '2025-09', '2025-08', '2025-07', '2025-06'].forEach(fillMonth);
    expect(Insights().analyze(state()).tier).toBe(4);
  });

  it('a month with fewer than 5 rows does not count as a whole month', () => {
    addAccount('Main', 100);
    for (let i = 0; i < 5; i++) addTx({ date: june(1 + i) });
    for (let i = 0; i < 4; i++) addTx({ date: `2026-05-0${i + 1}` });
    expect(Insights().analyze(state()).facts.completeMonths).toBe(0);
  });

  it('counts only what the aggregates count: no unpaid, future, transfer, pre-opening or foreign-currency rows', () => {
    const main = addAccount('Main', 100);
    const savings = addAccount('Savings', 100);
    const late = addAccount('Late', 100, { openingDate: '2026-06-10' });
    const eur = addAccount('Euro', 100, { currency: 'EUR' });
    addTx({ isPaid: false, accountId: main });
    addTx({ date: june(20), accountId: main });      // future-dated
    addTx({ accountId: late, date: june(5) });       // before its account opened
    addTx({ accountId: eur });                       // another currency
    Store().dispatch('ADD_TRANSFER', { amount: 5, expenseAccountId: main, incomeAccountId: savings, date: june(3), tags: [] });
    addTx({ accountId: main });                      // the one counted row
    expect(Insights().analyze(state()).facts.rows).toBe(1);
  });
});

describe('the six kept rules (whole sentences, formatters, deep links)', () => {
  beforeEach(() => boot());

  it('month outlook: a positive EOM projection, in whole units, scheduled rows included', () => {
    const id = addAccount('Main', 1000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 1500.4, accountId: id, date: june(1) });
    for (let i = 0; i < 4; i++) addTx({ amount: 150, accountId: id, date: june(2 + i) });
    const c = byId().monthOutlook;
    expect(c).toMatchObject({ figure: '+$900', tone: 'good', dir: 'up', href: '#analytics' });
    expect(c.head).toBe('Set to put aside by the end of June');
    expect(c.body).toBe('Scheduled payments included.');
    expect(c.filters).toEqual({ page: 'analytics', filters: {}, replace: true });
  });

  it('month outlook: a shortfall says so in words, not only in red', () => {
    const id = addAccount('Main', 1000);
    for (let i = 1; i <= 5; i++) addTx({ amount: 100, accountId: id, date: june(i) });
    addTx({ amount: 300, accountId: id, date: june(25) }); // scheduled
    const c = byId().monthOutlook;
    expect(c).toMatchObject({ figure: '-$800', tone: 'bad', dir: 'down' });
    expect(c.head).toBe('Set to finish June below where it started');
  });

  it('month outlook: an exact break-even is no signal', () => {
    const id = addAccount('Main', 1000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 100, accountId: id });
    for (let i = 0; i < 4; i++) addTx({ amount: 25, accountId: id, date: june(3 + i) });
    expect(byId().monthOutlook).toBeUndefined();
  });

  it('top spending: month-to-date only, names the next two, links to History filtered', () => {
    const id = addAccount('Main', 5000);
    addTx({ amount: 500, categoryId: 'cat_groceries', accountId: id });
    addTx({ amount: 300, categoryId: 'cat_dining', accountId: id });
    addTx({ amount: 200, categoryId: 'cat_transport', accountId: id });
    addTx({ amount: 9000, categoryId: 'cat_rent', accountId: id, date: june(28) }); // future: not spent yet
    addTx({ amount: 0.01, categoryId: 'cat_health', accountId: id, date: june(4) });
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 10, accountId: id, date: june(5) }); // 5th entry: tier 1
    const c = byId().topSpending;
    expect(c.figure).toBe('50%');
    expect(c.head).toBe('Groceries is your biggest expense this month');
    expect(c.body).toBe('Then Dining Out (30%) and Transport (20%).');
    expect(c.href).toBe('#transactions');
    expect(c.filters).toEqual({ page: 'history', filters: { categories: ['cat_groceries'] }, replace: true });
    expect(c.viz.type).toBe('split');
  });

  it('income source fires only when one source brings in at least half', () => {
    const id = addAccount('Main', 100);
    for (let i = 0; i < 4; i++) addTx({ accountId: id, date: june(2 + i) });
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 400, accountId: id });
    addTx({ type: 'income', categoryId: 'cat_freelance', amount: 600, accountId: id });
    expect(byId().incomeSource).toMatchObject({ figure: '60%' });
    expect(byId().incomeSource.head).toContain('brings in most of this month');
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 700, accountId: id });
    addTx({ type: 'income', categoryId: 'cat_other', amount: 900, accountId: id });
    expect(byId().incomeSource).toBeUndefined(); // 900 / 2600 = 35 %
  });

  it('account mix: skipped with one account; "most" from half, "largest share" below', () => {
    addAccount('A', 9000);
    for (let i = 0; i < 5; i++) addTx({ date: june(1 + i), amount: 1 });
    expect(byId().accountMix).toBeUndefined();
    addAccount('B', 1000);
    let c = byId().accountMix;
    expect(c.head).toBe('A holds most of your money');
    expect(c.figure).toBe('90%');
    expect(c.href).toBe('#dashboard');
    addAccount('C', 8500);
    c = byId().accountMix;
    expect(c.head).toBe('A holds the largest share of your money'); // 8995 / 18495 = 49 %
    expect(c.body).toBe('Then C (46%) and B (5%).');
  });

  it('account mix: a drained or negative account is not part of the split', () => {
    addAccount('Main', 1000);
    addAccount('Card', -400);
    for (let i = 0; i < 5; i++) addTx({ date: june(1 + i), amount: 1 });
    expect(byId().accountMix).toBeUndefined();
  });
});

describe('ranking', () => {
  beforeEach(() => boot());

  it('the daily offset is stable within a day, bounded, and changes across days', () => {
    const I = Insights();
    expect(I._rotation('topSpending', '2026-06-15')).toBe(I._rotation('topSpending', '2026-06-15'));
    const seen = new Set();
    for (let d = 1; d <= 28; d++) {
      const r = I._rotation('topSpending', `2026-06-${pad(d)}`);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(8);
      seen.add(r);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('attention items always rank first', () => {
    const I = Insights();
    I.rules.unshift({ id: 'fakeAlert', family: 'attention', minTier: 0, nameKey: 'insight.name.bank',
      compute: () => ({ score: 1, figure: '1', tone: '', head: 'h', body: 'b', href: '#bank-connect' }) });
    const id = addAccount('Main', 1000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 1500, accountId: id });
    for (let i = 0; i < 4; i++) addTx({ amount: 50, accountId: id, date: june(2 + i) });
    const items = I.compute(state());
    expect(items[0].id).toBe('fakeAlert');
    expect(items[0].kind).toBe('attention');
    expect(items.slice(1).every(i => i.kind === 'insight')).toBe(true);
  });

  it('a throwing rule is contained and the others still rank', () => {
    const I = Insights();
    I.rules.push({ id: 'boom', family: 'month', minTier: 0, nameKey: 'x', compute: () => { throw new Error('boom'); } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = addAccount('Main', 1000);
    for (let i = 0; i < 5; i++) addTx({ amount: 50, accountId: id, date: june(1 + i) });
    expect(I.compute(state()).map(i => i.id)).toContain('topSpending');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('the Insights page', () => {
  beforeEach(() => boot());

  it('tier 0: the starter card, and the locked types described (no repeated bars)', () => {
    addAccount('Main', 100);
    addTx({});
    addTx({ date: june(3) });
    const root = mountPage();
    expect(root.querySelector('h1').textContent).toBe('Smart Insights');
    const starter = root.querySelector('#insights-starter');
    expect(starter.textContent).toContain('Log a few days of spending to unlock insights');
    expect(starter.textContent).toContain('2 of 5 entries so far.');
    expect(starter.querySelector('a.insight-starter-btn').getAttribute('href')).toBe('#add');
    const locked = [...root.querySelectorAll('[data-locked]')];
    expect(locked.map(l => l.dataset.locked)).toEqual(['monthOutlook', 'topSpending', 'incomeSource', 'accountMix']);
    expect(locked[0].textContent).toContain("What you're set to put aside by the end of the month.");
    expect(root.querySelectorAll('[data-locked] .insight-progress')).toHaveLength(0);
    expect(root.querySelector('a[data-insight]')).toBeNull();
  });

  it('structure: one h1, h2 per section labelling its list, every insight a real link', () => {
    const id = addAccount('BPI', 9000);
    addAccount('TR', 3000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 1500, accountId: id });
    addTx({ amount: 300, categoryId: 'cat_groceries', accountId: id });
    addTx({ amount: 100, categoryId: 'cat_dining', accountId: id });
    addTx({ amount: 50, categoryId: 'cat_transport', accountId: id, date: june(4) });
    addTx({ amount: 50, categoryId: 'cat_transport', accountId: id, date: june(5) });
    const root = mountPage();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    const sections = [...root.querySelectorAll('section.insights-sec')];
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach(sec => {
      const h2 = sec.querySelector('h2');
      expect(sec.getAttribute('aria-labelledby')).toBe(h2.id);
      expect(sec.querySelector('ul.insights-group').getAttribute('role')).toBe('list');
    });
    const links = [...root.querySelectorAll('a[data-insight]')];
    expect(links.length).toBe(Insights().compute(state()).length);
    links.forEach(a => {
      expect(a.getAttribute('href')).toMatch(/^#/);
      expect(a.hasAttribute('aria-label')).toBe(false); // the visible text is the name
      expect(a.hasAttribute('role')).toBe(false);
    });
    // the highlight is the top insight and is not listed again
    const top = Insights().compute(state()).find(i => i.kind === 'insight');
    expect(root.querySelector('.insight-highlight').dataset.insight).toBe(top.id);
    expect(root.querySelectorAll(`[data-insight="${top.id}"]`)).toHaveLength(1);
    expect(root.querySelector('.insights-note').textContent).toContain('Nothing leaves the device.');
  });

  it('the highlight carries the eyebrow, the arrow for a direction, and an aria-hidden chart', () => {
    const id = addAccount('BPI', 9000);
    addAccount('TR', 3000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 5000, accountId: id });
    for (let i = 0; i < 4; i++) addTx({ amount: 10, accountId: id, date: june(2 + i) });
    const root = mountPage();
    const h = root.querySelector('.insight-highlight');
    expect(h.dataset.insight).toBe('monthOutlook'); // 50 + offset beats the rest
    expect(h.querySelector('.insight-eyebrow').textContent).toContain('Month-end outlook');
    expect(h.querySelector('.insight-figure--good [data-lucide="arrow-up-right"]')).not.toBeNull();
    const row = root.querySelector('a.insight-row[data-insight="accountMix"]');
    expect(row).not.toBeNull();
    expect(root.querySelector('.insight-viz')).toBeNull(); // only the highlight draws a chart
  });

  it('nothing to say this month: a quiet card instead of an empty page', () => {
    const id = addAccount('Main', 100);
    for (let i = 0; i < 5; i++) addTx({ accountId: id, date: `2026-05-0${i + 1}` });
    const root = mountPage();
    expect(Insights().analyze(state()).tier).toBe(2);
    expect(root.querySelector('.insight-quiet').textContent).toContain('Nothing stands out today');
  });

  it('a tap applies the insight filters, then opens its screen', () => {
    const id = addAccount('Main', 1000);
    for (let i = 0; i < 5; i++) addTx({ amount: 20, categoryId: 'cat_dining', accountId: id, date: june(1 + i) });
    const root = mountPage();
    const a = root.querySelector('a[data-insight="topSpending"]');
    a.click();
    expect(state().historyFilters.categories).toEqual(['cat_dining']);
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');
  });

  it('escapes user names everywhere they appear (head, body, legend)', () => {
    const id = addAccount('<img src=x onerror=1>', 9000);
    addAccount('<b>B</b>', 1000);
    for (let i = 0; i < 5; i++) addTx({ amount: 1, accountId: id, date: june(1 + i) });
    const html = Insights().renderPage(state());
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>B</b>');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
  });
});

describe('locale', () => {
  it('percentages go through formatPercent (French: a space before %)', () => {
    boot('fr');
    addAccount('A', 9000);
    addAccount('B', 1000);
    for (let i = 0; i < 5; i++) addTx({ date: june(1 + i), amount: 1 });
    const c = Insights().compute(state()).find(i => i.id === 'accountMix');
    expect(c.figure).toMatch(/^90\s%$/);
    expect(c.head).toBe('A détient l’essentiel de votre argent');
  });
});

describe('formatCurrency { whole: true }', () => {
  beforeEach(() => boot());

  it('rounds to whole units and still masks on Home when balances are hidden', () => {
    expect(Store().formatCurrency(3071.6, null, { whole: true })).toBe('$3,072');
    expect(Store().formatCurrency(3071.6)).toBe('$3,071.60');
    Store().dispatch('SET_PRIVACY', { hide: true });
    Store().state.activeView = 'dashboard';
    expect(Store().formatCurrency(3071.6, null, { whole: true })).toBe('$••••');
  });
});
