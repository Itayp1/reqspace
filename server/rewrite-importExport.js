const fs = require('fs');
let c = fs.readFileSync('server/src/routes/importExport.ts', 'utf8');

const regexExport = /router\.get\('\/collections\/:id\/export',[\s\S]*?res\.json\(\{ info: \{ name: collection\?\.name \}, item: \[\] \}\); \/\/ Dummy export\r?\n\s+\}\);/;

const replacementExport = `router.get('/collections/:id/export',
  requireRoleOnCollection('viewer', (req) => req.params.id),
  async (req: AuthRequest, res: Response) => {
    const id = req.params.id;
    const collection = await CollectionRepository.findById(id);
    if (!collection) return res.status(404).json({ message: 'Collection not found' });
    const colFolders = await FolderRepository.findByCollection(id);
    const colRequests = await RequestRepository.findByCollection(id);

    // Build Postman v2.1 format
    const buildItems = (parentFolderId: string | null): any[] => {
      const items: any[] = [];
      const subFolders = colFolders.filter((f: any) => (f.parentFolderId || null) === (parentFolderId || null));
      for (const folder of subFolders) {
        items.push({
          name: folder.name,
          item: buildItems(folder._id as any),
        });
      }
      const reqs = colRequests.filter((r: any) => (r.folderId || null) === (parentFolderId || null));
      for (const rawReq of reqs) {
        const itemReq: any = rawReq;
        const header = (itemReq.headers || []).filter((h: any) => h.key).map((h: any) => {
          const out: any = { key: h.key, value: h.value || '', description: h.description || '' };
          if (!h.enabled) out.disabled = true;
          return out;
        });

        let body: any = undefined;
        if (itemReq.body && itemReq.body.mode !== 'none') {
          body = { mode: itemReq.body.mode };
          if (itemReq.body.mode === 'raw') {
            body.raw = itemReq.body.raw || '';
            body.options = { raw: { language: itemReq.body.rawLanguage === 'json' ? 'json' : 'text' } };
          } else if (itemReq.body.mode === 'urlencoded') {
            body.urlencoded = (itemReq.body.urlencoded || []).filter((i: any) => i.key).map((i: any) => {
              const out: any = { key: i.key, value: i.value || '' };
              if (!i.enabled) out.disabled = true;
              return out;
            });
          } else if (itemReq.body.mode === 'form-data') {
            body.formdata = (itemReq.body.formData || []).filter((i: any) => i.key).map((i: any) => {
              const out: any = { key: i.key, value: i.value || '', type: i.type || 'text' };
              if (!i.enabled) out.disabled = true;
              return out;
            });
          }
        }
        
        let auth = undefined;
        // Strip secrets by default
        if (itemReq.auth && itemReq.auth.type !== 'none') {
          auth = { type: itemReq.auth.type } as any;
          if (itemReq.auth.type === 'bearer') {
            (auth as any).bearer = [{ key: 'token', value: req.query.includeSecrets === 'true' ? itemReq.auth.bearer?.token : 'STRIPPED', type: 'string' }];
          } else if (itemReq.auth.type === 'basic') {
            (auth as any).basic = [
              { key: 'username', value: itemReq.auth.basic?.username || '', type: 'string' },
              { key: 'password', value: req.query.includeSecrets === 'true' ? itemReq.auth.basic?.password : 'STRIPPED', type: 'string' }
            ];
          } else if (itemReq.auth.type === 'api-key') {
            (auth as any).apikey = [
              { key: 'key', value: itemReq.auth.apikey?.key || '', type: 'string' },
              { key: 'value', value: req.query.includeSecrets === 'true' ? itemReq.auth.apikey?.value : 'STRIPPED', type: 'string' },
              { key: 'in', value: itemReq.auth.apikey?.in || 'header', type: 'string' }
            ];
          } else if (itemReq.auth.type === 'oauth2') {
            (auth as any).oauth2 = [
              { key: 'accessToken', value: req.query.includeSecrets === 'true' ? itemReq.auth.oauth2?.token : 'STRIPPED', type: 'string' },
              { key: 'addTokenTo', value: itemReq.auth.oauth2?.prefix || 'header', type: 'string' }
            ];
          }
        }

        const urlParts = (itemReq.url || '').split('?');
        const baseUrl = urlParts[0];
        const queryPart = urlParts[1] || '';
        let queryParams = [];
        if (queryPart) {
           const pairs = queryPart.split('&');
           queryParams = pairs.map((p: any) => {
             const [k, v] = p.split('=');
             return { key: k || '', value: v || '' };
           });
        }
        const fullQueryParams = [...queryParams];
        const uiParams = (itemReq.params || []).filter((p: any) => p.key).map((p: any) => {
           const out: any = { key: p.key, value: p.value || '', description: p.description || '' };
           if (!p.enabled) out.disabled = true;
           return out;
        });
        for (const up of uiParams) {
           if (!fullQueryParams.find((p: any) => p.key === up.key)) {
             fullQueryParams.push(up);
           }
        }

        items.push({
          name: itemReq.name,
          request: {
            method: itemReq.method,
            header,
            body,
            url: {
              raw: itemReq.url,
              host: baseUrl.split('/'),
              query: fullQueryParams,
            },
            auth,
          },
          event: [
            ...(itemReq.preRequestScript ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: itemReq.preRequestScript.split('\\n') } }] : []),
            ...(itemReq.testScript ? [{ listen: 'test', script: { type: 'text/javascript', exec: itemReq.testScript.split('\\n') } }] : []),
          ],
        });
      }
      return items;
    };

    const postmanCollection: any = {
      info: {
        name: collection.name,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: buildItems(null),
    };

    try {
      if (collection.variables) {
        const vars = typeof collection.variables === 'string' ? JSON.parse(collection.variables) : collection.variables;
        if (vars && vars.length > 0) {
          postmanCollection.variable = vars.map((v: any) => ({ key: v.key, value: v.value || '', type: 'string' }));
        }
      }
    } catch(e) {}

    if (req.query.includeSecrets === 'true') {
      await logAudit(req.user!._id as any, 'collection.export_secrets', { ip: req.ip, targetId: id as any });
    } else {
      await logAudit(req.user!._id as any, 'collection.export', { ip: req.ip, targetId: id as any });
    }

    res.json(postmanCollection);
  });`;

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
    
    let variablesStr = '[]';
    try {
      if (collection.variable && Array.isArray(collection.variable)) {
        variablesStr = JSON.stringify(collection.variable.map((v: any) => ({ key: v.key, value: v.value || '' })));
      }
    } catch(e) {}

    const collectionsToInsert = [{ id: newColId, workspaceId, name: colName, createdBy: req.user!._id, variables: variablesStr }];
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
                if (tokenItem) auth.bearer = { token: tokenItem.value };
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

c = c.replace(regexExport, replacementExport);
c = c.replace(/export default router;/, replacementImportRoute + '\n\nexport default router;');
if (!c.includes('logAudit')) {
  c = "import { logAudit } from '../repositories/AuditLogRepository';\n" + c;
}

fs.writeFileSync('server/src/routes/importExport.ts', c);
console.log('done writing importExport');
