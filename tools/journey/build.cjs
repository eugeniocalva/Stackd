// Builds the user-journey page (docs/user-journey/index.html) and its PDF
// (docs/user-journey/user-journey.pdf) from tools/journey/content.cjs and
// the screenshots in docs/user-journey/img/ (tools/journey/capture.cjs).
//
//   node tools/journey/build.cjs            # page + PDF
//   node tools/journey/build.cjs --no-pdf   # page only
//
// The page is one self-contained file (images inlined as data URLs, no
// scripts, no external fonts), so it can be sent as a file, opened over
// file:// or published as a claude.ai artifact as it is. The reader is an
// external UX/UI designer: plain product language, screens named as the app
// names them.
const path = require('path');
const fs = require('fs');
const content = require('./content.cjs');

const DIR = path.resolve(__dirname, '../../docs/user-journey');
const IMG = path.join(DIR, 'img');
const noPdf = process.argv.includes('--no-pdf');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// light inline markup: **bold**, `code`, line breaks
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\n/g, '<br>');

const manifest = (() => { try { return JSON.parse(fs.readFileSync(path.join(IMG, 'manifest.json'), 'utf8')); } catch (e) { return { shots: {} }; } })();
const imgData = (name) => {
  const f = path.join(IMG, `${name}.webp`);
  if (!fs.existsSync(f)) return null;
  return 'data:image/webp;base64,' + fs.readFileSync(f).toString('base64');
};
const missing = [];
const phone = (name, alt, cls = '') => {
  const src = imgData(name);
  if (!src) { missing.push(name); return `<figure class="phone phone--missing ${cls}"><div class="phone-screen"><span>${esc(name)}<br>not captured</span></div><figcaption>${esc(alt)}</figcaption></figure>`; }
  return `<figure class="phone ${cls}"><div class="phone-screen"><img src="${src}" alt="${esc(alt)}" loading="lazy" width="390" height="844"></div><figcaption>${esc(alt)}</figcaption></figure>`;
};

const CSS = `
:root{--ink:#0f172a;--muted:#475569;--line:#e2e8f0;--bg:#ffffff;--soft:#f8fafc;--accent:#111111;--good:#15803d;--warn:#b45309;--bad:#b91c1c;--blue:#2f62a8}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font:15px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--blue)}
.wrap{max-width:1180px;margin:0 auto;padding:32px 28px 80px}
header.hero{border-bottom:1px solid var(--line);padding-bottom:28px;margin-bottom:36px}
header.hero h1{font-size:38px;line-height:1.1;margin:0 0 10px;letter-spacing:-.02em}
header.hero p.lead{font-size:18px;color:var(--muted);max-width:820px;margin:0 0 18px}
.meta{display:flex;flex-wrap:wrap;gap:8px 20px;color:var(--muted);font-size:13px}
.meta b{color:var(--ink);font-weight:600}
nav.toc{position:sticky;top:0;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:10px 28px;margin:0 -28px 28px;z-index:5;font-size:13px}
nav.toc a{display:inline-block;margin-right:16px;color:var(--ink);text-decoration:none;border-bottom:1px solid transparent}
nav.toc a:hover{border-color:var(--ink)}
h2{font-size:28px;letter-spacing:-.015em;margin:56px 0 12px;padding-top:8px}
h3{font-size:20px;margin:36px 0 10px}
h4{font-size:15px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
p{margin:0 0 12px}
.grid{display:grid;gap:16px}
.cards{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{border:1px solid var(--line);border-radius:16px;padding:18px 20px;background:var(--soft)}
.card h3{margin:0 0 8px;font-size:17px}
.card p{margin:0 0 6px;font-size:14px;color:var(--muted)}
.persona{display:grid;grid-template-columns:72px 1fr;gap:16px;align-items:start}
.avatar{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:26px;color:#fff;background:var(--accent)}
.persona .who{font-size:13px;color:var(--muted)}
table{border-collapse:collapse;width:100%;font-size:13.5px;margin:10px 0 18px}
th,td{border-top:1px solid var(--line);padding:9px 10px;vertical-align:top;text-align:left}
th{font-weight:600;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em;border-top:none}
tr:last-child td{border-bottom:1px solid var(--line)}
code{font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#f1f5f9;padding:1px 5px;border-radius:5px}
.stage{margin:28px 0 8px;display:flex;align-items:baseline;gap:12px}
.stage .n{font:600 12px/1 ui-monospace,Menlo,Consolas,monospace;color:#fff;background:var(--accent);border-radius:999px;padding:6px 10px}
.stage h3{margin:0}
.steps{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.step{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#fff;display:flex;flex-direction:column}
.step .shots{display:flex;gap:8px;padding:14px 14px 0;background:var(--soft);justify-content:center}
.phone{margin:0;width:150px;flex:0 0 auto}
.phone-screen{width:150px;height:324px;border-radius:18px;overflow:hidden;border:1px solid #cbd5e1;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.08)}
.phone-screen img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.phone--missing .phone-screen{display:grid;place-items:center;color:var(--muted);font-size:11px;text-align:center;background:#f1f5f9}
.phone figcaption{font-size:11px;color:var(--muted);text-align:center;margin-top:6px}
.step .body{padding:14px 16px 16px}
.step .id{font:600 11px/1 ui-monospace,Menlo,Consolas,monospace;color:var(--muted);letter-spacing:.04em}
.step h4{margin:4px 0 8px;text-transform:none;letter-spacing:0;font-size:16px;color:var(--ink)}
.step dl{margin:0;display:grid;grid-template-columns:72px 1fr;gap:4px 10px;font-size:13.5px}
.step dt{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding-top:2px}
.step dd{margin:0}
.tag{display:inline-block;font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;margin-right:4px;background:#f1f5f9;color:var(--muted)}
.tag--friction{background:#fef3c7;color:var(--warn)}
.tag--question{background:#dbeafe;color:var(--blue)}
.tag--covered{background:#dcfce7;color:var(--good)}
.tag--manual{background:#fee2e2;color:var(--bad)}
.flow{width:100%;height:auto;display:block;margin:12px 0 20px;max-width:960px}
.flow text{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.callout{border-left:4px solid var(--accent);background:var(--soft);padding:12px 16px;border-radius:0 12px 12px 0;margin:14px 0}
.callout.warn{border-color:var(--warn)}
.gallery{display:flex;flex-wrap:wrap;gap:14px}
.gallery .phone{width:170px}.gallery .phone-screen{width:170px;height:368px}
.small{font-size:13px;color:var(--muted)}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:12px 0 20px}
.kpi div{border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.kpi b{display:block;font-size:26px;letter-spacing:-.02em}
.kpi span{font-size:12px;color:var(--muted)}
footer{margin-top:60px;border-top:1px solid var(--line);padding-top:16px;font-size:12.5px;color:var(--muted)}
@media print{
  nav.toc{display:none}
  .wrap{padding:0 8mm}
  h2{break-before:page;margin-top:0}
  .step,.card,.persona,figure,table{break-inside:avoid}
  .phone-screen{box-shadow:none}
  a{color:inherit;text-decoration:none}
}
`;

