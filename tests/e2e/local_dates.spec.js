import { test, expect } from '@playwright/test';

// 1.0.2 (U4: BUG-28 / BUG-67 / BUG-69) Local calendar days in the aggregates.
// Written blind and verified at integration (the integrator also runs it on
// efcac0c, where every test except the U2 default-date check must fail).
//
// The zone is pinned to a UTC+ zone: the owner's Lisbon machine (UTC+0 in
// winter) and a UTC CI runner both hide these bugs. Every clock is an ISO
// string with an EXPLICIT offset, never local Date fields, so the instant is
// the same whatever zone the runner itself is in. The clock keeps flowing
// after install (history_scroll precedent), so modal/scroll timers still run;
// fastForward moves it across midnight.
test.use({ timezoneId: 'Europe/Rome' });

const boot = async (page, iso) => {
  await page.clock.install({ time: new Date(iso) });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Views && !!window.Widgets);
  await page.evaluate(() => window.Store.dispatch('SET_CURRENCY', 'EUR'));
};

const go = async (page, hash, view) => {
  await page.evaluate((h) => window.Router.navigate(h), hash);
  await page.waitForFunction((v) => window.Store.getState().activeView === v, view);
};

const historyPeriod = (page) => page.evaluate(() => window.Store.state.historyFilters.period.value);
const analyticsPeriod = (page) => page.evaluate(() => window.Store.state.analyticsFilters.period.value);

// "Main" €3,000 opened 1 Sep with three plain October expenses (−€125.55).
const seedOctober = (page, { rent = false, nov1 = 0 } = {}) => page.evaluate(({ rent, nov1 }) => {
  const S = window.Store;
  S.dispatch('ADD_ACCOUNT', { id: 'acc_main', name: 'Main', openingBalance: 3000, openingDate: '2026-09-01' });
  [
    ['2026-10-10', 45.30, 'cat_groceries'],
    ['2026-10-15', 30.25, 'cat_transport'],
    ['2026-10-20', 50.00, 'cat_shopping']
  ].forEach(([date, amount, categoryId]) => S.dispatch('ADD_TRANSACTION', {
    type: 'expense', amount, categoryId, accountId: 'acc_main', date, time: '12:00'
  }));
  if (rent) {
    S.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 950, categoryId: 'cat_rent', accountId: 'acc_main', date: '2026-10-01', time: '09:00',
      comment: 'Rent', recurrence: { interval: 1, frequency: 'months', endDate: '2027-03-01' }
    });
  }
  if (nov1) {
    S.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: nov1, categoryId: 'cat_dining', accountId: 'acc_main', date: '2026-11-01', time: '00:01'
    });
  }
}, { rent, nov1 });

const netChangeTile = (page) =>
  page.locator('#router-view').getByText('Net Change', { exact: true }).first().locator('xpath=..');

