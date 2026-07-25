const fs = require('fs');

const html = fs.readFileSync('dist/index.html', 'utf8');
const regex = /<script\b[^>]*>/gi;
let match;
while ((match = regex.exec(html)) !== null) {
  console.log('Found script tag:', match[0]);
}
