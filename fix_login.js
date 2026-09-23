const fs = require('fs');
let path = 'c:/projects/reqspace/client/src/pages/LoginPage.tsx';
let code = fs.readFileSync(path, 'utf8');
code = code.replace(/type="email"/g, 'type="text"');
fs.writeFileSync(path, code, 'utf8');
