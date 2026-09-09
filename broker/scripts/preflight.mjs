// Production deploy preflight (v1.15, docs/launch-plan.md A-09).
//
//   npm run preflight            # config only
//   npm run preflight -- --secrets   # also ask Cloudflare which secrets exist
//
// npm runs this automatically before `npm run deploy:production`, so a
// half-configured worker cannot reach api.stackdplatform.com. Everything it
// checks is something that fails SILENTLY in production rather than loudly:
// an empty EB_APP_ID answers 503 on the first bank connect, missing store
// keys reject every purchase while the store has already charged the user,
// empty App-Link fingerprints send every bank return down the fallback path,
// and a missing WebView origin fails CORS on every native request at once.
//
// It is deliberately dependency-free and does its own minimal TOML reading:
// it only needs one table of flat string values, and a parser dependency in
// the deploy path is a liability of its own.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BROKER = resolve(HERE, '..');
const APP = resolve(BROKER, '..');

export const PRODUCTION_HOST = 'https://api.stackdplatform.com';

// Origins the app actually calls from. Android serves the WebView from
// https://localhost and iOS from capacitor://localhost; the app sends custom
// headers, so every native request is preflighted and an origin missing here
// breaks Bank Connect on every phone at once.
export const REQUIRED_ORIGINS = ['https://localhost', 'capacitor://localhost'];

// Must be non-empty before production means anything.
export const REQUIRED_VARS = [
  'EB_APP_ID',                   // Enable Banking production application UUID
  'ANDROID_SHA256_FINGERPRINTS', // Play App Signing cert (NOT the upload key)
  'IOS_APP_ID',                  // TEAMID.com.stackd.finance
  'APPLE_ISSUER_ID',
  'APPLE_KEY_ID',
  'PRODUCT_IDS',
  'PLAY_PACKAGE_NAME',
  'APPLE_BUNDLE_ID',
  'PUBLIC_URL',
  'PUBLIC_WEB_URL',
  'ALLOWED_ORIGINS',
  'CLIENT_ID',
  'EB_BASE_URL',
  'APP_SCHEME',
  'ANDROID_PACKAGE'
];

export const REQUIRED_SECRETS = ['EB_PRIVATE_KEY', 'PLAY_SERVICE_ACCOUNT_JSON', 'APPLE_PRIVATE_KEY'];

// Reads one `[table]` of `KEY = "value"` lines. Comments after a value are
// stripped, which matters because wrangler.toml documents several vars inline.
export function parseVars(toml, table) {
  const lines = String(toml).split(/\r?\n/);
  const out = {};
  let inTable = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('[')) { inTable = line === `[${table}]`; continue; }
    if (!inTable || !line || line.startsWith('#')) continue;
    const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const q = value[0];
    if (q === '"' || q === "'") {
      const end = value.indexOf(q, 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
    } else {
      value = value.split('#')[0].trim();
    }
    out[m[1]] = value;
  }
  return out;
}

const isSha256Fingerprint = (s) => /^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/.test(s.trim());

// What the APP believes, so the two sides cannot drift apart unnoticed.
export function readAppFacts(appRoot = APP) {
  const read = (p) => { const f = resolve(appRoot, p); return existsSync(f) ? readFileSync(f, 'utf8') : null; };
  const facts = { appId: null, applicationId: null, subscriptionIds: [], proId: null };

  const cap = read('capacitor.config.json');
  if (cap) { try { facts.appId = JSON.parse(cap).appId || null; } catch { /* unreadable */ } }

  const gradle = read('android/app/build.gradle');
  const gm = gradle && /applicationId\s+"([^"]+)"/.exec(gradle);
  if (gm) facts.applicationId = gm[1];

  const bc = read('src/bank-connect.js');
  const pm = bc && /PRODUCTS:\s*\{([^}]*)\}/.exec(bc);
  if (pm) facts.subscriptionIds = [...pm[1].matchAll(/'([^']+)'/g)].map(x => x[1]);

  const pro = read('src/pro.js');
  const prm = pro && /PRODUCT_ID:\s*'([^']+)'/.exec(pro);
  if (prm) facts.proId = prm[1];

  return facts;
}

