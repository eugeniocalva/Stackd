// 1.2.0 (UX-2) — the accountBalances Home widget: every account with its
// balance today, grouped by type, subtotals and a Total that follow the
// aggregate rule (exclude, never convert). docs/ux-review-1.2-plan.md B.1.
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

let uuid = 0;

const boot = () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  uuid = 0;
  global.window = {
    crypto: { randomUUID: () => `uuid-${++uuid}` },
    localStorage: makeLocalStorage(),
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, addListener: () => {} }),
    document: { documentElement: { setAttribute: () => {}, classList: { add: () => {}, remove: () => {} } } }
  };
  global.localStorage = global.window.localStorage;
  global.window.localStorage.setItem('stackd_v1_homeWidgets', '[]');
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('widgets.js');
  global.window.Store.init();
};

afterEach(() => {
  vi.useRealTimers();
});

const Store = () => global.window.Store;
const W = () => global.window.Widgets;
const def = () => W().registry.accountBalances;

const account = (name, opening, extra = {}) => {
  Store().dispatch('ADD_ACCOUNT', { name, openingBalance: opening, openingDate: '2020-01-01', ...extra });
  return Store().getState().accounts.find(a => a.name === name).id;
};

const render = (config = {}) => {
  Store().dispatch('ADD_HOME_WIDGET', { type: 'accountBalances', size: 'large', config });
  const widgets = Store().getState().homeWidgets;
  const instance = widgets[widgets.length - 1];
  W()._passMemo = {};
  return { instance, html: def().render(instance, Store().getState()) };
};

const textOf = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('accountBalances — registry entry', () => {
  beforeEach(boot);

  it('is a large-only, auto-height, configurable widget right after latest', () => {
    const types = Object.keys(W().registry);
    expect(types.indexOf('accountBalances')).toBe(types.indexOf('latest') + 1);
    expect(def().sizes).toEqual(['large']);
    expect(def().autoHeight).toBe(true);
    expect(def().hasConfig).toBe(true);
    expect(def().defaultConfig).toEqual({ accountIds: [] });
    expect(def().icon).toBe('landmark');
    expect(def().title).toBe('Account balances');
    expect(def().caption({ size: 'large' })).toBe('Today');
  });

  it('renders the auto-height card and no size pill in edit mode', () => {
    account('Main', 100);
    Store().dispatch('ADD_HOME_WIDGET', { type: 'accountBalances', size: 'large' });
    Store().dispatch('ADD_HOME_WIDGET', { type: 'latest', size: 'small' });
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    const el = textOf(W().renderSection(Store().getState()));
    const card = el.querySelector('.widget-card[data-widget-type="accountBalances"]');
    expect(card.classList.contains('widget-card--auto')).toBe(true);
    expect(card.classList.contains('widget-card--large')).toBe(true);
    expect(card.querySelector('[data-widget-action="toggle-size"]')).toBeNull();
    expect(card.querySelector('[data-widget-action="configure"]')).not.toBeNull();
    // the two-size widget keeps its pill
    const latest = el.querySelector('.widget-card[data-widget-type="latest"]');
    expect(latest.querySelector('[data-widget-action="toggle-size"]')).not.toBeNull();
    expect(latest.classList.contains('widget-card--auto')).toBe(false);
  });

  it('lays a stored small instance out wide (it has one size)', () => {
    account('Main', 100);
    Store().dispatch('ADD_HOME_WIDGET', { type: 'accountBalances', size: 'small' });
    const el = textOf(W().renderSection(Store().getState()));
    expect(el.querySelector('.widget-card').classList.contains('widget-card--large')).toBe(true);
  });
});

