// The GoCardless redirect target. On a verified App Link / Universal Link
// the OS opens the app before this page is ever reached; this is what the
// user sees when it is not (staging on workers.dev, app not installed, or a
// desktop browser): a hand-off to the custom-scheme fallback (D-C7).
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));

export interface ReturnPageParams {
  scheme: string;
  ref: string;
  error: string;
  details: string;
}

export function returnPage(p: ReturnPageParams): Response {
  const q = new URLSearchParams();
  if (p.ref) q.set('ref', p.ref);
  if (p.error) q.set('error', p.error);
  if (p.details) q.set('details', p.details);
  const deepLink = `${p.scheme}://connect/return?${q.toString()}`;
  const failed = !!p.error;
  const title = failed ? 'The bank did not complete the connection' : 'Back to Stack’d';
  const body = failed
    ? `<p class="muted">${esc(p.details || p.error)}</p><p>Open Stack’d to try again.</p>`
    : '<p>Your bank has confirmed. Open Stack’d to finish linking your accounts.</p>';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
  body{margin:0;font-family:-apple-system,system-ui,Segoe UI,Roboto,sans-serif;background:#0b1220;color:#e6edf7;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}
  main{max-width:360px;padding:32px 24px}
  h1{font-size:1.3rem;margin:0 0 12px}
  p{line-height:1.5;margin:0 0 16px}
  .muted{color:#9aa7bd;font-size:.9rem}
  a.btn{display:inline-block;background:#e6edf7;color:#0b1220;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:14px}
  small{display:block;margin-top:24px;color:#6b7891}
</style></head>
<body><main>
  <h1>${esc(title)}</h1>
  ${body}
  <a class="btn" id="open" href="${esc(deepLink)}">Open Stack’d</a>
  <small>You can close this tab afterwards.</small>
</main>
<script>setTimeout(function(){ location.href = ${JSON.stringify(deepLink)}; }, 400);</script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }
  });
}
