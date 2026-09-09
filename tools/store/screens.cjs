// Store screenshots for Google Play and the App Store (v1.15, launch-plan A-05).
//
//   npm run dev                 # this repo, serving :3000
//   node tools/store/screens.cjs
//   node tools/store/screens.cjs --lang en --platform apple    # a subset
//
// Output: tools/store/out/<platform>/<lang>/NN-name.png, numbered in the
// order they should be uploaded. The folder is gitignored — these are build
// artefacts, and the store consoles are where they live.
//
// Sizes (verified against the official specs on 2026-09-09):
//   apple  1290x2796  iPhone 6.9" portrait. Apple also accepts 1260x2736 and
//                     1320x2868; 1290x2796 is 430x932 @3x, a real device
//                     logical size, so nothing is scaled. 6.9" is the only
//                     REQUIRED iPhone size — if 6.5" is missing Apple scales
//                     these down, so it is deliberately not generated. To add
//                     it, put {w:428,h:926,scale:3} in TARGETS as 6.5".
//                     https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/
//   play   1080x1920  9:16. Play requires the longest side to be at most
//                     twice the shortest, which 1290x2796 (2.17) fails — so
//                     Play genuinely needs its own size, it cannot reuse
//                     Apple's. https://support.google.com/googleplay/android-developer/answer/9866151
//
// Both stores refuse an alpha channel ("Images can't include alpha channels
// or transparencies"), and a Playwright PNG carries one even when every pixel
// is opaque — hence the flatten pass at the end.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const SEED = require('../seed.cjs');

const BASE = process.env.STACKD_URL || 'http://localhost:3000';
const OUT_ROOT = path.resolve(__dirname, 'out');

// The app ships in five languages and each store listing is localized, so a
// reviewer comparing the listing with the binary sees the same words.
const LANGS = ['en', 'fr', 'it', 'es', 'pt'];

const TARGETS = {
  apple: { w: 430, h: 932, scale: 3 },  // -> 1290 x 2796
  play: { w: 360, h: 640, scale: 3 }    // -> 1080 x 1920
};

// Dark, to match the marketing site's hero and the link-preview image: the
// store page and stackdplatform.com should look like one product. Set
// STACKD_SHOT_THEME=light to switch.
const THEME = process.env.STACKD_SHOT_THEME === 'light' ? 'light' : 'dark';
const BG = THEME === 'dark' ? '#0b0f19' : '#f4f7f9';

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

// Deliberately NOT the purchases screen. Apple 2.3.2 asks the DESCRIPTION to
// make clear what needs buying (docs/store-listing.md §1 does), and a
// screenshot with a hard-coded price goes stale in every other storefront.
// Bank Connect is absent from this build (A-04), so nothing here shows it.
const SCREENS = [
  { name: 'home', hash: '#dashboard' },
  { name: 'history', hash: '#transactions', settle: 1200 },
  { name: 'goals', hash: '#budget' },
  { name: 'analytics', hash: '#analytics' },
  { name: 'debt', hash: '#debt-sim', drive: 'debt' }
];

(async () => {
  const langs = arg('lang') ? [arg('lang')] : LANGS;
  const platforms = arg('platform') ? [arg('platform')] : Object.keys(TARGETS);
  const sharp = require('sharp');
  const browser = await chromium.launch();
  const written = [];

  for (const platform of platforms) {
    const t = TARGETS[platform];
    const ctx = await browser.newContext({
      viewport: { width: t.w, height: t.h },
      deviceScaleFactor: t.scale,
      colorScheme: THEME,
      // Store screenshots must not carry a caret or a focus ring.
      reducedMotion: 'reduce'
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.error('  pageerror:', e.message));

    await page.goto(BASE + '/');
    await page.evaluate((theme) => {
      localStorage.clear();
      localStorage.setItem('stackd_v1_setup_done', '1');
      localStorage.setItem('stackd_v1_currency', JSON.stringify('EUR'));
      localStorage.setItem('stackd_v1_theme', JSON.stringify(theme));
    }, THEME);
    await page.reload();
    await page.waitForSelector('#bottom-nav');
    await page.waitForFunction(() => !!window.Store && !!window.Widgets);
    // Chart.js animates on every mount, and a screenshot taken mid-animation
    // catches the line part-way to its final position — which reads as a
    // clipped or broken chart. Turn animation off so a capture is the settled
    // frame, deterministically, rather than a race against a timer.
    await page.evaluate(() => {
      if (window.Chart && window.Chart.defaults) {
        window.Chart.defaults.animation = false;
        window.Chart.defaults.animations = {};
        if (window.Chart.defaults.transitions) window.Chart.defaults.transitions.active = { animation: { duration: 0 } };
      }
    });
    console.log(platform, 'seed', await page.evaluate(SEED));
    await page.waitForTimeout(800);

    for (const lang of langs) {
      const dir = path.join(OUT_ROOT, platform, lang);
      fs.mkdirSync(dir, { recursive: true });
      await page.evaluate(l => window.Store.dispatch('SET_LANGUAGE', l), lang);
      await page.waitForTimeout(600);

      for (let i = 0; i < SCREENS.length; i++) {
        const s = SCREENS[i];
        await page.evaluate(h => window.Router.navigate(h), s.hash);
        await page.waitForTimeout(900);

        if (s.drive === 'debt') {
          // The simulator is empty until it has run, and an empty form makes
          // a poor screenshot — drive it to the schedule.
          await page.fill('#dsim-principal', '18000');
          await page.fill('#dsim-duration', '5');
          await page.fill('#dsim-rate', '4.05');
          await page.click('#btn-dsim-calculate');
          await page.waitForFunction(() => window.Store.getState().activeView === 'debt-results');
        }
        if (s.settle) {
          // History restores its scroll position; start at the top.
          await page.waitForTimeout(s.settle);
          await page.evaluate(() => {
            document.scrollingElement.scrollTop = 0;
            document.querySelectorAll('*').forEach(el => {
              if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = 0;
            });
          });
        }
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        await page.waitForTimeout(1200); // charts animate in

        const file = path.join(dir, `${String(i + 1).padStart(2, '0')}-${s.name}.png`);
        const buf = await page.screenshot();
        // flatten() drops the alpha channel both stores refuse.
        await sharp(buf).flatten({ background: BG }).png({ compressionLevel: 9 }).toFile(file);
        written.push(file);
      }
      console.log(' ', platform, lang, 'ok');
    }
    await ctx.close();
  }
  await browser.close();

  const meta = await require('sharp')(written[0]).metadata();
  console.log(`\n${written.length} files -> ${OUT_ROOT}`);
  console.log(`first image ${meta.width}x${meta.height}, alpha: ${meta.hasAlpha}`);
})().catch(e => { console.error(e); process.exit(1); });
