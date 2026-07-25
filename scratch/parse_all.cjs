const fs = require('fs');

const logPath = 'C:\\Users\\ecalvaresi\\.gemini\\antigravity\\brain\\706b33ee-37d2-4b8d-a96e-2b829cb06c22\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

let out = '';
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.tool_calls) {
      for (const tc of obj.tool_calls) {
        if (tc.name && (tc.name.includes('replace_file_content') || tc.name.includes('multi_replace_file_content'))) {
          const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
          if (args && args.TargetFile && args.TargetFile.includes('views.js')) {
            out += `\n==================================================\n`;
            out += `Step ${obj.step_index || i} (${tc.name})\n`;
            out += `Description: ${args.Description}\n`;
            out += `Instruction: ${args.Instruction}\n`;
            out += `StartLine: ${args.StartLine}, EndLine: ${args.EndLine}\n`;
            out += `TargetContent:\n${args.TargetContent}\n`;
            out += `ReplacementContent:\n${args.ReplacementContent}\n`;
            if (args.ReplacementChunks) {
              out += `ReplacementChunks:\n${JSON.stringify(args.ReplacementChunks, null, 2)}\n`;
            }
          }
        }
      }
    }
  } catch (e) {
  }
}

fs.writeFileSync('scratch/all_views_edits.txt', out, 'utf8');
console.log('Saved all edits to scratch/all_views_edits.txt');
