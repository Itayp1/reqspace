const fs = require('fs');
let code = fs.readFileSync('tests/reqspace.spec.ts', 'utf8');

// Remove the close button click - the modal backdrop intercepts it
// Instead use Escape key to close the modal
code = code.replace(
  /\/\/ Actually, let's just close it\.\s*await page\.locator\('button > svg\.lucide-x'\)\.first\(\)\.click\(\);/g,
  "// Close modal using Escape key\n    await page.keyboard.press('Escape');"
);

fs.writeFileSync('tests/reqspace.spec.ts', code, 'utf8');
console.log('Fixed!');
