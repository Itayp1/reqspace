const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');
code = code.replace(/input\[placeholder="Request Name"\]/g, 'input[placeholder="My Request"]');
fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
