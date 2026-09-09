import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// @ts-expect-error - plain ESM script, deliberately dependency-free
import { parseVars, checkProduction, readAppFacts, REQUIRED_VARS, REQUIRED_SECRETS } from '../scripts/preflight.mjs';

// v1.15, docs/launch-plan.md A-09. npm runs the preflight before
// `deploy:production`, so these cases are the difference between a
// half-configured worker being caught and it going live and failing silently:
// an empty EB_APP_ID answers 503 on the first connect, missing store keys
// reject purchases the store has already charged for, empty App-Link
// fingerprints push every bank return onto the fallback path, and a missing
// WebView origin fails CORS on every native request at once.

// A production config with everything filled in, used as the baseline that
// each case then breaks in exactly one way.
const GOOD = {
  ENTITLEMENT_MODE: 'store',
  CLIENT_ID: 'stackd-web',
  ALLOWED_ORIGINS: 'https://app.stackdplatform.com,https://localhost,capacitor://localhost',
  EB_BASE_URL: 'https://api.enablebanking.com',
  EB_APP_ID: '463906ef-6530-486f-ba80-4f4e644fac1a',
  APP_SCHEME: 'stackd',
  ANDROID_PACKAGE: 'com.stackd.finance',
  ANDROID_SHA256_FINGERPRINTS:
    '2A:40:17:71:FF:EC:81:15:03:21:AD:37:B3:AE:8A:22:CB:65:00:BE:DB:77:7B:FF:31:66:01:AA:57:6E:8D:56,' +
    '11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00',
  IOS_APP_ID: 'ABCDE12345.com.stackd.finance',
  PUBLIC_URL: 'https://api.stackdplatform.com',
  PUBLIC_WEB_URL: 'https://app.stackdplatform.com',
  PRODUCT_IDS: 'stackd_bank_connect_monthly,stackd_bank_connect_yearly',
  PLAY_PACKAGE_NAME: 'com.stackd.finance',
  APPLE_BUNDLE_ID: 'com.stackd.finance',
  APPLE_ISSUER_ID: '69a6de70-1111-2222-3333-444455556666',
  APPLE_KEY_ID: 'ABC123DEFG'
};

const APP = {
  appId: 'com.stackd.finance',
  applicationId: 'com.stackd.finance',
  subscriptionIds: ['stackd_bank_connect_monthly', 'stackd_bank_connect_yearly'],
  proId: 'stackd_pro'
};

const check = (over: Record<string, unknown> = {}, app = APP, secrets: string[] | null = null) =>
  checkProduction({ ...GOOD, ...over }, app, secrets);

