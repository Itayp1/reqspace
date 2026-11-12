const fs = require('fs');
let c = fs.readFileSync('server/src/routes/admin.ts', 'utf8');

const regexImport = /if \(dump\.folders\) \{[\s\S]*?await SqlFolder\.bulkCreate\(mapped, \{ transaction: t \}\);\r?\n\s+\}/;

const replacementImport = `if (dump.folders) {
      const mapped = dump.folders.map((f: any) => {
        const newId = uuidv4();
        idMap.set(f.id, newId);
        return { 
          ...f, 
          id: newId,
          collectionId: idMap.get(f.collectionId) || f.collectionId,
          parentFolderId: f.parentFolderId ? (idMap.get(f.parentFolderId) || f.parentFolderId) : null
        };
      });
      // Check for dangling parentFolderIds
      for (const f of mapped) {
        if (f.parentFolderId && !mapped.find(x => x.id === f.parentFolderId)) {
          throw new Error('Dangling parentFolderId');
        }
      }
      await SqlFolder.bulkCreate(mapped, { transaction: t });
    }`;

c = c.replace(regexImport, replacementImport);
fs.writeFileSync('server/src/routes/admin.ts', c);
console.log('done check');
