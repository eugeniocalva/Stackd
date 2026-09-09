import { test, expect } from '@playwright/test';

// Cross-tab sync (src/store.js: the `storage` listener). Two tabs of the app
// share one localStorage, so a change in either has to reach the other or the
// second tab silently shows stale money — and, worse, can overwrite the first
// tab's data from its own stale state.
//
// This started life as crosstab_test.cjs, an ad-hoc script at the repo root
// that nothing ran and that printed emoji to a console. The behaviour had no
// automated coverage at all, so v1.16 (A-14) turned it into a real spec rather
// than deleting the only check that existed.
test.describe('Cross-tab sync', () => {
  const boot = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);
  };

  test('a change in one tab reaches the other, through the real dispatch path', async ({ context }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto('/');
    await tabA.evaluate(() => localStorage.clear());
    await boot(tabA);
    await boot(tabB);

    // Tab B records every render it is asked to do, so we can tell "it synced"
    // apart from "it happened to already agree".
    await tabB.evaluate(() => {
      window.__renders = 0;
      window.Store.subscribe(() => { window.__renders += 1; });
    });

    // Tab A adds an account the way the app does: through a dispatch, which
    // persists via StackdDB and so fires the storage event in tab B.
    await tabA.evaluate(() => window.Store.dispatch('ADD_ACCOUNT', {
      name: 'Shared Wallet', type: 'Bank', icon: 'landmark', openingBalance: 250, openingDate: '2026-01-01'
    }));

    await expect.poll(() => tabB.evaluate(() =>
      window.Store.getState().accounts.map(a => a.name)
    )).toContain('Shared Wallet');

    // The balance is computed from the opening-balance transaction, so the
    // transactions slice must have crossed too, not just the accounts one.
    const balance = await tabB.evaluate(() => {
      const acc = window.Store.getState().accounts.find(a => a.name === 'Shared Wallet');
      return window.Store.getAccountBalance(acc.id);
    });
    expect(balance).toBe(250);
    expect(await tabB.evaluate(() => window.__renders)).toBeGreaterThan(0);
  });

  test('preference changes cross too, and the second tab re-renders in the new language', async ({ context }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto('/');
    await tabA.evaluate(() => localStorage.clear());
    await boot(tabA);
    await boot(tabB);

    await tabA.evaluate(() => window.Store.dispatch('SET_CURRENCY', 'GBP'));
    await expect.poll(() => tabB.evaluate(() => window.Store.getState().currency)).toBe('GBP');

    // Language is the one that also has to re-point I18n, not just the slice.
    await tabA.evaluate(() => window.Store.dispatch('SET_LANGUAGE', 'fr'));
    await expect.poll(() => tabB.evaluate(() => window.Store.getState().language)).toBe('fr');
    await expect.poll(() => tabB.evaluate(() => window.I18n.lang)).toBe('fr');
  });
});
