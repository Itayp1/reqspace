const fs = require('fs');
let content = fs.readFileSync('REMAINING_TASKS.md', 'utf8');

const lines = content.split('\n');
const newLines = lines.filter(line => !line.includes('[x]'));

fs.writeFileSync('REMAINING_TASKS.md', newLines.join('\n'));
console.log('Cleaned REMAINING_TASKS.md');
