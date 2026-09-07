// In-memory stand-ins for the Workers runtime pieces the broker touches:
// Durable Object namespaces/stubs/storage, and the Enable Banking API behind
// an injected fetch (which VERIFIES the broker's RS256 JWT against the test
// key pair). Same call surface as production, so the handlers under test are
// the real ones.
import type { Env } from '../src/env';
import { OwnerDO, SystemDO, RateDO } from '../src/durable-objects';

// ── Durable Objects ────────────────────────────────────────────────────────

class FakeStorage {
  private map = new Map<string, unknown>();
  alarm: number | null = null;
  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void> {
    this.map.set(key, JSON.parse(JSON.stringify(value)));
  }
  async delete(key: string): Promise<boolean> {
    return this.map.delete(key);
  }
  async list<T>(opts: { prefix?: string } = {}): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const [k, v] of this.map) if (!opts.prefix || k.startsWith(opts.prefix)) out.set(k, v as T);
    return out;
  }
  async setAlarm(t: number): Promise<void> {
    this.alarm = t;
  }
  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }
  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }
}

type DoCtor = new (state: DurableObjectState, env: Env) => { fetch(request: Request): Promise<Response>; alarm?(): Promise<void> };

export class FakeNamespace {
  instances = new Map<string, { fetch(request: Request): Promise<Response>; alarm?(): Promise<void> }>();
  storages = new Map<string, FakeStorage>();
  constructor(private ctor: DoCtor, private envRef: { env: Env | null }) {}
  jurisdiction(): FakeNamespace {
    return this;
  }
  idFromName(name: string): { name: string; toString(): string } {
    return { name, toString: () => name };
  }
  get(id: { name: string }): { fetch(url: string, init?: RequestInit): Promise<Response> } {
    const inst = this.instance(id.name);
    return { fetch: (url: string, init?: RequestInit) => inst.fetch(new Request(url, init)) };
  }
  instance(name: string) {
    let inst = this.instances.get(name);
    if (!inst) {
      const storage = new FakeStorage();
      this.storages.set(name, storage);
      const state = { storage, id: { toString: () => name }, blockConcurrencyWhile: (fn: () => Promise<unknown>) => fn(), waitUntil: () => {} } as unknown as DurableObjectState;
      inst = new this.ctor(state, this.envRef.env as Env);
      this.instances.set(name, inst);
    }
    return inst;
  }
}

// ── Test key pair (generated once per process) ─────────────────────────────

export interface TestKeys {
  appId: string;
  privatePem: string; // PKCS#8
  publicKey: CryptoKey;
}

let keysPromise: Promise<TestKeys> | null = null;

const toPem = (label: string, der: ArrayBuffer): string => {
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
};

export function testKeys(): Promise<TestKeys> {
  if (!keysPromise) {
    keysPromise = (async () => {
      const pair = (await crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify']
      )) as CryptoKeyPair;
      const pkcs8 = (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer;
      return { appId: '11111111-2222-4333-8444-555555555555', privatePem: toPem('PRIVATE KEY', pkcs8), publicKey: pair.publicKey };
    })();
  }
  return keysPromise;
}

// ── Apple test key (ES256) ─────────────────────────────────────────────────

export interface AppleTestKeys {
  privatePem: string; // PKCS#8
  publicKey: CryptoKey;
}

let appleKeysPromise: Promise<AppleTestKeys> | null = null;

