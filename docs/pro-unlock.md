# Stack'd Pro — one-time unlock (v1.13)

The reference for the free plan, the Pro unlock and the in-app purchases
screen. Bank Connect's subscription is a separate product; its reference
stays `docs/bank-connect-ux-plan.md`.

## 1. Products

| Product | Kind | Id (Play + App Store Connect) | Gate |
|---|---|---|---|
| Stack'd Pro | non-consumable, €4.99 once | `stackd_pro` (`Pro.PRODUCT_ID`) | `Pro.isActive(state)` |
| Bank Connect | auto-renewing subscription, monthly / yearly | `stackd_bank_connect_monthly` / `_yearly` | `BankConnect.entitlement(state)` |

The two never overlap: Pro unlocks local data limits, Bank Connect unlocks
the broker. Buying one says nothing about the other.

## 2. The free plan

- **Accounts:** up to `Pro.FREE_ACCOUNT_LIMIT` (2). `Pro.canAddAccount(state)`.
- **Categories:** the 14 defaults only (`isDefault: true` in `store.js`).
  `Pro.canAddCategory(state)`.
- **Everything else is free** — transactions, budgets, loans, widgets,
  statement import, export. Statement/CSV import may still auto-create
  accounts and categories it references (the store dispatches are ungated,
  see §4); that is deliberate — an import is the user's own data.
- **Grandfathering:** existing data is never hidden or disabled. A device
  with three accounts or custom categories from before v1.13 keeps using
  and editing them; only *creating more* is gated. The picker, budgets,
  analytics and history are untouched.

## 3. Surfaces

- **Settings → In-app purchases** (`#btn-open-purchases`, section
  `others.purchases`, placed after Manage). Subtitle = current plan
  (`others.purchasesFree` / `others.purchasesPro`).
- **`#purchases` → `Views.PurchasesView`**, two tabs (`_tab` survives the
  re-render a purchase triggers; `?tab=once|subscriptions` deep-links):
  - *One-time purchase*: the Pro card — perks, the free-plan line, the
    store price (`Pro.price()`, loaded late on native like the paywall),
    `#pro-buy-btn` ("Unlock for {price}"), `#pro-restore-btn`. Once active
    the buttons give way to an "Unlocked" chip. Without a store (web
    build) the buttons give way to `bank.storeUnavailable`.
  - *Subscriptions*: the Bank Connect card — perks, prices
    (`BankConnect.prices()`), status chip, `#bank-subscribe-btn` which opens
    the existing `Components.PaywallModal` (there is exactly ONE
    subscription flow), `#bank-restore-btn`, or `#bank-manage-btn` →
    `#bank-connect` when active. The web build shows `bank.webPaywall`.
- **Lock card** (`Views._proLockedPage(feature, backHref)` +
  `_attachProLocked`): what `EditAccountView` / `EditCategoryView` render
  in *new* mode when gated — same header as the form, a lock icon, the
  reason, "See Stack'd Pro" → `#purchases`, "Go back". `attachEvents` of
  both views early-returns through `_attachProLocked` so none of the
  form wiring runs against a form-less page.
- **Lock sheet** (`Components.ProLockModal.show({feature})`): the gate hit
  from *inside* another flow — the transaction form's "New category"
  (`showNewCategoryModal`, after the draft is captured so leaving is safe)
  and the account form's Save (belt and braces). It empties
  `#modal-container` before mounting — replacing the category picker the
  way `Components.Modal.show` does on the ungated path — because a picker
  left underneath keeps intercepting taps; its CTA removes the sheet
  outright before navigating, since the router never clears modals.

## 4. Data + entitlement

- `state.pro = { active, productId, platform, purchasedAt, transactionId }`
  under `stackd_v1_pro` (`Store._proDefaults` / `_loadPro`, dispatch
  `SET_PRO` shallow-merges). Cross-tab synced. **Kept on `RESET_APP`** —
  it is a purchase, not data, and the web build has no restore path.
  Not in the CSV backup (house convention for prefs/entitlements).
- **The entitlement is local.** No broker, no receipt upload: the app
  store's approved / owned / restore signals are the only judge, which is
  the right trust level for a €4.99 unlock of local features. (Bank
  Connect keeps its broker verification — it gates a paid backend.)
- `ADD_ACCOUNT` / `ADD_CATEGORY` stay ungated in the store; all gating is
  in the views/components. Imports and the unit suites rely on that.

## 5. Store adapter

`Pro` rides `BankConnect._iap` — one cordova-plugin-purchase session for
both products. `BankConnect.initStore` registers `stackd_pro` as
`ProductType.NON_CONSUMABLE` next to the two plans and routes:

- `productUpdated` (and post-`initialize`) → `Pro._onProductUpdated(iap)`:
  reads the price, and activates when `product.owned` (a reinstall on the
  same store account, or a restore that surfaces ownership without
  replaying a transaction).
- `approved` → `Pro._onApproved(tx)` when `tx.products` carries
  `stackd_pro` (else Bank Connect's broker path as before — a Pro receipt
  must never reach the broker, which answers `product_unknown`). Activates
  first, then `tx.finish()` (Play refunds unacknowledged purchases after
  3 days); an ack failure still leaves the device entitled.
- `store.error` settles both products' pending resolvers.

`Pro.purchase()` / `Pro.restore()` mirror `BankConnect.purchase` /
`restorePurchase` (offer → `store.order` → await approval, cancelled →
`{cancelled: true}`; `restorePurchases` → approval or owned flag, `null`
after `RESTORE_WAIT_MS`). `Pro.storeAvailable()` follows
`BankConnect.storeAvailable()` — false on the web build (no payment path).

E2E stub: `window.__STACKD_PRO_STUB__ = { price, purchase(), restore() }`
installed before any app script (`tests/e2e/pro_paywall.spec.js`).

## 6. Owner runbook

1. **Play Console** → Monetise → In-app products → create `stackd_pro`,
   one-time (non-consumable is the default for managed products), €4.99,
   activate. **App Store Connect** → In-App Purchases → Non-Consumable,
   product id `stackd_pro`, €4.99, localized display name "Stack'd Pro",
   submit with the next binary.
2. Localized store listings for the 5 languages: the in-app copy lives in
   `pro.*` keys; the store's own display name/description are set in the
   consoles.
3. Test with license testers (Play) / a sandbox account (App Store):
   buy, kill the app, reopen → still Pro (`stackd_v1_pro` + `owned`);
   reinstall → "Restore purchase" → Pro.
4. `npx cap sync android` after any plugin change (B8 wiring is unchanged
   by this feature — no new plugins).

## 7. Tests

- `tests/unit/pro.test.js` — gates, slice, reset, the adapter (register,
  purchase, approval routing vs Bank Connect, cancel, restore by
  replay/owned flag, init-time ownership, web build, stub).
- `tests/e2e/pro_paywall.spec.js` — Settings entry, both tabs, the third
  account lock → buy → unlock, the category lock (screen + transaction
  form sheet), a seeded purchase at boot.
- `tests/unit/i18n.test.js` enforces the 31 new keys × 5 languages.
