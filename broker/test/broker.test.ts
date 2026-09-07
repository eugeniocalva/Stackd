import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { createPrivateKey } from 'node:crypto';
import { createApp } from '../src/index';
import { EnableBanking, pemToPkcs8 } from '../src/enable-banking';
import { makeEnv, fakeEnableBanking, testKeys, testAppleKeys, fakeStores, type FakeEb, type TestKeys, type AppleTestKeys, type FakeStores } from './fakes';
import type { Env } from '../src/env';

const BASE = 'https://broker.test';

interface ReqOpts {
  method?: string;
  body?: unknown;
  token?: string | null;
  ip?: string;
  client?: string | null;
  headers?: Record<string, string>;
  cookie?: string; // v1.11 B7 web session
  csrf?: string;
}

let keys: TestKeys;
let appleKeys: AppleTestKeys;
let env: ReturnType<typeof makeEnv>;
let eb: FakeEb;
let stores: FakeStores;
let app: ReturnType<typeof createApp>;
let clock: number;

// One fetch for the aggregator AND the store hosts.
const combinedFetch = (input: string, init?: RequestInit) =>
  /^https:\/\/(google|play|apple|apple-sandbox)\.test/.test(input) ? stores.fetchImpl(input, init) : eb.fetchImpl(input, init);

const req = async (path: string, o: ReqOpts = {}) => {
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip || '203.0.113.1', 'user-agent': 'StackdTest/1.0', ...(o.headers || {}) };
  if (o.client !== null) headers['x-stackd-client'] = o.client || 'stackd-web';
  if (o.token) headers.authorization = `Bearer ${o.token}`;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.csrf) headers['x-stackd-csrf'] = o.csrf;
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  const res = await app.fetch(new Request(BASE + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }), env as unknown as Env);
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* html / empty */ }
  return { status: res.status, data, headers: res.headers };
};

const mint = async (ip = '203.0.113.1') => {
  const r = await req('/v1/entitlement/verify', { body: {}, ip });
  expect(r.status).toBe(201);
  return r.data.deviceToken as string;
};

const start = async (token: string, over: Record<string, unknown> = {}) =>
  req('/v1/connect/start', { token, body: { country: 'IT', institutionId: 'IT:Big Bank', historyDays: 90, validityDays: 180, ...over } });

// Simulates the bank sending the user back to the broker after consent.
const bankReturn = async (ref: string, extra = '') => {
  const code = [...eb.authorizations.values()].find(a => a.state === ref)!.code;
  return req(`/v1/connect/return?code=${code}&state=${ref}${extra}`, { client: null });
};

