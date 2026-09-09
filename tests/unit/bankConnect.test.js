import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.05 Bank Connect, phase B2 (docs/bank-connect-ux-plan.md): the store
// slices, the BankConnect helpers and the hub / picker / settings-row
// rendering. The connect return leg + fetch are B3 and live elsewhere.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const RAW_INSTITUTIONS = [
  { id: 'TEST_BANK', name: 'Test Bank', logo: 'https://cdn.example/test.png', transaction_total_days: '730', max_access_valid_for_days: '180' },
  { id: 'OTHER', name: 'Other Savings', transaction_total_days: 90, max_access_valid_for_days: 90 }
];

const makeStub = () => ({
  calls: [],
  async request(path, opts) {
    this.calls.push({ path, opts });
    if (path.startsWith('/v1/institutions')) return RAW_INSTITUTIONS;
    if (path === '/v1/entitlement/verify') return { ownerId: 'owner_abcdefgh', deviceToken: 'stub.token', active: true, expiresAt: null }; // v1.07 B3: startConnect mints the device first
    if (path === '/v1/connect/start') return { ref: 'req_1', bankRedirectUrl: 'https://bank.example/sca' };
    throw new Error('unexpected ' + path);
  },
  async openSca(url) { this.opened = url; }
});

const boot = (opts = {}) => {
  global.window = {
    // v1.15 (A-04): Bank Connect is BUILD-TIME off for the first store
    // release. These suites exercise the feature itself, so they turn it
    // on explicitly — the shipped default is covered by
    // tests/unit/bankConnectHidden.test.js.
    __STACKD_BANK_CONNECT__: true,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#bank-connect' },
    __STACKD_BROKER_STUB__: opts.stub
  };
  if (opts.native) global.window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  global.localStorage = global.window.localStorage;

  executeFile('db.js');
  executeFile('i18n.js');
  executeFile('i18n/en.js');
  executeFile('loan-engine.js');
  executeFile('store.js');
  executeFile('components.js');
  executeFile('views.js');
  executeFile('router.js');
  executeFile('bank-connect.js');

  global.window.Store.init();
  return global.window;
};

const state = () => global.window.Store.getState();
const savedKeys = () => global.window.localStorage.setItem.mock.calls.map(c => c[0]);

