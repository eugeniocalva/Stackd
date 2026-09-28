// Google Play listing graphics that the screenshot tool does not make
// (launch-plan O-15):
//
//   node tools/store/play-graphics.cjs
//
// Output (gitignored, like every store image):
//   tools/store/out/play/icon-512.png          512x512, the hi-res app icon
//   tools/store/out/play/feature-graphic.png   1024x500, no alpha
//
// Icon: a straight downscale of assets/icon.png — the same full-bleed white
// tile with the black mark that ships as the launcher icon, so the listing and
// the home screen show the same thing. Play applies its own corner mask.
//
// Feature graphic: dark ground, the mark in white, and the store NAME only.
// No tagline on purpose: one image then serves all five listing languages,
// and there is nothing to translate or let drift from the listing copy. The
// ground is the same #0b0f19 as the dark screenshots and the website hero,
// so the store page reads as one product. Flat colour, no gradient or glow.
// Play may overlay a play button on the centre if a video is ever added, so
// the content sits in a band that survives that.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out', 'play');
const BG = '#0b0f19';
const NAME = "Stack'd Finance";

// The mark from tools/assets.cjs, recoloured for a dark ground: white layers
// separated by the ground colour, as the black mark is separated by white.
const markSvg = `
<svg viewBox="0 0 130 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <polygon points="10,70 45,52 80,70 45,88" fill="#ffffff"/>
  <polygon points="10,50 45,32 80,50 45,68" fill="#ffffff" stroke="${BG}" stroke-width="5" stroke-linejoin="miter"/>
  <polygon points="10,30 45,12 80,30 45,48" fill="#ffffff" stroke="${BG}" stroke-width="5" stroke-linejoin="miter"/>
  <rect x="94" y="40" width="12" height="48" fill="#ffffff"/>
  <polygon points="80,40 100,10 120,40" fill="#ffffff"/>
</svg>`;

const fontFace = (file) => {
  const b64 = fs.readFileSync(path.join(ROOT, 'src', 'fonts', file)).toString('base64');
  return `url(data:font/woff2;base64,${b64}) format('woff2')`;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // ── 512 icon ──────────────────────────────────────────────────────────────
  const iconOut = path.join(OUT, 'icon-512.png');
  await sharp(path.join(ROOT, 'assets', 'icon.png'))
    .resize(512, 512, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(iconOut);

  // ── 1024x500 feature graphic ─────────────────────────────────────────────
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await page.setContent(`
    <style>
      @font-face { font-family: 'Manrope'; font-weight: 700 800; src: ${fontFace('manrope-latin.woff2')}; }
      html, body { margin: 0; width: 1024px; height: 500px; background: ${BG}; }
      body { display: flex; align-items: center; justify-content: center; gap: 44px; }
      .mark { width: 182px; height: 140px; flex: none; }
      .name {
        font-family: 'Manrope', system-ui, sans-serif; font-weight: 800;
        font-size: 84px; letter-spacing: -0.02em; line-height: 1;
        color: #ffffff; white-space: nowrap;
      }
    </style>
    <div class="mark">${markSvg}</div>
    <div class="name">${NAME}</div>
  `);
  await page.evaluate(() => document.fonts.ready);
  const usedManrope = await page.evaluate(() => document.fonts.check("800 84px Manrope"));
  const fits = await page.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return [...document.body.children].every(el => {
      const b = el.getBoundingClientRect();
      return b.left >= 40 && b.right <= r.width - 40;
    });
  });
  const buf = await page.screenshot();
  await browser.close();

  const featureOut = path.join(OUT, 'feature-graphic.png');
  await sharp(buf).flatten({ background: BG }).png({ compressionLevel: 9 }).toFile(featureOut);

  for (const f of [iconOut, featureOut]) {
    const m = await sharp(f).metadata();
    console.log(`${path.relative(ROOT, f)}  ${m.width}x${m.height}  alpha:${m.hasAlpha}  ${(fs.statSync(f).size / 1024).toFixed(0)} KB`);
  }
  if (!usedManrope) { console.error('Manrope did not load; the wordmark fell back to a system font.'); process.exit(1); }
  if (!fits) { console.error('The name overflows the 40px safe margin.'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
