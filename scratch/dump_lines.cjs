const fs = require('fs');

const logPath = 'C:\\Users\\ecalvaresi\\.gemini\\antigravity\\brain\\706b33ee-37d2-4b8d-a96e-2b829cb06c22\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

console.log(`Searching views.js in ${lines.length} lines...`);
let count = 0;
for (const line of lines) {
  if (line.includes('views.js')) {
    console.log(`Line ${count}:`, line.slice(0, 300));
    count++;
    if (count > 5) break;
  }
}
