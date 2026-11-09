import { test, expect } from '@playwright/test';

// 1.2.2 (HG-14, docs/tags-page-plan.md): Settings → Tags adds with a primary
// +, edits a tag in a sheet (name + category chips) and asks one summary
// confirmation before a rename or a category change lands.
test.describe('Tags page edit sheet', () => {
  const boot = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2020-01-01' });
      const accountId = S.getState().accounts[0].id;
      const tx = (notes, categoryId, tags) => S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 5, accountId, categoryId, date: '2026-10-02', notes, tags });
      tx('g1', 'cat_groceries', ['amazon']);
      tx('g2', 'cat_groceries', ['amazon']);
      tx('d1', 'cat_dining', ['amazon']);
      tx('s1', 'cat_shopping', ['shop']);
    });
    await page.evaluate(() => window.Router.navigate('#tags'));
    await page.waitForSelector('[data-tag-open="amazon"]');
  };
  const cat = (page, note) => page.evaluate((n) => window.Store.getState().transactions.find(t => t.notes === n).categoryId, note);

  test('+ adds a tag with a category', async ({ page }) => {
    await boot(page);
    await page.click('#tags-add');
    await expect(page.locator('#tes-title')).toHaveText('New tag');
    await page.fill('#tag-name', 'Trip');
    await page.click('[data-k="add-cat"]');
    await page.click('[data-pick="cat_dining"]');
    await expect(page.locator('.tes-chips')).toContainText('Dining');
    await page.click('#tes-save');
    await expect(page.locator('[data-tag-open="trip"]')).toContainText('Dining');
  });

  test('a row opens the sheet; a rename and a moved category land after Confirm', async ({ page }) => {
    await boot(page);
    await page.click('[data-tag-open="amazon"]');
    await expect(page.locator('#tes-title')).toHaveText('Edit tag');
    await expect(page.locator('#tes-save')).toBeDisabled();
    await page.fill('#tag-name', 'online');
    await page.click('[data-rm="cat_groceries"]');
    await page.click('[data-k="add-cat"]');
    await page.click('[data-pick="cat_shopping"]');
    await page.click('#tes-save');

    await expect(page.locator('#tes-title')).toHaveText('Confirm changes');
    await expect(page.locator('.tes-summary')).toContainText('#amazon becomes #online on 3 transactions.');
    await expect(page.locator('.tes-summary')).toContainText('Linked to Shopping.');
    await page.check('.tes-q input[data-mode="move"]');
    await expect(page.locator('select[data-move="cat_groceries"]')).toHaveValue('cat_shopping');
    await page.click('#tes-confirm');

    await expect(page.locator('[data-tag-open="online"]')).toContainText('3 transactions');
    await expect(page.locator('[data-tag-open="amazon"]')).toHaveCount(0);
    expect(await cat(page, 'g1')).toBe('cat_shopping');
    expect(await cat(page, 'd1')).toBe('cat_dining');
  });

  test('Back from the confirm step returns to the form with the edits kept', async ({ page }) => {
    await boot(page);
    await page.click('[data-tag-open="amazon"]');
    await page.fill('#tag-name', 'shop');
    await page.click('#tes-save');
    await expect(page.locator('.tes-summary')).toContainText('#shop already exists');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tes-title')).toHaveText('Edit tag');
    await expect(page.locator('#tag-name')).toHaveValue('shop');
  });
});
