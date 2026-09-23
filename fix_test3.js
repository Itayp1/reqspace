const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

// Replace the Manage Environments click with clicking the Envs tab
code = code.replace(
  /await page\.getByTitle\('Manage Environments'\)\.click\(\);/g,
  "await page.locator('button:has-text(\"Envs\")').click();"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
