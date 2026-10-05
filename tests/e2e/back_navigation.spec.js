import { test, expect } from '@playwright/test';

// 1.0.2 (BUG-86, BUG-87): Android Back. Router.handleBack is what the
// Capacitor 'backButton' handler calls, so these drive it directly.
// - BUG-86: the Goals limit editor is a step inside #budget. Back closes it
//   (after "Discard changes?" when a field changed) and never leaves Goals,
//   and leaving Goals closes it (no stale, autofocused editor next time).
// - BUG-87: saves and deletes leave their form through Router.leave, so Back
//   never reopens the form just closed — no 'Transaction not found.' loop, no
//   blank Edit Category, no deleted loan's results page in the way.
// Pixel 7 viewport, clock pinned (time still flows after install).
test.use({ viewport: { width: 412, height: 839 }, hasTouch: true });

const NOT_FOUND = 'Transaction not found.';

const boot = async (page, { pro = false } = {}) => {
  await page.clock.install({ time: new Date(2026, 9, 15, 12, 0, 0) });
  await page.goto('/');
  await page.evaluate((pro) => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
    if (pro) localStorage.setItem('stackd_v1_pro', JSON.stringify({ active: true, productId: 'stackd_pro', platform: 'play', purchasedAt: '2026-09-01T00:00:00.000Z' }));
  }, pro);
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Router && !!window.Views);
  await page.evaluate(() => {
    const S = window.Store;
    S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
    S.dispatch('ADD_TRANSACTION', {
      type: 'expense', amount: 38.75, accountId: S.getState().accounts[0].id,
      categoryId: 'cat_groceries', date: '2026-10-15'
    });
  });
};

const back = (page) => page.evaluate(() => window.Router.handleBack({ canGoBack: true }));
const activeView = (page) => page.evaluate(() => window.Store.getState().activeView);
// A step-back leave() marks its transient entry { left: 1 } until the
// history.back() traversal lands; never navigate while it is pending.
const settled = (page) => page.waitForFunction(() => !(history.state && history.state.left));
const go = async (page, hash, view) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForFunction((v) => window.Store.getState().activeView === v, view);
};
// Records whether #router-view EVER shows 'Transaction not found.'.
const watchNotFound = (page) => page.evaluate((text) => {
  window.__sawNotFound = false;
  const rv = document.getElementById('router-view');
  const check = () => { if (rv.textContent.includes(text)) window.__sawNotFound = true; };
  window.__nfObserver = new MutationObserver(check);
  window.__nfObserver.observe(rv, { childList: true, subtree: true, characterData: true });
}, NOT_FOUND);
const sawNotFound = (page) => page.evaluate(() => window.__sawNotFound);
const nav = (page, view) => page.locator(`#bottom-nav a.nav-item[data-view="${view}"]`);

test.describe('Android Back on the Goals limit editor (1.0.2 BUG-86)', () => {
  test.beforeEach(async ({ page }) => { await boot(page); });

  test('Back after typing a limit asks, Discard closes to the list and stays on Goals', async ({ page }) => {
    await nav(page, 'budget').click();
    await page.click('.budget-cat-row[data-id="cat_groceries"]');
    await page.fill('#bdg-amount', '200');
    expect(await back(page)).toBe('confirm');
    await expect(page.locator('#modal-title')).toHaveText('Discard changes?');
    await page.click('#modal-save-btn');
    await expect(page.locator('.budget-cat-row').first()).toBeVisible();
    await expect(page.locator('#bdg-amount')).toHaveCount(0);
    await expect(page).toHaveURL(/#budget$/);
    const rec = await page.evaluate(() => window.Store.getState().budgets.find(b => b.categoryId === 'cat_groceries'));
    expect(rec).toBeUndefined();
  });

  test('leaving Goals closes the editor: no stale editor, keyboard state or hidden nav on return', async ({ page }) => {
    await nav(page, 'budget').click();
    await page.click('.budget-cat-row[data-id="cat_groceries"]');
    await expect(page.locator('#bdg-amount')).toBeFocused(); // the +100 ms autofocus
    // keyboard-active hides the bottom nav (components.css), so a tap on it
    // would time out: drop the focus first, as the keyboard closing would.
    await page.locator('#bdg-amount').evaluate(el => el.blur());
    await expect(page.locator('body')).not.toHaveClass(/keyboard-active/);
    await nav(page, 'dashboard').click();
    await expect.poll(() => activeView(page)).toBe('dashboard');
    await nav(page, 'budget').click();
    await expect.poll(() => activeView(page)).toBe('budget');
    await expect(page.locator('#bdg-amount')).toHaveCount(0);
    await expect(page.locator('.budget-cat-row').first()).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/keyboard-active/);
    await expect(page.locator('#bottom-nav')).toBeVisible();
  });
});