export function testAppleKeys(): Promise<AppleTestKeys> {
  if (!appleKeysPromise) {
    appleKeysPromise = (async () => {
      const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
      const pkcs8 = (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer;
      return { privatePem: toPem('PRIVATE KEY', pkcs8), publicKey: pair.publicKey };
    })();
  }
  return appleKeysPromise;
}

export function makeEnv(keys: TestKeys, overrides: Partial<Env> = {}, apple?: AppleTestKeys): Env & { owners: FakeNamespace; systems: FakeNamespace; rates: FakeNamespace } {
  const ref: { env: Env | null } = { env: null };
  const owners = new FakeNamespace(OwnerDO, ref);
  const systems = new FakeNamespace(SystemDO, ref);
  const rates = new FakeNamespace(RateDO, ref);
  const env = {
    OWNER_DO: owners as unknown as DurableObjectNamespace,
    SYSTEM_DO: systems as unknown as DurableObjectNamespace,
    RATE_DO: rates as unknown as DurableObjectNamespace,
    EB_APP_ID: keys.appId,
    EB_PRIVATE_KEY: keys.privatePem,
    EB_BASE_URL: 'https://eb.test',
    // v1.09 B5 store verification (fake hosts, see fakeStores)
    PRODUCT_IDS: 'stackd_bank_connect_monthly,stackd_bank_connect_yearly',
    PLAY_PACKAGE_NAME: 'com.stackd.finance',
    PLAY_API_URL: 'https://play.test',
    GOOGLE_TOKEN_URL: 'https://google.test/token',
    PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'sa@stackd.test', private_key: keys.privatePem }),
    APPLE_BUNDLE_ID: 'com.stackd.finance',
    APPLE_ISSUER_ID: 'issuer-1',
    APPLE_KEY_ID: 'KEY123',
    APPLE_API_URL: 'https://apple.test',
    APPLE_SANDBOX_API_URL: 'https://apple-sandbox.test',
    APPLE_PRIVATE_KEY: apple ? apple.privatePem : '',
    ENTITLEMENT_MODE: 'open',
    CLIENT_ID: 'stackd-web',
    MAX_CONNECTIONS: '50',
    OWNER_MAX_CONNECTIONS: '3',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    APP_SCHEME: 'stackd',
    ANDROID_PACKAGE: 'com.stackd.finance',
    ANDROID_SHA256_FINGERPRINTS: 'AA:BB',
    IOS_APP_ID: 'TEAM123.com.stackd.finance',
    PUBLIC_URL: '',
    ...overrides,
    owners,
    systems,
    rates
  };
  ref.env = env as unknown as Env;
  return env as unknown as Env & { owners: FakeNamespace; systems: FakeNamespace; rates: FakeNamespace };
}

// ── Enable Banking ─────────────────────────────────────────────────────────

export interface FakeAccount {
  uid: string;
  iban?: string;
  currency: string;
  name?: string;
  balances?: unknown;
  transactionPages?: unknown[][]; // each page = one continuation step
  rate429?: boolean;
}

export interface FakeAuthorization {
  id: string;
  state: string;
  redirect_url: string;
  aspsp: { name: string; country: string };
  valid_until: string;
  language?: string;
  code: string; // what the bank hands back on success
}

export interface FakeEb {
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  calls: { method: string; path: string; body: unknown; headers: Headers }[];
  jwtChecks: number;
  authorizations: Map<string, FakeAuthorization>; // by code
  sessions: Map<string, { session_id: string; accounts: FakeAccount[]; valid_until: string; status: string; expired?: boolean }>;
  accounts: Map<string, FakeAccount>; // uid → account (linked to sessions by createSession)
  pendingAccounts: string[]; // uids attached to the NEXT session
  aspsps: Record<string, unknown[]>;
  global429: boolean;
  rejectJwt: boolean;
  expireSession(id: string): void;
}

const ASPSPS: Record<string, unknown[]> = {
  IT: [
    { name: 'Mock ASPSP', country: 'IT', logo: 'https://cdn.test/mock.png', maximum_consent_validity: 7776000, sandbox: { users: [] }, beta: false, psu_types: ['personal'] },
    { name: 'Big Bank', country: 'IT', logo: 'https://cdn.test/big.png', bic: 'BIGBITMM', maximum_consent_validity: 15552000, beta: false, psu_types: ['personal', 'business'], auth_methods: [{ name: 'x' }] }
  ],
  GB: [
    { name: 'GB Bank', country: 'GB', logo: '', maximum_consent_validity: 7776000, beta: true, psu_types: ['personal'] }
  ]
};

