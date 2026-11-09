import { test, expect } from '@playwright/test';
import { createRequire } from 'module';

// User-journey baseline (docs/user-journey/inventory.md §B3): Lea, the power
// user — moves her data in from a bank file, keeps backups, tracks a
// mortgage, tunes the app. Steps L1–L25, in order, through the REAL UI; each
// test() re-boots and re-seeds (tools/seed.cjs, Pro on, EUR). The clock is
// pinned to 8 Nov 2026 — the build date the inventory was written against —
// so the seed's months and the step dates (Sep 14 – Nov 3, next month's
// first payment) are the inventory's.
const require = createRequire(import.meta.url);
const SEED = require('../../tools/seed.cjs');

test.use({ viewport: { width: 390, height: 760 } });

const NOW = new Date(2026, 10, 8, 12, 0, 0);
const TODAY = '2026-11-08';
const PRO = { active: true, productId: 'stackd_pro', platform: 'play', purchasedAt: '2026-09-01T00:00:00.000Z' };

// L2: a bank CSV — date; description; amount with a decimal comma. Dated in
// the seeded month (History opens on this month), with amounts no seeded
// row shares (no match / transfer suggestion fires).
const BANK_CSV = [
  'Data;Descrizione;Importo',
  '02/11/2026;ESSELUNGA;-54,30',
  '03/11/2026;BAR CENTRALE;-3,20',
  '05/11/2026;BONIFICO CLIENTE;850,00'
].join('\n');

const watch = (page) => {
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(e));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  return { errors, dialogs };
};

async function boot(page) {
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await page.evaluate((pro) => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    localStorage.setItem('stackd_v1_pro', JSON.stringify(pro));
  }, PRO);
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.Views && !!window.Router && !!window.Pro && !!window.Widgets);
  await page.waitForSelector('#splash-screen', { state: 'detached' });
  const seeded = await page.evaluate(SEED);
  expect(seeded.accounts).toBe(4);
  // Lea is seeded like Marco; his M5 row (#friends on Dining Out) is the tag
  // L22 taps, so it is part of her seed too.
  await page.evaluate(() => {
    const S = window.Store;
    const rev = S.getState().accounts.find(a => a.name === 'Revolut').id;
    S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: 46, accountId: rev, categoryId: 'cat_dining', date: S._todayYMD(), comment: 'Dinner with friends', tags: ['friends'] });
  });
  await page.waitForSelector('.wallet-card[data-id]');
  expect(await page.evaluate(() => window.Pro.isActive(window.Store.getState()))).toBe(true);
}

const go = async (page, hash, view) => {
  await page.evaluate((h) => window.Router.navigate(h), hash);
  await page.waitForFunction((v) => window.Store.getState().activeView === v, view);
};

const openSettings = async (page) => {
  await page.click('#nav-fab-toggle');
  await page.click('a.menu-action-item[href="#settings"]');
  await page.waitForSelector('#btn-open-import-export');
};

const accId = (page, name) => page.evaluate((n) => window.Store.getState().accounts.find(a => a.name === n).id, name);
const state = (page, fn, arg) => page.evaluate(fn, arg);
const expectModalClosed = (page) => expect(page.locator('#active-modal')).toHaveCount(0);
const money = (text) => Number(String(text).replace(/[^\d.,-]/g, '').replace(/,/g, ''));