describe('accountBalances — grouping and totals', () => {
  beforeEach(boot);

  it('groups by type in Store.ACCOUNT_TYPES order with subtotals and a signed Total', () => {
    account('Wallet A', 40, { type: 'Cash' });
    account('Visa', -300, { type: 'Credit card' });
    account('Checking', 1000, { type: 'Bank' });
    account('Savings Pot', 500, { type: 'Savings' });
    account('Second Bank', 200, { type: 'Bank' });
    const el = textOf(render().html);

    const groups = [...el.querySelectorAll('.widget-balances-group-label')].map(n => n.textContent);
    expect(groups).toEqual(['Bank', 'Cash', 'Savings', 'Credit card']);

    const bank = el.querySelectorAll('.widget-balances-group')[0];
    expect([...bank.querySelectorAll('.widget-balances-name')].map(n => n.textContent)).toEqual(['Checking', 'Second Bank']);
    expect(bank.querySelector('.widget-balances-group-sub').textContent).toBe('$1,200.00');

    const credit = el.querySelectorAll('.widget-balances-group')[3];
    const sub = credit.querySelector('.widget-balances-group-sub');
    expect(sub.textContent).toBe('-$300.00');
    expect(sub.classList.contains('text-expense')).toBe(true);
    expect(credit.querySelector('.widget-balances-value').classList.contains('text-expense')).toBe(true);

    const total = el.querySelector('.widget-balances-total-value');
    expect(total.textContent).toBe('$1,440.00');
    expect(total.classList.contains('text-income')).toBe(true);
    expect(el.querySelector('.widget-balances-total-label').textContent).toBe('Total');
    expect(el.querySelector('.widget-balances-note')).toBeNull();
  });

  it('balances exclude unpaid rows and rows before the opening date', () => {
    const id = account('Main', 100);
    Store().state.transactions.push(
      { id: 't1', accountId: id, categoryId: 'cat_groceries', type: 'expense', amount: 30, date: '2026-06-01', createdAt: '' },
      { id: 't2', accountId: id, categoryId: 'cat_groceries', type: 'expense', amount: 999, date: '2026-06-02', isPaid: false, createdAt: '' },
      { id: 't3', accountId: id, categoryId: 'cat_groceries', type: 'expense', amount: 777, date: '2019-01-01', createdAt: '' }
    );
    const el = textOf(render().html);
    expect(el.querySelector('.widget-balances-value').textContent).toBe('$70.00');
    expect(el.querySelector('.widget-balances-total-value').textContent).toBe('$70.00');
  });

  it('lists a foreign-currency account in its own currency but leaves it out of the sums', () => {
    account('Home', 1000, { type: 'Bank' });
    account('Euro', 400, { type: 'Bank', currency: 'EUR' });
    const el = textOf(render().html);
    const rows = [...el.querySelectorAll('.widget-balances-row')];
    expect(rows).toHaveLength(2);
    const euro = rows.find(r => r.textContent.includes('Euro'));
    expect(euro.querySelector('.widget-balances-value').textContent).toContain('€');
    expect(el.querySelector('.widget-balances-group-sub').textContent).toBe('$1,000.00');
    expect(el.querySelector('.widget-balances-total-value').textContent).toBe('$1,000.00');
    expect(el.querySelector('.widget-balances-note').textContent)
      .toBe('1 account in another currency is excluded from these totals.');
  });

  it('a group with no account in the summed currency shows no subtotal', () => {
    account('Home', 1000, { type: 'Bank' });
    account('Euro cash', 50, { type: 'Cash', currency: 'EUR' });
    const el = textOf(render().html);
    const cash = [...el.querySelectorAll('.widget-balances-group')]
      .find(g => g.querySelector('.widget-balances-group-label').textContent === 'Cash');
    expect(cash.querySelector('.widget-balances-group-sub').textContent).toBe('—');
  });

  it('a picked selection lists only those accounts', () => {
    const a = account('Alpha', 10, { type: 'Bank' });
    account('Beta', 20, { type: 'Bank' });
    const el = textOf(render({ accountIds: [a] }).html);
    expect([...el.querySelectorAll('.widget-balances-name')].map(n => n.textContent)).toEqual(['Alpha']);
    expect(el.querySelector('.widget-balances-total-value').textContent).toBe('$10.00');
  });

  it('a selection of only foreign accounts sums in their currency', () => {
    account('Home', 1000);
    const e = account('Euro', 400, { currency: 'EUR' });
    const el = textOf(render({ accountIds: [e] }).html);
    expect(el.querySelector('.widget-balances-total-value').textContent).toContain('€');
    expect(el.querySelector('.widget-balances-note')).toBeNull();
  });

  it('appends unknown (imported) types after the known ones and escapes them', () => {
    account('Known', 5, { type: 'Wallet' });
    account('Odd', 7, { type: '<img src=x onerror=alert(1)>' });
    const { html } = render();
    expect(html).not.toContain('<img src=x');
    const el = textOf(html);
    expect(el.querySelector('img')).toBeNull();
    const labels = [...el.querySelectorAll('.widget-balances-group-label')].map(n => n.textContent);
    expect(labels).toEqual(['Wallet', '<img src=x onerror=alert(1)>']);
  });

  it('escapes account names', () => {
    account('<b>Bold</b>', 5);
    const el = textOf(render().html);
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('.widget-balances-name').textContent).toBe('<b>Bold</b>');
  });

  it('shows the empty state without accounts', () => {
    expect(render().html).toContain('No accounts yet');
  });
});

describe('accountBalances — interaction and config', () => {
  beforeEach(boot);

  it('a row opens that account in History, but not in edit mode', () => {
    const id = account('Main', 10);
    const { instance, html } = render();
    const card = document.createElement('div');
    card.innerHTML = html;
    const nav = vi.fn();
    global.window.Router = { navigate: nav };
    def().attach(instance, card, Store().getState());

    card.querySelector('.widget-balances-name').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(nav).toHaveBeenCalledWith(`#transactions?account=${id}`);

    nav.mockClear();
    Store().dispatch('TOGGLE_WIDGET_EDIT_MODE', true);
    card.querySelector('.widget-balances-row').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(nav).not.toHaveBeenCalled();
  });

  it('rows answer Enter like a tap', () => {
    const id = account('Main', 10);
    const { instance, html } = render();
    const card = document.createElement('div');
    card.innerHTML = html;
    const nav = vi.fn();
    global.window.Router = { navigate: nav };
    def().attach(instance, card, Store().getState());
    card.querySelector('.widget-balances-row').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(nav).toHaveBeenCalledWith(`#transactions?account=${id}`);
  });

  it('the config step offers the account chips', () => {
    account('Main', 10);
    const html = def().renderConfig({ accountIds: [] }, Store().getState());
    expect(html).toContain('data-config-multi="accountIds"');
    expect(html).toContain('Main');
  });

  it('an account delete prunes the widget selection (accountIds key)', () => {
    const a = account('Alpha', 10);
    account('Beta', 20);
    Store().dispatch('ADD_HOME_WIDGET', { type: 'accountBalances', size: 'large', config: { accountIds: [a] } });
    Store().dispatch('DELETE_ACCOUNT', { id: a });
    const inst = Store().getState().homeWidgets[0];
    expect(inst.config.accountIds).toEqual([]);
    // ...so the card falls back to every account instead of an empty list
    W()._passMemo = {};
    const el = textOf(def().render(inst, Store().getState()));
    expect([...el.querySelectorAll('.widget-balances-name')].map(n => n.textContent)).toEqual(['Beta']);
  });
});
