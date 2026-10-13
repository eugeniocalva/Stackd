// Writes a side-by-side review sheet of the site's copy: one row per string,
// English, French, Italian, Spanish and Portuguese in columns.
//
//   node tools/site/review-sheet.cjs [out.html]
//
// Default output: site-review.html in the OS temp folder. Open it in a
// browser; HTML in the strings (bold, code) renders as it will on the site.
// The file is for reading only — corrections go into tools/site/strings/.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { S, LANGS } = require('./layout.cjs');

const out = process.argv[2] || path.join(os.tmpdir(), 'site-review.html');
const esc = (s) => String(s).replace(/&(?![a-z]+;|#\d+;)/g, '&amp;').replace(/</g, '&lt;');
const show = (s) => String(s).replace(/\{email\}/g, '<i>hi@stackdplatform.com</i>');

// Flatten every leaf to [path, value], in English's key order.
const rows = [];
const walk = (node, at) => {
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${at}[${i}]`));
  if (node && typeof node === 'object') return Object.keys(node).forEach(k => walk(node[k], at ? `${at}.${k}` : k));
  rows.push(at);
};
walk(S.en, '');
const get = (obj, p) => p.split(/\.|\[(\d+)\]/).filter(Boolean).reduce((o, k) => (o == null ? o : o[k]), obj);

// Attribute-only text (alt, descriptions) is plain text: show it escaped.
const plain = (p) => /(^|\.)(alt|imgAlt|description|title|ogAlt|brandLabel|label|meta\w*)$/.test(p);
const cell = (p, l) => {
  const v = get(S[l], p);
  if (v === undefined) return '<td class="missing">missing</td>';
  return `<td lang="${l}">${plain(p) ? esc(v) : show(v)}</td>`;
};

let section = '';
const body = rows.map(p => {
  const top = p.split(/[.[]/)[0];
  const head = top !== section ? `<tr class="sec"><th colspan="${LANGS.length + 1}">${top}</th></tr>` : '';
  section = top;
  return `${head}<tr><th class="key">${p}</th>${LANGS.map(l => cell(p, l)).join('')}</tr>`;
}).join('\n');

fs.writeFileSync(out, `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Site copy review</title>
<style>
  :root { color-scheme: light dark; --rule: #d6dde4; --head: #eef2f5; --muted: #5b6675; }
  @media (prefers-color-scheme: dark) { :root { --rule: #334155; --head: #111827; --muted: #94a3b8; } }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; background: Canvas; color: CanvasText; }
  header { padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; } p { margin: 0; color: var(--muted); }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border-top: 1px solid var(--rule); padding: 8px 10px; vertical-align: top; text-align: left; }
  thead th { position: sticky; top: 0; background: var(--head); z-index: 1; }
  th.key { width: 150px; font: 11px/1.4 ui-monospace, Consolas, monospace; color: var(--muted); word-break: break-all; font-weight: 400; }
  tr.sec th { background: var(--head); font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; }
  td.missing { color: #dc2626; font-weight: 600; }
  code { font-size: 12px; }
</style></head><body>
<header><h1>Stack'd website copy: ${rows.length} strings × ${LANGS.length} languages</h1>
<p>Source: tools/site/strings/&lt;lang&gt;.cjs. Key paths name each string; corrections go into those files.</p></header>
<table><thead><tr><th class="key">key</th>${LANGS.map(l => `<th>${S[l].name}</th>`).join('')}</tr></thead>
<tbody>
${body}
</tbody></table></body></html>
`);
console.log(`${rows.length} strings → ${out}`);
