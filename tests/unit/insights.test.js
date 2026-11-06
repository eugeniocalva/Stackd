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
    expect(locked.map(l => l.dataset.locked)).toEqual([
      'monthOutlook', 'topSpending', 'incomeSource', 'accountMix', 'budgetAtRisk', 'budgetsOnTrack', 'upcomingWeek', 'loanProgress', 'uncategorized', // tier 1
      'spendPace', 'savingsRate', 'budgetSuggest', 'recurringLoad', // tier 2
      'categorySpike', 'runway', 'balanceTrend', // tier 3
      'yearOverYear' // tier 4
    ]);
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
    // April, not May: a quiet May would itself be news (spending pace); one
    // budget, so no budget idea either (P4)
    Store().dispatch('SAVE_BUDGET', { categoryId: 'cat_dining', amount: 100, startDate: '', endDate: null, isCumulative: false });
    for (let i = 0; i < 5; i++) addTx({ accountId: id, date: `2026-04-0${i + 1}` });
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

// 1.2.2 (HG-7 P2, plan §3.3): the Home widget (registry.insights).
describe('the Smart Insights widget', () => {
  beforeEach(() => boot());

  const W = () => global.window.Widgets;
  const inst = (size, id) => ({ id: id || `w-${size}`, type: 'insights', size, config: {}, createdAt: '' });
  const mountCard = (size, id) => {
    const root = document.getElementById('router-view');
    const instance = inst(size, id);
    root.innerHTML = `<div class="widget-card">${W().registry.insights.render(instance, state())}</div>`;
    const card = root.querySelector('.widget-card');
    W().registry.insights.attach(instance, card);
    return card;
  };
  // Outlook (cashflow) + top spending + income (cashflow) + account mix.
  const rich = () => {
    const id = addAccount('Main', 9000);
    addAccount('Spare', 1000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 3000, accountId: id, date: june(1) });
    for (let i = 0; i < 4; i++) addTx({ amount: 100, categoryId: 'cat_rent', accountId: id, date: june(2 + i) });
  };

  it('is in the gallery, opt-in only: a fresh install seeds no insights widget', () => {
    expect(W().listTypes().map(t => t.type)).toContain('insights');
    const def = W().registry.insights;
    expect(def.title).toBe('Smart Insights');
    expect(def.sizes).toEqual(['small', 'large']);
    expect(def.hasConfig).toBe(false);
    expect(W().registry.insights.icon).toBe('lightbulb');
    expect(Store()._defaultHomeWidgets().map(w => w.type)).not.toContain('insights');
  });

  it('only the large card grows with its rows (autoHeight "large")', () => {
    const small = W()._renderCard(inst('small'), state(), false, 0, 1);
    const large = W()._renderCard(inst('large'), state(), false, 0, 1);
    expect(small).not.toContain('widget-card--auto');
    expect(large).toContain('widget-card--auto');
  });

  it('one item per catalogue family, attention first', () => {
    rich();
    const items = Insights().compute(state());
    const ids = items.map(i => i.id);
    expect(ids).toContain('monthOutlook');
    expect(ids).toContain('incomeSource'); // same family (cashflow) as the outlook
    const picks = Insights().top(items, 3);
    expect(picks.map(i => i.group)).toEqual([...new Set(picks.map(i => i.group))]);
    expect(picks.map(i => i.id)).not.toContain('incomeSource');
    const fake = [{ id: 'a', group: 'bank', kind: 'attention' }, { id: 'b', group: 'bank', kind: 'attention' }, { id: 'c', group: 'spending' }];
    expect(Insights().top(fake, 3).map(i => i.id)).toEqual(['a', 'c']);
  });

  it('small: the top item with its figure, the card opens the page', () => {
    rich();
    const top = Insights().compute(state())[0];
    const card = mountCard('small');
    const a = card.querySelector('a.widget-insight');
    expect(a.getAttribute('href')).toBe('#insights');
    expect(card.querySelector('.widget-insight-figure').textContent).toContain(top.figure);
    expect(card.querySelector('.widget-insight-head').textContent).toBe(top.head);
    expect(card.querySelector('.widget-insight-head--clamp')).not.toBeNull();
    a.click();
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#insights');
  });

  it('large: up to three rows, each opening its own screen with its filters; "All insights" opens the page', () => {
    rich();
    const card = mountCard('large');
    const rows = card.querySelectorAll('ul[role="list"] > li > a.widget-insight-row[data-insight]');
    expect(rows.length).toBe(3);
    const spend = card.querySelector('a[data-insight="topSpending"]');
    spend.click();
    expect(state().historyFilters.categories).toEqual(['cat_rent']);
    expect(global.window.Router.navigate).toHaveBeenLastCalledWith('#transactions');
    card.querySelector('a.widget-insight-all').click();
    expect(global.window.Router.navigate).toHaveBeenLastCalledWith('#insights');
    // the rows carry no arrow (one figure column); the small card does
    expect(card.querySelector('.widget-insight-row .insight-arrow')).toBeNull();
  });

  it('edit mode: a tap never navigates', () => {
    rich();
    const card = mountCard('large');
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    const before = global.window.Router.navigate.mock.calls.length;
    const a = card.querySelector('a[data-insight]');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(global.window.Router.navigate.mock.calls.length).toBe(before);
  });

  it('tier 0: the starter in both sizes; nothing to say: the quiet card', () => {
    ['small', 'large'].forEach(size => {
      const html = W().registry.insights.render(inst(size), state());
      expect(html).toContain('Log a few days of spending to unlock insights');
      expect(html).toContain('0 of 5 entries so far.');
    });
    const id = addAccount('Main', 100);
    // April, not May: a quiet May would itself be news (spending pace); one
    // budget, so no budget idea either (P4)
    Store().dispatch('SAVE_BUDGET', { categoryId: 'cat_dining', amount: 100, startDate: '', endDate: null, isCumulative: false });
    for (let i = 0; i < 5; i++) addTx({ accountId: id, date: `2026-04-0${i + 1}` });
    expect(W().registry.insights.render(inst('large'), state())).toContain('Nothing stands out today');
  });

  it('amounts mask on Home when balances are hidden; percentages stay', () => {
    rich();
    Store().dispatch('SET_PRIVACY', { hide: true });
    Store().state.activeView = 'dashboard';
    const html = W().registry.insights.render(inst('large'), state());
    expect(html).toContain('$••••');
    expect(html).not.toMatch(/\$[0-9]/);
    expect(html).toMatch(/\d+%/);
  });

  it('a preview card is a picture: its links leave the tab order', () => {
    rich();
    const html = W().registry.insights.render(inst('large', '__preview__:large'), state());
    const root = document.getElementById('router-view');
    root.innerHTML = html;
    const links = [...root.querySelectorAll('a')];
    expect(links.length).toBeGreaterThan(0);
    links.forEach(a => expect(a.getAttribute('tabindex')).toBe('-1'));
    expect(W().registry.insights.render(inst('large'), state())).not.toContain('tabindex="-1"');
  });

  it('escapes user names in the widget too', () => {
    const id = addAccount('<img src=x onerror=1>', 9000);
    addAccount('<b>B</b>', 1000);
    for (let i = 0; i < 5; i++) addTx({ amount: 1, accountId: id, date: june(1 + i) });
    const html = W().registry.insights.render(inst('large'), state());
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>B</b>');
  });
});

