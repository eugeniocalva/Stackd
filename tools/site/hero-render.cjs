// Renders the animated home-page title frame by frame
// (docs/site-hero-animation-plan.md §2–§4).
//
// The scene (hero-scene.html) and the site pages carry the title's motion as
// CSS animations. This script pauses every animation and seeks it to an exact
// t = n / fps before each screenshot, so a frame is a pure function of
// (language, format, theme, t): nothing reads a clock.
//
//   node tools/site/hero-render.cjs                 contact sheets of the scene, 5 languages × 3 formats
//   node tools/site/hero-render.cjs --site          contact sheets of the real home page at 9 widths
//   node tools/site/hero-render.cjs --verify        render twice, compare every frame's SHA-256, and
//                                                   check the last frame equals the reduced-motion render
//   node tools/site/hero-render.cjs --preview       a WebM of each scene variant, encoded from the frames
//   node tools/site/hero-render.cjs --frames        write the full PNG sequences
//   node tools/site/hero-render.cjs --serve         serve the scene to watch it play in a browser
//
// Narrow any run with --lang=en,es --format=1920x1080 --theme=dark,light
// (also --fps=60 --duration=4 --width=390 for --site).
//
// Writes into tools/site/out/hero/ (gitignored). Never into StackdSite:
// Cloudflare Pages publishes every file there.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');
const sharp = require('sharp');
const { SITE, LANGS, S, attr } = require('./layout.cjs');
const { heroTitle } = require('./hero.cjs');

const OUT = path.join(__dirname, 'out', 'hero');
const SCENE = fs.readFileSync(path.join(__dirname, 'hero-scene.html'), 'utf8');
const MOTION = path.join(__dirname, 'hero-motion.css');

// Video formats (plan §3): the title inside the 90 % title-safe area.
const FORMATS = {
  '1920x1080': { FS: 144, MAXW: 1480, EYEBROW: 30, ICON: 76, GAP: 44, BGAP: 22 },
  '1080x1920': { FS: 118, MAXW: 940, EYEBROW: 30, ICON: 76, GAP: 48, BGAP: 22 },
  '1080x1080': { FS: 98, MAXW: 940, EYEBROW: 26, ICON: 64, GAP: 36, BGAP: 18 },
};
// Site widths (plan §6), each with a typical height for that device class.
const WIDTHS = { 320: 640, 360: 780, 390: 844, 412: 915, 768: 1024, 1024: 768, 1280: 800, 1440: 900, 1920: 1080 };

// ── Arguments ──────────────────────────────────────────────────────────────
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const list = (v, all) => (v ? String(v).split(',') : all);
const opt = {
  langs: list(args.lang, LANGS),
  formats: list(args.format, Object.keys(FORMATS)),
  themes: list(args.theme, ['dark']),
  widths: list(args.width, Object.keys(WIDTHS)).map(Number),
  fps: Number(args.fps || 60),
  duration: Number(args.duration || 4),
};
for (const l of opt.langs) if (!S[l]) throw new Error(`unknown language ${l}`);
for (const f of opt.formats) if (!FORMATS[f]) throw new Error(`unknown format ${f} (${Object.keys(FORMATS).join(', ')})`);
for (const w of opt.widths) if (!WIDTHS[w]) throw new Error(`unknown width ${w} (${Object.keys(WIDTHS).join(', ')})`);

// ── Local server: the site repo, the motion CSS and the scene ──────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const fill = (tpl, slots) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => {
  if (!(k in slots)) throw new Error(`scene slot {{${k}}} has no value`);
  return slots[k];
});

function scene(lang, format) {
  const [W, H] = format.split('x');
  return fill(SCENE, {
    ...FORMATS[format], W, H, LANG: lang,
    TITLE: heroTitle(S[lang].home.hero.h1),
    EYEBROW_TEXT: S[lang].home.hero.eyebrow,
  });
}

// Phase 1 preview of the site: until pages.cjs emits the word spans (phase 2),
// the home page's plain <h1> is swapped for heroTitle() and the motion CSS is
// linked, on the fly. A page that already has them is served untouched.
function sitePage(lang, html) {
  if (html.includes('class="w"')) return html;
  const h1 = S[lang].home.hero.h1;
  const plain = h1.replace(/<[^>]+>/g, '');
  const m = /<h1>([^<]*)<\/h1>/.exec(html);
  if (!m || m[1].replace(/<[^>]+>/g, '') !== plain) throw new Error(`${lang} home page: hero <h1> is not "${plain}"`);
  return html.replace(m[0], heroTitle(h1)).replace('</head>', '<link rel="stylesheet" href="/__hero/motion.css">\n</head>');
}

