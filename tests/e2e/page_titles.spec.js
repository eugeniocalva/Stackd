import { test, expect } from '@playwright/test';

// 1.2.2 (HG-3): every top-level page opens its title on one line — 32 px
// (var(--space-8)) below the view area, where Home's "Total balance" starts.
// Budget and Analytics used to sit 24 px higher (sticky bar padding only),
// History drifted with its indicator lines, Loans had a back link above it.
test.use({ viewport: { width: 412, height: 860 } });

const PAGES = [
  ['#dashboard', '.dash-head .section-title'],
  ['#transactions', '#history-sticky-header .page-header-title'],
  ['#budget', '.history-header-sticky .page-header-title'],
  ['#analytics', '.history-header-sticky .page-header-title'],
  ['#insights', '#insights-page h1'], // 1.2.2 (HG-7)
  ['#settings', '#router-view h1.header-title'],
  ['#debt', '#debt-hub h1'],
  ['#add', '#router-view h1.header-title']
];

test('page titles share one top line, and Loans has no back link', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('stackd_v1_setup_done', '1');
    localStorage.setItem('stackd_v1_homeWidgets', '[]');
  });
  await page.reload();
  await page.waitForSelector('#bottom-nav');
  await page.evaluate(() => window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' }));

  const tops = {};
  for (const [hash, sel] of PAGES) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForFunction((s) => {
      const views = document.querySelectorAll('#router-view > *');
      return !!document.querySelector(s) && views.length === 1;
    }, sel);
    await page.waitForTimeout(400); // the view transition settles
    tops[hash] = await page.evaluate((s) => {
      const view = document.getElementById('router-view').getBoundingClientRect().top;
      return Math.round(document.querySelector(s).getBoundingClientRect().top - view);
    }, sel);
  }
  for (const [hash] of PAGES) {
    // New Log centres its title on the 32 px close button: allow 2 px
    expect(Math.abs(tops[hash] - 32), `${hash} title top = ${tops[hash]}`).toBeLessThanOrEqual(2);
  }

  // 1.2.2 (HG-10 follow-up): History, Budget and Analytics share one period
  // bar, 24 px under the title, at the same height on each page
  const bars = {};
  for (const hash of ['#transactions', '#budget', '#analytics']) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForFunction(() => !!document.querySelector('#router-view .period-row') && document.querySelectorAll('#router-view > *').length === 1);
    await page.waitForTimeout(400);
    bars[hash] = await page.evaluate(() => {
      const view = document.getElementById('router-view');
      view.scrollTop = 0;
      const top = view.getBoundingClientRect().top;
      const t = document.querySelector('.history-header-sticky .page-header-title');
      const cs = getComputedStyle(t);
      const title = t.getBoundingClientRect();
      const pad = parseFloat(cs.paddingBottom);
      const bar = document.querySelector('.period-bar').getBoundingClientRect();
      const arrows = [...document.querySelectorAll('.period-row > .period-arrow')].map(a => Math.round(a.getBoundingClientRect().width));
      // the gap counts from the text line, not the clip room under it
      return { gap: Math.round(bar.top - (title.bottom - pad)), bar: Math.round(bar.top - top), arrows, clipRoom: pad / parseFloat(cs.fontSize), overflow: cs.overflow };
    });
  }
  for (const [hash, m] of Object.entries(bars)) {
    expect(Math.abs(m.gap - 24), `${hash} title → period bar = ${m.gap}`).toBeLessThanOrEqual(1);
    // a clipped title (ellipsis) keeps room for g / y / ç under the baseline
    if (m.overflow === 'hidden') expect(m.clipRoom, `${hash} descender room`).toBeGreaterThanOrEqual(0.2);
    expect(Math.abs(m.bar - bars['#transactions'].bar), `${hash} bar top`).toBeLessThanOrEqual(1);
    expect(m.arrows, hash).toEqual([44, 44]);
  }

  await page.evaluate(() => { location.hash = '#debt'; });
  await page.waitForSelector('#debt-hub');
  await expect(page.locator('#debt-hub a[href="#dashboard"]')).toHaveCount(0);
});
