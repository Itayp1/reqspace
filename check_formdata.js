const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/client/src/components/request/UrlBar.tsx', 'utf8');
const idx = code.indexOf("else if (bodyMode === 'form-data')");
console.log(code.substring(idx, idx + 1500));
