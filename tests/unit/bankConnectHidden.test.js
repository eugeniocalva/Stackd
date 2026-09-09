import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.15, docs/launch-plan.md A-04 (decision D1): the first store release ships
// with Bank Connect switched OFF at build time, because Enable Banking
// production access needs a signed contract and company KYB and a feature that
// cannot work must not be visible. Apple 2.3.1 treats dormant functionality as
// a rejection reason, so "hidden" has to mean genuinely absent — no Settings
// row, no routes, no subscription products, not even a "coming soon" card.
//
// Every other bank suite sets __STACKD_BANK_CONNECT__ = true because it tests
// the feature. THIS one is the only place that asserts the shipped default, so
// if someone flips FEATURE_ENABLED without meaning to, it fails here.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const makeIap = () => {
  const store = {
    registered: [],
    register(products) { this.registered.push(...[].concat(products)); },
    when() { return { productUpdated: () => ({ approved: () => ({}) }) }; },
    error() {},
    initialize: async () => {},
    get: () => null,
    order: async () => null,
    restorePurchases: async () => {}
  };
  return { store, ProductType: { PAID_SUBSCRIPTION: 'paid subscription', NON_CONSUMABLE: 'non consumable' }, Platform: { GOOGLE_PLAY: 'android-playstore', APPLE_APPSTORE: 'ios-appstore' } };
};

const boot = ({ bankOn = undefined, native = true } = {}) => {
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#settings', origin: 'https://localhost' },
    CdvPurchase: makeIap()
  };
  if (bankOn !== undefined) global.window.__STACKD_BANK_CONNECT__ = bankOn;
  if (native) global.window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
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
  executeFile('pro.js');

  global.window.Store.init();
  return global.window;
};

describe('Bank Connect hidden at launch (v1.15, A-04)', () => {
  describe('the shipped default', () => {
    beforeEach(() => { boot(); });

    it('is off in the committed source — flipping it is a deliberate act', () => {
      expect(global.window.BankConnect.FEATURE_ENABLED).toBe(false);
      expect(global.window.BankConnect.featureEnabled()).toBe(false);
    });

    it('reports itself unavailable even on native, where it would otherwise run', () => {
      expect(global.window.BankConnect.isNative()).toBe(true);
      expect(global.window.BankConnect.isAvailable()).toBe(false);
    });

    it('stays disabled even if a stored opt-in says otherwise (older build, restored backup)', () => {
      const w = global.window;
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      expect(w.Store.getState().bankConnect.enabled).toBe(true); // the slice is untouched
      expect(w.BankConnect.isEnabled(w.Store.getState())).toBe(false); // the gate still wins
    });

    it('does no work at boot, so nothing reaches the network', () => {
      expect(global.window.BankConnect.refreshOnOpen()).toBeNull();
    });
  });

  describe('the store session', () => {
    it('registers Stack\'d Pro ALONE — the subscriptions are not in the console yet', async () => {
      const w = boot();
      await w.Pro.loadPrice();
      expect(w.CdvPurchase.store.registered.map(r => r.id)).toEqual(['stackd_pro']);
    });

    it('registers all three once the feature ships', async () => {
      const w = boot({ bankOn: true });
      await w.Pro.loadPrice();
      expect(w.CdvPurchase.store.registered.map(r => r.id).sort())
        .toEqual(['stackd_bank_connect_monthly', 'stackd_bank_connect_yearly', 'stackd_pro']);
    });
  });

  describe('the surfaces a reviewer would find', () => {
    it('Settings has no Online banking row, but keeps the file import', () => {
      const w = boot();
      const html = w.Views.OthersView.render(w.Store.getState());
      expect(html).not.toContain('btn-open-bank-connect');
      expect(html).not.toContain('bank-settings-subtitle');
      // The section itself stays — statement import lives in it and is free.
      expect(html).toContain('btn-import-csv');
    });

    it('the purchases screen sells one product, with no subscriptions tab', () => {
      const w = boot();
      const html = w.Views.PurchasesView.render(w.Store.getState());
      expect(html).toContain('pro-card');
      expect(html).not.toContain('purchases-tabs');
      expect(html).not.toContain('bank-sub-card');
      expect(html).not.toContain('bank-subscribe-btn');
    });

    it('?tab=subscriptions cannot reach the subscription card either', () => {
      const w = boot();
      w.Router.navigate('#purchases?tab=subscriptions');
      const html = w.Views.PurchasesView.render(w.Store.getState());
      expect(html).not.toContain('bank-sub-card');
      expect(html).toContain('pro-card');
    });

    it('both tabs come back when the feature ships', () => {
      const w = boot({ bankOn: true });
      const html = w.Views.PurchasesView.render(w.Store.getState());
      expect(html).toContain('purchases-tabs');
    });

    it('Settings gets the row back when the feature ships', () => {
      const w = boot({ bankOn: true });
      expect(w.Views.OthersView.render(w.Store.getState())).toContain('btn-open-bank-connect');
    });
  });

  describe('insights', () => {
    it('emits no Bank Connect cards', () => {
      const w = boot();
      const state = w.Store.getState();
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      const cards = w.Insights && typeof w.Insights.build === 'function'
        ? w.Insights.build(w.Store.getState())
        : [];
      expect(cards.filter(c => c && /bank/i.test(String(c.id || ''))).length).toBe(0);
      expect(state).toBeTruthy();
    });
  });
});
