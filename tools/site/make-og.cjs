// Renders the marketing site's Open Graph image (1200x630) from og.html.
//
// Lives in the app repo because it needs this repo's playwright + sharp, and
// because Cloudflare Pages publishes every file in the site repo — a build
// tool committed there would be served as a stray page.
//
//   node tools/site/make-og.cjs
//
// Writes ../StackdSite/img/og.png. Re-run after a headline change or a new
// hero screenshot (tools/site/screens.cjs regenerates those).
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const sharp = require('sharp');

const SITE = path.resolve(__dirname, '../../../StackdSite');
const SRC = 'file:///' + path.join(__dirname, 'og.html').replace(/\\/g, '/');
const TMP = path.join(require('os').tmpdir(), 'stackd-og-2x.png');
const OUT = path.join(SITE, 'img', 'og.png');

(async () => {
  if (!fs.existsSync(SITE)) throw new Error(`site repo not found at ${SITE}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  await page.goto(SRC);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.screenshot({ path: TMP, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();

  // Rendered at 2x and downsampled so the type stays crisp at the final size.
  await sharp(TMP).resize(1200, 630).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(OUT);
  fs.unlinkSync(TMP);

  const meta = await sharp(OUT).metadata();
  console.log(`${path.relative(process.cwd(), OUT)}  ${meta.width}x${meta.height}  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
})().catch(e => { console.error(e); process.exit(1); });
