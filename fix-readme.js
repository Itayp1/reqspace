const fs = require('fs');
let c = fs.readFileSync('README.md', 'utf8');

const regex = /\*\*Still outstanding:\*\* the local proxy password in `reqspace-global-settings`\s+\(\[`TODO.md`\]\(TODO.md\) SEC-4 note\), and user scripts still run unsandboxed on the main thread\s+\(\[`TODO.md`\]\(TODO.md\) SEC-3\)\./g;
c = c.replace(regex, '**Still outstanding:** the local proxy password in `reqspace-global-settings` ([`TODO.md`](TODO.md) SEC-4 note). (SEC-3 sandboxing has been completed).');
fs.writeFileSync('README.md', c);
console.log('done readme');
