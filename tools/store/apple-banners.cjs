// App Store "Cabeçalho e resultados de pesquisa" (header and search-results
// artwork), 2026-11-10. Both are optional creative assets in App Store Connect
// → version → Informação da página de produto:
//
//   header          3840x1646  (also accepted: 5244x2950)
//   search results  3840x2560  (also accepted: 5244x2950, 1920x1280)
//
//   node tools/store/screens.cjs --platform apple-6.3   # the phone shots first
//   node tools/store/apple-banners.cjs
//
// Output (gitignored): tools/store/out/apple-banners/<lang>/header.png and
// search.png, one per listing language, no alpha.
//
// Look: the dark ground of the screenshots and the Play feature graphic
// (#0b0f19), the white mark, the store name, the App Store subtitle of that
// language (docs/store-listing.md §1b) and three real screens of the app:
// Home, Smart Insights and Goals, from the 6.3" set. Flat, no gradients.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'out', 'apple-6.3');
const OUT = path.join(__dirname, 'out', 'apple-banners');
const BG = '#0b0f19';
const NAME = "Stack'd Finance";

// App Store subtitles, docs/store-listing.md §1b (30 characters max there).
const SUBTITLE = {
  en: 'Local-first money tracker',
  fr: 'Finances privées, hors ligne',
  it: 'Finanze private, offline',
  es: 'Finanzas privadas, sin cuenta',
  pt: 'Finanças privadas, offline'
};
const SCREENS = ['01-home.png', '05-insights.png', '03-goals.png'];

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
const dataUrl = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');

// A phone: the screenshot with the device's rounded corners and a thin rim,
// so it reads as a phone on the dark ground without a mock-up frame.
const phone = (src, h, extra = '') => `
  <div class="phone" style="height:${h}px;width:${Math.round(h * 1206 / 2622)}px;${extra}">
    <img src="${src}" alt="">
  </div>`;

const STYLE = `
  @font-face { font-family: 'Manrope'; font-weight: 500 800; src: ${fontFace('manrope-latin.woff2')}; }
  html, body { margin: 0; background: ${BG}; overflow: hidden; }
  body { font-family: 'Manrope', system-ui, sans-serif; color: #ffffff; }
  .phone { position: relative; border-radius: 9% / 4.2%; overflow: hidden; flex: none;
           box-shadow: 0 0 0 6px #273147; background: #000; }
  .phone img { width: 100%; height: 100%; display: block; }
  .mark { flex: none; }
  .name { font-weight: 800; letter-spacing: -0.02em; line-height: 1; white-space: nowrap; }
  .sub { font-weight: 600; color: #a7b3c6; line-height: 1.15; }
`;

const header = (lang) => {
  const shots = SCREENS.map(f => dataUrl(path.join(SHOTS, lang, f)));
  return `<style>${STYLE}
    html, body { width: 3840px; height: 1646px; }
    body { display: flex; align-items: center; justify-content: center; gap: 220px; }
    .text { display: flex; flex-direction: column; gap: 56px; width: 1500px; }
    .brand { display: flex; align-items: center; gap: 56px; }
    .mark { width: 260px; height: 200px; }
    .name { font-size: 150px; }
    .sub { font-size: 104px; }
    .phones { display: flex; align-items: center; gap: 70px; }
  </style>
  <div class="text">
    <div class="brand"><div class="mark">${markSvg}</div><div class="name">${NAME}</div></div>
    <div class="sub">${SUBTITLE[lang]}</div>
  </div>
  <div class="phones">
    ${phone(shots[1], 1240)}
    ${phone(shots[0], 1420)}
    ${phone(shots[2], 1240)}
  </div>`;
};

const search = (lang) => {
  const shots = SCREENS.map(f => dataUrl(path.join(SHOTS, lang, f)));
  return `<style>${STYLE}
    html, body { width: 3840px; height: 2560px; }
    body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 120px; }
    .brand { display: flex; align-items: center; gap: 48px; }
    .mark { width: 200px; height: 154px; }
    .name { font-size: 120px; }
    .sub { font-size: 96px; text-align: center; }
    .head { display: flex; flex-direction: column; align-items: center; gap: 36px; }
    .phones { display: flex; align-items: flex-end; gap: 110px; }
  </style>
  <div class="head">
    <div class="brand"><div class="mark">${markSvg}</div><div class="name">${NAME}</div></div>
    <div class="sub">${SUBTITLE[lang]}</div>
  </div>
  <div class="phones">
    ${phone(shots[0], 1700)}
    ${phone(shots[1], 1700)}
    ${phone(shots[2], 1700)}
  </div>`;
};

(async () => {
  const browser = await chromium.launch();
  const made = [];
  for (const lang of Object.keys(SUBTITLE)) {
    for (const [kind, w, h, html] of [['header', 3840, 1646, header(lang)], ['search', 3840, 2560, search(lang)]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.setContent(html);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(150);
      // nothing may spill past a 60 px margin
      const fits = await page.evaluate(() => [...document.body.querySelectorAll('.phone, .name, .sub, .mark')]
        .every(el => { const b = el.getBoundingClientRect(); return b.left >= 60 && b.right <= innerWidth - 60 && b.top >= 40 && b.bottom <= innerHeight - 40; }));
      const buf = await page.screenshot();
      await page.close();
      const dir = path.join(OUT, lang);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${kind}.png`);
      await sharp(buf).flatten({ background: BG }).png({ compressionLevel: 9 }).toFile(file);
      const m = await sharp(file).metadata();
      made.push(`${lang}/${kind}.png ${m.width}x${m.height} alpha:${m.hasAlpha} ${fits ? '' : ' OVERFLOWS'}`);
    }
  }
  await browser.close();
  console.log(made.join('\n'));
  if (made.some(l => l.includes('OVERFLOWS'))) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