const b64urlToBytes = (s: string): Uint8Array => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function fakeEnableBanking(keys: TestKeys): FakeEb {
  let seq = 0;
  const eb: FakeEb = {
    calls: [],
    jwtChecks: 0,
    authorizations: new Map(),
    sessions: new Map(),
    accounts: new Map(),
    pendingAccounts: [],
    aspsps: ASPSPS,
    global429: false,
    rejectJwt: false,
    expireSession(id) {
      const s = eb.sessions.get(id);
      if (s) s.expired = true;
    },
    fetchImpl: async (input, init = {}) => {
      const u = new URL(input);
      const path = u.pathname;
      const method = (init.method || 'GET').toUpperCase();
      const headers = new Headers(init.headers || {});
      const body = init.body ? JSON.parse(String(init.body)) : null;
      eb.calls.push({ method, path: path + u.search, body, headers });
      const res = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

      // JWT: header.kid = app id, RS256 signature over header.payload, exp in the future.
      const auth = headers.get('authorization') || '';
      const parts = auth.replace(/^Bearer\s+/i, '').split('.');
      if (parts.length !== 3 || eb.rejectJwt) return res({ error: 'INVALID_TOKEN' }, 401);
      const header = JSON.parse(Buffer.from(b64urlToBytes(parts[0])).toString('utf8'));
      const payload = JSON.parse(Buffer.from(b64urlToBytes(parts[1])).toString('utf8'));
      const ok = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, keys.publicKey, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      if (!ok || header.kid !== keys.appId || header.alg !== 'RS256' || payload.iss !== 'enablebanking.com' || payload.aud !== 'api.enablebanking.com') {
        return res({ error: 'INVALID_TOKEN' }, 401);
      }
      eb.jwtChecks += 1;
      if (eb.global429) return res({ error: 'RATE_LIMIT_EXCEEDED' }, 429);

      if (path === '/aspsps') return res({ aspsps: eb.aspsps[u.searchParams.get('country') || ''] || [] });

      if (path === '/auth' && method === 'POST') {
        const id = `auth_${++seq}`;
        const code = `code_${seq}`;
        eb.authorizations.set(code, { id, state: body.state, redirect_url: body.redirect_url, aspsp: body.aspsp, valid_until: body.access.valid_until, language: body.language, code });
        return res({ url: `https://sandbox.eb.test/auth/${id}`, authorization_id: id, psu_id_hash: 'h' });
      }

      if (path === '/sessions' && method === 'POST') {
        const a = eb.authorizations.get(body.code);
        if (!a) return res({ error: 'INVALID_CODE' }, 400);
        eb.authorizations.delete(body.code); // single use
        const id = `sess_${++seq}`;
        const accounts = eb.pendingAccounts.map(uid => eb.accounts.get(uid)!).filter(Boolean);
        eb.pendingAccounts = [];
        eb.sessions.set(id, { session_id: id, accounts, valid_until: a.valid_until, status: 'AUTHORIZED' });
        return res({
          session_id: id,
          accounts: accounts.map(x => ({ uid: x.uid, account_id: { iban: x.iban }, currency: x.currency, name: x.name, cash_account_type: 'CACC' })),
          aspsp: a.aspsp,
          psu_type: 'personal',
          access: { valid_until: a.valid_until }
        });
      }

      const sm = /^\/sessions\/([^/]+)$/.exec(path);
      if (sm) {
        const s = eb.sessions.get(sm[1]);
        if (!s) return res({ error: 'NOT_FOUND' }, 404);
        if (method === 'DELETE') {
          eb.sessions.delete(sm[1]);
          return res({ message: 'OK' });
        }
        return res({ session_id: s.session_id, status: s.expired ? 'EXPIRED' : s.status, access: { valid_until: s.valid_until }, accounts: s.accounts.map(x => x.uid) });
      }

      const am = /^\/accounts\/([^/]+)\/(balances|transactions)$/.exec(path);
      if (am) {
        const a = eb.accounts.get(am[1]);
        if (!a) return res({ error: 'NOT_FOUND' }, 404);
        const owningSession = [...eb.sessions.values()].find(s => s.accounts.some(x => x.uid === a.uid));
        if (owningSession && owningSession.expired) return res({ error: 'SESSION_EXPIRED' }, 403);
        if (a.rate429) return res({ error: 'ASPSP_RATE_LIMIT_EXCEEDED' }, 429);
        if (am[2] === 'balances') return res(a.balances || { balances: [] });
        const pages = a.transactionPages || [[]];
        const idx = Number(u.searchParams.get('continuation_key') || 0);
        const page = pages[idx] || [];
        const next = idx + 1 < pages.length ? String(idx + 1) : undefined;
        return res(next ? { transactions: page, continuation_key: next } : { transactions: page });
      }
      return res({ error: 'UNHANDLED ' + path }, 500);
    }
  };
  return eb;
}

// ── Stores (Google Play + App Store Server API) ────────────────────────────
// Both hosts verify the JWT the broker signs, so the signing paths are
// covered end to end. Play: subscriptionsv2 keyed by purchase token. Apple:
// production 404s for sandbox transactions, the sandbox host answers.

export interface FakePlaySub {
  subscriptionState: string;
  productId: string;
  expiryTime: string;
  acknowledgementState?: string;
}

export interface FakeAppleSub {
  status: number;
  productId: string;
  expiresDate: number; // ms
  originalTransactionId: string;
  sandbox?: boolean;
  bundleId?: string;
}

export interface FakeStores {
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  calls: { method: string; url: string; body: string | null }[];
  tokenCalls: number;
  play: Map<string, FakePlaySub>;
  apple: Map<string, FakeAppleSub>;
  acknowledged: string[];
}

