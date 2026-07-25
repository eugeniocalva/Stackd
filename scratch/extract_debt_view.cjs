const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\ecalvaresi\\.gemini\\antigravity\\brain\\40aa45fb-9f5e-4e84-bdc4-daf988402d5b\\.system_generated\\logs\\transcript.jsonl';

function extract() {
  console.log('Reading transcript file...');
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  
  console.log(`Total lines: ${lines.length}`);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      const obj = JSON.parse(line);
      if (obj.step_index === 73) {
        console.log(`Found step 73 at line ${i + 1}!`);
        const toolCall = obj.tool_calls[0];
        const args = toolCall.args;
        const code = args.ReplacementContent;
        
        fs.writeFileSync('scratch/debt_view_extracted.js', code);
        console.log('Successfully saved to scratch/debt_view_extracted.js!');
        return;
      }
    } catch (e) {
      // skip invalid JSON lines
    }
  }
  console.log('Step 73 not found.');
}

extract();
