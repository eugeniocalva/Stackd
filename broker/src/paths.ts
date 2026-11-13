// 1.3.0 (audit, logs): what a log line may say about a path. Our routes carry
// Enable Banking account uids (/v1/accounts/:id/…), connection refs
// (/v1/connections/:ref, whose prefix is the owner id) and web device ids;
// the aggregator's carry session ids and account uids. A log line names the
// route PATTERN only, and anything not in these tables is `other` — never
// the raw path. Query strings never reach this (callers pass a pathname).

const EXACT = new Set([
  // broker routes (src/index.ts `route`)
  '/healthz',
  '/v1/ops/status',
  '/v1/ops/pause',
  '/.well-known/assetlinks.json',
  '/.well-known/apple-app-site-association',
  '/v1/connect/return',
  '/v1/institutions',
  '/v1/entitlement/verify',
  '/v1/pair/claim',
  '/v1/pair/code',
  '/v1/session',
  '/v1/session/logout',
  '/v1/devices',
  '/v1/connect/start',
  '/v1/connect/status',
  '/v1/connections',
  // Enable Banking (src/enable-banking.ts)
  '/aspsps',
  '/auth',
  '/sessions'
]);

const PATTERNS: [RegExp, string][] = [
  [/^\/v1\/accounts\/[^/]+\/transactions$/, '/v1/accounts/:id/transactions'],
  [/^\/v1\/accounts\/[^/]+\/balances$/, '/v1/accounts/:id/balances'],
  [/^\/v1\/connections\/[^/]+$/, '/v1/connections/:ref'],
  [/^\/v1\/devices\/[^/]+$/, '/v1/devices/:id'],
  [/^\/accounts\/[^/]+\/transactions$/, '/accounts/:id/transactions'],
  [/^\/accounts\/[^/]+\/balances$/, '/accounts/:id/balances'],
  [/^\/sessions\/[^/]+$/, '/sessions/:id']
];

export function pathPattern(pathname: string): string {
  const p = String(pathname || '').split('?')[0];
  if (EXACT.has(p)) return p;
  for (const [re, name] of PATTERNS) if (re.test(p)) return name;
  return 'other';
}
