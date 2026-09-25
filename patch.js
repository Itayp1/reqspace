const fs = require('fs');
const file = 'server/src/repositories/CollectionRepository.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/testScript: string;/, 'testScript: string;\n  roles: any[];');
code = code.replace(/testScript: c\.testScript,/, 'testScript: c.testScript,\n    roles: typeof c.roles === \'string\' ? JSON.parse(c.roles) : (c.roles || []),');
code = code.replace(/testScript: data\.testScript \|\| \'\',/, 'testScript: data.testScript || \'\',\n      roles: \'[]\',');

fs.writeFileSync(file, code);
console.log('Done');
