import { test, expect } from '@playwright/test';

// 1.2.2 (HG-8, docs/category-rings-plan.md): the Goals ring on a real canvas.
// 7 budgeted categories with spending fold into 5 slices + Others; a tap on
// a slice thickens it, the centre shows the slice, a badge shows its icon and
// then its share of spending; a second tap clears. Keyboard: Tab to a slice
// button, Enter toggles, Escape clears. Reduced motion: one pill at once.
test.describe('Goals ring: tap to focus', () => {
  const SEVEN = [['cat_rent', 617.84, 600], ['cat_groceries', 210, 300], ['cat_dining', 96, 150], ['cat_transport', 64, 100],
    ['cat_utilities', 48, 80], ['cat_health', 30, 60], ['cat_shopping', 22, 80]];
  const bootstrap = async (page, { reducedMotion, rows = SEVEN, fontSize = '' } = {}) => {
    // the suite emulates reduced motion by default (playwright.config): the
    // animated path needs it off
    await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
    await page.clock.install({ time: new Date(2026, 10, 15, 12, 0, 0) });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_homeWidgets', '[]');
    });
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Components && !!window.Components.CategoryRing);
    await page.waitForSelector('#splash-screen', { state: 'detached' });
    await page.evaluate(({ seed, size }) => {
      const S = window.Store;
      S.dispatch('SET_CURRENCY', 'EUR');
      S.batch(() => {
        S.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 9000, openingDate: '2020-01-01' });
        const acc = S.getState().accounts[0].id;
        seed.forEach(([c, a, b]) => {
          S.dispatch('SAVE_BUDGET', { categoryId: c, amount: b, startDate: '', endDate: null, isCumulative: false });
          S.dispatch('ADD_TRANSACTION', { type: 'expense', amount: a, accountId: acc, categoryId: c, date: '2026-11-05' });
        });
      });
      if (size) document.documentElement.style.fontSize = size;
      location.hash = '#budget';
    }, { seed: rows, size: fontSize });
    await page.waitForSelector('#budget-ring-box .ring-arc-btn');
    // with motion on, the view slides in and the ring sweeps (250 ms + 700 ms):
    // wait until the box stops moving before aiming at a slice
    let last = null;
    for (let i = 0; i < 40; i++) {
      const b = await page.locator('#budget-ring-box').boundingBox();
      if (last && Math.abs(b.x - last.x) < 0.5 && Math.abs(b.y - last.y) < 0.5) break;
      last = b;
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(reducedMotion ? 0 : 1000);
  };

  // Tap a slice where it is drawn: the middle of its painted arc.
  const tapSlice = async (page, id) => {
    const pt = await page.evaluate((arcId) => {
      const V = window.Views.BudgetView;
      const ring = V._passTotals.ring;
      const i = V._passTotals.slices.findIndex(s => s.id === arcId);
      return window.Components.CategoryRing.point(ring.geo, ring.geo.arcs[i].mid, 68);
    }, id);
    const box = await page.locator('#budget-ring-box').boundingBox();
    await page.mouse.click(box.x + pt.x, box.y + pt.y);
  };

  test('5 slices + Others; a tap shows the slice, then its share; a second tap goes back', async ({ page }) => {
    await bootstrap(page);
    await expect(page.locator('.ring-arc-btn')).toHaveCount(6);
    await expect(page.locator('.ring-arc-btn').last()).toHaveAttribute('aria-label', /^Others \(2: Health, Shopping\)/);
    await page.evaluate(() => { window.__c = window.Views.BudgetView._budgetChart; window.__cv = document.getElementById('budgetChart'); });
    await tapSlice(page, 'cat_groceries');
    const box = page.locator('#budget-ring-box');
    await expect(box).toHaveClass(/is-focused/);
    await expect(page.locator('.ring-focus-name')).toHaveText('Groceries');
    await expect(page.locator('.ring-focus-caption')).toHaveText('of €1,087.84 spent');
    const badge = page.locator('.ring-badge[data-arc-id="cat_groceries"]');
    await expect(badge).toHaveClass(/is-on/);
    await expect(badge).toHaveClass(/is-pct/, { timeout: 3000 });
    await expect(badge.locator('.ring-badge-pct')).toHaveText('19.3%');
    await expect(page.locator('#sr-announcer')).toHaveText('Groceries: €210.00, 19.3% of spending');
    // the tap rebuilt nothing: the same Chart instance on the same canvas
    expect(await page.evaluate(() => window.Views.BudgetView._budgetChart === window.__c && document.getElementById('budgetChart') === window.__cv)).toBe(true);
    // the focus plugin, inside a real Chart.js 4.4.2 draw: the focused arc at
    // 88 / 50.12, every other arc (the track too) at 80 / 58.12, and the
    // elements back at the resting 82 / 54.12 once the dataset is drawn
    const radii = await page.evaluate(() => {
      const ch = window.Views.BudgetView._budgetChart;
      const list = ch.config.plugins || (ch.config._config && ch.config._config.plugins) || [];
      const p = list.find(x => x.id === 'stackdRingFocus');
      const r2 = (v) => Math.round(v * 100) / 100;
      let seen = null;
      const orig = p.afterDatasetDraw;
      p.afterDatasetDraw = (chart, args) => { seen = args.meta.data.map(e => [r2(e.outerRadius), r2(e.innerRadius)]); return orig(chart, args); };
      ch.draw();
      p.afterDatasetDraw = orig;
      return { seen, after: ch.getDatasetMeta(0).data.map(e => [r2(e.outerRadius), r2(e.innerRadius)]) };
    });
    expect(radii.seen[1]).toEqual([88, 50.12]);
    radii.seen.forEach((r, i) => { if (i !== 1) expect(r).toEqual([80, 58.12]); });
    radii.after.forEach(r => expect(r).toEqual([82, 54.12]));
    await tapSlice(page, 'cat_groceries');
    await expect(box).not.toHaveClass(/is-focused/);
    await expect(page.locator('.donut-chart-center .donut-total-label')).toHaveText('Allocated');
  });

  test('a tap on another slice moves the focus; the hole clears it', async ({ page }) => {
    await bootstrap(page);
    await tapSlice(page, 'cat_rent');
    await tapSlice(page, '__others__');
    await expect(page.locator('.ring-focus-name')).toHaveText('Others (2)');
    await expect(page.locator('.ring-arc-btn[data-arc-id="cat_rent"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.ring-arc-btn[data-arc-id="__others__"]')).toHaveAttribute('aria-pressed', 'true');
    const box = await page.locator('#budget-ring-box').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#budget-ring-box')).not.toHaveClass(/is-focused/);
  });

  test('keyboard: Tab reaches the slices, Enter toggles, Escape clears', async ({ page }) => {
    await bootstrap(page);
    const first = page.locator('.ring-arc-btn').first();
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ring-focus-name')).toHaveText('Rent');
    await page.keyboard.press('Tab');
    await expect(page.locator('.ring-arc-btn').nth(1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ring-arc-btn').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#budget-ring-box')).not.toHaveClass(/is-focused/);
    await expect(page.locator('.ring-arc-btn').nth(1)).toBeFocused();
  });

  test('every drawn slice answers for itself, even a 0.6 % slice; next to the track its halo answers too', async ({ page }) => {
    // allocated 1,800: Utilities is 10 of it (2°), Transport (8°) sits between two slices
    await bootstrap(page, { rows: [['cat_rent', 600, 1000], ['cat_groceries', 250, 400], ['cat_dining', 100, 200], ['cat_transport', 40, 100], ['cat_utilities', 10, 100]] });
    for (const id of ['cat_rent', 'cat_groceries', 'cat_dining', 'cat_transport', 'cat_utilities']) {
      await tapSlice(page, id);
      await expect(page.locator(`.ring-arc-btn[data-arc-id="${id}"]`), id).toHaveAttribute('aria-pressed', 'true');
      await tapSlice(page, id);
      await expect(page.locator('#budget-ring-box')).not.toHaveClass(/is-focused/);
    }
    // 8° past Utilities' drawn end, on the remaining-budget track: still Utilities
    const pt = await page.evaluate(() => {
      const ring = window.Views.BudgetView._passTotals.ring;
      return window.Components.CategoryRing.point(ring.geo, ring.geo.arcs[4].end + (8 * Math.PI) / 180, 68);
    });
    const box = await page.locator('#budget-ring-box').boundingBox();
    await page.mouse.click(box.x + pt.x, box.y + pt.y);
    await expect(page.locator('.ring-arc-btn[data-arc-id="cat_utilities"]')).toHaveAttribute('aria-pressed', 'true');
    // every slice button is a 24 × 24 target on its own drawn arc
    const rects = await page.locator('.ring-arc-btn').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
    rects.forEach(r => { expect(r.width).toBeGreaterThanOrEqual(24); expect(r.height).toBeGreaterThanOrEqual(24); });
  });

  test('200 % text: the readout moves under the ring with the share; nothing scrolls sideways', async ({ page }) => {
    await bootstrap(page, { fontSize: '200%' });
    await tapSlice(page, 'cat_groceries');
    const below = page.locator('.ring-focus-readout--below');
    await expect(below).toBeVisible();
    await expect(below.locator('.ring-focus-name')).toHaveText('Groceries');
    await expect(below.locator('.ring-focus-caption')).toHaveText('19.3% of €1,087.84 spent');
    await expect(page.locator('.ring-badge[data-arc-id="cat_groceries"]')).toBeHidden();
    await expect(page.locator('.donut-chart-center')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });

  test('reduced motion: the icon and the share appear together at once', async ({ page }) => {
    await bootstrap(page, { reducedMotion: true });
    await tapSlice(page, 'cat_rent');
    const badge = page.locator('.ring-badge[data-arc-id="cat_rent"]');
    await expect(badge).toHaveClass(/is-both/);
    await expect(badge.locator('.ring-badge-pct')).toHaveText('56.8%');
  });

  test('a re-render keeps the focus in its final state; switching to Income drops it', async ({ page }) => {
    await bootstrap(page);
    await tapSlice(page, 'cat_dining');
    await page.evaluate(() => window.Store.emit());
    await expect(page.locator('#budget-ring-box')).toHaveClass(/is-focused/);
    await expect(page.locator('.ring-badge[data-arc-id="cat_dining"]')).toHaveClass(/is-static/);
    await page.locator('#bdg-toggle-income').click();
    await expect(page.locator('#budget-ring-box')).not.toHaveClass(/is-focused/);
  });
});
