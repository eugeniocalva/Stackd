// Stack'd Bank Connect broker — worker entry (docs/bank-connect-plan.md §2).
//
// Pass-through by design: nothing that comes back from GoCardless is stored
// or logged; only ownership + entitlement state lives in the Durable
// Objects. Every data endpoint is ownership-checked against the caller's
// owner record, and unknown refs/accounts are 404 — never 403 — so a probe
// cannot distinguish "not yours" from "does not exist".
import type { Env, Config } from './env';
import { parseConfig } from './env';
import { GoCardless, GcError, type GcInstitution } from './gocardless';
import { mintToken, parseBearer, sha256Hex, randomHex } from './auth';
import { OwnerClient, SystemClient, RateClient, type OwnerRecord, type ReqRecord, type Entitlement } from './durable-objects';
import { returnPage } from './html';

export { OwnerDO, SystemDO, RateDO } from './durable-objects';

export interface Deps {
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
}

class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message || code);
  }
}

interface Session {
  ownerId: string;
  record: OwnerRecord;
  owner: OwnerClient;
}

interface Ctx {
  env: Env;
  cfg: Config;
  gc: GoCardless;
  system: SystemClient;
  rate: RateClient;
  now: () => number;
  ip: string;
  origin: string;
}

const json = (data: unknown, status = 200, extra?: Record<string, string>): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(extra || {}) } });

const iso = (ms: number): string => new Date(ms).toISOString();
const DAY_MS = 86400000;

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-stackd-client,x-stackd-attest',
    'access-control-max-age': '600',
    vary: 'origin'
  };
}

// ── Entitlement ────────────────────────────────────────────────────────────

function isEntitled(record: OwnerRecord, cfg: Config, now: number): boolean {
  if (cfg.mode === 'open') return true;
  const e = record.entitlement;
  if (!e || !e.active) return false;
  return !e.expiresAt || Date.parse(e.expiresAt) > now;
}

function requireEntitled(session: Session, c: Ctx): void {
  if (!isEntitled(session.record, c.cfg, c.now())) throw new HttpError(402, 'subscription_required');
}

// ── Sessions ───────────────────────────────────────────────────────────────

async function requireDevice(request: Request, c: Ctx): Promise<Session> {
  const parsed = parseBearer(request.headers.get('authorization'));
  if (!parsed) throw new HttpError(401, 'device_token_required');
  const owner = new OwnerClient(c.env, parsed.ownerId);
  const v = await owner.verify(await sha256Hex(parsed.secret), c.cfg.ownerPerHour, 3600000);
  if (v.rateLimited) throw new HttpError(429, 'rate_limited');
  if (!v.ok || !v.record) throw new HttpError(401, 'invalid_device_token');
  return { ownerId: parsed.ownerId, record: v.record, owner };
}

// ── Institutions ───────────────────────────────────────────────────────────

const COUNTRY_RE = /^[A-Za-z]{2}$/;

function trimInstitution(i: GcInstitution): GcInstitution {
  return {
    id: i.id,
    name: i.name,
    bic: i.bic,
    logo: i.logo,
    countries: i.countries,
    transaction_total_days: i.transaction_total_days,
    max_access_valid_for_days: i.max_access_valid_for_days
  };
}

async function institutionsFor(country: string, c: Ctx): Promise<GcInstitution[]> {
  const key = `${c.origin}/v1/institutions?country=${country}`;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as GcInstitution[];
  }
  const list = (await c.gc.institutions(country)).map(trimInstitution);
  if (cache) {
    await cache.put(key, new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }));
  }
  return list;
}

async function handleInstitutions(url: URL, c: Ctx): Promise<Response> {
  const country = (url.searchParams.get('country') || '').toUpperCase();
  if (!COUNTRY_RE.test(country)) throw new HttpError(400, 'country_required');
  if (!(await c.rate.hit(`inst:${c.ip}`, c.cfg.institutionsPerMinute, 60000))) throw new HttpError(429, 'rate_limited');
  const list = await institutionsFor(country, c);
  return json(list, 200, { 'cache-control': 'public, max-age=3600' });
}