describe('broker production preflight (A-09)', () => {
  it('passes a fully configured production environment', () => {
    const { errors, warnings } = check();
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('blocks on every required var being empty, naming each one', () => {
    const blank: Record<string, string> = {};
    for (const k of REQUIRED_VARS) blank[k] = '';
    const { errors } = check(blank);
    for (const k of REQUIRED_VARS) {
      expect(errors.some((e: string) => e.startsWith(k + ' is empty'))).toBe(true);
    }
  });

  it('refuses open entitlement mode in production', () => {
    expect(check({ ENTITLEMENT_MODE: 'open' }).errors.join()).toMatch(/must be "store"/);
  });

  it('refuses a staging host in the production environment', () => {
    const { errors } = check({ PUBLIC_URL: 'https://api-staging.stackdplatform.com' });
    expect(errors.join()).toMatch(/expected https:\/\/api\.stackdplatform\.com/);
    expect(errors.join()).toMatch(/points at staging/);
  });

  it('catches a missing Capacitor WebView origin — the whole native app would fail CORS', () => {
    const { errors } = check({ ALLOWED_ORIGINS: 'https://app.stackdplatform.com' });
    expect(errors.join()).toMatch(/https:\/\/localhost/);
    expect(errors.join()).toMatch(/capacitor:\/\/localhost/);
  });

  it('validates the iOS app id shape and its agreement with the bundle id', () => {
    expect(check({ IOS_APP_ID: 'com.stackd.finance' }).errors.join()).toMatch(/TEAMID\.bundleid/);
    expect(check({ IOS_APP_ID: 'ABCDE12345.com.other.app' }).errors.join()).toMatch(/does not match APPLE_BUNDLE_ID/);
  });

  it('rejects a fingerprint that is not a colon-separated SHA-256', () => {
    // A SHA-1 fingerprint is the classic paste error and is 20 bytes, not 32.
    const sha1 = '2A:40:17:71:FF:EC:81:15:03:21:AD:37:B3:AE:8A:22:CB:65:00:BE';
    expect(check({ ANDROID_SHA256_FINGERPRINTS: sha1 }).errors.join()).toMatch(/not colon-separated SHA-256/);
  });

  it('warns when only one signing certificate is listed', () => {
    const one = GOOD.ANDROID_SHA256_FINGERPRINTS.split(',')[0];
    const { errors, warnings } = check({ ANDROID_SHA256_FINGERPRINTS: one });
    expect(errors).toEqual([]);
    expect(warnings.join()).toMatch(/Play App Signing usually means TWO/);
  });

  it('catches identity drift between the app and the broker', () => {
    expect(check({ ANDROID_PACKAGE: 'com.stackd.app' }).errors.join()).toMatch(/!= the app's applicationId/);
    expect(check({ PLAY_PACKAGE_NAME: 'com.stackd.app' }).errors.join()).toMatch(/!= the app's applicationId/);
    expect(check({ APPLE_BUNDLE_ID: 'com.stackd.app' }).errors.join()).toMatch(/capacitor\.config\.json appId/);
  });

  it('catches a subscription id the app sends but the broker would not accept', () => {
    const { errors } = check({ PRODUCT_IDS: 'stackd_bank_connect_monthly' });
    expect(errors.join()).toMatch(/missing the app's subscription id\(s\): stackd_bank_connect_yearly/);
  });

  it("refuses Stack'd Pro in PRODUCT_IDS — its receipts must never reach the broker", () => {
    const { errors } = check({ PRODUCT_IDS: GOOD.PRODUCT_IDS + ',stackd_pro' });
    expect(errors.join()).toMatch(/LOCAL entitlement/);
  });

  it('reports missing secrets only when they were actually checked', () => {
    expect(check({}, APP, null).errors).toEqual([]); // not checked, not claimed
    const { errors } = check({}, APP, ['EB_PRIVATE_KEY']);
    expect(errors.join()).toMatch(/PLAY_SERVICE_ACCOUNT_JSON is not set/);
    expect(errors.join()).toMatch(/APPLE_PRIVATE_KEY is not set/);
    expect(check({}, APP, REQUIRED_SECRETS).errors).toEqual([]);
  });

  describe('against the real files', () => {
    const toml = readFileSync(resolve(__dirname, '../wrangler.toml'), 'utf8');

    it('reads the production table, and strips inline comments', () => {
      const vars = parseVars(toml, 'env.production.vars');
      expect(vars.ENTITLEMENT_MODE).toBe('store');
      expect(vars.PUBLIC_URL).toBe('https://api.stackdplatform.com');
      // EB_APP_ID carries a trailing `# comment` in the file.
      expect(vars.EB_APP_ID).not.toMatch(/#/);
    });

    it('keeps staging and production apart', () => {
      const staging = parseVars(toml, 'vars');
      expect(staging.ENTITLEMENT_MODE).toBe('open');
      expect(staging.PUBLIC_URL).toMatch(/api-staging/);
      // The guard exists because open mode on the production host would
      // entitle every caller; env.ts refuses it too, at runtime.
      expect(checkProduction(staging, APP).errors.join()).toMatch(/must be "store"/);
    });

    it('the shipped production config still has the known gaps, and says which', () => {
      const { errors } = checkProduction(parseVars(toml, 'env.production.vars'), readAppFacts(resolve(__dirname, '../..')));
      // Not yet deployable — that is the point of O-28, and this test is the
      // canary if someone fills these in without telling anyone.
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join()).toMatch(/EB_APP_ID is empty/);
    });

    it('reads identity out of the app repo rather than trusting a copy', () => {
      const app = readAppFacts(resolve(__dirname, '../..'));
      expect(app.applicationId).toBe('com.stackd.finance');
      expect(app.appId).toBe('com.stackd.finance');
      expect(app.subscriptionIds).toEqual(['stackd_bank_connect_monthly', 'stackd_bank_connect_yearly']);
      expect(app.proId).toBe('stackd_pro');
    });
  });
});
