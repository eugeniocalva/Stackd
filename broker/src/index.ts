// Stack'd Bank Connect broker — worker entry (docs/bank-connect-plan.md §2).
//
// Pass-through by design: nothing that comes back from the aggregator is
// stored or logged; only ownership + entitlement state lives in the Durable
// Objects. Every data endpoint is ownership-checked against the caller's
// owner record, and unknown refs/accounts are 404 — never 403 — so a probe
// cannot distinguish "not yours" from "does not exist".
//
// Aggregator = Enable Banking (src/enable-banking.ts, the only file that
// knows about it). The bank redirects the user to /v1/connect/return with
// `code` + `state`; the broker exchanges the code for a session right there,
// so the app's later /v1/connect/status is a read of the owner record.
import type { Env, Config } from './env';
import { parseConfig } from './env';
import { EnableBanking, AggregatorError, type Institution, type PsuContext } from './enable-banking';
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
  agg: EnableBanking;
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
const REF_RE = /^([0-9a-f]{16})_[0-9a-f]{16}$/;

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

async function institutionsFor(country: string, c: Ctx): Promise<Institution[]> {
  const key = `${c.origin}/v1/institutions?country=${country}`;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return (await hit.json()) as Institution[];
  }
  const list = await c.agg.institutions(country);
  if (cache && list.length) {
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
  return m ? m[1].toLowerCase() : 'en';
}

function returnUrl(c: Ctx): string {
  return `${c.cfg.publicUrl || c.origin}/v1/connect/return`;
}

async function handleConnectStart(request: Request, session: Session, c: Ctx): Promise<Response> {
  requireEntitled(session, c);
  const body = await readJson(request);
  const country = String(body.country || '').toUpperCase();
  const institutionId = String(body.institutionId || '').trim();
  if (!COUNTRY_RE.test(country)) throw new HttpError(400, 'country_required');
  if (!institutionId || institutionId.length > 200) throw new HttpError(400, 'institution_required');
  if (Object.keys(session.record.requisitions).length >= c.cfg.ownerMaxConnections) throw new HttpError(409, 'connection_limit');

  const inst = (await institutionsFor(country, c)).find(i => i.id === institutionId);
  if (!inst) throw new HttpError(400, 'unknown_institution');
  const historyDays = clamp(Number(body.historyDays) || 90, 1, inst.historyDays);
  const validityDays = clamp(Number(body.validityDays) || inst.maxValidityDays, 1, inst.maxValidityDays);

  const reserved = await c.system.reserve(c.cfg.maxConnections);
  if (!reserved.ok) throw new HttpError(503, 'capacity');

  try {
    const ref = `${session.ownerId}_${randomHex(8)}`;
    const auth = await c.agg.startAuth({
      name: inst.name,
      country: inst.country,
      validUntil: iso(c.now() + validityDays * DAY_MS),
      state: ref,
      redirectUrl: returnUrl(c),
      language: userLanguage(request)
    });
    const rec: ReqRecord = {
      ref,
      authorizationId: auth.authorizationId,
      sessionId: null,
      institutionId: inst.id,
      institutionName: inst.name,
      institutionLogo: inst.logo,
      createdAt: iso(c.now()),
      status: 'CR',
      accounts: null,
      historyDays,
      validityDays,
      expiresAt: null,
      linkedAt: null,
      lastError: null
    };
    await session.owner.addRequisition(rec);
    return json({ ref, bankRedirectUrl: auth.url, historyDays, validityDays }, 201);
  } catch (e) {
    await c.system.release();
    throw e;
  }
}

// The bank sends the user back here (App Link on a verified install, else the
// hand-off page). No device auth: `state` is our ref, which embeds the owner
// id and must match a CR record; the code is single-use and short-lived.
async function handleConnectReturn(url: URL, c: Ctx): Promise<Response> {
  const ref = url.searchParams.get('state') || url.searchParams.get('ref') || '';
  const code = url.searchParams.get('code') || '';
  const error = url.searchParams.get('error') || '';
  const details = url.searchParams.get('error_description') || url.searchParams.get('details') || '';
  const page = (p: { error?: string; details?: string }) => returnPage({ scheme: c.cfg.appScheme, ref, error: p.error || '', details: p.details || '' });

  const m = REF_RE.exec(ref);
  if (!m) return page({ error: 'invalid_ref', details: 'This link is not valid.' });
  const owner = new OwnerClient(c.env, m[1]);
  const record = await owner.record();
  const rec = record ? record.requisitions[ref] : undefined;
  if (!rec) return page({ error: 'invalid_ref', details: 'This link is not valid.' });
  if (rec.status === 'LN') return page({}); // idempotent: reload of the return page

  if (error || !code) {
    const cancelled = /cancel/i.test(details) || /access_denied/i.test(error) && /cancel/i.test(details);
    await owner.updateRequisition(ref, { status: cancelled ? 'UA' : 'RJ', lastError: (error || 'no_code').slice(0, 100) });
    return page({ error: error || 'no_code', details: details || 'The bank did not return an authorization.' });
  }

  try {
    const s = await c.agg.createSession(code);
    const accounts = (s.accounts || []).map(a => ({
      id: a.uid,
      ibanTail: String((a.account_id && a.account_id.iban) || '').slice(-4),
      currency: a.currency || null,
      name: a.name || a.product || null
    }));
    const expiresAt = s.access && s.access.valid_until ? s.access.valid_until : iso(c.now() + rec.validityDays * DAY_MS);
    await owner.updateRequisition(ref, { status: 'LN', sessionId: s.session_id, accounts, linkedAt: iso(c.now()), expiresAt, lastError: null });
    return page({});
  } catch (e) {
    const codeStr = e instanceof AggregatorError ? e.code : 'internal';
    await owner.updateRequisition(ref, { status: 'RJ', lastError: codeStr });
    return page({ error: codeStr, details: 'The connection could not be completed. Please try again.' });
  }
}