export function checkProduction(vars, app = {}, secrets = null) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  for (const key of REQUIRED_VARS) {
    if (!vars[key] || !String(vars[key]).trim()) {
      err(`${key} is empty. Production cannot work without it.`);
    }
  }

  if (vars.ENTITLEMENT_MODE !== 'store') {
    err(`ENTITLEMENT_MODE is "${vars.ENTITLEMENT_MODE}", must be "store". "open" entitles every caller.`);
  }
  if (vars.PUBLIC_URL && vars.PUBLIC_URL !== PRODUCTION_HOST) {
    err(`PUBLIC_URL is "${vars.PUBLIC_URL}", expected ${PRODUCTION_HOST}. The return URL sent to the bank is built from it.`);
  }
  if (vars.PUBLIC_URL && /staging/i.test(vars.PUBLIC_URL)) {
    err('PUBLIC_URL points at staging in the production environment.');
  }

  const origins = String(vars.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const needed of REQUIRED_ORIGINS) {
    if (!origins.includes(needed)) {
      err(`ALLOWED_ORIGINS is missing ${needed}. Native requests are preflighted and would all fail CORS.`);
    }
  }

  if (vars.IOS_APP_ID) {
    const m = /^([A-Z0-9]{10})\.(.+)$/.exec(vars.IOS_APP_ID.trim());
    if (!m) {
      err(`IOS_APP_ID "${vars.IOS_APP_ID}" is not TEAMID.bundleid (10-character team prefix).`);
    } else if (vars.APPLE_BUNDLE_ID && m[2] !== vars.APPLE_BUNDLE_ID) {
      err(`IOS_APP_ID bundle "${m[2]}" does not match APPLE_BUNDLE_ID "${vars.APPLE_BUNDLE_ID}".`);
    }
  }

  if (vars.ANDROID_SHA256_FINGERPRINTS) {
    const prints = vars.ANDROID_SHA256_FINGERPRINTS.split(',').map(s => s.trim()).filter(Boolean);
    const bad = prints.filter(p => !isSha256Fingerprint(p));
    if (bad.length) err(`ANDROID_SHA256_FINGERPRINTS has ${bad.length} entry/entries that are not colon-separated SHA-256: ${bad[0].slice(0, 24)}…`);
    if (prints.length === 1) {
      warn('ANDROID_SHA256_FINGERPRINTS lists one certificate. Play App Signing usually means TWO (the app signing key and the upload key) — check Play Console > Test and release > Setup > App signing.');
    }
  }

  // The app and the broker must agree on identity and on what is sold.
  if (app.applicationId && vars.ANDROID_PACKAGE && app.applicationId !== vars.ANDROID_PACKAGE) {
    err(`ANDROID_PACKAGE "${vars.ANDROID_PACKAGE}" != the app's applicationId "${app.applicationId}".`);
  }
  if (app.applicationId && vars.PLAY_PACKAGE_NAME && app.applicationId !== vars.PLAY_PACKAGE_NAME) {
    err(`PLAY_PACKAGE_NAME "${vars.PLAY_PACKAGE_NAME}" != the app's applicationId "${app.applicationId}".`);
  }
  if (app.appId && vars.APPLE_BUNDLE_ID && app.appId !== vars.APPLE_BUNDLE_ID) {
    err(`APPLE_BUNDLE_ID "${vars.APPLE_BUNDLE_ID}" != capacitor.config.json appId "${app.appId}".`);
  }

  const ids = String(vars.PRODUCT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (app.subscriptionIds && app.subscriptionIds.length) {
    const missing = app.subscriptionIds.filter(id => !ids.includes(id));
    if (missing.length) err(`PRODUCT_IDS is missing the app's subscription id(s): ${missing.join(', ')}.`);
    const extra = ids.filter(id => !app.subscriptionIds.includes(id));
    if (extra.length) warn(`PRODUCT_IDS carries id(s) the app never sends: ${extra.join(', ')}.`);
  }
  if (app.proId && ids.includes(app.proId)) {
    err(`PRODUCT_IDS contains "${app.proId}". Stack'd Pro is a LOCAL entitlement — its receipts must never reach the broker.`);
  }

  if (secrets) {
    for (const name of REQUIRED_SECRETS) {
      if (!secrets.includes(name)) err(`Secret ${name} is not set on the production worker (wrangler secret put ${name} --env production).`);
    }
  }

  return { errors, warnings };
}

// Best effort: needs `wrangler login` and the network. A failure here is a
// warning, never a pass — the caller is told the check did not run.
export function listSecrets(cwd = BROKER) {
  try {
    const out = execFileSync('npx', ['wrangler', 'secret', 'list', '--env', 'production'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    const json = out.slice(out.indexOf('['));
    return { ok: true, names: JSON.parse(json).map(s => s.name) };
  } catch (e) {
    return { ok: false, error: String(e.message || e).split('\n')[0] };
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('preflight.mjs')) {
  const wantSecrets = process.argv.includes('--secrets');
  const toml = readFileSync(resolve(BROKER, 'wrangler.toml'), 'utf8');
  const vars = parseVars(toml, 'env.production.vars');
  const app = readAppFacts();

  let secrets = null;
  let secretNote = 'secrets: not checked (pass --secrets)';
  if (wantSecrets) {
    const res = listSecrets();
    if (res.ok) { secrets = res.names; secretNote = `secrets: checked (${secrets.length} set)`; }
    else secretNote = `secrets: COULD NOT CHECK — ${res.error}`;
  }

  const { errors, warnings } = checkProduction(vars, app, secrets);

  console.log('Broker production preflight');
  console.log(`  worker host   ${vars.PUBLIC_URL || '(unset)'}`);
  console.log(`  entitlement   ${vars.ENTITLEMENT_MODE || '(unset)'}`);
  console.log(`  app identity  ${app.applicationId || '?'} / ${app.appId || '?'}`);
  console.log(`  ${secretNote}`);
  if (warnings.length) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log('  ! ' + w);
  }
  if (errors.length) {
    console.error(`\n${errors.length} problem(s) block a production deploy:`);
    for (const e of errors) console.error('  x ' + e);
    console.error('\nSee docs/launch-plan.md O-28 for who fills each value.');
    process.exit(1);
  }
  console.log('\nOK — production config is complete.');
  if (!wantSecrets) console.log('Run with --secrets to confirm the three secrets are set.');
}
