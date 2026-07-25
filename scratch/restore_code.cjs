const fs = require('fs');

const logPath = 'C:\\Users\\ecalvaresi\\.gemini\\antigravity\\brain\\706b33ee-37d2-4b8d-a96e-2b829cb06c22\\.system_generated\\logs\\transcript.jsonl';
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.step_index === 182 || obj.step_index === 231) {
      const tc = obj.tool_calls[0];
      const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
      const stepContent = args.ReplacementContent;
      fs.writeFileSync(`scratch/step_${obj.step_index}.txt`, stepContent, 'utf8');
      console.log(`Successfully wrote Step ${obj.step_index} raw code to scratch/step_${obj.step_index}.txt`);
    }
  } catch (e) {
  }
}