const jwsPayload = (obj: unknown): string => {
  const b = (s: string) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b(JSON.stringify({ alg: 'ES256' }))}.${b(JSON.stringify(obj))}.sig`;
};

export function fakeStores(keys: TestKeys, apple: AppleTestKeys): FakeStores {
  const st: FakeStores = {
    calls: [],
    tokenCalls: 0,
    play: new Map(),
    apple: new Map(),
    acknowledged: [],
    fetchImpl: async (input, init = {}) => {
      const u = new URL(input);
      const method = (init.method || 'GET').toUpperCase();
      const body = init.body ? String(init.body) : null;
      st.calls.push({ method, url: input, body });
      const res = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
      const headers = new Headers(init.headers || {});

      const verifyJwt = async (token: string, alg: 'RS256' | 'ES256'): Promise<Record<string, unknown> | null> => {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const header = JSON.parse(Buffer.from(b64urlToBytes(parts[0])).toString('utf8'));
        const payload = JSON.parse(Buffer.from(b64urlToBytes(parts[1])).toString('utf8'));
        const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
        const ok = alg === 'RS256'
          ? await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, keys.publicKey, b64urlToBytes(parts[2]), data)
          : await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, apple.publicKey, b64urlToBytes(parts[2]), data);
        if (!ok || header.alg !== alg) return null;
        return { ...payload, _kid: header.kid };
      };

      if (u.host === 'google.test' && u.pathname === '/token') {
        const params = new URLSearchParams(body || '');
        const claims = await verifyJwt(params.get('assertion') || '', 'RS256');
        if (!claims || claims.iss !== 'sa@stackd.test' || claims.aud !== 'https://google.test/token' || claims.scope !== 'https://www.googleapis.com/auth/androidpublisher') return res({ error: 'invalid_grant' }, 400);
        st.tokenCalls += 1;
        return res({ access_token: 'play-access-' + st.tokenCalls, expires_in: 3600, token_type: 'Bearer' });
      }

      if (u.host === 'play.test') {
        if (!/^Bearer play-access-\d+$/.test(headers.get('authorization') || '')) return res({ error: 'unauth' }, 401);
        const m = /\/purchases\/subscriptionsv2\/tokens\/([^/]+)$/.exec(u.pathname);
        if (m) {
          const sub = st.play.get(decodeURIComponent(m[1]));
          if (!sub) return res({ error: { code: 400, message: 'Invalid Value' } }, 400);
          return res({ subscriptionState: sub.subscriptionState, acknowledgementState: sub.acknowledgementState || 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', lineItems: [{ productId: sub.productId, expiryTime: sub.expiryTime }] });
        }
        const a = /\/purchases\/subscriptions\/([^/]+)\/tokens\/([^/]+):acknowledge$/.exec(u.pathname);
        if (a && method === 'POST') {
          st.acknowledged.push(decodeURIComponent(a[2]));
          const sub = st.play.get(decodeURIComponent(a[2]));
          if (sub) sub.acknowledgementState = 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
          return res({});
        }
        return res({ error: 'unhandled' }, 500);
      }

      if (u.host === 'apple.test' || u.host === 'apple-sandbox.test') {
        const claims = await verifyJwt((headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), 'ES256');
        if (!claims || claims.iss !== 'issuer-1' || claims.aud !== 'appstoreconnect-v1' || claims.bid !== 'com.stackd.finance' || claims._kid !== 'KEY123') return res({ errorCode: 4010000 }, 401);
        const m = /\/inapps\/v1\/subscriptions\/(\d+)$/.exec(u.pathname);
        if (!m) return res({ error: 'unhandled' }, 500);
        const sub = st.apple.get(m[1]);
        const isSandboxHost = u.host === 'apple-sandbox.test';
        if (!sub || (sub.sandbox && !isSandboxHost)) return res({ errorCode: sub ? 4040010 : 4040005 }, 404);
        return res({
          bundleId: sub.bundleId || 'com.stackd.finance',
          environment: isSandboxHost ? 'Sandbox' : 'Production',
          data: [{
            subscriptionGroupIdentifier: 'grp',
            lastTransactions: [{
              originalTransactionId: sub.originalTransactionId,
              status: sub.status,
              signedTransactionInfo: jwsPayload({ productId: sub.productId, expiresDate: sub.expiresDate, originalTransactionId: sub.originalTransactionId, environment: isSandboxHost ? 'Sandbox' : 'Production' }),
              signedRenewalInfo: jwsPayload({})
            }]
          }]
        });
      }
      return res({ error: 'unhandled ' + input }, 500);
    }
  };
  return st;
}
