const fs = require('fs');

const logPath = 'C:\\Users\\ecalvaresi\\.gemini\\antigravity\\brain\\706b33ee-37d2-4b8d-a96e-2b829cb06c22\\.system_generated\\logs\\transcript.jsonl';

if (!fs.existsSync(logPath)) {
  console.error('Transcript log file does not exist at:', logPath);
  process.exit(1);
}

const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

console.log(`Read ${lines.length} lines from transcript.`);

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  try {
    const obj = JSON.parse(line);
    // Look for tool calls that edited views.js
    if (obj.tool_calls) {
      for (const tc of obj.tool_calls) {
        if (tc.name && (tc.name.includes('replace_file_content') || tc.name.includes('multi_replace_file_content'))) {
          const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
          if (args && args.TargetFile && args.TargetFile.includes('views.js')) {
            console.log(`\n--- Step ${obj.step_index || i} (${tc.name}) ---`);
            console.log(JSON.stringify(args, null, 2));
          }
        }
      }
    }
  } catch (e) {
    // Ignore invalid JSON lines
  }
}
