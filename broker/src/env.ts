// Worker bindings + parsed configuration. Secrets come from `wrangler secret
// put`; everything else from [vars] in wrangler.toml.
export interface Env {
  OWNER_DO: DurableObjectNamespace;
  SYSTEM_DO: DurableObjectNamespace;
  RATE_DO: DurableObjectNamespace;

  // Enable Banking application (docs/bank-connect-ux-plan.md §11):
  // EB_APP_ID is the application UUID (a [vars] value, not secret);
  // EB_PRIVATE_KEY is the PEM the Control Panel downloaded (wrangler secret;
  // PKCS#8 or PKCS#1, or the base64 of the PEM).
  EB_APP_ID: string;
  EB_PRIVATE_KEY: string;
  EB_BASE_URL: string;

  // Store receipt verification (v1.09 B5, UX plan §14). Secrets:
  // PLAY_SERVICE_ACCOUNT_JSON (the service-account key file, whole JSON) and
  // APPLE_PRIVATE_KEY (the App Store Connect API .p8 PEM). Vars: the rest.
  PLAY_PACKAGE_NAME?: string;
  PLAY_SERVICE_ACCOUNT_JSON?: string;
  PLAY_API_URL?: string;
  GOOGLE_TOKEN_URL?: string;
  APPLE_BUNDLE_ID?: string;
  APPLE_ISSUER_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_API_URL?: string;
  APPLE_SANDBOX_API_URL?: string;
  PRODUCT_IDS?: string; // comma list of the store product ids (one product, monthly + yearly)

  // v1.16 A-11 (monitoring). Both optional and both SECRETS:
  // ALERT_WEBHOOK_URL is where a fault is posted (any JSON webhook — an
  // email relay, Slack, ntfy); with it unset nothing is sent and the cron
  // just keeps counters. OPS_TOKEN guards /v1/ops/status; unset means the
  // endpoint does not exist.
  ALERT_WEBHOOK_URL?: string;
  OPS_TOKEN?: string;

  ENTITLEMENT_MODE: string; // 'open' (staging only) | 'store'
  CLIENT_ID: string;
  MAX_CONNECTIONS: string;
  OWNER_MAX_CONNECTIONS: string;
  ALLOWED_ORIGINS: string;
  APP_SCHEME: string;
  ANDROID_PACKAGE: string;
  ANDROID_SHA256_FINGERPRINTS: string;
  IOS_APP_ID: string;
  PUBLIC_URL: string;
  // v1.11 B7 (UX plan §16): where the web build lives. A connect flow that
  // started from a web session returns here (+ '#bank-connect') instead of
  // the stackd:// hand-off page. Empty = no web return (page as before).
  PUBLIC_WEB_URL?: string;
}

export interface Config {
  mode: 'open' | 'store';
  clientId: string;
  maxConnections: number;
  ownerMaxConnections: number;
  allowedOrigins: string[];
  ebBaseUrl: string;
  appScheme: string;
  androidPackage: string;
  androidFingerprints: string[];
  iosAppId: string;
  publicUrl: string;
  publicWebUrl: string;
  // Web sessions + pairing (v1.11 B7, D-C19: 90 days sliding)
  sessionMaxAgeMs: number;
  pairCodeTtlMs: number;
  pairPerHour: number;   // codes per owner
  claimPerHour: number;  // claim attempts per IP
  // Per-IP limits (unauthenticated) and per-owner limit (authenticated).
  mintPerHour: number;
  institutionsPerMinute: number;
  ownerPerHour: number;
  // Store verification (B5)
  productIds: string[];
  playPackage: string;
  playApiUrl: string;
  googleTokenUrl: string;
  appleBundleId: string;
  appleIssuerId: string;
  appleKeyId: string;
  appleApiUrl: string;
  appleSandboxApiUrl: string;
  // Re-verify a stored entitlement with the store when it is this close to
  // expiry (or lapsed), at most once per `recheckMinIntervalMs`.
  recheckWithinMs: number;
  recheckMinIntervalMs: number;
  // v1.16 A-11: how many of a fault in one hour is worth waking someone for,
  // and how long the same condition stays quiet once reported.
  alertThresholds: Record<string, number>;
  alertRepeatMs: number;
  counterKeepMs: number;
}

