import { test, expect } from '@playwright/test';

// v1.05 Bank Connect, phase B2 (docs/bank-connect-ux-plan.md §3.1–§3.5, §3.9):
// Settings → Online banking hub → consent toggle → disclosure → bank picker →
// paywall → (stub) purchase → connect start. The broker is replaced by
// window.__STACKD_BROKER_STUB__ (installed before any app script runs), so
// nothing here touches the network. The App-Link return + mapping are B3.
test.describe('Bank Connect (B2) E2E flow', () => {
  const installStub = () => {
    window.__STACKD_BROKER_STUB__ = {
      calls: [],
      opened: null,
      prices: { monthly: { price: '€2.99' }, yearly: { price: '€29.99', perMonth: '€2.50' } },
      async request(path, opts) {
        this.calls.push({ path, opts });
        if (path.startsWith('/v1/institutions')) {
          return [
            { id: 'TEST_BANK', name: 'Test Bank', logo: '', transaction_total_days: 730, max_access_valid_for_days: 180 },
            { id: 'OTHER_BANK', name: 'Other Savings', logo: '', transaction_total_days: 90, max_access_valid_for_days: 90 }
          ];
        }
        if (path === '/v1/connect/start') return { ref: 'req_e2e', bankRedirectUrl: 'https://bank.example/sca' };
        throw new Error('unexpected broker path ' + path);
      },
      async purchase(plan) {
        this.purchased = plan;
        return { active: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), ownerId: 'owner_abcdefgh' };
      },
      async restore() { return null; },
      async openSca(url) { this.opened = url; }
    };
  };

  const bootstrap = async (page) => {
    await page.addInitScript(installStub);
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.BankConnect);
  };

  const openHub = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#btn-open-bank-connect');
    await page.click('#btn-open-bank-connect');
    await page.waitForSelector('#bank-connect');
  };

  test('consent toggle → disclosure → picker → paywall → purchase → connect start', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

    await bootstrap(page);
    await openHub(page);

    // Off by default: explainer + disabled CTA, and the stub was never called.
    await expect(page.locator('#bank-explainer')).toBeVisible();
    await expect(page.locator('#bank-add')).toBeDisabled();
    expect(await page.evaluate(() => window.__STACKD_BROKER_STUB__.calls.length)).toBe(0);

    // "Not now" reverts the toggle without persisting anything.
    await page.click('label.toggle-switch');
    await page.waitForSelector('#bank-disclosure-modal.open');
    await page.click('#bank-disclosure-decline');
    await expect(page.locator('#bank-toggle')).not.toBeChecked();
    expect(await page.evaluate(() => window.Store.getState().bankConnect.enabled)).toBe(false);

    // Accepting records consent and enables the feature.
    await page.click('label.toggle-switch');
    await page.waitForSelector('#bank-disclosure-modal.open');
    await page.click('#bank-disclosure-accept');
    await expect(page.locator('#bank-empty')).toBeVisible();
    await expect(page.locator('#bank-add')).toBeEnabled();
    const prefs = await page.evaluate(() => window.Store.getState().bankConnect);
    expect(prefs.enabled).toBe(true);
    expect(prefs.consentAt).toBeTruthy();
    expect(prefs.consentVersion).toBeTruthy();

    // Picker: institutions load through the stub only after the toggle.
    await page.click('#bank-add');
    await page.waitForSelector('#bank-picker');
    await page.waitForSelector('.bank-inst-row');
    await expect(page.locator('.bank-inst-row')).toHaveCount(2);
    await expect(page.locator('#bank-connect-cta')).toBeDisabled();

    await page.fill('#bank-search', 'other');
    await expect(page.locator('.bank-inst-row')).toHaveCount(1);
    await page.fill('#bank-search', '');
    await page.click('.bank-inst-row[data-id="TEST_BANK"]');
    await expect(page.locator('#bank-connect-cta')).toBeEnabled();
    await expect(page.locator('#bank-connect-cta')).toHaveText('Connect Test Bank');

    // Not entitled → paywall names the bank; nothing was sent to connect/start.
    await page.click('#bank-connect-cta');
    await page.waitForSelector('#bank-paywall.open');
    await expect(page.locator('#bank-paywall-bank')).toHaveText('Works with Test Bank');
    await expect(page.locator('#bank-paywall-plans')).toBeVisible();
    expect(await page.evaluate(() => window.__STACKD_BROKER_STUB__.calls.some(c => c.path === '/v1/connect/start'))).toBe(false);

    // Stub purchase → entitlement cached → the connect leg starts at once.
    await page.click('.bank-plan[data-plan="monthly"]');
    await page.click('#bank-paywall-subscribe');
    await page.waitForFunction(() => window.__STACKD_BROKER_STUB__.opened === 'https://bank.example/sca');
    const after = await page.evaluate(() => ({
      purchased: window.__STACKD_BROKER_STUB__.purchased,
      start: window.__STACKD_BROKER_STUB__.calls.find(c => c.path === '/v1/connect/start').opts.body,
      prefs: window.Store.getState().bankConnect
    }));
    expect(after.purchased).toBe('monthly');
    expect(after.start).toEqual({ country: 'GB', institutionId: 'TEST_BANK', historyDays: 90, validityDays: 180 });
    expect(after.prefs.entitlement.active).toBe(true);
    expect(after.prefs.pendingRef).toBe('req_e2e');
    expect(after.prefs.ownerId).toBe('owner_abcdefgh');
    await expect(page.locator('#bank-paywall')).toHaveCount(0);

    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('bank settings sheet saves history depth, consent duration and import-from; Settings row shows status', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await bootstrap(page);
    await page.evaluate(() => {
      window.Store.dispatch('SET_BANK_CONNECT_PREFS', { enabled: true, consentAt: new Date().toISOString(), consentVersion: window.BankConnect.termsVersion(), ownerId: 'owner_12345678' });
    });
    await openHub(page);

    await page.click('#bank-open-settings');
    await page.waitForSelector('#bank-settings-modal.open');
    await expect(page.locator('#bank-set-sub')).toHaveText('Not subscribed');
    await expect(page.locator('#bank-set-support')).toContainText('12345678');
    await page.selectOption('#bank-set-history', '0');
    await page.selectOption('#bank-set-validity', '90');
    await page.fill('#bank-set-from', '2026-06-01');
    await page.click('#bank-set-save');
    await expect(page.locator('#bank-settings-modal')).toHaveCount(0);

    const prefs = await page.evaluate(() => window.Store.getState().bankConnect);
    expect(prefs.historyDays).toBe(0);
    expect(prefs.validityDays).toBe(90);
    expect(prefs.importFrom).toBe('2026-06-01');

    // Pausing with a live connection asks first; confirming flips the toggle.
    await page.evaluate(() => {
      window.Store.dispatch('ADD_BANK_CONNECTION', { ref: 'r1', institutionId: 'TEST_BANK', institutionName: 'Test Bank', accounts: [{ bankAccountId: 'x', stackdAccountId: null, ibanTail: '9876', currency: 'EUR' }] });
    });
    await expect(page.locator('.bank-conn-card[data-ref="r1"]')).toBeVisible();
    await page.click('label.toggle-switch');
    await page.waitForSelector('#active-modal.open');
    await expect(page.locator('#bank-toggle')).toBeChecked();
    await page.click('#modal-save-btn');
    await expect(page.locator('#bank-toggle')).not.toBeChecked();
    await expect(page.locator('.bank-chip-paused')).toBeVisible();

    // The Settings row reflects the paused state without opening the hub.
    await page.click('a[href="#settings"]');
    await page.waitForSelector('#bank-settings-subtitle');
    await expect(page.locator('#bank-settings-subtitle')).toHaveText('Paused');

    expect(errors).toEqual([]);
  });
});
