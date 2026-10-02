import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

// 1.0.1 (BUG-02): a backup restore used to unlink a tracked loan from its
// payment series. The restored loan offered "Track monthly payment" again,
// and accepting it doubled every payment. This drives the real buttons:
// every Export button → factory reset → every file back through Import CSV
// (loans BEFORE transactions, the harder order) → the loan is still tracked.
// tests/unit/loanRestoreLink.test.js covers the orderings and the fallback.
test.describe('Loan restore E2E', () => {
  const freshInstall = async (page) => {
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.LoanEngine);
  };

  const goToSettings = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-import-csv');
  };

  test('a tracked loan comes back tracked, with no doubled payments', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-01T12:00:00'));
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    // Before 1.0.1 (U6) the import result was an alert(); afterwards it is an
    // in-app sheet. Accept a dialog if one appears, but never require one.
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    await page.goto('/');
    await freshInstall(page);

    const original = await page.evaluate(() => {
      const S = window.Store;
      S.dispatch('ADD_ACCOUNT', { name: 'Main Bank', openingBalance: 5000, openingDate: '2026-01-01' });
      S.dispatch('ADD_LOAN', {
        name: 'Home Mortgage', kind: 'active',
        config: {
          type: 'mortgage', principal: 200000, downPayment: 0, duration: 5, durationUnit: 'years',
          annualRate: 3, firstPaymentDate: '2026-11-01', amortization: 'french'
        }
      });
      const loan = S.getState().loans[0];
      const seriesId = window.StackdDB.generateId();
      // The same two steps the "Track monthly payment" flow takes.
      S.dispatch('SET_PENDING_LOAN_LINK', { loanId: loan.id, seriesId });
      S.dispatch('ADD_TRANSACTION', {
        type: 'expense', amount: 969.36, accountId: S.getState().accounts[0].id,
        categoryId: 'cat_debt', date: '2026-11-01',
        comment: window.I18n.t('debt.paymentNote', { name: loan.name }),
        recurrence: { seriesId, interval: 1, frequency: 'months', endDate: '2031-10-01' }
      });
      const linked = S.getLoanLinkedTransactions(S.getState().loans[0]);
      return { seriesId, members: linked ? linked.length : 0 };
    });
    expect(original.members).toBeGreaterThan(12);

    // ── Back up through the buttons ────────────────────────────────────────
    await goToSettings(page);
    const saved = {};
    for (const id of ['accounts', 'categories', 'transactions', 'loans', 'budgets', 'rules']) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click(`#btn-export-${id}`)
      ]);
      saved[id] = { name: download.suggestedFilename(), text: readFileSync(await download.path(), 'utf8') };
    }
    expect(saved.loans.text.split('\n')[0]).toContain('LinkedSeriesId');

    // ── Factory reset ─────────────────────────────────────────────────────
    await freshInstall(page);
    expect(await page.evaluate(() => window.Store.getState().loans.length)).toBe(0);
    await goToSettings(page);

    const importOne = async (file) => {
      const n = dialogs.length;
      await page.setInputFiles('#import-csv-file', {
        name: file.name, mimeType: 'text/csv', buffer: Buffer.from(file.text, 'utf8')
      });
      const sheet = page.locator('#import-result-modal');
      await expect.poll(async () => dialogs.length > n || (await sheet.count()) > 0).toBe(true);
      if (dialogs.length === n) {
        await page.click('#import-result-modal-ok');
        await expect(sheet).toHaveCount(0);
      }
      expect(page.url()).not.toContain('#import-map');
    };
    // The harder order: the loans file arrives before its payment series.
    for (const id of ['loans', 'accounts', 'categories', 'transactions', 'budgets', 'rules']) {
      await importOne(saved[id]);
    }

    const restored = await page.evaluate(() => {
      const S = window.Store;
      const loan = S.getState().loans[0];
      const linked = S.getLoanLinkedTransactions(loan);
      const series = new Set(S.getState().transactions
        .filter(t => t.recurrence && t.recurrence.seriesId).map(t => t.recurrence.seriesId));
      return {
        id: loan.id,
        linkedSeriesId: loan.linkedSeriesId,
        members: linked ? linked.length : 0,
        seriesCount: series.size,
        onFirstDue: S.getState().transactions.filter(t => t.date === '2026-11-01' && t.type === 'expense').length
      };
    });
    expect(restored.linkedSeriesId).toBe(original.seriesId);
    expect(restored.members).toBe(original.members);
    expect(restored.seriesCount).toBe(1);
    expect(restored.onFirstDue).toBe(1);

    // The loan page says "Tracked" and offers no second tracking.
    await page.evaluate((id) => { window.location.hash = `#debt-results?id=${id}`; }, restored.id);
    await page.waitForSelector('#debt-results-view');
    await expect(page.locator('#dres-tracked')).toBeVisible();
    await expect(page.locator('#btn-dres-track')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
