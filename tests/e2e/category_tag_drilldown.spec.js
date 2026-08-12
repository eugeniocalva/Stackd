import { test, expect } from '@playwright/test';

// v0.85 (docs/refactor-plan.md P7): tapping an Analytics category expands its
// per-tag breakdown; tapping a tag opens History filtered by category + tag.
// Settings → Tags lands on the same destination (all time).
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
    await page.waitForSelector('.donut-legend-item');
  };

  const rentRow = (page) => page.locator('.donut-legend-item', { hasText: 'Rent' });

  test('expands a category into tag rows and drills into History', async ({ page }) => {
    await bootstrap(page);

    // Collapsed by default.
    await expect(page.locator('.donut-legend-group.is-expanded')).toHaveCount(0);

    await rentRow(page).click();
    const panel = page.locator('.donut-legend-group[data-cat-group="cat_rent"] .donut-tag-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.donut-tag-row')).toHaveCount(4); // 2 tags + no-tag + all
    await expect(panel).toContainText('#credito');
    await expect(panel).toContainText('#electricity');
    await expect(panel).toContainText('No tag');
    await expect(panel).toContainText('All 3 transactions');

    // Only one category open at a time.
    await page.locator('.donut-legend-item', { hasText: 'Dining' }).click();
    await expect(page.locator('.donut-legend-group.is-expanded')).toHaveCount(1);
    await expect(page.locator('.donut-legend-group.is-expanded')).toHaveAttribute('data-cat-group', 'cat_dining');

    // Re-tapping the open row collapses it.
    await page.locator('.donut-legend-item', { hasText: 'Dining' }).click();
    await expect(page.locator('.donut-legend-group.is-expanded')).toHaveCount(0);

    // Tag row → History filtered by category AND tag.
    await rentRow(page).click();
    await panel.locator('[data-tag-row="electricity"]').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    const filters = await page.evaluate(() => {
      const f = window.Store.getState().historyFilters;
      return { categories: f.categories, tags: f.tags };
    });
    expect(filters).toEqual({ categories: ['cat_rent'], tags: ['electricity'] });
    await expect(page.locator('#router-view .list-item[data-id]')).toHaveCount(1);

    // The active tag filter is visible and clears in place.
    const chip = page.locator('#history-tag-filter-chip');
    await expect(chip).toContainText('#electricity');
    await chip.click();
    await expect(page.locator('#history-tag-filter-chip')).toHaveCount(0);
    await expect(page.locator('#router-view .list-item[data-id]')).toHaveCount(3); // whole category
  });

  test('the untagged bucket and the All row filter correctly', async ({ page }) => {
    await bootstrap(page);
    await rentRow(page).click();
    const panel = page.locator('.donut-legend-group[data-cat-group="cat_rent"] .donut-tag-panel');

    await panel.locator('[data-tag-row="__untagged__"]').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    expect(await page.evaluate(() => window.Store.getState().historyFilters.tags)).toEqual(['__untagged__']);
    await expect(page.locator('#router-view .list-item[data-id]')).toHaveCount(1);

    await page.evaluate(() => window.Router.navigate('#analytics'));
    await page.waitForSelector('.donut-legend-item');
    // The open accordion survives the round trip (state lives on the component).
    await expect(page.locator('.donut-legend-group.is-expanded')).toHaveCount(1);
    await panel.locator('[data-tag-row="__all__"]').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    const f = await page.evaluate(() => window.Store.getState().historyFilters);
    expect(f.categories).toEqual(['cat_rent']);
    expect(f.tags).toEqual([]);
    await expect(page.locator('#router-view .list-item[data-id]')).toHaveCount(3);
  });

  test('Settings → Tags opens History filtered by that tag over all time', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => window.Router.navigate('#tags'));
    await page.waitForSelector('[data-tag-open]');

    const row = page.locator('[data-tag-open="credito"]');
    await expect(row).toContainText('#credito');
    await expect(row).toContainText('1 transaction');
    await row.click();

    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    const f = await page.evaluate(() => window.Store.getState().historyFilters);
    expect(f.tags).toEqual(['credito']);
    expect(f.categories).toEqual([]);
    expect(f.period.type).toBe('custom'); // all-time span, not "This Month"
    await expect(page.locator('#router-view .list-item[data-id]')).toHaveCount(1);
  });
});
