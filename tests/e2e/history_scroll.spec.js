import { test, expect } from '@playwright/test';

// v0.80 (docs/refactor-plan.md Phase 2.2): entering selection mode — and every
// interaction inside it — must preserve the History scroll position. The old
// unconditional scrollToToday in attachEvents yanked the list back to today's
// date group on every store dispatch, losing the user's place mid-selection.
test.describe('History scroll preservation', () => {
  const bootstrap = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Views);

    // A month of daily transactions so the list is long enough to scroll.
    await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 5000, openingDate: '2020-01-01' });
      const accId = S.getState().accounts[0].id;
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const lastDay = Math.max(1, Math.min(d.getDate(), 28));
      for (let day = 1; day <= lastDay; day++) {
        S.dispatch('ADD_TRANSACTION', {
          accountId: accId, categoryId: 'cat_groceries', type: 'expense',
          amount: 10 + day, date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(day)}`
        });
      }
    });

    await page.evaluate(() => window.Router.navigate('#transactions'));
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    // Let the entry scroll-to-today (rAF + smooth) settle before measuring.
    await page.waitForTimeout(900);
  };

  const scrollTop = (page) => page.evaluate(() => document.getElementById('router-view').scrollTop);

  test('long-press keeps the scroll position and one selection bar', async ({ page }) => {
    await bootstrap(page);

    // Move away from the entry position to a past day. v0.93: the list's
    // scroll-snap nudges an arbitrary scrollTop onto the nearest row edge a
    // few ms later — settle first, or `before` races the nudge and the
    // assertion measures the setup, not the selection flow.
    await page.evaluate(() => { document.getElementById('router-view').scrollTop = 120; });
    await page.waitForTimeout(150);
    const before = await scrollTop(page);

    // Long-press (mousedown held past the 500ms timer) on a visible item.
    const item = page.locator('.list-item[data-id]').nth(1);
    const box = await item.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();

    await page.waitForFunction(() => window.Store.getState().isSelectionMode);
    await page.waitForTimeout(400); // any stray smooth-scroll would move it here
    expect(Math.abs(await scrollTop(page) - before)).toBeLessThanOrEqual(2);

    // v0.80: single selection UI — the sticky top bar; the floating bottom
    // duplicate is gone.
    await expect(page.locator('.contextual-header-bar')).toBeVisible();
    await expect(page.locator('.bulk-selection-bar')).toHaveCount(0);
    await expect(page.locator('#btn-bulk-delete-header')).toBeVisible();

    // Toggling another row's selection re-renders again — still no jump.
    // Raw coordinate click: locator.click() would auto-scroll the row into
    // view and corrupt the measurement.
    const second = page.locator('.list-item[data-id]').nth(2);
    const box2 = await second.boundingBox();
    await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.waitForTimeout(400);
    expect(Math.abs(await scrollTop(page) - before)).toBeLessThanOrEqual(2);
    await expect(page.locator('.selection-count-label').first()).toContainText('2 Selected');
  });

  test('entering History still lands on today', async ({ page }) => {
    await bootstrap(page);
    // The entry scroll targets today's date group (the last seeded day) which
    // sits deep in the oldest-first list — so we must NOT be at the top.
    expect(await scrollTop(page)).toBeGreaterThan(50);
  });

  // v0.94 (docs/refactor-plan-2.md P2.2): the floating back-to-top button.
  test('back-to-top button appears when deep-scrolled and returns to the top', async ({ page }) => {
    await bootstrap(page);

    // Entry scroll already put us deep (see the test above); the boot-time
    // scroll listener flags the container and CSS reveals the button.
    await page.evaluate(() => { document.getElementById('router-view').scrollTop = 600; });
    await page.waitForFunction(() =>
      document.getElementById('router-view').classList.contains('is-deep-scrolled'));
    const btn = page.locator('#btn-history-to-top');
    await expect(btn).toBeVisible();

    await btn.click();
    // Native smooth scroll — wait for it to land at (or clamp to) the top.
    await page.waitForFunction(() => document.getElementById('router-view').scrollTop <= 4);
    // The flag drops with the scroll, so CSS hides the button again.
    await page.waitForFunction(() =>
      !document.getElementById('router-view').classList.contains('is-deep-scrolled'));
  });
});
