const fs = require('fs');
let c = fs.readFileSync('TODO.md', 'utf8');

c = c.replace(/(## FEAT-6 [\s\S]*?)(?=# CLEAN)/, '');

const tableEntries = `| **FEAT-6** — Scope resolution visualizer | Completed | |
| **FEAT-7** — Split pane | Completed | |
| **FEAT-8** — Restore closed tabs | Completed | |
| **FEAT-9** — Response size limits | Completed | |`;

c = c.replace(/## No longer applicable/, tableEntries + '\n## No longer applicable');

fs.writeFileSync('TODO.md', c);
