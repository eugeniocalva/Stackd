const fs = require('fs');

const js = fs.readFileSync('scratch/extracted_dist.js', 'utf8');
const startKey = 'window.Views.PortfolioView={';
const idx = js.indexOf(startKey);

if (idx !== -1) {
  const viewsJs = js.slice(idx);
  fs.writeFileSync('scratch/restored_views.js', viewsJs, 'utf8');
  console.log(`Successfully extracted ${viewsJs.length} bytes to scratch/restored_views.js`);
} else {
  console.error('Start key not found');
}