function publicRequisition(rec: ReqRecord, now: number): Record<string, unknown> {
  const expired = rec.status === 'LN' && rec.expiresAt && Date.parse(rec.expiresAt) <= now;
  return {
    ref: rec.ref,
    status: expired ? 'EX' : rec.status,
    institutionId: rec.institutionId,
    institutionName: rec.institutionName,
    institutionLogo: rec.institutionLogo,
    accounts: rec.accounts || [],
    historyDays: rec.historyDays,
    validityDays: rec.validityDays,
    createdAt: rec.createdAt,
    linkedAt: rec.linkedAt,
    expiresAt: rec.expiresAt,
    lastError: rec.lastError || null
  };
}

async function handleConnectStatus(url: URL, session: Session, c: Ctx): Promise<Response> {
  const ref = url.searchParams.get('ref') || '';
  const rec = session.record.requisitions[ref];
  if (!rec) throw new HttpError(404, 'unknown_ref');
  return json(publicRequisition(rec, c.now()));
}

function findAccount(record: OwnerRecord, accountId: string): ReqRecord | null {
  for (const rec of Object.values(record.requisitions)) {
    if (rec.status === 'LN' && rec.accounts && rec.accounts.some(a => a.id === accountId)) return rec;
  }
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function handleAccountData(kind: 'transactions' | 'balances', accountId: string, url: URL, request: Request, session: Session, c: Ctx): Promise<Response> {
  requireEntitled(session, c);
  const rec = findAccount(session.record, accountId);
  if (!rec) throw new HttpError(404, 'unknown_account');
  if (rec.expiresAt && Date.parse(rec.expiresAt) <= c.now()) throw new HttpError(410, 'consent_expired');
  const psu: PsuContext = { ip: c.ip, userAgent: request.headers.get('user-agent') };
  try {
    if (kind === 'balances') return json(await c.agg.balances(accountId, psu));
    const from = url.searchParams.get('date_from') || undefined;
    const to = url.searchParams.get('date_to') || undefined;
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) throw new HttpError(400, 'invalid_date');
    return json(await c.agg.transactions(accountId, from, to, psu));
  } catch (e) {
    if (e instanceof AggregatorError && e.status === 410) {
      await session.owner.updateRequisition(rec.ref, { status: 'EX', lastError: e.code });
    }
    throw e;
  }
}

async function handleRevoke(ref: string, session: Session, c: Ctx): Promise<Response> {
  const rec = session.record.requisitions[ref];
  if (!rec) throw new HttpError(404, 'unknown_ref');
  if (rec.sessionId) await c.agg.deleteSession(rec.sessionId);
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

  if (path === '/healthz' && method === 'GET') return json({ ok: true, mode: c.cfg.mode, service: 'stackd-broker', aggregator: 'enablebanking' });
  if (path === '/.well-known/assetlinks.json' && method === 'GET') return assetLinks(c.cfg);
  if (path === '/.well-known/apple-app-site-association' && method === 'GET') return appleAssociation(c.cfg);
  if (path === '/v1/connect/return' && method === 'GET') return handleConnectReturn(url, c);
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
    return json({ connections: Object.values(session.record.requisitions).map(r => publicRequisition(r, c.now())) });
  }
  const acc = /^\/v1\/accounts\/([^/]+)\/(transactions|balances)$/.exec(path);
  if (acc && method === 'GET') return handleAccountData(acc[2] as 'transactions' | 'balances', decodeURIComponent(acc[1]), url, request, session, c);
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
            agg: new EnableBanking(env, cfg, fetchImpl, now),
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
        } else if (e instanceof AggregatorError) {
          // Shape-only diagnostics ride along on staging (open mode) — the
          // tail websocket is not reachable from every network.
          res = json(cfg.mode === 'open' && e.diag ? { error: e.code, diag: e.diag } : { error: e.code }, e.status);
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
