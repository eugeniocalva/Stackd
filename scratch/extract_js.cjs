const fs = require('fs');

const html = fs.readFileSync('dist/index.html', 'utf8');
const match = html.match(/<script type="module" crossorigin>([\s\S]*?)<\/script>/i);

if (match && match[1]) {
  fs.writeFileSync('scratch/extracted_dist.js', match[1], 'utf8');
  console.log('Extracted JS to scratch/extracted_dist.js');
} else {
  console.error('No module script body found');
}
