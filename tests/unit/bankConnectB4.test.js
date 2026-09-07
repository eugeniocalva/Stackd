import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.08 Bank Connect, phase B4 (docs/bank-connect-ux-plan.md §3.10 / §3.11):
// background refresh into in-memory pending statements, the two Smart
// Insight cards, Refresh now, reconnect with carried-over mappings, revoke.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

const NOW = Date.parse('2026-09-07T12:00:00.000Z');
const TX = { transactions: [
  { entry_reference: 'e1', booking_date: '2026-09-01', status: 'BOOK', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '45.90', currency: 'USD' }, creditor: { name: 'ROSSI' } },
  { entry_reference: 'e2', booking_date: '2026-09-03', status: 'BOOK', credit_debit_indicator: 'CRDT', transaction_amount: { amount: '1850.00', currency: 'USD' }, debtor: { name: 'ACME' } }
] };
const BAL = { balances: [{ balance_amount: { amount: '2804.10', currency: 'USD' }, balance_type: 'CLBD', reference_date: '2026-09-06' }] };

const makeStub = () => ({
  calls: [],
  fail: null, // error code to throw on account endpoints
  status: null,
  async request(path, opts) {
    this.calls.push({ path, opts });
    if (path === '/v1/entitlement/verify') return { ownerId: 'owner_abcdefgh', deviceToken: 'stub.token', active: true, expiresAt: null };
    if (path.startsWith('/v1/institutions')) return [{ id: 'IT:Mock ASPSP', name: 'Mock ASPSP', logo: null, historyDays: 365, maxValidityDays: 180 }];
    if (path === '/v1/connect/start') return { ref: 'new_ref', bankRedirectUrl: 'https://bank.example/sca' };
    if (path.startsWith('/v1/connect/status')) return this.status;
    if (path === '/v1/connections') return { connections: this.status ? [this.status] : [] };
    if (path.startsWith('/v1/accounts/')) {
      if (this.fail) { const e = new Error(this.fail); e.code = this.fail; throw e; }
      return path.includes('/balances') ? BAL : TX;
    }
    if ((opts || {}).method === 'DELETE') return { ok: true };
    throw new Error('unexpected ' + path);
  },
  async openSca(url) { this.opened = url; }
});

const CONN = (over = {}) => ({
  ref: 'ref_a', institutionId: 'IT:Mock ASPSP', institutionName: 'Mock ASPSP', logo: null,
  accounts: [{ bankAccountId: 'acc_1', stackdAccountId: null, ibanTail: '3456', currency: 'USD', name: 'Conto' }],
  connectedAt: '2026-09-01T00:00:00.000Z', lastFetchAt: null, expiresAt: '2026-12-01T00:00:00.000Z', historyLimitDays: 365, status: 'LN', ...over
});

let stub;
const boot = () => {
  stub = makeStub();
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: memStorage(),
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#bank-connect' },
    __STACKD_BROKER_STUB__: stub
  };
  global.localStorage = global.window.localStorage;
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'widgets.js', 'insights.js', 'views.js', 'router.js', 'export.js', 'import.js', 'bank-connect.js'].forEach(executeFile);
  const w = global.window;
  w.Store.init();
  w.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
  w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, consentAt: 'x', entitlement: { active: true } });
  w.localStorage.setItem('stackd_device_token', 'stub.token'); // a device that already connected
  w.Router.navigate = vi.fn();
  return w;
};
const state = () => global.window.Store.getState();
const mainId = () => state().accounts[0].id;
const seedConn = (over = {}) => {
  const c = CONN({ accounts: [{ bankAccountId: 'acc_1', stackdAccountId: mainId(), ibanTail: '3456', currency: 'USD', name: 'Conto' }], ...over });
  global.window.Store.dispatch('ADD_BANK_CONNECTION', c);
  return c;
};

