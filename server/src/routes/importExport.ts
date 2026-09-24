import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { assertSsrfSafe } from '../utils/ssrf';
import * as soap from 'soap';

const router = Router();
router.use(authenticate);

const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

async function requireEditor(req: AuthRequest, workspaceId: string): Promise<string | null> {
  if (req.user!.isSuperAdmin) return null;
  const role = await getUserWorkspaceRole(String(req.user!._id), workspaceId);
  if (!role || role === 'viewer') return 'Editor role required in this workspace';
  return null;
}

function scriptExec(script?: string) {
  if (!script) return undefined;
  return script.split('\n');
}

function toPostmanItem(request: { name: string; method: string; url: string; headers?: any[]; body?: any; auth?: any; description?: string; preRequestScript?: string; testScript?: string }) {
  const events = [];
  if (request.preRequestScript) events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: scriptExec(request.preRequestScript) } });
  if (request.testScript) events.push({ listen: 'test', script: { type: 'text/javascript', exec: scriptExec(request.testScript) } });
  return {
    name: request.name,
    request: {
      method: request.method || 'GET',
      header: (request.headers || []).filter((h) => h.enabled !== false).map((h) => ({ key: h.key, value: h.value })),
      url: request.url || '',
      description: request.description || '',
      body: request.body?.mode && request.body.mode !== 'none' ? request.body : undefined,
      auth: request.auth && request.auth.type && request.auth.type !== 'none' ? request.auth : undefined,
    },
    event: events,
  };
}

/** ReqSpace / Postman collection v2.1 export. Viewer (or higher) required. */
router.get('/collections/:id/export', async (req: AuthRequest, res: Response) => {
  const collection = await CollectionRepository.findById(req.params.id);
  if (!collection) return res.status(404).json({ message: 'Collection not found' });
  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), collection.workspaceId);
    if (!role) return res.status(403).json({ message: 'Access denied: not a workspace member' });
  }

  const folders = await FolderRepository.findByCollection(collection._id);
  const requests = await RequestRepository.findByCollection(collection._id);

  const folderItems = new Map<string, any[]>();
  for (const folder of folders) folderItems.set(folder._id, []);

  const rootItems: any[] = [];
  for (const request of requests) {
    const item = toPostmanItem(request);
    if (request.folderId && folderItems.has(request.folderId)) folderItems.get(request.folderId)!.push(item);
    else rootItems.push(item);
  }

  const byParent = new Map<string | null, typeof folders>();
  for (const folder of folders) {
    const parent = folder.parentFolderId ?? null;
    const list = byParent.get(parent) || [];
    list.push(folder);
    byParent.set(parent, list);
  }
  const buildFolder = (folder: (typeof folders)[number]): any => ({
    name: folder.name,
    description: folder.description || '',
    item: [
      ...(byParent.get(folder._id) || []).map(buildFolder),
      ...(folderItems.get(folder._id) || []),
    ],
    event: [
      folder.preRequestScript ? { listen: 'prerequest', script: { type: 'text/javascript', exec: scriptExec(folder.preRequestScript) } } : null,
      folder.testScript ? { listen: 'test', script: { type: 'text/javascript', exec: scriptExec(folder.testScript) } } : null,
    ].filter(Boolean),
  });

  return res.json({
    info: {
      name: collection.name,
      description: collection.description || '',
      schema: POSTMAN_SCHEMA,
      _postman_id: collection._id,
    },
    variable: (collection.variables || []).map((v: any) => ({ key: v.key, value: v.value })),
    item: [...(byParent.get(null) || []).map(buildFolder), ...rootItems],
  });
});

