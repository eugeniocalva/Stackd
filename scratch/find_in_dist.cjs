const fs = require('fs');

const js = fs.readFileSync('scratch/extracted_dist.js', 'utf8');
const searchStr = 'PortfolioView';
let idx = 0;
while (true) {
  idx = js.indexOf(searchStr, idx);
  if (idx === -1) break;
  console.log(`Found ${searchStr} at index ${idx}`);
  console.log('Context:', js.slice(idx - 100, idx + 300));
  console.log('--------------------------------------------------');
  idx += searchStr.length;
}
