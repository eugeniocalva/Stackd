import { test, expect } from '@playwright/test';

// 1.2.2 (HG-7 P4, docs/smart-insights-plan.md §8): every batch-2 insight
// opens the screen that explains it. The clock is pinned to 15 June 2026 and
// thirteen months of history make every tier-4 rule fire.
test.describe('Smart Insights destinations (P4)', () => {
  const bootstrap = async (page) => {
    await page.clock.install({ time: new Date(2026, 5, 15, 12, 0, 0) });
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
    await page.evaluate(() => {
      const S = window.Store;
      S.batch(() => {
        S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 20000, openingDate: '2024-01-01' });
        const acc = S.getState().accounts[0].id;
        const add = (o) => S.dispatch('ADD_TRANSACTION', Object.assign({ type: 'expense', accountId: acc, categoryId: 'cat_groceries' }, o));
        const pad = (n) => String(n).padStart(2, '0');
        for (let k = 0; k < 13; k++) { // May 2025 … May 2026
          const d = new Date(2025, 4 + k, 1);
          const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
          add({ type: 'income', categoryId: 'cat_salary', amount: 3000, date: `${ym}-01` });
          for (let i = 2; i <= 5; i++) add({ amount: 100, date: `${ym}-0${i}` });
          add({ categoryId: 'cat_dining', amount: 80, date: `${ym}-06` });
        }
        add({ amount: 2000, date: '2025-06-07' }); // a heavy June last year
        add({ categoryId: 'cat_rent', amount: 900, date: '2025-05-01',
          recurrence: { frequency: 'months', interval: 1, startDate: '2025-05-01', endDate: '2027-05-01' } });
        add({ categoryId: 'cat_health', amount: 10, date: '2026-04-01',
          recurrence: { frequency: 'weeks', interval: 1, startDate: '2026-04-01', endDate: '2026-12-31' } });
        for (let i = 1; i <= 3; i++) add({ categoryId: 'cat_dining', amount: 60, date: `2026-06-0${i}` }); // a dining spike
        for (let i = 8; i <= 12; i++) add({ categoryId: null, amount: 20, date: `2026-06-${pad(i)}` });  // no category
        S.dispatch('ADD_LOAN', { name: 'Car', kind: 'active', config: { type: 'personal', principal: 12000, duration: 24,
          durationUnit: 'months', annualRate: 0, firstPaymentDate: '2025-07-15', amortization: 'french' } });
      });
    });
    await page.evaluate(() => { location.hash = '#insights'; });
    await page.waitForSelector('#insights-page');
  };

  const tap = async (page, id) => {
    const link = page.locator(`a[data-insight="${id}"]`).first();
    await link.scrollIntoViewIfNeeded();
    await link.click();
  };
  const view = (page) => page.evaluate(() => window.Store.getState().activeView);

  test('every batch-2 insight shows up at tier 4', async ({ page }) => {
    await bootstrap(page);
    expect(await page.evaluate(() => window.Insights.analyze(window.Store.getState()).tier)).toBe(4);
    for (const id of ['categorySpike', 'budgetSuggest', 'recurringLoad', 'runway', 'balanceTrend', 'loanProgress', 'uncategorized', 'yearOverYear']) {
      await expect(page.locator(`a[data-insight="${id}"]`), id).toHaveCount(1);
    }
    await expect(page.locator('section[aria-labelledby="insights-sec-tidy"] h2')).toHaveText('Tidy up');
  });

  test('unusual spending → History on that category this month', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('a[data-insight="categorySpike"]')).toContainText('Dining Out is already above your usual month');
    await tap(page, 'categorySpike');
    await expect.poll(() => view(page)).toBe('transactions');
    expect(await page.evaluate(() => window.Store.getState().historyFilters.categories)).toEqual(['cat_dining']);
  });

  test('budget idea → Goals, on that category\'s limit editor', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('a[data-insight="budgetSuggest"]')).toContainText('Set a budget for Groceries?');
    await tap(page, 'budgetSuggest');
    await expect.poll(() => view(page)).toBe('budget');
    await expect(page.locator('#bdg-amount')).toBeVisible();
    expect(await page.evaluate(() => window.Views.BudgetView.editCategoryId)).toBe('cat_groceries');
  });

  test('recurring payments → a sheet listing them, over the page; Escape closes it', async ({ page }) => {
    await bootstrap(page);
    const link = page.locator('a[data-insight="recurringLoad"]');
    await expect(link).toHaveAttribute('aria-haspopup', 'dialog');
    await tap(page, 'recurringLoad');
    const sheet = page.locator('#recurring-payments-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.recurring-sheet-row')).toHaveCount(2);
    await expect(sheet.locator('.recurring-sheet-row').first()).toContainText('Rent');
    await expect(page.locator('#recurring-payments-sheet-done')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    expect(await view(page)).toBe('insights');
  });

  test('balance cover and balance trend → the balance graph sheet, over the page', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('a[data-insight="balanceTrend"]')).toHaveAttribute('aria-haspopup', 'dialog');
    await tap(page, 'runway');
    await expect(page.locator('#expanded-graph-modal')).toBeVisible();
    expect(await view(page)).toBe('insights');
  });

  test('loan progress → that loan\'s results', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('a[data-insight="loanProgress"]')).toContainText('of Car');
    await tap(page, 'loanProgress');
    await expect.poll(() => view(page)).toBe('debt-results');
    const id = await page.evaluate(() => window.Store.getState().loans[0].id);
    expect(await page.evaluate(() => location.hash)).toBe(`#debt-results?id=${encodeURIComponent(id)}`);
  });

  test('no category → History on the uncategorized rows of the last 60 days', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('a[data-insight="uncategorized"]')).toContainText('5 transactions have no category');
    await tap(page, 'uncategorized');
    await expect.poll(() => view(page)).toBe('transactions');
    const f = await page.evaluate(() => window.Store.getState().historyFilters);
    expect(f.categories).toEqual(['uncategorized']);
    expect(f.period).toMatchObject({ type: 'custom', start: '2026-04-17', end: '2026-06-15' });
  });

  test('year on year → Analytics on this month', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('a[data-insight="yearOverYear"]')).toContainText('less than by this day last year');
    await tap(page, 'yearOverYear');
    await expect.poll(() => view(page)).toBe('analytics');
    expect(await page.evaluate(() => window.Store.getState().analyticsFilters.period.value.slice(0, 7))).toBe('2026-06');
  });
});
