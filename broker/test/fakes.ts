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

export function makeEnv(keys: TestKeys, overrides: Partial<Env> = {}): Env & { owners: FakeNamespace; systems: FakeNamespace; rates: FakeNamespace } {
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
