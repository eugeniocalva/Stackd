const fs = require('fs');
const content = fs.readFileSync('scratch/step_231.txt', 'utf8');
console.log('step_231 length:', content.length);
console.log('step_231 start:', content.slice(0, 300));
console.log('step_231 end:', content.slice(-300));
