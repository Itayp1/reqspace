const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

// Fix invite button - it's called "Add" not "Invite"
code = code.replace(
  /await page\.locator\('button:has-text\("Invite"\)'\)\.click\(\);/g,
  "await page.locator('button:has-text(\"Add\")').click();"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
console.log('Fixed!');