/** Import a v2.1 collection JSON into a workspace. Editor required. */
router.post('/collections/import', async (req: AuthRequest, res: Response) => {
  const { workspaceId, collection: payload } = req.body || {};
  if (!workspaceId || !payload || typeof payload !== 'object') {
    return res.status(400).json({ message: 'workspaceId and collection are required' });
  }
  const denied = await requireEditor(req, String(workspaceId));
  if (denied) return res.status(403).json({ message: denied });

  const info = payload.info || {};
  const created = await CollectionRepository.create({
    name: info.name || payload.name || 'Imported Collection',
    workspaceId: String(workspaceId),
    description: info.description || '',
    variables: Array.isArray(payload.variable)
      ? payload.variable.map((v: any) => ({ key: v.key, value: String(v.value ?? ''), enabled: true }))
      : [],
    createdBy: String(req.user!._id),
  });

  const joinScript = (event: any[] | undefined, listen: string) => {
    const found = (event || []).find((e) => e.listen === listen);
    const exec = found?.script?.exec;
    if (Array.isArray(exec)) return exec.join('\n');
    if (typeof exec === 'string') return exec;
    return '';
  };

  const importItems = async (items: any[], parentFolderId: string | null) => {
    if (!Array.isArray(items)) return;
    let order = 0;
    for (const item of items) {
      if (item?.request || item?.request === null) {
        const request = item.request || {};
        const header = Array.isArray(request.header) ? request.header : [];
        const url = typeof request.url === 'string' ? request.url : (request.url?.raw || '');
        await RequestRepository.create({
          name: item.name || 'Imported Request',
          method: request.method || 'GET',
          url,
          headers: header.map((h: any) => ({ key: h.key, value: h.value ?? '', enabled: true })),
          body: request.body && request.body.mode ? request.body : { mode: 'none' },
          auth: request.auth || { type: 'none' },
          description: typeof request.description === 'string' ? request.description : '',
          preRequestScript: joinScript(item.event, 'prerequest'),
          testScript: joinScript(item.event, 'test'),
          folderId: parentFolderId,
          collectionId: created._id,
          order: order++,
          createdBy: String(req.user!._id),
        });
      } else if (Array.isArray(item?.item) || item?.name) {
        const folder = await FolderRepository.create({
          name: item.name || 'Folder',
          collectionId: created._id,
          parentFolderId,
          description: typeof item.description === 'string' ? item.description : '',
          preRequestScript: joinScript(item.event, 'prerequest'),
          testScript: joinScript(item.event, 'test'),
          order: order++,
        });
        await importItems(item.item || [], folder._id);
      }
    }
  };

  await importItems(payload.item || [], null);
  return res.status(201).json({ message: 'Import successful', collectionId: created._id });
});

