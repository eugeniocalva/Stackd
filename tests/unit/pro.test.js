import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.13 Stack'd Pro (docs/pro-unlock.md): the one-time unlock — free-plan
// gates, the local entitlement slice, and the store adapter riding Bank
// Connect's cordova-plugin-purchase session (non-consumable, no broker).
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

// cordova-plugin-purchase v13 surface, with a non-consumable next to the plans.
const fakeCdv = () => {
  const handlers = { productUpdated: [], approved: [] };
  const products = new Map();
  const cdv = {
    ProductType: { PAID_SUBSCRIPTION: 'paid subscription', NON_CONSUMABLE: 'non consumable' },
    Platform: { GOOGLE_PLAY: 'android-playstore', APPLE_APPSTORE: 'ios-appstore' },
    store: {
      registered: [],
      orders: [],
      restored: 0,
      register(list) { this.registered.push(...list); },
      when() {
        const chain = {
          productUpdated(cb) { handlers.productUpdated.push(cb); return chain; },
          approved(cb) { handlers.approved.push(cb); return chain; },
          finished() { return chain; }
        };
        return chain;
      },
      error() {},
      async initialize() {
        products.set('stackd_bank_connect_monthly', { id: 'stackd_bank_connect_monthly', pricing: { price: '€2.99', currency: 'EUR', priceMicros: 2990000 }, getOffer: () => ({ id: 'm-offer' }) });
        products.set('stackd_bank_connect_yearly', { id: 'stackd_bank_connect_yearly', pricing: { price: '€29.99', currency: 'EUR', priceMicros: 29990000 }, getOffer: () => ({ id: 'y-offer' }) });
        products.set('stackd_pro', { id: 'stackd_pro', owned: false, pricing: { price: '€4.99', currency: 'EUR', priceMicros: 4990000 }, getOffer: () => ({ id: 'pro-offer', productId: 'stackd_pro' }) });
        handlers.productUpdated.forEach(cb => cb());
        return [];
      },
      get(id) { return products.get(id) || null; },
      async order(offer) { this.orders.push(offer); return undefined; },
      async restorePurchases() { this.restored += 1; if (this.ownsPro) products.get('stackd_pro').owned = true; return undefined; }
    },
    approve(tx) { handlers.approved.forEach(cb => cb(tx)); }
  };
  return cdv;
};

const boot = (opts) => {
  const o = opts || {};
  global.window = {
    // v1.15 (A-04): this suite covers the SHARED store session, so it needs
    // Bank Connect switched on. That Pro registers alone when the feature
    // is off is asserted in tests/unit/bankConnectHidden.test.js.
    __STACKD_BANK_CONNECT__: true,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: memStorage(),
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#settings' },
    Capacitor: o.native === false ? undefined : { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} },
    CdvPurchase: o.native === false ? undefined : fakeCdv(),
    __STACKD_BROKER_URL__: 'https://broker.test'
  };
  global.localStorage = global.window.localStorage;
  global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: 'unexpected' }) }));
  if (o.seed) global.window.localStorage.setItem('stackd_v1_pro', JSON.stringify(o.seed));
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'bank-connect.js', 'pro.js'].forEach(executeFile);
  global.window.Store.init();
  return global.window;
};
const state = () => global.window.Store.getState();
const addAccount = (name) => global.window.Store.dispatch('ADD_ACCOUNT', { name, openingBalance: 0, openingDate: '2026-01-01' });

