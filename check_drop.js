const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/client/src/components/collection/CollectionExplorer.tsx', 'utf8');
const idx = code.indexOf("else if ((dragType === 'request' || dragType === 'folder')");
console.log(code.substring(idx, idx + 1500));
