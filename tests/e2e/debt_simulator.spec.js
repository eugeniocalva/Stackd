import { test, expect } from '@playwright/test';

// Rewritten for the debt rebuild Phase 3 (docs/debt-rebuild-plan.md §8):
// #debt is the loan hub (type tiles + Simulations + My Loans), #debt-sim is
// the simulator form, #debt-results shows summary + amortization schedule.
// Figures are pinned to the LoanEngine calibration loan (111,000 @ 4.05% / 30y
// → $533.14/month, $80,927.05 interest, last payment 06/08/56).
test.describe('Loan simulator E2E flow', () => {
  const bootstrap = async (page) => {
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
    await page.waitForFunction(() => !!window.Store && !!window.LoanEngine);
  };

  // Modal.hide() empties #modal-container on a 300ms timer; assert emptiness so
  // the backdrop can't swallow the next click.
  const expectModalClosed = (page) => expect(page.locator('#active-modal')).toHaveCount(0);

  const goToHub = async (page) => {
    await page.click('#nav-fab-toggle');
    await page.click('a[href="#debt"]');
    await page.waitForSelector('#debt-hub');
  };

  const fillCalibrationLoan = async (page) => {
    await page.waitForSelector('#debt-sim-form');
    await page.fill('#dsim-principal', '111000');
    await page.fill('#dsim-duration', '30');
    await page.fill('#dsim-rate', '4.05');
    await page.fill('#dsim-first-date', '2026-09-06');
  };

  test('simulates, saves, promotes and deletes a mortgage', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await bootstrap(page);
    await goToHub(page);

    // Hub: back link, tiles, My Loans empty state
    await expect(page.locator('#debt-hub a[href="#dashboard"]')).toBeVisible();
    await expect(page.locator('.debt-type-tile')).toHaveCount(3);
    await expect(page.locator('#debt-loans-empty')).toBeVisible();

    // Simulate the calibration mortgage
    await page.click('.debt-type-tile[data-type="mortgage"]');
    await fillCalibrationLoan(page);
    await page.click('#btn-dsim-calculate');

    // Results: calibration figures
    await page.waitForSelector('#debt-results-view');
    await expect(page.locator('#debt-results-view')).toContainText('$533.14');
    await expect(page.locator('#debt-results-view')).toContainText('$80,927.05');
    await expect(page.locator('#debt-results-view')).toContainText('06/08/56');

    // Amortization schedule: brief row 1, then detailed split
    await page.click('#dres-schedule-toggle');
    await expect(page.locator('#dres-schedule-rows')).toContainText('06/09/26');
    await expect(page.locator('#dres-schedule-rows')).toContainText('$110,841.49');
    await page.click('#dres-schedule-mode .chart-toggle-btn[data-mode="detailed"]');
    await expect(page.locator('#dres-schedule-rows')).toContainText('interest $374.63');
    await expect(page.locator('#dres-schedule-rows')).toContainText('principal $158.51');

    // Save as a named simulation
    await page.click('#btn-dres-save');
    await page.waitForSelector('#loan-name-input');
    await page.fill('#loan-name-input', 'Casa Nuova');
    await page.click('#modal-save-btn');
    await expectModalClosed(page);

    // Back on the hub: the simulation is listed with its payment
    await page.waitForSelector('#debt-hub');
    await expect(page.locator('.debt-sim-item')).toHaveCount(1);
    await expect(page.locator('.debt-sim-item')).toContainText('Casa Nuova');
    await expect(page.locator('.debt-sim-item')).toContainText('$533.14');

    // Reopen the saved simulation → promote it to My Loans via the ⋯ menu
    await page.click('.debt-sim-item');
    await page.waitForSelector('#debt-results-view');
    await expect(page.locator('#debt-results-view')).toContainText('Casa Nuova');
    await page.click('#btn-dres-menu');
    await page.click('.dres-menu-opt[data-act="promote"]');
    await page.waitForSelector('#debt-hub');
    await expect(page.locator('.debt-loan-item')).toHaveCount(1);
    await expect(page.locator('.debt-sim-item')).toHaveCount(0);
    await expect(page.locator('#debt-loans-empty')).toHaveCount(0);

    // Delete the loan from its results ⋯ menu
    await page.click('.debt-loan-item');
    await page.waitForSelector('#btn-dres-menu');
    await page.click('#btn-dres-menu');
    await page.click('.dres-menu-opt[data-act="delete"]');
    await page.click('#modal-delete-btn');
    await page.waitForSelector('#debt-hub');
    await expect(page.locator('.debt-loan-item')).toHaveCount(0);
    await expect(page.locator('#debt-loans-empty')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('rejects invalid input and supports editing a saved simulation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err));

    await bootstrap(page);
    await goToHub(page);

    // Empty form → typed engine error, still on the form
    await page.click('.debt-type-tile[data-type="personal"]');
    await page.waitForSelector('#debt-sim-form');
    await page.click('#btn-dsim-calculate');
    await expect(page.locator('#dsim-error')).toBeVisible();
    await expect(page.locator('#debt-sim-form')).toBeVisible();

    // Valid personal loan → results → save
    await page.fill('#dsim-principal', '5000');
    await page.fill('#dsim-duration', '24');
    await page.selectOption('#dsim-duration-unit', 'months');
    await page.fill('#dsim-rate', '4.5');
    await page.fill('#dsim-first-date', '2026-10-01');
    await page.click('#btn-dsim-calculate');
    await page.waitForSelector('#debt-results-view');
    await expect(page.locator('#debt-results-view')).toContainText('$218.24');
    await page.click('#btn-dres-save');
    await page.waitForSelector('#loan-name-input');
    await page.fill('#loan-name-input', 'Prestito Auto');
    await page.click('#modal-save-btn');
    await expectModalClosed(page);
    await page.waitForSelector('#debt-hub');

    // Edit it: bump the principal, update, and check the refreshed figures
    await page.click('.debt-sim-item');
    await page.waitForSelector('#btn-dres-menu');
    await page.click('#btn-dres-menu');
    await page.click('.dres-menu-opt[data-act="edit"]');
    await page.waitForSelector('#debt-sim-form');
    await expect(page.locator('#dsim-principal')).toHaveValue('5000');
    await page.fill('#dsim-principal', '10000');
    await page.click('#btn-dsim-calculate');
    await page.waitForSelector('#debt-results-view');
    await expect(page.locator('#debt-results-view')).toContainText('$436.48');
    await page.click('#btn-dres-save'); // "Update Simulation"
    await page.waitForSelector('#loan-name-input');
    await page.click('#modal-save-btn'); // keep the prefilled name
    await expectModalClosed(page);
    await page.waitForSelector('#debt-hub');
    await expect(page.locator('.debt-sim-item')).toHaveCount(1);
    await expect(page.locator('.debt-sim-item')).toContainText('Prestito Auto');
    await expect(page.locator('.debt-sim-item')).toContainText('$436.48');

    expect(errors).toEqual([]);
  });
});