// ── sections ────────────────────────────────────────────────────────────────
const toc = () => `<nav class="toc">${content.sections.map(s => `<a href="#${s.id}">${esc(s.title)}</a>`).join('')}</nav>`;

const hero = () => `
<header class="hero">
  <h1>${esc(content.title)}</h1>
  <p class="lead">${md(content.lead)}</p>
  <div class="meta">${content.meta.map(([k, v]) => `<span><b>${esc(k)}</b> ${esc(v)}</span>`).join('')}</div>
</header>`;

const primer = () => `
<section id="primer"><h2>${esc(content.primer.title)}</h2>
${content.primer.paragraphs.map(p => `<p>${md(p)}</p>`).join('')}
<div class="grid cards">${content.primer.cards.map(c => `<div class="card"><h3>${esc(c.h)}</h3><p>${md(c.p)}</p></div>`).join('')}</div>
<h3>${esc(content.primer.mapTitle)}</h3>
${content.primer.mapSvg}
<p class="small">${md(content.primer.mapNote)}</p>
</section>`;

const personas = () => `
<section id="personas"><h2>${esc(content.personasTitle)}</h2>
<p>${md(content.personasLead)}</p>
<div class="grid cards">${content.personas.map(p => `
  <div class="card persona">
    <div class="avatar" style="background:${p.color}">${esc(p.initial)}</div>
    <div><h3>${esc(p.name)} <span class="who">· ${esc(p.role)}</span></h3>
      <p>${md(p.bio)}</p>
      <p><strong>Goal.</strong> ${md(p.goal)}</p>
      <p><strong>Worry.</strong> ${md(p.worry)}</p>
      <p><strong>Success.</strong> ${md(p.success)}</p>
    </div>
  </div>`).join('')}</div>
</section>`;

const stepCard = (st, coverage) => {
  const cov = coverage[st.id];
  const covTag = cov && cov.spec ? `<span class="tag tag--covered">Automated · ${esc(cov.spec)}</span>` : '<span class="tag tag--manual">No automated check</span>';
  return `
  <article class="step" id="step-${st.id}">
    <div class="shots">${st.shots.map(([name, alt]) => phone(name, alt)).join('')}</div>
    <div class="body">
      <div class="id">${esc(st.id)} · ${esc(st.screen)}</div>
      <h4>${esc(st.title)}</h4>
      <dl>
        <dt>Does</dt><dd>${md(st.user)}</dd>
        <dt>Sees</dt><dd>${md(st.app)}</dd>
        ${st.friction ? `<dt>Friction</dt><dd><span class="tag tag--friction">Friction</span>${md(st.friction)}</dd>` : ''}
        ${st.question ? `<dt>Ask</dt><dd><span class="tag tag--question">Question</span>${md(st.question)}</dd>` : ''}
      </dl>
      <p style="margin:10px 0 0">${covTag}</p>
    </div>
  </article>`;
};

