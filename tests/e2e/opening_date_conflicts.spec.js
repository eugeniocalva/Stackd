import { test, expect } from '@playwright/test';

// 1.0.3 (BUG-137 / BUG-41 / BUG-42): the opening-date warning sheet in Edit
// Account and the transaction form, History's dimmed pre-opening rows, and
// the selection-aware Opening Balance paste. Written blind in the U2
// worktree; run at integration.
test.describe('Opening date conflicts (1.0.3)', () => {
  const bootstrap = async (page) => {
    await page.clock.install({ time: new Date(2026, 9, 5, 12, 0, 0) });
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
  };
  const accId = (page, name) => page.evaluate((n) => window.Store.getState().accounts.find(a => a.name === n).id, name);
  const opening = (page, id) => page.evaluate((a) => window.Store.getAccountOpeningDate(a), id);
  const balance = (page, id) => page.evaluate((a) => Math.round(window.Store.getAccountBalance(a) * 100) / 100, id);

  test('BUG-137: a later opening date in Edit Account warns; "Open on … instead" keeps every row', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-09-01' });
      const id = S.getState().accounts.find(a => a.name === 'Main').id;
      S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 20, accountId: id, categoryId: 'cat_groceries', date: '2026-09-05', comment: '' });
    });
    const main = await accId(page, 'Main');
    await page.evaluate((id) => window.Router.navigate(`#edit-account?id=${id}`), main);
    await page.waitForSelector('#edit-acc-date');
    await page.fill('#edit-acc-date', '2026-09-12');
    await page.click('#btn-edit-acc-save');
    await expect(page.locator('#opening-date-sheet')).toBeVisible();
    await expect(page.locator('#opening-date-sheet')).toContainText('1 entry (-€20.00) is dated before Sep 12, 2026.');
    expect(await opening(page, main)).toBe('2026-09-01');

    await page.click('#opening-date-primary'); // Open on Sep 5, 2026 instead
    await page.waitForFunction(() => window.Store.getState().activeView === 'dashboard');
    expect(await opening(page, main)).toBe('2026-09-05');
    expect(await balance(page, main)).toBe(980);
  });

  test('BUG-41: a back-filled transfer into a later-opened account offers to move its opening date', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-09-01' });
      S.dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-10-01' });
    });
    const main = await accId(page, 'Main');
    const savings = await accId(page, 'Savings');

    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#tx-amount');
    await page.locator('#toggle-transfer').click();
    await page.locator('#tx-amount').fill('50');
    await page.locator('#tx-account').selectOption(main);
    await page.locator('#tx-transfer-to').selectOption(savings);
    await page.fill('#tx-date', '2026-09-15');
    await page.click('#btn-save-tx');

    const sheet = page.locator('#opening-date-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Savings opens on Oct 1, 2026.');
    await expect(sheet).not.toContainText('Main opens');
    await expect(page.locator('#opening-date-primary')).toHaveText('Move opening date to Sep 15, 2026');

    // Back = Cancel: nothing saved, the form stays
    await page.evaluate(() => window.Router.handleBack());
    await expect(sheet).toBeHidden();
    expect(await page.evaluate(() => window.Store.getState().transactions.filter(t => t.transferRef).length)).toBe(0);
    await expect(page.locator('#tx-amount')).toHaveValue('50');

    await page.click('#btn-save-tx');
    await page.click('#opening-date-primary');
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    expect(await opening(page, savings)).toBe('2026-09-15');
    expect(await balance(page, savings)).toBe(50);
    expect(await balance(page, main)).toBe(950);
  });

  test('BUG-41 (D2): "Save anyway" keeps the row, listed dimmed and not counted in History', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2026-10-03' }));
    const main = await accId(page, 'Main');
    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#tx-amount');
    await page.locator('#tx-amount').fill('30');
    await page.locator('#tx-account').selectOption(main);
    await page.locator('#tx-category').selectOption('cat_groceries');
    await page.fill('#tx-date', '2026-10-02');
    await page.click('#btn-save-tx');
    await page.click('#opening-date-anyway');
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    expect(await balance(page, main)).toBe(1000);
    const row = page.locator('#tx-2026-10-02 .list-item');
    await expect(row).toContainText('Before opening balance · not counted');
    await expect(page.locator('#tx-2026-10-02 .day-summary-footer')).toContainText('€0.00');
  });

  test('BUG-42: pasting over the Opening Balance replaces it', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => window.Router.navigate('#edit-account'));
    await page.waitForSelector('#edit-acc-balance');
    const pasteInto = (text) => page.evaluate((t) => {
      const el = document.getElementById('edit-acc-balance');
      el.focus();
      el.setSelectionRange(0, el.value.length);
      const dt = new DataTransfer();
      dt.setData('text/plain', t);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return el.value;
    }, text);
    await page.fill('#edit-acc-balance', '5000'); // 50.00
    await expect(page.locator('#edit-acc-balance')).toHaveValue('50.00');
    expect(await pasteInto('1.234,56')).toBe('1234.56');
    expect(await pasteInto('1500')).toBe('1500.00');
    expect(await pasteInto('99.9')).toBe('99.90');
  });
});
