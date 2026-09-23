const fs = require('fs');
let code = fs.readFileSync('client/src/pages/RegisterPage.tsx', 'utf8');
code = code.replace(/api\.post\('\/auth\/[^']+', \{ name, email, password \}\)/, "api.post('/auth/register', { name, email, password })");
fs.writeFileSync('client/src/pages/RegisterPage.tsx', code, 'utf8');
