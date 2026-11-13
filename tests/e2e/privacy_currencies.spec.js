import { test, expect } from '@playwright/test';

// 1.3.0 (docs/privacy-currencies-plan.md): PL-2 every currency in one
// searchable picker (onboarding, Settings, the account form) and PL-3 App
// lock. The lock's native half is window.__STACKD_LOCK_STUB__, installed
// before any app script runs — the web build itself has no App lock (A1).
const seed = async (page, extra) => {
  await page.goto('/');
  await page.evaluate((more) => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
    localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
    Object.keys(more || {}).forEach(k => localStorage.setItem(k, more[k]));
  }, extra || {});
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.waitForFunction(() => !!window.Store && !!window.AppLock);
  await expect(page.locator('#splash-screen')).toHaveCount(0);
};

const ACCOUNT = {
  stackd_v1_accounts: JSON.stringify([{ id: 'a1', name: 'Main', type: 'Bank', currency: 'EUR', icon: 'wallet', color: '#0075EB' }]),
  stackd_v1_transactions: JSON.stringify([
    { id: 'ob1', type: 'opening_balance', amount: 1234.5, accountId: 'a1', categoryId: 'cat_balance', date: '2026-01-01', time: '00:00' }
  ])
};

test.describe('Every currency (PL-2)', () => {
  test.describe('on a South African phone', () => {
    test.use({ locale: 'en-ZA' });

    test('onboarding opens on the Rand, and the app then shows R', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => { localStorage.clear(); });
      await page.reload();
      await expect(page.locator('#active-modal')).toBeVisible();
      await expect(page.locator('#setup-currency-subtitle')).toHaveText('ZAR — South African Rand');
      // the picker lists it first, and still offers every other currency
      await page.click('#setup-row-currency');
      const sheet = page.locator('#setup-picker-sheet');
      await expect(sheet.locator('.setup-picker-opt').first()).toHaveAttribute('data-code', 'ZAR');
      await sheet.locator('#currency-search').fill('swiss');
      await expect(sheet.locator('.setup-picker-opt')).toHaveCount(1);
      await sheet.locator('.setup-picker-opt[data-code="CHF"]').click();
      await expect(page.locator('#setup-currency-subtitle')).toHaveText('CHF — Swiss Franc');
      await page.click('#setup-row-currency');
      await page.locator('#setup-picker-sheet .setup-picker-opt[data-code="ZAR"]').click();
      await expect(page.locator('#setup-picker-sheet')).toHaveCount(0);
      await page.click('#modal-save-btn');
      await expect(page.locator('#active-modal')).toBeHidden();
      await expect(page.locator('#dash-total')).toHaveText('R0.00');
      expect(await page.evaluate(() => window.Store.getState().currency)).toBe('ZAR');
    });
  });

  test('Settings: search, pick, Done — and Cancel applies nothing', async ({ page }) => {
    await seed(page);
    await page.goto('/#settings');
    await expect(page.locator('#current-currency-display')).toHaveText('EUR — Euro');
    await page.click('#btn-open-currency');
    const list = page.locator('#active-modal #currency-opts');
    await expect(list.locator('.currency-opt[aria-checked="true"]')).toHaveAttribute('data-code', 'EUR');
    // far more than the old five, in a list that scrolls inside the sheet
    expect(await list.locator('.currency-opt').count()).toBeGreaterThan(140);
    expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);

    await page.fill('#currency-search', 'rand');
    await expect(list.locator('.currency-opt')).toHaveCount(1);
    await list.locator('.currency-opt[data-code="ZAR"]').click();
    await expect(list.locator('.currency-opt[data-code="ZAR"]')).toHaveAttribute('aria-checked', 'true');
    await page.click('#modal-cancel-btn');
    await expect(page.locator('#current-currency-display')).toHaveText('EUR — Euro');

    await page.click('#btn-open-currency');
    await page.fill('#currency-search', 'zzzz');
    await expect(page.locator('#active-modal .currency-empty')).toHaveText('No currency found');
    await page.fill('#currency-search', 'ZAR');
    await page.locator('#active-modal .currency-opt[data-code="ZAR"]').click();
    await page.click('#modal-save-btn');
    await expect(page.locator('#current-currency-display')).toHaveText('ZAR — South African Rand');
    await page.goto('/#dashboard');
    await expect(page.locator('#dash-total')).toHaveText('R0.00');
  });

  test('the account form picks any currency, and a word sign fits its field', async ({ page }) => {
    await seed(page, ACCOUNT);
    await page.goto('/#edit-account?id=a1');
    await expect(page.locator('#acc-currency-label')).toHaveText('EUR — Euro');
    await page.click('#btn-acc-currency');
    await page.fill('#currency-search', 'franc suisse'); // English UI: no match by a French name
    await expect(page.locator('#active-modal .currency-empty')).toBeVisible();
    await page.fill('#currency-search', 'chf');
    await page.locator('#active-modal .currency-opt[data-code="CHF"]').click();
    await page.click('#modal-save-btn');
    await expect(page.locator('#acc-currency-label')).toHaveText('CHF — Swiss Franc');
    await expect(page.locator('#ob-sign-symbol')).toHaveText('CHF');
    // the three-letter sign does not sit on the digits (the field's padding
    // eases to its new value, so wait for it to settle)
    await expect.poll(() => page.evaluate(() => {
      const sign = document.getElementById('ob-sign-symbol').getBoundingClientRect();
      const input = document.getElementById('edit-acc-balance');
      const pad = parseFloat(getComputedStyle(input).paddingLeft);
      return input.getBoundingClientRect().left + pad - sign.right;
    })).toBeGreaterThanOrEqual(4);
    await page.click('#btn-edit-acc-save');
    await expect.poll(() => page.evaluate(() => window.Store.getState().accounts[0].currency)).toBe('CHF');
  });
});

