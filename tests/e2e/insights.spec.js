import { test, expect } from '@playwright/test';

// v0.84 (docs/refactor-plan.md P6): the Smart Insights section — up to three
// locally-computed cards between the Wallets rail and the widget area.
test.describe('Smart Insights section', () => {
  const bootstrap = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Insights);
  };

  test('hidden on an empty install, appears with data, capped at three cards', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('#insights-section')).toHaveCount(0);

    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'BPI', openingBalance: 9000, openingDate: '2020-01-01' });
      S.dispatch('ADD_ACCOUNT', { name: 'TR', openingBalance: 1000, openingDate: '2020-01-01' });
      const accId = S.getState().accounts[0].id;
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const day = Math.max(1, Math.min(d.getDate() - 1, 27));
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`;
      S.dispatch('ADD_TRANSACTION', { type: 'income', categoryId: 'cat_salary', amount: 1500, accountId: accId, date });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', categoryId: 'cat_rent', amount: 600, accountId: accId, date });
    });

    await expect(page.locator('#insights-section')).toBeVisible();
    const cards = page.locator('#insights-section .insight-card');
    await expect(cards).toHaveCount(3);

    // Sits between the Wallets rail and the widget area.
    const order = await page.evaluate(() => {
      const rail = document.querySelector('.wallets-scroll-wrapper');
      const insights = document.getElementById('insights-section');
      const widgets = document.getElementById('widgets-section');
      return {
        railBeforeInsights: !!(rail.compareDocumentPosition(insights) & Node.DOCUMENT_POSITION_FOLLOWING),
        insightsBeforeWidgets: !!(insights.compareDocumentPosition(widgets) & Node.DOCUMENT_POSITION_FOLLOWING)
      };
    });
    expect(order).toEqual({ railBeforeInsights: true, insightsBeforeWidgets: true });

    // Card content: concentration (BPI 9900 / 10900 = 91%), spending (Rent), outlook.
    await expect(cards.nth(0)).toContainText('91%');
    await expect(cards.nth(0)).toContainText('BPI');
    await expect(cards.nth(1)).toContainText('Rent');
    await expect(cards.nth(2)).toContainText('900'); // +$900 projected

    // Tapping a card jumps to Analytics.
    await cards.nth(1).click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'analytics');
  });
});