const journeys = (coverage) => content.journeys.map(j => `
<section id="${j.id}"><h2>${esc(j.title)}</h2>
<p>${md(j.lead)}</p>
${j.flowSvg || ''}
${j.stages.map((sg, i) => `
  <div class="stage"><span class="n">${i + 1}</span><h3>${esc(sg.title)}</h3><span class="small">${esc(sg.sub || '')}</span></div>
  <div class="steps">${sg.steps.map(st => stepCard(st, coverage)).join('')}</div>`).join('')}
${j.summary ? `<div class="callout"><strong>What this journey tells us.</strong> ${md(j.summary)}</div>` : ''}
</section>`).join('');

const screens = () => `
<section id="screens"><h2>${esc(content.screens.title)}</h2>
<p>${md(content.screens.lead)}</p>
${content.screens.groups.map(g => `
  <h3>${esc(g.title)}</h3>
  <table><thead><tr><th style="width:22%">Screen or part</th><th>What it shows</th><th style="width:26%">Controls and where they lead</th></tr></thead>
  <tbody>${g.rows.map(r => `<tr><td><strong>${md(r[0])}</strong></td><td>${md(r[1])}</td><td>${md(r[2])}</td></tr>`).join('')}</tbody></table>`).join('')}
</section>`;

const coverageSection = (coverage) => {
  const steps = content.journeys.flatMap(j => j.stages.flatMap(s => s.steps.map(st => ({ ...st, journey: j.short }))));
  const covered = steps.filter(s => coverage[s.id] && coverage[s.id].spec).length;
  return `
<section id="coverage"><h2>${esc(content.coverage.title)}</h2>
<p>${md(content.coverage.lead)}</p>
<div class="kpi">${content.coverage.kpis.map(([n, l]) => `<div><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join('')}<div><b>${covered}/${steps.length}</b><span>journey steps with an automated check</span></div></div>
<table><thead><tr><th>Step</th><th>Journey</th><th>Screen</th><th>Automated check</th><th>Also covered by</th></tr></thead>
<tbody>${steps.map(s => { const c = coverage[s.id] || {}; return `<tr><td><code>${esc(s.id)}</code></td><td>${esc(s.journey)}</td><td>${esc(s.screen)}</td><td>${c.spec ? `<span class="tag tag--covered">${esc(c.spec)}</span> ${esc(c.test || '')}` : '<span class="tag tag--manual">none</span>'}</td><td class="small">${esc(c.also || '')}</td></tr>`; }).join('')}</tbody></table>
${content.coverage.notes.map(n => `<p class="small">${md(n)}</p>`).join('')}
</section>`;
};

const findings = () => `
<section id="findings"><h2>${esc(content.findings.title)}</h2>
<p>${md(content.findings.lead)}</p>
<table><thead><tr><th style="width:6%">#</th><th style="width:14%">Kind</th><th>What</th><th style="width:28%">Outcome</th></tr></thead>
<tbody>${content.findings.items.map((f, i) => `<tr><td>${i + 1}</td><td><span class="tag ${f.kind === 'Fixed' ? 'tag--covered' : (f.kind === 'Design question' ? 'tag--question' : 'tag--friction')}">${esc(f.kind)}</span></td><td>${md(f.what)}</td><td>${md(f.outcome)}</td></tr>`).join('')}</tbody></table>
<h3>${esc(content.findings.questionsTitle)}</h3>
<ol>${content.findings.questions.map(q => `<li>${md(q)}</li>`).join('')}</ol>
</section>`;

const page = () => {
  const coverage = content.coverage.byStep;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(content.title)}</title><style>${CSS}</style></head>
<body><div class="wrap">
${hero()}
${toc()}
${primer()}
${personas()}
${journeys(coverage)}
${screens()}
${coverageSection(coverage)}
${findings()}
<footer>${md(content.footer)}</footer>
</div></body></html>`;
};

(async () => {
  const html = page();
  const out = path.join(DIR, 'index.html');
  fs.writeFileSync(out, html);
  console.log('wrote', path.relative(process.cwd(), out), Math.round(html.length / 1024) + ' KB', missing.length ? `· missing shots: ${missing.join(', ')}` : '· every shot present');
  if (noPdf) return;
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.goto('file:///' + out.replace(/\\/g, '/'));
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: path.join(DIR, 'user-journey.pdf'), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: `<div style="width:100%;font:9px -apple-system,Segoe UI,Arial;color:#64748b;padding:0 10mm;display:flex;justify-content:space-between"><span>${esc(content.title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>` });
  await browser.close();
  console.log('wrote', path.relative(process.cwd(), path.join(DIR, 'user-journey.pdf')));
})().catch(e => { console.error(e); process.exit(1); });
