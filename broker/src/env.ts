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
  // Per-IP limits (unauthenticated) and per-owner limit (authenticated).
  mintPerHour: number;
  institutionsPerMinute: number;
  ownerPerHour: number;
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
    mintPerHour: 10,
    institutionsPerMinute: 120,
    ownerPerHour: 600
  };
}

// Sessions live at the aggregator for `valid_until`; the broker keeps them
// for this long after a subscription lapses, then revokes (D-C3).
export const GRACE_MS = 14 * 24 * 60 * 60 * 1000;