// ── Entitlement verify (+ first-contact device mint) ───────────────────────

async function handleEntitlementVerify(request: Request, c: Ctx): Promise<Response> {
  const body = await readJson(request);
  const parsed = parseBearer(request.headers.get('authorization'));
  let ownerId: string;
  let owner: OwnerClient;
  let record: OwnerRecord;
  let deviceToken: string | null = null;

  if (parsed) {
    owner = new OwnerClient(c.env, parsed.ownerId);
    const v = await owner.verify(await sha256Hex(parsed.secret), c.cfg.ownerPerHour, 3600000);
    if (v.rateLimited) throw new HttpError(429, 'rate_limited');
    if (!v.ok || !v.record) throw new HttpError(401, 'invalid_device_token');
    ownerId = parsed.ownerId;
    record = v.record;
  } else {
    if (!(await c.rate.hit(`mint:${c.ip}`, c.cfg.mintPerHour, 3600000))) throw new HttpError(429, 'rate_limited');
    const minted = mintToken();
    ownerId = minted.ownerId;
    owner = new OwnerClient(c.env, ownerId);
    record = await owner.addDevice(await sha256Hex(minted.secret), body.kind === 'web' ? 'web' : 'native');
    deviceToken = minted.token;
  }

  let entitlement: Entitlement;
  if (c.cfg.mode === 'open') {
    entitlement = await owner.setEntitlement({
      active: true,
      platform: 'open',
      productId: 'staging',
      expiresAt: iso(c.now() + 365 * DAY_MS),
      lastVerifiedAt: iso(c.now())
    });
  } else if (body.platform || body.receipt || body.purchaseToken) {
    // B5: Google Play Developer API / App Store Server API verification.
    throw new HttpError(501, 'store_verification_not_implemented');
  } else {
    entitlement = record.entitlement;
  }

  const res: Record<string, unknown> = {
    ownerId,
    active: isEntitled({ ...record, entitlement }, c.cfg, c.now()),
    expiresAt: entitlement.expiresAt || null,
    mode: c.cfg.mode
  };
  if (deviceToken) res.deviceToken = deviceToken;
  return json(res, deviceToken ? 201 : 200);
}

// ── Connect ────────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

function userLanguage(request: Request): string {
  const al = request.headers.get('accept-language') || '';
  const m = /^([a-z]{2})/i.exec(al.trim());
  return m ? m[1].toUpperCase() : 'EN';
}

async function handleConnectStart(request: Request, session: Session, c: Ctx): Promise<Response> {
  requireEntitled(session, c);
  const body = await readJson(request);
  const country = String(body.country || '').toUpperCase();
  const institutionId = String(body.institutionId || '');
  if (!COUNTRY_RE.test(country)) throw new HttpError(400, 'country_required');
  if (!institutionId || institutionId.length > 100) throw new HttpError(400, 'institution_required');
  if (Object.keys(session.record.requisitions).length >= c.cfg.ownerMaxConnections) throw new HttpError(409, 'connection_limit');

  const inst = (await institutionsFor(country, c)).find(i => i.id === instId(institutionId));
  if (!inst) throw new HttpError(400, 'unknown_institution');
  const instHistory = Number(inst.transaction_total_days || 90) || 90;
  const instValidity = Number(inst.max_access_valid_for_days || 90) || 90;
  const historyDays = clamp(Number(body.historyDays) || 90, 1, instHistory);
  const validityDays = clamp(Number(body.validityDays) || instValidity, 1, instValidity);

  const reserved = await c.system.reserve(c.cfg.maxConnections);
  if (!reserved.ok) throw new HttpError(503, 'capacity');

  try {
    const agreement = await c.gc.createAgreement({ institutionId: inst.id, historyDays, validityDays });
    const ref = `${session.ownerId}_${randomHex(8)}`;
    const redirect = `${c.cfg.publicUrl || c.origin}/v1/connect/return`;
    const req = await c.gc.createRequisition({ redirect, institutionId: inst.id, agreementId: agreement.id, reference: ref, userLanguage: userLanguage(request) });
    if (!req.link) throw new HttpError(502, 'aggregator_no_link');
    const rec: ReqRecord = {
      ref,
      requisitionId: req.id,
      agreementId: agreement.id,
      institutionId: inst.id,
      institutionName: inst.name,
      institutionLogo: inst.logo || null,
      createdAt: iso(c.now()),
      status: req.status || 'CR',
      accounts: null,
      historyDays,
      validityDays,
      expiresAt: null,
      linkedAt: null
    };
    await session.owner.addRequisition(rec);
    return json({ ref, bankRedirectUrl: req.link, historyDays, validityDays }, 201);
  } catch (e) {
    await c.system.release();
    throw e;
  }
}