test.describe('App lock (PL-3)', () => {
  const installStub = () => {
    window.__STACKD_LOCK_STUB__ = {
      calls: [],
      answer: { ok: true },
      async status() { return { biometry: 'fingerprint', enrolled: true, deviceSecure: true }; },
      async authenticate(opts) { this.calls.push(opts); return this.answer; },
      async setPrivacyCover() { return {}; }
    };
  };
  const press = async (page, pin) => {
    for (const d of pin) await page.click(`#app-lock .app-lock-key[data-key="${d}"]`);
  };
  const turnOn = async (page, pin) => {
    await page.goto('/#settings');
    await page.locator('label.toggle-switch:has(#toggle-app-lock)').click();
    await expect(page.locator('#app-lock-title')).toHaveText('Create a PIN');
    await press(page, pin);
    await expect(page.locator('#app-lock-title')).toHaveText('Repeat the PIN');
    await press(page, pin);
    await expect(page.locator('#app-lock')).toHaveCount(0);
    await expect(page.locator('#toggle-app-lock')).toBeChecked();
  };

  test('the web build has no App lock row', async ({ page }) => {
    await seed(page);
    await page.goto('/#settings');
    await expect(page.locator('#toggle-shake-to-hide')).toHaveCount(1);
    await expect(page.locator('#toggle-app-lock')).toHaveCount(0);
  });

  test('create a PIN, relaunch locked, wrong PIN, right PIN', async ({ page }) => {
    await page.addInitScript(installStub);
    await seed(page, ACCOUNT);
    await turnOn(page, '2580');
    await expect(page.locator('#btn-app-lock-delay')).toContainText('1 minute away');

    await page.goto('/#dashboard');
    await page.reload();
    const lock = page.locator('#app-lock');
    await expect(lock).toBeVisible();
    await expect(page.locator('#splash-screen')).toHaveCount(0); // the splash fades over the lock
    await expect(page.locator('#app-lock-title')).toHaveText('Enter your PIN');
    // the lock covers the whole screen and the app underneath is out of reach
    const covered = await page.evaluate(() => {
      const r = document.getElementById('app-lock').getBoundingClientRect();
      const top = document.elementFromPoint(window.innerWidth / 2, 80);
      return {
        full: r.width >= window.innerWidth && r.height >= window.innerHeight,
        onTop: !!top && !!top.closest('#app-lock'),
        inert: document.getElementById('app').hasAttribute('inert')
      };
    });
    expect(covered).toEqual({ full: true, onTop: true, inert: true });

    await press(page, '0000');
    await expect(page.locator('#app-lock-msg')).toHaveText('Wrong PIN');
    await press(page, '2580');
    await expect(lock).toHaveCount(0);
    await expect(page.locator('#dash-total')).toBeVisible();
    expect(await page.evaluate(() => document.getElementById('app').hasAttribute('inert'))).toBe(false);
  });

  test('the fingerprint opens it; the keypad is reachable by keyboard', async ({ page }) => {
    await page.addInitScript(installStub);
    await seed(page, ACCOUNT);
    await turnOn(page, '1379');
    await page.locator('label.toggle-switch:has(#toggle-app-lock-bio)').click();
    await expect(page.locator('#toggle-app-lock-bio')).toBeChecked();

    // relaunch with a fingerprint that is not recognised: the PIN pad stays
    await page.addInitScript(() => { window.__STACKD_LOCK_STUB__.answer = { ok: false, code: 'cancel' }; });
    await page.reload();
    await expect(page.locator('#app-lock')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__STACKD_LOCK_STUB__.calls.length)).toBe(1);
    await expect(page.locator('#app-lock-bio')).toHaveAttribute('aria-label', 'Unlock with your fingerprint');
    await page.keyboard.type('1379');
    await expect(page.locator('#app-lock')).toHaveCount(0);

    // and with one that is: no PIN needed
    await page.addInitScript(() => { window.__STACKD_LOCK_STUB__.answer = { ok: true }; });
    await page.reload();
    await expect(page.locator('#bottom-nav')).toBeVisible();
    await expect(page.locator('#app-lock')).toHaveCount(0);
  });

  test("Forgot PIN: the phone's screen lock turns App lock off and keeps the data", async ({ page }) => {
    await page.addInitScript(installStub);
    await seed(page, ACCOUNT);
    await turnOn(page, '4826');
    await page.reload();
    await expect(page.locator('#app-lock')).toBeVisible();
    await page.click('#app-lock-forgot');
    await expect(page.locator('#app-lock-title')).toHaveText('Forgot your PIN?');
    await page.click('#app-lock-reset');
    await expect(page.locator('#app-lock')).toHaveCount(0);
    await expect(page.locator('#app-lock-off-sheet')).toBeVisible();
    await page.click('#app-lock-off-sheet-ok');
    expect(await page.evaluate(() => ({
      lock: window.Store.getAppLock().enabled,
      stored: localStorage.getItem('stackd_v1_appLock'),
      accounts: window.Store.getState().accounts.length,
      asked: window.__STACKD_LOCK_STUB__.calls[0].allowDeviceCredential
    }))).toEqual({ lock: false, stored: null, accounts: 1, asked: true });
  });

  test('"Immediately" locks when the app is left; turning the lock off needs the PIN', async ({ page }) => {
    await page.addInitScript(installStub);
    await seed(page, ACCOUNT);
    await turnOn(page, '1111');
    await page.click('#btn-app-lock-delay');
    await page.locator('#active-list-picker .list-picker-item', { hasText: 'Immediately' }).click();
    await expect(page.locator('#btn-app-lock-delay')).toContainText('Immediately');

    // leave and come back (the two edges the phone reports)
    await page.evaluate(() => { window.AppLock._left(); window.AppLock._back(); });
    await expect(page.locator('#app-lock-title')).toHaveText('Enter your PIN');
    await press(page, '1111');
    await expect(page.locator('#app-lock')).toHaveCount(0);

    await page.locator('label.toggle-switch:has(#toggle-app-lock)').click();
    await expect(page.locator('#app-lock-title')).toHaveText('Enter your current PIN');
    await press(page, '1111');
    await expect(page.locator('#app-lock')).toHaveCount(0);
    await expect(page.locator('#toggle-app-lock')).not.toBeChecked();
    await expect(page.locator('#btn-app-lock-delay')).toHaveCount(0);
  });

  test('the PIN pad fits a small phone and a 200 % text size', async ({ page }) => {
    await page.addInitScript(installStub);
    await page.setViewportSize({ width: 320, height: 568 });
    await seed(page, ACCOUNT);
    await turnOn(page, '2468');
    await page.reload();
    await expect(page.locator('#app-lock')).toBeVisible();
    const fits = async () => page.evaluate(() => {
      const lock = document.getElementById('app-lock');
      const keys = [...lock.querySelectorAll('.app-lock-key[data-key]')].map(k => k.getBoundingClientRect());
      const sideways = lock.scrollWidth > lock.clientWidth + 1;
      const overlap = keys.some((a, i) => keys.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
      const small = keys.some(k => k.width < 44 || k.height < 44);
      return { sideways, overlap, small };
    });
    expect(await fits()).toEqual({ sideways: false, overlap: false, small: false });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    expect(await fits()).toEqual({ sideways: false, overlap: false, small: false });
    // every key can still be brought into view and pressed
    for (const d of '2468') {
      const key = page.locator(`#app-lock .app-lock-key[data-key="${d}"]`);
      await key.scrollIntoViewIfNeeded();
      await key.click();
    }
    await expect(page.locator('#app-lock')).toHaveCount(0);
  });
});
