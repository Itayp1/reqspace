const fs = require('fs');
let c = fs.readFileSync('server/src/routes/importExport.ts', 'utf8');

const regexExport = /router\.get\('\/collections\/:id\/export',[\s\S]*?res\.json\(\{ info: \{ name: collection\?\.name \}, item: \[\] \}\); \/\/ Dummy export\r?\n\s+\}\);/;

const replacementExport = `router.get('/collections/:id/export',
  requireRoleOnCollection('viewer', (req) => req.params.id),
  async (req: AuthRequest, res: Response) => {
    const id = req.params.id;
    const collection = await CollectionRepository.findById(id);
    if (!collection) return res.status(404).json({ message: 'Collection not found' });
    const colFolders = await FolderRepository.findByCollectionId(id);
    const colRequests = await RequestRepository.findByCollectionId(id);

    // Build Postman v2.1 format
    const buildItems = (parentFolderId: string | null): any[] => {
      const items: any[] = [];
      const subFolders = colFolders.filter((f: any) => f.parentFolderId === parentFolderId);
      for (const folder of subFolders) {
        items.push({
          name: folder.name,
          item: buildItems(folder._id as any),
        });
      }
      const reqs = colRequests.filter((r: any) => r.folderId === parentFolderId);
      for (const rawReq of reqs) {
        const req: any = rawReq;
        const header = (req.headers || []).filter((h: any) => h.key).map((h: any) => {
          const out: any = { key: h.key, value: h.value || '', description: h.description || '' };
          if (!h.enabled) out.disabled = true;
          return out;
        });

        let body: any = undefined;
        if (req.body && req.body.mode !== 'none') {
          body = { mode: req.body.mode };
          if (req.body.mode === 'raw') {
            body.raw = req.body.raw || '';
            body.options = { raw: { language: req.body.rawLanguage === 'json' ? 'json' : 'text' } };
          } else if (req.body.mode === 'urlencoded') {
            body.urlencoded = (req.body.urlencoded || []).filter((i: any) => i.key).map((i: any) => {
              const out: any = { key: i.key, value: i.value || '' };
              if (!i.enabled) out.disabled = true;
              return out;
            });
          } else if (req.body.mode === 'form-data') {
            body.formdata = (req.body.formData || []).filter((i: any) => i.key).map((i: any) => {
              const out: any = { key: i.key, value: i.value || '', type: i.type || 'text' };
              if (!i.enabled) out.disabled = true;
              return out;
            });
          }
        }
        
        let auth = undefined;
        // Strip secrets by default
        if (req.auth && req.auth.type !== 'none') {
          auth = { type: req.auth.type };
          if (req.auth.type === 'bearer') {
            auth.bearer = [{ key: 'token', value: req.query.includeSecrets === 'true' ? req.auth.bearerToken : 'STRIPPED', type: 'string' }];
          } else if (req.auth.type === 'basic') {
            auth.basic = [
              { key: 'username', value: req.auth.basicUsername || '', type: 'string' },
              { key: 'password', value: req.query.includeSecrets === 'true' ? req.auth.basicPassword : 'STRIPPED', type: 'string' }
            ];
          } else if (req.auth.type === 'api-key') {
            auth.apikey = [
              { key: 'key', value: req.auth.apiKeyKey || '', type: 'string' },
              { key: 'value', value: req.query.includeSecrets === 'true' ? req.auth.apiKeyValue : 'STRIPPED', type: 'string' },
              { key: 'in', value: req.auth.apiKeyIn || 'header', type: 'string' }
            ];
          } else if (req.auth.type === 'oauth2') {
            auth.oauth2 = [
              { key: 'accessToken', value: req.query.includeSecrets === 'true' ? req.auth.oauth2Token : 'STRIPPED', type: 'string' },
              { key: 'addTokenTo', value: req.auth.oauth2Prefix || 'header', type: 'string' }
            ];
          }
        }

        const urlParts = (req.url || '').split('?');
        const baseUrl = urlParts[0];
        const queryPart = urlParts[1] || '';
        let queryParams = [];
        if (queryPart) {
           const pairs = queryPart.split('&');
           queryParams = pairs.map(p => {
             const [k, v] = p.split('=');
             return { key: k || '', value: v || '' };
           });
        }
        const fullQueryParams = [...queryParams];
        const uiParams = (req.params || []).filter((p: any) => p.key).map((p: any) => {
           const out: any = { key: p.key, value: p.value || '', description: p.description || '' };
           if (!p.enabled) out.disabled = true;
           return out;
        });
        for (const up of uiParams) {
           if (!fullQueryParams.find(p => p.key === up.key)) {
             fullQueryParams.push(up);
           }
        }

        items.push({
          name: req.name,
          request: {
            method: req.method,
            header,
            body,
            url: {
              raw: req.url,
              host: baseUrl.split('/'),
              query: fullQueryParams,
            },
            auth,
          },
          event: [
            ...(req.preRequestScript ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: req.preRequestScript.split('\\n') } }] : []),
            ...(req.testScript ? [{ listen: 'test', script: { type: 'text/javascript', exec: req.testScript.split('\\n') } }] : []),
          ],
        });
      }
      return items;
    };

    const postmanCollection = {
      info: {
        name: collection.name,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: buildItems(null),
    };

    if (req.query.includeSecrets === 'true') {
      await logAudit(req.user!._id as any, 'collection.export_secrets', { ip: req.ip, targetId: id as any });
    } else {
      await logAudit(req.user!._id as any, 'collection.export', { ip: req.ip, targetId: id as any });
    }

    res.json(postmanCollection);
  });`;

c = c.replace(regexExport, replacementExport);
fs.writeFileSync('server/src/routes/importExport.ts', c);
console.log('done server export');
