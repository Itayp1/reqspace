const fs = require('fs');
let code = fs.readFileSync('server/src/routes/proxy.ts', 'utf8');

code = code.replace(
  "const timeoutId = setTimeout(() => controller.abort(), timeout);",
  \
  let timeoutId;
  if (timeout > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeout);
  }
  \
);

code = code.replace(
  "clearTimeout(timeoutId);",
  "if (timeoutId) clearTimeout(timeoutId);"
);

fs.writeFileSync('server/src/routes/proxy.ts', code);
