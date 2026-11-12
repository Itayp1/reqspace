const fs = require('fs');
let c = fs.readFileSync('server/src/routes/importExport.ts', 'utf8');

c = c.replace(/const postmanCollection = \{([\s\S]*?)\};/, `const postmanCollection: any = {$1};
    if (collection.variables) {
      try {
        const vars = typeof collection.variables === 'string' ? JSON.parse(collection.variables) : collection.variables;
        if (vars && vars.length > 0) {
          postmanCollection.variable = vars.map((v: any) => ({ key: v.key, value: v.value || '', type: 'string' }));
        }
      } catch(e) {}
    }`);

c = c.replace(/const collectionsToInsert = \[\{ id: newColId, workspaceId, name: colName, createdBy: req.user!\._id \}\];/, 'const collectionsToInsert = [{ id: newColId, workspaceId, name: colName, createdBy: req.user!._id, variables: JSON.stringify(collection.variable || []) }];');

fs.writeFileSync('server/src/routes/importExport.ts', c);
