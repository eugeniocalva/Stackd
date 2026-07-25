const fs = require('fs');

const js = fs.readFileSync('scratch/restored_views.js', 'utf8');

const keys = ['EditAssetView', 'SellAssetView', 'MarketSettingsView'];

for (const key of keys) {
  const idx = js.indexOf(key);
  console.log(`Key [${key}]: index = ${idx}`);
}
console.log('File ends with (last 200 chars):', js.slice(-200));
