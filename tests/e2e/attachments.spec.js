import { test, expect } from '@playwright/test';
import fs from 'fs';

// 1.2.0 (UX-10): attachments on a transaction (web build: IndexedDB) and the
// receipts PDF. A photo is picked through the form's hidden library input,
// re-encoded (canvas → JPEG), saved with the row, shown as a paperclip badge
// in History, and every attachment of the period exports as one PDF.
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function boot(page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
  });
  await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('stackd_attachments');
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  }));
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Attachments);
  await page.evaluate(() => {
    window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 1000, openingDate: '2020-01-01' });
  });
}

const watch = (page) => {
  const errors = [];
  const dialogs = [];
  page.on('pageerror', err => errors.push(err));
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  return { errors, dialogs };
};

test.describe('Attachments (UX-10)', () => {
  test('a photo added in the form is saved, badged in History and exported as a receipts PDF', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#btn-save-tx');

    // the row opens the sheet; the sheet's buttons drive the hidden inputs
    await page.click('#tx-attachments-row');
    await page.waitForSelector('#attachment-sheet');
    await page.click('#att-sheet-cancel');
    await page.setInputFiles('#tx-att-library', { name: 'receipt.png', mimeType: 'image/png', buffer: PNG_1PX });
    await expect(page.locator('#tx-attachments-strip .tx-attachment')).toHaveCount(1);
    await expect(page.locator('#tx-attachments-text')).toHaveText('1 attachment');
    // re-encoded through the canvas: stored as a JPEG
    await expect(page.locator('.tx-attachment-name')).toHaveText('receipt.jpg');

    await page.locator('#tx-amount').pressSequentially('12.50');
    await page.selectOption('#tx-category', { label: 'Groceries' });
    await page.click('#btn-save-tx');
    await expect(page).toHaveURL(/#transactions$/);

    const saved = await page.evaluate(() => window.Store.getState().transactions.find(t => t.type === 'expense'));
    expect(saved.attachments).toHaveLength(1);
    expect(saved.attachments[0]).toMatchObject({ kind: 'image', ext: 'jpg', mime: 'image/jpeg' });
    const stored = await page.evaluate((m) => window.Attachments.read(m).then(b => b && Array.from(b.slice(0, 3))), saved.attachments[0]);
    expect(stored).toEqual([0xFF, 0xD8, 0xFF]);
    await expect(page.locator(`.list-item[data-id="${saved.id}"] .tx-attach-badge`)).toHaveAttribute('aria-label', '1 attachment');

    // Settings → Import and export → Export → Receipts PDF
    await page.click('#nav-fab-toggle');
    await page.click('a.menu-action-item[href="#settings"]');
    await page.click('#btn-open-import-export');
    await page.waitForSelector('#import-export-sheet');
    await page.click('#ie-sheet-export');
    await page.waitForSelector('#export-view');
    await expect(page.locator('#export-receipts')).toContainText('1 attachment in this period');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-receipts')]);
    expect(download.suggestedFilename()).toMatch(/^Stackd_receipts_\d{14}\.pdf$/);
    const bytes = fs.readFileSync(await download.path());
    expect(bytes.slice(0, 5).toString('latin1')).toBe('%PDF-');
    await page.waitForSelector('#export-done-modal');
    expect(w.errors).toEqual([]);
    expect(w.dialogs).toEqual([]);
  });

  test('a file added to a new log that is closed without saving is deleted', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    await page.evaluate(() => window.Router.navigate('#add'));
    await page.waitForSelector('#btn-save-tx');
    await page.setInputFiles('#tx-att-pdf', { name: 'bill.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
    await expect(page.locator('#tx-attachments-strip .tx-attachment')).toHaveCount(1);
    expect((await page.evaluate(() => window.Attachments.usage())).count).toBe(1);
    await page.click('a[data-router-leave]');
    await expect.poll(() => page.evaluate(() => window.Attachments.usage().then(u => u.count))).toBe(0);
    expect(w.errors).toEqual([]);
  });
});
