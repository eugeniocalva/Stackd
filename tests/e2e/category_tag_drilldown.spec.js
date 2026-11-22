import { test, expect } from '@playwright/test';

// v0.85 (docs/refactor-plan.md P7): an Analytics category's per-tag breakdown.
// 1.3.2 (AB-5/6): it opens under the row from the Tags action, and a tag opens
// its transactions in a sheet (it went to History before). Settings → Tags
// still opens History filtered by the tag (all time).
test.describe('Category → tag drilldown', () => {
  const bootstrap = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);

    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2020-01-01' });
      const accId = S.getState().accounts[0].id;
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const day = Math.max(1, Math.min(d.getDate() - 1, 27));
      const tx = (categoryId, amount, tags) => S.dispatch('ADD_TRANSACTION', {
        type: 'expense', categoryId, amount, accountId: accId, date: `${ym}-${pad(day)}`, tags
      });
      tx('cat_rent', 460, ['credito']);
      tx('cat_rent', 74, ['electricity']);
      tx('cat_rent', 30, []);            // untagged bucket
      tx('cat_dining', 20, ['takeaway']);
    });
    await page.evaluate(() => window.Router.navigate('#analytics'));
    await page.waitForFunction(() => window.Store.getState().activeView === 'analytics');
    await page.waitForSelector('.cat-swipe');
  };

  // 1.3.2 (AB-4/5/6): a row slides to Tags / Transactions; tags open under
  // the row and a tag opens its transactions in a sheet — no trip to History.
  const rent = (page) => page.locator('.cat-swipe[data-cat-id="cat_rent"]');
  const openTags = async (page, row) => {
    await row.locator('.cat-swipe-content').evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await row.locator('.cat-swipe-content').click();
    await page.waitForTimeout(400); // the row slides open
    await row.locator('.cat-act[data-act="tags"]').click();
  };

  test('Tags opens a category\'s tag rows under it; a tag opens its transactions in a sheet', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('.donut-legend-group.is-expanded')).toHaveCount(0);

    await openTags(page, rent(page));
    const panel = page.locator('.donut-legend-group[data-cat-group="cat_rent"] .donut-tag-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.donut-tag-row')).toHaveCount(3); // 2 tags + no tag
    await expect(panel).toContainText('#credito');
    await expect(panel).toContainText('#electricity');
    await expect(panel).toContainText('No tag');

    // Only one category open at a time.
    await openTags(page, page.locator('.cat-swipe[data-cat-id="cat_dining"]'));
    await expect(page.locator('.donut-legend-group.is-expanded')).toHaveCount(1);
    await expect(page.locator('.donut-legend-group.is-expanded')).toHaveAttribute('data-cat-group', 'cat_dining');

    // A tag row → a sheet with that tag's transactions; Analytics stays.
    await openTags(page, rent(page));
    await panel.locator('[data-tag-row="electricity"]').click();
    const sheet = page.locator('#tx-list-sheet');
    await expect(sheet.locator('.tx-sheet-title')).toHaveText('#electricity');
    await expect(sheet.locator('.tx-sheet-list .list-item')).toHaveCount(1);
    expect(await page.evaluate(() => window.Store.getState().activeView)).toBe('analytics');
    await sheet.locator('[data-back-dismiss]').click();
    await expect(page.locator('#tx-list-sheet')).toHaveCount(0);
  });

  test('the untagged bucket and the whole list open the right rows', async ({ page }) => {
    await bootstrap(page);
    await openTags(page, rent(page));
    const panel = page.locator('.donut-legend-group[data-cat-group="cat_rent"] .donut-tag-panel');
    await panel.locator('[data-tag-row="__untagged__"]').click();
    let sheet = page.locator('#tx-list-sheet');
    await expect(sheet.locator('.tx-sheet-title')).toHaveText('No tag');
    await expect(sheet.locator('.tx-sheet-list .list-item')).toHaveCount(1);
    await sheet.locator('[data-back-dismiss]').click();
    await expect(page.locator('#tx-list-sheet')).toHaveCount(0);

    // The open panel survives a trip away and back (state on the component).
    await page.evaluate(() => window.Router.navigate('#transactions'));
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    await page.evaluate(() => window.Router.navigate('#analytics'));
    await page.waitForSelector('.cat-swipe');
    await expect(page.locator('.donut-legend-group.is-expanded')).toHaveCount(1);

    await rent(page).locator('.cat-swipe-content').evaluate(e => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await rent(page).locator('.cat-swipe-content').click();
    await page.waitForTimeout(400); // the row slides open
    await rent(page).locator('.cat-act[data-act="list"]').click();
    sheet = page.locator('#tx-list-sheet');
    await expect(sheet.locator('.tx-sheet-title')).toHaveText('Rent');
    await expect(sheet.locator('.tx-sheet-list .list-item')).toHaveCount(3);
    await expect(sheet.locator('.tx-sheet-total-amount')).toContainText('564.00');
  });

  test('Settings → Tags: the edit sheet link opens History filtered by that tag over all time', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => window.Router.navigate('#tags'));
    await page.waitForSelector('[data-tag-open]');

    const row = page.locator('[data-tag-open="credito"]');
    await expect(row).toContainText('#credito');
    await expect(row).toContainText('1 transaction');
    // 1.2.2 (HG-14): a row opens the edit sheet; its link opens History
    await row.click();
    await page.click('#tag-edit-sheet [data-k="see"]');

    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    const f = await page.evaluate(() => window.Store.getState().historyFilters);
    expect(f.tags).toEqual(['credito']);
    expect(f.categories).toEqual([]);
    expect(f.period.type).toBe('custom'); // all-time span, not "This Month"
    await expect(page.locator('#router-view .list-item[data-id]')).toHaveCount(1);
  });
});
