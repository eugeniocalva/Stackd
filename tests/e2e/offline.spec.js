import { test, expect } from '@playwright/test';

// 1.3.0 (GAP-7): Stack'd works with no network at all — everything lives on
// the device. Once loaded, the browser goes offline: logging an expense,
// History, the balance and Settings must all keep working, with no request
// leaving the page and no error in the console.
test.describe('Offline (GAP-7)', () => {
  test('the core app keeps working with the network off', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
      localStorage.setItem('stackd_v1_accounts', JSON.stringify([{ id: 'a1', name: 'Main', type: 'Bank', currency: 'EUR', icon: 'wallet', color: '#0075EB' }]));
      localStorage.setItem('stackd_v1_transactions', JSON.stringify([
        { id: 'ob1', type: 'opening_balance', amount: 100, accountId: 'a1', categoryId: 'cat_balance', date: '2026-01-01', time: '00:00' }
      ]));
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await expect(page.locator('#splash-screen')).toHaveCount(0);
    await expect(page.locator('#dash-total')).toHaveText('€100.00');

    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const requests = [];
    page.on('request', r => { if (!r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
    await context.setOffline(true);

    // log an expense
    await page.click('#nav-fab-toggle');
    await expect(page.locator('#nav-fab-toggle')).toHaveAttribute('aria-expanded', 'true');
    await page.click('#nav-action-menu a[href="#add"]');
    await expect(page.locator('#btn-save-tx')).toBeVisible();
    await page.click('#toggle-expense');
    await page.fill('#tx-amount', '12.50');
    await page.click('#tx-category');
    await page.locator('#csm-category-list .category-select-item[data-id="cat_groceries"]').click();
    await expect(page.locator('#csm-category-list')).toHaveCount(0);
    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);

    // the balance follows, and the other screens open
    await page.goto('/#dashboard').catch(() => {}); // same document: a hash change, no network
    await expect(page.locator('#dash-total')).toHaveText('€87.50');
    await page.evaluate(() => { location.hash = '#analytics'; });
    await expect(page.locator('#router-view')).toBeVisible();
    await page.evaluate(() => { location.hash = '#settings'; });
    await expect(page.locator('#btn-open-currency')).toBeVisible();

    // the data is saved on the device
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stackd_v1_transactions')).length);
    expect(saved).toBe(2);
    expect(errors).toEqual([]);
    // nothing tried the network (lazy icons or fonts already cached are fine)
    expect(requests.filter(u => !/\.(woff2?|svg|png|webp|css|js)(\?|$)/.test(u) && !/^http:\/\/localhost:3000\/?(#.*)?$/.test(u))).toEqual([]);
  });
});
