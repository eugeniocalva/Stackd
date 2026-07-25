const fs = require('fs');

const js = fs.readFileSync('scratch/restored_views.js', 'utf8');
const searchIndex = 29414;

let idx = searchIndex;
while (true) {
  idx = js.indexOf('destroy(){', idx);
  if (idx === -1) break;
  console.log(`Found destroy(){ at index ${idx}`);
  console.log('Context:', js.slice(idx - 50, idx + 100));
  console.log('--------------------------------------------------');
  idx += 10;
}
