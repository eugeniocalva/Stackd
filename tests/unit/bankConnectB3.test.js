import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.07 Bank Connect, phase B3 (docs/bank-connect-ux-plan.md §3.6–§3.8, §11):
// device identity, the return leg, the D-C8 fetch window, the Enable Banking
// normalizer and the account-mapping view.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

const makeStub = () => ({
  calls: [],
  status: null,
  async request(path, opts) {
    this.calls.push({ path, opts });
    if (path === '/v1/entitlement/verify') return { ownerId: 'owner_abcdefgh', deviceToken: 'stub.token', active: true, expiresAt: null };
    if (path.startsWith('/v1/connect/status')) return this.status;
    if (path === '/v1/connections') return { connections: this.status ? [this.status] : [] };
    throw new Error('unexpected ' + path);
  }
});

const PUBLIC = {
  ref: '0123456789abcdef_fedcba9876543210', status: 'LN', institutionId: 'IT:Mock ASPSP', institutionName: 'Mock ASPSP', institutionLogo: 'https://x/l.png',
  accounts: [{ id: 'acc_1', ibanTail: '3456', currency: 'USD', name: 'Conto' }, { id: 'acc_2', ibanTail: '', currency: 'EUR', name: 'Ella Virtanen' }],
  historyDays: 90, validityDays: 90, createdAt: '2026-09-07T10:00:00.000Z', linkedAt: '2026-09-07T10:01:00.000Z', expiresAt: '2026-12-06T10:00:00.000Z', lastError: null
};

const boot = (opts = {}) => {
  global.window = {
    // v1.15 (A-04): Bank Connect is BUILD-TIME off for the first store
    // release. These suites exercise the feature itself, so they turn it
    // on explicitly — the shipped default is covered by
    // tests/unit/bankConnectHidden.test.js.
    __STACKD_BANK_CONNECT__: true,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: memStorage(),
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#bank-connect' },
    __STACKD_BROKER_STUB__: opts.stub
  };
  global.localStorage = global.window.localStorage;
  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  executeFile('router.js');
  executeFile('export.js');
  executeFile('import.js');
  executeFile('bank-connect.js');
  global.window.Store.init();
  global.window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
  return global.window;
};

const state = () => global.window.Store.getState();

