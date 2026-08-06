import { test, expect } from '@playwright/test';

// v0.67: scope prompt when editing a member of a recurrent series.
// Regression coverage for the silent date-propagation bug: editing one
// occurrence must never rewrite the rest of the series without asking.
test.describe('Recurring edit scope modal', () => {
  const seedSeries = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
    });
    // page.reload() (not an in-page location.reload) is a real navigation
    // barrier — #bottom-nav exists in the static markup, so waiting for it
    // after an in-page reload can resolve against the pre-reload document.
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);

    return await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 1000 });
      const accountId = window.Store.getState().accounts.find(a => a.name === 'Main Bank').id;
      window.Store.dispatch('ADD_TRANSACTION', {
        type: 'expense',
        amount: 100,
        accountId,
        categoryId: 'cat_groceries',
        date: '2026-08-15',
        comment: 'Life insurance',
        recurrence: { interval: 1, frequency: 'months', endDate: '2027-02-15' }
      });
      const members = window.Store.getState().transactions
        .filter(t => t.comment === 'Life insurance')
        .map(t => ({ id: t.id, date: t.date }));
      return { accountId, members, seriesId: window.Store.getState().transactions.find(t => t.comment === 'Life insurance').recurrence.seriesId };
    });
  };

  const readSeries = (page, seriesId) => page.evaluate((sid) => {
    const members = window.Store.getState().transactions
      .filter(t => t.recurrence && t.recurrence.seriesId === sid);
    return {
      dates: members.map(t => t.date).sort(),
      amounts: members.map(t => t.amount),
      generators: members.filter(t => t.recurrence.nextDate).length
    };
  }, seriesId);

  test('date edit asks for scope; "this and future" shifts only the future', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    const { members, seriesId } = await seedSeries(page);
    expect(members.map(m => m.date).sort()).toEqual([
      '2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15'
    ]);

    // Open the September occurrence and move it to the 13th
    const sept = members.find(m => m.date === '2026-09-15');
    await page.goto('#edit?id=' + sept.id);
    await page.waitForSelector('#tx-date');
    await page.fill('#tx-date', '2026-09-13');
    await page.click('#btn-save-tx');

    // The scope modal MUST appear before anything is written
    await expect(page.locator('#recurring-update-modal')).toBeVisible();
    const before = await readSeries(page, seriesId);
    expect(before.dates).toContain('2026-09-15'); // nothing changed yet

    await page.click('#ru-this-future');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.location.hash)).toBe('#transactions');

    const after = await readSeries(page, seriesId);
    expect(after.dates).toEqual([
      '2026-08-15', '2026-09-13', '2026-10-13', '2026-11-13', '2026-12-13', '2027-01-13', '2027-02-13'
    ]);
    expect(after.generators).toBe(1);
    expect(errors).toHaveLength(0);
  });

  test('"only this" changes a single occurrence and leaves the series alone', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    const { members, seriesId } = await seedSeries(page);
    const nov = members.find(m => m.date === '2026-11-15');

    await page.goto('#edit?id=' + nov.id);
    await page.waitForSelector('#tx-amount');
    await page.fill('#tx-amount', '250');
    await page.click('#btn-save-tx');

    await expect(page.locator('#recurring-update-modal')).toBeVisible();
    await page.click('#ru-only-this');
    await page.waitForTimeout(300);

    const after = await readSeries(page, seriesId);
    expect(after.dates).toEqual([
      '2026-08-15', '2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15'
    ]);
    expect(after.amounts.filter(a => a === 250)).toHaveLength(1);
    expect(after.amounts.filter(a => a === 100)).toHaveLength(6);
    expect(after.generators).toBe(1);
    expect(errors).toHaveLength(0);
  });

  test('delete flow still offers its scope modal from the edit screen', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    const { members, seriesId } = await seedSeries(page);
    const oct = members.find(m => m.date === '2026-10-15');

    await page.goto('#edit?id=' + oct.id);
    await page.waitForSelector('#btn-delete-tx');
    await page.click('#btn-delete-tx');

    await expect(page.locator('#recurring-delete-modal')).toBeVisible();
    await page.click('#rdm-only-this');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.location.hash)).toBe('#transactions');

    const after = await readSeries(page, seriesId);
    expect(after.dates).toEqual([
      '2026-08-15', '2026-09-15', '2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15'
    ]);
    expect(errors).toHaveLength(0);
  });
});
