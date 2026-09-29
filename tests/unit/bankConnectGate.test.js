import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The build-time gate on Bank Connect, pinned in BOTH directions.
//
// v1.15 (launch-plan A-04 / D1) shipped it OFF, because a feature that cannot
// work must not be visible. v1.18 turns it ON in the committed source: the
// feature is developed openly again, and the gate's job is now to be the
// deliberate switch rather than a permanent lid.
//
// What did NOT change is that flipping it must stay deliberate, so the first
// block asserts the committed default and fails if it moves. The second block
// keeps every absence assertion from v1.15, driven by the explicit kill switch
// (__STACKD_BANK_CONNECT__ = false) — that switch is how a release goes out
// without the feature while Enable Banking production access is unsigned, so
// it has to keep removing every trace: no Settings row, no routes, no
// subscription products, not even a "coming soon" card (Apple 2.3.1).
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

describe('Bank Connect build gate', () => {
  describe('the committed default (ON since v1.18)', () => {
    beforeEach(() => { boot(); });

    it('is on in the committed source — moving it either way is a deliberate act', () => {
      expect(global.window.BankConnect.FEATURE_ENABLED).toBe(true);
      expect(global.window.BankConnect.featureEnabled()).toBe(true);
    });

    it('is available on native', () => {
      expect(global.window.BankConnect.isNative()).toBe(true);
      expect(global.window.BankConnect.isAvailable()).toBe(true);
    });

    it('still reaches the network only after the user opts in — the gate is not consent', () => {
      const w = global.window;
      expect(w.BankConnect.isEnabled(w.Store.getState())).toBe(false); // toggle off by default
      expect(w.BankConnect.refreshOnOpen()).toBeNull();
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      expect(w.BankConnect.isEnabled(w.Store.getState())).toBe(true);
    });

    it('offers the feature on the surfaces a user would look for it', async () => {
      const w = global.window;
      expect(w.Views.OthersView.render(w.Store.getState())).toContain('btn-open-bank-connect');
      expect(w.Views.PurchasesView.render(w.Store.getState())).toContain('purchases-tabs');
      await w.Pro.loadPrice();
      expect(w.CdvPurchase.store.registered.map(r => r.id).sort())
        .toEqual(['stackd_bank_connect_monthly', 'stackd_bank_connect_yearly', 'stackd_pro']);
    });
  });

  // How a release goes out WITHOUT the feature while Enable Banking
  // production access is unsigned. It has to leave nothing for a reviewer.
  describe('the kill switch removes every trace', () => {
    it('reports itself unavailable even on native, where it would otherwise run', () => {
      const w = boot({ bankOn: false });
      expect(w.BankConnect.isNative()).toBe(true);
      expect(w.BankConnect.isAvailable()).toBe(false);
    });

    it('stays disabled even if a stored opt-in says otherwise (older build, restored backup)', () => {
      const w = boot({ bankOn: false });
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      expect(w.Store.getState().bankConnect.enabled).toBe(true); // the slice is untouched
      expect(w.BankConnect.isEnabled(w.Store.getState())).toBe(false); // the gate still wins
    });

    it('does no work at boot, so nothing reaches the network', () => {
      expect(boot({ bankOn: false }).BankConnect.refreshOnOpen()).toBeNull();
    });

    it('registers Stack\'d Pro ALONE — no subscription products in the store session', async () => {
      const w = boot({ bankOn: false });
      await w.Pro.loadPrice();
      expect(w.CdvPurchase.store.registered.map(r => r.id)).toEqual(['stackd_pro']);
    });

    it('Settings has no Online banking row, but keeps the file import', () => {
      const w = boot({ bankOn: false });
      const html = w.Views.OthersView.render(w.Store.getState());
      expect(html).not.toContain('btn-open-bank-connect');
      expect(html).not.toContain('bank-settings-subtitle');
      // The section itself stays — statement import lives in it and is free.
      expect(html).toContain('btn-import-csv');
    });

    it('the purchases screen sells one product, with no subscriptions tab', () => {
      const w = boot({ bankOn: false });
      const html = w.Views.PurchasesView.render(w.Store.getState());
      expect(html).toContain('pro-card');
      expect(html).not.toContain('purchases-tabs');
      expect(html).not.toContain('bank-sub-card');
      expect(html).not.toContain('bank-subscribe-btn');
    });

    it('?tab=subscriptions cannot reach the subscription card either', () => {
      const w = boot({ bankOn: false });
      w.Router.navigate('#purchases?tab=subscriptions');
      const html = w.Views.PurchasesView.render(w.Store.getState());
      expect(html).not.toContain('bank-sub-card');
      expect(html).toContain('pro-card');
    });

    it('emits no Bank Connect insight cards', () => {
      const w = boot({ bankOn: false });
      w.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true });
      const cards = w.Insights && typeof w.Insights.build === 'function'
        ? w.Insights.build(w.Store.getState())
        : [];
      expect(cards.filter(c => c && /bank/i.test(String(c.id || ''))).length).toBe(0);
    });
  });
});
