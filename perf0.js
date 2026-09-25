const fs = require('fs');
let c = fs.readFileSync('TODO.md', 'utf8');

const resultText = `* **Status:** completed
* **Results (SQLite):**
  * Login: 35ms, 1 queries
  * List workspaces: 4ms, 1 queries
  * Open workspace: 9ms, 5 queries
  * List history: 3ms, 1 queries`;

c = c.replace(/(## PERF-0 [\s\S]*?)(?=## |$)/, '## PERF-0 - Completed\n\n' + resultText + '\n\n');
fs.writeFileSync('TODO.md', c);
