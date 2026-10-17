// Shared furniture for every generated page of the marketing site: URLs,
// <head>, the header with its language menu, and the footer.
//
// Used by tools/site/pages.cjs (Home, Support, 404) and tools/site/legal.cjs
// (the translated legal pages), and copied into the hand-written English
// privacy.html / terms.html by legal.cjs, so the header is one piece of markup
// across the whole site.
//
// Every link is root-absolute (/fr/support, /styles.css): the same template
// renders at /, /fr/ and /fr/support, and a 404 page renders at any depth.
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '../..');
const SITE = path.resolve(APP, '../StackdSite');
const ORIGIN = 'https://stackdplatform.com';
const LANGS = ['en', 'fr', 'it', 'es', 'pt'];
const CONTACT = 'hi@stackdplatform.com';
const PLAY = 'https://play.google.com/store/apps/details?id=com.stackd.finance';
// Google Play's web listing reads ?hl=; the app's Portuguese is European.
const PLAY_HL = { fr: 'fr', it: 'it', es: 'es', pt: 'pt-PT' };

// Site copy, one table per language (tools/site/strings/<lang>.cjs). A missing
// table is left out here and reported by the generators, which refuse to
// finish while one is absent.
const S = Object.fromEntries(LANGS
  .filter(l => fs.existsSync(path.join(__dirname, 'strings', `${l}.cjs`)))
  .map(l => [l, require(`./strings/${l}.cjs`)]));

// page: '' (home), 'support', 'privacy', 'terms'.
const href = (lang, page) => (lang === 'en' ? '/' : `/${lang}/`) + page;
const urlFor = (lang, page) => ORIGIN + href(lang, page);
const playUrl = (lang) => (PLAY_HL[lang] ? `${PLAY}&amp;hl=${PLAY_HL[lang]}` : PLAY);

// Text placed in an attribute (descriptions, alt text) is plain text.
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The contact address must be a mailto wrapped in Cloudflare's email_off
// markers, or Email Address Obfuscation rewrites it and the site's own CSP
// (script-src 'none') blocks the decoder: the page then shows the literal
// text "[email protected]". Strings write it as {email}.
const MAIL = `<!--email_off--><a href="mailto:${CONTACT}">${CONTACT}</a><!--/email_off-->`;
const fill = (str, vars = {}) => String(str).replace(/\{(\w+)\}/g, (m, k) => {
  if (k === 'email') return MAIL;
  if (k in vars) return vars[k];
  throw new Error(`unfilled placeholder ${m} in: ${str}`);
});

const head = ({ lang, page, title, description, alternates = true, noindex = false }) => {
  const s = S[lang];
  const links = [];
  if (noindex) {
    links.push('  <meta name="robots" content="noindex">');
  } else {
    links.push(`  <link rel="canonical" href="${urlFor(lang, page)}">`);
    if (alternates) {
      LANGS.filter(l => S[l]).forEach(l => links.push(`  <link rel="alternate" hreflang="${l}" href="${urlFor(l, page)}">`));
      links.push(`  <link rel="alternate" hreflang="x-default" href="${urlFor('en', page)}">`);
    }
    links.push(
      '  <meta property="og:type" content="website">',
      '  <meta property="og:site_name" content="Stack\'d Development Studio">',
      `  <meta property="og:url" content="${urlFor(lang, page)}">`,
      `  <meta property="og:title" content="${attr(title)}">`,
      `  <meta property="og:description" content="${attr(description)}">`,
      `  <meta property="og:locale" content="${s.ogLocale}">`,
      `  <meta property="og:image" content="${ORIGIN}/img/og.png">`,
      '  <meta property="og:image:type" content="image/png">',
      '  <meta property="og:image:width" content="1200">',
      '  <meta property="og:image:height" content="630">',
      `  <meta property="og:image:alt" content="${attr(s.ogAlt)}">`,
      '  <meta name="twitter:card" content="summary_large_image">'
    );
  }
  return `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${attr(description)}">
${links.join('\n')}
  <meta name="theme-color" content="#f4f7f9" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0b0f19" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="/img/icon-512.webp" type="image/webp">
  <link rel="apple-touch-icon" href="/img/icon.png">
  <link rel="stylesheet" href="/styles.css">
</head>`;
};

