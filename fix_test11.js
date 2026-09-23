const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

code = code.replace(
  /const envSelect = page\.locator\('select'\)\.nth\(0\);/g,
  "const envSelect = page.locator('select').filter({ hasText: 'No Environment' }).first();"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