const instId = (s: string): string => s.trim();

function publicRequisition(rec: ReqRecord): Record<string, unknown> {
  return {
    ref: rec.ref,
    status: rec.status,
    institutionId: rec.institutionId,
    institutionName: rec.institutionName,
    institutionLogo: rec.institutionLogo,
    accounts: rec.accounts || [],
    historyDays: rec.historyDays,
    validityDays: rec.validityDays,
    createdAt: rec.createdAt,
    linkedAt: rec.linkedAt,
    expiresAt: rec.expiresAt
  };
}

async function handleConnectStatus(url: URL, session: Session, c: Ctx): Promise<Response> {
  const ref = url.searchParams.get('ref') || '';
  const rec = session.record.requisitions[ref];
  if (!rec) throw new HttpError(404, 'unknown_ref');

  const gcReq = await c.gc.getRequisition(rec.requisitionId);
  const status = gcReq.status || rec.status;
  const patch: Partial<ReqRecord> = {};
  if (status !== rec.status) patch.status = status;

  if (status === 'LN' && !rec.accounts) {
    // Resolve the linked accounts once; details calls count against the
    // bank's per-account daily budget, so the tails are kept in the DO.
    const accounts = [];
    for (const id of gcReq.accounts || []) {
      const d = await c.gc.accountDetails(id);
      const a = (d && d.account) || {};
      accounts.push({ id, ibanTail: String(a.iban || '').slice(-4), currency: a.currency || null, name: a.name || a.product || null });
    }
    patch.accounts = accounts;
    patch.linkedAt = iso(c.now());
    patch.expiresAt = iso(c.now() + rec.validityDays * DAY_MS);
  }
  if (Object.keys(patch).length) await session.owner.updateRequisition(ref, patch);
  return json(publicRequisition({ ...rec, ...patch }));
}

function findAccount(record: OwnerRecord, accountId: string): ReqRecord | null {
  for (const rec of Object.values(record.requisitions)) {
    if (rec.accounts && rec.accounts.some(a => a.id === accountId)) return rec;
  }
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function handleAccountData(kind: 'transactions' | 'balances', accountId: string, url: URL, session: Session, c: Ctx): Promise<Response> {
  requireEntitled(session, c);
  if (!findAccount(session.record, accountId)) throw new HttpError(404, 'unknown_account');
  if (kind === 'balances') return json(await c.gc.balances(accountId));
  const from = url.searchParams.get('date_from') || undefined;
  const to = url.searchParams.get('date_to') || undefined;
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) throw new HttpError(400, 'invalid_date');
  return json(await c.gc.transactions(accountId, from, to));
}

async function handleRevoke(ref: string, session: Session, c: Ctx): Promise<Response> {
  const rec = session.record.requisitions[ref];
  if (!rec) throw new HttpError(404, 'unknown_ref');
  await c.gc.deleteRequisition(rec.requisitionId);
  await session.owner.removeRequisition(ref);
  await c.system.release();
  return json({ ok: true, ref });
}

// ── Well-known (D-C7) ──────────────────────────────────────────────────────

function assetLinks(cfg: Config): Response {
  return json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: cfg.androidPackage, sha256_cert_fingerprints: cfg.androidFingerprints }
  }], 200, { 'cache-control': 'public, max-age=3600' });
}

