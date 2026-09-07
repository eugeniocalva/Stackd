import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// v1.09 Bank Connect, phase B5 (docs/bank-connect-ux-plan.md §14): the
// in-app purchase adapter on cordova-plugin-purchase — prices, purchase,
// restore — with the RECEIPT handed to the broker, which decides.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

// A faithful-enough cordova-plugin-purchase v13 surface.
const fakeCdv = (platformName) => {
  const handlers = { productUpdated: [], approved: [] };
  const products = new Map();
  const cdv = {
    ProductType: { PAID_SUBSCRIPTION: 'paid subscription' },
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
        products.set('stackd_bank_connect_monthly', { id: 'stackd_bank_connect_monthly', pricing: { price: '€2.99', currency: 'EUR', priceMicros: 2990000 }, getOffer: () => ({ id: 'm-offer', productId: 'stackd_bank_connect_monthly' }) });
        products.set('stackd_bank_connect_yearly', { id: 'stackd_bank_connect_yearly', pricing: { price: '€29.99', currency: 'EUR', priceMicros: 29990000 }, getOffer: () => ({ id: 'y-offer', productId: 'stackd_bank_connect_yearly' }) });
        handlers.productUpdated.forEach(cb => cb());
        return [];
      },
      get(id) { return products.get(id) || null; },
      async order(offer) {
        this.orders.push(offer);
        return undefined; // the sheet completed; approval follows
      },
      async restorePurchases() { this.restored += 1; return undefined; }
    },
    // test helpers
    approve(tx) { handlers.approved.forEach(cb => cb(tx)); }
  };
  return cdv;
};

let stub;
const boot = (platform) => {
  stub = null; // real transport path with a fake fetch below
  const fetchCalls = [];
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2) },
    localStorage: memStorage(),
    StackdHydrateIcons: vi.fn(),
    location: { hash: '#bank-connect' },
    Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins: {} },
    CdvPurchase: fakeCdv(platform),
    __STACKD_BROKER_URL__: 'https://broker.test',
    fetch: undefined,
    _fetchCalls: fetchCalls
  };
  global.localStorage = global.window.localStorage;
  // The broker transport uses the global fetch: fake it per path.
  global.fetch = vi.fn(async (url, init) => {
    const path = new URL(url).pathname;
    const body = init && init.body ? JSON.parse(init.body) : {};
    fetchCalls.push({ path, body, headers: init.headers });
    const res = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (path === '/v1/entitlement/verify') {
      if (!body.platform) return res({ ownerId: 'owner_x', deviceToken: 'dev.token', active: false, expiresAt: null, mode: 'store' });
      if (body.purchaseToken === 'bad' || body.originalTransactionId === '0') return res({ error: 'receipt_invalid' }, 400);
      return res({ ownerId: 'owner_x', active: true, expiresAt: '2027-01-01T00:00:00.000Z', platform: body.platform, productId: body.productId, mode: 'store' });
    }
    return res({ error: 'unexpected' }, 500);
  });
  ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js', 'router.js', 'export.js', 'import.js', 'bank-connect.js'].forEach(executeFile);
  global.window.Store.init();
  return global.window;
};
const state = () => global.window.Store.getState();

