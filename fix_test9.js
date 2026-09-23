const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

code = code.replace(
  /await expect\(page\.locator\('text=Login to reqSpace'\)\)\.toBeVisible\(\s*\{ timeout: 5000 \}\s*\);/i,
  "await expect(page.locator('text=Login to Reqspace')).toBeVisible({ timeout: 5000 });"
);

code = code.replace(
  /await page\.fill\('input\[type="email"\]', `test\$\{suffix\}@test\.com`\);/,
  "await page.fill('input[placeholder=\"admin or test@example.com\"]', `test${suffix}@test.com`);"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