test.describe('Back after a save or delete never reopens the form (1.0.2 BUG-87)', () => {
  test('delete from Category detail: Back returns to Category detail, never "Transaction not found."', async ({ page }) => {
    await boot(page);
    await go(page, '#settings', 'settings');
    await page.click('#router-view a[href="#categories"]');
    await expect.poll(() => activeView(page)).toBe('categories');
    await page.click('.category-main-link[data-id="cat_groceries"]');
    await expect.poll(() => activeView(page)).toBe('category-detail');
    await page.locator('#router-view .list-item[data-id]').first().click();
    await page.waitForSelector('#btn-delete-tx');
    await watchNotFound(page);

    await page.click('#btn-delete-tx');
    await page.click('#modal-delete-btn');
    await expect(page).toHaveURL(/#transactions$/);
    await settled(page);
    await back(page);
    await expect.poll(() => activeView(page)).toBe('category-detail');
    expect(await sawNotFound(page)).toBe(false);
  });

  test('save from History (no edit): Back does not reopen the form', async ({ page }) => {
    await boot(page);
    await nav(page, 'transactions').click();
    await expect.poll(() => activeView(page)).toBe('transactions');
    await page.locator('#router-view .list-item[data-id]').first().click();
    await page.waitForSelector('#btn-save-tx');
    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);
    await settled(page);
    await back(page);
    await page.waitForTimeout(300);
    expect(await activeView(page)).not.toBe('edit');
    expect(await page.evaluate(() => location.hash)).not.toMatch(/^#edit/);
  });

  test('delete from History: Back does not reopen the form or show "Transaction not found."', async ({ page }) => {
    await boot(page);
    await nav(page, 'transactions').click();
    await expect.poll(() => activeView(page)).toBe('transactions');
    await page.locator('#router-view .list-item[data-id]').first().click();
    await page.waitForSelector('#btn-delete-tx');
    await watchNotFound(page);
    await page.click('#btn-delete-tx');
    await page.click('#modal-delete-btn');
    await expect(page).toHaveURL(/#transactions$/);
    await settled(page);
    await back(page);
    await page.waitForTimeout(300);
    expect(await activeView(page)).not.toBe('edit');
    expect(await page.evaluate(() => location.hash)).not.toMatch(/^#edit/);
    expect(await sawNotFound(page)).toBe(false);
  });

  test('create then delete a category: Back skips both editors and lands on Settings', async ({ page }) => {
    await boot(page, { pro: true });
    const defaults = await page.evaluate(() => window.Store.getState().categories.length);
    await go(page, '#settings', 'settings');
    await page.click('#router-view a[href="#categories"]');
    await expect.poll(() => activeView(page)).toBe('categories');
    await page.click('#btn-create-category');
    await page.waitForSelector('#edit-cat-name');
    await page.fill('#edit-cat-name', 'Gym');
    await page.click('#btn-save-category');
    await expect.poll(() => activeView(page)).toBe('categories');
    await settled(page);

    const gymId = await page.evaluate(() => window.Store.getState().categories.find(c => c.name === 'Gym').id);
    await page.click(`.btn-edit-category[data-id="${gymId}"]`);
    await page.waitForSelector('#btn-delete-category');
    await page.click('#btn-delete-category');
    await page.click('#modal-delete-btn');
    await expect.poll(() => activeView(page)).toBe('categories');
    await settled(page);

    await back(page);
    await expect.poll(() => activeView(page)).toBe('settings');
    await expect(page.locator('#router-view h1', { hasText: 'Edit Category' })).toHaveCount(0);
    expect(await page.evaluate(() => window.Store.getState().categories.length)).toBe(defaults);
  });

  test('loan delete: Back gets past the deleted loan\'s results page', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.Store.dispatch('ADD_LOAN', {
        name: 'Car', kind: 'sim',
        config: {
          type: 'personal', principal: 6000, duration: 24, durationUnit: 'months',
          annualRate: 5, firstPaymentDate: '2026-11-01', amortization: 'french',
          rateChanges: [], earlyRepayments: [], additionalExpenses: []
        }
      });
    });
    await page.goto('/#settings');
    await expect.poll(() => activeView(page)).toBe('settings');
    await go(page, '#debt', 'debt');
    await page.locator('.debt-sim-item, .debt-loan-item').first().click();
    await expect.poll(() => activeView(page)).toBe('debt-results');
    await page.evaluate(() => {
      window.__views = [];
      window.Store.subscribe(s => window.__views.push(s.activeView));
    });

    await page.click('#btn-dres-menu');
    await page.click('.dres-menu-opt[data-act="delete"]');
    await page.click('#modal-delete-btn');
    await expect(page).toHaveURL(/#debt$/);
    await settled(page);
    await back(page);
    await expect.poll(() => activeView(page)).toBe('settings');
    expect(await page.evaluate(() => window.__views)).not.toContain('debt-results');
  });
});
