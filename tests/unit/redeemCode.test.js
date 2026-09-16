import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.18 — store-native promotional code redemption. Codes are redeemed in
// APPLE's or GOOGLE's own UI: Apple's StoreKit sheet over the app, the Play
// Store's redeem page on Android. There is deliberately no code field of our
// own (it would bypass store billing and ship extractable in the inlined
// bundle), which the last test in this file guards.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

// cordova-plugin-purchase v13, including the Apple adapter's redemption sheet.
const fakeCdv = (o = {}) => {
  const handlers = { productUpdated: [], approved: [] };
  const products = new Map();
  const adapter = { sheets: 0, async presentCodeRedemptionSheet() { adapter.sheets += 1; } };
  if (o.noSheet) delete adapter.presentCodeRedemptionSheet;
  return {
    ProductType: { PAID_SUBSCRIPTION: 'paid subscription', NON_CONSUMABLE: 'non consumable' },
    Platform: { GOOGLE_PLAY: 'android-playstore', APPLE_APPSTORE: 'ios-appstore' },
    adapter,
    store: {
      registered: [],
      register(list) { this.registered.push(...list); },
      when() {
        const chain = { productUpdated(cb) { handlers.productUpdated.push(cb); return chain; }, approved(cb) { handlers.approved.push(cb); return chain; }, finished() { return chain; } };
        return chain;
      },
      error() {},
      async initialize() {
        products.set('stackd_pro', { id: 'stackd_pro', owned: false, pricing: { price: '€4.99' }, getOffer: () => ({ id: 'pro-offer' }) });
        handlers.productUpdated.forEach(cb => cb());
        return [];
      },
      get(id) { return products.get(id) || null; },
      getAdapter: o.noAdapter ? undefined : () => adapter,
      async order() { return undefined; },
      async restorePurchases() { return undefined; }
    }
  };
};

const boot = (o = {}) => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  const native = o.platform === 'appstore' || o.platform === 'play';
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: memStorage(),
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#purchases', origin: 'http://localhost:3000' },
    requestAnimationFrame: (cb) => cb(),
    alert: vi.fn(),
    open: vi.fn(),
    __STACKD_BANK_CONNECT__: o.bank === true,
    __STACKD_BROKER_URL__: 'https://broker.test',
    Capacitor: native ? { isNativePlatform: () => true, getPlatform: () => (o.platform === 'appstore' ? 'ios' : 'android'), Plugins: {} } : undefined,
    CdvPurchase: native ? fakeCdv(o) : undefined,
    __STACKD_BROKER_STUB__: o.stub
  };
  global.localStorage = global.window.localStorage;
  global.alert = global.window.alert;
  global.requestAnimationFrame = global.window.requestAnimationFrame;
  global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'unexpected' }) }));
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js', 'router.js', 'export.js', 'import.js', 'bank-connect.js', 'pro.js'].forEach(executeFile);
  global.window.Store.init();
  return global.window;
};

const renderPurchases = (w) => {
  const root = document.getElementById('router-view');
  const s = w.Store.getState();
  root.innerHTML = w.Views.PurchasesView.render(s);
  w.Views.PurchasesView.attachEvents(root, s);
  return root;
};
const flush = () => new Promise(r => setTimeout(r, 0));

