const fs = require('fs');
let c = fs.readFileSync('TODO.md', 'utf8');

c = c.replace(/(## FEAT-1 [\s\S]*?)(?=## FEAT-5)/, '');

const tableEntries = `| **FEAT-1** — WebSocket client | Completed | ConnectionEditor.tsx |
| **FEAT-2** — Socket.IO client | Completed | ConnectionEditor.tsx |
| **FEAT-3** — Server-Sent Events | Completed | ConnectionEditor.tsx |
| **FEAT-4** — Kafka events | Completed | ConnectionEditor.tsx |`;

c = c.replace(/## No longer applicable/, tableEntries + '\n## No longer applicable');

fs.writeFileSync('TODO.md', c);
