// Structured data (schema.org JSON-LD) for the generated Home and Support
// pages, and the check that reads it back out of the written HTML.
//
//   node tools/site/jsonld.cjs
//
// checks every generated page in the site repo (pages.cjs also runs the same
// check on what it has just written).
//
// Every value comes from what the page itself shows or links to: the app
// description is the hero lede, the FAQ is the Support page's own Q&A (the
// same strings pages.cjs renders, so the two can never drift), the store URLs
// are the badges' links. Nothing else — no ratings, review counts or download
// figures, which Google treats as spam when the page does not show them.
//
// The CSP is script-src 'none'. A <script type="application/ld+json"> is a
// data block: the HTML parser never runs it, so CSP's script checks never
// apply to it, and search engines read it from the markup. What must not
// happen is text ending the element early, so every <, >, & and U+2028/9 is
// written as a \u escape (JSON.parse gives the same string back). @ is
// escaped too, so Cloudflare's Email Address Obfuscation finds no address in
// the block to rewrite.
const fs = require('fs');
const path = require('path');
const L = require('./layout.cjs');
const { S, LANGS, ORIGIN, CONTACT, urlFor } = L;

const STUDIO_ID = `${ORIGIN}/#studio`;
const STUDIO = "Stack'd Development Studio";

// Site strings are HTML; structured data wants the plain text a reader sees.
const plain = (html) => String(html)
  .replace(/\{email\}/g, CONTACT)
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const script = (data) => {
  const json = JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/@(?!context|graph|type|id)/g, '\\u0040')
    .replace(new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g'), c => '\\u' + c.charCodeAt(0).toString(16));
  return `  <script type="application/ld+json">\n${json.replace(/^/gm, '  ')}\n  </script>`;
};

// The Play badge's link in that language, as pages.cjs writes it (unescaped).
const playUrl = (lang) => L.playUrl(lang).replace(/&amp;/g, '&');

const studio = () => ({ '@type': 'Organization', '@id': STUDIO_ID, name: STUDIO, url: `${ORIGIN}/` });

const home = (lang) => script({
  '@context': 'https://schema.org',
  '@graph': [
    studio(),
    {
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      name: STUDIO,
      url: `${ORIGIN}/`,
      inLanguage: LANGS.filter(l => S[l]),
      publisher: { '@id': STUDIO_ID }
    },
    {
      '@type': 'MobileApplication',
      '@id': `${urlFor(lang, '')}#app`,
      name: "Stack'd",
      // The store listings' name (docs/store-listing.md, D5).
      alternateName: "Stack'd Finance",
      description: plain(S[lang].home.hero.lede),
      url: urlFor(lang, ''),
      inLanguage: lang,
      operatingSystem: 'Android, iOS',
      applicationCategory: 'FinanceApplication',
      image: `${ORIGIN}/img/og.png`,
      // Free download; Stack'd Pro and Bank Connect are in-app purchases.
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      sameAs: [playUrl(lang), L.APP_STORE],
      author: { '@id': STUDIO_ID },
      publisher: { '@id': STUDIO_ID }
    }
  ]
});

const faq = (lang) => {
  const p = S[lang].support;
  return script({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: urlFor(lang, 'support'),
    inLanguage: lang,
    mainEntity: [...p.faq, ...p.buy].map(x => ({
      '@type': 'Question',
      name: plain(x.q),
      acceptedAnswer: { '@type': 'Answer', text: plain(x.a) }
    }))
  });
};

// ── Check ──────────────────────────────────────────────────────────────────
// kind: 'home' | 'support'. Returns a list of problems (empty = fine).
const blocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
const nodes = (data) => (data['@graph'] || [data]);

const check = (rel, html, kind) => {
  const out = [];
  const head = html.split('</head>')[0];
  const found = blocks(html);
  if (found.length !== 1) out.push(`${rel}: ${found.length} JSON-LD blocks, expected 1`);
  if (blocks(head).length !== found.length) out.push(`${rel}: JSON-LD outside <head>`);
  for (const raw of found) {
    if (/[<>&]/.test(raw)) out.push(`${rel}: unescaped < > or & inside JSON-LD`);
    let data;
    try { data = JSON.parse(raw); } catch (e) { out.push(`${rel}: JSON-LD does not parse: ${e.message}`); continue; }
    if (data['@context'] !== 'https://schema.org') out.push(`${rel}: @context is not https://schema.org`);
    const all = nodes(data);
    if (kind === 'home') {
      const app = all.find(n => n['@type'] === 'MobileApplication');
      if (!app) { out.push(`${rel}: no MobileApplication`); continue; }
      // Google's software-app rich result: name + offers.price (or a rating,
      // which we do not have and must not invent).
      if (!app.name) out.push(`${rel}: app has no name`);
      if (!app.offers || app.offers['@type'] !== 'Offer' || app.offers.price === undefined) out.push(`${rel}: app has no offers.price`);
      if (app.aggregateRating || app.review) out.push(`${rel}: app carries a rating or review`);
      for (const k of ['applicationCategory', 'operatingSystem', 'description', 'url', 'image']) if (!app[k]) out.push(`${rel}: app has no ${k}`);
      for (const u of app.sameAs || []) if (!html.includes(`href="${u.replace(/&/g, '&amp;')}"`)) out.push(`${rel}: ${u} is not a link on the page`);
      const ids = new Set(all.map(n => n['@id']).filter(Boolean));
      for (const k of ['author', 'publisher']) if (!app[k] || !ids.has(app[k]['@id'])) out.push(`${rel}: app ${k} does not resolve`);
    } else {
      if (data['@type'] !== 'FAQPage') { out.push(`${rel}: not a FAQPage`); continue; }
      const qs = data.mainEntity || [];
      if (!qs.length) out.push(`${rel}: FAQPage has no mainEntity`);
      qs.forEach((q, i) => {
        if (q['@type'] !== 'Question' || !q.name) out.push(`${rel}: mainEntity[${i}] is not a named Question`);
        if (!q.acceptedAnswer || q.acceptedAnswer['@type'] !== 'Answer' || !q.acceptedAnswer.text) out.push(`${rel}: mainEntity[${i}] has no acceptedAnswer text`);
      });
      // The same questions, in the same order, as the visible FAQ.
      const shown = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(m => plain(m[1])).filter(t => !/^\s*$/.test(t));
      const asked = qs.map(q => q.name);
      const onPage = shown.filter(t => asked.includes(t));
      if (onPage.length !== asked.length || onPage.join('\n') !== asked.join('\n')) out.push(`${rel}: FAQPage questions differ from the page's`);
    }
  }
  return out;
};

module.exports = { home, faq, check, plain };

if (require.main === module) {
  const problems = [];
  let n = 0;
  for (const lang of LANGS) {
    const dir = lang === 'en' ? '' : `${lang}/`;
    for (const [file, kind] of [['index.html', 'home'], ['support.html', 'support']]) {
      const rel = dir + file;
      const f = path.join(L.SITE, rel);
      if (!fs.existsSync(f)) { problems.push(`${rel}: missing`); continue; }
      problems.push(...check(rel, fs.readFileSync(f, 'utf8'), kind));
      n++;
    }
  }
  console.log(`${n} pages checked for JSON-LD`);
  if (problems.length) {
    problems.forEach(p => console.log('  ! ' + p));
    process.exitCode = 1;
  } else {
    console.log('  every block parses; app and FAQ properties present.');
  }
}
