const fs = require('fs');
let c = fs.readFileSync('server/src/routes/importExport.ts', 'utf8');

const regexImportRoute = /router\.post\('\/collections\/import',[\s\S]*?\}\);/;

const replacementImportRoute = `router.post('/collections/import', validate(schemas.importCollectionSchema), requireWorkspaceRole('editor'), async (req: AuthRequest, res: Response) => {
  const { workspaceId, collection } = req.body;
  if (!collection || !collection.item) return res.status(400).json({ message: 'Invalid collection format' });

  const crypto = await import('crypto');
  const uuidv4 = crypto.randomUUID;
  
  const models = require('../db/sql-models/index');
  const t = await models.SqlCollection.sequelize.transaction();
  
  try {
    const colName = collection.info?.name || 'Imported Collection';
    const newColId = uuidv4();
    
    const collectionsToInsert = [{ id: newColId, workspaceId, name: colName, createdBy: req.user!._id }];
    const foldersToInsert: any[] = [];
    const requestsToInsert: any[] = [];

    const processItems = (items: any[], parentFolderId: string | null) => {
      let order = 0;
      for (const item of items) {
        if (item.item) {
          const newFolderId = uuidv4();
          foldersToInsert.push({
            id: newFolderId,
            name: item.name || 'Folder',
            collectionId: newColId,
            parentFolderId,
            order: order++
          });
          processItems(item.item, newFolderId);
        } else if (item.request) {
          const newReqId = uuidv4();
          
          let method = 'GET';
          let url = '';
          let headers = [];
          let body = { mode: 'none' } as any;
          let auth = { type: 'none' } as any;
          
          if (typeof item.request === 'string') {
            url = item.request;
          } else {
            method = item.request.method || 'GET';
            url = typeof item.request.url === 'string' ? item.request.url : (item.request.url?.raw || '');
            
            if (item.request.header) {
              headers = item.request.header.map((h: any) => ({
                key: h.key,
                value: h.value,
                description: h.description,
                enabled: !h.disabled,
                _id: uuidv4()
              }));
            }
            
            if (item.request.body) {
              body = { mode: item.request.body.mode || 'none' };
              if (body.mode === 'raw') {
                body.raw = item.request.body.raw;
                body.rawLanguage = item.request.body.options?.raw?.language === 'json' ? 'json' : 'text';
              } else if (body.mode === 'urlencoded') {
                body.urlencoded = (item.request.body.urlencoded || []).map((i: any) => ({ ...i, enabled: !i.disabled, _id: uuidv4() }));
              } else if (body.mode === 'form-data') {
                body.formData = (item.request.body.formdata || []).map((i: any) => ({ ...i, enabled: !i.disabled, _id: uuidv4() }));
              }
            }
            
            if (item.request.auth) {
              const type = item.request.auth.type;
              auth.type = type;
              if (type === 'bearer' && item.request.auth.bearer) {
                const tokenItem = item.request.auth.bearer.find((x: any) => x.key === 'token');
                if (tokenItem) auth.bearerToken = tokenItem.value;
              }
            }
          }

          let preRequestScript = '';
          let testScript = '';
          if (item.event) {
            const pre = item.event.find((e: any) => e.listen === 'prerequest');
            if (pre && pre.script && pre.script.exec) preRequestScript = pre.script.exec.join('\\n');
            const test = item.event.find((e: any) => e.listen === 'test');
            if (test && test.script && test.script.exec) testScript = test.script.exec.join('\\n');
          }

          requestsToInsert.push({
            id: newReqId,
            name: item.name || 'Request',
            collectionId: newColId,
            folderId: parentFolderId,
            method,
            url,
            headers: JSON.stringify(headers),
            body: JSON.stringify(body),
            auth: JSON.stringify(auth),
            params: '[]',
            comments: '[]',
            preRequestScript,
            testScript,
            order: order++,
            createdBy: req.user!._id,
            description: ''
          });
        }
      }
    };
    
    processItems(collection.item, null);
    
    await models.SqlCollection.bulkCreate(collectionsToInsert, { transaction: t });
    if (foldersToInsert.length > 0) await models.SqlFolder.bulkCreate(foldersToInsert, { transaction: t });
    if (requestsToInsert.length > 0) await models.SqlRequest.bulkCreate(requestsToInsert, { transaction: t });

    await t.commit();
    await logAudit(req.user!._id as any, 'collection.import', { ip: req.ip, targetId: workspaceId as any });
    return res.json({ message: 'Import successful', collectionId: newColId });
  } catch (err: any) {
    await t.rollback();
    return res.status(500).json({ message: 'Import failed', error: String(err) });
  }
});`;

// Replace dummy router.post('/collections/import') if it exists, otherwise append
if (c.includes("router.post('/collections/import'")) {
  c = c.replace(regexImportRoute, replacementImportRoute);
} else {
  c = c.replace(/export default router;/, replacementImportRoute + '\n\nexport default router;');
}

c = c.replace(/findByCollectionId/g, 'findByCollection');
c = c.replace(/auth\.bearer/g, 'auth["bearer"]');
c = c.replace(/auth\.basic/g, 'auth["basic"]');
c = c.replace(/auth\.apikey/g, 'auth["apikey"]');
c = c.replace(/auth\.oauth2/g, 'auth["oauth2"]');
// fix p => correctly
c = c.replace(/p =>/g, '(p: any) =>');
// fix missing semi colon or whatever by not doing blind replaces

fs.writeFileSync('server/src/routes/importExport.ts', c);
console.log('done import route');
