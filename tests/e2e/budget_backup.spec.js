import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

// v1.19: budgets in the CSV backup. Drives the real Settings screen end to end:
// the Export Budgets button downloads a file, the app is wiped as if it were a
// new phone, and the SAME file goes back in through the one Import CSV button.
// Unit tests cover the parsing (tests/unit/budgetCsvRoundTrip.test.js); this
// proves the wiring — button, download, routing and the result message.
test.describe('Budget backup E2E', () => {
  const freshInstall = async (page) => {
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);
  };

  const goToSettings = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-import-csv');
  };

  test('a budget survives export, a wiped app, and import', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    await page.goto('/');
    await freshInstall(page);
    await page.evaluate(() => {
      window.Store.dispatch('ADD_CATEGORY', { name: 'Hobbies', icon: 'guitar', typeHint: 'expense' });
      const hobbies = window.Store.getState().categories.find(c => c.name === 'Hobbies');
      window.Store.dispatch('SAVE_BUDGET', { categoryId: 'cat_groceries', amount: 300, startDate: '2026-01', endDate: null, isCumulative: true });
      window.Store.dispatch('SAVE_BUDGET', { categoryId: hobbies.id, amount: 45.5, startDate: '2026-03', endDate: '2026-08', isCumulative: false });
    });

    // ── Export through the button ──────────────────────────────────────────
    await goToSettings(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-export-budgets')
    ]);
    expect(download.suggestedFilename()).toBe('stackd_budgets.csv');
    const csv = readFileSync(await download.path(), 'utf8');
    expect(csv).toContain('Category,Amount,StartMonth,EndMonth,Cumulative');
    expect(csv).toContain('Hobbies,45.5,2026-03,2026-08,false');

    // ── A new phone ────────────────────────────────────────────────────────
    await freshInstall(page);
    expect(await page.evaluate(() => window.Store.getState().budgets.length)).toBe(0);

    // ── Import the same file through the one Import CSV button ─────────────
    await goToSettings(page);
    await page.setInputFiles('#import-csv-file', {
      name: 'stackd_budgets.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8')
    });
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toBe('Success! Imported 2 budgets.');

    const restored = await page.evaluate(() => {
      const s = window.Store.getState();
      const name = (id) => (s.categories.find(c => c.id === id) || {}).name;
      return s.budgets
        .filter(b => b.amount > 0)
        .map(b => ({ category: name(b.categoryId), amount: b.amount, startDate: b.startDate, endDate: b.endDate, isCumulative: b.isCumulative }))
        .sort((a, b) => a.category.localeCompare(b.category));
    });
    expect(restored).toEqual([
      { category: 'Groceries', amount: 300, startDate: '2026-01', endDate: null, isCumulative: true },
      { category: 'Hobbies', amount: 45.5, startDate: '2026-03', endDate: '2026-08', isCumulative: false }
    ]);
    // It restored rather than opening the bank-statement column mapping.
    expect(page.url()).not.toContain('#import-map');
    expect(errors).toEqual([]);
  });
});
