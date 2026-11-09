// Writes ios/App/StackdWidgets/Localizable.xcstrings (1.2.2 HG-15 WG-5): the
// widget gallery's names and descriptions, the "Open Stack'd" placeholder and
// Quick add's accessibility labels, in the five app languages.
// Run: node tools/widgets/ios-strings.cjs ios/App/StackdWidgets/Localizable.xcstrings
const fs = require('fs');
const T = require('./widget-strings.json');
const keyOf = (k) => k === 'open' || ['expense', 'income', 'transfer'].includes(k)
  ? `widget.${k}`
  : `widget.${k.replace(/_(name|desc)$/, '.$1')}`;
const strings = {};
for (const k of Object.keys(T.en)) {
  const localizations = {};
  for (const [lang, d] of Object.entries(T)) {
    localizations[lang] = { stringUnit: { state: 'translated', value: d[k] } };
  }
  strings[keyOf(k)] = { extractionState: 'manual', localizations };
}
const sorted = Object.fromEntries(Object.keys(strings).sort().map(k => [k, strings[k]]));
fs.writeFileSync(process.argv[2], JSON.stringify({ sourceLanguage: 'en', strings: sorted, version: '1.0' }, null, 2) + '\n');
console.log(Object.keys(sorted).join(', '));