// ───────────────────────────────────────────────────────────────────────────
test.describe('Journey · Lea (power user)', () => {
  test('L1–L8 · import a bank file, re-import duplicates, rules, export, backup', async ({ page }) => {
    const w = watch(page);
    // The web clipboard is permission-gated in an automated browser: capture
    // what Copy text writes instead of reading the system clipboard.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }
      });
    });
    await boot(page);
    const mainId = await accId(page, 'Main Bank');
    const txBefore = await state(page, () => window.Store.getState().transactions.length);

    // ── L1 Others → Data → Import and export ──────────────────────────────
    await openSettings(page);
    await page.click('#btn-open-import-export');
    const ieSheet = page.locator('#import-export-sheet');
    await expect(ieSheet).toBeVisible();
    await expect(ieSheet.locator('#ie-sheet-import')).toBeVisible();
    await expect(ieSheet.locator('#ie-sheet-export')).toBeVisible();

    // ── L2 Import: paste the bank CSV, Check → Map Columns ────────────────
    await page.click('#ie-sheet-import');
    await page.waitForSelector('#import-view');
    await expect(page.locator('#import-text')).toBeVisible();
    await expect(page.locator('#btn-import-settings')).toBeVisible();
    await expect(page.locator('#btn-import-check')).toBeDisabled();
    await page.fill('#import-text', BANK_CSV);
    await expect(page.locator('#btn-import-check')).toBeEnabled();
    await page.click('#btn-import-check');
    await page.waitForSelector('#import-map');
    await expect(page.locator('#import-map h1')).toHaveText('Map Columns');

    // ── L3 Map Columns: Date / Description / Amount, D/M/Y, Main Bank ─────
    await page.selectOption('#imap-col-date', '0');
    await page.selectOption('#imap-col-desc', '1');
    await page.selectOption('#imap-col-amount', '2');
    await page.selectOption('#imap-date-format', 'dmy');
    await page.selectOption('#imap-account', mainId);
    // the live preview follows the mapping
    await expect(page.locator('#imap-preview')).toContainText('ESSELUNGA');
    await expect(page.locator('#imap-preview')).toContainText('2026-11-02');
    await expect(page.locator('#imap-preview')).toContainText('-€54.30');
    await expect(page.locator('#imap-preview')).toContainText('+€850.00');
    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');

    // ── L4 Review & Import: a category + Remember for ESSELUNGA, Import ───
    await expect(page.locator('#import-preview h1')).toHaveText('Review & Import');
    await expect(page.locator('.import-row')).toHaveCount(3);
    await expect(page.locator('#btn-iprev-confirm')).toHaveText('Import 3 transactions');
    const esselungaRow = page.locator('.import-row', { hasText: 'ESSELUNGA' });
    await expect(esselungaRow.locator('.import-row-cat')).toContainText('Choose category');
    await esselungaRow.locator('.import-row-cat').click();
    await page.waitForSelector('#category-selection-modal');
    await page.click('.category-select-item:has-text("Groceries")');
    await expect(esselungaRow.locator('.import-row-cat')).toContainText('Groceries');
    const pill = page.locator('.import-row-rule');
    await expect(pill).toHaveCount(1);
    await expect(pill).toContainText(/esselunga/i);
    await pill.click();
    await expect(page.locator('.import-row-rule')).toHaveCount(0);
    expect(await state(page, () => window.Store.getState().importRules.map(r => ({ match: r.match, categoryId: r.categoryId }))))
      .toEqual([{ match: 'esselunga', categoryId: 'cat_groceries' }]);

    await page.click('#btn-iprev-confirm');
    const done = page.locator('#import-success-modal.open');
    await expect(done).toBeVisible();
    await expect(done).toContainText('Import complete');
    await expect(page.locator('#import-success-imported')).toContainText('Imported 3 transactions into Main Bank');
    await page.click('#import-success-view');
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    await expect(page.locator('#import-success-modal')).toHaveCount(0);
    // rows in History (filtered to Main Bank by View transactions). History's
    // compact rows (HG-11) show category and amount, not the note, so the
    // three imported rows are found by id.
    await expect(page.locator('.period-bar [data-filter-kind="accounts"]')).toContainText('Main Bank');
    const imported = await state(page, () => window.Store.getState().transactions.filter(t => t.importKey).map(t => ({ id: t.id, comment: t.comment, amount: t.amount, type: t.type, categoryId: t.categoryId, date: t.date })));
    expect(imported).toHaveLength(3);
    for (const t of imported) await expect(page.locator(`#router-view .list-item[data-id="${t.id}"]`)).toHaveCount(1);
    const esselungaId = imported.find(t => t.comment === 'ESSELUNGA').id;
    await expect(page.locator(`#router-view .list-item[data-id="${esselungaId}"]`)).toContainText('Groceries');
    await expect(page.locator(`#router-view .list-item[data-id="${esselungaId}"]`)).toContainText('54.30');
    expect(imported.find(t => t.comment === 'ESSELUNGA')).toMatchObject({ amount: 54.3, type: 'expense', categoryId: 'cat_groceries', date: '2026-11-02' });
    expect(imported.find(t => t.comment === 'BONIFICO CLIENTE')).toMatchObject({ amount: 850, type: 'income', date: '2026-11-05' });
    expect(await state(page, () => window.Store.getState().transactions.length)).toBe(txBefore + 3);

    // ── L5 Import again: every row Already imported, nothing added ────────
    await openSettings(page);
    await page.click('#btn-open-import-export');
    await page.click('#ie-sheet-import');
    await page.waitForSelector('#import-view');
    await page.fill('#import-text', BANK_CSV);
    await page.click('#btn-import-check');
    await page.waitForSelector('#import-map');
    await expect(page.locator('#import-map')).toContainText('Recognized this layout');
    await expect(page.locator('#imap-account')).toHaveValue(mainId);
    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');
    await expect(page.locator('.import-row')).toHaveCount(3);
    await expect(page.locator('.import-row-muted')).toHaveCount(3);
    await expect(page.locator('.import-row-badge')).toHaveCount(3);
    await expect(page.locator('.import-row-badge').first()).toHaveText('Already imported');
    await expect(page.locator('.import-row-check')).toHaveCount(0);
    await expect(page.locator('#import-preview')).toContainText('3 rows already imported — they will be skipped.');
    await expect(page.locator('#btn-iprev-confirm')).toHaveText('Import 0 transactions');
    expect(await state(page, () => window.Store.getState().transactions.length)).toBe(txBefore + 3);
    await page.click('#iprev-close');
    await page.waitForSelector('#btn-open-import-export');

    // ── L6 Import rules: the rule ESSELUNGA → Groceries ───────────────────
    await page.click('#btn-import-rules');
    const rules = page.locator('#import-rules-modal');
    await expect(rules).toBeVisible();
    await expect(rules.locator('.irm-row')).toHaveCount(1);
    await expect(rules.locator('.irm-row')).toContainText(/esselunga/i);
    await expect(rules.locator('.irm-row')).toContainText('Groceries');
    await page.click('#irm-close');
    await expect(page.locator('#import-rules-modal')).toHaveCount(0);

    // ── L7 Export: CSV, settings, this month, Copy text ───────────────────
    await page.click('#btn-open-import-export');
    await page.click('#ie-sheet-export');
    await page.waitForSelector('#export-view');
    await expect(page.locator('#export-preview')).toBeVisible();
    await expect(page.locator('#export-lines')).toContainText(/\d+ lines/);
    await page.click('#export-format');
    await page.click('.list-picker-item[data-value="csv"]');
    await expect(page.locator('#export-format')).toContainText('CSV');
    await page.click('#export-settings');
    await expect(page.locator('#export-settings-sheet-title')).toBeVisible();
    await expect(page.locator('#eset-save')).toBeVisible();
    await page.click('#eset-save');
    await expect(page.locator('#export-settings-sheet-title')).toHaveCount(0);
    // Period: From this month – To this month
    await page.click('#export-period');
    await expect(page.locator('#export-period-sheet-title')).toBeVisible();
    await page.click('#eper-start');
    await page.waitForSelector('#active-month-picker');
    await expect(page.locator('#mp-year-label')).toHaveText('2026');
    await page.click('.mp-month-btn[data-month="10"]');
    await expect(page.locator('#mp-selected-label')).toHaveText('November 2026');
    await page.click('#mp-done');
    await expect(page.locator('#eper-start')).toContainText(/Nov(ember)? 2026/);
    await page.click('#eper-end');
    await page.waitForSelector('#active-month-picker');
    await page.click('.mp-month-btn[data-month="10"]');
    await page.click('#mp-done');
    await expect(page.locator('#eper-end')).toContainText(/Nov(ember)? 2026/);
    await page.click('#eper-save');
    await expect(page.locator('#export-period')).toContainText(/Nov(ember)? 2026/);
    await page.click('#export-copy');
    await expect(page.locator('#export-copy')).toHaveText('Copied');
    const copied = await page.evaluate(() => window.__copied);
    const lines = copied.split(/\r\n|\n/).filter(Boolean);
    // the header row: the 17 ledger columns in the app language (the column
    // separator follows the export settings — ',' for an English install)
    expect(lines[0].split(/[;,]/)).toEqual(['Account', 'Date', 'Amount', 'Currency', 'Account balance', 'Currency', 'Title', 'Receiver', 'Usage', 'Category', 'Comment', 'Tags', 'Amount', 'Currency', 'Exchange rate', 'Payment status', 'Mark'].map(c => `"${c}"`));
    expect(copied).toContain('ESSELUNGA');
    // dates in the English install's default MM/dd/yyyy: this month's rows, no earlier month
    expect(copied).toMatch(/"11\/0[2-8]\/2026"/);
    expect(copied).not.toMatch(/"(0[1-9]|10|12)\/\d\d\/2026"/);
    expect(copied).toContain('"Main Bank"');
    expect(copied).toContain('"Groceries"');
    const previewLines = Number((await page.locator('#export-lines').textContent()).match(/\d+/)[0]);
    expect(lines.length).toBe(previewLines);

    // ── L8 Backup: Back up now ────────────────────────────────────────────
    await page.click('#export-close');
    await page.waitForSelector('#btn-open-backup');
    await page.click('#btn-open-backup');
    await page.waitForSelector('#btn-backup-now');
    await expect(page.locator('#backup-log-empty')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-backup-now')]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/^Stackd_backup_\d{8}_\d{6}\.json$/);
    const saved = page.locator('#backup-result-modal');
    await expect(saved).toContainText('Backup saved');
    await expect(saved).toContainText(name);
    await expect(saved).toContainText('Destination: Downloads folder');
    await page.click('#backup-result-modal-ok');
    await expect(saved).toHaveCount(0);
    await expect(page.locator('.backup-log-row')).toHaveCount(1);
    await expect(page.locator('.backup-log-row')).toContainText('Manual');
    await expect(page.locator('.backup-log-row')).toContainText('Saved');
    await expect(page.locator('#backup-log-empty')).toHaveCount(0);

    expect(w.dialogs).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  test('L9–L13 · simulate a mortgage, track it as a recurring expense, edit the rate', async ({ page }) => {
    const w = watch(page);
    await boot(page);

    // ── L9 Loans hub ──────────────────────────────────────────────────────
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#debt"]');
    await page.waitForSelector('#debt-hub');
    await expect(page.locator('#debt-hub')).toContainText('Simulate loans and track the ones you have');
    await expect(page.locator('.debt-type-tile')).toHaveCount(3);
    await expect(page.locator('.debt-type-tile[data-type="mortgage"]')).toContainText('Mortgage');
    // the Simulations list only renders once a simulation is saved
    await expect(page.locator('.debt-sim-item')).toHaveCount(0);
    await expect(page.locator('#debt-hub')).toContainText('My Loans');
    await expect(page.locator('#debt-loans-empty')).toBeVisible();

    // ── L10 Mortgage simulator ────────────────────────────────────────────
    await page.click('.debt-type-tile[data-type="mortgage"]');
    await page.waitForSelector('#debt-sim-form');
    await expect(page.locator('#debt-sim-form h1')).toHaveText('Mortgage');
    await page.fill('#dsim-principal', '180000');
    await page.fill('#dsim-down', '30000');
    await expect(page.locator('#dsim-down-pct')).toContainText('16');
    await page.fill('#dsim-duration', '25');
    await expect(page.locator('#dsim-duration-unit')).toHaveValue('years');
    await page.fill('#dsim-rate', '3.2');
    await page.fill('#dsim-first-date', '2026-12-01');
    await expect(page.locator('#dsim-details-body')).toBeHidden();
    await page.click('#dsim-details-toggle');
    await expect(page.locator('#dsim-details-body')).toBeVisible();
    await expect(page.locator('#dsim-details-body')).toContainText('Payment Type');
    await expect(page.locator('#dsim-details-body')).toContainText('Rate Changes');
    await expect(page.locator('#dsim-details-body')).toContainText('Early Repayments');
    await expect(page.locator('#dsim-details-body')).toContainText('Extra Costs');

    // ── L11 Results + detailed schedule ───────────────────────────────────
    await page.click('#btn-dsim-calculate');
    await page.waitForSelector('#debt-results-view');
    const results = page.locator('#debt-results-view');
    for (const label of ['Monthly Payment', 'Total Interest', 'Total Amount', 'Installments', 'Last Payment']) {
      await expect(results).toContainText(label);
    }
    const resultsText = await results.innerText();
    const paymentMatch = resultsText.match(/Monthly Payment\s+€([\d,]+\.\d{2})/);
    expect(paymentMatch, 'the Monthly Payment figure').toBeTruthy();
    const payment = money(paymentMatch[1]);
    expect(Math.abs(payment - 727)).toBeLessThanOrEqual(2); // 150,000 at 3.2 % over 300 months
    expect(resultsText).toMatch(/Installments\s+300/);
    await expect(results).toContainText('€150,000.00'); // the financed amount
    await expect(results).toContainText('€30,000.00');  // the down payment
    await page.click('#dres-schedule-toggle');
    await expect(page.locator('#dres-schedule-body')).toBeVisible();
    const rows = page.locator('#dres-schedule-rows');
    await expect(rows).toContainText('01/12/26'); // the loan views print dd/MM/yy
    await page.click('#dres-schedule-mode .chart-toggle-btn[data-mode="detailed"]');
    await expect(rows).toContainText('interest €400.00'); // 150,000 × 3.2 % / 12
    await expect(rows).toContainText(/principal €32\d\.\d{2}/);

    // ── L12 Add to My Loans ("Home") → Track this payment? → recurring ────
    await page.click('#btn-dres-promote');
    await page.waitForSelector('#loan-name-input');
    await page.fill('#loan-name-input', 'Home');
    await page.click('#modal-save-btn');
    await page.waitForSelector('#debt-hub');
    await expect(page.locator('#modal-title')).toHaveText('Track this payment?');
    await page.waitForTimeout(500); // outlive the naming modal's teardown
    await expect(page.locator('#modal-title')).toHaveText('Track this payment?');
    await expect(page.locator('.modal-body')).toContainText(paymentMatch[1]);
    await expect(page.locator('.modal-body')).toContainText('01/12/26'); // starting on the first payment
    await expect(page.locator('#modal-save-btn')).toHaveText('Add recurring expense');
    await page.click('#modal-save-btn');
    await page.waitForSelector('#tx-amount');
    expect(Math.abs(money(await page.locator('#tx-amount').inputValue()) - payment)).toBeLessThan(0.01);
    await expect(page.locator('#tx-is-recurrent')).toBeChecked();
    await expect(page.locator('#tx-recurrence-freq')).toHaveValue('months');
    await expect(page.locator('#tx-date')).toHaveValue('2026-12-01');
    await expect(page.locator('#tx-category')).toHaveValue('cat_debt');
    await expect(page.locator('#tx-comment')).toHaveValue('Home — loan payment');
    await expectModalClosed(page);
    await page.click('#btn-save-tx');
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');

    const linked = await state(page, () => {
      const S = window.Store;
      const loan = S.getState().loans[0];
      const txs = S.getLoanLinkedTransactions(loan) || [];
      return {
        name: loan.name, kind: loan.kind, linkedSeriesId: loan.linkedSeriesId,
        count: txs.length, amounts: txs.map(t => t.amount), dates: txs.map(t => t.date).sort(),
        armed: txs.filter(t => t.recurrence && t.recurrence.nextDate).length,
        pending: S.getState().pendingLoanLink
      };
    });
    expect(linked.name).toBe('Home');
    expect(linked.kind).toBe('active');
    expect(linked.linkedSeriesId).toBeTruthy();
    expect(linked.count).toBeGreaterThan(12); // the series is materialized (capped at 60 months)
    expect(linked.dates[0]).toBe('2026-12-01');
    expect(linked.armed).toBe(1);
    expect(linked.pending).toBeNull();
    linked.amounts.forEach(a => expect(Math.abs(a - payment)).toBeLessThan(0.01));

    // the hub lists Home under My Loans, tracked
    await go(page, '#debt', 'debt');
    await expect(page.locator('#debt-loans-empty')).toHaveCount(0);
    await expect(page.locator('.debt-loan-item')).toHaveCount(1);
    await expect(page.locator('.debt-loan-item')).toContainText('Home');
    await expect(page.locator('.debt-loan-item .debt-tracked-badge')).toBeVisible();
    await page.click('.debt-loan-item');
    await page.waitForSelector('#dres-progress');
    await expect(page.locator('#dres-progress')).toContainText('Progress');
    await expect(page.locator('#dres-tracked')).toContainText('Tracked as a monthly expense');
    await expect(page.locator('#btn-dres-track')).toHaveCount(0);

    // ── L13 ⋯ → Edit Loan: rate 2.9 → Save Changes → Update linked payments? ─
    await page.click('#btn-dres-menu');
    await page.click('.dres-menu-opt[data-act="edit"]');
    await page.waitForSelector('#debt-sim-form');
    await expect(page.locator('#dsim-rate')).toHaveValue('3.2');
    await expect(page.locator('#dsim-principal')).toHaveValue('180000');
    await page.fill('#dsim-rate', '2.9');
    await page.click('#btn-dsim-calculate');
    await page.waitForSelector('#debt-results-view');
    const editedText = await page.locator('#debt-results-view').innerText();
    const newPayment = money(editedText.match(/Monthly Payment\s+€([\d,]+\.\d{2})/)[1]);
    expect(newPayment).toBeLessThan(payment);
    expect(Math.abs(newPayment - 703.5)).toBeLessThanOrEqual(2); // 150,000 at 2.9 % over 300 months
    await expect(page.locator('#btn-dres-save')).toHaveText('Save Changes');
    await page.click('#btn-dres-save');
    await page.waitForSelector('#loan-name-input');
    await expect(page.locator('#loan-name-input')).toHaveValue('Home');
    await page.click('#modal-save-btn');
    await page.waitForSelector('#debt-hub');
    await expect(page.locator('#modal-title')).toHaveText('Update linked payments?');
    await expect(page.locator('.modal-body')).toContainText(window_fmt(newPayment));
    await expect(page.locator('#modal-save-btn')).toHaveText('Update Payments');
    await page.click('#modal-save-btn');
    await expectModalClosed(page);

    const synced = await state(page, () => {
      const S = window.Store;
      const loan = S.getState().loans[0];
      const txs = S.getLoanLinkedTransactions(loan) || [];
      return { rate: loan.config.annualRate, count: txs.length, amounts: txs.map(t => t.amount) };
    });
    expect(synced.rate).toBe(2.9);
    expect(synced.count).toBe(linked.count);
    synced.amounts.forEach(a => expect(Math.abs(a - newPayment)).toBeLessThan(0.01));

    expect(w.dialogs).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // L14 drags a Home tile with REAL touch input (CDP), so this one test runs
  // as a touch device; L15 reads the order L14 saved, so it lives here too.
  test.describe('Home tile drag', () => {
    test.use({ hasTouch: true, isMobile: true });

    test('L14–L15 · drag Savings first on Home; Move down in the Accounts sheet; Home follows', async ({ page }) => {
      const w = watch(page);
      await boot(page);
      const ids = await state(page, () => Object.fromEntries(window.Store.getState().accounts.map(a => [a.name, a.id])));
      const order = () => page.evaluate(() => Array.from(document.querySelectorAll('.wallet-card')).map(c => c.dataset.id));
      const saved = () => page.evaluate(() => window.Store.orderedAccounts().map(a => a.id));
      // the seed creates the accounts in this order, and each one is appended
      // to the saved order (HG-12), so Savings is the last tile
      expect(await order()).toEqual([ids['Main Bank'], ids.Revolut, ids.Cash, ids.Savings]);

      // ── L14 hold the Savings card, drag it to the row's left edge ────────
      await page.evaluate(() => { const w = document.querySelector('.wallets-scroll-wrapper'); w.scrollLeft = w.scrollWidth; });
      await page.waitForTimeout(200);
      const box = await page.evaluate((id) => {
        const b = document.querySelector(`.wallet-card[data-id="${id}"]`).getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      }, ids.Savings);
      expect(box.x).toBeLessThan(390);
      const cdp = await page.context().newCDPSession(page);
      const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await touch('touchStart', box.x, box.y);
      await page.waitForTimeout(600); // past the 0.45 s hold
      await expect(page.locator(`.wallet-card[data-id="${ids.Savings}"]`)).toHaveClass(/is-lifted/);
      const edge = 12;
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        await touch('touchMove', box.x + ((edge - box.x) * i) / steps, box.y + 1);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(1800); // the edge scroll carries the tile to the start
      await touch('touchEnd');
      await page.waitForTimeout(300);
      await expect(page.locator('.wallet-card.is-lifted')).toHaveCount(0);
      const dragged = [ids.Savings, ids['Main Bank'], ids.Revolut, ids.Cash];
      expect(await saved()).toEqual(dragged);
      expect(await order()).toEqual(dragged);
      expect(await page.evaluate(() => location.hash)).not.toContain('transactions');
      // survives a reload
      await page.reload();
      await page.waitForSelector('#splash-screen', { state: 'detached' });
      await page.waitForSelector(`.wallet-card[data-id="${ids.Cash}"]`);
      expect(await order()).toEqual(dragged);

      // ── L15 Others → Accounts: Move down on Savings ──────────────────────
      await openSettings(page);
      await page.click('#btn-manage-accounts');
      const list = page.locator('#acc-order-list');
      await expect(page.locator('#modal-title')).toHaveText('Accounts');
      await expect(list.locator('.acc-order-row')).toHaveCount(4);
      await expect(list.locator('.acc-order-row').nth(0)).toContainText('Savings');
      await expect(list.locator('.acc-order-row', { hasText: 'Main Bank' })).toContainText('Default wallet');
      await expect(list.locator('.acc-order-row', { hasText: 'Savings' })).not.toContainText('Default wallet');
      await list.locator(`button[data-acc-move="down"][data-acc-id="${ids.Savings}"]`).click();
      await expect(list.locator('.acc-order-row').nth(0)).toContainText('Main Bank');
      await expect(list.locator('.acc-order-row').nth(1)).toContainText('Savings');
      await expect(page.locator('#sr-announcer')).toHaveText('Savings is now in position 2 of 4.');
      const moved = [ids['Main Bank'], ids.Savings, ids.Revolut, ids.Cash];
      expect(await saved()).toEqual(moved);
      await page.click('#modal-save-btn');
      await expectModalClosed(page);
      await go(page, '#dashboard', 'dashboard');
      await page.waitForSelector(`.wallet-card[data-id="${ids.Cash}"]`);
      expect(await order()).toEqual(moved);

      expect(w.dialogs).toEqual([]);
      expect(w.errors).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  test('L16–L20 · tab bar, hidden balances, language, currency, custom range', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    const tabs = () => page.locator('#bottom-nav .nav-pill a.nav-item').evaluateAll(els => els.map(e => e.dataset.view));

    // ── L16 Tab bar: Smart Insights up twice ──────────────────────────────
    await openSettings(page);
    await page.waitForSelector('#nav-order-list');
    expect(await tabs()).toEqual(['dashboard', 'transactions', 'budget', 'analytics', 'insights']);
    const up = page.locator('button[data-nav-move="up"][data-nav-view="insights"]');
    await up.click();
    await expect(page.locator('#sr-announcer')).toHaveText('Smart Insights is now in position 4 of 5.');
    await up.click();
    await expect(page.locator('#sr-announcer')).toHaveText('Smart Insights is now in position 3 of 5.');
    expect(await tabs()).toEqual(['dashboard', 'transactions', 'insights', 'budget', 'analytics']);
    expect(await state(page, () => window.Store.getState().navOrder)).toEqual(['transactions', 'insights', 'budget', 'analytics']);

    // ── L17 Hide balances → Home masked, History not; the pill's sheet ─────
    await page.locator('label.toggle-switch:has(#toggle-hide-balances)').click();
    await expect(page.locator('#toggle-hide-balances')).toBeChecked();
    await go(page, '#dashboard', 'dashboard');
    await expect(page.locator('#dash-total')).toHaveText('€••••');
    await expect(page.locator('#privacy-pill')).toBeVisible();
    await expect(page.locator('#privacy-pill')).toContainText('Balances hidden');
    const homeFigures = () => page.evaluate(() => /€\s?\d/.test(document.getElementById('router-view').innerText));
    expect(await homeFigures()).toBe(false);
    await expect(page.locator('.wallet-card').first()).toContainText('••••');
    await go(page, '#transactions', 'transactions');
    await expect.poll(homeFigures).toBe(true); // History is not Home: figures stay
    await go(page, '#dashboard', 'dashboard');
    await page.click('#privacy-pill');
    const hidden = page.locator('#hidden-balances-sheet');
    await expect(hidden).toBeVisible();
    await expect(hidden).toContainText('Balances hidden');
    await expect(hidden.locator('#hidden-balances-sheet-show')).toBeVisible();
    await expect(hidden.locator('#hidden-balances-sheet-done')).toBeVisible();
    await page.click('#hidden-balances-sheet-show');
    await expect(hidden).toHaveCount(0);
    await expect(page.locator('#privacy-pill')).toHaveCount(0);
    await expect(page.locator('#dash-total')).not.toHaveText('€••••');
    expect(await homeFigures()).toBe(true);

    // ── L18 Language → Italiano, then back to English ─────────────────────
    await openSettings(page);
    await expect(page.locator('#current-language-display')).toHaveText('English');
    await page.click('#btn-open-language');
    const it = page.locator('.language-opt[data-code="it"]');
    await expect(it).toBeVisible();
    await page.waitForTimeout(150); // the picker binds its rows on a 50 ms timer
    await it.click();
    await expect(page.locator('#current-language-display')).toHaveText('Italiano');
    await expectModalClosed(page);
    await expect(page.locator('h1.header-title')).toHaveText('Altro');
    await expect(page.locator('#btn-manage-accounts')).toContainText('Conti');
    await expect(page.locator('.nav-item[data-view="transactions"]')).toHaveAttribute('aria-label', 'Cronologia');
    await expect(page.locator('.nav-item[data-view="budget"]')).toHaveAttribute('aria-label', 'Obiettivi');
    await expect(page.locator('.nav-item[data-view="analytics"]')).toHaveAttribute('aria-label', 'Statistiche');
    expect(await state(page, () => window.Store.getState().language)).toBe('it');
    await page.click('#btn-open-language');
    const en = page.locator('.language-opt[data-code="en"]');
    await expect(en).toBeVisible();
    await page.waitForTimeout(150);
    await en.click();
    await expect(page.locator('#current-language-display')).toHaveText('English');
    await expectModalClosed(page);
    await expect(page.locator('h1.header-title')).toHaveText('Others');
    await expect(page.locator('.nav-item[data-view="transactions"]')).toHaveAttribute('aria-label', 'History');

    // ── L19 Currency → USD: Switch to USD? → Cancel ───────────────────────
    await expect(page.locator('#current-currency-display')).toHaveText('EUR — Euro');
    await page.click('#btn-open-currency');
    await expect(page.locator('#modal-title')).toHaveText('Choose Currency');
    await page.click('.currency-opt[data-code="USD"]');
    await expect(page.locator('.currency-opt[data-code="USD"]')).toHaveAttribute('aria-checked', 'true');
    await page.click('#modal-save-btn'); // Done
    await expect(page.locator('#modal-title')).toHaveText('Switch to USD?');
    // No account is in USD yet, so the relabel option is pre-ticked (D4a) and
    // the summary reads for that case; unticking it names the excluded accounts.
    const relabel = page.locator('#currency-switch-relabel');
    await expect(relabel).toBeChecked();
    await expect(page.locator('label:has(#currency-switch-relabel)')).toContainText('Also switch my 4 EUR accounts to USD');
    await expect(page.locator('#currency-switch-summary')).toHaveText('Every account will count in your totals.');
    await page.locator('label:has(#currency-switch-relabel)').click();
    await expect(relabel).not.toBeChecked();
    await expect(page.locator('#currency-switch-summary')).toContainText('4 accounts aren’t in USD. They keep their balances, but they will be left out of your totals.');
    await expect(page.locator('#currency-switch-summary')).toContainText('None of your accounts would count');
    await expect(page.locator('#modal-save-btn')).toHaveText('Switch to USD');
    await page.click('#modal-cancel-btn');
    await expectModalClosed(page);
    expect(await state(page, () => window.Store.getState().currency)).toBe('EUR');
    await expect(page.locator('#current-currency-display')).toHaveText('EUR — Euro');
    expect(await state(page, () => window.Store.getState().accounts.map(a => a.currency))).toEqual(['EUR', 'EUR', 'EUR', 'EUR']);

    // ── L20 Analytics · custom range Sep 14 – Nov 3 ────────────────────────
    await go(page, '#analytics', 'analytics');
    const label = page.locator('#period-label-analytics');
    await expect(label).toContainText('November 2026');
    await page.click('#period-label-analytics');
    const sheet = page.locator('#period-sheet');
    await expect(sheet.locator('.period-sheet-title')).toHaveText('Period');
    await sheet.locator('[data-k="custom"]').click();
    await expect(sheet.locator('.period-sheet-title')).toHaveText('Custom range');
    await expect(sheet.locator('.period-nav-title')).toHaveText('November 2026');
    // the calendar opens on the period shown (this month), ready for a new range
    await expect(sheet.locator('.period-cal-status')).toHaveText('Nov 1 – 30, 2026 · 30 days');
    await sheet.locator('[data-k="c-prev"]').click();
    await sheet.locator('[data-k="c-prev"]').click();
    await expect(sheet.locator('.period-nav-title')).toHaveText('September 2026');
    await sheet.locator('[data-day="2026-09-14"]').click();
    await expect(sheet.locator('.period-cal-status')).toHaveText('Now pick the last day');
    await sheet.locator('[data-k="c-next"]').click();
    await sheet.locator('[data-k="c-next"]').click();
    await expect(sheet.locator('.period-nav-title')).toHaveText('November 2026');
    await sheet.locator('[data-day="2026-11-03"]').click();
    await expect(sheet.locator('.period-cal-status')).toContainText('51 days');
    await sheet.locator('[data-k="done"]').click();
    await expect(sheet).toHaveCount(0);
    await expect(label).toContainText('Sep 14 – Nov 3, 2026');
    expect(await state(page, () => window.Store.getState().analyticsFilters.period)).toMatchObject({ type: 'custom', start: '2026-09-14', end: '2026-11-03' });
    // 51 days → weekly bars, and the % badge names the 51 days before
    await expect(page.locator('#netFlowChart')).toHaveCount(1);
    await expect(page.locator('#router-view')).not.toContainText('Chart not available');
    expect(await state(page, () => window.Store._customNetFlowBuckets('2026-09-14', '2026-11-03').map(b => b.kind))).toEqual(Array(8).fill('range'));
    await expect(page.locator('#router-view')).toContainText('vs Jul 25 – Sep 13');

    expect(w.dialogs).toEqual([]);
    expect(w.errors).toEqual([]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  test('L21–L25 · a category, a tag, the opening date, delete an account, factory reset', async ({ page }) => {
    const w = watch(page);
    await boot(page);
    const cashId = await accId(page, 'Cash');

    // ── L21 Categories: create "Subscriptions", open it, Edit → Delete ────
    await openSettings(page);
    await page.click('a[href="#categories"]');
    await page.waitForFunction(() => window.Store.getState().activeView === 'categories');
    await expect(page.locator('.page-header-title')).toHaveText('Categories');
    await expect(page.locator('#router-view')).toContainText('Income');
    await expect(page.locator('#router-view')).toContainText('Expense');
    await expect(page.locator('#router-view')).toContainText('All Types');
    const catsBefore = await state(page, () => window.Store.getState().categories.length);
    await page.click('#btn-create-category');
    await expect(page).toHaveURL(/#edit-category$/);
    await expect(page.locator('h1.header-title')).toHaveText('New Category');
    await expect(page.locator('#pro-locked')).toHaveCount(0); // Pro is on
    await page.fill('#edit-cat-name', 'Subscriptions');
    await page.selectOption('#edit-cat-type', 'expense');
    await page.click('#icon-trigger-field');
    await expect(page.locator('#icon-picker-v2')).toBeVisible();
    await expect(page.locator('#icon-search')).toBeVisible();
    const iconBtn = page.locator('#icon-picker-v2 .icon-btn').nth(3);
    const icon = await iconBtn.getAttribute('data-icon');
    await iconBtn.click();
    await page.click('#ip-confirm');
    await expect(page.locator('#icon-picker-v2')).toHaveCount(0);
    await page.click('#btn-save-category');
    await page.waitForFunction(() => window.Store.getState().activeView === 'categories');
    const created = await state(page, () => window.Store.getState().categories.find(c => c.name === 'Subscriptions'));
    expect(created).toMatchObject({ typeHint: 'expense', icon });
    expect(await state(page, () => window.Store.getState().categories.length)).toBe(catsBefore + 1);
    const row = page.locator('.list-item', { has: page.locator(`.category-main-link[data-id="${created.id}"]`) });
    await expect(row).toContainText('Subscriptions');
    await expect(row).toContainText('0 transactions');
    // open it: the (empty) detail
    await page.click(`.category-main-link[data-id="${created.id}"]`);
    await page.waitForFunction(() => window.Store.getState().activeView === 'category-detail');
    await expect(page.locator('h1.header-title')).toHaveText('Subscriptions');
    await expect(page.locator('#router-view')).toContainText('No transactions in this category yet.');
    await page.click('#router-view a[href="#categories"]');
    await page.waitForFunction(() => window.Store.getState().activeView === 'categories');
    // ⋮ → Edit Category → Delete
    await page.click(`.btn-edit-category[data-id="${created.id}"]`);
    await expect(page).toHaveURL(new RegExp(`#edit-category\\?id=${created.id}$`));
    await expect(page.locator('h1.header-title')).toHaveText('Edit Category');
    await expect(page.locator('#edit-cat-name')).toHaveValue('Subscriptions');
    await expect(page.locator('#btn-delete-category')).toBeEnabled();
    await page.click('#btn-delete-category');
    await expect(page.locator('#modal-title')).toHaveText('Delete Category?');
    await page.click('#modal-delete-btn');
    await page.waitForFunction(() => window.Store.getState().activeView === 'categories');
    // Modal.hide() empties #modal-container on a 300 ms timer: let it run
    // before the next sheet opens (under the pinned clock the timer fires
    // lazily, on the next time-touching call — which would be that sheet's).
    await expectModalClosed(page);
    await expect(page.locator(`.category-main-link[data-id="${created.id}"]`)).toHaveCount(0);
    expect(await state(page, () => window.Store.getState().categories.length)).toBe(catsBefore);

    // ── L22 Tags: #friends → History filtered by the tag, all time ────────
    await go(page, '#tags', 'tags');
    const tagRow = page.locator('[data-tag-open="friends"]');
    await expect(tagRow).toContainText('#friends');
    await expect(tagRow).toContainText('1 transaction');
    await tagRow.click(); // 1.2.2 (HG-14): the edit sheet, then its History link
    await page.click('#tag-edit-sheet [data-k="see"]');
    await page.waitForFunction(() => window.Store.getState().activeView === 'transactions');
    await expect(page.locator('.period-bar [data-filter-kind="tags"]')).toContainText('#friends');
    const f = await state(page, () => window.Store.getState().historyFilters);
    expect(f.tags).toEqual(['friends']);
    expect(f.categories).toEqual([]);
    expect(f.period.type).toBe('custom'); // all time
    await expect(page.locator('#router-view .list-item[data-id]')).toHaveCount(1);
    await expect(page.locator('#router-view .list-item[data-id]')).toContainText('Dining');

    // ── L23 Edit Account (Cash): a later opening date → Entries before this date ─
    const earliest = await state(page, (id) => window.Store.getState().transactions
      .filter(t => t.accountId === id && t.type !== 'opening_balance').map(t => t.date).sort()[0], cashId);
    const openingBefore = await state(page, (id) => window.Store.getAccountOpeningDate(id), cashId);
    expect(openingBefore < earliest).toBe(true);
    await go(page, '#dashboard', 'dashboard');
    await page.locator(`.wallet-card[data-id="${cashId}"] .account-edit-trigger`).click();
    await expect(page).toHaveURL(new RegExp(`#edit-account\\?id=${cashId}$`));
    await expect(page.locator('#edit-acc-name')).toHaveValue('Cash');
    await expect(page.locator('#edit-acc-date')).toHaveValue(openingBefore);
    await page.fill('#edit-acc-date', TODAY);
    await page.click('#btn-edit-acc-save');
    const ods = page.locator('#opening-date-sheet');
    await expect(ods).toBeVisible();
    await expect(ods).toContainText('Entries before this date');
    await expect(ods).toContainText('6 entries (-€72.30) are dated before Nov 8, 2026. They will stay in History but no longer count in balances, budgets or charts.');
    const fmtEarliest = await page.evaluate((d) => window.Components.OpeningDateSheet.fmtDate(d), earliest);
    await expect(page.locator('#opening-date-primary')).toHaveText(`Open on ${fmtEarliest} instead`);
    await expect(page.locator('#opening-date-anyway')).toHaveText('Change anyway');
    await page.click('#opening-date-primary');
    await page.waitForFunction(() => window.Store.getState().activeView === 'dashboard');
    expect(await state(page, (id) => window.Store.getAccountOpeningDate(id), cashId)).toBe(earliest);

    // ── L24 Delete Account (Cash) ─────────────────────────────────────────
    const balancesBefore = await state(page, () => Object.fromEntries(window.Store.getState().accounts.map(a => [a.id, window.Store.getAccountBalance(a.id)])));
    await page.locator(`.wallet-card[data-id="${cashId}"] .account-edit-trigger`).click();
    await page.waitForSelector('#btn-edit-acc-delete');
    await page.click('#btn-edit-acc-delete');
    await expect(page.locator('#modal-title')).toHaveText('Delete Account?');
    await expect(page.locator('.modal-body')).toContainText('Are you sure you want to delete "Cash"?');
    await expect(page.locator('.modal-body')).toContainText('All associated transactions will be permanently deleted.');
    await expect(page.locator('#modal-delete-btn')).toHaveText('Yes, Delete Everything');
    await page.click('#modal-delete-btn');
    await page.waitForFunction(() => window.Store.getState().activeView === 'dashboard');
    await expectModalClosed(page);
    await expect(page.locator(`.wallet-card[data-id="${cashId}"]`)).toHaveCount(0);
    await expect(page.locator('.wallet-card')).toHaveCount(3);
    const remaining = Object.keys(balancesBefore).filter(id => id !== cashId).reduce((s, id) => s + balancesBefore[id], 0);
    const expectedTotal = await page.evaluate((v) => window.Store.formatCurrency(v, 'EUR'), remaining);
    await expect(page.locator('#dash-total')).toHaveText(expectedTotal);
    expect(await state(page, (id) => window.Store.getState().transactions.some(t => t.accountId === id), cashId)).toBe(false);
    expect(await state(page, () => window.Store.getState().accounts.length)).toBe(3);

    // ── L25 Factory Reset → Welcome again ─────────────────────────────────
    await openSettings(page);
    await page.locator('#btn-factory-reset').scrollIntoViewIfNeeded();
    await page.click('#btn-factory-reset');
    await expect(page.locator('#modal-title')).toHaveText('Factory Reset?');
    await expect(page.locator('#modal-save-btn')).toHaveText('Keep Data');
    await expect(page.locator('#modal-delete-btn')).toBeVisible();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      page.click('#modal-delete-btn')
    ]);
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);
    await expect(page.locator('#active-modal')).toBeVisible();
    await expect(page.locator('#modal-title')).toHaveText("Welcome to Stack'd 👋");
    await expect(page.locator('#setup-row-currency')).toBeVisible();
    const storage = await page.evaluate(() => ({
      setupDone: localStorage.getItem('stackd_v1_setup_done'),
      accounts: JSON.parse(localStorage.getItem('stackd_v1_accounts') || '[]').length,
      transactions: JSON.parse(localStorage.getItem('stackd_v1_transactions') || '[]').length,
      loans: JSON.parse(localStorage.getItem('stackd_v1_loans') || '[]').length,
      rules: JSON.parse(localStorage.getItem('stackd_v1_importRules') || '[]').length
    }));
    expect(storage).toEqual({ setupDone: null, accounts: 0, transactions: 0, loans: 0, rules: 0 });
    expect(await state(page, () => ({ a: window.Store.getState().accounts.length, t: window.Store.getState().transactions.length }))).toEqual({ a: 0, t: 0 });

    expect(w.dialogs).toEqual([]);
    expect(w.errors).toEqual([]);
  });
});

// "€703.47" as the app prints it (en locale, EUR), for a text assertion.
function window_fmt(n) {
  return '€' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