describe('Store-native code redemption (v1.18)', () => {
  describe('availability', () => {
    it('is offered on both stores, and never on the web build', () => {
      expect(boot({ platform: 'appstore' }).BankConnect.canRedeemCode()).toBe(true);
      expect(boot({ platform: 'play' }).BankConnect.canRedeemCode()).toBe(true);
      const web = boot();
      expect(web.BankConnect.platform()).toBe('web');
      expect(web.BankConnect.canRedeemCode()).toBe(false);
    });

    it('is offered whatever the Bank Connect gate says, because Pro is sold either way', () => {
      expect(boot({ platform: 'play', bank: false }).BankConnect.canRedeemCode()).toBe(true);
      expect(boot({ platform: 'play', bank: true }).BankConnect.canRedeemCode()).toBe(true);
    });
  });

  describe('opening the right flow', () => {
    it('iOS: presents StoreKit\'s own sheet over the app', async () => {
      const w = boot({ platform: 'appstore' });
      expect(await w.BankConnect.redeemCode()).toEqual({ opened: 'sheet' });
      expect(w.CdvPurchase.adapter.sheets).toBe(1);
      expect(w.open).not.toHaveBeenCalled(); // nothing external on iOS
    });

    it('Android: opens the Play Store redeem page, since there is no in-app sheet', async () => {
      const w = boot({ platform: 'play' });
      const opened = [];
      w.Views._openExternal = (url) => opened.push(url);
      expect(await w.BankConnect.redeemCode()).toEqual({ opened: 'external' });
      expect(opened).toEqual(['https://play.google.com/redeem']);
      expect(w.CdvPurchase.adapter.sheets).toBe(0);
    });

    it('refuses cleanly with no store, and when the plugin cannot present the sheet', async () => {
      await expect(boot().BankConnect.redeemCode()).rejects.toThrow('redeem_unavailable');
      await expect(boot({ platform: 'appstore', noSheet: true }).BankConnect.redeemCode()).rejects.toThrow('redeem_unavailable');
      await expect(boot({ platform: 'appstore', noAdapter: true }).BankConnect.redeemCode()).rejects.toThrow('redeem_unavailable');
    });

    it('the e2e stub takes over when present', async () => {
      const stub = { redeemed: 0, async redeem() { this.redeemed += 1; return { opened: 'stub' }; }, async request() { throw new Error('no'); } };
      const w = boot({ stub });
      expect(w.BankConnect.canRedeemCode()).toBe(true); // available even on the web build under the stub
      expect(await w.BankConnect.redeemCode()).toEqual({ opened: 'stub' });
      expect(stub.redeemed).toBe(1);
    });
  });

  describe('the Purchases screen', () => {
    it('shows the button on a store build and hides it on the web build', () => {
      expect(renderPurchases(boot({ platform: 'play' })).querySelector('#redeem-code-btn')).not.toBeNull();
      expect(renderPurchases(boot()).querySelector('#redeem-code-btn')).toBeNull();
    });

    it('clicking it opens the store flow, then re-reads ownership because neither store says what was redeemed', async () => {
      const w = boot({ platform: 'play' });
      w.Views._openExternal = vi.fn();
      const root = renderPurchases(w);
      w.Pro.restore = vi.fn(async () => null);
      root.querySelector('#redeem-code-btn').click();
      await flush();
      expect(w.Views._openExternal).toHaveBeenCalledWith('https://play.google.com/redeem');
      expect(w.Pro.restore).toHaveBeenCalled();
      expect(w.alert).not.toHaveBeenCalled();
    });

    it('a Pro owner is not re-queried, and a failure to open is reported rather than swallowed', async () => {
      const w = boot({ platform: 'play' });
      w.Store.dispatch('SET_PRO', { active: true, productId: 'stackd_pro' });
      const root = renderPurchases(w);
      w.Pro.restore = vi.fn(async () => null);
      w.BankConnect.redeemCode = vi.fn(async () => ({ opened: 'external' }));
      root.querySelector('#redeem-code-btn').click();
      await flush();
      expect(w.Pro.restore).not.toHaveBeenCalled(); // already owned

      const w2 = boot({ platform: 'play' });
      const root2 = renderPurchases(w2);
      w2.BankConnect.redeemCode = vi.fn(async () => { throw new Error('redeem_unavailable'); });
      const btn = root2.querySelector('#redeem-code-btn');
      btn.click();
      await flush();
      expect(w2.alert).toHaveBeenCalledWith('Couldn’t open the redemption page. Please try again.');
      expect(btn.disabled).toBe(false); // recoverable, the user can retry
    });

    // The whole point of the feature: no code ever reaches our own code path.
    it('never renders a code field of its own — redemption belongs to the store', () => {
      const root = renderPurchases(boot({ platform: 'appstore', bank: true }));
      const card = root.querySelector('#redeem-card');
      expect(card).not.toBeNull();
      expect(card.querySelectorAll('input, textarea, form')).toHaveLength(0);
      expect(root.querySelectorAll('input, textarea')).toHaveLength(0);
      const src = readFileSync(resolve(__dirname, '../../src/bank-connect.js'), 'utf8');
      expect(src).not.toMatch(/PROMO_CODE|promoCode|validateCode/);
    });
  });
});