router.post('/requests/import/curl', async (req: AuthRequest, res: Response) => {
  const { curl, workspaceId } = req.body;
  if (!curl) return res.status(400).json({ message: 'curl string required' });

  let method = 'GET';
  const methodMatch = curl.match(/-X\s+([A-Z]+)/);
  if (methodMatch) method = methodMatch[1];
  else if (curl.includes('-d ') || curl.includes('--data ')) method = 'POST';

  let url = '';
  const tokens = curl.split(/\s+/);
  for (const token of tokens) {
    const clean = token.replace(/^['"]|['"]$/g, '');
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      url = clean;
      break;
    }
  }

  const headers: any[] = [];
  const headerRegex = /-H\s+(['"])(.*?)\1/g;
  let match;
  while ((match = headerRegex.exec(curl)) !== null) {
    const headerStr = match[2];
    const splitIdx = headerStr.indexOf(':');
    if (splitIdx > 0) {
      headers.push({
        key: headerStr.substring(0, splitIdx).trim(),
        value: headerStr.substring(splitIdx + 1).trim(),
        enabled: true
      });
    }
  }

  let body = '';
  const bodyRegex = /(?:-d|--data(?:-raw)?)\s+(['"])(.*?)\1/g;
  const bodyMatch = bodyRegex.exec(curl);
  if (bodyMatch) {
    body = bodyMatch[2];
  }

  return res.json({
    name: 'Imported cURL',
    method,
    url,
    headers,
    body: { mode: body ? 'raw' : 'none', raw: body },
  });
});

router.post('/requests/import/raw-http', async (req: AuthRequest, res: Response) => {
  const { raw, workspaceId } = req.body;
  if (!raw) return res.status(400).json({ message: 'raw HTTP string required' });

  const lines = raw.split(/\r?\n/);
  if (lines.length === 0) return res.status(400).json({ message: 'Empty input' });

  const firstLine = lines[0].split(' ');
  const method = firstLine[0] || 'GET';
  let url = firstLine[1] || '';

  const headers: any[] = [];
  let i = 1;
  let host = '';
  
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      break;
    }
    const splitIdx = line.indexOf(':');
    if (splitIdx > 0) {
      const key = line.substring(0, splitIdx).trim();
      const value = line.substring(splitIdx + 1).trim();
      if (key.toLowerCase() === 'host') host = value;
      headers.push({ key, value, enabled: true });
    }
  }

  const body = lines.slice(i).join('\n');
  
  if (url.startsWith('/')) {
    if (host) {
      url = `http://${host}${url}`;
    } else {
      url = `http://localhost${url}`;
    }
  }

  return res.json({
    name: 'Imported Raw HTTP',
    method,
    url,
    headers,
    body: { mode: body.trim() ? 'raw' : 'none', raw: body },
  });
});

// ──────── POST /api/import/wsdl ────────────────────────────────────────────────────
router.post('/import/wsdl', async (req: AuthRequest, res: Response) => {
  const { url, workspaceId } = req.body;
  if (!url || !workspaceId) {
    return res.status(400).json({ message: 'url and workspaceId are required' });
  }

  const denied = await requireEditor(req, String(workspaceId));
  if (denied) return res.status(403).json({ message: denied });

  try {
    const systemConfig = await SystemConfigRepository.getConfig();
    await assertSsrfSafe(url, systemConfig?.proxy?.allowPrivateTargets ?? false);

    const client = await soap.createClientAsync(url);
    const description = client.describe();
    
    const collection = await CollectionRepository.create({
      name: `WSDL: ${url.split('/').pop() || 'Service'}`,
      workspaceId: String(workspaceId),
      createdBy: String(req.user!._id),
    });

    const services = (client as any).wsdl.services;

    for (const [serviceName, service] of Object.entries(description)) {
      // Create Folder for Service
      const serviceFolder = await FolderRepository.create({
        name: serviceName,
        collectionId: collection._id,
      });

      for (const [portName, port] of Object.entries(service as Record<string, any>)) {
        const portFolder = await FolderRepository.create({
          name: portName,
          collectionId: collection._id,
          parentFolderId: serviceFolder._id,
        });

        const location = services?.[serviceName]?.ports?.[portName]?.location || url;

        for (const [operationName, operation] of Object.entries(port as Record<string, any>)) {
          const methods = (client as any).wsdl.services?.[serviceName]?.ports?.[portName]?.binding?.methods || {};
          const soapAction = methods[operationName]?.soapAction || '';

          // Generate dummy XML body
          let xmlBody = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">\n  <soapenv:Header/>\n  <soapenv:Body>\n    <${operationName}>\n`;
          if (operation.input) {
            for (const [paramName, paramType] of Object.entries(operation.input as Record<string, string>)) {
              xmlBody += `      <${paramName}>?<!-- ${paramType} --></${paramName}>\n`;
            }
          }
          xmlBody += `    </${operationName}>\n  </soapenv:Body>\n</soapenv:Envelope>`;

          await RequestRepository.create({
            name: operationName,
            collectionId: collection._id,
            folderId: portFolder._id,
            method: 'POST',
            url: location,
            headers: [
              { key: 'Content-Type', value: 'text/xml; charset=utf-8', enabled: true },
              ...(soapAction ? [{ key: 'SOAPAction', value: `"${soapAction}"`, enabled: true }] : []),
            ],
            body: { mode: 'raw', raw: xmlBody, rawLanguage: 'xml' },
            createdBy: String(req.user!._id),
          });
        }
      }
    }

    res.json({ message: 'WSDL Imported Successfully', collectionId: collection._id });
  } catch (error: any) {
    console.error('WSDL import failed:', error);
    res.status(500).json({ message: 'Failed to parse WSDL' });
  }
});

export default router;
