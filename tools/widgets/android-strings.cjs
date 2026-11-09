// Writes res/values{,-fr,-it,-es,-pt}/stackd_widget_strings.xml (1.2.2 HG-15 WG-4).
// Run: node tools/widgets/android-strings.cjs plugins/stackd-widgets/android/src/main/res
const fs = require('fs');
const path = require('path');
const res = process.argv[2];
// The words live in tools/widgets/widget-strings.json, shared with the iOS widgets
// (tools/widgets/ios-strings.cjs).
const T = require('./widget-strings.json');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, "\\'").replace(/"/g, '\\"');
const keys = Object.keys(T.en);
for (const [lang, d] of Object.entries(T)) {
  const missing = keys.filter(k => !d[k]);
  if (missing.length) throw new Error(lang + ' missing ' + missing);
  const dir = path.join(res, lang === 'en' ? 'values' : 'values-' + lang);
  fs.mkdirSync(dir, { recursive: true });
  const body = keys.map(k => `    <string name="stackd_widget_${k}">${esc(d[k])}</string>`).join('\n');
  fs.writeFileSync(path.join(dir, 'stackd_widget_strings.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<!-- 1.2.2 (HG-15 WG-4): widget picker names; every other widget text comes from the app's snapshot -->\n<resources>\n${body}\n</resources>\n`);
}
console.log('strings ok');
