import { test, expect } from '@playwright/test';

// 1.2.2 (HG-8, docs/category-rings-plan.md): the Goals ring on a real canvas.
// 7 budgeted categories with spending fold into 5 slices + Others; a tap on
// a slice thickens it, the centre shows the slice, a badge shows its icon and
// then the icon beside its share of spending; a second tap clears. Keyboard:
// Tab to a slice button, Enter toggles, Escape clears. Reduced motion: the
// same pill at once.
test.describe('Goals ring: tap to focus', () => {
  const SEVEN = [['cat_rent', 617.84, 600], ['cat_groceries', 210, 300], ['cat_dining', 96, 150], ['cat_transport', 64, 100],
    ['cat_utilities', 48, 80], ['cat_health', 30, 60], ['cat_shopping', 22, 80]];
  const bootstrap = async (page, { reducedMotion, rows = SEVEN, fontSize = '', lang = '' } = {}) => {
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
    await page.evaluate(({ seed, size, lang }) => {
      const S = window.Store;
      S.dispatch('SET_CURRENCY', 'EUR');
      if (lang) S.dispatch('SET_LANGUAGE', lang);
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
    }, { seed: rows, size: fontSize, lang });
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

  // The badge's end state on every path (the morph, a re-render, reduced
  // motion): the icon is visible, the share sits to its right, the pill
  // holds both, stays off the centre readout and inside its card. (A phone showed a share-only pill after the
  // morph and icon + share elsewhere.)
  const expectIconAndShare = async (badge) => {
    await expect.poll(() => badge.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const icon = b.querySelector('.ring-badge-icon');
      const pct = b.querySelector('.ring-badge-pct');
      const glyph = icon.querySelector('svg') || icon;
      const ir = glyph.getBoundingClientRect();
      const pr = pct.getBoundingClientRect();
      const op = (el) => parseFloat(getComputedStyle(el).opacity);
      // and clear of the centre readout's text (name, amount, caption)
      const box = b.closest('.ring-box');
      const clear = [...box.querySelectorAll('.ring-focus-readout div')].every((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return [...range.getClientRects()].every(t => t.right <= r.left || t.left >= r.right || t.bottom <= r.top || t.top >= r.bottom);
      });
      // and not clipped by the card (the nearest box that clips)
      let el = b.parentElement;
      while (el && el !== document.body && getComputedStyle(el).overflowX === 'visible') el = el.parentElement;
      const c = el && el !== document.body ? el.getBoundingClientRect() : { left: 0, right: innerWidth };
      const inside = r.left >= c.left - 0.5 && r.right <= c.right + 0.5;
      return op(b) === 1 && op(icon) === 1 && op(pct) === 1 && ir.width >= 14 && pr.width > 0
        && ir.left >= r.left - 0.5 && ir.right <= pr.left + 0.5 && pr.right <= r.right + 0.5 && clear && inside;
    }), { timeout: 3000 }).toBe(true);
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
    await expectIconAndShare(badge);
    // review C1: the icon and fill colours are not transitioned into the
    // pill — crossing, they left a blank light-theme pill for ~50 ms
    await expect(badge).toHaveCSS('transition-property', 'opacity, transform, width');
    // review C2 / re-verify: a pill that loses the focus fades out where it is
    // — the icon and the share keep their places on screen while it fades
    const leave = await badge.evaluate(async (b) => {
      const at = () => [b.querySelector('.ring-badge-icon'), b.querySelector('.ring-badge-pct')].map(e => e.getBoundingClientRect().left);
      const before = at();
      document.querySelector('#budget-ring-box .ring-arc-btn[data-arc-id="cat_rent"]').click(); // focus moves to Rent
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = at();
      return { moved: Math.max(...after.map((x, i) => Math.abs(x - before[i]))), leaving: b.classList.contains('is-leaving') };
    });
    expect(leave.leaving).toBe(true);
    expect(leave.moved).toBeLessThan(0.5);
    await expect(badge).toHaveCSS('opacity', '0');
    await page.locator('#budget-ring-box .ring-arc-btn[data-arc-id="cat_groceries"]').evaluate(e => e.click()); // and back
    await expect(badge).toHaveClass(/is-pct/, { timeout: 3000 });
    await expectIconAndShare(badge);
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

  // 1.2.2 (HG-8 P2): the Analytics donut, same controller on a 220 px ring
  test('Analytics: 5 slices + Others, a tap shows the slice and its share; the plugin scales with the ring', async ({ page }) => {
    await bootstrap(page);
    await page.evaluate(() => { location.hash = '#analytics'; });
    await page.waitForSelector('#analytics-ring-box .ring-arc-btn');
    await page.waitForTimeout(1300); // the entry slide and sweep
    await expect(page.locator('#analytics-ring-box .ring-arc-btn')).toHaveCount(6);
    await page.locator('#analytics-ring-box').scrollIntoViewIfNeeded(); // the ring sits below the fold
    await page.waitForTimeout(300);
    const pt = await page.evaluate(() => {
      const pass = window.Components.CategoryDonutChart._ringPass;
      const i = pass.slices.findIndex(s => s.id === 'cat_groceries');
      return window.Components.CategoryRing.point(pass.ring.geo, pass.ring.geo.arcs[i].mid, (pass.ring.geo.outer + pass.ring.geo.inner) / 2);
    });
    const box = await page.locator('#analytics-ring-box').boundingBox();
    expect(Math.round(box.width)).toBe(220);
    await page.mouse.click(box.x + pt.x, box.y + pt.y);
    const ring = page.locator('#analytics-ring-box');
    await expect(ring).toHaveClass(/is-focused/);
    await expect(ring.locator('.ring-focus-name')).toHaveText('Groceries');
    await expect(ring.locator('.ring-focus-caption')).toHaveText('of €1,087.84 spent');
    await expect(ring.locator('.ring-badge[data-arc-id="cat_groceries"]')).toHaveClass(/is-pct/, { timeout: 3000 });
    await expect(ring.locator('.ring-badge[data-arc-id="cat_groceries"] .ring-badge-pct')).toHaveText('19.3%');
    await expectIconAndShare(ring.locator('.ring-badge[data-arc-id="cat_groceries"]'));
    const radii = await page.evaluate(() => {
      const ch = window.Components.CategoryDonutChart._chartInstance;
      const list = ch.config.plugins || (ch.config._config && ch.config._config.plugins) || [];
      const p = list.find(x => x.id === 'stackdRingFocus');
      const r1 = (v) => Math.round(v * 10) / 10;
      let seen = null;
      const orig = p.afterDatasetDraw;
      p.afterDatasetDraw = (chart, args) => { seen = args.meta.data.map(e => [r1(e.outerRadius), r1(e.innerRadius)]); return orig(chart, args); };
      ch.draw();
      p.afterDatasetDraw = orig;
      return { seen, after: ch.getDatasetMeta(0).data.map(e => [r1(e.outerRadius), r1(e.innerRadius)]) };
    });
    // resting 102 / 67.3; ×(102 / 82): focused +7.5 / -5, the others -2.5 / +5
    expect(radii.after[0]).toEqual([102, 67.3]);
    expect(radii.seen[1]).toEqual([109.5, 62.3]);
    expect(radii.seen[0]).toEqual([99.5, 72.3]);
    // the legend is untouched by the focus
    await expect(page.locator('.donut-legend-item')).toHaveCount(6);
    // a re-render restores the pill, fitted, with the icon and the share
    await page.evaluate(() => window.Store.emit());
    await expect(ring.locator('.ring-badge[data-arc-id="cat_groceries"]')).toHaveClass(/is-static/);
    await expectIconAndShare(ring.locator('.ring-badge[data-arc-id="cat_groceries"]'));
  });

  test('a rotation or resize refits a focused pill to its card', async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 800 });
    await bootstrap(page, { reducedMotion: true, lang: 'fr', fontSize: '18.4px' });
    await page.evaluate(() => { location.hash = '#analytics'; });
    await page.waitForSelector('#analytics-ring-box .ring-arc-btn');
    await page.locator('#analytics-ring-box .ring-arc-btn[data-arc-id="cat_rent"]').evaluate(e => e.click());
    const badge = page.locator('#analytics-ring-box .ring-badge[data-arc-id="cat_rent"]');
    await expectIconAndShare(badge);
    await page.setViewportSize({ width: 320, height: 720 });
    await expectIconAndShare(badge);
  });

  test('reduced motion: the icon and the share appear together at once', async ({ page }) => {
    await bootstrap(page, { reducedMotion: true });
    await tapSlice(page, 'cat_rent');
    const badge = page.locator('.ring-badge[data-arc-id="cat_rent"]');
    await expect(badge).toHaveClass(/is-both/);
    await expect(badge.locator('.ring-badge-pct')).toHaveText('56.8%');
    await expectIconAndShare(badge);
  });

  // A device check: slices on the right of the ring showed a share-only pill
  // (an auto-width absolute pill shrank against the box edge and squeezed the
  // icon to 0 px), slices on the left showed icon + share. On the narrowest
  // phone (320 px) and in French ("56,8 %", the widest share).
  // Also at Android's 115 % text (18.4 px root): the room beside the ring
  // shrinks with the text, so each pill is fitted to its card (review C5).
  for (const { reducedMotion, fontSize } of [{ reducedMotion: false }, { reducedMotion: true }, { reducedMotion: false, fontSize: '18.4px' }]) {
    test(`every slice, Goals and Analytics, ends with its icon beside its share (${reducedMotion ? 'reduced motion' : 'motion on'}${fontSize ? `, root ${fontSize}` : ''})`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await bootstrap(page, { reducedMotion, lang: 'fr', fontSize });
      const ids = await page.evaluate(() => window.Views.BudgetView._passTotals.slices.map(sl => sl.id));
      expect(ids).toHaveLength(6);
      for (const id of ids) {
        await tapSlice(page, id);
        const badge = page.locator(`#budget-ring-box .ring-badge[data-arc-id="${id}"]`);
        await expect(badge).toHaveClass(reducedMotion ? /is-both/ : /is-pct/, { timeout: 3000 });
        await expectIconAndShare(badge);
      }
      // the restore after a re-render, on a slice on the right of the ring
      await tapSlice(page, ids[0]);
      await page.evaluate(() => window.Store.emit());
      await expect(page.locator(`#budget-ring-box .ring-badge[data-arc-id="${ids[0]}"]`)).toHaveClass(reducedMotion ? /is-both/ : /is-static/);
      await expectIconAndShare(page.locator(`#budget-ring-box .ring-badge[data-arc-id="${ids[0]}"]`));

      await page.evaluate(() => { location.hash = '#analytics'; });
      await page.waitForSelector('#analytics-ring-box .ring-arc-btn');
      await page.waitForTimeout(reducedMotion ? 100 : 1300);
      await page.locator('#analytics-ring-box').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const aIds = await page.evaluate(() => window.Components.CategoryDonutChart._ringPass.slices.map(sl => sl.id));
      expect(aIds).toHaveLength(6);
      for (const id of aIds) {
        const pt = await page.evaluate((arcId) => {
          const pass = window.Components.CategoryDonutChart._ringPass;
          const i = pass.slices.findIndex(sl => sl.id === arcId);
          return window.Components.CategoryRing.point(pass.ring.geo, pass.ring.geo.arcs[i].mid, (pass.ring.geo.outer + pass.ring.geo.inner) / 2);
        }, id);
        const box = await page.locator('#analytics-ring-box').boundingBox();
        await page.mouse.click(box.x + pt.x, box.y + pt.y);
        const badge = page.locator(`#analytics-ring-box .ring-badge[data-arc-id="${id}"]`);
        await expect(badge).toHaveClass(reducedMotion ? /is-both/ : /is-pct/, { timeout: 3000 });
        await expectIconAndShare(badge);
      }
    });
  }

  test('Android 130 % text (20.8 px root): the readout moves under the ring and the badges hide', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await bootstrap(page, { reducedMotion: true, lang: 'fr', fontSize: '20.8px' });
    await expect(page.locator('#budget-ring-box')).toHaveClass(/ring--big-text/);
    await tapSlice(page, 'cat_groceries');
    await expect(page.locator('.ring-focus-readout--below')).toBeVisible();
    await expect(page.locator('.ring-badge[data-arc-id="cat_groceries"]')).toBeHidden();
  });

  test('a re-render keeps the focus in its final state; switching to Income drops it', async ({ page }) => {
    await bootstrap(page);
    await tapSlice(page, 'cat_dining');
    await page.evaluate(() => window.Store.emit());
    await expect(page.locator('#budget-ring-box')).toHaveClass(/is-focused/);
    await expect(page.locator('.ring-badge[data-arc-id="cat_dining"]')).toHaveClass(/is-static/);
    await expectIconAndShare(page.locator('.ring-badge[data-arc-id="cat_dining"]'));
    await page.locator('#bdg-toggle-income').click();
    await expect(page.locator('#budget-ring-box')).not.toHaveClass(/is-focused/);
  });
});
