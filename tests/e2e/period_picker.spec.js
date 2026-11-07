import { test, expect } from '@playwright/test';

// 1.2.2 (HG-10 P3, docs/period-picker-plan.md §0): the period pill of History
// and Analytics, its context chips and the Period sheet (Month · Year and a
// custom-range calendar). The clock is pinned to 31 Oct 2026 — the month-end
// that made ‹ stall before (BUG-64).
const boot = async (page, iso = '2026-10-31T12:00:00+01:00') => {
  await page.clock.install({ time: new Date(iso) });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Views);
  await page.waitForSelector('#splash-screen', { state: 'detached' });
  await page.evaluate(() => {
    const S = window.Store;
    S.dispatch('SET_CURRENCY', 'EUR');
    S.batch(() => {
      S.dispatch('ADD_ACCOUNT', { id: 'acc_a', name: 'Main', openingBalance: 1000, openingDate: '2025-01-01' });
      S.dispatch('ADD_ACCOUNT', { id: 'acc_b', name: 'Savings', openingBalance: 500, openingDate: '2025-01-01' });
      S.dispatch('ADD_ACCOUNT', { id: 'acc_c', name: 'Cash', openingBalance: 50, openingDate: '2025-01-01' });
      [['2026-10-03', 20, 'acc_a'], ['2026-10-20', 30, 'acc_b'], ['2026-09-12', 15, 'acc_a'], ['2026-09-25', 40, 'acc_c'], ['2025-06-10', 9, 'acc_a']]
        .forEach(([date, amount, accountId]) => S.dispatch('ADD_TRANSACTION', { type: 'expense', amount, accountId, categoryId: 'cat_groceries', date }));
    });
  });
};

const go = async (page, hash, view) => {
  await page.evaluate((h) => window.Router.navigate(h), hash);
  await page.waitForFunction((v) => window.Store.getState().activeView === v, view);
};

