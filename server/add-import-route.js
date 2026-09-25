const fs = require('fs');
let c = fs.readFileSync('server/src/routes/importExport.ts', 'utf8');

const importRoute = `

router.post('/collections/import', validate(schemas.importCollectionSchema), requireWorkspaceRole('editor'), async (req: AuthRequest, res: Response) => {
  const { workspaceId, collection } = req.body;
  if (!collection || !collection.item) return res.status(400).json({ message: 'Invalid collection format' });

  const crypto = await import('crypto');
  const uuidv4 = crypto.randomUUID;
  
  const { sq } = require('../db/connect');
  const t = await require('../db/sql-models/index').SqlCollection.sequelize.transaction();
  
  try {
    const colName = collection.info?.name || 'Imported Collection';
    const newColId = uuidv4();
    await CollectionRepository.create({ id: newColId, _id: newColId, name: colName, workspaceId, createdBy: req.user!._id } as any, { transaction: t } as any);

    const processItems = async (items: any[], parentFolderId: string | null) => {
      let order = 0;
      for (const item of items) {
        if (item.item) {
          // Folder
          const newFolderId = uuidv4();
          await FolderRepository.create({
            id: newFolderId,
            _id: newFolderId,
            name: item.name || 'Folder',
            collectionId: newColId,
            parentFolderId,
            order: order++
          } as any, { transaction: t } as any);
          await processItems(item.item, newFolderId);
        } else if (item.request) {
          // Request
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

          await RequestRepository.create({
            id: newReqId,
            _id: newReqId,
            name: item.name || 'Request',
            collectionId: newColId,
            folderId: parentFolderId,
            method,
            url,
            headers,
            body,
            auth,
            preRequestScript,
            testScript,
            order: order++,
            createdBy: req.user!._id,
            params: [],
            comments: [],
            description: ''
          } as any, { transaction: t } as any);
        }
      }
    };
    
    await processItems(collection.item, null);
    await t.commit();
    await logAudit(req.user!._id as any, 'collection.import', { ip: req.ip, targetId: workspaceId as any });
    return res.json({ message: 'Import successful', collectionId: newColId });
  } catch (err: any) {
    await t.rollback();
    return res.status(500).json({ message: 'Import failed', error: String(err) });
  }
});
`;

c = c.replace(/const router = Router\(\);/, 'const router = Router();\n' + importRoute);
fs.writeFileSync('server/src/routes/importExport.ts', c);