test.describe('Local dates in aggregates (1.0.2 U4)', () => {
  // BUG-28: a salary on 30 Sep counted for October and a bill on 31 Oct fell
  // out of it, because the net-flow buckets were UTC days.
  test('Income vs Expenses shows October as -€80.00 in Rome', async ({ page }) => {
    await boot(page, '2026-10-03T12:00:00+02:00');
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { id: 'acc_main', name: 'Main Checking', openingBalance: 1000, openingDate: '2026-09-01' });
      S.dispatch('ADD_TRANSACTION', { type: 'income', amount: 2000, categoryId: 'cat_salary', accountId: 'acc_main', date: '2026-09-30', time: '12:00' });
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 80, categoryId: 'cat_utilities', accountId: 'acc_main', date: '2026-10-31', time: '12:00' });
      S.dispatch('ADD_HOME_WIDGET', { type: 'incomeExpense', size: 'small', config: {} });
    });
    await go(page, '#dashboard', 'dashboard');
    const card = page.locator('#widgets-grid .widget-card[data-widget-type="incomeExpense"]');
    await expect(card).toBeVisible();
    await expect(card).toContainText('-€80.00');
    await expect(card).not.toContainText('€2,000.00');
  });

  // BUG-67: 'Last 7 Days' covered 8 days.
  test("History's 'Last 7 Days' covers exactly 7 days ending today", async ({ page }) => {
    await boot(page, '2026-10-03T12:00:00+02:00');
    await seedOctober(page);
    await go(page, '#transactions', 'transactions');
    await page.click('#btn-calendar-history');
    await page.click('#custom-range-modal [data-days="7"]');
    await expect(page.locator('#crm-range-summary')).toContainText('Sep 27, 2026 - Oct 3, 2026');
    await expect(page.locator('#crm-range-summary')).toContainText('(7 days)');
    await page.click('#crm-apply');
    await expect(page.locator('#router-view')).toContainText('Sep 27 – Oct 3');
    expect(await page.evaluate(() => window.Store.state.historyFilters.period))
      .toMatchObject({ type: 'custom', start: '2026-09-27', end: '2026-10-03' });
  });

  // BUG-69 (report path): the app stays open across midnight into 1 Nov; the
  // expense saved for 1 Nov must be listed and Analytics must open November.
  test('History and Analytics follow the calendar after midnight', async ({ page }) => {
    await boot(page, '2026-10-31T23:58:00+01:00');
    await seedOctober(page, { rent: true });
    await go(page, '#transactions', 'transactions');
    await expect(page.locator('#router-view')).toContainText('This Month');
    await expect(page.locator('#router-view')).toContainText('45.30');
    expect(await historyPeriod(page)).toBe('2026-10-01');

    await page.clock.fastForward('05:00'); // 00:03 on Sun 1 Nov

    await page.click('#nav-fab-toggle');
    await page.click('a[href="#add"]');
    await page.waitForSelector('#btn-save-tx');
    await page.click('#toggle-expense');
    await page.fill('#tx-amount', '7.50');
    await page.selectOption('#tx-category', { label: 'Dining Out' });
    await page.fill('#tx-date', '2026-11-01');
    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');

    expect(await historyPeriod(page)).toBe('2026-11-01');
    await expect(page.locator('#router-view')).toContainText('7.50');

    await page.click('#bottom-nav a[href="#analytics"]');
    await page.waitForFunction(() => window.Store.getState().activeView === 'analytics');
    expect(await analyticsPeriod(page)).toBe('2026-11-01');
  });

  // BUG-69 (resume): a WebView kept in memory comes back on a new day. The
  // stale screen still READS 'This Month' (it was rendered before midnight),
  // so the check is the store period plus a figure that differs per month.
  test('resuming on a new day re-anchors Analytics', async ({ page }) => {
    await boot(page, '2026-10-31T23:58:00+01:00');
    await seedOctober(page, { nov1: 12 });
    await go(page, '#analytics', 'analytics');
    await expect(netChangeTile(page)).toContainText('-€125.55');

    await page.clock.fastForward('05:00'); // 00:03 on 1 Nov, nothing tapped
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    await page.waitForFunction(() => window.Store.state.analyticsFilters.period.value === '2026-11-01');
    await expect(netChangeTile(page)).toContainText('-€12.00');
  });

  // BUG-69 (Today): History's Today button on a stale period lands on today.
  test("History's Today after midnight moves to the new month", async ({ page }) => {
    await boot(page, '2026-10-31T23:58:00+01:00');
    await seedOctober(page, { nov1: 12 });
    await go(page, '#transactions', 'transactions');
    await expect(page.locator('#router-view')).not.toContainText('12.00');

    await page.clock.fastForward('05:00');
    await page.click('#btn-today-history');

    await page.waitForFunction(() => window.Store.state.historyFilters.period.value === '2026-11-01');
    await expect(page.locator('#router-view')).toContainText('12.00');
  });

  // Integration-only: needs U2's BUG-38 fix (the form's default date is the
  // local day). Drop this case at integration if U2's own spec asserts it.
  test('after midnight, New Log defaults to the local day (needs U2 BUG-38)', async ({ page }) => {
    await boot(page, '2026-10-31T23:58:00+01:00');
    await seedOctober(page);
    await page.clock.fastForward('05:00');
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#add"]');
    await page.waitForSelector('#btn-save-tx');
    await expect(page.locator('#tx-date')).toHaveValue('2026-11-01');
  });
});
