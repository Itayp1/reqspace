const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

code = code.replace(
  /await page\.fill\('input\[placeholder="User email to invite\.\.\."\]', 'testuser@test\.com'\);/g,
  "await page.fill('input[placeholder=\"Search user by name or email...\"]', 'testuser@test.com');"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