// 1.2.2 (HG-7 P3): batch 1 rules. The clock is 15 June 2026 (day 15 of 30).
describe('batch 1 rules (P3)', () => {
  beforeEach(() => boot());

  const budget = (categoryId, amount) => Store().dispatch('SAVE_BUDGET', { categoryId, amount, startDate: '', endDate: null, isCumulative: false });
  const may = (day) => `2026-05-${pad(day)}`;
  const item = (id) => byId()[id];
  // rows the aggregates must ignore: unpaid, a transfer, another currency, before the account opened
  const noise = (main, categoryId, date) => {
    const eur = addAccount('Euro', 0, { currency: 'EUR' });
    const late = addAccount('Late', 0, { openingDate: '2026-06-10' });
    addTx({ amount: 500, categoryId, accountId: main, date, isPaid: false });
    addTx({ amount: 500, categoryId, accountId: eur, date });
    addTx({ amount: 500, categoryId, accountId: late, date: '2026-05-01' });
    Store().dispatch('ADD_TRANSFER', { amount: 500, expenseAccountId: main, incomeAccountId: eur, date });
  };

  it('budgetOver: the budget furthest over, the others counted; opens Goals on this month', () => {
    const id = addAccount('Main', 5000);
    budget('cat_groceries', 100);
    budget('cat_dining', 50);
    budget('cat_transport', 50);
    addTx({ amount: 80, categoryId: 'cat_groceries', accountId: id, date: june(2) });
    addTx({ amount: 40, categoryId: 'cat_groceries', accountId: id, date: june(3) });
    addTx({ amount: 60, categoryId: 'cat_dining', accountId: id, date: june(4) });
    noise(id, 'cat_transport', june(5)); // none of it is Transport spend
    const c = item('budgetOver');
    expect(c).toMatchObject({ kind: 'attention', figure: '$20', tone: 'bad', href: '#budget', group: 'budgets' });
    expect(c.head).toBe('Groceries is over its budget');
    expect(c.body).toBe('$120 spent of $100 this month. One more budget is over too.');
    Store().dispatch('SET_MONTH_FILTER', '2026-01');
    Insights().open(c);
    expect(state().activeMonthFilter).toBe('2026-06');
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#budget');
  });

  it('budgetAtRisk: one-off spend runs on at its pace; a rent paid on the 1st is not "over by the 5th"', () => {
    const id = addAccount('Main', 5000);
    budget('cat_dining', 300);
    budget('cat_rent', 1000);
    for (let i = 0; i < 5; i++) addTx({ amount: 40, categoryId: 'cat_dining', accountId: id, date: june(2 + i) });
    addTx({
      amount: 1000, categoryId: 'cat_rent', accountId: id, date: june(1),
      recurrence: { frequency: 'months', interval: 1, startDate: june(1), endDate: '2026-12-01' }
    });
    const c = item('budgetAtRisk');
    expect(c).toMatchObject({ figure: '67%', href: '#budget', family: 'month', group: 'budgets' });
    expect(c.head).toBe('Dining Out could go over its budget');
    expect(c.body).toBe('67% used, 15 days to go. At this pace: about $400 by the end of the month, against a limit of $300.');
    expect(c.viz).toEqual({ type: 'budget', used: 200 / 300, today: 0.5 });
    expect(c.score).toBe(70 + 25); // 33 % over, capped at +25
    const status = Insights()._budgetStatus(Insights()._facts(state()), state());
    expect(status.find(b => b.id === 'cat_rent')).toMatchObject({ projected: 1000, risk: false, onTrack: true });
  });

  it('budgetsOnTrack: two or more budgets, from day 10, every one set to end within its limit', () => {
    const id = addAccount('Main', 5000);
    budget('cat_groceries', 400);
    budget('cat_dining', 300);
    for (let i = 0; i < 5; i++) addTx({ amount: 20, categoryId: i % 2 ? 'cat_dining' : 'cat_groceries', accountId: id, date: june(2 + i) });
    const c = item('budgetsOnTrack');
    expect(c).toMatchObject({ figure: '2 of 2', tone: 'good', href: '#budget' });
    expect(c.head).toBe('All your budgets are on track');
    addTx({ amount: 250, categoryId: 'cat_dining', accountId: id, date: june(8) }); // now at risk
    expect(item('budgetsOnTrack')).toBeUndefined();
    expect(item('budgetAtRisk')).toBeDefined();
  });

  it('overdueUnpaid: unpaid expenses dated today or earlier, any currency; History opens on their range', () => {
    const id = addAccount('Main', 5000);
    const eur = addAccount('Euro', 0, { currency: 'EUR' });
    addTx({ amount: 30, accountId: id, date: june(1), isPaid: false });
    addTx({ amount: 30, accountId: eur, date: june(15), isPaid: false });
    addTx({ amount: 30, accountId: id, date: june(20), isPaid: false }); // not due yet
    addTx({ amount: 30, accountId: id, date: june(2) });                 // paid
    const c = item('overdueUnpaid');
    expect(c).toMatchObject({ kind: 'attention', figure: '2', tone: 'bad', href: '#transactions', group: 'unpaid' });
    expect(c.head).toBe('2 payments past their date are still unpaid');
    expect(c.body).toBe('Mark them paid in History, or move them to a new date.');
    expect(c.filters).toEqual({ page: 'history', filters: { period: { type: 'custom', value: '', start: june(1), end: june(15) }, types: ['expense'] }, replace: true });
    Insights().open(c);
    expect(state().historyFilters.period).toMatchObject({ type: 'custom', start: june(1), end: june(15) });
  });

  it('overdueUnpaid: one payment says it in the singular', () => {
    const id = addAccount('Main', 5000);
    addTx({ amount: 30, accountId: id, date: june(3), isPaid: false });
    const c = item('overdueUnpaid');
    expect(c.head).toBe('1 payment past its date is still unpaid');
    expect(c.body).toBe('Mark it paid in History, or move it to a new date.');
  });

  it('upcomingWeek: scheduled expenses in the next 7 days, by the forecast rules; History opens on the week', () => {
    const id = addAccount('Main', 5000);
    for (let i = 0; i < 5; i++) addTx({ amount: 10, accountId: id, date: june(1 + i) });
    addTx({ amount: 900, categoryId: 'cat_rent', accountId: id, date: june(16) });
    addTx({ amount: 50, categoryId: 'cat_dining', accountId: id, date: june(22) });
    addTx({ amount: 70, accountId: id, date: june(23) });                  // after the week
    addTx({ amount: 70, accountId: id, date: june(18), isPaid: false });   // unpaid: not in the forecast
    const eur = addAccount('Euro', 0, { currency: 'EUR' });
    addTx({ amount: 70, accountId: eur, date: june(17) });                 // other currency
    Store().dispatch('ADD_TRANSFER', { amount: 70, expenseAccountId: id, incomeAccountId: eur, date: june(17) });
    const c = item('upcomingWeek');
    expect(c).toMatchObject({ figure: '$950', href: '#transactions', group: 'upcoming' });
    expect(c.head).toBe('2 payments due in the next 7 days');
    expect(c.body).toBe('The largest: Rent, $900, due Tuesday, June 16.');
    expect(c.filters.filters.period).toEqual({ type: 'custom', value: '', start: june(16), end: june(22) });
    expect(c.score).toBe(55); // $950 is under a quarter of the balance
  });

  it('spendPace (tier 2): this month so far against last month by the same day, |Δ| ≥ 10 %', () => {
    const id = addAccount('Main', 5000);
    for (let i = 0; i < 5; i++) addTx({ amount: 100, accountId: id, date: may(2 + i) });
    addTx({ amount: 400, accountId: id, date: may(20) }); // after day 15: not part of the comparison
    for (let i = 0; i < 3; i++) addTx({ amount: 100, accountId: id, date: june(1 + i) });
    noise(id, 'cat_groceries', june(4));
    const c = item('spendPace');
    expect(Insights().analyze(state()).tier).toBe(2);
    expect(c).toMatchObject({ figure: '-40%', tone: 'good', dir: 'down', href: '#analytics', group: 'spending' });
    expect(c.head).toBe("You've spent less than by this day last month");
    expect(c.body).toBe('$300 so far this month, against $500 by this day last month.');
    expect(c.viz.type).toBe('bars');
    expect(c.viz.parts.map(p => p.value)).toEqual([300, 500]);
    addTx({ amount: 160, accountId: id, date: june(5) }); // $460 vs $500: -8 %, no signal
    expect(item('spendPace')).toBeUndefined();
  });

  it('savingsRate (tier 2): last month kept, or spent more than earned; opens Analytics on that month', () => {
    const id = addAccount('Main', 5000);
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 2000, accountId: id, date: may(1) });
    for (let i = 0; i < 5; i++) addTx({ amount: 300, accountId: id, date: may(2 + i) });
    noise(id, 'cat_groceries', may(10));
    let c = item('savingsRate');
    expect(c).toMatchObject({ figure: '25%', tone: 'good', family: 'trends', group: 'cashflow' });
    expect(c.head).toBe('In May, you kept 25% of your income');
    expect(c.body).toBe('$2,000 in, $1,500 out.');
    expect(c.filters).toEqual({ page: 'analytics', filters: { period: { type: 'month', value: '2026-05-01', start: '', end: '' } }, replace: true });
    addTx({ amount: 1000, accountId: id, date: may(12) });
    c = item('savingsRate');
    expect(c).toMatchObject({ figure: '-25%', tone: 'bad', variant: 'over' });
    expect(c.head).toBe('In May, you spent more than you earned');
  });

  it('the new rules unlock at their tiers and describe themselves while locked', () => {
    const id = addAccount('Main', 5000);
    for (let i = 0; i < 5; i++) addTx({ accountId: id, date: june(1 + i) });
    const res = Insights().analyze(state());
    expect(res.tier).toBe(1);
    expect(res.locked.map(l => l.id)).toEqual(['spendPace', 'savingsRate', 'budgetSuggest', 'recurringLoad', 'categorySpike', 'runway', 'balanceTrend', 'yearOverYear']);
    expect(res.locked[0].need).toBe('After a full month of entries');
  });

  it('draws the pace bars and the budget bar with its today tick (aria-hidden)', () => {
    const bars = Insights()._renderViz({ type: 'bars', parts: [{ label: 'This month', value: 300, color: 'red' }, { label: 'Last month', value: 500, color: 'grey' }] });
    const root = document.getElementById('router-view');
    root.innerHTML = bars;
    expect(root.querySelector('.insight-bars').getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelectorAll('.insight-bars-row')).toHaveLength(2);
    expect(root.querySelector('.insight-bars-track > span').style.width).toBe('60%');
    root.innerHTML = Insights()._renderViz({ type: 'budget', used: 0.67, today: 0.5 });
    expect(root.querySelector('.insight-budgetbar').getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.insight-budgetbar-fill').style.width).toBe('67%');
    expect(root.querySelector('.insight-budgetbar-tick').style.left).toBe('50%');
    expect(root.querySelector('.insight-budgetbar-today').textContent).toBe('Today');
  });
});