describe('Bank Connect B5 (v1.09) — store entitlement client', () => {
  it('registers both plans, initializes the platform store and exposes prices with the yearly per-month figure', async () => {
    const w = boot('android');
    const BC = w.BankConnect;
    expect(BC.platform()).toBe('play');
    expect(BC.storeAvailable()).toBe(true);
    expect(BC.prices()).toBeNull();
    const p = await BC.loadPrices();
    expect(w.CdvPurchase.store.registered.map(r => r.id)).toEqual(['stackd_bank_connect_monthly', 'stackd_bank_connect_yearly']);
    expect(w.CdvPurchase.store.registered[0]).toMatchObject({ type: 'paid subscription', platform: 'android-playstore' });
    expect(p.monthly.price).toBe('€2.99');
    expect(p.yearly.price).toBe('€29.99');
    expect(p.yearly.perMonth).toMatch(/2[.,]50/);
    expect(BC.prices()).toBe(p);
    await BC.initStore(); // idempotent
    expect(w.CdvPurchase.store.registered).toHaveLength(2);
  });

  it('Play purchase: orders the offer, posts the purchase token to the broker, caches the entitlement and finishes the transaction', async () => {
    const w = boot('android');
    const BC = w.BankConnect;
    const tx = { products: [{ id: 'stackd_bank_connect_yearly' }], nativePurchase: { purchaseToken: 'tok_play_1', productIds: ['stackd_bank_connect_yearly'] }, finish: vi.fn() };
    const p = BC.purchase('yearly');
    await new Promise(r => setTimeout(r, 0));
    expect(w.CdvPurchase.store.orders[0]).toEqual({ id: 'y-offer', productId: 'stackd_bank_connect_yearly' });
    w.CdvPurchase.approve(tx);
    const res = await p;
    expect(res).toMatchObject({ active: true, platform: 'play', productId: 'stackd_bank_connect_yearly' });
    const verify = w._fetchCalls.filter(c => c.path === '/v1/entitlement/verify');
    expect(verify[0].body).toEqual({ kind: 'native' }); // device mint first
    expect(verify[1].body).toEqual({ platform: 'play', purchaseToken: 'tok_play_1', productId: 'stackd_bank_connect_yearly' });
    expect(verify[1].headers.Authorization).toBe('Bearer dev.token');
    expect(tx.finish).toHaveBeenCalledTimes(1);
    expect(state().bankConnect.entitlement).toMatchObject({ active: true, expiresAt: '2027-01-01T00:00:00.000Z', platform: 'play' });
    expect(BC.entitlement(state()).active).toBe(true);
  });

  it('App Store purchase maps the transaction id; a rejected receipt does not finish the transaction', async () => {
    const w = boot('ios');
    const BC = w.BankConnect;
    expect(BC.receiptFrom({ products: [{ id: 'stackd_bank_connect_monthly' }], transactionId: '2000000555', originalTransactionId: '2000000123' }))
      .toEqual({ platform: 'appstore', originalTransactionId: '2000000123', productId: 'stackd_bank_connect_monthly' });
    const tx = { products: [{ id: 'stackd_bank_connect_monthly' }], transactionId: '0', finish: vi.fn() };
    const p = BC.purchase('monthly');
    await new Promise(r => setTimeout(r, 0));
    w.CdvPurchase.approve(tx);
    await expect(p).rejects.toThrow('receipt_invalid');
    expect(tx.finish).not.toHaveBeenCalled();
    expect(BC.entitlement(state()).active).toBe(false);
  });

  it('a cancelled store sheet rejects with a flagged error; restore resolves null when nothing shows up', async () => {
    const w = boot('android');
    const BC = w.BankConnect;
    BC.RESTORE_WAIT_MS = 20;
    w.CdvPurchase.store.order = async () => ({ code: 'PURCHASE_CANCELLED', message: 'User cancelled' });
    await BC.initStore();
    await expect(BC.purchase('monthly')).rejects.toMatchObject({ cancelled: true });
    expect(await BC.restorePurchase()).toBeNull();
    expect(w.CdvPurchase.store.restored).toBe(1);
  });

  it('restore that surfaces an approved transaction verifies it like a purchase', async () => {
    const w = boot('android');
    const BC = w.BankConnect;
    await BC.initStore();
    const p = BC.restorePurchase();
    await new Promise(r => setTimeout(r, 0));
    w.CdvPurchase.approve({ products: [{ id: 'stackd_bank_connect_monthly' }], nativePurchase: { purchaseToken: 'tok_old' }, finish: vi.fn() });
    expect((await p).active).toBe(true);
    expect(state().bankConnect.entitlement.productId).toBe('stackd_bank_connect_monthly');
  });

  it('web without the plugin or the stub: no store, prices null, purchase null', async () => {
    const w = boot('web');
    delete w.CdvPurchase;
    w.Capacitor = undefined;
    const BC = w.BankConnect;
    expect(BC.platform()).toBe('web');
    expect(BC.storeAvailable()).toBe(false);
    expect(await BC.loadPrices()).toBeNull();
    expect(await BC.purchase('monthly')).toBeNull();
    expect(await BC.restorePurchase()).toBeNull();
  });
});
