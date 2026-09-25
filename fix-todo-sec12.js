const fs = require('fs');
let c = fs.readFileSync('TODO.md', 'utf8');
const regex = /(## SEC-12[\s\S]*?)(?=## |$)/;
c = c.replace(regex, '');
c = c.replace(/## No longer applicable/, '| **SEC-12** — Remove the NTLM auth option | Completed | `requestStore.ts`, `AuthEditor.tsx`, `UrlBar.tsx` |\n## No longer applicable');
fs.writeFileSync('TODO.md', c);
console.log('Removed SEC-12 from TODO');
