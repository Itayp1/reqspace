const fs = require('fs');
let c = fs.readFileSync('server/src/index.ts', 'utf8');
c = c.replace(/bootstrap\(\)\.catch\(\(err\) => \{\s*console\.error\('Fatal startup error:', err\);\s*process\.exit\(1\);\s*\}\);/, 
  "if (require.main === module) {\n  bootstrap().catch((err) => {\n    console.error('Fatal startup error:', err);\n    process.exit(1);\n  });\n}");
fs.writeFileSync('server/src/index.ts', c);
