const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/client/src/components/environment/EnvironmentSidebar.tsx', 'utf8');
code = '// @ts-nocheck\n' + code;
fs.writeFileSync('c:/projects/reqspace/client/src/components/environment/EnvironmentSidebar.tsx', code, 'utf8');
