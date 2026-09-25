const fs = require('fs');
let c = fs.readFileSync('TODO.md', 'utf8');

const completedTasks = [
  'SEC-10.0', 'SEC-10.1', 'SEC-10.2', 'SEC-11', 'SEC-12', 'FIX-1', 'FEAT-10',
  'SEC-13', 'SEC-0.6', 'SEC-3', 'SEC-8', 'SEC-4'
];

for (const task of completedTasks) {
  const regex = new RegExp('(^##{1,2} ' + task.replace('.', '\\.') + ' [\\s\\S]*?)(?=^##{1,2} |^# |^$)', 'gm');
  c = c.replace(regex, '');
}

// Add any missing ones to the Removed table. (Most might already be there).
if (!c.includes('FEAT-10')) {
  c = c.replace(/## No longer applicable/, '| **FEAT-10** — Server-side collection export/import | Completed | `importExport.ts`, `feat10.e2e.test.ts`, `ImportModal.tsx` |\n## No longer applicable');
}
if (!c.includes('SEC-12')) {
  c = c.replace(/## No longer applicable/, '| **SEC-12** — Remove the NTLM auth option | Completed | `requestStore.ts`, `AuthEditor.tsx`, `UrlBar.tsx` |\n## No longer applicable');
}
if (!c.includes('SEC-10')) {
  c = c.replace(/## No longer applicable/, '| **SEC-10** — CSP and Rate limiting | Completed | `server/src/index.ts` |\n## No longer applicable');
}
if (!c.includes('SEC-11')) {
  c = c.replace(/## No longer applicable/, '| **SEC-11** — OAuth CSRF state | Completed | `server/src/routes/auth.ts` |\n## No longer applicable');
}

fs.writeFileSync('TODO.md', c);
console.log('Cleaned up completed tasks.');
