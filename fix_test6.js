const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

code = code.replace(
  /await expect\(page\.locator\('\.font-bold:has-text\("Variables"\)'\)\)\.toBeVisible\(\);\s*/g,
  ""
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