describe('Bank Connect B3 (v1.07)', () => {
  describe('normalize (Enable Banking → statement)', () => {
    beforeEach(() => boot());

    it('keeps booked rows only, derives type/description/bankRef, and picks the closing balance by type', () => {
      const BC = window.BankConnect;
      const tx = { transactions: [
        { entry_reference: 'e1', booking_date: '2026-08-20', status: 'BOOK', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '45.90', currency: 'EUR' }, creditor: { name: 'SUPERMERCATO ROSSI' }, remittance_information: ['Card purchase', '1234'] },
        { transaction_id: 't2', booking_date: '2026-08-27', status: 'BOOK', credit_debit_indicator: 'CRDT', transaction_amount: { amount: '1850.00', currency: 'EUR' }, debtor: { name: 'ACME SPA' } },
        { booking_date: '2026-09-06', status: 'PDNG', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '9.99', currency: 'EUR' } },
        { value_date: '2026-09-01', transaction_amount: { amount: '-12.50', currency: 'EUR' }, bank_transaction_code: { description: 'Fee' } }
      ] };
      const bal = { balances: [
        { balance_amount: { amount: '87.83', currency: 'EUR' }, balance_type: 'ITAV', reference_date: null },
        { balance_amount: { amount: '66.96', currency: 'EUR' }, balance_type: 'CLBD', reference_date: '2026-09-06' }
      ] };
      const st = BC.normalize(tx, bal, null);
      expect(st.format).toBe('connect');
      expect(st.currency).toBe('EUR');
      expect(st.openingBalance).toBeNull();
      expect(st.closingBalance).toEqual({ amount: 66.96, date: '2026-09-06' });
      expect(st.entries).toEqual([
        { date: '2026-08-20', description: 'SUPERMERCATO ROSSI — Card purchase 1234', type: 'expense', amount: 45.9, bankRef: 'e1' },
        { date: '2026-08-27', description: 'ACME SPA', type: 'income', amount: 1850, bankRef: 't2' },
        { date: '2026-09-01', description: 'Fee', type: 'expense', amount: 12.5, bankRef: '' }
      ]);
    });

    it('feeds the statement pipeline: entries become importKey-stamped transactions', () => {
      const BC = window.BankConnect;
      const st = BC.normalize({ transactions: [{ entry_reference: 'e1', booking_date: '2026-08-20', status: 'BOOK', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '45.90', currency: 'USD' }, creditor: { name: 'X' } }] }, { balances: [] }, 'USD');
      const res = window.StackdImport.buildStatementTransactions(st, state().accounts[0].id);
      expect(res.stats).toMatchObject({ total: 1, ok: 1, duplicates: 0, errors: 0 });
      expect(res.items[0].tx).toMatchObject({ type: 'expense', amount: 45.9, date: '2026-08-20', comment: 'X' });
      expect(res.items[0].tx.importKey.startsWith('ref:')).toBe(true);
    });

    it('falls back to an ITAV balance and the given currency when nothing better exists', () => {
      const st = window.BankConnect.normalize({ transactions: [] }, { balances: [{ balance_amount: { amount: '87.83', currency: 'EUR' }, balance_type: 'ITAV' }] }, 'EUR');
      expect(st.closingBalance.amount).toBe(87.83);
      expect(st.closingBalance.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(st.currency).toBe('EUR');
      expect(window.BankConnect.normalize(null, null, null)).toEqual({ format: 'connect', currency: null, entries: [], openingBalance: null, closingBalance: null });
    });
  });

  describe('fetchWindow (D-C8)', () => {
    const NOW = Date.parse('2026-09-07T12:00:00Z');
    let accId;
    beforeEach(() => { boot(); accId = state().accounts[0].id; });

    it('first fetch: historyDays back, clamped to the institution limit', () => {
      const BC = window.BankConnect;
      expect(BC.fetchWindow(state(), { historyLimitDays: 365 }, accId, NOW)).toEqual({ dateFrom: '2026-06-09', dateTo: '2026-09-07', overrode: false });
      expect(BC.fetchWindow(state(), { historyLimitDays: 30 }, accId, NOW).dateFrom).toBe('2026-08-08');
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { historyDays: 0 }); // "Maximum"
      expect(BC.fetchWindow(state(), { historyLimitDays: 365 }, accId, NOW).dateFrom).toBe('2025-09-07');
    });

    it('never starts before the day after the account\'s newest imported row', () => {
      window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: [{ type: 'expense', amount: 5, accountId: accId, categoryId: '', date: '2026-08-30', comment: 'x', importKey: 'ref:x' }] });
      expect(window.BankConnect.fetchWindow(state(), { historyLimitDays: 365 }, accId, NOW).dateFrom).toBe('2026-08-31');
    });

    it('a one-shot importFrom override wins; later fetches re-read a 7-day overlap', () => {
      const BC = window.BankConnect;
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { importFrom: '2026-01-15' });
      expect(BC.fetchWindow(state(), { historyLimitDays: 365 }, accId, NOW)).toMatchObject({ dateFrom: '2026-01-15', overrode: true });
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { importFrom: null });
      expect(BC.fetchWindow(state(), { historyLimitDays: 365, lastFetchAt: '2026-09-01T08:00:00.000Z' }, accId, NOW).dateFrom).toBe('2026-08-25');
      expect(BC.fetchWindow(state(), { historyLimitDays: 365, lastFetchAt: '2026-09-20T08:00:00.000Z' }, accId, NOW).dateFrom).toBe('2026-09-07'); // clock skew: never in the future
    });
  });

  describe('return leg + device identity', () => {
    it('parses the App Link and the custom-scheme return, ignores anything else', () => {
      boot();
      const BC = window.BankConnect;
      expect(BC.parseReturnUrl('stackd://connect/return?ref=0123456789abcdef_fedcba9876543210')).toBe('0123456789abcdef_fedcba9876543210');
      expect(BC.parseReturnUrl('https://api-staging.stackdplatform.com/v1/connect/return?state=0123456789abcdef_fedcba9876543210&code=x')).toBe('0123456789abcdef_fedcba9876543210');
      expect(BC.parseReturnUrl('https://api-staging.stackdplatform.com/v1/connect/return?ref=req_e2e')).toBe('req_e2e');
      expect(BC.parseReturnUrl('stackd://something/else?ref=abc')).toBeNull();
      expect(BC.parseReturnUrl('https://example.com/?ref=abc')).toBeNull();
      expect(BC.parseReturnUrl('')).toBeNull();
    });

    it('ensureDevice mints once, keeps the token OUTSIDE stackd_v1_, and caches the entitlement', async () => {
      const stub = makeStub();
      boot({ stub });
      const BC = window.BankConnect;
      expect(await BC.ensureDevice()).toBe('stub.token');
      expect(await BC.ensureDevice()).toBe('stub.token');
      expect(stub.calls.filter(c => c.path === '/v1/entitlement/verify')).toHaveLength(1);
      expect(window.localStorage.getItem('stackd_device_token')).toBe('stub.token');
      expect([...window.localStorage._m.keys()].filter(k => k.startsWith('stackd_v1_')).some(k => window.localStorage.getItem(k).includes('stub.token'))).toBe(false);
      expect(state().bankConnect.ownerId).toBe('owner_abcdefgh');
      expect(state().bankConnect.entitlement.active).toBe(true);
    });

    it('resumeConnection records a linked connection and routes to mapping; a failed leg clears the pending ref', async () => {
      const stub = makeStub();
      const w = boot({ stub });
      w.Router.navigate = vi.fn();
      w.Components.BankConnectErrorModal.show = vi.fn();
      w.Components.BankWaitingModal.hide = vi.fn();
      const BC = w.BankConnect;
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { pendingRef: PUBLIC.ref, pendingInstitution: { id: 'x' } });
      stub.status = PUBLIC;
      expect(await BC.handleReturn('stackd://connect/return?ref=' + PUBLIC.ref)).toBe(true);
      const conn = state().bankConnections[0];
      expect(conn).toMatchObject({ ref: PUBLIC.ref, institutionName: 'Mock ASPSP', logo: 'https://x/l.png', status: 'LN', historyLimitDays: 90, expiresAt: PUBLIC.expiresAt });
      expect(conn.accounts).toEqual([
        { bankAccountId: 'acc_1', stackdAccountId: null, ibanTail: '3456', currency: 'USD', name: 'Conto' },
        { bankAccountId: 'acc_2', stackdAccountId: null, ibanTail: '', currency: 'EUR', name: 'Ella Virtanen' }
      ]);
      expect(state().bankConnect.pendingRef).toBeNull();
      expect(w.Router.navigate).toHaveBeenCalledWith('#bank-connect-map?ref=' + PUBLIC.ref);

      // A mapping survives a re-record from the broker list.
      w.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: PUBLIC.ref, accounts: conn.accounts.map((a, i) => (i === 0 ? { ...a, stackdAccountId: state().accounts[0].id } : a)) });
      BC.recordConnection(PUBLIC);
      expect(state().bankConnections[0].accounts[0].stackdAccountId).toBe(state().accounts[0].id);

      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { pendingRef: 'other_ref' });
      stub.status = { ...PUBLIC, ref: 'other_ref', status: 'UA' };
      expect(await BC.resumeConnection('other_ref')).toBe(false);
      expect(state().bankConnect.pendingRef).toBeNull();
      expect(w.Components.BankConnectErrorModal.show).toHaveBeenCalledWith(expect.objectContaining({ status: 'UA' }));
      expect(state().bankConnections).toHaveLength(1);
    });

    it('maps fetch failures to the right user-facing key', () => {
      boot();
      const BC = window.BankConnect;
      expect(BC.fetchErrorKey({ code: 'account_rate_limited' })).toBe('bank.rateLimited');
      expect(BC.fetchErrorKey({ code: 'consent_expired' })).toBe('bank.consentExpiredMsg');
      expect(BC.fetchErrorKey(new Error('boom'))).toBe('bank.fetchError');
    });
  });

  describe('BankMapView', () => {
    it('defaults each bank account to a same-currency Stack\'d account, else "Create", and offers Skip', () => {
      const w = boot({ stub: makeStub() });
      w.Router.getParams = () => ({ ref: PUBLIC.ref });
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      w.BankConnect.recordConnection(PUBLIC);
      const html = w.Views.BankMapView.render(state());
      const mainId = state().accounts[0].id;
      expect(html).toContain('id="bank-map"');
      expect(html).toContain('•••• 3456');
      expect(html).toContain('Ella Virtanen'); // no IBAN → the account name
      expect(html).toContain(`<option value="${mainId}" selected>Main</option>`);
      expect(html).toContain('<option value="new" selected>Create “Mock ASPSP · Ella Virtanen”</option>');
      expect(html).toContain('Skip this account');
      expect(html).toContain('id="bank-map-import"');
    });

    it('renders the guard card for an unknown ref', () => {
      const w = boot({ stub: makeStub() });
      w.Router.getParams = () => ({ ref: 'nope' });
      expect(w.Views.BankMapView.render(state())).toContain('id="bank-map-none"');
    });

    it('hub cards show Import for mapped accounts and Link for unmapped ones', () => {
      const w = boot({ stub: makeStub() });
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, entitlement: { active: true } });
      const rec = w.BankConnect.recordConnection(PUBLIC);
      w.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: rec.ref, accounts: rec.accounts.map((a, i) => (i === 0 ? { ...a, stackdAccountId: state().accounts[0].id } : a)) });
      const html = w.Views.BankConnectHubView.render(state());
      expect(html).toContain('class="btn btn-secondary bank-acc-import"');
      expect(html).toContain('class="btn btn-secondary bank-acc-link"');
      expect(html).toContain('Not linked');
    });
  });
});
