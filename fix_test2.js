const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

// Ensure we click the request to open it after saving
code = code.replace(
  /await page\.locator\('button:has-text\("Save"\)'\)\.click\(\);\s*\/\/\ 6\.\ Setup and Send the Request/g,
  "await page.locator('button:has-text(\"Save\")').click();\n    await page.locator(`text=${requestName}`).first().click();\n\n    // 6. Setup and Send the Request"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