// A page requested with ?render is held at t = 0 from its very first style
// pass. Otherwise its animations would run on the wall clock until the
// renderer pauses them, and how far they got — whether Chromium had already
// moved a word onto a compositor layer, drawn differently — would depend on
// the machine's load (verify caught exactly that). Held from the start, the
// words are only ever painted where seek() puts them.
const HOLD = '<style id="hero-render-hold">*, *::before, *::after { animation-play-state: paused !important; }</style>';
const held = (url, html) => (url.searchParams.has('render') ? html.replace(/<head>/i, `<head>\n${HOLD}`) : html);

function serve() {
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (type, body) => { res.setHeader('content-type', type); res.setHeader('cache-control', 'no-store'); res.end(body); };
    try {
      if (url.pathname === '/__hero/motion.css') return send(TYPES['.css'], fs.readFileSync(MOTION));
      if (url.pathname === '/__hero/scene') return send(TYPES['.html'], held(url, scene(url.searchParams.get('lang') || 'en', url.searchParams.get('format') || '1920x1080')));
      const home = /^\/(?:(fr|it|es|pt)\/)?$/.exec(url.pathname);
      if (home) {
        const lang = home[1] || 'en';
        return send(TYPES['.html'], held(url, sitePage(lang, fs.readFileSync(path.join(SITE, home[1] || '', 'index.html'), 'utf8'))));
      }
      const file = path.join(SITE, decodeURIComponent(url.pathname));
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
      send(TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
    } catch (e) {
      res.statusCode = 500;
      res.end(String(e.stack || e));
      console.error(e.message);
    }
  });
  return new Promise(resolve => srv.listen(Number(args.port || 0), '127.0.0.1', () => resolve(srv)));
}

// ── Rendering ──────────────────────────────────────────────────────────────
// Software raster, a fixed sRGB profile and grayscale text anti-aliasing:
// Chromium turns subpixel (LCD) text off wherever layers are composited, so
// leaving it on would make a static frame differ from an animated one — and
// LCD fringes are wrong in a video anyway.
const launch = () => chromium.launch({ args: ['--force-color-profile=srgb', '--disable-gpu', '--disable-lcd-text', '--font-render-hinting=none'] });

