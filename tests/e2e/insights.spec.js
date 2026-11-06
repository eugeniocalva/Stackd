import { test, expect } from '@playwright/test';

// v0.84: Smart Insights. 1.2.2 (HG-7, docs/smart-insights-plan.md): they left
// Home for their own page (#insights), reached from a 5th tab. Real links
// (keyboard), focus clears the tab bar (WCAG 2.4.11), the page reflows at
// 200 % text, each insight opens the screen that explains it.
test.describe('Insights page', () => {
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
    await page.waitForSelector('#splash-screen', { state: 'detached' });
  };

  // Five entries today (tier 1) across two funded accounts.
  const seed = (page) => page.evaluate(() => {
    const S = window.Store;
    S.dispatch('ADD_ACCOUNT', { name: 'BPI', openingBalance: 9000, openingDate: '2020-01-01' });
    S.dispatch('ADD_ACCOUNT', { name: 'TR', openingBalance: 1000, openingDate: '2020-01-01' });
    const acc = S.getState().accounts.find(a => a.name === 'BPI').id;
    const date = S._todayYMD();
    S.dispatch('ADD_TRANSACTION', { type: 'income', categoryId: 'cat_salary', amount: 1500, accountId: acc, date });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', categoryId: 'cat_rent', amount: 600, accountId: acc, date });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', categoryId: 'cat_dining', amount: 120, accountId: acc, date });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', categoryId: 'cat_transport', amount: 40, accountId: acc, date });
    S.dispatch('ADD_TRANSACTION', { type: 'expense', categoryId: 'cat_groceries', amount: 90, accountId: acc, date });
  });

  const openTab = async (page) => {
    await page.locator('#bottom-nav a.nav-item[data-view="insights"]').click();
    await page.waitForSelector('#insights-page');
  };

  test('a 5th tab opens the page; Home has no insights section any more', async ({ page }) => {
    await bootstrap(page);
    await seed(page);
    const tabs = page.locator('#bottom-nav a.nav-item');
    await expect(tabs).toHaveCount(5);
    const tab = page.locator('#bottom-nav a.nav-item[data-view="insights"]');
    await expect(tab).toHaveAttribute('aria-label', 'Smart Insights');
    // every tab keeps a 44 px target at this width
    for (const box of await tabs.evaluateAll(els => els.map(e => e.getBoundingClientRect().width))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('#insights-section, .insight-card')).toHaveCount(0);
    await openTab(page);
    await expect(tab).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#insights-page h1')).toHaveText('Smart Insights');
    await expect(page.locator('.insight-highlight[data-insight]')).toHaveCount(1);
    await expect(page.locator('a.insight-row[data-insight="accountMix"]')).toContainText('BPI holds most of your money');
  });

  test('a new install gets the starter card, and its button opens the form', async ({ page }) => {
    await bootstrap(page);
    await openTab(page);
    await expect(page.locator('#insights-starter')).toContainText('0 of 5 entries so far.');
    await expect(page.locator('[data-locked]')).toHaveCount(9);
    await page.locator('#insights-starter a.insight-starter-btn').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'add');
  });

  test('keyboard: Tab reaches the insights and Enter opens the filtered screen', async ({ page }) => {
    await bootstrap(page);
    await seed(page);
    await openTab(page);
    let reached = false;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => !!document.activeElement && document.activeElement.matches('a[data-insight="topSpending"]'));
    }
    expect(reached).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    const cats = await page.evaluate(() => window.Store.getState().historyFilters.categories);
    expect(cats).toEqual(['cat_rent']);
  });

  test('a focused insight scrolls clear of the tab bar (WCAG 2.4.11)', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 560 });
    await bootstrap(page);
    await seed(page);
    await openTab(page);
    const links = page.locator('a[data-insight]');
    const n = await links.count();
    await links.nth(n - 1).focus();
    await page.waitForTimeout(300);
    const { linkBottom, navTop } = await page.evaluate(() => {
      const el = document.activeElement.getBoundingClientRect();
      const nav = document.querySelector('#bottom-nav .nav-pill').getBoundingClientRect();
      return { linkBottom: el.bottom, navTop: nav.top };
    });
    expect(linkBottom).toBeLessThanOrEqual(navTop);
  });

  // 1.2.2 (HG-7 P3): a budget over its limit and a payment still unpaid sit
  // under Needs attention; the budget opens Goals on this month.
  test('needs attention: an over budget and an unpaid payment; the budget opens Goals', async ({ page }) => {
    await bootstrap(page);
    await seed(page);
    await page.evaluate(() => {
      const S = window.Store;
      const acc = S.getState().accounts.find(a => a.name === 'BPI').id;
      S.dispatch('SAVE_BUDGET', { categoryId: 'cat_dining', amount: 100, startDate: '', endDate: null, isCumulative: false });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', categoryId: 'cat_utilities', amount: 45, accountId: acc, date: S._todayYMD(), isPaid: false });
      S.dispatch('SET_MONTH_FILTER', '2020-01');
    });
    await openTab(page);
    const attention = page.locator('section[aria-labelledby="insights-sec-attention"]');
    await expect(attention.locator('h2')).toHaveText('Needs attention');
    await expect(attention.locator('a[data-insight="budgetOver"]')).toContainText('Dining Out is over its budget');
    await expect(attention.locator('a[data-insight="overdueUnpaid"]')).toContainText('1 payment past its date is still unpaid');
    await attention.locator('a[data-insight="budgetOver"]').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'budget');
    expect(await page.evaluate(() => window.Store.getState().activeMonthFilter)).toBe(await page.evaluate(() => window.Store._todayYMD().slice(0, 7)));
  });

  // 1.2.2 (HG-7 P2): the opt-in Home widget.
  test('the widget: added from the gallery; the small card opens the page, a large row its own screen; amounts mask', async ({ page }) => {
    await bootstrap(page);
    await seed(page);
    await page.click('#btn-widgets-add-empty');
    await page.click('.widget-gallery-card[data-widget-type="insights"]');
    await expect(page.locator('#awm-confirm')).toHaveText('Add widget');
    await page.click('#awm-confirm');
    const small = page.locator('.widget-card[data-widget-type="insights"]');
    await expect(small).toHaveCount(1);
    await expect(small.locator('.widget-card-title')).toHaveText('Smart Insights');
    await small.locator('a.widget-insight').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'insights');

    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('REMOVE_HOME_WIDGET', { id: S.getState().homeWidgets[0].id });
      S.dispatch('ADD_HOME_WIDGET', { type: 'insights', size: 'large', config: {} });
      location.hash = '#dashboard';
    });
    const large = page.locator('.widget-card[data-widget-type="insights"].widget-card--auto');
    await expect(large.locator('a.widget-insight-row[data-insight]')).toHaveCount(3);
    await expect(large.locator('a.widget-insight-all')).toHaveText('All insights');

    // hidden balances: the outlook's amount masks, the percentages stay
    await page.evaluate(() => window.Store.dispatch('SET_PRIVACY', { hide: true }));
    await expect(large.locator('a[data-insight="monthOutlook"] .widget-insight-figure')).toContainText('••••');
    await expect(large.locator('a[data-insight="topSpending"] .widget-insight-figure')).toHaveText(/\d+%/);
    await page.evaluate(() => window.Store.dispatch('SET_PRIVACY', { hide: false }));

    await large.locator('a[data-insight="topSpending"]').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    expect(await page.evaluate(() => window.Store.getState().historyFilters.categories)).toEqual(['cat_rent']);
  });

  test('reflows at 200 % text: nothing scrolls sideways, no headline is clipped', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await bootstrap(page);
    await seed(page);
    await openTab(page);
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.waitForTimeout(200);
    const res = await page.evaluate(() => {
      const pageEl = document.getElementById('insights-page');
      const clipped = [...pageEl.querySelectorAll('.insight-head, .insight-body')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).length;
      return { overflow: pageEl.scrollWidth - pageEl.clientWidth, docOverflow: document.documentElement.scrollWidth - window.innerWidth, clipped };
    });
    expect(res.overflow).toBeLessThanOrEqual(1);
    expect(res.docOverflow).toBeLessThanOrEqual(1);
    expect(res.clipped).toBe(0);
  });
});
