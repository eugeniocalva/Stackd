#!/usr/bin/env node
// Staging smoke test — drives a deployed broker end to end against Enable
// Banking's sandbox "Mock ASPSP". Prints the bank link to open by hand; the
// bank sends the browser back to the broker, which links the accounts.
//
//   node scripts/smoke.mjs https://api-staging.stackdplatform.com
//   node scripts/smoke.mjs <url> status <deviceToken> <ref>     # after the bank leg
//
// Needs the worker deployed with EB_APP_ID (var) and EB_PRIVATE_KEY (secret).
const [base, cmd = 'connect', tokenArg, refArg] = process.argv.slice(2);
if (!base) {
  console.error('usage: node scripts/smoke.mjs <broker-url> [connect|status <token> <ref>]');
  process.exit(2);
}
const CLIENT = 'stackd-web';
const COUNTRY = process.env.SMOKE_COUNTRY || 'IT';
const BANK = process.env.SMOKE_BANK || 'Mock ASPSP';

const call = async (path, { method = 'GET', body, token } = {}) => {
  const headers = { 'x-stackd-client': CLIENT, accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base.replace(/\/$/, '') + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* html */ }
  console.log(`${method} ${path} → ${res.status}`);
  return { status: res.status, data };
};

const fail = (msg) => { console.error('FAIL:', msg); process.exit(1); };

if (cmd === 'status') {
  if (!tokenArg || !refArg) fail('status needs <token> <ref>');
  const st = await call(`/v1/connect/status?ref=${encodeURIComponent(refArg)}`, { token: tokenArg });
  console.log(JSON.stringify(st.data, null, 2));
  if (st.data.status === 'LN' && st.data.accounts.length) {
    const id = st.data.accounts[0].id;
    const bal = await call(`/v1/accounts/${id}/balances`, { token: tokenArg });
    console.log('balances:', JSON.stringify(bal.data).slice(0, 300));
    const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const tx = await call(`/v1/accounts/${id}/transactions?date_from=${from}`, { token: tokenArg });
    const n = tx.data && Array.isArray(tx.data.transactions) ? tx.data.transactions.length : 'n/a';
    console.log('transactions:', n, tx.data && tx.data.truncated ? '(truncated)' : '');
    if (n && n !== 'n/a') console.log('first:', JSON.stringify(tx.data.transactions[0]).slice(0, 400));
  }
  process.exit(0);
}

const health = await call('/healthz');
if (!health.data.ok) fail('healthz');
console.log('mode:', health.data.mode, 'aggregator:', health.data.aggregator);

const inst = await call(`/v1/institutions?country=${COUNTRY}`);
if (inst.status !== 200) fail(`institutions: ${JSON.stringify(inst.data)}`);
console.log(`institutions(${COUNTRY}): ${inst.data.length}`);
const bank = inst.data.find(i => i.name === BANK) || inst.data.find(i => i.sandbox);
if (!bank) fail(`"${BANK}" not in the ${COUNTRY} list (set SMOKE_BANK / SMOKE_COUNTRY)`);
console.log('bank:', bank.id, `(consent up to ${bank.maxValidityDays} days)`);

const ent = await call('/v1/entitlement/verify', { method: 'POST', body: { kind: 'native' } });
if (ent.status !== 201) fail(`verify: ${JSON.stringify(ent.data)}`);
const token = ent.data.deviceToken;
console.log('ownerId:', ent.data.ownerId, 'active:', ent.data.active);

const start = await call('/v1/connect/start', { method: 'POST', token, body: { country: COUNTRY, institutionId: bank.id, historyDays: 90, validityDays: 90 } });
if (start.status !== 201) fail(`connect/start: ${JSON.stringify(start.data)}`);
console.log('\nref:', start.data.ref);
console.log('deviceToken:', token);
console.log('\nOpen this in a browser and complete the bank flow:\n  ' + start.data.bankRedirectUrl);
console.log(`\nThen:\n  node scripts/smoke.mjs ${base} status ${token} ${start.data.ref}`);
