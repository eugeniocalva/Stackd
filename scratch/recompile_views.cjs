const fs = require('fs');

const logPath = 'C:\\Users\\ecalvaresi\\.gemini\\antigravity\\brain\\706b33ee-37d2-4b8d-a96e-2b829cb06c22\\.system_generated\\logs\\transcript.jsonl';
if (!fs.existsSync(logPath)) {
  console.error('Log not found');
  process.exit(1);
}

// Start with clean base views.js and normalize CRLF to LF
let viewsContent = fs.readFileSync('src/views.js', 'utf8').replace(/\r\n/g, '\n');

const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

const edits = [];

function decodeArg(val) {
  if (typeof val === 'string') {
    if (val.startsWith('"') && val.endsWith('"')) {
      try {
        return JSON.parse(val);
      } catch (e) {
        return val;
      }
    }
  }
  return val;
}

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.source === 'MODEL' && obj.tool_calls) {
      for (const tc of obj.tool_calls) {
        if (tc.name && (tc.name.includes('replace_file_content') || tc.name.includes('multi_replace_file_content'))) {
          const args = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
          if (args && args.TargetFile && decodeArg(args.TargetFile).includes('views.js')) {
            edits.push({
              step: obj.step_index,
              name: tc.name,
              args: args
            });
          }
        }
      }
    }
  } catch (e) {
  }
}

edits.sort((a, b) => a.step - b.step);

console.log(`Found ${edits.length} edits to replay.`);

for (const edit of edits) {
  console.log(`Replaying Step ${edit.step} (${edit.name})...`);
  const args = edit.args;
  
  if (edit.name.includes('multi_replace_file_content')) {
    const chunks = typeof args.ReplacementChunks === 'string' ? JSON.parse(args.ReplacementChunks) : args.ReplacementChunks;
    for (const chunk of chunks) {
      const target = decodeArg(chunk.TargetContent).replace(/\r\n/g, '\n');
      const replacement = decodeArg(chunk.ReplacementContent).replace(/\r\n/g, '\n');
      
      if (!viewsContent.includes(target)) {
        console.warn(`⚠️ Target chunk not found in views.js!`);
        console.log('Target chunk preview:', target.slice(0, 100));
      } else {
        viewsContent = viewsContent.replace(target, replacement);
        console.log(`✅ Chunk applied successfully.`);
      }
    }
  } else {
    // replace_file_content
    const target = decodeArg(args.TargetContent).replace(/\r\n/g, '\n');
    const replacement = decodeArg(args.ReplacementContent).replace(/\r\n/g, '\n');
    
    if (!viewsContent.includes(target)) {
      console.warn(`⚠️ Target content for Step ${edit.step} not found in views.js!`);
      console.log('Target preview:', target.slice(0, 100));
    } else {
      viewsContent = viewsContent.replace(target, replacement);
      console.log(`✅ Step ${edit.step} applied successfully.`);
    }
  }
}

// Save back with normalized line endings
fs.writeFileSync('src/views.js', viewsContent, 'utf8');
console.log('Recompilation complete! Wrote src/views.js');
