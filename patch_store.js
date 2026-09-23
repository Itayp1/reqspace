const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/client/src/store/requestStore.ts', 'utf8');
code = code.replace(
  'enabled: boolean;',
  "enabled: boolean; type?: 'text'|'file'; file?: File; fileName?: string; fileData?: string;"
);
fs.writeFileSync('c:/projects/reqspace/client/src/store/requestStore.ts', code, 'utf8');