const list = (s: string | undefined): string[] =>
  String(s || '').split(',').map(x => x.trim()).filter(Boolean);

const int = (s: string | undefined, fallback: number): number => {
  const n = parseInt(String(s ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function parseConfig(env: Env): Config {
  // "open" is a staging convenience only. The production host can never run
  // it, whatever [vars] say — the check is on the public hostname so a
  // mis-edited wrangler.toml cannot switch entitlement off for real users.
  const onProductionHost = /(^|\/\/)api\.stackdplatform\.com/i.test(env.PUBLIC_URL || '');
  const mode = env.ENTITLEMENT_MODE === 'open' && !onProductionHost ? 'open' : 'store';
  return {
    mode,
    clientId: env.CLIENT_ID || 'stackd-web',
    maxConnections: int(env.MAX_CONNECTIONS, 50),
    ownerMaxConnections: int(env.OWNER_MAX_CONNECTIONS, 3),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    ebBaseUrl: (env.EB_BASE_URL || 'https://api.enablebanking.com').replace(/\/$/, ''),
    appScheme: env.APP_SCHEME || 'stackd',
    androidPackage: env.ANDROID_PACKAGE || 'com.stackd.finance',
    androidFingerprints: list(env.ANDROID_SHA256_FINGERPRINTS),
    iosAppId: env.IOS_APP_ID || '',
    publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
    publicWebUrl: (env.PUBLIC_WEB_URL || '').replace(/\/$/, ''),
    sessionMaxAgeMs: 90 * 24 * 60 * 60 * 1000,
    pairCodeTtlMs: 5 * 60 * 1000,
    pairPerHour: 5,
    claimPerHour: 10,
    mintPerHour: 10,
    institutionsPerMinute: 120,
    ownerPerHour: 600,
    productIds: list(env.PRODUCT_IDS),
    playPackage: env.PLAY_PACKAGE_NAME || '',
    playApiUrl: (env.PLAY_API_URL || 'https://androidpublisher.googleapis.com').replace(/\/$/, ''),
    googleTokenUrl: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    appleBundleId: env.APPLE_BUNDLE_ID || '',
    appleIssuerId: env.APPLE_ISSUER_ID || '',
    appleKeyId: env.APPLE_KEY_ID || '',
    appleApiUrl: (env.APPLE_API_URL || 'https://api.storekit.itunes.apple.com').replace(/\/$/, ''),
    appleSandboxApiUrl: (env.APPLE_SANDBOX_API_URL === undefined ? 'https://api.storekit-sandbox.itunes.apple.com' : env.APPLE_SANDBOX_API_URL).replace(/\/$/, ''),
    recheckWithinMs: 24 * 60 * 60 * 1000,
    recheckMinIntervalMs: 6 * 60 * 60 * 1000,
    // Deliberately low for the auth failures: a wrong or expired aggregator
    // key breaks every bank connect, and a broken store key rejects purchases
    // the store has already charged for. Both are total, not degraded.
    alertThresholds: {
      aggregator_auth_failed: 3,
      aggregator_key_invalid: 1,
      aggregator_not_configured: 1,
      store_auth_failed: 3,
      store_not_configured: 1,
      store_key_invalid: 1,
      internal: 10
    },
    alertRepeatMs: 6 * 60 * 60 * 1000,
    counterKeepMs: 48 * 60 * 60 * 1000
  };
}

// Sessions live at the aggregator for `valid_until`; the broker keeps them
// for this long after a subscription lapses, then revokes (D-C3).
export const GRACE_MS = 14 * 24 * 60 * 60 * 1000;