describe('Bank Connect B4 (v1.08)', () => {
  beforeEach(() => boot());

  describe('refreshDue', () => {
    it('fetches stale mapped accounts into pending, counts new rows, stamps lastFetchAt — and skips fresh ones', async () => {
      const BC = window.BankConnect;
      seedConn();
      const r = await BC.refreshDue(state(), { now: NOW });
      expect(r).toEqual({ fetched: 1, newTotal: 2, failed: 0 });
      expect(BC.pendingFor('ref_a', 'acc_1')).toMatchObject({ newCount: 2 });
      expect(state().bankConnections[0].lastFetchAt).toBe('2026-09-07T12:00:00.000Z');
      expect(stub.calls.filter(c => c.path.startsWith('/v1/accounts/')).length).toBe(2);
      // within 6h → nothing; forced → again
      expect(await BC.refreshDue(state(), { now: NOW + 3600000 })).toEqual({ fetched: 0, newTotal: 0, failed: 0 });
      expect((await BC.refreshDue(state(), { now: NOW + 3600000, force: true })).fetched).toBe(1);
      expect(BC.pendingSummary(state())).toEqual({ total: 2, banks: [{ ref: 'ref_a', name: 'Mock ASPSP', count: 2 }] });
    });

    it('counts only rows the pipeline would insert (importKey dedup)', async () => {
      const BC = window.BankConnect;
      seedConn();
      window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: [{ type: 'expense', amount: 45.9, accountId: mainId(), categoryId: '', date: '2026-09-01', comment: 'ROSSI', importKey: `ref:${mainId()}|e1` }] });
      const r = await BC.refreshDue(state(), { now: NOW });
      expect(r.newTotal).toBe(1);
    });

    it('never runs while paused, without a token, for unmapped or expired connections, or twice at once', async () => {
      const BC = window.BankConnect;
      seedConn();
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: false });
      expect((await BC.refreshDue(state(), { now: NOW })).fetched).toBe(0);
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      window.localStorage.removeItem('stackd_device_token');
      BC._token = null;
      expect((await BC.refreshDue(state(), { now: NOW })).fetched).toBe(0);
      expect(stub.calls.some(c => c.path === '/v1/entitlement/verify')).toBe(false); // never mints on its own
      window.localStorage.setItem('stackd_device_token', 'stub.token');
      window.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: 'ref_a', expiresAt: '2020-01-01T00:00:00.000Z' });
      expect((await BC.refreshDue(state(), { now: NOW })).fetched).toBe(0);
      window.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: 'ref_a', expiresAt: '2026-12-01T00:00:00.000Z', accounts: [{ bankAccountId: 'acc_1', stackdAccountId: null, ibanTail: '3456', currency: 'USD', name: 'Conto' }] });
      expect((await BC.refreshDue(state(), { now: NOW })).fetched).toBe(0);
      expect(stub.calls.filter(c => c.path.startsWith('/v1/accounts/')).length).toBe(0);
    });

    it('records failures on the connection: consent_expired flips the status, anything else stays LN', async () => {
      const BC = window.BankConnect;
      seedConn();
      stub.fail = 'fetch_failed';
      expect(await BC.refreshDue(state(), { now: NOW })).toEqual({ fetched: 0, newTotal: 0, failed: 1 });
      expect(state().bankConnections[0]).toMatchObject({ status: 'LN', lastError: 'fetch_failed' });
      expect(BC.pendingFor('ref_a', 'acc_1')).toBeNull();
      stub.fail = 'consent_expired';
      await BC.refreshDue(state(), { now: NOW, force: true });
      expect(state().bankConnections[0]).toMatchObject({ status: 'EX', lastError: 'consent_expired' });
      expect(BC.connectionStatus(state(), state().bankConnections[0])).toBe('expired');
      stub.fail = null;
      const r = await BC.refreshDue(state(), { now: NOW, force: true }); // expired → not fetched
      expect(r.fetched).toBe(0);
    });

    it('refreshOnOpen is throttled and non-blocking', async () => {
      const BC = window.BankConnect;
      seedConn();
      const p = BC.refreshOnOpen();
      expect(p).toBeTruthy();
      await p;
      expect(BC.pendingFor('ref_a', 'acc_1')).toBeTruthy();
      expect(BC.refreshOnOpen()).toBeNull(); // within 30 minutes
    });
  });

  describe('review + insights', () => {
    it('startImportFromPending reuses the cached statement and hands it to the pipeline', async () => {
      const BC = window.BankConnect;
      const conn = seedConn();
      await BC.refreshDue(state(), { now: NOW });
      const before = stub.calls.length;
      await BC.startImportFromPending(state().bankConnections[0], 'acc_1', state());
      expect(stub.calls.length).toBe(before); // no refetch
      expect(BC.pendingFor(conn.ref, 'acc_1')).toBeNull();
      const d = window.Views._ImportShared.draft;
      expect(d.kind).toBe('statement');
      expect(d.statement.format).toBe('connect');
      expect(d.statement.entries).toHaveLength(2);
      expect(d.accountId).toBe(mainId());
      expect(window.Router.navigate).toHaveBeenCalledWith('#import-map');
    });

    it('the bankNew insight leads with the pending count and targets the hub', async () => {
      const BC = window.BankConnect;
      seedConn();
      expect(window.Insights.compute(state()).find(c => c.stringId === 'bankNew')).toBeUndefined();
      await BC.refreshDue(state(), { now: NOW });
      const card = window.Insights.compute(state())[0];
      expect(card).toMatchObject({ stringId: 'bankNew', href: '#bank-connect', params: { count: 2, bank: 'Mock ASPSP' } });
      const html = window.Insights.renderSection(state());
      expect(html).toContain('data-insight="bankNew"');
      expect(html).toContain('data-href="#bank-connect"');
      expect(html).toContain('new transactions from <strong>Mock ASPSP</strong>');
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: false });
      expect(window.Insights.compute(state()).find(c => c.stringId === 'bankNew')).toBeUndefined();
    });

    it('the reconnect insight covers expiring (days left) and expired connections', () => {
      const soon = new Date(NOW + 5 * 86400000).toISOString();
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
      seedConn({ expiresAt: soon });
      let card = window.Insights.compute(state()).find(c => c.stringId === 'bankExpiring');
      expect(card).toMatchObject({ params: { bank: 'Mock ASPSP', days: 5 }, href: '#bank-connect' });
      expect(window.Insights.renderSection(state())).toContain('5 days');
      window.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: 'ref_a', status: 'EX' });
      card = window.Insights.compute(state()).find(c => c.stringId === 'bankExpired');
      expect(card).toMatchObject({ tone: 'expense', params: { bank: 'Mock ASPSP' } });
      expect(window.Insights.renderSection(state())).toContain('Expired');
      vi.restoreAllMocks();
    });
  });

  describe('reconnect / disconnect / reset', () => {
    it('reconnect starts a new authorization and carries the mappings over on the return, revoking the old ref', async () => {
      const BC = window.BankConnect;
      seedConn({ status: 'EX' });
      await BC.reconnect(state().bankConnections[0], state());
      expect(state().bankConnect.pendingReplaceRef).toBe('ref_a');
      expect(state().bankConnect.pendingRef).toBe('new_ref');
      expect(stub.calls.find(c => c.path === '/v1/connect/start').opts.body.institutionId).toBe('IT:Mock ASPSP');
      stub.status = { ref: 'new_ref', status: 'LN', institutionId: 'IT:Mock ASPSP', institutionName: 'Mock ASPSP', institutionLogo: null, accounts: [{ id: 'acc_9', ibanTail: '3456', currency: 'USD', name: 'Conto' }], historyDays: 365, validityDays: 180, expiresAt: '2027-03-01T00:00:00.000Z', linkedAt: 'x', createdAt: 'x' };
      expect(await BC.resumeConnection('new_ref')).toBe(true);
      const conns = state().bankConnections;
      expect(conns).toHaveLength(1);
      expect(conns[0]).toMatchObject({ ref: 'new_ref', status: 'LN' });
      expect(conns[0].accounts[0]).toMatchObject({ bankAccountId: 'acc_9', stackdAccountId: mainId() });
      expect(stub.calls.some(c => c.path === '/v1/connections/ref_a' && c.opts.method === 'DELETE')).toBe(true);
      expect(state().bankConnect.pendingReplaceRef).toBeNull();
      expect(window.Router.navigate).toHaveBeenLastCalledWith('#bank-connect'); // everything mapped → no mapping step
    });

    it('revoke deletes at the broker, drops pending and the local record; revokeAll covers every connection', async () => {
      const BC = window.BankConnect;
      seedConn();
      window.Store.dispatch('ADD_BANK_CONNECTION', CONN({ ref: 'ref_b' }));
      await BC.refreshDue(state(), { now: NOW });
      await BC.revoke('ref_a');
      expect(state().bankConnections.map(c => c.ref)).toEqual(['ref_b']);
      expect(BC.pendingFor('ref_a', 'acc_1')).toBeNull();
      expect(await BC.revokeAll(state(), true)).toBe(1);
      const del = stub.calls.filter(c => c.opts && c.opts.method === 'DELETE').map(c => c.path);
      expect(del).toEqual(['/v1/connections/ref_a', '/v1/connections/ref_b']);
      expect(stub.calls[stub.calls.length - 1].opts.keepalive).toBe(true);
    });
  });

  describe('hub card', () => {
    it('shows the badge, Review, Refresh now and Manage; amber line on failure; Reconnect when expired', async () => {
      const BC = window.BankConnect;
      seedConn();
      let html = window.Views.BankConnectHubView.render(state());
      expect(html).toContain('bank-conn-refresh');
      expect(html).toContain('bank-conn-manage');
      expect(html).toContain('bank-acc-import');
      await BC.refreshDue(state(), { now: NOW });
      html = window.Views.BankConnectHubView.render(state());
      expect(html).toContain('class="bank-new-badge"');
      expect(html).toContain('2 new');
      expect(html).toContain('Review 2 new');
      window.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: 'ref_a', lastError: 'fetch_failed' });
      html = window.Views.BankConnectHubView.render(state());
      expect(html).toContain('bank-sync-failed');
      expect(html).toContain('Couldn’t reach your bank');
      window.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: 'ref_a', status: 'EX', lastError: 'consent_expired' });
      html = window.Views.BankConnectHubView.render(state());
      expect(html).toContain('bank-conn-reconnect');
      expect(html).not.toContain('bank-conn-refresh');
      expect(html).not.toContain('bank-sync-failed');
    });
  });
});
