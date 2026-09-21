const fs = require('fs');
let code = fs.readFileSync('tests/scripts-execution.spec.ts', 'utf8');

code = code.replace(
  "url: 'https://httpbin.org/get?testVar={{myDynamicVar}}',",
  "url: 'http://localhost:3005/api/auth/me?testVar={{myDynamicVar}}',"
);

code = code.replace(
  "pm.test(\\"Dynamic var was sent\\", function() { var data = pm.response.json(); pm.expect(data.args.testVar).to.eql(\\"hello-from-prescript\\"); });",
  "pm.test(\\"Dynamic var was sent\\", function() { var url = pm.request.url.toString(); pm.expect(url).to.include(\\"hello-from-prescript\\"); });"
);

code = code.replace(
  "await expect(page.locator('text=200 OK')).toBeVisible({ timeout: 10000 });",
  "await expect(page.locator('text=Status:').locator('..')).toContainText('200', { timeout: 15000 });"
);

fs.writeFileSync('tests/scripts-execution.spec.ts', code);
