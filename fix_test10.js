const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

code = code.replace(
  /await valueInput\.fill\('https:\/\/jsonplaceholder\.typicode\.com'\);\s*\/\/\ Select the new environment in the top dropdown/g,
  "await valueInput.fill('https://jsonplaceholder.typicode.com');\n    await page.locator('button:has-text(\"Save\")').click();\n    \n    // Select the new environment in the top dropdown"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
