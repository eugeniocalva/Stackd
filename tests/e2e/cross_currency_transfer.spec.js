import { test, expect } from '@playwright/test';

// 1.0.2 (BUG-35): a transfer between accounts in different currencies asks for
// the amount that arrived and stores each leg in its own currency — €100 out,
// $117 in — instead of one figure on both legs. Written blind in the U8
// worktree; run at integration.
test.describe('Cross-currency transfer', () => {
  const bootstrap = async (page) => {
    await page.clock.install({ time: new Date(2026, 9, 3, 12, 0, 0) });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Views);
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 2000, openingDate: '2026-09-01' });
      S.dispatch('ADD_ACCOUNT', { name: 'US Checking', openingBalance: 1000, openingDate: '2026-09-01', currency: 'USD' });
    });
  };

  const accId = (page, name) => page.evaluate((n) => window.Store.getState().accounts.find(a => a.name === n).id, name);

  test('the received field appears, is required, and the legs keep their own currency', async ({ page }) => {
    await bootstrap(page);
    const main = await accId(page, 'Main');
    const us = await accId(page, 'US Checking');

    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#tx-amount');
    await page.locator('#toggle-transfer').click();
    await page.locator('#tx-amount').fill('100');
    await page.locator('#tx-account').selectOption(main);
    await page.locator('#tx-transfer-to').selectOption(us);

    const group = page.locator('#group-received');
    await expect(group).toBeVisible();
    await expect(page.locator('#label-received')).toHaveText('Amount received (USD)');
    await expect(page.locator('#received-currency-symbol')).toHaveText('$');

    // An empty received amount is refused inline — nothing is stored.
    await page.locator('#btn-save-tx').click();
    await expect(page.locator('#tx-received-amount-error')).toHaveText('Enter the amount received, greater than zero.');
    expect(await page.evaluate(() => window.Store.getState().transactions.filter(t => t.transferRef).length)).toBe(0);

    await page.locator('#tx-received-amount').fill('117');
    await page.locator('#btn-save-tx').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');

    const legs = await page.evaluate(() => window.Store.getState().transactions
      .filter(t => t.transferRef).map(t => ({ type: t.type, amount: t.amount })));
    expect(legs.find(l => l.type === 'expense').amount).toBe(100);
    expect(legs.find(l => l.type === 'income').amount).toBe(117);

    // History shows each leg in its own currency.
    const values = page.locator('.list-item-value');
    await expect(values.filter({ hasText: '-€100.00' })).toHaveCount(1);
    await expect(values.filter({ hasText: '+$117.00' })).toHaveCount(1);

    // The US Checking tile reads $1,117.00.
    await page.evaluate(() => window.Router.navigate('#dashboard'));
    await expect(page.locator(`.wallet-card[data-id="${us}"] .wallet-card-balance`)).toHaveText('$1,117.00');

    // Opening the USD leg shows €100 sent and $117 received.
    const incomeId = await page.evaluate(() => window.Store.getState().transactions.find(t => t.transferRef && t.type === 'income').id);
    await page.evaluate((id) => window.Router.navigate(`#edit?id=${id}`), incomeId);
    await page.waitForSelector('#tx-amount');
    await expect(page.locator('#tx-amount')).toHaveValue('100');
    await expect(page.locator('#currency-symbol')).toHaveText('€');
    await expect(page.locator('#group-received')).toBeVisible();
    await expect(page.locator('#tx-received-amount')).toHaveValue('117');
  });

  // 1.0.3 (BUG-138): switching an existing transfer to Income puts the income
  // on the account the money ARRIVED in, with the amount received. Written
  // blind in the U2 worktree; run at integration.
  test('a transfer switched to Income lands on the To account with the amount received', async ({ page }) => {
    await bootstrap(page);
    const main = await accId(page, 'Main');
    const us = await accId(page, 'US Checking');
    await page.evaluate(({ main, us }) => window.Store.dispatch('ADD_TRANSFER', {
      amount: 100, receivedAmount: 117, expenseAccountId: main, incomeAccountId: us,
      date: '2026-10-02', note: 'FX', tags: []
    }), { main, us });
    const incomeId = await page.evaluate(() => window.Store.getState().transactions.find(t => t.transferRef && t.type === 'income').id);

    await page.evaluate((id) => window.Router.navigate(`#edit?id=${id}`), incomeId);
    await page.waitForSelector('#tx-amount');
    await page.locator('#toggle-income').click();
    await expect(page.locator('#tx-account')).toHaveValue(us);
    await expect(page.locator('#tx-amount')).toHaveValue('117');
    await expect(page.locator('#currency-symbol')).toHaveText('$');

    // Back to Transfer: the pair as it was
    await page.locator('#toggle-transfer').click();
    await expect(page.locator('#tx-account')).toHaveValue(main);
    await expect(page.locator('#tx-transfer-to')).toHaveValue(us);
    await expect(page.locator('#tx-amount')).toHaveValue('100');
    await expect(page.locator('#tx-received-amount')).toHaveValue('117');

    await page.locator('#toggle-income').click();
    await page.locator('#tx-category').selectOption('cat_salary');
    await page.locator('#btn-save-tx').click();
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');

    const rows = await page.evaluate(() => window.Store.getState().transactions
      .filter(t => t.comment === 'FX').map(t => ({ type: t.type, accountId: t.accountId, amount: t.amount, ref: t.transferRef || null })));
    expect(rows).toEqual([{ type: 'income', accountId: us, amount: 117, ref: null }]);
    await page.evaluate(() => window.Router.navigate('#dashboard'));
    await expect(page.locator(`.wallet-card[data-id="${us}"] .wallet-card-balance`)).toHaveText('$1,117.00');
    await expect(page.locator(`.wallet-card[data-id="${main}"] .wallet-card-balance`)).toHaveText('€2,000.00');
  });
});
