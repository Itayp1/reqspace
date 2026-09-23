const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

code = code.replace(/input\[placeholder="Key"\]/g, 'input[placeholder="New key"]');
code = code.replace(/input\[placeholder="Value"\]/g, 'input[placeholder="Initial value"]');

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
