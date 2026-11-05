import { test, expect } from '@playwright/test';

// 1.2.0 (UX-9, docs/ux-review-1.2-plan.md §C.2/§C.3): the transaction form's
// Tags field opens the category-scoped TagPickerSheet. A tag created there
// lands on the transaction and is linked to the chosen category.
test.describe('Tag picker (1.2.0 UX-9)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 1, 12, 0, 0) });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Views && !!window.Components.TagPickerSheet);
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
      const acc = S.getState().accounts[0].id;
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 3, accountId: acc, categoryId: 'cat_groceries', date: '2026-09-20', tags: ['milk'] });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 9, accountId: acc, categoryId: 'cat_dining', date: '2026-09-21', tags: ['pizza'] });
    });
  });

  test('create a tag in the picker, apply, save: the row carries it and the category is linked', async ({ page }) => {
    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#btn-save-tx');
    await page.fill('#tx-amount', '12.40');
    await page.selectOption('#tx-category', { label: 'Groceries' });

    await page.click('#tx-tags-input');
    const sheet = page.locator('#tag-picker-sheet');
    await expect(sheet).toBeVisible();
    // The category's tags first, then the rest.
    await expect(page.locator('#tps-section-category .tps-row')).toHaveText(['#milk']);
    await expect(page.locator('#tps-section-all .tps-row')).toHaveText(['#pizza']);

    await page.fill('#tps-search', 'Weekly Shop');
    await page.click('#tps-add');
    await expect(page.locator('#tps-search')).toHaveValue('');
    await expect(page.locator('#tps-section-category .tps-row[data-tag="weekly shop"]')).toHaveAttribute('aria-checked', 'true');
    await page.click('#tps-section-category .tps-row[data-tag="milk"]');
    await page.click('#tps-apply');
    await expect(sheet).toHaveCount(0);

    await expect(page.locator('#tx-tags-container .tag-chip')).toHaveCount(2);
    await expect(page.locator('#tx-amount')).toHaveValue('12.40'); // the form was not re-rendered

    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);
    const out = await page.evaluate(() => {
      const st = window.Store.getState();
      const tx = st.transactions.find(t => Array.isArray(t.tags) && t.tags.includes('weekly shop'));
      return { tags: tx && tx.tags, links: st.tagLinks, stored: JSON.parse(localStorage.getItem('stackd_v1_tagLinks') || '{}') };
    });
    expect(out.tags).toEqual(['weekly shop', 'milk']);
    expect(out.links['weekly shop']).toEqual(['cat_groceries']);
    expect(out.links.milk).toBeUndefined(); // already linked through a saved row
    expect(out.stored['weekly shop']).toEqual(['cat_groceries']);
  });

  test('closing the picker changes nothing', async ({ page }) => {
    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#btn-save-tx');
    await page.click('#tx-tags-input');
    await expect(page.locator('#tag-picker-sheet')).toBeVisible();
    await page.fill('#tps-search', 'never');
    await page.click('#tps-add');
    await page.click('#tps-close');
    await expect(page.locator('#tag-picker-sheet')).toHaveCount(0);
    await expect(page.locator('#tx-tags-container .tag-chip')).toHaveCount(0);
    const links = await page.evaluate(() => window.Store.getState().tagLinks);
    expect(links).toEqual({});
  });
});