describe("Stack'd Pro (v1.13) — free-plan gates", () => {
  it('starts on the free plan: two accounts, default categories only', () => {
    const w = boot();
    expect(w.Pro.isActive(state())).toBe(false);
    expect(w.Pro.canAddAccount(state())).toBe(true);
    addAccount('One');
    expect(w.Pro.canAddAccount(state())).toBe(true);
    addAccount('Two');
    expect(w.Pro.canAddAccount(state())).toBe(false);
    expect(w.Pro.canAddCategory(state())).toBe(false);
  });

  it('the store dispatch itself stays ungated (imports, tests) — only the UI gates', () => {
    const w = boot();
    addAccount('One'); addAccount('Two'); addAccount('Three');
    expect(state().accounts).toHaveLength(3);
    w.Store.dispatch('ADD_CATEGORY', { name: 'Custom', icon: 'pin', typeHint: 'expense' });
    expect(state().categories.some(c => c.name === 'Custom' && c.isDefault === false)).toBe(true);
  });

  it('SET_PRO persists to stackd_v1_pro and lifts both gates; a seeded purchase survives boot', () => {
    const w = boot();
    addAccount('One'); addAccount('Two');
    w.Store.dispatch('SET_PRO', { active: true, productId: 'stackd_pro', platform: 'play' });
    expect(w.Pro.isActive(state())).toBe(true);
    expect(w.Pro.canAddAccount(state())).toBe(true);
    expect(w.Pro.canAddCategory(state())).toBe(true);
    expect(JSON.parse(w.localStorage.getItem('stackd_v1_pro'))).toMatchObject({ active: true, productId: 'stackd_pro', platform: 'play' });

    const w2 = boot({ seed: { active: true, productId: 'stackd_pro', platform: 'play', purchasedAt: '2026-09-01T00:00:00.000Z' } });
    expect(w2.Pro.isActive(w2.Store.getState())).toBe(true);
    expect(w2.Pro.prefs(w2.Store.getState()).purchasedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('RESET_APP keeps the entitlement (it is a purchase, not data)', () => {
    const w = boot();
    w.Store.dispatch('SET_PRO', { active: true });
    w.Store.dispatch('RESET_APP');
    expect(w.Pro.isActive(state())).toBe(true);
  });
});

describe("Stack'd Pro (v1.13) — store adapter", () => {
  it('registers the non-consumable next to the plans and reads its price', async () => {
    const w = boot();
    expect(w.Pro.storeAvailable()).toBe(true);
    expect(w.Pro.price()).toBeNull();
    const price = await w.Pro.loadPrice();
    expect(price).toBe('€4.99');
    expect(w.CdvPurchase.store.registered.map(r => r.id)).toEqual(['stackd_bank_connect_monthly', 'stackd_bank_connect_yearly', 'stackd_pro']);
    expect(w.CdvPurchase.store.registered[2]).toMatchObject({ type: 'non consumable', platform: 'android-playstore' });
    // Bank Connect's own prices are untouched by the extra product.
    expect(w.BankConnect.prices().monthly.price).toBe('€2.99');
  });

  it('purchase: orders the offer, activates on approval, finishes the transaction — the broker is never called', async () => {
    const w = boot();
    const tx = { products: [{ id: 'stackd_pro' }], transactionId: 'GPA.1234', finish: vi.fn(async () => {}) };
    const p = w.Pro.purchase();
    await new Promise(r => setTimeout(r, 0));
    expect(w.CdvPurchase.store.orders[0]).toEqual({ id: 'pro-offer', productId: 'stackd_pro' });
    w.CdvPurchase.approve(tx);
    const res = await p;
    expect(res).toEqual({ active: true });
    expect(tx.finish).toHaveBeenCalled();
    expect(w.Pro.isActive(state())).toBe(true);
    expect(w.Pro.prefs(state())).toMatchObject({ productId: 'stackd_pro', platform: 'play', transactionId: 'GPA.1234' });
    expect(global.fetch).not.toHaveBeenCalled();
    // The Bank Connect entitlement is a different product and stays off.
    expect(w.BankConnect.entitlement(state()).active).toBe(false);
  });

  it('a Bank Connect approval still goes to Bank Connect, not to Pro', async () => {
    const w = boot();
    await w.Pro.loadPrice();
    const tx = { products: [{ id: 'stackd_bank_connect_yearly' }], nativePurchase: { purchaseToken: 'tok' }, finish: vi.fn() };
    w.CdvPurchase.approve(tx);
    await new Promise(r => setTimeout(r, 0));
    expect(w.Pro.isActive(state())).toBe(false);
    expect(global.fetch).toHaveBeenCalled(); // the receipt went to the broker
  });

  it('a cancelled store sheet rejects with {cancelled} and leaves the plan free', async () => {
    const w = boot();
    await w.Pro.loadPrice();
    w.CdvPurchase.store.order = async () => ({ code: 'E_USER_CANCELLED', message: 'cancelled' });
    await expect(w.Pro.purchase()).rejects.toMatchObject({ cancelled: true });
    expect(w.Pro.isActive(state())).toBe(false);
  });

  it('restore: an owned product surfaced by the store activates Pro', async () => {
    const w = boot();
    await w.Pro.loadPrice();
    w.CdvPurchase.store.ownsPro = true;
    const res = await w.Pro.restore();
    expect(w.CdvPurchase.store.restored).toBe(1);
    expect(res).toEqual({ active: true });
    expect(w.Pro.isActive(state())).toBe(true);
  });

  it('restore: nothing owned resolves null after the wait', async () => {
    const w = boot();
    w.Pro.RESTORE_WAIT_MS = 5;
    await w.Pro.loadPrice();
    const res = await w.Pro.restore();
    expect(res).toBeNull();
    expect(w.Pro.isActive(state())).toBe(false);
  });

  it('an already-owned product is picked up at store init (fresh install, same store account)', async () => {
    const w = boot();
    w.CdvPurchase.store.ownsPro = true;
    const init = w.CdvPurchase.store.initialize.bind(w.CdvPurchase.store);
    w.CdvPurchase.store.initialize = async (p) => { const r = await init(p); w.CdvPurchase.store.get('stackd_pro').owned = true; return r; };
    await w.Pro.loadPrice();
    expect(w.Pro.isActive(state())).toBe(true);
  });

  it('web build: no store, no purchase path, the gates still apply', async () => {
    const w = boot({ native: false });
    expect(w.Pro.storeAvailable()).toBe(false);
    expect(await w.Pro.loadPrice()).toBeNull();
    expect(await w.Pro.purchase()).toBeNull();
    expect(w.Pro.canAddCategory(state())).toBe(false);
  });

  it('the e2e stub short-circuits the store', async () => {
    const w = boot({ native: false });
    w.__STACKD_PRO_STUB__ = { price: '€4.99', async purchase() { return { active: true }; } };
    expect(w.Pro.storeAvailable()).toBe(true);
    expect(w.Pro.price()).toBe('€4.99');
    await w.Pro.purchase();
    expect(w.Pro.isActive(state())).toBe(true);
    expect(w.Pro.prefs(state()).platform).toBe('stub');
  });
});