function appleAssociation(cfg: Config): Response {
  const details = cfg.iosAppId
    ? [{ appID: cfg.iosAppId, paths: ['/v1/connect/return*'] }]
    : [];
  return json({ applinks: { apps: [], details } }, 200, { 'cache-control': 'public, max-age=3600' });
}

// ── Router ─────────────────────────────────────────────────────────────────

async function route(request: Request, url: URL, c: Ctx): Promise<Response> {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/healthz' && method === 'GET') return json({ ok: true, mode: c.cfg.mode, service: 'stackd-broker' });
  if (path === '/.well-known/assetlinks.json' && method === 'GET') return assetLinks(c.cfg);
  if (path === '/.well-known/apple-app-site-association' && method === 'GET') return appleAssociation(c.cfg);
  if (path === '/v1/connect/return' && method === 'GET') {
    return returnPage({
      scheme: c.cfg.appScheme,
      ref: url.searchParams.get('ref') || '',
      error: url.searchParams.get('error') || '',
      details: url.searchParams.get('details') || ''
    });
  }
  if (!path.startsWith('/v1/')) throw new HttpError(404, 'not_found');

  // Build-time client id: worthless against extraction, filters lazy
  // scanners; X-Stackd-Attest (D-C5) lands here later.
  if (request.headers.get('x-stackd-client') !== c.cfg.clientId) throw new HttpError(403, 'client_required');

  if (path === '/v1/institutions' && method === 'GET') return handleInstitutions(url, c);
  if (path === '/v1/entitlement/verify' && method === 'POST') return handleEntitlementVerify(request, c);

  const session = await requireDevice(request, c);
  if (path === '/v1/connect/start' && method === 'POST') return handleConnectStart(request, session, c);
  if (path === '/v1/connect/status' && method === 'GET') return handleConnectStatus(url, session, c);
  if (path === '/v1/connections' && method === 'GET') {
    return json({ connections: Object.values(session.record.requisitions).map(publicRequisition) });
  }
  const acc = /^\/v1\/accounts\/([^/]+)\/(transactions|balances)$/.exec(path);
  if (acc && method === 'GET') return handleAccountData(acc[2] as 'transactions' | 'balances', decodeURIComponent(acc[1]), url, session, c);
  const del = /^\/v1\/connections\/([^/]+)$/.exec(path);
  if (del && method === 'DELETE') return handleRevoke(decodeURIComponent(del[1]), session, c);

  throw new HttpError(404, 'not_found');
}

export function createApp(deps: Deps = {}) {
  const fetchImpl = deps.fetch || ((input: string, init?: RequestInit) => fetch(input, init));
  const now = deps.now || (() => Date.now());
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const cfg = parseConfig(env);
      const url = new URL(request.url);
      const cors = corsHeaders(request.headers.get('origin'), cfg.allowedOrigins);
      const started = now();
      let res: Response;
      try {
        if (request.method === 'OPTIONS') {
          res = new Response(null, { status: 204 });
        } else {
          const c: Ctx = {
            env,
            cfg,
            gc: new GoCardless(env, cfg, fetchImpl, now),
            system: new SystemClient(env),
            rate: new RateClient(env),
            now,
            ip: request.headers.get('cf-connecting-ip') || 'unknown',
            origin: url.origin
          };
          res = await route(request, url, c);
        }
      } catch (e) {
        if (e instanceof HttpError) {
          res = json({ error: e.code }, e.status);
        } else if (e instanceof GcError) {
          res = json({ error: e.code }, e.status);
        } else {
          // Message only — never a body, never a header.
          console.log(JSON.stringify({ level: 'error', p: url.pathname, err: e instanceof Error ? e.message : String(e) }));
          res = json({ error: 'internal' }, 500);
        }
      }
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      headers.set('x-content-type-options', 'nosniff');
      res = new Response(res.body, { status: res.status, headers });
      console.log(JSON.stringify({ m: request.method, p: url.pathname, s: res.status, ms: now() - started }));
      return res;
    }
  };
}

export default createApp();
