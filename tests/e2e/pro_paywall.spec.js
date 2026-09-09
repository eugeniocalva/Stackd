import { test, expect } from '@playwright/test';

// v1.13 Stack'd Pro (docs/pro-unlock.md): the free plan (two accounts, default
// categories), the Settings → In-app purchases screen (one-time tab + the
// Bank Connect subscription tab), the in-page lock cards, and the stub
// purchase that lifts the gates. The store is window.__STACKD_PRO_STUB__,
// installed before any app script runs — nothing here touches a real store.
test.describe("Stack'd Pro paywall (v1.13)", () => {
  const installStub = () => {
    window.__STACKD_PRO_STUB__ = {
      price: '€4.99',
      purchases: 0,
      async purchase() { this.purchases += 1; return { active: true }; },
      async restore() { return null; }
    };
  };

  const boot = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Pro);
  };

  const addAccount = async (page, name) => {
    await page.goto('/#edit-account');
    await page.waitForSelector('#edit-acc-name');
    await page.fill('#edit-acc-name', name);
    await page.click('#btn-edit-acc-save');
    await expect(page.locator(`.wallet-card:has-text("${name}")`)).toBeVisible();
  };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installStub);
    await boot(page);
  });

  test('Settings shows the purchases entry; the screen has both tabs with the right storefronts', async ({ page }) => {
    // v1.15 (A-04): this case covers the TWO-product screen, so it needs Bank
    // Connect switched on; the shipped one-product default has its own test.
    await page.addInitScript(() => { window.__STACKD_BANK_CONNECT__ = true; });
    await page.reload();
    await page.waitForFunction(() => !!window.Store && !!window.Pro);
    await page.goto('/#settings');
    const row = page.locator('#btn-open-purchases');
    await expect(row).toBeVisible();
    await expect(page.locator('#purchases-settings-subtitle')).toContainText('Free plan');
    await row.click();
    await expect(page).toHaveURL(/#purchases$/);

    // One-time tab first: the Pro card, its store price, no "Unlocked" chip.
    await expect(page.locator('#purchases-panel')).toHaveAttribute('data-tab', 'once');
    await expect(page.locator('#pro-card')).toContainText("Stack'd Pro");
    await expect(page.locator('#pro-buy-btn')).toHaveText('Unlock for €4.99');
    await expect(page.locator('#pro-buy-btn')).toBeEnabled();
    await expect(page.locator('#pro-restore-btn')).toBeVisible();

    // Subscriptions tab: Bank Connect, its own status, the subscribe entry.
    await page.click('.purchases-tab[data-tab="subscriptions"]');
    await expect(page.locator('#purchases-panel')).toHaveAttribute('data-tab', 'subscriptions');
    await expect(page.locator('#bank-sub-card')).toContainText('Bank Connect');
    await expect(page.locator('#bank-sub-card')).toContainText('Not subscribed');
    await expect(page.locator('#pro-card')).toHaveCount(0);
    // The web build has no bank store path (v1.11 B7): note, no Subscribe.
    await expect(page.locator('#bank-subscribe-btn, #bank-web-note')).toHaveCount(1);

    // Back to one-time and the Pro card is back.
    await page.click('.purchases-tab[data-tab="once"]');
    await expect(page.locator('#pro-card')).toBeVisible();
  });

  test('free plan: the third account is locked, buying Pro unlocks it', async ({ page }) => {
    await addAccount(page, 'Main');
    await addAccount(page, 'Savings');

    // Third account → the lock card replaces the form.
    await page.goto('/#edit-account');
    await expect(page.locator('#pro-locked[data-feature="accounts"]')).toBeVisible();
    await expect(page.locator('#edit-acc-name')).toHaveCount(0);
    await expect(page.locator('#pro-locked')).toContainText('2 accounts');

    // "See Stack'd Pro" → purchases screen → buy (stub) → Unlocked.
    await page.click('#pro-locked-cta');
    await expect(page).toHaveURL(/#purchases$/);
    await page.click('#pro-buy-btn');
    await expect(page.locator('#pro-card')).toContainText('Unlocked');
    await expect(page.locator('#pro-buy-btn')).toHaveCount(0);
    expect(await page.evaluate(() => window.__STACKD_PRO_STUB__.purchases)).toBe(1);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('stackd_v1_pro')).active)).toBe(true);

    // The gate is lifted: the third account goes through.
    await addAccount(page, 'Third');
    expect(await page.evaluate(() => window.Store.getState().accounts.length)).toBe(3);

    // Settings now says Pro.
    await page.goto('/#settings');
    await expect(page.locator('#purchases-settings-subtitle')).toContainText("Stack'd Pro unlocked");

    // Editing an EXISTING account was never gated — and still isn't.
    const id = await page.evaluate(() => window.Store.getState().accounts[0].id);
    await page.goto(`/#edit-account?id=${id}`);
    await expect(page.locator('#edit-acc-name')).toHaveValue('Main');
  });

  test('free plan: custom categories are locked on the categories screen and in the transaction form', async ({ page }) => {
    await addAccount(page, 'Main');

    // Categories screen "+" → the lock card.
    await page.goto('/#categories');
    await page.click('#btn-create-category');
    await expect(page).toHaveURL(/#edit-category$/);
    await expect(page.locator('#pro-locked[data-feature="categories"]')).toBeVisible();
    await expect(page.locator('#edit-cat-name')).toHaveCount(0);
    await page.click('#pro-locked-back');
    await expect(page).toHaveURL(/#categories$/);
    // Wait for the categories screen to actually render: the URL flips
    // before its hashchange task runs, and a goto racing that task would
    // leave SET_VIEW a no-op (same view id) with the lock card still up.
    await page.waitForSelector('#btn-create-category');

    // Editing an existing (default) category is fine.
    await page.goto('/#edit-category?id=cat_groceries');
    await expect(page.locator('#edit-cat-name')).toHaveValue('Groceries');

    // Transaction form → category picker → "+" → the lock sheet, not the
    // new-category modal.
    await page.goto('/#add');
    await page.waitForSelector('#tx-category');
    await page.click('#tx-category');
    await page.click('#csm-add-new');
    await expect(page.locator('#pro-lock')).toBeVisible();
    await expect(page.locator('#new-cat-name')).toHaveCount(0);
    await page.click('#pro-lock-cta');
    await expect(page).toHaveURL(/#purchases$/);
    await expect(page.locator('#modal-container .modal-backdrop')).toHaveCount(0);

    // Unlock, then the same paths open the real forms.
    await page.click('#pro-buy-btn');
    await expect(page.locator('#pro-card')).toContainText('Unlocked');
    await page.goto('/#edit-category');
    await expect(page.locator('#edit-cat-name')).toBeVisible();
    await page.goto('/#add');
    await page.waitForSelector('#tx-category');
    await page.click('#tx-category');
    await page.click('#csm-add-new');
    await expect(page.locator('#new-cat-name')).toBeVisible();
  });

  // v1.15 (A-04, decision D1): the first store release ships with Bank
  // Connect off at build time, so a reviewer must find no trace of it. This
  // spec deliberately does NOT set __STACKD_BANK_CONNECT__, so it runs the
  // shipped default in a real browser.
  test('Bank Connect leaves no trace in the shipped build', async ({ page }) => {
    await page.goto('/#settings');
    await expect(page.locator('#btn-import-csv')).toBeVisible();      // import stays, it is free
    await expect(page.locator('#btn-open-bank-connect')).toHaveCount(0);

    // One product, so no tab bar and no subscription card.
    await page.goto('/#purchases');
    await expect(page.locator('#pro-card')).toBeVisible();
    await expect(page.locator('#purchases-tabs')).toHaveCount(0);
    await expect(page.locator('#bank-sub-card')).toHaveCount(0);

    // A stale deep link must not land on a screen that cannot work.
    await page.goto('/#bank-connect');
    await expect(page.locator('#bank-connect')).toHaveCount(0);
    await expect(page.locator('#btn-import-csv')).toBeVisible();      // bounced to Settings
  });

  // v1.14: both stores expect the Terms of Use AND the Privacy Policy to be
  // reachable by name from a purchase surface. One combined "Terms and
  // Conditions" button is the classic review pushback, so the two links are
  // separate and the privacy one opens the sheet already scrolled to Part 2.
  test('the purchases screen links Terms of Use and Privacy Policy by name', async ({ page }) => {
    // v1.15 (A-04): this case covers the TWO-product screen, so it needs Bank
    // Connect switched on; the shipped one-product default has its own test.
    await page.addInitScript(() => { window.__STACKD_BANK_CONNECT__ = true; });
    await page.reload();
    await page.waitForFunction(() => !!window.Store && !!window.Pro);
    await page.goto('/#purchases');
    await expect(page.locator('#pro-once-terms-link')).toHaveText('Terms of Use');
    await expect(page.locator('#pro-once-privacy-link')).toHaveText('Privacy Policy');

    await page.click('#pro-once-privacy-link');
    const body = page.locator('#active-modal .modal-body');
    await expect(body).toBeVisible();
    // The Stack'd Pro clause exists and sits after the subscription one, so
    // terms.intro's "Terms 5-6 / Privacy 3-4" cross-reference still holds.
    await expect(body).toContainText("7. Stack'd Pro (one-time purchase)");
    await expect(body).toContainText('6. Bank Connect subscription');

    // Opened at the privacy part, not at the top of the licence.
    await expect.poll(async () => page.evaluate(() => {
      const el = document.querySelector('#active-modal .modal-body');
      const anchor = document.getElementById('terms-part-privacy');
      if (!el || !anchor) return null;
      return Math.round(anchor.getBoundingClientRect().top - el.getBoundingClientRect().top);
    })).toBeLessThan(24);

    await page.click('#modal-cancel-btn');
    await page.click('.purchases-tab[data-tab="subscriptions"]');
    await expect(page.locator('#bank-subs-terms-link')).toHaveText('Terms of Use');
    await expect(page.locator('#bank-subs-privacy-link')).toHaveText('Privacy Policy');
  });

  test('a seeded purchase (restored device) boots straight into Pro', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('stackd_v1_pro', JSON.stringify({ active: true, productId: 'stackd_pro', platform: 'play', purchasedAt: '2026-09-01T00:00:00.000Z' })));
    await page.reload();
    await page.waitForFunction(() => !!window.Store && !!window.Pro);
    await page.goto('/#purchases');
    await expect(page.locator('#pro-card')).toContainText('Unlocked');
    await expect(page.locator('#pro-buy-btn')).toHaveCount(0);
    await page.goto('/#edit-category');
    await expect(page.locator('#edit-cat-name')).toBeVisible();
  });
});
