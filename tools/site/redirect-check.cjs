// Checks the marketing site's language redirect
// (../StackdSite/functions/_middleware.js) without deploying it.
//
//   node tools/site/redirect-check.cjs
//
// Runs the function's own exports against the cases that matter: language
// weights, regional tags, a missing header, a visit from inside the site,
// pages that must never redirect, and the response headers. It also checks
// that the function's security headers equal the "/*" block of _headers,
// because Cloudflare does not apply _headers to a Function's responses.
//
// Node runs the function's ES module through a temporary .mjs copy, since the
// site repo has no package.json to mark it as a module.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');

const SITE = path.resolve(__dirname, '../../../StackdSite');
const SRC = path.join(SITE, 'functions', '_middleware.js');

(async () => {
  const tmp = path.join(os.tmpdir(), `stackd-middleware-${process.pid}.mjs`);
  fs.copyFileSync(SRC, tmp);
  const fn = await import(pathToFileURL(tmp).href);
  fs.unlinkSync(tmp);

  const failures = [];
  let total = 0;
  const check = (name, f) => { total++; try { f(); } catch (e) { failures.push(`${name}: ${e.message}`); } };

  // ── pickLang ──────────────────────────────────────────────────────────
  const pick = [
    [undefined, 'en'], ['', 'en'],
    ['it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7', 'it'],
    ['pt-BR,pt;q=0.9', 'pt'],
    ['fr-CH, fr;q=0.8, en;q=0.9, de;q=0.7, *;q=0.5', 'fr'],
    ['de-DE,de;q=0.9,en;q=0.8,it;q=0.5', 'en'],
    ['de-DE,de;q=0.9,it;q=0.5', 'it'],
    ['de,ja', 'en'],
    ['en;q=0.5,es;q=0.9', 'es'],
    ['*', 'en'],
    ['es;q=0,fr;q=0.3', 'fr'],
    ['ES-mx', 'es'],
    ['it;q=abc,fr', 'fr']
  ];
  for (const [header, want] of pick) {
    check(`pickLang(${JSON.stringify(header)})`, () => assert.strictEqual(fn.pickLang(header), want));
  }

  // ── redirectFor ───────────────────────────────────────────────────────
  const O = 'https://stackdplatform.com';
  const req = (p, h = {}, method = 'GET') => new Request(O + p, { method, headers: h });
  const IT = { 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8' };
  const cases = [
    ['Italian browser, home', req('/', IT), `${O}/it/`],
    ['Italian browser, support', req('/support', IT), `${O}/it/support`],
    ['Italian browser, privacy', req('/privacy', IT), `${O}/it/privacy`],
    ['Italian browser, terms', req('/terms', IT), `${O}/it/terms`],
    ['query string kept', req('/?utm_source=play', IT), `${O}/it/?utm_source=play`],
    ['English browser', req('/', { 'Accept-Language': 'en-GB,en;q=0.9' }), null],
    ['no Accept-Language (crawler)', req('/'), null],
    ['from inside the site', req('/', { ...IT, Referer: `${O}/it/` }), null],
    ['from another site', req('/', { ...IT, Referer: 'https://www.google.com/' }), `${O}/it/`],
    ['from www (another origin)', req('/', { ...IT, Referer: 'https://www.stackdplatform.com/' }), `${O}/it/`],
    ['unparseable Referer', req('/', { ...IT, Referer: 'not a url' }), `${O}/it/`],
    ['translated page itself', req('/it/', IT), null],
    ['asset', req('/styles.css', IT), null],
    ['POST', req('/', IT, 'POST'), null],
    ['HEAD', req('/', IT, 'HEAD'), `${O}/it/`]
  ];
  for (const [name, r, want] of cases) check(`redirectFor: ${name}`, () => assert.strictEqual(fn.redirectFor(r), want));

  // A preview deploy is its own origin: a click inside it must not redirect.
  const P = 'https://abc123.stackd-site.pages.dev';
  check('redirectFor: inside a preview deploy', () => assert.strictEqual(
    fn.redirectFor(new Request(P + '/', { headers: { ...IT, Referer: P + '/it/' } })), null));

  // ── onRequest ─────────────────────────────────────────────────────────
  const page = () => new Response('<!DOCTYPE html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  const redirected = await fn.onRequest({ request: req('/', IT), next: async () => page() });
  check('onRequest: 302 with Location', () => {
    assert.strictEqual(redirected.status, 302);
    assert.strictEqual(redirected.headers.get('Location'), `${O}/it/`);
    assert.strictEqual(redirected.headers.get('Cache-Control'), 'no-store');
  });
  const served = await fn.onRequest({ request: req('/', { 'Accept-Language': 'en' }), next: async () => page() });
  check('onRequest: serves the page', () => assert.strictEqual(served.status, 200));
  for (const res of [redirected, served]) {
    check(`onRequest ${res.status}: security headers and Vary`, () => {
      for (const [k, v] of Object.entries(fn.SECURITY_HEADERS)) assert.strictEqual(res.headers.get(k), v, k);
      assert.strictEqual(res.headers.get('Vary'), 'Accept-Language, Referer');
    });
  }

  // ── The function's headers must be the "/*" block of _headers ─────────
  const block = /^\/\*\r?\n((?:[ \t]+.+\r?\n?)+)/m.exec(fs.readFileSync(path.join(SITE, '_headers'), 'utf8'));
  const fromFile = Object.fromEntries((block ? block[1] : '').split(/\r?\n/).filter(Boolean)
    .map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  check('SECURITY_HEADERS equal _headers /*', () => assert.deepStrictEqual(fn.SECURITY_HEADERS, fromFile));

  // ── _routes.json runs the function on exactly the four root pages ─────
  const routes = JSON.parse(fs.readFileSync(path.join(SITE, '_routes.json'), 'utf8'));
  check('_routes.json include', () => assert.deepStrictEqual(routes.include.slice().sort(), ['/', '/privacy', '/support', '/terms']));

  if (failures.length) {
    console.log(`${failures.length} of ${total} checks failed:`);
    failures.forEach(f => console.log('  ! ' + f));
    process.exitCode = 1;
  } else {
    console.log(`all ${total} redirect checks pass`);
  }
})().catch(e => { console.error(e); process.exit(1); });
