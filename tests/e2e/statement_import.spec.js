import { test, expect } from '@playwright/test';

// v1.00 structured statement import (docs/bank-import-plan.md §4): an MT940
// (or camt.053) file skips column mapping — #import-map renders as a
// "Statement Details" step (account, currency, balances, opening-balance
// offer) feeding the same #import-preview + BATCH_IMPORT_BANK_TRANSACTIONS
// pipeline. Reconciliation compares the computed balance against CLBD.
test.describe('MT940 statement import E2E flow', () => {
  // OPBD 1000.00 → −45.90 + 850.00 → CLBD 1804.10 (consistent, so the happy
  // path must NOT produce a reconciliation warning).
  const MT940_TEXT = [
    '{1:F01BANKDEFF0000000000}{2:O940BANKDEFF}{4:',
    ':20:STMT-2026-01',
    ':25:DE89370400440532013000',
    ':28C:1/1',
    ':60F:C260101EUR1000,00',
    ':61:2601030103D45,90NTRFRECEIPT-77//BK-REF-1',
    ':86:?32SUPERMERCATO ROSSI?20Spesa settimanale',
    ':61:260105C850,00NTRFNONREF//BANK-XYZ',
    ':86:BONIFICO STIPENDIO',
    ':62F:C260131EUR1804,10',
    '-}'
  ].join('\n');

  const bootstrap = async (page) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
      // EUR app currency: matches the statement, so the currency-mismatch
      // warning stays hidden and reconciliation actually runs.
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store);

    // A zero-opening account with no activity — eligible for the OPBD offer.
    await page.evaluate(() => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0 });
    });
  };

  const goToSettings = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-import-csv');
  };

  const uploadStatement = async (page) => {
    await page.setInputFiles('#import-csv-file', {
      name: 'statement.sta', // deliberately unhelpful extension: content sniff decides
      mimeType: 'text/plain',
      buffer: Buffer.from(MT940_TEXT)
    });
    await page.waitForSelector('#import-map');
  };

  test('imports an MT940 statement with opening balance, reconciles, and dedups a re-import', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    await bootstrap(page);
    await goToSettings(page);

    // ── Statement details step ─────────────────────────────────────────────
    await uploadStatement(page);

    await expect(page.locator('#import-map')).toContainText('Statement Details');
    await expect(page.locator('#import-map')).toContainText('MT940');
    await expect(page.locator('#import-map')).toContainText('EUR');
    // Balances straight from :60F:/:62F:.
    await expect(page.locator('#import-map')).toContainText('1,000.00 EUR');
    await expect(page.locator('#import-map')).toContainText('1,804.10 EUR');
    // Same currency → no mismatch warning.
    await expect(page.locator('#import-map')).not.toContainText('nothing is converted');
    // The account has no activity → the opening-balance offer is armed.
    await expect(page.locator('#imap-set-opening')).toBeChecked();

    // Live preview shows parsed entries with MT940 narratives.
    await expect(page.locator('#imap-preview')).toContainText('SUPERMERCATO ROSSI — Spesa settimanale');
    await expect(page.locator('#imap-preview')).toContainText('2026-01-03');

    // ── Preview + confirm ──────────────────────────────────────────────────
    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');

    await expect(page.locator('.import-row')).toHaveCount(2);
    await expect(page.locator('#iprev-selected-text')).toHaveText('2 transactions selected');

    await page.click('#btn-iprev-confirm');
    await page.waitForSelector('#btn-import-csv'); // back on Settings

    const done = dialogs[dialogs.length - 1];
    expect(done).toContain('Imported 2 transactions into Main');
    // Balances reconcile exactly → no "Heads up" warning appended.
    expect(done).not.toContain('Heads up');

    const state = await page.evaluate(() => {
      const s = window.Store.getState();
      const acc = s.accounts[0];
      return {
        opening: s.transactions.find(t => t.type === 'opening_balance' && t.accountId === acc.id),
        imported: s.transactions.filter(t => t.importKey).map(t => ({
          type: t.type, amount: t.amount, date: t.date, importKey: t.importKey, bankRef: t.bankRef
        })),
        balance: window.Store.getBalanceAtDate('2026-01-31', [acc.id]),
        presets: s.importPresets.length
      };
    });

    // OPBD honoured via the opening_balance transaction.
    expect(state.opening).toMatchObject({ amount: 1000, date: '2026-01-01' });
    // Both rows carry ref: keys (MT940 references), no preset saved for statements.
    expect(state.imported).toHaveLength(2);
    state.imported.forEach(t => expect(t.importKey.startsWith('ref:')).toBe(true));
    expect(state.presets).toBe(0);
    // 1000 − 45.90 + 850.00 = 1804.10 — matches the statement's CLBD.
    expect(state.balance).toBeCloseTo(1804.10, 2);

    // ── Re-import: every row dedups on its bank reference ──────────────────
    await uploadStatement(page);
    // Opening-balance offer is gone: the account has activity now.
    await expect(page.locator('#imap-opening-wrap')).toBeHidden();

    await page.click('#btn-imap-continue');
    await page.waitForSelector('#import-preview');

    await expect(page.locator('.import-row-muted')).toHaveCount(2);
    await expect(page.locator('.import-row-check')).toHaveCount(0);
    await expect(page.locator('#btn-iprev-confirm')).toHaveText('Import 0 transactions');

    expect(await page.evaluate(() =>
      window.Store.getState().transactions.filter(t => t.importKey).length
    )).toBe(2);

    expect(errors).toEqual([]);
  });
});