describe('Bank Connect (v1.05 B2)', () => {
  describe('store slices', () => {
    beforeEach(() => boot());

    it('boots with the settled defaults: toggle off, 90-day history, 180-day consent, no entitlement', () => {
      const p = state().bankConnect;
      expect(p.enabled).toBe(false);
      expect(p.consentAt).toBeNull();
      expect(p.historyDays).toBe(90);
      expect(p.validityDays).toBe(180);
      expect(p.entitlement).toEqual({ active: false, expiresAt: null });
      expect(state().bankConnections).toEqual([]);
    });

    it('SET_BANK_CONNECT_PREFS merges shallowly, deep-merges entitlement and persists the slice', () => {
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, entitlement: { active: true } });
      expect(state().bankConnect.enabled).toBe(true);
      expect(state().bankConnect.entitlement).toEqual({ active: true, expiresAt: null });
      expect(state().bankConnect.historyDays).toBe(90); // untouched

      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: { expiresAt: '2030-01-01T00:00:00.000Z' } });
      expect(state().bankConnect.entitlement.active).toBe(true); // kept across the partial update
      expect(savedKeys()).toContain('stackd_v1_bankConnect');
    });

    it('ADD / UPDATE / REMOVE_BANK_CONNECTION keep one record per ref and persist', () => {
      window.Store.dispatch('ADD_BANK_CONNECTION', { ref: 'req_1', institutionId: 'TEST_BANK', institutionName: 'Test Bank' });
      window.Store.dispatch('ADD_BANK_CONNECTION', { ref: 'req_1', institutionId: 'TEST_BANK', institutionName: 'Test Bank (again)' });
      expect(state().bankConnections).toHaveLength(1);
      expect(state().bankConnections[0].institutionName).toBe('Test Bank (again)');
      expect(state().bankConnections[0].status).toBe('LN');

      window.Store.dispatch('UPDATE_BANK_CONNECTION', { ref: 'req_1', lastFetchAt: '2026-09-06T10:00:00.000Z' });
      expect(state().bankConnections[0].lastFetchAt).toBe('2026-09-06T10:00:00.000Z');
      expect(state().bankConnections[0].institutionId).toBe('TEST_BANK');

      window.Store.dispatch('REMOVE_BANK_CONNECTION', 'req_1');
      expect(state().bankConnections).toEqual([]);
      expect(savedKeys()).toContain('stackd_v1_bankConnections');
    });

    it('RESET_APP returns both slices to defaults', () => {
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, historyDays: 365 });
      window.Store.dispatch('ADD_BANK_CONNECTION', { ref: 'req_1', institutionId: 'TEST_BANK' });
      window.Store.dispatch('RESET_APP');
      expect(state().bankConnect.enabled).toBe(false);
      expect(state().bankConnect.historyDays).toBe(90);
      expect(state().bankConnections).toEqual([]);
    });
  });

  describe('BankConnect helpers', () => {
    let stub;
    beforeEach(() => { stub = makeStub(); boot({ stub }); });

    it('is unavailable on the web build without the stub, available with it or on native', () => {
      expect(window.BankConnect.isAvailable()).toBe(true);
      boot();
      expect(window.BankConnect.isAvailable()).toBe(false);
      boot({ native: true });
      expect(window.BankConnect.isAvailable()).toBe(true);
    });

    it('entitlement() honours expiresAt — the cached gate never outlives the subscription', () => {
      const BC = window.BankConnect;
      expect(BC.entitlement(state()).active).toBe(false);
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: { active: true, expiresAt: '2000-01-01T00:00:00.000Z' } });
      expect(BC.entitlement(state()).active).toBe(false);
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: { active: true, expiresAt: '2999-01-01T00:00:00.000Z' } });
      expect(BC.entitlement(state()).active).toBe(true);
    });

    it('needsDisclosure() is true until consent is recorded for the CURRENT terms version', () => {
      const BC = window.BankConnect;
      expect(BC.needsDisclosure(state())).toBe(true);
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { consentAt: '2026-09-06T00:00:00.000Z', consentVersion: BC.termsVersion() });
      expect(BC.needsDisclosure(state())).toBe(false);
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { consentVersion: 'January 1, 2020' });
      expect(BC.needsDisclosure(state())).toBe(true);
    });

    it('agreementParams() clamps the prefs to the institution (D-C8)', () => {
      const BC = window.BankConnect;
      const small = { id: 'x', name: 'x', historyDays: 60, maxValidityDays: 90 };
      expect(BC.agreementParams(state(), small)).toEqual({ historyDays: 60, validityDays: 90 });
      const big = { id: 'y', name: 'y', historyDays: 730, maxValidityDays: 180 };
      expect(BC.agreementParams(state(), big)).toEqual({ historyDays: 90, validityDays: 180 });
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { historyDays: 0 }); // "Maximum"
      expect(BC.agreementParams(state(), big).historyDays).toBe(730);
    });

    it('listInstitutions() normalizes the GoCardless shape and caches per country', async () => {
      const BC = window.BankConnect;
      const list = await BC.listInstitutions('it');
      expect(list).toEqual([
        { id: 'TEST_BANK', name: 'Test Bank', logo: 'https://cdn.example/test.png', historyDays: 730, maxValidityDays: 180 },
        { id: 'OTHER', name: 'Other Savings', logo: null, historyDays: 90, maxValidityDays: 90 }
      ]);
      expect(stub.calls[0].path).toBe('/v1/institutions?country=IT');
      await BC.listInstitutions('IT');
      expect(stub.calls).toHaveLength(1);
    });

    it('startConnect() stores the pending ref before opening the bank page', async () => {
      const BC = window.BankConnect;
      const inst = { id: 'TEST_BANK', name: 'Test Bank', logo: null, historyDays: 730, maxValidityDays: 180 };
      await BC.startConnect(state(), inst, 'IT');
      expect(stub.calls.find(c => c.path === '/v1/connect/start').opts.body).toEqual({ country: 'IT', institutionId: 'TEST_BANK', historyDays: 90, validityDays: 180 });
      expect(state().bankConnect.pendingRef).toBe('req_1');
      expect(state().bankConnect.pendingInstitution.name).toBe('Test Bank');
      expect(stub.opened).toBe('https://bank.example/sca');
    });

    it('countryFromLocale() follows the language region and falls back to GB for en-US', () => {
      const BC = window.BankConnect;
      expect(BC.countryFromLocale()).toBe('GB');
      window.I18n.setLang('fr');
      expect(BC.countryFromLocale()).toBe('FR');
      window.I18n.setLang('it');
      expect(BC.countryFromLocale()).toBe('IT');
      window.I18n.setLang('en');
    });

    it('settingsSubtitle() reflects availability, the toggle, and the connection count', () => {
      const BC = window.BankConnect;
      expect(BC.settingsSubtitle(state())).toBe('Connect your bank and import your latest transactions automatically.');
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      expect(BC.settingsSubtitle(state())).toBe('No banks connected yet');
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: { active: true, expiresAt: null } });
      window.Store.dispatch('ADD_BANK_CONNECTION', { ref: 'a', institutionId: 'A', institutionName: 'A' });
      window.Store.dispatch('ADD_BANK_CONNECTION', { ref: 'b', institutionId: 'B', institutionName: 'B' });
      expect(BC.settingsSubtitle(state())).toBe('2 banks connected');
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: false });
      expect(BC.settingsSubtitle(state())).toBe('Paused'); // live connections, toggle off
      boot();
      expect(window.BankConnect.settingsSubtitle(state())).toBe('Available in the mobile app.');
    });

    it('connectionStatus() ranks paused > expired > subscription > expiring > active', () => {
      const BC = window.BankConnect;
      const soon = new Date(Date.now() + 5 * 86400000).toISOString();
      const far = new Date(Date.now() + 100 * 86400000).toISOString();
      const conn = { ref: 'a', expiresAt: far };
      expect(BC.connectionStatus(state(), conn)).toBe('paused');
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      expect(BC.connectionStatus(state(), { ref: 'a', status: 'EX' })).toBe('expired');
      expect(BC.connectionStatus(state(), conn)).toBe('subscription');
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { entitlement: { active: true } });
      expect(BC.connectionStatus(state(), { ref: 'a', expiresAt: soon })).toBe('expiring');
      expect(BC.connectionStatus(state(), conn)).toBe('active');
    });
  });

  describe('views', () => {
    it('web build without the stub: hub renders the mobile-only state and no CTA', () => {
      boot();
      const html = window.Views.BankConnectHubView.render(state());
      expect(html).toContain('id="bank-mobile-only"');
      expect(html).not.toContain('id="bank-add"');
      expect(html).toMatch(/id="bank-toggle"\s+disabled/);
    });

    it('with the stub: toggle off → explainer + disabled CTA; on → empty state + enabled CTA', () => {
      boot({ stub: makeStub() });
      let html = window.Views.BankConnectHubView.render(state());
      expect(html).toContain('id="bank-explainer"');
      expect(html).toContain('id="bank-add" style="width: 100%;" disabled');
      expect(html).toContain('Powered by Enable Banking');

      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      html = window.Views.BankConnectHubView.render(state());
      expect(html).toContain('id="bank-empty"');
      expect(html).toContain('id="bank-toggle" checked');
      expect(html).not.toContain('id="bank-add" style="width: 100%;" disabled');
      expect(html).toContain('Add a bank');
    });

    it('renders one card per connection with the mapped account and a status chip', () => {
      boot({ stub: makeStub() });
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main checking', openingBalance: 0, openingDate: '2020-01-01' });
      const accId = state().accounts[0].id;
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, entitlement: { active: true } });
      window.Store.dispatch('ADD_BANK_CONNECTION', {
        ref: 'req_1', institutionId: 'TEST_BANK', institutionName: 'Test Bank',
        accounts: [{ bankAccountId: 'acc-x', stackdAccountId: accId, ibanTail: '1234', currency: 'EUR' }],
        expiresAt: new Date(Date.now() + 100 * 86400000).toISOString()
      });
      const html = window.Views.BankConnectHubView.render(state());
      expect(html).toContain('data-ref="req_1"');
      expect(html).toContain('•••• 1234');
      expect(html).toContain('Main checking');
      expect(html).toContain('bank-chip-active');
      expect(html).toContain('Never synced');
      expect(html).toContain('Add another bank');
    });

    it('keeps the cards (with a Paused chip) when the toggle is off but connections exist', () => {
      boot({ stub: makeStub() });
      window.Store.dispatch('ADD_BANK_CONNECTION', { ref: 'r1', institutionId: 'X', institutionName: 'Bank X' });
      const html = window.Views.BankConnectHubView.render(state());
      expect(html).not.toContain('id="bank-explainer"');
      expect(html).toContain('data-ref="r1"');
      expect(html).toContain('bank-chip-paused');
      expect(html).toContain('id="bank-add" style="width: 100%;" disabled');
    });

    it('hides the add CTA at the per-owner cap', () => {
      boot({ stub: makeStub() });
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      for (let i = 0; i < window.BankConnect.MAX_CONNECTIONS; i++) {
        window.Store.dispatch('ADD_BANK_CONNECTION', { ref: 'r' + i, institutionId: 'X' + i, institutionName: 'Bank ' + i });
      }
      expect(window.Views.BankConnectHubView.render(state())).toMatch(/id="bank-add"[^>]*hidden/);
    });

    it('picker: guards until the toggle is on, then preselects the locale country', () => {
      boot({ stub: makeStub() });
      window.Views._BankShared.resetPicker();
      let html = window.Views.BankPickerView.render(state());
      expect(html).toContain('id="bank-picker-disabled"');
      expect(html).toContain('Turn on online banking to add a bank.');

      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      html = window.Views.BankPickerView.render(state());
      expect(html).toContain('<option value="GB" selected>');
      expect(html).toContain('id="bank-search"');
      expect(html).toContain('id="bank-connect-cta" style="width: 100%;" disabled');
    });

    it('picker list: filters by query, marks the selection, and offers file import when nothing matches', () => {
      boot({ stub: makeStub() });
      const S = window.Views._BankShared;
      const P = S.resetPicker();
      P.institutions = [
        { id: 'TEST_BANK', name: 'Test Bank', logo: null, historyDays: 730, maxValidityDays: 180 },
        { id: 'OTHER', name: 'Other Savings', logo: null, historyDays: 90, maxValidityDays: 90 }
      ];
      P.selectedId = 'OTHER';
      let html = S.renderInstList();
      expect(html).toContain('data-id="TEST_BANK"');
      expect(html).toContain('data-id="OTHER" role="button" tabindex="0" aria-pressed="true"');
      expect(html).toContain('Up to 730 days of history · consent 180 days');
      P.query = 'sav';
      html = S.renderInstList();
      expect(html).not.toContain('data-id="TEST_BANK"');
      expect(html).toContain('data-id="OTHER"');
      P.query = 'zzz';
      html = S.renderInstList();
      expect(html).toContain('id="bank-inst-empty"');
      expect(html).toContain('href="#settings"');
    });

    it('OthersView shows the Bank data section with the Online banking row above the file import', () => {
      boot({ stub: makeStub() });
      const html = window.Views.OthersView.render(state());
      expect(html).toContain('Bank data');
      expect(html).toContain('id="btn-open-bank-connect"');
      expect(html).toContain('id="bank-settings-subtitle"');
      expect(html).toContain('Connect your bank and import your latest transactions automatically.');
      expect(html.indexOf('btn-open-bank-connect')).toBeLessThan(html.indexOf('btn-import-csv'));
    });
  });
});
