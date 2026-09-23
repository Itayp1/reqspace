const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

// Insert clicking the add variable row
code = code.replace(
  /const keyInput = page\.locator\('input\[placeholder="New key"\]'\)\.first\(\);/g,
  "await page.locator('text=+ Add a new variable').click();\n    const keyInput = page.locator('input[placeholder=\"New key\"]').first();"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
