const fs = require('fs');
let content = fs.readFileSync('REMAINING_TASKS.md', 'utf8');

const completedTasks = [
  'SEC-Critical', 'SEC-0.6', 'SEC-3', 'SEC-8', 'SEC-9', 'SEC-10',
  'PERF-1',
  'SOCK-3',
  'TEST-1', 'TEST-2', 'TEST-5',
  'UI-1', 'UI-3', 'UI-5', 'UI-6',
  'CLEAN'
];

completedTasks.forEach(task => {
  const regex = new RegExp(`(\\|\\s*\\d+\\s*\\|\\s*)(${task})(\\s*\\|)`, 'g');
  content = content.replace(regex, `$1[x] $2$3`);
});

fs.writeFileSync('REMAINING_TASKS.md', content);
console.log('Updated REMAINING_TASKS.md');
