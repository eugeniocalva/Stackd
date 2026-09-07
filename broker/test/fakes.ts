// In-memory stand-ins for the Workers runtime pieces the broker touches:
// Durable Object namespaces/stubs/storage, and the GoCardless API behind an
// injected fetch. Same call surface as production, so the handlers under
// test are the real ones.
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

export function makeEnv(overrides: Partial<Env> = {}): Env & { owners: FakeNamespace; systems: FakeNamespace; rates: FakeNamespace } {
  const ref: { env: Env | null } = { env: null };
  const owners = new FakeNamespace(OwnerDO, ref);
  const systems = new FakeNamespace(SystemDO, ref);
  const rates = new FakeNamespace(RateDO, ref);
  const env = {
    OWNER_DO: owners as unknown as DurableObjectNamespace,
    SYSTEM_DO: systems as unknown as DurableObjectNamespace,
    RATE_DO: rates as unknown as DurableObjectNamespace,
    GC_SECRET_ID: 'sid',
    GC_SECRET_KEY: 'skey',
    GC_BASE_URL: 'https://gc.test/api/v2',
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

// ── GoCardless ─────────────────────────────────────────────────────────────

export interface FakeAccount {
  iban: string;
  currency: string;
  name?: string;
  balances?: unknown;
  transactions?: unknown;
  rate429?: boolean;
}

export interface FakeGc {
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  calls: { method: string; path: string; body: unknown; auth: string | null }[];
  tokenCalls: number;
  requisitions: Map<string, { id: string; status: string; accounts: string[]; institution_id: string; agreement: string; reference: string; redirect: string; link: string }>;
  agreements: Map<string, unknown>;
  accounts: Map<string, FakeAccount>;
  institutions: Record<string, unknown[]>;
  expireToken(): void;
  global429: boolean;
  link(requisitionId: string, accountIds: string[]): void;
  setStatus(requisitionId: string, status: string): void;
}

const INSTITUTIONS: Record<string, unknown[]> = {
  IT: [
    { id: 'SANDBOXFINANCE_SFIN0000', name: 'Sandbox Finance', bic: 'SFIN0000', logo: 'https://cdn.test/sandbox.png', countries: ['IT'], transaction_total_days: '90', max_access_valid_for_days: '90', supported_features: ['big', 'array'] },
    { id: 'BIGBANK_BIGBITMM', name: 'Big Bank', bic: 'BIGBITMM', logo: 'https://cdn.test/big.png', countries: ['IT'], transaction_total_days: '730', max_access_valid_for_days: '180', supported_features: [] }
  ],
  GB: [
    { id: 'GBBANK_GBBAGB2L', name: 'GB Bank', bic: 'GBBAGB2L', logo: '', countries: ['GB'], transaction_total_days: '365', max_access_valid_for_days: '180' }
  ]
};

export function fakeGoCardless(): FakeGc {
  let seq = 0;
  let validToken = '';
  const gc: FakeGc = {
    calls: [],
    tokenCalls: 0,
    requisitions: new Map(),
    agreements: new Map(),
    accounts: new Map(),
    institutions: INSTITUTIONS,
    global429: false,
    expireToken() {
      validToken = '';
    },
    link(requisitionId, accountIds) {
      const r = gc.requisitions.get(requisitionId);
      if (!r) throw new Error('no requisition ' + requisitionId);
      r.status = 'LN';
      r.accounts = accountIds;
    },
    setStatus(requisitionId, status) {
      const r = gc.requisitions.get(requisitionId);
      if (!r) throw new Error('no requisition ' + requisitionId);
      r.status = status;
    },
    fetchImpl: async (input, init = {}) => {
      const u = new URL(input);
      const path = u.pathname.replace(/^\/api\/v2/, '');
      const method = (init.method || 'GET').toUpperCase();
      const headers = new Headers(init.headers || {});
      const body = init.body ? JSON.parse(String(init.body)) : null;
      gc.calls.push({ method, path: path + u.search, body, auth: headers.get('authorization') });
      const res = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

      if (path === '/token/new/') {
        gc.tokenCalls += 1;
        validToken = 'tok' + gc.tokenCalls;
        return res({ access: validToken, access_expires: 86400, refresh: 'r', refresh_expires: 2592000 });
      }
      if (headers.get('authorization') !== `Bearer ${validToken}`) return res({ detail: 'Invalid token' }, 401);

      if (path === '/institutions/') {
        if (gc.global429) return res({ detail: 'rate' }, 429);
        return res(gc.institutions[u.searchParams.get('country') || ''] || []);
      }
      if (path === '/agreements/enduser/' && method === 'POST') {
        const id = `agr_${++seq}`;
        gc.agreements.set(id, body);
        return res({ id, ...body }, 201);
      }
      if (path === '/requisitions/' && method === 'POST') {
        const id = `req_${++seq}`;
        const r = { id, status: 'CR', accounts: [] as string[], institution_id: body.institution_id, agreement: body.agreement, reference: body.reference, redirect: body.redirect, link: `https://ob.gocardless.com/psd2/start/${id}/${body.institution_id}` };
        gc.requisitions.set(id, r);
        return res(r, 201);
      }
      const rq = /^\/requisitions\/([^/]+)\/$/.exec(path);
      if (rq) {
        const r = gc.requisitions.get(rq[1]);
        if (!r) return res({ detail: 'Not found' }, 404);
        if (method === 'DELETE') {
          gc.requisitions.delete(rq[1]);
          return res({ summary: 'deleted' });
        }
        return res(r);
      }
      const ac = /^\/accounts\/([^/]+)\/(details|balances|transactions)\/$/.exec(path);
      if (ac) {
        const a = gc.accounts.get(ac[1]);
        if (!a) return res({ detail: 'Not found' }, 404);
        if (a.rate429) return res({ detail: 'daily limit' }, 429);
        if (ac[2] === 'details') return res({ account: { iban: a.iban, currency: a.currency, name: a.name } });
        if (ac[2] === 'balances') return res(a.balances || { balances: [] });
        return res(a.transactions || { transactions: { booked: [], pending: [] } });
      }
      return res({ detail: 'unhandled ' + path }, 500);
    }
  };
  return gc;
}
