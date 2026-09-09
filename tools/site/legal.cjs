// Generates the marketing site's translated legal pages (v1.16, launch-plan A-13).
//
//   node tools/site/legal.cjs
//
// Writes ../../../StackdSite/<lang>/{privacy,terms}.html for fr, it, es, pt.
//
// The clause TEXT comes from the app's own dictionaries (src/i18n/<lang>.js)
// and the clause ORDER from Components.TERMS_IDS / PRIVACY_IDS, so the public
// pages cannot say something different from the app — which is the whole risk
// with a second copy of a legal document. English stays hand-written at the
// site root, because /privacy and /terms are the URLs in both store listings
// and they carry site-specific structure; this script checks it has not
// drifted from the dictionary and says so.
//
// Only the page furniture (nav, footer, lede, and the one website-specific
// privacy clause, which has no in-app equivalent because the app is not a
// website) lives in the table below.
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '../..');
const SITE = path.resolve(APP, '../StackdSite');
const ORIGIN = 'https://stackdplatform.com';
const LANGS = ['fr', 'it', 'es', 'pt'];
const ALL = ['en', ...LANGS];

// ── Load the app's dictionaries the way index.html does ────────────────────
const win = { I18n: null };
const run = (rel) => {
  const code = fs.readFileSync(path.join(APP, 'src', rel), 'utf8');
  new Function('window', 'localStorage', 'crypto', code)(win, {}, {});
};
run('i18n.js');
ALL.forEach(l => run(`i18n/${l}.js`));
const dict = (lang) => win.I18n.dicts[lang];