// Runs in the page once it has loaded. Fails rather than render a frame with
// a fallback font, and refuses any animation that is not the hero motion.
async function ready() {
  await document.fonts.ready;
  // Lazy images further down never load, and their decode() never settles.
  await Promise.all([...document.images].filter(i => i.loading !== 'lazy').map(i => i.decode().catch(() => {})));
  if (![...document.fonts].some(f => f.family.replace(/["']/g, '') === 'Manrope' && f.status === 'loaded')) throw new Error('Manrope did not load');
  const anims = document.getAnimations();
  const stray = anims.filter(a => !/^hero-/.test(a.animationName || ''));
  if (stray.length) throw new Error(`animations outside the hero motion: ${stray.map(a => a.animationName || a.constructor.name).join(', ')}`);
  for (const a of anims) a.pause();
  const h1 = document.querySelector('.hero h1').getBoundingClientRect();
  const size = parseFloat(getComputedStyle(document.querySelector('.hero h1')).fontSize);
  return {
    animations: anims.length,
    end: Math.max(0, ...anims.map(a => a.effect.getComputedTiming().endTime)) / 1000,
    h1: { x: h1.x + scrollX, y: h1.y + scrollY, width: h1.width, height: h1.height, fs: size },
  };
}

// The clock: every animation paused at exactly ms, then two frames so the
// new style is painted before the screenshot.
async function seek(ms) {
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function variants(kind) {
  const out = [];
  for (const theme of opt.themes) for (const lang of opt.langs) {
    if (kind === 'scene') for (const format of opt.formats) {
      const [w, h] = format.split('x').map(Number);
      out.push({ kind, lang, theme, format, w, h, name: `scene-${lang}-${format}-${theme}`, path: `/__hero/scene?lang=${lang}&format=${format}` });
    } else for (const w of opt.widths) {
      out.push({ kind, lang, theme, w, h: WIDTHS[w], name: `site-${lang}-${w}-${theme}`, path: lang === 'en' ? '/' : `/${lang}/` });
    }
  }
  return out;
}

async function open(browser, base, v, { reduce = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, colorScheme: v.theme,
    reducedMotion: reduce ? 'reduce' : 'no-preference', locale: v.lang,
  });
  const page = await ctx.newPage();
  await page.goto(base + v.path + (v.path.includes('?') ? '&' : '?') + 'render', { waitUntil: 'load' });
  const info = await page.evaluate(ready);
  let clip;
  if (v.kind === 'site') {
    // The title plus room for the words' 0.4em rise; a title below the fold
    // is brought into the viewport by making the viewport taller (heights
    // don't change this layout: the hero sizes with the width only).
    const pad = Math.ceil(info.h1.fs * 0.5);
    clip = { x: Math.max(0, Math.floor(info.h1.x - pad)), y: Math.max(0, Math.floor(info.h1.y - pad)) };
    clip.width = Math.min(v.w - clip.x, Math.ceil(info.h1.width + 2 * pad));
    clip.height = Math.ceil(info.h1.height + 2 * pad);
    if (clip.y + clip.height > v.h) await page.setViewportSize({ width: v.w, height: clip.y + clip.height });
  }
  const shot = async (t) => {
    await page.evaluate(seek, t * 1000);
    return page.screenshot({ clip, animations: 'allow', caret: 'hide', type: 'png' });
  };
  return { ctx, page, info, shot };
}

const frameTimes = () => Array.from({ length: Math.round(opt.duration * opt.fps) + 1 }, (_, n) => n / opt.fps);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(process.cwd(), p);

// ── Contact sheets ─────────────────────────────────────────────────────────
// Key frames from just before the first word to the rest state, on the frame grid.
const SHEET_T = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.2, 1.35, 1.5];

async function sheets(browser, base, kind) {
  const groups = new Map(); // one sheet per (format|width group, theme) with a row per language
  for (const v of variants(kind)) {
    const { ctx, info, shot } = await open(browser, base, v);
    const times = SHEET_T.map(t => Math.round(t * opt.fps) / opt.fps);
    const thumbW = kind === 'scene' ? (v.w > v.h ? 384 : 216) : Math.min(360, v.w);
    const cells = [];
    for (const t of times) {
      const png = await shot(t);
      const thumb = await sharp(png).resize({ width: thumbW }).png().toBuffer();
      cells.push({ t, src: `data:image/png;base64,${thumb.toString('base64')}` });
    }
    await ctx.close();
    const key = kind === 'scene' ? `scene-${v.format}-${v.theme}` : `site-${v.lang}-${v.theme}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ label: kind === 'scene' ? v.lang : `${v.w}px`, cells, end: info.end, n: info.animations });
    console.log(`  ${v.name}: ${info.animations} animations, rest state at ${info.end.toFixed(2)} s`);
  }
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  fs.mkdirSync(path.join(OUT, 'sheets'), { recursive: true });
  for (const [key, rows] of groups) {
    const head = rows[0].cells.map(c => `<th>t = ${c.t.toFixed(2)} s<br><small>frame ${Math.round(c.t * opt.fps)}</small></th>`).join('');
    const body = rows.map(r => `<tr><th>${attr(r.label)}</th>${r.cells.map(c => `<td><img src="${c.src}"></td>`).join('')}</tr>`).join('\n');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; padding: 24px; background: #e5e7eb; font: 13px/1.4 system-ui, sans-serif; color: #111; }
      h1 { font-size: 16px; margin: 0 0 12px; } table { border-collapse: separate; border-spacing: 6px; }
      th { font-weight: 600; text-align: left; vertical-align: middle; } small { color: #555; font-weight: 400; }
      td { padding: 0; vertical-align: top; } img { display: block; outline: 1px solid #9ca3af; }
    </style><h1>${key} · ${opt.fps} fps · rest state at ${rows[0].end.toFixed(2)} s</h1><table><tr><th></th>${head}</tr>${body}</table>`);
    const file = path.join(OUT, 'sheets', `${key}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`→ ${rel(file)}`);
  }
  await page.close();
}

// ── Full sequences, hashes, preview video ──────────────────────────────────
async function sequence(browser, base, v, each) {
  const { ctx, shot } = await open(browser, base, v);
  const hashes = [];
  for (const [n, t] of frameTimes().entries()) {
    const png = await shot(t);
    hashes.push(sha(png));
    if (each) await each(png, n);
  }
  await ctx.close();
  return hashes;
}

// Where two frames differ: changed pixels, the largest channel delta, their bounding box.
async function pixelDiff(a, b) {
  const [ra, rb] = await Promise.all([a, b].map(x => sharp(x).raw().toBuffer({ resolveWithObject: true })));
  const { width, channels } = ra.info;
  let n = 0, max = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < ra.data.length; i += channels) {
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(ra.data[i + c] - rb.data[i + c]));
    if (!d) continue;
    const p = i / channels, x = p % width, y = (p - x) / width;
    n++; max = Math.max(max, d);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return n ? `${n} px differ (max Δ ${max}) in x ${x0}–${x1}, y ${y0}–${y1}` : 'pixel-identical';
}

// Mismatching frames are kept in out/hero/verify/ for a look.
async function keep(v, label, a, b) {
  const dir = path.join(OUT, 'verify', v.name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${label}-a.png`), a);
  fs.writeFileSync(path.join(dir, `${label}-b.png`), b);
  return pixelDiff(a, b);
}

async function verify(base) {
  let bad = 0;
  fs.rmSync(path.join(OUT, 'verify'), { recursive: true, force: true });
  for (const v of variants('scene')) {
    const runs = [[], []];
    const hashes = [];
    for (const run of [0, 1]) {
      const browser = await launch(); // a fresh browser process per run
      hashes.push(await sequence(browser, base, v, png => { runs[run].push(png); }));
      if (run === 0) {
        // The animation must land exactly on the static design.
        const still = await open(browser, base, v, { reduce: true });
        const reduced = await still.shot(frameTimes().at(-1));
        await still.ctx.close();
        const landed = hashes[0].at(-1) === sha(reduced);
        if (!landed) bad++;
        console.log(`  ${v.name}: last frame ${landed ? '= reduced-motion render' : `≠ reduced-motion render: ${await keep(v, 'rest', runs[0].at(-1), reduced)}`}`);
      }
      await browser.close();
    }
    const diff = hashes[0].map((h, i) => (h !== hashes[1][i] ? i : -1)).filter(i => i >= 0);
    if (diff.length) {
      bad++;
      const n = diff[0];
      console.log(`  ${v.name}: ${diff.length} of ${hashes[0].length} frames DIFFERENT between runs (frames ${n}–${diff.at(-1)}); frame ${n}: ${await keep(v, `frame${n}`, runs[0][n], runs[1][n])}`);
      continue;
    }
    // Against the previous verify, kept in out/hero/hashes/: a change there with
    // no change to the scene means the browser or the fonts moved.
    const manifest = path.join(OUT, 'hashes', `${v.name}-${opt.fps}fps.txt`);
    const now = hashes[0].join('\n') + '\n';
    const before = fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8') : null;
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, now);
    console.log(`  ${v.name}: ${hashes[0].length} frames × 2 runs, byte-identical${before === null ? '' : before === now ? ', same as the previous verify' : ', CHANGED since the previous verify'}`);
  }
  if (bad) { console.error(`verify: ${bad} problem(s)`); process.exitCode = 1; } else console.log('verify: every frame identical across runs, every animation lands on the static design');
}

// A full ffmpeg (FFMPEG env or PATH) or, for a preview only, the VP8-only one
// Playwright bundles for its own recorder, which reads MJPEG frames.
function ffmpeg() {
  const candidates = [process.env.FFMPEG, 'ffmpeg'].filter(Boolean);
  for (const c of candidates) if (spawnSync(c, ['-version']).status === 0) return c;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'), 'ms-playwright');
  for (const d of fs.existsSync(root) ? fs.readdirSync(root).filter(d => d.startsWith('ffmpeg')).sort().reverse() : []) {
    const exe = fs.readdirSync(path.join(root, d)).find(f => /^ffmpeg[\w-]*(\.exe)?$/.test(f));
    if (exe) return path.join(root, d, exe);
  }
  throw new Error('no ffmpeg found: install one (plan D4) or set FFMPEG');
}

async function preview(browser, base) {
  const bin = ffmpeg();
  fs.mkdirSync(path.join(OUT, 'preview'), { recursive: true });
  for (const v of variants('scene')) {
    const file = path.join(OUT, 'preview', `${v.name}.webm`);
    const ff = spawn(bin, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(opt.fps), '-i', 'pipe:0',
      '-c:v', 'vp8', '-b:v', '6M', '-crf', '4', '-qmin', '0', '-qmax', '30', '-deadline', 'good', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error(`ffmpeg exited ${c}`)) : res())));
    await sequence(browser, base, v, async (png) => {
      const jpg = await sharp(png).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
      if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
    });
    ff.stdin.end();
    await done;
    console.log(`→ ${rel(file)}`);
  }
}

async function frames(browser, base) {
  for (const v of variants(args.site ? 'site' : 'scene')) {
    const dir = path.join(OUT, 'frames', v.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    await sequence(browser, base, v, (png, n) => fs.promises.writeFile(path.join(dir, `${String(n).padStart(6, '0')}.png`), png));
    console.log(`→ ${rel(dir)} (${frameTimes().length} frames)`);
  }
}

(async () => {
  if (!fs.existsSync(SITE)) throw new Error(`site repo not found at ${SITE}`);
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  if (args.serve) {
    console.log(`Serving on ${base} — Ctrl+C to stop.`);
    for (const l of opt.langs) console.log(`  ${base}/__hero/scene?lang=${l}&format=${opt.formats[0]}   ${base}${l === 'en' ? '/' : `/${l}/`}`);
    return;
  }
  try {
    if (args.verify) await verify(base);
    else {
      const browser = await launch();
      try {
        if (args.preview) await preview(browser, base);
        else if (args.frames) await frames(browser, base);
        else await sheets(browser, base, args.site ? 'site' : 'scene');
      } finally { await browser.close(); }
    }
  } finally { srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
