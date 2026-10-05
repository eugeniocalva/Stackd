import { test, expect } from '@playwright/test';

// 1.0.2 (BUG-29 / BUG-30): the account lifecycle.
// - Deleting an account used to leave its id in the saved Home view, widget
//   scopes, History filters and the default wallet, so Home and a widget
//   scoped to it read €0.00 and History showed a raw-id chip. Store's
//   _pruneAccountRefs now drops the dead id everywhere (an empty list = all
//   accounts), and UPDATE_FILTERS drops ids that name no account, so a stale
//   #transactions?account=<deleted> opens History unfiltered.
// - Account names are unique (trimmed, case-insensitive, any currency): the
//   form refuses a duplicate inline.
test.describe('Accounts lifecycle (1.0.2)', () => {
  const bootstrap = async (page) => {
    await page.clock.install({ time: new Date(2026, 9, 4, 12, 0, 0) });
    await page.addInitScript(() => {
      // Only on the first load: page.reload() below must keep the app's data.
      if (sessionStorage.getItem('u5_seeded')) return;
      sessionStorage.setItem('u5_seeded', '1');
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
      // Pro (as pro_paywall.spec.js seeds it): the free plan stops at 2 accounts.
      localStorage.setItem('stackd_v1_pro', JSON.stringify({ active: true, productId: 'stackd_pro', platform: 'play', purchasedAt: '2026-09-01T00:00:00.000Z' }));
    });
    await page.goto('/');
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Widgets);
  };

  // #edit-acc-balance is a digits-only cents field: '250000' → 2500.00.
  const createAccount = async (page, name, cents) => {
    await page.evaluate(() => window.Router.navigate('#dashboard'));
    await page.click('#btn-dashboard-add-wallet');
    await page.waitForSelector('#edit-acc-name');
    await page.fill('#edit-acc-name', name);
    if (cents) await page.fill('#edit-acc-balance', cents);
    await page.fill('#edit-acc-date', '2026-09-01');
    await page.click('#btn-edit-acc-save');
    await expect(page.locator(`.wallet-card:has-text("${name}")`)).toBeVisible();
  };

  const idOf = (page, name) => page.evaluate((n) => window.Store.getState().accounts.find(a => a.name === n).id, name);
  const totalBalance = (page) => page.locator('#router-view h1.header-title').first();
  const netWorthValue = (page) => page.locator('#widgets-grid .widget-card[data-widget-type="netWorth"] .widget-stat-value');

  test('deleting an account resets every view scoped to it', async ({ page }) => {
    await bootstrap(page);
    await createAccount(page, 'Main Checking', '250000');
    await createAccount(page, 'Savings Pot', '500000');
    await createAccount(page, 'Holiday Fund', '80000');
    const mainId = await idOf(page, 'Main Checking');
    const savingsId = await idOf(page, 'Savings Pot');
    const holidayId = await idOf(page, 'Holiday Fund');

    await page.evaluate((acc) => window.Store.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 42.5, accountId: acc, categoryId: 'cat_groceries', date: '2026-10-02', tags: []
    }), mainId);

    // A Net worth widget scoped to Savings Pot, through the configure sheet.
    await page.locator('#widgets-section').scrollIntoViewIfNeeded();
    await page.click('#btn-widgets-add-empty');
    await page.click('.widget-gallery-card[data-widget-type="netWorth"]');
    await page.click('#awm-confirm');
    await expect(page.locator('#awm-config')).toBeVisible();
    await page.click(`[data-config-multi="accountIds"][data-config-value="${savingsId}"]`);
    await page.click('#awm-confirm');
    await expect(page.locator('#add-widget-modal')).toHaveCount(0);
    expect(await page.evaluate(() => window.Store.getState().homeWidgets[0].config.accountIds)).toEqual([savingsId]);

    // Chart → Filter → untick Main Checking and Holiday Fund → Save View.
    await page.click('#chart-card-container');
    await expect(page.locator('#expanded-graph-modal')).toBeVisible();
    await page.click('#egm-filter');
    await page.click(`.egm-acc-checkbox[data-acc-id="${mainId}"]`);
    await page.click(`.egm-acc-checkbox[data-acc-id="${holidayId}"]`);
    await page.click('#egm-save-filters');
    expect(await page.evaluate(() => window.Store.getState().expandedGraphFilters.accounts)).toEqual([savingsId]);
    await page.click('#egm-close');
    await expect(page.locator('#expanded-graph-modal')).toHaveCount(0);

    // The Savings Pot tile (History filtered to it), then back Home.
    await page.locator(`.wallet-card[data-id="${savingsId}"]`).click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    await page.click('a[data-view="dashboard"]');
    await page.waitForFunction(() => window.Store.getState().activeView === 'dashboard');

    // Savings Pot ⋯ → Delete Account → Yes, Delete Everything.
    await page.locator(`.wallet-card[data-id="${savingsId}"] .account-edit-trigger`).click();
    await page.waitForSelector('#btn-edit-acc-delete');
    await page.click('#btn-edit-acc-delete');
    await page.click('#modal-delete-btn');
    await page.waitForFunction(() => window.Store.getState().activeView === 'dashboard');

    // Main 2,500.00 − 42.50 + Holiday 800.00 = 3,257.50 (was 0.00 on Home and on the widget).
    await expect(totalBalance(page)).toContainText('3,257.50');
    await expect(netWorthValue(page)).toContainText('3,257.50');

    // History opens unfiltered: no raw-id chip, the Main row is listed.
    await page.click('a[data-view="transactions"]');
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    await expect(page.locator('#history-account-filter-chip')).toHaveCount(0);
    await expect(page.locator('.list-item[data-id]', { hasText: '42.50' })).toHaveCount(1);

    // A stale deep link to the deleted account (web Back/Forward, bookmark).
    await page.evaluate((id) => { location.hash = '#transactions?account=' + id; }, savingsId);
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    await expect(page.locator('#history-account-filter-chip')).toHaveCount(0);
    await expect(page.locator('.list-item[data-id]', { hasText: '42.50' })).toHaveCount(1);
    expect(await page.evaluate(() => window.Store.getState().historyFilters.accounts)).toEqual([]);

    // Persisted: a reload still reads the live total.
    await page.reload();
    await page.waitForFunction(() => !!window.Store && !!window.Widgets);
    await page.evaluate(() => window.Router.navigate('#dashboard'));
    await page.waitForFunction(() => window.Store.getState().activeView === 'dashboard');
    await expect(totalBalance(page)).toContainText('3,257.50');
    await expect(netWorthValue(page)).toContainText('3,257.50');
  });

  test('the account form refuses a duplicate name', async ({ page }) => {
    await bootstrap(page);
    await createAccount(page, 'Visa', '10000');

    await page.click('#btn-dashboard-add-wallet');
    await page.waitForSelector('#edit-acc-name');
    await page.fill('#edit-acc-name', 'visa');
    await page.click('#btn-edit-acc-save');

    await expect(page.locator('#edit-acc-name-error')).toBeVisible();
    await expect(page.locator('#edit-acc-name-error')).toHaveText('An account called "Visa" already exists.');
    expect(await page.evaluate(() => window.Store.getState().accounts.length)).toBe(1);

    await page.evaluate(() => window.Router.navigate('#dashboard'));
    await page.waitForFunction(() => window.Store.getState().activeView === 'dashboard');
    await expect(page.locator('.wallet-card:has-text("Visa")')).toHaveCount(1);
  });
});