test.describe('Period picker (HG-10)', () => {
  test('‹ on the 31st reaches September in one tap; the back chip returns to this month', async ({ page }) => {
    await boot(page);
    await go(page, '#transactions', 'transactions');
    const label = page.locator('#period-label-history');
    await expect(label).toContainText('October 2026');
    await expect(page.locator('#period-now-history')).toHaveCount(0); // on the current month
    await page.click('#period-prev-history');
    await expect(label).toContainText('September 2026');
    await expect(page.locator('#period-prev-history')).toHaveAttribute('aria-label', 'Previous: August 2026');
    await expect(page.locator('.list-item[data-id]')).toHaveCount(2);
    await page.click('#period-now-history');
    await expect(label).toContainText('October 2026');
    await expect(page.locator('#period-now-history')).toHaveCount(0);
  });

  test('the sheet: a month, a year, and the custom calendar with its Back chain', async ({ page }) => {
    await boot(page);
    await go(page, '#transactions', 'transactions');
    await page.click('#period-label-history');
    const sheet = page.locator('#period-sheet');
    await expect(sheet.locator('.period-cell.is-current')).toHaveAttribute('aria-current', 'date');
    await sheet.locator('[data-value="2026-06-01"]').click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('#period-label-history')).toContainText('June 2026');
    await expect(page.locator('#period-label-history')).toBeFocused(); // focus back on the name

    await page.click('#period-label-history');
    await sheet.locator('[data-unit="year"]').click();
    await expect(sheet.locator('[data-unit="year"]')).toHaveAttribute('aria-checked', 'true');
    await sheet.locator('[data-value="2025-01-01"]').click();
    await expect(page.locator('#period-label-history')).toContainText('2025');
    await expect(page.locator('.list-item[data-id]')).toHaveCount(4); // 3 opening balances (1 Jan 2025) + June
    await expect(page.locator('#period-now-history')).toContainText('This year');

    // custom: Escape steps back to the grid, then closes
    await page.click('#period-label-history');
    await sheet.locator('[data-k="custom"]').click();
    await expect(sheet.locator('.period-sheet-title')).toHaveText('Custom range');
    await page.keyboard.press('Escape');
    await expect(sheet.locator('.period-sheet-title')).toHaveText('Period');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });

  test('a one-day custom range, and ‹ › step it by its length', async ({ page }) => {
    await boot(page);
    await go(page, '#transactions', 'transactions');
    await page.click('#period-label-history');
    await page.click('#period-sheet [data-k="custom"]');
    await page.click('#period-sheet [data-day="2026-10-20"]');
    await expect(page.locator('#period-sheet .period-cal-status')).toHaveText('Now pick the last day');
    await page.click('#period-sheet [data-k="done"]');
    expect(await page.evaluate(() => window.Store.state.historyFilters.period)).toMatchObject({ type: 'custom', start: '2026-10-20', end: '2026-10-20' });
    await expect(page.locator('.list-item[data-id]')).toHaveCount(1);
    await page.click('#period-next-history');
    expect(await page.evaluate(() => window.Store.state.historyFilters.period)).toMatchObject({ start: '2026-10-21', end: '2026-10-21' });
  });

  test('filters show as chips; Clear all keeps the period and the sort', async ({ page }) => {
    await boot(page);
    await go(page, '#transactions', 'transactions');
    await page.click('#period-prev-history');
    await page.evaluate(() => window.Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: ['acc_a', 'acc_c'], categories: ['cat_groceries'], sortOrder: 'desc' } }));
    await expect(page.locator('.period-bar [data-filter-kind="accounts"]')).toContainText('Main, Cash');
    await expect(page.locator('.period-bar [data-filter-kind="categories"]')).toContainText('Groceries');
    await expect(page.locator('#btn-filter-history')).toHaveAttribute('aria-label', 'Filters, 2 active');
    await page.click('#period-clear-history');
    await expect(page.locator('.period-bar [data-filter-kind]')).toHaveCount(0);
    const f = await page.evaluate(() => window.Store.state.historyFilters);
    expect(f.period.value).toBe('2026-09-01');
    expect(f.sortOrder).toBe('desc');
  });

  test('keyboard: repeated ‹ keeps the focus on the arrow across re-renders', async ({ page }) => {
    await boot(page);
    await go(page, '#transactions', 'transactions');
    await page.focus('#period-prev-history');
    await page.keyboard.press('Enter');
    await expect(page.locator('#period-label-history')).toContainText('September 2026');
    await expect(page.locator('#period-prev-history')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#period-label-history')).toContainText('August 2026');
    await expect(page.locator('#period-prev-history')).toBeFocused();
  });

  test('Analytics: the same pill; a custom range draws bars and names its comparison', async ({ page }) => {
    await boot(page);
    await go(page, '#analytics', 'analytics');
    await expect(page.locator('#period-label-analytics')).toContainText('October 2026');
    await page.evaluate(() => window.Store.dispatch('UPDATE_FILTERS', { page: 'analytics', filters: { period: { type: 'custom', value: '', start: '2026-10-01', end: '2026-10-20' } } }));
    await expect(page.locator('#netFlowChart')).toHaveCount(1);
    await expect(page.locator('#router-view')).not.toContainText('Chart not available');
    await expect(page.locator('#router-view')).toContainText('vs Sep 11 – Sep 30');
  });

  test('French at 360 px: the header fits without sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await boot(page);
    await page.evaluate(() => window.Store.dispatch('SET_LANGUAGE', 'fr'));
    await go(page, '#transactions', 'transactions');
    await page.click('#period-prev-history');
    await page.evaluate(() => window.Store.dispatch('UPDATE_FILTERS', { page: 'history', filters: { accounts: ['acc_a', 'acc_b'], categories: ['cat_groceries'] } }));
    await expect(page.locator('#period-label-history')).toContainText('septembre 2026');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
    const sticky = await page.evaluate(() => {
      const h = document.getElementById('history-sticky-header').getBoundingClientRect();
      return [...document.querySelectorAll('#history-sticky-header button')].every(b => { const r = b.getBoundingClientRect(); return r.right <= h.right + 1 && r.left >= h.left - 1; });
    });
    expect(sticky).toBe(true);
  });
});
