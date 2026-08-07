import { test, expect } from '@playwright/test';

// v0.72 home dashboard widgets (docs/home-widgets-plan.md §8, Phases 1-2):
// the widget area replaced the static "Financial Milestone" card. Covers the
// add flow (gallery → config → add), edit mode (reorder / resize / remove /
// configure) and persistence across a real reload.
test.describe('Home dashboard widgets', () => {
  const bootstrap = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      // Deliberately-empty widget area: an absent key fires the v0.72 Phase 5
      // upgrade seed (its own spec below), which would shift every count here.
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    // A real navigation barrier: #widgets-section is rendered by the app, but
    // page.reload() guarantees we are not asserting against the old document.
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Widgets);

    // Seed an account plus dated activity so the widgets have something to draw.
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2020-01-01' });
      const accId = S.getState().accounts[0].id;
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const inMonth = (day) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`;
      const day = Math.max(1, Math.min(d.getDate() - 1, 27));
      [
        { categoryId: 'cat_salary', type: 'income', amount: 2500 },
        { categoryId: 'cat_groceries', type: 'expense', amount: 220 },
        { categoryId: 'cat_transport', type: 'expense', amount: 80 }
      ].forEach(t => S.dispatch('ADD_TRANSACTION', { ...t, accountId: accId, date: inMonth(day) }));
    });
    await page.waitForSelector('#widgets-section');
  };

  const scrollToWidgets = async (page) => {
    await page.locator('#widgets-section').scrollIntoViewIfNeeded();
  };

  test('the old Financial Milestone card is gone', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('#router-view')).not.toContainText('Financial Milestone');
    await expect(page.locator('#router-view')).not.toContainText('Coming Soon');
    await expect(page.locator('#widgets-section')).toBeVisible();
  });

  test('recent activities is gone and a fresh install is seeded with the latest widget', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      // NO homeWidgets key: this is the upgrade / fresh-install path.
    });
    await page.reload();
    await page.waitForSelector('#widgets-section');

    // The section is gone from the dashboard...
    await expect(page.locator('#router-view')).not.toContainText('Recent Activities');
    // ...and its replacement was seeded: one wide latest widget.
    await expect(page.locator('#widgets-grid .widget-card')).toHaveCount(1);
    await expect(page.locator('#widgets-grid .widget-card--large')).toContainText('Latest transactions');

    // Feature parity: tapping a row jumps to that transaction in History.
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2020-01-01' });
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      S.dispatch('ADD_TRANSACTION', {
        accountId: S.getState().accounts[0].id, categoryId: 'cat_groceries',
        type: 'expense', amount: 42, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      });
    });
    await page.locator('#widgets-grid .widget-row[data-tx-id]').first().click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
  });

  test('adds a no-config widget via the detail preview', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await bootstrap(page);
    await scrollToWidgets(page);

    // Empty state first.
    await expect(page.locator('#btn-widgets-add-empty')).toBeVisible();
    await expect(page.locator('.widget-card')).toHaveCount(0);

    await page.click('#btn-widgets-add-empty');
    await expect(page.locator('#add-widget-modal')).toBeVisible();
    await page.click('.widget-gallery-card[data-widget-type="latest"]');

    // Detail step: live preview of the real card, and a direct add (no config).
    await expect(page.locator('.widget-preview-stage')).toBeVisible();
    await expect(page.locator('.widget-preview-stage .widget-card')).toContainText('Latest transactions');
    await expect(page.locator('#awm-confirm')).toHaveText('Add widget');

    await page.click('#awm-confirm');
    await expect(page.locator('#add-widget-modal')).toHaveCount(0);
    await expect(page.locator('#widgets-grid .widget-card')).toHaveCount(1);
    await expect(page.locator('#widgets-grid .widget-card')).toContainText('Latest transactions');
    await expect(page.locator('#widgets-grid .widget-row')).toHaveCount(3);

    expect(errors).toEqual([]);
  });

  test('the size carousel changes the preview and the added widget', async ({ page }) => {
    await bootstrap(page);
    await scrollToWidgets(page);

    await page.click('#btn-widgets-add-empty');
    await page.click('.widget-gallery-card[data-widget-type="netWorth"]');

    // Defaults to small.
    await expect(page.locator('.widget-size-caption')).toHaveText('Small');
    await expect(page.locator('.widget-preview-stage .widget-card--large')).toHaveCount(0);

    // Flip to wide: the preview re-renders at the other size.
    await page.click('.widget-size-dot[data-size="large"]');
    await expect(page.locator('.widget-size-caption')).toHaveText('Wide');
    await expect(page.locator('.widget-preview-stage .widget-card--large')).toHaveCount(1);

    // netWorth is configurable, so the detail step advances rather than adding.
    await expect(page.locator('#awm-confirm')).toHaveText('Next');
    await page.click('#awm-confirm');
    await expect(page.locator('#awm-config')).toBeVisible();
    await page.click('#awm-confirm');

    await expect(page.locator('#add-widget-modal')).toHaveCount(0);
    // The size chosen in the carousel is the size that gets added.
    const size = await page.evaluate(() => window.Store.getState().homeWidgets[0].size);
    expect(size).toBe('large');
    await expect(page.locator('#widgets-grid .widget-card--large')).toHaveCount(1);
  });

  test('walks the config step when adding a configurable widget', async ({ page }) => {
    await bootstrap(page);
    await scrollToWidgets(page);

    await page.click('#btn-widgets-add-empty');
    await page.click('.widget-gallery-card[data-widget-type="categories"]');

    // Detail first, then config.
    await expect(page.locator('.widget-preview-stage')).toBeVisible();
    await expect(page.locator('#awm-confirm')).toHaveText('Next');
    await page.click('#awm-confirm');

    await expect(page.locator('#awm-config')).toBeVisible();
    await expect(page.locator('#awm-confirm')).toHaveText('Add widget');

    // Picking a specific category reveals and uses the category chips.
    await page.click('[data-config-key="mode"][data-config-value="selected"]');
    await expect(page.locator('[data-config-multi="categoryIds"]').first()).toBeVisible();
    await page.click('[data-config-multi="categoryIds"][data-config-value="cat_groceries"]');

    await page.click('#awm-confirm');
    await expect(page.locator('#add-widget-modal')).toHaveCount(0);

    const config = await page.evaluate(() => window.Store.getState().homeWidgets[0].config);
    expect(config.mode).toBe('selected');
    expect(config.categoryIds).toEqual(['cat_groceries']);
    await expect(page.locator('#widgets-grid .widget-donut')).toBeVisible();
  });

  test('the back arrow walks back config → detail → gallery without adding', async ({ page }) => {
    await bootstrap(page);
    await scrollToWidgets(page);

    await page.click('#btn-widgets-add-empty');
    await page.click('.widget-gallery-card[data-widget-type="categories"]');
    await expect(page.locator('.widget-preview-stage')).toBeVisible();

    await page.click('#awm-confirm');                       // detail → config
    await expect(page.locator('#awm-config')).toBeVisible();

    await page.click('#awm-left');                          // config → detail
    await expect(page.locator('.widget-preview-stage')).toBeVisible();
    await expect(page.locator('#awm-config')).toHaveCount(0);

    await page.click('#awm-left');                          // detail → gallery
    await expect(page.locator('.widget-gallery-grid')).toBeVisible();
    await expect(page.locator('#awm-confirm')).toHaveCount(0);

    await page.click('#awm-left');                          // gallery → closed
    await expect(page.locator('#add-widget-modal')).toHaveCount(0);
    await expect(page.locator('.widget-card')).toHaveCount(0);
  });

  test('reorders, resizes, reconfigures and removes in edit mode', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await bootstrap(page);
    // Two widgets via the store so the test focuses on edit mode itself.
    await page.evaluate(() => {
      window.Store.dispatch('ADD_HOME_WIDGET', { type: 'latest', size: 'small' });
      window.Store.dispatch('ADD_HOME_WIDGET', { type: 'categories', size: 'small' });
    });
    await scrollToWidgets(page);
    await expect(page.locator('.widget-card')).toHaveCount(2);

    await page.click('#btn-widgets-edit');
    await expect(page.locator('#btn-widgets-edit')).toHaveText('Done');
    await expect(page.locator('#widgets-grid')).toHaveClass(/is-editing/);

    // Only the configurable widget offers a gear.
    await expect(page.locator('[data-widget-action="configure"]')).toHaveCount(1);

    // Reorder: move the first card down.
    const typesBefore = await page.evaluate(() => window.Store.getState().homeWidgets.map(w => w.type));
    await page.locator('.widget-card').first().locator('[data-widget-action="move-down"]').click();
    const typesAfter = await page.evaluate(() => window.Store.getState().homeWidgets.map(w => w.type));
    expect(typesAfter).toEqual([...typesBefore].reverse());

    // Resize the first card to wide.
    await page.locator('.widget-card').first().locator('[data-widget-action="toggle-size"]').click();
    await expect(page.locator('.widget-card--large')).toHaveCount(1);

    // Gear reopens the sheet directly on the config step for that widget.
    await page.locator('[data-widget-action="configure"]').click();
    await expect(page.locator('#awm-confirm')).toHaveText('Save changes');
    await page.click('[data-config-key="direction"][data-config-value="income"]');
    await page.click('#awm-confirm');
    await expect(page.locator('#add-widget-modal')).toHaveCount(0);
    const direction = await page.evaluate(() =>
      window.Store.getState().homeWidgets.find(w => w.type === 'categories').config.direction);
    expect(direction).toBe('income');

    // Remove one.
    await page.locator('.widget-card').first().locator('[data-widget-action="remove"]').click();
    await expect(page.locator('.widget-card')).toHaveCount(1);

    expect(errors).toEqual([]);
  });

  test('upcoming and budgets widgets render real engine data (phase 4)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await bootstrap(page);
    await page.evaluate(() => {
      const S = window.Store;
      const accId = S.getState().accounts[0].id;
      const pad = (n) => String(n).padStart(2, '0');
      const off = (days) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      };
      // A real recurring series: ADD_TRANSACTION materialises future members.
      S.dispatch('ADD_TRANSACTION', {
        accountId: accId, categoryId: 'cat_utilities', type: 'expense', amount: 45,
        date: off(-25),
        recurrence: { interval: 1, frequency: 'weeks', startDate: off(-25), endDate: off(60) }
      });
      // An untracked active loan whose first payment is inside 30 days.
      S.dispatch('ADD_LOAN', {
        name: 'E2E Loan', kind: 'active',
        config: { type: 'personal', principal: 1200, duration: 12, durationUnit: 'months', annualRate: 5, firstPaymentDate: off(10), amortization: 'french' }
      });
      // A budget with spend this month.
      S.dispatch('SAVE_BUDGET', { categoryId: 'cat_utilities', amount: 300, startDate: '', endDate: null, isCumulative: false });
      S.dispatch('ADD_HOME_WIDGET', { type: 'upcoming', size: 'large' });
      S.dispatch('ADD_HOME_WIDGET', { type: 'budgets', size: 'large' });
    });
    await scrollToWidgets(page);

    const upcoming = page.locator('.widget-card[data-widget-type="upcoming"]');
    await expect(upcoming).toContainText('Utilities');       // materialised member
    await expect(upcoming).toContainText('E2E Loan');        // untracked loan row
    await expect(upcoming).toContainText('Net impact');

    const budgets = page.locator('.widget-card[data-widget-type="budgets"]');
    await expect(budgets).toContainText('Utilities');
    await expect(budgets).toContainText('of $300.00 budgeted');
    await expect(budgets.locator('.widget-minibar')).toHaveCount(1);

    // Track the loan by giving it a live series → its synthetic row must vanish.
    await page.evaluate(() => {
      const S = window.Store;
      const accId = S.getState().accounts[0].id;
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date(); d.setDate(d.getDate() + 10);
      const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const loan = S.getState().loans.find(l => l.name === 'E2E Loan');
      loan.linkedSeriesId = 'e2e-loan-series';
      S.state.transactions.push({
        id: 'e2e-loan-tx', accountId: accId, categoryId: 'cat_debt', type: 'expense',
        amount: 102.73, date,
        recurrence: { seriesId: 'e2e-loan-series', interval: 1, frequency: 'months', startDate: date, endDate: date },
        createdAt: new Date().toISOString()
      });
      S.dispatch('TOGGLE_WIDGET_EDIT_MODE', true);  // any dispatch to re-render
      S.dispatch('TOGGLE_WIDGET_EDIT_MODE', false);
    });
    await expect(upcoming).not.toContainText('E2E Loan');    // no double-count
    await expect(upcoming).toContainText('Loan Payment');    // the series member instead

    expect(errors).toEqual([]);
  });

  test('survives a reload and clears edit mode on navigation', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => {
      window.Store.dispatch('ADD_HOME_WIDGET', { type: 'incomeExpense', size: 'large' });
    });
    await scrollToWidgets(page);
    await expect(page.locator('.widget-card--large')).toHaveCount(1);
    await expect(page.locator('.widget-chart-wrap canvas')).toBeVisible();

    // Edit mode must not survive leaving the dashboard.
    await page.click('#btn-widgets-edit');
    await expect(page.locator('#widgets-grid')).toHaveClass(/is-editing/);
    await page.click('a[href="#transactions"]');
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    await page.click('a[href="#dashboard"]');
    await page.waitForSelector('#widgets-section');
    await expect(page.locator('#widgets-grid')).not.toHaveClass(/is-editing/);

    // And the widget itself survives a real reload.
    await page.reload();
    await page.waitForSelector('#widgets-section');
    await expect(page.locator('.widget-card--large')).toHaveCount(1);
    await expect(page.locator('.widget-chart-wrap canvas')).toBeVisible();
  });
});