// Clause order is a single source too: parse it out of components.js rather
// than keeping a second list here that could fall behind.
const components = fs.readFileSync(path.join(APP, 'src/components.js'), 'utf8');
const idsOf = (name) => {
  const m = new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`).exec(components);
  if (!m) throw new Error(`could not find ${name} in components.js`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};
const TERMS_IDS = idsOf('TERMS_IDS');
const PRIVACY_IDS = idsOf('PRIVACY_IDS');

// ── Page furniture, per language ───────────────────────────────────────────
// The website clause has no dictionary key on purpose: the app is not a
// website and must not carry a clause about one.
const UI = {
  en: {
    nav: { app: 'The app', privacy: 'Privacy', studio: 'Studio', support: 'Support', get: 'Get the app' },
    footer: { privacy: 'Privacy Policy', terms: 'Terms of Use', support: 'Support', contact: 'Contact' },
    termsTitle: 'Terms of Use', privacyTitle: 'Privacy Policy',
    seeTerms: 'See also the Terms of Use', seePrivacy: 'See also the Privacy Policy',
    otherLangs: 'Other languages',
    website: { h: 'This website', d: 'This website is a set of static pages. It sets no cookies, runs no analytics and embeds no third-party scripts. Our hosting provider may keep standard, short-lived server logs (such as IP address and requested page) for security and capacity purposes, as any web host does.' },
    metaTerms: "The terms under which Stack'd, the privacy-first personal finance tracker, is licensed to you.",
    metaPrivacy: "Stack'd keeps your money on your phone. The only exception is Bank Connect, an optional feature you turn on yourself; this policy explains exactly what it sends and what is kept."
  },
  fr: {
    nav: { app: "L'application", privacy: 'Confidentialité', studio: 'Le studio', support: 'Assistance', get: "Télécharger" },
    footer: { privacy: 'Politique de confidentialité', terms: "Conditions d'utilisation", support: 'Assistance', contact: 'Contact' },
    termsTitle: "Conditions d'utilisation", privacyTitle: 'Politique de confidentialité',
    seeTerms: "Voir aussi les Conditions d'utilisation", seePrivacy: 'Voir aussi la Politique de confidentialité',
    otherLangs: 'Autres langues',
    website: { h: 'Ce site web', d: "Ce site web est un ensemble de pages statiques. Il ne dépose aucun cookie, n'exécute aucune analyse d'audience et n'intègre aucun script tiers. Notre hébergeur peut conserver des journaux serveur standard et de courte durée (adresse IP, page demandée), comme tout hébergeur." },
    metaTerms: "Les conditions sous lesquelles Stack'd, le gestionnaire de finances personnelles axé sur la confidentialité, vous est concédé.",
    metaPrivacy: "Stack'd garde votre argent sur votre téléphone. La seule exception est Bank Connect, une fonctionnalité facultative que vous activez vous-même ; cette politique explique exactement ce qui est transmis et ce qui est conservé."
  },
  it: {
    nav: { app: "L'app", privacy: 'Privacy', studio: 'Lo studio', support: 'Assistenza', get: "Scarica l'app" },
    footer: { privacy: 'Informativa sulla privacy', terms: 'Termini di utilizzo', support: 'Assistenza', contact: 'Contatti' },
    termsTitle: 'Termini di utilizzo', privacyTitle: 'Informativa sulla privacy',
    seeTerms: 'Vedi anche i Termini di utilizzo', seePrivacy: "Vedi anche l'Informativa sulla privacy",
    otherLangs: 'Altre lingue',
    website: { h: 'Questo sito web', d: 'Questo sito è un insieme di pagine statiche. Non imposta cookie, non esegue analisi e non incorpora script di terze parti. Il nostro fornitore di hosting può conservare log del server standard e di breve durata (indirizzo IP, pagina richiesta), come qualsiasi host.' },
    metaTerms: "I termini con cui ti viene concesso Stack'd, il gestore di finanze personali che mette la privacy al primo posto.",
    metaPrivacy: "Stack'd tiene i tuoi soldi sul telefono. L'unica eccezione è Bank Connect, una funzione facoltativa che attivi tu; questa informativa spiega esattamente cosa viene inviato e cosa viene conservato."
  },
  es: {
    nav: { app: 'La app', privacy: 'Privacidad', studio: 'El estudio', support: 'Soporte', get: 'Descargar' },
    footer: { privacy: 'Política de privacidad', terms: 'Términos de uso', support: 'Soporte', contact: 'Contacto' },
    termsTitle: 'Términos de uso', privacyTitle: 'Política de privacidad',
    seeTerms: 'Consulta también los Términos de uso', seePrivacy: 'Consulta también la Política de privacidad',
    otherLangs: 'Otros idiomas',
    website: { h: 'Este sitio web', d: 'Este sitio web es un conjunto de páginas estáticas. No usa cookies, no ejecuta analíticas ni incrusta scripts de terceros. Nuestro proveedor de alojamiento puede conservar registros de servidor estándar y de corta duración (dirección IP, página solicitada), como cualquier alojamiento web.' },
    metaTerms: "Los términos bajo los que se te licencia Stack'd, el gestor de finanzas personales centrado en la privacidad.",
    metaPrivacy: "Stack'd guarda tu dinero en tu teléfono. La única excepción es Bank Connect, una función opcional que activas tú; esta política explica exactamente qué se envía y qué se conserva."
  },
  pt: {
    nav: { app: 'A app', privacy: 'Privacidade', studio: 'O estúdio', support: 'Apoio', get: 'Obter a app' },
    footer: { privacy: 'Política de privacidade', terms: 'Termos de utilização', support: 'Apoio', contact: 'Contacto' },
    termsTitle: 'Termos de utilização', privacyTitle: 'Política de privacidade',
    seeTerms: 'Ver também os Termos de utilização', seePrivacy: 'Ver também a Política de privacidade',
    otherLangs: 'Outros idiomas',
    website: { h: 'Este site', d: 'Este site é um conjunto de páginas estáticas. Não usa cookies, não executa análises nem incorpora scripts de terceiros. O nosso fornecedor de alojamento pode manter registos de servidor normais e de curta duração (endereço IP, página pedida), como qualquer alojamento web.' },
    metaTerms: "Os termos ao abrigo dos quais lhe é licenciado o Stack'd, o gestor de finanças pessoais que põe a privacidade em primeiro lugar.",
    metaPrivacy: "O Stack'd guarda o seu dinheiro no seu telemóvel. A única exceção é o Bank Connect, uma funcionalidade opcional que ativa por si; esta política explica exatamente o que é enviado e o que é conservado."
  }
};

const LANG_NAME = { en: 'English', fr: 'Français', it: 'Italiano', es: 'Español', pt: 'Português' };

// ── HTML ───────────────────────────────────────────────────────────────────
const urlFor = (lang, page) => (lang === 'en' ? `${ORIGIN}/${page}` : `${ORIGIN}/${lang}/${page}`);
const hrefFor = (lang, page) => (lang === 'en' ? `../${page}.html` : `../${lang}/${page}.html`);

const MARK = '<!-- Generated by tools/site/legal.cjs in the app repo from src/i18n/*.js. Do not hand-edit: run the script. -->';

const page = ({ lang, kind, ids, prefix, title, meta, seeOther, otherPage }) => {
  // The dictionaries carry the contact address as PLAIN TEXT, because in the
  // app it is just words. On this site it must be a mailto wrapped in the
  // email_off markers, or Cloudflare's Email Address Obfuscation rewrites it
  // and the site's own CSP (script-src 'none') blocks the decoder — which is
  // exactly how the English page came to render "[email protected]" in the
  // sentence telling people how to request deletion.
  const CONTACT = 'hi@stackdplatform.com';
  const linkify = (html) => html.split(CONTACT).join(
    `<!--email_off--><a href="mailto:${CONTACT}">${CONTACT}</a><!--/email_off-->`
  );
  const t = (k) => {
    const v = dict(lang)[k];
    if (v === undefined) throw new Error(`${lang}: missing key ${k}`);
    return linkify(v);
  };
  const ui = UI[lang];
  const clauses = ids.map(id => `        <li>
          <h3>${t(`terms.${prefix}.${id}.h`)}</h3>
          <p>${t(`terms.${prefix}.${id}.d`)}</p>
        </li>`);

  // The website clause exists only on the site, and only in the privacy page.
  if (kind === 'privacy') {
    const at = ids.indexOf('contact');
    const li = `        <li>
          <h3>${ui.website.h}</h3>
          <p>${ui.website.d}</p>
        </li>`;
    clauses.splice(at === -1 ? clauses.length : at, 0, li);
  }

  const alternates = ALL.map(l =>
    `  <link rel="alternate" hreflang="${l}" href="${urlFor(l, kind)}">`
  ).concat(`  <link rel="alternate" hreflang="x-default" href="${urlFor('en', kind)}">`).join('\n');

  const switcher = ALL.filter(l => l !== lang)
    .map(l => `<a href="${hrefFor(l, kind)}" hreflang="${l}">${LANG_NAME[l]}</a>`).join(' · ');

  return `<!DOCTYPE html>
<html lang="${lang}">
${MARK}
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Stack'd</title>
  <meta name="description" content="${meta}">
  <link rel="canonical" href="${urlFor(lang, kind)}">
${alternates}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Stack'd Development Studio">
  <meta property="og:url" content="${urlFor(lang, kind)}">
  <meta property="og:title" content="${title} · Stack'd">
  <meta property="og:description" content="${meta}">
  <meta property="og:image" content="${ORIGIN}/img/og.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#f4f7f9" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0b0f19" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="../img/icon-512.webp" type="image/webp">
  <link rel="apple-touch-icon" href="../img/icon.png">
  <link rel="stylesheet" href="../styles.css">
</head>
<body>

<header class="site-header">
  <div class="wrap">
    <a class="brand" href="../" aria-label="Stack'd Development Studio">
      <svg class="mark" viewBox="0 0 48 48" aria-hidden="true" fill="currentColor">
        <polygon points="17,6 28,12 17,18 6,12"/>
        <path d="M6 17 L11 14.5 L17 18 L23 14.5 L28 17 L17 23 Z"/>
        <path d="M4 22 L10 19 L17 23 L24 19 L30 22 L17 29 Z"/>
        <rect x="36" y="16" width="5" height="22"/>
        <polygon points="38.5,4 45,16 32,16"/>
      </svg>
      Stack'd <small>Development Studio</small>
    </a>
    <nav class="nav" aria-label="Site">
      <a href="../#app">${ui.nav.app}</a>
      <a href="privacy.html"${kind === 'privacy' ? ' aria-current="page"' : ''}>${ui.nav.privacy}</a>
      <a href="../#studio">${ui.nav.studio}</a>
      <a href="../support.html">${ui.nav.support}</a>
      <a class="btn btn-primary btn-sm" href="https://play.google.com/store/apps/details?id=com.stackd.finance">${ui.nav.get}</a>
    </nav>
  </div>
</header>

<main class="doc">
  <div class="wrap">
    <div class="doc-head">
      <p class="eyebrow">Stack'd · ${title}</p>
      <h1>${title}</h1>
      <p class="lede">${t('terms.intro')}</p>
      <p class="meta">${t('terms.lastUpdated').replace('{date}', t('terms.updatedDate'))} · <a href="${otherPage}">${seeOther}</a></p>
      <p class="meta">${ui.otherLangs}: ${switcher}</p>
    </div>

    <div class="doc-body">
      <ol class="clauses">
${clauses.join('\n')}
      </ol>
    </div>
  </div>
</main>

<footer class="site-footer">
  <div class="wrap">
    <span>© 2026 Stack'd Development Studio</span>
    <nav aria-label="Legal">
      <a href="privacy.html">${ui.footer.privacy}</a>
      <a href="terms.html">${ui.footer.terms}</a>
      <a href="../support.html">${ui.footer.support}</a>
      <!--email_off--><a href="mailto:hi@stackdplatform.com">${ui.footer.contact}</a><!--/email_off-->
    </nav>
  </div>
</footer>

</body>
</html>
`;
};

// ── Write ──────────────────────────────────────────────────────────────────
const written = [];
for (const lang of LANGS) {
  const dir = path.join(SITE, lang);
  fs.mkdirSync(dir, { recursive: true });
  const ui = UI[lang];

  fs.writeFileSync(path.join(dir, 'terms.html'), page({
    lang, kind: 'terms', ids: TERMS_IDS, prefix: 'use',
    title: ui.termsTitle, meta: ui.metaTerms, seeOther: ui.seePrivacy, otherPage: 'privacy.html'
  }));
  fs.writeFileSync(path.join(dir, 'privacy.html'), page({
    lang, kind: 'privacy', ids: PRIVACY_IDS, prefix: 'privacy',
    title: ui.privacyTitle, meta: ui.metaPrivacy, seeOther: ui.seeTerms, otherPage: 'terms.html'
  }));
  written.push(`${lang}/terms.html`, `${lang}/privacy.html`);
}

// ── Drift check on the hand-written English pages ──────────────────────────
// They stay hand-written (the store listings point at /privacy and /terms, and
// they carry site-specific structure), so this is the canary instead.
const warn = [];
// Half of privacy.html's clauses carry an id, for its on-page nav anchors.
const countClauses = (file) => (fs.readFileSync(path.join(SITE, file), 'utf8').match(/<li(?:\s[^>]*)?>\s*\n\s*<h3>/g) || []).length;
const enTerms = countClauses('terms.html');
const enPrivacy = countClauses('privacy.html');
if (enTerms !== TERMS_IDS.length) warn.push(`terms.html has ${enTerms} clauses, the app has ${TERMS_IDS.length}`);
if (enPrivacy !== PRIVACY_IDS.length + 1) warn.push(`privacy.html has ${enPrivacy} clauses, expected ${PRIVACY_IDS.length + 1} (app + the website clause)`);
const enDate = /Last updated: ([^<·]+)/.exec(fs.readFileSync(path.join(SITE, 'terms.html'), 'utf8'));
if (enDate && enDate[1].trim() !== dict('en')['terms.updatedDate']) {
  warn.push(`terms.html says "${enDate[1].trim()}", the app says "${dict('en')['terms.updatedDate']}"`);
}

console.log(`${written.length} pages written to ${SITE}`);
console.log(`  clauses: ${TERMS_IDS.length} terms, ${PRIVACY_IDS.length} privacy (+1 website-only)`);
if (warn.length) {
  console.log('\nEnglish pages look out of step with the app (they are hand-written):');
  for (const w of warn) console.log('  ! ' + w);
  process.exitCode = 1;
} else {
  console.log('  English root pages agree with the dictionaries.');
}
