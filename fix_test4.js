const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

code = code.replace(
  /await page\.getByTitle\('Create Environment'\)\.click\(\);/g,
  "await page.getByTitle('New Environment').click();"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