const MARK = `<svg class="mark" viewBox="0 0 48 48" aria-hidden="true" fill="currentColor">
        <polygon points="17,6 28,12 17,18 6,12"/>
        <path d="M6 17 L11 14.5 L17 18 L23 14.5 L28 17 L17 23 Z"/>
        <path d="M4 22 L10 19 L17 23 L24 19 L30 22 L17 29 Z"/>
        <rect x="36" y="16" width="5" height="22"/>
        <polygon points="38.5,4 45,16 32,16"/>
      </svg>`;

const GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

// The language menu: a native <details>, because the site runs no script. It
// is not an <a>, so the phone breakpoint that hides the text links in .nav
// leaves it visible. Every entry is the SAME page in that language; following
// one from inside the site carries a same-origin Referer, which is what tells
// functions/_middleware.js not to redirect the visitor back.
const langMenu = (lang, page) => {
  const items = LANGS.filter(l => S[l]).map(l => {
    const cur = l === lang ? ' aria-current="true"' : '';
    return `          <li><a href="${href(l, page)}" hreflang="${l}" lang="${l}"${cur}>${S[l].name}</a></li>`;
  }).join('\n');
  return `<details class="lang">
        <summary>${GLOBE}<span aria-hidden="true">${lang.toUpperCase()}</span><span class="sr-only">${S[lang].menu.label}: ${S[lang].name}</span></summary>
        <ul>
${items}
        </ul>
      </details>`;
};

// current: 'home' | 'privacy' | 'support' | 'terms' | null. page: this page's
// own slug, for the language menu. On Home the Privacy link is the on-page
// section, as it always was; elsewhere it is the policy.
const header = ({ lang, current, page }) => {
  const n = S[lang].nav;
  const home = href(lang, '');
  const onHome = current === 'home';
  const cur = (k) => (current === k ? ' aria-current="page"' : '');
  return `<header class="site-header">
  <div class="wrap">
    <a class="brand" href="${home}" aria-label="${attr(S[lang].brandLabel)}">
      ${MARK}
      Stack'd <small>Development Studio</small>
    </a>
    <nav class="nav" aria-label="${attr(n.label)}">
      <a href="${onHome ? '' : home}#app">${n.app}</a>
      <a href="${onHome ? '#privacy' : href(lang, 'privacy')}"${cur('privacy')}>${n.privacy}</a>
      <a href="${onHome ? '' : home}#studio">${n.studio}</a>
      <a href="${href(lang, 'support')}"${cur('support')}>${n.support}</a>
      ${langMenu(lang, page)}
      <a class="btn btn-primary btn-sm" href="${playUrl(lang)}">${n.get}</a>
    </nav>
  </div>
</header>`;
};

const footer = ({ lang, trademark = false }) => {
  const f = S[lang].footer;
  return `<footer class="site-footer">
  <div class="wrap">
    <span>© 2026 Stack'd Development Studio</span>
    <nav aria-label="${attr(f.label)}">
      <a href="${href(lang, 'privacy')}">${f.privacy}</a>
      <a href="${href(lang, 'terms')}">${f.terms}</a>
      <a href="${href(lang, 'support')}">${f.support}</a>
      <!--email_off--><a href="mailto:${CONTACT}">${f.contact}</a><!--/email_off-->
    </nav>${trademark ? `\n    <span class="legal">${f.trademark}</span>` : ''}
  </div>
</footer>`;
};

// Writes a file under the site root, creating its folder.
const write = (rel, html) => {
  const out = path.join(SITE, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return rel;
};

module.exports = {
  APP, SITE, ORIGIN, LANGS, CONTACT, S,
  href, urlFor, playUrl, attr, fill, head, header, footer, langMenu, write
};
