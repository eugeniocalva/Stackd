// pro.js - Stack'd Pro (v1.13, docs/pro-unlock.md): the one-time unlock.
//
// Free plan: up to FREE_ACCOUNT_LIMIT accounts and the default categories.
// Pro (a NON-CONSUMABLE store product, PRODUCT_ID) lifts both, forever.
// The entitlement is LOCAL — no broker, no receipt upload — because
// everything Pro gates is local data; the app store is the only judge, via
// the plugin's approved / owned / restore signals. It rides the same
// cordova-plugin-purchase session as Bank Connect (BankConnect.initStore
// registers the product and routes its transactions here), so the two
// products share one store handshake. Persisted as state.pro under
// stackd_v1_pro (Store._loadPro / SET_PRO). Bank Connect's subscription is
// a separate product with its own gate (BankConnect.entitlement).
window.Pro = {
  // Must match Play Console and App Store Connect exactly.
  PRODUCT_ID: 'stackd_pro',
  FREE_ACCOUNT_LIMIT: 2,
  PURCHASE_WAIT_MS: 3 * 60 * 1000, // the store sheet
  RESTORE_WAIT_MS: 8000,           // no approved/owned signal by then = nothing to restore
  _resolvers: [],
  _price: null,

  // The e2e stub: { price, active, purchase(), restore() } — installed before
  // any app script runs, like __STACKD_BROKER_STUB__.
  stub() {
    return window.__STACKD_PRO_STUB__ || null;
  },

  prefs(state) {
    const d = window.Store && window.Store._proDefaults
      ? window.Store._proDefaults()
      : { active: false, productId: null, platform: null, purchasedAt: null, transactionId: null };
    return Object.assign(d, (state && state.pro) || {});
  },

  isActive(state) {
    return !!this.prefs(state).active;
  },

  // ── Free-tier gates ───────────────────────────────────────────────────────
  // UI-level on purpose: ADD_ACCOUNT / ADD_CATEGORY stay ungated in the store
  // so statement/CSV imports (which auto-create what they reference) and the
  // unit suites keep working. Existing data is never hidden — a user who
  // already has three accounts or custom categories from before v1.13 keeps
  // using them; only CREATING more is gated.

  canAddAccount(state) {
    if (this.isActive(state)) return true;
    return ((state && state.accounts) || []).length < this.FREE_ACCOUNT_LIMIT;
  },

  canAddCategory(state) {
    return this.isActive(state);
  },

  // ── Store adapter (rides BankConnect._iap) ────────────────────────────────

  storeAvailable() {
    if (this.stub()) return true;
    const BC = window.BankConnect;
    return !!(BC && BC.storeAvailable());
  },

  _activate(info) {
    window.Store.dispatch('SET_PRO', Object.assign({
      active: true,
      productId: this.PRODUCT_ID,
      platform: window.BankConnect ? window.BankConnect.platform() : 'web',
      purchasedAt: new Date().toISOString()
    }, info || {}));
  },

  // Is this approved transaction ours (vs a Bank Connect plan)?
  ownsTransaction(tx) {
    const products = Array.isArray(tx && tx.products) ? tx.products : [];
    return products.some(p => p && p.id === this.PRODUCT_ID);
  },

  // Called by BankConnect.initStore on every productUpdated + after
  // initialize: reads the price and picks up an already-owned product (the
  // plugin restores local receipts at init, and restorePurchases() may only
  // surface ownership this way when the transaction was finished long ago).
  _onProductUpdated(iap) {
    let product = null;
    try { product = iap.store.get(this.PRODUCT_ID, iap.platform); } catch (e) { product = null; }
    const pricing = product && window.BankConnect ? window.BankConnect._offerPrice(product) : null;
    this._price = pricing && pricing.price ? pricing.price : null;
    if (product && product.owned && !this.isActive(window.Store.getState())) this._activate({});
  },

  async _onApproved(tx) {
    this._activate({ transactionId: String(tx.transactionId || tx.purchaseId || '') });
    try {
      // Acknowledge: Play refunds unacknowledged purchases after 3 days.
      if (typeof tx.finish === 'function') await tx.finish();
    } catch (e) { /* entitled regardless; the plugin retries the ack */ }
    this._settle({ active: true }, null);
  },

  _settle(res, err) {
    const rs = this._resolvers.splice(0);
    rs.forEach(r => { clearTimeout(r.timer); if (err) r.reject(err); else r.resolve(res); });
  },

  _await(ms) {
    return new Promise((resolve, reject) => {
      const r = { resolve, reject, timer: null };
      r.timer = setTimeout(() => { this._settle(null, null); }, ms);
      this._resolvers.push(r);
    });
  },

  // Localized store price string, or null when the store hasn't answered.
  price() {
    const stub = this.stub();
    if (stub && stub.price) return stub.price;
    return this._price;
  },

  async loadPrice() {
    if (this.stub()) return this.price();
    const BC = window.BankConnect;
    if (!BC) return null;
    const iap = await BC.initStore();
    if (iap) this._onProductUpdated(iap);
    return this._price;
  },

  async purchase() {
    const stub = this.stub();
    if (stub && typeof stub.purchase === 'function') {
      const res = await stub.purchase();
      if (res && res.active) this._activate({ platform: 'stub' });
      return res;
    }
    const BC = window.BankConnect;
    const iap = BC ? await BC.initStore() : null;
    if (!iap) return null;
    const product = iap.store.get(this.PRODUCT_ID, iap.platform);
    const offer = product && typeof product.getOffer === 'function' ? product.getOffer() : null;
    if (!offer) throw new Error('product_unavailable');
    const outcome = this._await(this.PURCHASE_WAIT_MS);
    const err = await iap.store.order(offer);
    if (err) {
      const cancelled = /cancel/i.test(String(err.code || '')) || /cancel/i.test(String(err.message || ''));
      this._settle(null, cancelled ? Object.assign(new Error('cancelled'), { cancelled: true }) : new Error(err.message || 'purchase_failed'));
    }
    return outcome; // {active: true}, or null when nothing was approved
  },

  async restore() {
    const stub = this.stub();
    if (stub && typeof stub.restore === 'function') {
      const res = await stub.restore();
      if (res && res.active) this._activate({ platform: 'stub' });
      return res;
    }
    const BC = window.BankConnect;
    const iap = BC ? await BC.initStore() : null;
    if (!iap) return null;
    const outcome = this._await(this.RESTORE_WAIT_MS);
    await iap.store.restorePurchases();
    this._onProductUpdated(iap); // ownership without a replayed transaction
    if (this.isActive(window.Store.getState())) this._settle({ active: true }, null);
    return outcome; // null when nothing shows up
  }
};