describe('Stack\'d broker (Enable Banking)', () => {
  beforeAll(async () => {
    keys = await testKeys();
    appleKeys = await testAppleKeys();
  });

  beforeEach(() => {
    env = makeEnv(keys, {}, appleKeys);
    eb = fakeEnableBanking(keys);
    stores = fakeStores(keys, appleKeys);
    clock = Date.parse('2026-09-07T10:00:00.000Z');
    EnableBanking.resetMemo();
    app = createApp({ fetch: combinedFetch, now: () => clock });
  });

  describe('edge rules', () => {
    it('serves /healthz and refuses /v1 without the client id', async () => {
      expect((await req('/healthz')).data).toEqual({ ok: true, mode: 'open', service: 'stackd-broker', aggregator: 'enablebanking' });
      expect((await req('/v1/institutions?country=IT', { client: null })).status).toBe(403);
      expect((await req('/v1/institutions?country=IT', { client: 'other' })).status).toBe(403);
      expect((await req('/nope')).status).toBe(404);
    });

    it('applies CORS only for allow-listed origins and answers preflights', async () => {
      const ok = await req('/healthz', { headers: { origin: 'http://localhost:3000' } });
      expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      const no = await req('/healthz', { headers: { origin: 'https://evil.example' } });
      expect(no.headers.get('access-control-allow-origin')).toBeNull();
      const pre = await req('/v1/connect/start', { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } });
      expect(pre.status).toBe(204);
      expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
    });

    it('serves the App Links / Universal Links files from config', async () => {
      const al = await req('/.well-known/assetlinks.json');
      expect(al.data[0].target).toEqual({ namespace: 'android_app', package_name: 'com.stackd.finance', sha256_cert_fingerprints: ['AA:BB'] });
      const aasa = await req('/.well-known/apple-app-site-association');
      expect(aasa.data.applinks.details[0]).toEqual({ appID: 'TEAM123.com.stackd.finance', paths: ['/v1/connect/return*'] });
    });

    it('pins owners to the EU jurisdiction, falling back only when the runtime lacks the feature', async () => {
      const { ownerNamespace } = await import('../src/durable-objects');
      const calls: string[] = [];
      const pinned = { jurisdiction: (j: string) => { calls.push(j); return 'pinned'; } };
      expect(ownerNamespace({ OWNER_DO: pinned } as unknown as Env)).toBe('pinned');
      expect(calls).toEqual(['eu']);
      const local = { jurisdiction: () => { throw new Error('Jurisdiction restrictions are not implemented in workerd.'); } };
      expect(ownerNamespace({ OWNER_DO: local } as unknown as Env)).toBe(local);
      const broken = { jurisdiction: () => { throw new Error('boom'); } };
      expect(() => ownerNamespace({ OWNER_DO: broken } as unknown as Env)).toThrow('boom');
    });

    it('never runs open entitlement on the production host', async () => {
      env = makeEnv(keys, { ENTITLEMENT_MODE: 'open', PUBLIC_URL: 'https://api.stackdplatform.com' });
      expect((await req('/healthz')).data.mode).toBe('store');
    });
  });

  describe('aggregator auth (JWT)', () => {
    it('signs an RS256 JWT the aggregator verifies, and reuses it across calls', async () => {
      await req('/v1/institutions?country=IT');
      await req('/v1/institutions?country=GB');
      expect(eb.jwtChecks).toBe(2);
      const tokens = new Set(eb.calls.map(c => c.headers.get('authorization')));
      expect(tokens.size).toBe(1); // memoised within its TTL
      clock += 59 * 60 * 1000; // inside the 5-minute renew window
      await req('/v1/institutions?country=IT');
      expect(new Set(eb.calls.map(c => c.headers.get('authorization'))).size).toBe(2);
    });

    it('accepts a PKCS#1 PEM and a base64-wrapped PEM', async () => {
      const pkcs1 = createPrivateKey(keys.privatePem).export({ type: 'pkcs1', format: 'pem' }) as string;
      expect(pkcs1).toContain('BEGIN RSA PRIVATE KEY');
      env = makeEnv(keys, { EB_PRIVATE_KEY: pkcs1 });
      EnableBanking.resetMemo();
      expect((await req('/v1/institutions?country=IT')).status).toBe(200);

      env = makeEnv(keys, { EB_PRIVATE_KEY: Buffer.from(keys.privatePem).toString('base64') });
      EnableBanking.resetMemo();
      expect((await req('/v1/institutions?country=IT')).status).toBe(200);

      // Same DER either way.
      expect(Buffer.from(pemToPkcs8(pkcs1))).toEqual(Buffer.from(pemToPkcs8(keys.privatePem)));
    });

    it('reports a rejected key as aggregator_auth_failed with shape-only diagnostics on staging', async () => {
      eb.rejectJwt = true;
      const r = await req('/v1/institutions?country=IT');
      expect(r.status).toBe(502);
      expect(r.data.error).toBe('aggregator_auth_failed');
      expect(r.data.diag).toMatchObject({ status: 401, appIdIsUuid: true, keyIsPem: true });
      expect(JSON.stringify(r.data)).not.toContain('PRIVATE KEY');
      env = makeEnv(keys, { ENTITLEMENT_MODE: 'store' });
      expect((await req('/v1/institutions?country=IT')).data).toEqual({ error: 'aggregator_auth_failed' });
    });

    it('is not configured without an app id / key', async () => {
      env = makeEnv(keys, { EB_PRIVATE_KEY: '' });
      EnableBanking.resetMemo();
      expect((await req('/v1/institutions?country=IT')).data).toEqual({ error: 'aggregator_not_configured' });
      env = makeEnv(keys, { EB_PRIVATE_KEY: 'not a key' });
      EnableBanking.resetMemo();
      expect((await req('/v1/institutions?country=IT')).data).toEqual({ error: 'aggregator_key_invalid' });
    });
  });

  describe('institutions', () => {
    it('maps the ASPSP list to the broker shape', async () => {
      const r = await req('/v1/institutions?country=it');
      expect(r.status).toBe(200);
      expect(r.data).toEqual([
        { id: 'IT:Mock ASPSP', name: 'Mock ASPSP', country: 'IT', logo: 'https://cdn.test/mock.png', bic: null, historyDays: 365, maxValidityDays: 90, beta: false, sandbox: true },
        { id: 'IT:Big Bank', name: 'Big Bank', country: 'IT', logo: 'https://cdn.test/big.png', bic: 'BIGBITMM', historyDays: 365, maxValidityDays: 180, beta: false, sandbox: false }
      ]);
      expect(eb.calls[0].path).toBe('/aspsps?country=IT&psu_type=personal');
    });

    it('validates the country and rate-limits per IP', async () => {
      expect((await req('/v1/institutions')).status).toBe(400);
      expect((await req('/v1/institutions?country=ITA')).status).toBe(400);
      for (let i = 0; i < 120; i++) await req('/v1/institutions?country=GB', { ip: '198.51.100.9' });
      expect((await req('/v1/institutions?country=GB', { ip: '198.51.100.9' })).status).toBe(429);
      expect((await req('/v1/institutions?country=GB', { ip: '198.51.100.10' })).status).toBe(200);
    });

    it('opens the circuit for 10 minutes on an aggregator-level 429', async () => {
      eb.global429 = true;
      expect((await req('/v1/institutions?country=IT')).data).toEqual({ error: 'aggregator_rate_limited' });
      eb.global429 = false;
      expect((await req('/v1/institutions?country=IT')).data).toEqual({ error: 'aggregator_paused' });
      clock += 11 * 60 * 1000;
      expect((await req('/v1/institutions?country=IT')).status).toBe(200);
    });
  });

  describe('entitlement/verify', () => {
    it('mints an owner + device token on first contact and is entitled in open mode', async () => {
      const r = await req('/v1/entitlement/verify', { body: {} });
      expect(r.status).toBe(201);
      expect(r.data.deviceToken).toMatch(/^[0-9a-f]{16}\.[0-9a-f]{64}$/);
      expect(r.data.ownerId).toBe(r.data.deviceToken.split('.')[0]);
      expect(r.data.active).toBe(true);
      const record = await env.owners.instance(r.data.ownerId).fetch(new Request('https://do/record')).then(x => x.json()) as any;
      expect(record.devices[0].hash).toHaveLength(64);
      expect(JSON.stringify(record)).not.toContain(r.data.deviceToken.split('.')[1]);
    });

    it('re-verifies an existing device without minting again, and rejects a forged token', async () => {
      const token = await mint();
      const again = await req('/v1/entitlement/verify', { body: {}, token });
      expect(again.status).toBe(200);
      expect(again.data.deviceToken).toBeUndefined();
      const forged = token.slice(0, -4) + 'ffff';
      expect((await req('/v1/entitlement/verify', { body: {}, token: forged })).status).toBe(401);
    });

    it('rate-limits token minting per IP', async () => {
      for (let i = 0; i < 10; i++) await mint('192.0.2.7');
      expect((await req('/v1/entitlement/verify', { body: {}, ip: '192.0.2.7' })).status).toBe(429);
    });

    it('store mode: not entitled by default; a bogus receipt is refused', async () => {
      env = makeEnv(keys, { ENTITLEMENT_MODE: 'store' }, appleKeys);
      const r = await req('/v1/entitlement/verify', { body: {} });
      expect(r.status).toBe(201);
      expect(r.data.active).toBe(false);
      expect((await req('/v1/entitlement/verify', { body: { platform: 'play', purchaseToken: 'nope' }, token: r.data.deviceToken })).data).toEqual({ error: 'receipt_invalid' });
      expect((await req('/v1/entitlement/verify', { body: { platform: 'appstore', originalTransactionId: '999' }, token: r.data.deviceToken })).data).toEqual({ error: 'receipt_invalid' });
      expect((await req('/v1/entitlement/verify', { body: { platform: 'steam', purchaseToken: 'x' }, token: r.data.deviceToken })).data).toEqual({ error: 'platform_unknown' });
    });
  });

  // v1.09 B5 (UX plan §14): the broker verifies with the stores itself.
  describe('store entitlement (B5)', () => {
    const DAY = 86400000;
    const storeEnv = (over: Record<string, string> = {}) => { env = makeEnv(keys, { ENTITLEMENT_MODE: 'store', ...over }, appleKeys); };

    it('Play: a fresh purchase token is verified with a signed service-account JWT, stored, and unlocks connect/start', async () => {
      storeEnv();
      stores.play.set('tok_1', { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', productId: 'stackd_bank_connect_monthly', expiryTime: new Date(clock + 30 * DAY).toISOString(), acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' });
      const token = await mint();
      expect((await start(token)).data).toEqual({ error: 'subscription_required' });
      const r = await req('/v1/entitlement/verify', { body: { platform: 'play', purchaseToken: 'tok_1', productId: 'stackd_bank_connect_monthly' }, token });
      expect(r.status).toBe(200);
      expect(r.data).toMatchObject({ active: true, platform: 'play', productId: 'stackd_bank_connect_monthly', expiresAt: new Date(clock + 30 * DAY).toISOString() });
      expect(stores.tokenCalls).toBe(1);
      expect(stores.acknowledged).toEqual(['tok_1']); // backstop acknowledgement
      expect((await start(token)).status).toBe(201);
      const record = await env.owners.instance(token.split('.')[0]).fetch(new Request('https://do/record')).then(x => x.json()) as any;
      expect(record.entitlement).toMatchObject({ active: true, purchaseToken: 'tok_1', state: 'SUBSCRIPTION_STATE_ACTIVE' });
      expect(JSON.stringify(r.data)).not.toContain('tok_1'); // the token never echoes back
    });

    it('Play: expired / on-hold subscriptions are not entitled and start the grace clock', async () => {
      storeEnv();
      stores.play.set('tok_live', { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', productId: 'stackd_bank_connect_yearly', expiryTime: new Date(clock + 300 * DAY).toISOString() });
      stores.play.set('tok_hold', { subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD', productId: 'stackd_bank_connect_yearly', expiryTime: new Date(clock - DAY).toISOString() });
      const token = await mint();
      expect((await req('/v1/entitlement/verify', { body: { platform: 'play', purchaseToken: 'tok_live' }, token })).data.active).toBe(true);
      const r = await req('/v1/entitlement/verify', { body: { platform: 'play', purchaseToken: 'tok_hold' }, token });
      expect(r.data).toMatchObject({ active: false, reason: 'store_subscription_state_on_hold' });
      expect((await start(token)).data).toEqual({ error: 'subscription_required' });
      expect(env.owners.storages.get(token.split('.')[0])!.alarm).toBeGreaterThan(Date.now());
      // wrong product → refused
      stores.play.set('tok_other', { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', productId: 'some_other_app', expiryTime: new Date(clock + DAY).toISOString() });
      expect((await req('/v1/entitlement/verify', { body: { platform: 'play', purchaseToken: 'tok_other' }, token })).data).toEqual({ error: 'product_unknown' });
    });

    it('App Store: an ES256-signed call, with the sandbox retry on a production 404', async () => {
      storeEnv();
      stores.apple.set('2000000123', { status: 1, productId: 'stackd_bank_connect_yearly', expiresDate: clock + 200 * DAY, originalTransactionId: '2000000123', sandbox: true });
      const token = await mint();
      const r = await req('/v1/entitlement/verify', { body: { platform: 'appstore', originalTransactionId: '2000000123' }, token });
      expect(r.status).toBe(200);
      expect(r.data).toMatchObject({ active: true, platform: 'appstore', productId: 'stackd_bank_connect_yearly', expiresAt: new Date(clock + 200 * DAY).toISOString() });
      const hosts = stores.calls.map(c => new URL(c.url).host);
      expect(hosts).toEqual(['apple.test', 'apple-sandbox.test']);
      expect((await start(token)).status).toBe(201);

      stores.apple.set('3000000001', { status: 2, productId: 'stackd_bank_connect_yearly', expiresDate: clock - DAY, originalTransactionId: '3000000001' });
      expect((await req('/v1/entitlement/verify', { body: { platform: 'appstore', originalTransactionId: '3000000001' }, token })).data).toMatchObject({ active: false, reason: 'store_2' });
      stores.apple.set('3000000002', { status: 1, productId: 'stackd_bank_connect_yearly', expiresDate: clock + DAY, originalTransactionId: '3000000002', bundleId: 'com.other.app' });
      expect((await req('/v1/entitlement/verify', { body: { platform: 'appstore', originalTransactionId: '3000000002' }, token })).data).toEqual({ error: 'receipt_invalid' });
    });

    it('re-checks a stored receipt silently when it nears expiry or lapsed, throttled to once per 6h', async () => {
      storeEnv();
      stores.play.set('tok_r', { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', productId: 'stackd_bank_connect_monthly', expiryTime: new Date(clock + 10 * DAY).toISOString() });
      const token = await mint();
      await req('/v1/entitlement/verify', { body: { platform: 'play', purchaseToken: 'tok_r' }, token });
      const playCalls = () => stores.calls.filter(c => new URL(c.url).host === 'play.test').length;
      const before = playCalls();
      // far from expiry: a plain re-verify does not touch the store
      expect((await req('/v1/entitlement/verify', { body: {}, token })).data.active).toBe(true);
      expect(playCalls()).toBe(before);
      // within 24h of expiry and 6h+ since the last check: re-verified (renewed at the store)
      clock += 9 * DAY + 12 * 3600000;
      stores.play.get('tok_r')!.expiryTime = new Date(clock + 31 * DAY).toISOString();
      const r = await req('/v1/entitlement/verify', { body: {}, token });
      expect(playCalls()).toBe(before + 1);
      expect(r.data.expiresAt).toBe(new Date(clock + 31 * DAY).toISOString());
      // throttled
      await req('/v1/entitlement/verify', { body: {}, token });
      expect(playCalls()).toBe(before + 1);
      // lapsed at the store → not entitled; a later re-check (6h+) sees the renewal
      clock += 7 * 3600000;
      stores.play.get('tok_r')!.subscriptionState = 'SUBSCRIPTION_STATE_EXPIRED';
      stores.play.get('tok_r')!.expiryTime = new Date(clock - DAY).toISOString();
      // still 30 days from the stored expiry → no re-check yet
      expect((await req('/v1/entitlement/verify', { body: {}, token })).data.active).toBe(true);
      clock += 31 * DAY;
      expect((await req('/v1/entitlement/verify', { body: {}, token })).data.active).toBe(false);
      expect((await start(token)).data).toEqual({ error: 'subscription_required' });
      clock += 7 * 3600000;
      stores.play.get('tok_r')!.subscriptionState = 'SUBSCRIPTION_STATE_ACTIVE';
      stores.play.get('tok_r')!.expiryTime = new Date(clock + 30 * DAY).toISOString();
      expect((await req('/v1/entitlement/verify', { body: {}, token })).data.active).toBe(true);
    });

    it('a silent re-check that fails keeps the stored entitlement; missing store config is a 503 for fresh receipts', async () => {
      storeEnv();
      stores.play.set('tok_x', { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', productId: 'stackd_bank_connect_monthly', expiryTime: new Date(clock + 10 * 3600000).toISOString() });
      const token = await mint();
      await req('/v1/entitlement/verify', { body: { platform: 'play', purchaseToken: 'tok_x' }, token });
      clock += 7 * 3600000;
      stores.play.delete('tok_x'); // the store now says "invalid"
      expect((await req('/v1/entitlement/verify', { body: {}, token })).data.active).toBe(true); // kept
      env = makeEnv(keys, { ENTITLEMENT_MODE: 'store', PLAY_SERVICE_ACCOUNT_JSON: '' }, appleKeys);
      const t2 = await mint('192.0.2.99');
      expect((await req('/v1/entitlement/verify', { body: { platform: 'play', purchaseToken: 'tok_x' }, token: t2 })).data).toEqual({ error: 'store_not_configured' });
      env = makeEnv(keys, { ENTITLEMENT_MODE: 'store', APPLE_PRIVATE_KEY: '' } as any, appleKeys);
      const t3 = await mint('192.0.2.98');
      expect((await req('/v1/entitlement/verify', { body: { platform: 'appstore', originalTransactionId: '1' }, token: t3 })).data).toEqual({ error: 'store_not_configured' });
    });
  });

  describe('connect', () => {
    it('requires a device token', async () => {
      expect((await start('')).status).toBe(401);
    });

    it('starts an authorization clamped to the institution and returns the bank link', async () => {
      const token = await mint();
      const r = await start(token, { historyDays: 5000, validityDays: 999 });
      expect(r.status).toBe(201);
      expect(r.data.ref).toMatch(new RegExp(`^${token.split('.')[0]}_[0-9a-f]{16}$`));
      expect(r.data.bankRedirectUrl).toMatch(/^https:\/\/sandbox\.eb\.test\/auth\/auth_\d+$/);
      expect(r.data).toMatchObject({ historyDays: 365, validityDays: 180 });
      const auth = eb.calls.find(c => c.path === '/auth')!.body as any;
      expect(auth).toEqual({
        access: { valid_until: '2027-03-06T10:00:00.000Z' },
        aspsp: { name: 'Big Bank', country: 'IT' },
        state: r.data.ref,
        redirect_url: 'https://broker.test/v1/connect/return',
        psu_type: 'personal',
        language: 'en'
      });
      const status = await req(`/v1/connect/status?ref=${r.data.ref}`, { token });
      expect(status.data).toMatchObject({ ref: r.data.ref, status: 'CR', accounts: [], institutionName: 'Big Bank' });
    });

    it('honours smaller windows, the Accept-Language, and PUBLIC_URL for the redirect', async () => {
      env = makeEnv(keys, { PUBLIC_URL: 'https://api-staging.stackdplatform.com/' });
      const token = await mint();
      const r = await req('/v1/connect/start', { token, body: { country: 'IT', institutionId: 'IT:Mock ASPSP', historyDays: 30, validityDays: 60 }, headers: { 'accept-language': 'it-IT,it;q=0.9' } });
      expect(r.status).toBe(201);
      expect(r.data).toMatchObject({ historyDays: 30, validityDays: 60 });
      const auth = eb.calls.find(c => c.path === '/auth')!.body as any;
      expect(auth.redirect_url).toBe('https://api-staging.stackdplatform.com/v1/connect/return');
      expect(auth.language).toBe('it');
    });

    it('rejects unknown institutions and bad countries without reserving capacity', async () => {
      const token = await mint();
      expect((await start(token, { institutionId: 'IT:Nope' })).data).toEqual({ error: 'unknown_institution' });
      expect((await start(token, { country: 'Italy' })).data).toEqual({ error: 'country_required' });
      const { SystemClient } = await import('../src/durable-objects');
      expect(await new SystemClient(env as unknown as Env).connections()).toBe(0);
    });

    it('enforces the per-owner cap (D-C9) and the global cap', async () => {
      const token = await mint();
      for (let i = 0; i < 3; i++) expect((await start(token)).status).toBe(201);
      expect((await start(token)).data).toEqual({ error: 'connection_limit' });

      env = makeEnv(keys, { MAX_CONNECTIONS: '1' });
      const a = await mint('192.0.2.1');
      const b = await mint('192.0.2.2');
      expect((await start(a)).status).toBe(201);
      expect((await start(b)).data).toEqual({ error: 'capacity' });
    });

    it('releases the global reservation when the aggregator call fails', async () => {
      env = makeEnv(keys, { MAX_CONNECTIONS: '1' });
      const token = await mint();
      const original = eb.fetchImpl;
      app = createApp({ fetch: async (i, init) => (i.endsWith('/auth') ? new Response('{"error":"BOOM"}', { status: 500 }) : original(i, init)), now: () => clock });
      expect((await start(token)).status).toBe(502);
      app = createApp({ fetch: original, now: () => clock });
      expect((await start(token)).status).toBe(201);
    });

    it('store mode: connect/start and data need a live entitlement (402)', async () => {
      env = makeEnv(keys, { ENTITLEMENT_MODE: 'store' });
      const token = await mint();
      expect((await start(token)).data).toEqual({ error: 'subscription_required' });
      expect((await req('/v1/accounts/x/transactions', { token })).data).toEqual({ error: 'subscription_required' });
      await env.owners.instance(token.split('.')[0]).fetch(new Request('https://do/entitlement/set', { method: 'POST', body: JSON.stringify({ entitlement: { active: true, expiresAt: '2000-01-01T00:00:00.000Z' } }) }));
      expect((await start(token)).data).toEqual({ error: 'subscription_required' }); // expired
    });
  });

  describe('bank return + status + accounts', () => {
    const setup = async () => {
      const token = await mint();
      const s = await start(token);
      eb.accounts.set('acc_1', { uid: 'acc_1', iban: 'IT60X0542811101000000123456', currency: 'EUR', name: 'Conto', balances: { balances: [{ name: 'x', balance_amount: { amount: '1234.56', currency: 'EUR' }, balance_type: 'CLBD' }] }, transactionPages: [[{ entry_reference: 't1', booking_date: '2026-09-01', status: 'BOOK' }], [{ entry_reference: 't2', booking_date: '2026-08-30', status: 'BOOK' }]] });
      eb.accounts.set('acc_2', { uid: 'acc_2', iban: 'IT60X0542811101000000654321', currency: 'EUR', name: 'Risparmio' });
      eb.accounts.set('acc_3', { uid: 'acc_3', iban: 'IT60X0542811101000000999999', currency: 'EUR', name: 'Someone else' });
      eb.pendingAccounts = ['acc_1', 'acc_2'];
      return { token, ref: s.data.ref as string };
    };

    it('exchanges the code at the return URL, stores the linked accounts, and renders the hand-off page', async () => {
      const { token, ref } = await setup();
      const r = await bankReturn(ref);
      expect(r.status).toBe(200);
      expect(r.headers.get('content-type')).toContain('text/html');
      expect(r.data).toContain(`href="stackd://connect/return?ref=${ref}"`);
      expect(r.data).toContain('Your bank has confirmed');
      const sessCall = eb.calls.find(c => c.path === '/sessions' && c.method === 'POST')!;
      expect(sessCall.body).toEqual({ code: 'code_1' });

      const st = await req(`/v1/connect/status?ref=${ref}`, { token });
      expect(st.data.status).toBe('LN');
      expect(st.data.accounts).toEqual([
        { id: 'acc_1', ibanTail: '3456', currency: 'EUR', name: 'Conto' },
        { id: 'acc_2', ibanTail: '4321', currency: 'EUR', name: 'Risparmio' }
      ]);
      expect(st.data.expiresAt).toBe('2027-03-06T10:00:00.000Z');
      expect(JSON.stringify(st.data)).not.toContain('IT60X'); // never the full IBAN

      // Reloading the return page is harmless and does not re-exchange.
      const again = await req(`/v1/connect/return?code=whatever&state=${ref}`, { client: null });
      expect(again.status).toBe(200);
      expect(eb.calls.filter(c => c.path === '/sessions' && c.method === 'POST')).toHaveLength(1);
      expect((await req('/v1/connections', { token })).data.connections).toHaveLength(1);
    });

    it('records a cancelled or failed bank leg without leaking anything', async () => {
      const { token, ref } = await setup();
      const r = await req(`/v1/connect/return?state=${ref}&error=access_denied&error_description=Cancelled%20by%20user`, { client: null });
      expect(r.data).toContain('did not complete');
      expect(r.data).toContain('Cancelled by user');
      expect((await req(`/v1/connect/status?ref=${ref}`, { token })).data).toMatchObject({ status: 'UA', lastError: 'access_denied' });

      const s2 = await start(token);
      const bad = await req(`/v1/connect/return?state=${s2.data.ref}&code=not_a_real_code`, { client: null });
      expect(bad.status).toBe(200);
      expect((await req(`/v1/connect/status?ref=${s2.data.ref}`, { token })).data.status).toBe('RJ');

      // Unknown / malformed refs get a neutral page and touch nothing.
      expect((await req('/v1/connect/return?state=zzzz&code=x', { client: null })).data).toContain('not valid');
      expect((await req(`/v1/connect/return?state=${'0'.repeat(16)}_${'0'.repeat(16)}&code=x`, { client: null })).data).toContain('not valid');
      expect(eb.calls.filter(c => c.path === '/sessions' && c.method === 'POST')).toHaveLength(1);
    });

    it('proxies balances and paginated transactions for owned accounts only', async () => {
      const { token, ref } = await setup();
      expect((await req('/v1/accounts/acc_1/transactions', { token })).data).toEqual({ error: 'unknown_account' }); // not linked yet
      await bankReturn(ref);

      const tx = await req('/v1/accounts/acc_1/transactions?date_from=2026-06-01&date_to=2026-09-07', { token });
      expect(tx.status).toBe(200);
      expect(tx.data.transactions.map((t: any) => t.entry_reference)).toEqual(['t1', 't2']);
      expect(tx.data.truncated).toBe(false);
      const txCalls = eb.calls.filter(c => c.path.startsWith('/accounts/acc_1/transactions'));
      expect(txCalls[0].path).toBe('/accounts/acc_1/transactions?date_from=2026-06-01&date_to=2026-09-07');
      expect(txCalls[1].path).toContain('continuation_key=1');
      expect(txCalls[0].headers.get('psu-ip-address')).toBe('203.0.113.1');
      expect(txCalls[0].headers.get('psu-user-agent')).toBe('StackdTest/1.0');
      expect((await req('/v1/accounts/acc_1/transactions?date_from=1/6/2026', { token })).data).toEqual({ error: 'invalid_date' });

      const bal = await req('/v1/accounts/acc_1/balances', { token });
      expect(bal.data.balances[0].balance_amount.amount).toBe('1234.56');
      expect((await req('/v1/accounts/acc_3/balances', { token })).data).toEqual({ error: 'unknown_account' }); // exists at the aggregator, not linked here
    });

    it('surfaces the bank\'s per-PSU limit as 429 without tripping the breaker', async () => {
      const { token, ref } = await setup();
      await bankReturn(ref);
      eb.accounts.get('acc_1')!.rate429 = true;
      expect((await req('/v1/accounts/acc_1/balances', { token })).data).toEqual({ error: 'account_rate_limited' });
      expect((await req('/v1/institutions?country=GB')).status).toBe(200);
    });

    it('marks the connection expired when the aggregator says the session is gone, and by date', async () => {
      const { token, ref } = await setup();
      await bankReturn(ref);
      const sessionId = [...eb.sessions.keys()][0];
      eb.expireSession(sessionId);
      expect((await req('/v1/accounts/acc_1/balances', { token })).data).toEqual({ error: 'consent_expired' });
      expect((await req(`/v1/connect/status?ref=${ref}`, { token })).data.status).toBe('EX');

      const b = await setup();
      await bankReturn(b.ref);
      clock += 200 * 86400000;
      expect((await req(`/v1/connect/status?ref=${b.ref}`, { token: b.token })).data.status).toBe('EX');
      expect((await req('/v1/accounts/acc_1/balances', { token: b.token })).data).toEqual({ error: 'consent_expired' });
    });

    it('THE ownership test: owner B can read nothing of owner A', async () => {
      const a = await setup();
      await bankReturn(a.ref);
      const b = await mint('192.0.2.50');
      expect((await req(`/v1/connect/status?ref=${a.ref}`, { token: b })).status).toBe(404);
      expect((await req('/v1/accounts/acc_1/transactions', { token: b })).status).toBe(404);
      expect((await req('/v1/accounts/acc_1/balances', { token: b })).status).toBe(404);
      expect((await req(`/v1/connections/${a.ref}`, { token: b, method: 'DELETE' })).status).toBe(404);
      expect(eb.sessions.size).toBe(1);
      expect((await req('/v1/connections', { token: b })).data.connections).toEqual([]);
      expect((await req('/v1/accounts/acc_1/balances', { token: a.token })).status).toBe(200);
    });

    it('revokes at the aggregator, forgets the ref and releases capacity', async () => {
      const { token, ref } = await setup();
      await bankReturn(ref);
      const { SystemClient } = await import('../src/durable-objects');
      expect(await new SystemClient(env as unknown as Env).connections()).toBe(1);
      const r = await req(`/v1/connections/${ref}`, { token, method: 'DELETE' });
      expect(r.data).toEqual({ ok: true, ref });
      expect(eb.sessions.size).toBe(0);
      expect((await req(`/v1/connect/status?ref=${ref}`, { token })).status).toBe(404);
      expect(await new SystemClient(env as unknown as Env).connections()).toBe(0);
      // A never-linked connection has no session to delete; still removable.
      const s2 = await start(token);
      expect((await req(`/v1/connections/${s2.data.ref}`, { token, method: 'DELETE' })).status).toBe(200);
    });
  });

  // v1.11 B7 (UX plan §16): a browser pairs with the phone through a code
  // and becomes a `web` device on the same owner — cookie + CSRF instead of
  // a bearer, sliding 90-day life, revocable from the phone.
  describe('web session + pairing (B7)', () => {
    const cookieOf = (r: { headers: Headers }) => {
      const sc = r.headers.get('set-cookie') || '';
      return sc.split(';')[0];
    };
    const pair = async (token: string, ip = '198.51.100.7') => {
      const code = await req('/v1/pair/code', { token, body: {} });
      expect(code.status).toBe(201);
      const claim = await req('/v1/pair/claim', { body: { code: code.data.code }, ip, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36' } });
      expect(claim.status).toBe(201);
      return { code: code.data.code as string, cookie: cookieOf(claim), csrf: claim.data.csrf as string, claim };
    };

    it('pairs a browser with the phone: code → cookie session on the same owner, seeing the phone\'s connections', async () => {
      const token = await mint();
      const ownerId = token.split('.')[0];
      const s = await start(token);
      eb.pendingAccounts = [];
      await bankReturn(s.data.ref);

      const code = await req('/v1/pair/code', { token, body: {} });
      expect(code.status).toBe(201);
      expect(code.data.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      expect(code.data.expiresAt).toBe('2026-09-07T10:05:00.000Z');

      // The claim is unauthenticated; the code may be typed in lower case with spaces.
      const typed = `${code.data.code.slice(0, 4).toLowerCase()} ${code.data.code.slice(4)}`;
      const claim = await req('/v1/pair/claim', { body: { code: typed }, headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36' } });
      expect(claim.status).toBe(201);
      expect(claim.data).toMatchObject({ ownerId, active: true, mode: 'open' });
      expect(claim.data.csrf).toMatch(/^[0-9a-f]{32}$/);
      expect(claim.data.sessionExpiresAt).toBe('2026-12-06T10:00:00.000Z'); // 90 days
      const sc = claim.headers.get('set-cookie')!;
      expect(sc).toMatch(new RegExp(`^stackd_session=${ownerId}\\.[0-9a-f]{64}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax$`));
      expect(JSON.stringify(claim.data)).not.toContain(sc.split('=')[1].split(';')[0]); // the secret lives in the cookie only
      expect(JSON.stringify(claim.data)).not.toContain('deviceToken');

      const cookie = cookieOf(claim);
      const conns = await req('/v1/connections', { cookie });
      expect(conns.status).toBe(200);
      expect(conns.data.connections).toHaveLength(1);
      expect(conns.data.connections[0].ref).toBe(s.data.ref);

      // The phone sees the browser, with a coarse label and no hash.
      const devices = await req('/v1/devices', { token });
      expect(devices.data.devices).toHaveLength(1);
      expect(devices.data.devices[0]).toMatchObject({ kind: 'web', label: 'Chrome · Windows', current: false });
      expect(devices.data.devices[0].id).toMatch(/^[0-9a-f]{16}$/);
      expect(JSON.stringify(devices.data)).not.toMatch(/[0-9a-f]{64}/);
    });

    it('codes are single-use, expire after 5 minutes, and a wrong one is refused without side effects', async () => {
      const token = await mint();
      const { code } = await pair(token);
      expect((await req('/v1/pair/claim', { body: { code } })).data).toEqual({ error: 'invalid_code' });
      expect((await req('/v1/pair/claim', { body: { code: 'ZZZZZZZZ' } })).status).toBe(400);
      expect((await req('/v1/pair/claim', { body: { code: '0O1I0O1I' } })).data).toEqual({ error: 'invalid_code' }); // excluded glyphs
      expect((await req('/v1/pair/claim', { body: {} })).status).toBe(400);

      const fresh = await req('/v1/pair/code', { token, body: {} });
      clock += 5 * 60 * 1000 + 1;
      const late = await req('/v1/pair/claim', { body: { code: fresh.data.code } });
      expect(late.status).toBe(410);
      expect(late.data).toEqual({ error: 'code_expired' });
      expect((await req('/v1/devices', { token })).data.devices).toHaveLength(1); // only the first pairing
    });

    it('a cookie session needs the CSRF header on mutations, not on reads; a web-started connect returns to the web build', async () => {
      env = makeEnv(keys, { PUBLIC_WEB_URL: 'https://app.stackdplatform.com/' });
      const token = await mint();
      const { cookie, csrf } = await pair(token);
      const body = { country: 'IT', institutionId: 'IT:Big Bank' };
      expect((await req('/v1/connect/start', { cookie, body })).data).toEqual({ error: 'csrf_required' });
      expect((await req('/v1/connect/start', { cookie, csrf: 'nope', body })).data).toEqual({ error: 'csrf_invalid' });
      expect((await req('/v1/connections', { cookie })).status).toBe(200);

      const s = await req('/v1/connect/start', { cookie, csrf, body });
      expect(s.status).toBe(201);
      eb.pendingAccounts = [];
      const back = await bankReturn(s.data.ref);
      expect(back.status).toBe(302);
      expect(back.headers.get('location')).toBe('https://app.stackdplatform.com/#bank-connect');
      expect((await req(`/v1/connect/status?ref=${s.data.ref}`, { cookie })).data.status).toBe('LN');
      // A native-started flow still gets the hand-off page.
      const n = await start(token);
      expect((await bankReturn(n.data.ref)).headers.get('content-type')).toContain('text/html');
      // Without PUBLIC_WEB_URL the web flow falls back to the page too.
      env = makeEnv(keys, {});
      const t2 = await mint();
      const w2 = await pair(t2, '198.51.100.8');
      const s2 = await req('/v1/connect/start', { cookie: w2.cookie, csrf: w2.csrf, body });
      expect((await bankReturn(s2.data.ref)).status).toBe(200);
    });

    it('GET /v1/session is the boot check: 401 without a cookie, sliding expiry + CSRF rotation with one', async () => {
      const token = await mint();
      expect((await req('/v1/session')).data).toEqual({ error: 'no_session' });
      expect((await req('/v1/session', { token })).data).toEqual({ error: 'web_only' });
      const { cookie, csrf } = await pair(token);

      clock += 10 * 86400000;
      const sess = await req('/v1/session', { cookie });
      expect(sess.status).toBe(200);
      expect(sess.data.csrf).not.toBe(csrf);
      expect(sess.data.sessionExpiresAt).toBe('2026-12-16T10:00:00.000Z'); // extended from today
      expect(sess.headers.get('set-cookie')).toContain('Max-Age=7776000');
      expect(cookieOf(sess)).toBe(cookie); // same secret re-issued
      const body = { country: 'IT', institutionId: 'IT:Big Bank' };
      expect((await req('/v1/connect/start', { cookie, csrf, body })).data).toEqual({ error: 'csrf_invalid' }); // rotated away
      expect((await req('/v1/connect/start', { cookie, csrf: sess.data.csrf, body })).status).toBe(201);

      // entitlement/verify over a cookie session re-checks, never mints.
      const ev = await req('/v1/entitlement/verify', { cookie, csrf: sess.data.csrf, body: {} });
      expect(ev.status).toBe(200);
      expect(ev.data.ownerId).toBe(token.split('.')[0]);
      expect(ev.data.deviceToken).toBeUndefined();

      clock += 91 * 86400000;
      const gone = await req('/v1/session', { cookie });
      expect(gone.status).toBe(401);
      expect(gone.data).toEqual({ error: 'session_expired' });
      expect(gone.headers.get('set-cookie')).toContain('Max-Age=0');
      expect((await req('/v1/devices', { token })).data.devices).toEqual([]);
    });

    it('logout removes only the web device; the phone can revoke a browser', async () => {
      const token = await mint();
      const a = await pair(token, '198.51.100.1');
      const b = await pair(token, '198.51.100.2');
      expect((await req('/v1/session/logout', { cookie: a.cookie, method: 'POST' })).data).toEqual({ error: 'csrf_required' });
      const out = await req('/v1/session/logout', { cookie: a.cookie, csrf: a.csrf, body: {} });
      expect(out.status).toBe(200);
      expect(out.headers.get('set-cookie')).toContain('stackd_session=; Path=/; Max-Age=0');
      const again = await req('/v1/connections', { cookie: a.cookie });
      expect(again.data).toEqual({ error: 'invalid_session' });
      expect(again.headers.get('set-cookie')).toContain('Max-Age=0');
      expect((await req('/v1/connections', { cookie: b.cookie })).status).toBe(200);
      expect((await req('/v1/connections', { token })).status).toBe(200); // the phone is untouched

      const list = (await req('/v1/devices', { token })).data.devices;
      expect(list).toHaveLength(1);
      expect((await req(`/v1/devices/${list[0].id}`, { method: 'DELETE', token })).data).toEqual({ ok: true, id: list[0].id });
      expect((await req('/v1/connections', { cookie: b.cookie })).data).toEqual({ error: 'invalid_session' });
      expect((await req(`/v1/devices/${list[0].id}`, { method: 'DELETE', token })).status).toBe(404);
      expect((await req('/v1/devices/xyz', { method: 'DELETE', token })).status).toBe(404);
      // A browser sees itself as `current` and cannot mint pairing codes.
      const c2 = await pair(token, '198.51.100.3');
      expect((await req('/v1/devices', { cookie: c2.cookie })).data.devices[0].current).toBe(true);
      expect((await req('/v1/pair/code', { cookie: c2.cookie, csrf: c2.csrf, body: {} })).data).toEqual({ error: 'native_only' });
    });

    it('rate-limits codes per owner (5/h) and claims per IP (10/h); store mode needs an entitled phone', async () => {
      const token = await mint();
      for (let i = 0; i < 5; i++) expect((await req('/v1/pair/code', { token, body: {} })).status).toBe(201);
      expect((await req('/v1/pair/code', { token, body: {} })).status).toBe(429);
      for (let i = 0; i < 10; i++) expect((await req('/v1/pair/claim', { body: { code: 'ZZZZZZZZ' }, ip: '198.51.100.9' })).status).toBe(400);
      expect((await req('/v1/pair/claim', { body: { code: 'ZZZZZZZZ' }, ip: '198.51.100.9' })).status).toBe(429);

      env = makeEnv(keys, { ENTITLEMENT_MODE: 'store' });
      const t2 = await mint();
      expect((await req('/v1/pair/code', { token: t2, body: {} })).data).toEqual({ error: 'subscription_required' });
    });

    it('answers credentialed CORS for allow-listed origins only', async () => {
      const ok = await req('/v1/session', { headers: { origin: 'http://localhost:3000' } });
      expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
      expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      const pre = await req('/v1/pair/claim', { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } });
      expect(pre.headers.get('access-control-allow-headers')).toContain('x-stackd-csrf');
      const no = await req('/v1/session', { headers: { origin: 'https://evil.example' } });
      expect(no.headers.get('access-control-allow-credentials')).toBeNull();
    });
  });

  describe('grace alarm (store mode)', () => {
    it('revokes every session 14 days after a lapse, not before', async () => {
      env = makeEnv(keys, { ENTITLEMENT_MODE: 'store' });
      const token = await mint();
      const ownerId = token.split('.')[0];
      const owner = env.owners.instance(ownerId);
      const set = (entitlement: unknown) => owner.fetch(new Request('https://do/entitlement/set', { method: 'POST', body: JSON.stringify({ entitlement }) }));
      await set({ active: true, expiresAt: '2999-01-01T00:00:00.000Z' });
      const s = await start(token);
      eb.pendingAccounts = [];
      await bankReturn(s.data.ref);
      expect(eb.sessions.size).toBe(1);

      await set({ active: false });
      const storage = env.owners.storages.get(ownerId)!;
      expect(storage.alarm).toBeGreaterThan(Date.now());
      await owner.alarm!(); // early → keeps everything, re-arms
      expect(eb.sessions.size).toBe(1);

      const rec = (await storage.get('owner')) as any;
      rec.entitlement.lapsedAt = new Date(Date.now() - 15 * 86400000).toISOString();
      await storage.put('owner', rec);
      const realFetch = globalThis.fetch;
      (globalThis as any).fetch = eb.fetchImpl;
      try { await owner.alarm!(); } finally { (globalThis as any).fetch = realFetch; }
      expect(eb.sessions.size).toBe(0);
      expect((await req('/v1/connections', { token })).data.connections).toEqual([]);
    });
  });
});
