// Measures the home page the way a mid-range phone on a slow network sees it
// (docs/site-hero-animation-plan.md P3): Lighthouse's mobile conditions —
// 4× CPU slowdown, "Slow 4G" (150 ms, 1.6 Mbit/s) — at 390×844 @3x, with a
// cold cache on every run.
//
//   node tools/site/hero-perf.cjs https://stackd-site.pages.dev/ https://hero-animation.stackd-site.pages.dev/
//
// For each URL, the median of --runs (default 5) of: LCP and its element, CLS,
// and what happens while the title animates (first paint + 1.6 s): layouts,
// paints, long main-thread tasks, and the compositor's frame rate. The page is
// still loading in that window, so each URL is also measured with reduced
// motion — the same page without the animation — and the difference is the
// animation's own cost. --preload=none|low|high rewrites the font preload in
// flight (stripped, fetchpriority="low", default priority) to weigh it
// against the LCP image; "font" is when Manrope finished, relative to first
// contentful paint (negative: before it).
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const urls = args.filter(a => !a.startsWith('--'));
const RUNS = Number((args.find(a => a.startsWith('--runs=')) || '--runs=5').split('=')[1]);
const PRELOAD = (args.find(a => a.startsWith('--preload=')) || '--preload=keep').split('=')[1];
if (!['keep', 'none', 'low', 'high'].includes(PRELOAD)) throw new Error('--preload=keep|none|low|high');
if (!urls.length) throw new Error('give one or more URLs');

// Collected in the page from the first byte; the site's CSP doesn't apply to it.
function observe() {
  window.__perf = { lcp: null, cls: 0, longTasks: [] };
  new PerformanceObserver(l => {
    const e = l.getEntries().at(-1);
    const el = e.element;
    window.__perf.lcp = { t: e.startTime, el: el ? el.tagName.toLowerCase() + (el.closest('h1') ? ' (title)' : '') : '?' };
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.longTasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
}

async function run(browser, url, reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, bypassCSP: true, locale: 'en-US', reducedMotion });
  const page = await ctx.newPage();
  await page.addInitScript(observe);
  // Every run, rewritten or not, gets its HTML the same way: fetched outside
  // the browser (so outside the emulated network) and handed over after the
  // time Slow 4G would take — a new connection (~4 round trips) plus the
  // transfer. Without this, a rewritten page would arrive instantly and win
  // for no reason of its own.
  await page.route(url, async (route) => {
    const res = await route.fetch();
    let html = await res.text();
    if (PRELOAD === 'none') html = html.replace(/\s*<link rel="preload"[^>]*>/g, '');
    if (PRELOAD === 'low' || PRELOAD === 'high') html = html.replace(/<link rel="preload"([^>]*?)( fetchpriority="\w+")?>/g, `<link rel="preload"$1${PRELOAD === 'low' ? ' fetchpriority="low"' : ''}>`);
    await new Promise(r => setTimeout(r, 4 * 150 + Buffer.byteLength(html) / (1.6 * 1024 * 1024 / 8 / 1000)));
    route.fulfill({ response: res, body: html });
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame'] });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const trace = JSON.parse((await browser.stopTracing()).toString()).traceEvents;
  const perf = await page.evaluate(() => ({
    ...window.__perf,
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
    font: performance.getEntriesByType('resource').find(r => r.name.includes('manrope-latin'))?.responseEnd ?? null,
  }));
  await ctx.close();

  // The animation window, on the trace clock: first contentful paint → +1.6 s.
  const fp = trace.find(e => e.name === 'firstContentfulPaint') || trace.find(e => e.name === 'firstPaint');
  const t0 = fp ? fp.ts : Math.min(...trace.filter(e => e.ts > 0).map(e => e.ts));
  const inWindow = (e) => e.ts >= t0 && e.ts <= t0 + 1.6e6;
  const count = (name) => trace.filter(e => e.name === name && inWindow(e)).length;
  return {
    lcp: perf.lcp?.t ?? NaN, lcpEl: perf.lcp?.el ?? '?', cls: perf.cls,
    fcp: perf.fcp ?? NaN, font: perf.font !== null && perf.fcp !== null ? perf.font - perf.fcp : NaN,
    layouts: count('Layout'), paints: count('Paint'),
    longTasks: perf.longTasks.filter(([s]) => perf.fcp !== null && s >= perf.fcp && s <= perf.fcp + 1600).length,
    fps: count('DrawFrame') / 1.6,
  };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

(async () => {
  const browser = await chromium.launch();
  try {
    for (const url of urls) {
      console.log(`\n${url}${PRELOAD === 'keep' ? '' : ` (preload: ${PRELOAD})`}  (${RUNS} cold runs each, 390×844 @3x, 4× CPU, Slow 4G; medians)`);
      for (const mode of ['no-preference', 'reduce']) {
        const runs = [];
        for (let i = 0; i < RUNS; i++) runs.push(await run(browser, url, mode));
        const m = (k) => median(runs.map(r => r[k]));
        const label = mode === 'reduce' ? 'reduced motion' : 'with motion   ';
        const font = m('font');
        console.log(`  ${label}  FCP ${Math.round(m('fcp'))} ms, LCP ${Math.round(m('lcp'))} ms (${[...new Set(runs.map(r => r.lcpEl))].join(', ')}; runs ${runs.map(r => Math.round(r.lcp)).join(', ')}), font ${Number.isNaN(font) ? 'not loaded' : `${font > 0 ? '+' : ''}${Math.round(font)} ms`}  CLS ${m('cls').toFixed(3)} (max ${Math.max(...runs.map(r => r.cls)).toFixed(3)})`);
        console.log(`  ${' '.repeat(label.length)}  first 1.6 s: ${m('layouts')} layouts, ${m('paints')} paints, ${m('longTasks')} long tasks, compositor ${m('fps').toFixed(0)} fps`);
      }
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
