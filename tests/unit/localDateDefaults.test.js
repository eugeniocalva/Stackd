import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.0.2 (BUG-38): New Log, New Account and the store's opening-balance
// fallbacks prefilled toISOString().split('T')[0] — the UTC day (yesterday in
// Rome until 01:00/02:00, tomorrow in UTC-4 from 20:00), while every balance
// and History period compares against the LOCAL day. The recurrence end
// default also lost a day at DST edges. The zone is switched at runtime (as in
// periodLabelYear.test.js) so the cases fail on the old code on any runner.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let params = {};
let container;
let prevTZ;

const S = () => global.window.Store;
const $ = (id) => document.getElementById(id);
const accId = (name) => S().getState().accounts.find(a => a.name === name).id;
const obRow = (id) => S().getState().transactions.find(t => t.accountId === id && t.type === 'opening_balance');

const boot = () => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  container = $('router-view');
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    requestAnimationFrame: (cb) => cb(),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn() },
    alert: vi.fn()
  };
  global.localStorage = global.window.localStorage;
  global.requestAnimationFrame = (cb) => cb();
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  S().init();
};

const renderView = (name) => {
  const view = global.window.Views[name];
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};

// Set the zone FIRST, then build the local wall-clock time and pin it.
const at = (tz, ...wall) => {
  process.env.TZ = tz;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(...wall));
};

describe('Local-date defaults (1.0.2 BUG-38)', () => {
  beforeEach(() => {
    prevTZ = process.env.TZ;
    params = {};
  });
  afterEach(() => {
    vi.useRealTimers();
    if (prevTZ === undefined) delete process.env.TZ;
    else process.env.TZ = prevTZ;
  });

  it('Rome 1 Nov 00:30: New Log prefills the local day', () => {
    at('Europe/Rome', 2026, 10, 1, 0, 30);
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-31'); // the old (UTC) answer
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
    renderView('AddTransactionView');
    expect($('tx-date').value).toBe('2026-11-01');
  });

  it('Martinique 3 Oct 21:00: new account and the store fallbacks use the local day', () => {
    at('America/Martinique', 2026, 9, 3, 21, 0);
    expect(new Date().toISOString()).toBe('2026-10-04T01:00:00.000Z');
    boot();

    // New Account form
    renderView('EditAccountView');
    expect($('edit-acc-date').value).toBe('2026-10-03');

    // ADD_ACCOUNT with an amount but no date: dated on the local day
    S().dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 1000 });
    const main = accId('Main Bank');
    expect(obRow(main).date).toBe('2026-10-03');
    expect(S().getAccountBalance(main)).toBe(1000);

    // UPDATE_ACCOUNT with no date on an account without an opening balance:
    // the createdAt fallback is createdAt's LOCAL day
    S().dispatch('ADD_ACCOUNT', { name: 'B', openingBalance: 0 });
    const b = accId('B');
    expect(obRow(b)).toBeUndefined();
    expect(S().getState().accounts.find(a => a.id === b).createdAt).toBe('2026-10-04T01:00:00.000Z');
    S().dispatch('UPDATE_ACCOUNT', { id: b, openingBalance: 50 });
    expect(obRow(b).date).toBe('2026-10-03');
    expect(S().getAccountBalance(b)).toBe(50);
  });

  it('the recurrence end default is start + 5 years, local', () => {
    at('Europe/Rome', 2026, 9, 1, 12, 0);
    boot();
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
    renderView('AddTransactionView');
    $('tx-date').value = '2026-10-26';
    $('tx-is-recurrent').checked = true;
    $('tx-is-recurrent').dispatchEvent(new Event('change'));
    expect($('tx-recurrence-end-date').value).toBe('2031-10-26');

    // The save-time default (end field cleared) is the same date.
    $('tx-recurrence-end-date').value = '';
    $('tx-category').value = 'cat_groceries';
    $('tx-amount').value = '10';
    $('btn-save-tx').click();
    const first = S().getState().transactions.find(t => t.type === 'expense' && t.date === '2026-10-26');
    expect(first).toBeTruthy();
    expect(first.recurrence.endDate).toBe('2031-10-26');
    expect(global.window.Router.navigate).toHaveBeenCalledWith('#transactions');
  });
});