// 1.2.2 (HG-7 P4): batch 2 rules. The clock is 15 June 2026: the three
// months before are March, April and May; a year ago is June 2025.
describe('batch 2 rules (P4)', () => {
  beforeEach(() => {
    boot();
    if (typeof global.requestAnimationFrame !== 'function') global.requestAnimationFrame = (fn) => fn();
  });

  const on = (ym, day) => `${ym}-${pad(day)}`;
  const item = (id) => byId()[id];
  const SPRING = ['2026-03', '2026-04', '2026-05'];
  // rows every aggregate must ignore: unpaid, another currency, before the
  // account opened, and (where it matters) a transfer
  const noise = (main, categoryId, date, withTransfer) => {
    const eur = addAccount('Euro', 0, { currency: 'EUR' });
    const late = addAccount('Late', 0, { openingDate: '2026-06-10' });
    addTx({ amount: 500, categoryId, accountId: main, date, isPaid: false });
    addTx({ amount: 500, categoryId, accountId: eur, date });
    addTx({ amount: 500, categoryId, accountId: late, date: '2026-05-01' });
    if (withTransfer) Store().dispatch('ADD_TRANSFER', { amount: 500, expenseAccountId: main, incomeAccountId: eur, date });
  };

  it('categorySpike (tier 3): a category already past its usual whole month; History opens on it', () => {
    const id = addAccount('Main', 9000);
    SPRING.forEach(ym => {
      addTx({ amount: 100, categoryId: 'cat_dining', accountId: id, date: on(ym, 2) });
      for (let i = 0; i < 4; i++) addTx({ amount: 50, accountId: id, date: on(ym, 3 + i) });
    });
    for (let i = 0; i < 3; i++) addTx({ amount: 60, categoryId: 'cat_dining', accountId: id, date: june(1 + i) });
    addTx({ amount: 400, categoryId: 'cat_health', accountId: id, date: june(4) }); // no usual month: never a spike
    noise(id, 'cat_dining', june(5), true);
    expect(Insights().analyze(state()).tier).toBe(3);
    const c = item('categorySpike');
    expect(c).toMatchObject({ figure: '+80%', tone: 'bad', dir: 'up', href: '#transactions', family: 'month', group: 'spending', score: 95 });
    expect(c.head).toBe('Dining Out is already above your usual month');
    expect(c.body).toBe('$180 so far, against about $100 in a usual month.');
    expect(c.filters).toEqual({ page: 'history', filters: { categories: ['cat_dining'] }, replace: true });
  });

  it('budgetSuggest (tier 2): no budgets, a mostly one-off category at 15 %+; opens its Goals limit editor', () => {
    const id = addAccount('Main', 9000);
    addTx({
      amount: 800, categoryId: 'cat_rent', accountId: id, date: on('2026-05', 1),
      recurrence: { frequency: 'months', interval: 1, startDate: on('2026-05', 1), endDate: '2026-12-01' }
    }); // the bigger share, but a fixed bill
    for (let i = 0; i < 4; i++) addTx({ amount: 50, categoryId: 'cat_dining', accountId: id, date: on('2026-05', 2 + i) });
    noise(id, 'cat_dining', on('2026-05', 10), true);
    const c = item('budgetSuggest');
    expect(c).toMatchObject({ figure: '$200', family: 'tidy', group: 'budgets', href: '#budget' });
    expect(c.head).toBe('Set a budget for Dining Out?');
    expect(c.body).toBe('It averages $200 a month, 20% of your spending.');
    global.window.Views = { BudgetView: { editCategoryId: null } };
    Insights().open(c);
    expect(global.window.Views.BudgetView.editCategoryId).toBe('cat_dining');
    expect(global.window.Router.navigate).toHaveBeenLastCalledWith('#budget');
    Store().dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 100, startDate: '', endDate: null, isCumulative: false });
    expect(item('budgetSuggest')).toBeUndefined();
  });

  it('recurringLoad (tier 2): live expense series as a monthly cost; a sheet lists them', () => {
    document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
    const id = addAccount('Main', 9000);
    const eur = addAccount('Euro', 0, { currency: 'EUR' });
    const rec = (frequency, startDate, endDate) => ({ frequency, interval: 1, startDate, endDate });
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 3000, accountId: id, date: on('2026-05', 1) });
    for (let i = 0; i < 4; i++) addTx({ amount: 20, accountId: id, date: on('2026-05', 2 + i) });
    addTx({ amount: 900, categoryId: 'cat_rent', accountId: id, date: on('2026-05', 1), recurrence: rec('months', on('2026-05', 1), '2026-12-01') });
    addTx({ amount: 10, categoryId: 'cat_health', accountId: id, date: on('2026-05', 2), recurrence: rec('weeks', on('2026-05', 2), '2026-12-31') });
    addTx({ amount: 120, categoryId: 'cat_entertainment', accountId: id, date: on('2026-05', 5), recurrence: rec('years', on('2026-05', 5), '2028-05-05') });
    addTx({ amount: 50, categoryId: 'cat_utilities', accountId: id, date: on('2026-04', 1), recurrence: rec('months', on('2026-04', 1), '2026-05-30') }); // ended
    addTx({ amount: 70, categoryId: 'cat_utilities', accountId: eur, date: on('2026-05', 3), recurrence: rec('months', on('2026-05', 3), '2026-12-03') }); // other currency
    Store().dispatch('ADD_TRANSFER', { amount: 300, expenseAccountId: id, incomeAccountId: eur, date: on('2026-05', 4), recurrence: rec('months', on('2026-05', 4), '2026-12-04') });
    const c = item('recurringLoad');
    expect(c).toMatchObject({ figure: '$953', family: 'trends', group: 'upcoming', sheet: true });
    expect(c.head).toBe('$953 goes to recurring payments every month');
    expect(c.body).toBe('3 payments, 32% of your monthly income.');
    Insights().open(c);
    const sheet = document.getElementById('recurring-payments-sheet');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.querySelector('h2').textContent).toBe('Recurring payments');
    expect(sheet.querySelector('.recurring-sheet-total').textContent).toBe('$953 a month in total.');
    const rows = [...sheet.querySelectorAll('.recurring-sheet-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Rent Repeats every month $900.00', 'Health Repeats every week $10.00', 'Entertainment Repeats every year $120.00']);
    expect(sheet.querySelector('[data-back-dismiss]')).not.toBeNull();
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
  });

  it('runway (tier 3): today\'s balance over an average month of spending; opens the balance sheet', () => {
    const id = addAccount('Main', 6000);
    SPRING.forEach(ym => { for (let i = 0; i < 5; i++) addTx({ amount: 200, accountId: id, date: on(ym, 2 + i) }); });
    noise(id, 'cat_groceries', on('2026-05', 10), true); // the transfer moves $500 out of the base-currency total
    const c = item('runway');
    expect(c).toMatchObject({ figure: '2.5', tone: '', family: 'accounts', group: 'balance', score: 40, sheet: true });
    expect(c.head).toBe('Your balance would cover 2.5 months of spending');
    expect(c.body).toBe('Based on $1,000 of spending in an average month.');
    const show = vi.fn();
    global.window.Components.ExpandedGraphModal.show = show;
    Insights().open(c);
    expect(show).toHaveBeenCalledTimes(1);
    expect(global.window.Router.navigate).not.toHaveBeenCalled();
    const root = mountPage();
    expect(root.querySelector('a[data-insight="runway"]').getAttribute('aria-haspopup')).toBe('dialog');
    expect(root.querySelector('a[data-insight="accountMix"], a[data-insight="topSpending"]') === null
      || !root.querySelector('a[data-insight="topSpending"]').hasAttribute('aria-haspopup')).toBe(true);
  });

  it('runway: under a month is flagged, and exactly one month is singular', () => {
    const id = addAccount('Main', 3500);
    SPRING.forEach(ym => { for (let i = 0; i < 5; i++) addTx({ amount: 200, accountId: id, date: on(ym, 2 + i) }); });
    let c = item('runway');
    expect(c).toMatchObject({ figure: '0.5', tone: 'bad', score: 65 });
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 500, accountId: id, date: june(1) });
    c = item('runway');
    expect(c.head).toBe('Your balance would cover 1 month of spending');
  });

  it('balanceTrend (tier 3): against three months ago, or a new high above every month-end', () => {
    const id = addAccount('Main', 1000);
    SPRING.forEach(ym => {
      addTx({ type: 'income', categoryId: 'cat_salary', amount: 2000, accountId: id, date: on(ym, 1) });
      for (let i = 0; i < 4; i++) addTx({ amount: 100, accountId: id, date: on(ym, 2 + i) });
    });
    let c = item('balanceTrend');
    expect(c).toMatchObject({ variant: 'up', figure: '+$3,200', tone: 'good', dir: 'up', sheet: true });
    expect(c.head).toBe('Your balance grew since March');
    expect(c.body).toBe('$2,600 on March 15, $5,800 today.');
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 100, accountId: id, date: june(2) });
    c = item('balanceTrend');
    expect(c).toMatchObject({ variant: 'high', score: 55 });
    expect(c.head).toBe('Your highest balance yet');
  });

  it('balanceTrend: a fall says so; a change under 5 % is no signal', () => {
    const id = addAccount('Main', 10000);
    SPRING.forEach(ym => { for (let i = 0; i < 5; i++) addTx({ amount: 300, accountId: id, date: on(ym, 2 + i) }); });
    let c = item('balanceTrend');
    expect(c).toMatchObject({ variant: 'down', figure: '-$3,000', tone: 'bad', dir: 'down' });
    expect(c.head).toBe('Your balance fell since March');
    addTx({ type: 'income', categoryId: 'cat_salary', amount: 2800, accountId: id, date: june(1) }); // -$200 of $8,500
    c = item('balanceTrend');
    expect(c).toBeUndefined();
  });

  it('loanProgress (tier 1): an active loan\'s progress, a mark passed in 30 days scores higher; opens its results', () => {
    const id = addAccount('Main', 9000);
    for (let i = 0; i < 5; i++) addTx({ accountId: id, date: june(1 + i) });
    const config = { type: 'personal', principal: 12000, duration: 24, durationUnit: 'months', annualRate: 0, firstPaymentDate: '2025-07-15', amortization: 'french' };
    Store().dispatch('ADD_LOAN', { name: 'Car', kind: 'active', config });
    Store().dispatch('ADD_LOAN', { name: 'Dream house', kind: 'sim', config: { ...config, principal: 300000 } });
    const loan = state().loans.find(l => l.name === 'Car');
    const p = Store().getLoanProgress(loan, june(15));
    const c = item('loanProgress');
    expect(c).toMatchObject({ figure: Insights()._pct(p.pct), href: `#debt-results?id=${encodeURIComponent(loan.id)}`, family: 'accounts', group: 'loans' });
    expect(c.head).toBe(`You've repaid ${Insights()._pct(p.pct)} of Car`);
    expect(c.variant).toBe(p.pct >= 50 ? 'milestone' : 'progress');
    expect(c.body).toMatch(/payments? to go\.$/);
  });

  it('loanProgress: a loan paid off in the last 30 days says so; one paid off long ago is no news', () => {
    const id = addAccount('Main', 9000);
    for (let i = 0; i < 5; i++) addTx({ accountId: id, date: june(1 + i) });
    const config = { type: 'personal', principal: 1200, duration: 12, durationUnit: 'months', annualRate: 0, firstPaymentDate: '2025-06-20', amortization: 'french' }; // last payment 20 May: paid off 26 days ago
    Store().dispatch('ADD_LOAN', { name: 'Phone', kind: 'active', config });
    const loan = state().loans[0];
    const p = Store().getLoanProgress(loan, june(15));
    expect(p.isPaidOff).toBe(true);
    const c = item('loanProgress');
    expect(c).toMatchObject({ variant: 'paidOff', tone: 'good', figure: '100%', score: 70 });
    expect(c.head).toBe('Phone is paid off');
    expect(c.body).toBe('No payments left.');
    Store().dispatch('UPDATE_LOAN', { id: loan.id, name: 'Phone', config: { ...config, firstPaymentDate: '2024-01-10' } });
    expect(item('loanProgress')).toBeUndefined();
  });

  it('uncategorized (tier 1): 5+ rows of the last 60 days without a category, any currency or paid state', () => {
    const id = addAccount('Main', 9000);
    const eur = addAccount('Euro', 0, { currency: 'EUR' });
    for (let i = 0; i < 3; i++) addTx({ categoryId: null, accountId: id, date: june(1 + i) });
    addTx({ categoryId: null, accountId: eur, date: june(4) });
    addTx({ categoryId: null, accountId: id, date: '2026-04-17', isPaid: false }); // day 60
    addTx({ categoryId: null, accountId: id, date: '2026-04-16' });                // day 61: too old
    addTx({ categoryId: null, accountId: id, date: june(20) });                    // not yet
    Store().dispatch('ADD_TRANSFER', { amount: 5, expenseAccountId: id, incomeAccountId: eur, date: june(5) });
    for (let i = 0; i < 5; i++) addTx({ accountId: id, date: june(6 + i) });       // categorised
    const c = item('uncategorized');
    expect(c).toMatchObject({ figure: '5', family: 'tidy', group: 'data', href: '#transactions' });
    expect(c.head).toBe('5 transactions have no category');
    expect(c.filters).toEqual({ page: 'history', filters: { period: { type: 'custom', value: '', start: '2026-04-17', end: june(15) }, categories: ['uncategorized'] }, replace: true });
    Store().dispatch('DELETE_TRANSACTION', { id: state().transactions.find(t => t.date === june(4) && !t.categoryId).id });
    expect(item('uncategorized')).toBeUndefined();
  });

  it('yearOverYear (tier 4): this month so far against the same days a year ago', () => {
    const id = addAccount('Main', 90000);
    for (let k = 0; k < 12; k++) {
      const d = new Date(2025, 5 + k, 1);
      const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      for (let i = 0; i < 5; i++) addTx({ amount: 100, accountId: id, date: on(ym, 1 + i) });
    }
    for (let i = 0; i < 3; i++) addTx({ amount: 100, accountId: id, date: june(1 + i) });
    noise(id, 'cat_groceries', june(4), true);
    expect(Insights().analyze(state()).tier).toBe(4);
    const c = item('yearOverYear');
    expect(c).toMatchObject({ figure: '-40%', tone: 'good', dir: 'down', family: 'trends', group: 'seasonal', href: '#analytics' });
    expect(c.head).toBe("You've spent less than by this day last year");
    expect(c.body).toBe('$300 so far this month, against $500 in the same days last year.');
  });

  it('every rule is in one catalogue family, and the widget never shows two of a family', () => {
    const groups = Insights().rules.map(r => r.group);
    expect(groups.every(Boolean)).toBe(true);
    expect([...new Set(groups)].sort()).toEqual(['balance', 'bank', 'budgets', 'cashflow', 'data', 'loans', 'seasonal', 'spending', 'unpaid', 'upcoming']);
  });
});
