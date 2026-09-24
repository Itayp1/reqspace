import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { getUserWorkspaceRole, requireWorkspaceRole } from '../middleware/rbac';
import { emitToWorkspace } from '../socketUtils';
import { validateBody, collectionImportBody, curlImportBody, rawImportBody, wsdlImportBody } from '../validation/body';
import { assertSsrfSafe } from '../utils/ssrf';
import * as soap from 'soap';
import { v4 as uuidv4 } from 'uuid';

interface SoapServiceMap {
  ports?: Record<string, {
    location?: string;
    binding?: { methods?: Record<string, { soapAction?: string }> };
  }>;
}

const router = Router();
router.use(authenticate);

const V21_SCHEMA = 'https://schema.getreqSpace.com/json/collection/v2.1.0/collection.json';

function scriptEvents(pre?: string, test?: string) {
  const events: Array<{ listen: string; script: { type: string; exec: string[] } }> = [];
  if (pre) events.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre.split('\n') } });
  if (test) events.push({ listen: 'test', script: { type: 'text/javascript', exec: test.split('\n') } });
  return events;
}

function scriptsFromEvents(events: any[] | undefined): { preRequestScript: string; testScript: string } {
  let preRequestScript = '';
  let testScript = '';
  for (const event of events || []) {
    const exec = Array.isArray(event?.script?.exec) ? event.script.exec.join('\n') : (event?.script?.exec || '');
    if (event?.listen === 'prerequest') preRequestScript = exec;
    if (event?.listen === 'test') testScript = exec;
  }
  return { preRequestScript, testScript };
}

function toV21Item(req: { name: string; method: string; url: string; headers: any[]; params: any[]; body: any; preRequestScript: string; testScript: string }) {
  const header = (req.headers || []).filter((h: any) => h.key).map((h: any) => {
    const out: any = { key: h.key, value: h.value || '', description: h.description || '' };
    if (h.enabled === false) out.disabled = true;
    return out;
  });
  let body: any;
  if (req.body && req.body.mode && req.body.mode !== 'none') {
    body = { mode: req.body.mode };
    if (req.body.mode === 'raw') {
      body.raw = req.body.raw || '';
      body.options = { raw: { language: req.body.rawLanguage === 'json' ? 'json' : 'text' } };
    } else if (req.body.mode === 'urlencoded') {
      body.urlencoded = req.body.urlencoded || [];
    } else if (req.body.mode === 'form-data') {
      body.formdata = req.body.formData || [];
    }
  }
  const item: any = {
    name: req.name,
    request: { method: req.method || 'GET', header, body, url: { raw: req.url || '' } },
  };
  if (req.params?.length) {
    item.request.url.query = req.params.filter((p: any) => p.key).map((p: any) => ({
      key: p.key, value: p.value || '', disabled: p.enabled === false,
    }));
  }
  const event = scriptEvents(req.preRequestScript, req.testScript);
  if (event.length) item.event = event;
  return item;
}

async function buildV21(collectionId: string) {
  const collection = await CollectionRepository.findById(collectionId);
  if (!collection) return null;
  const folders = await FolderRepository.findByCollection(collectionId);
  const requests = await RequestRepository.findByCollection(collectionId);
  const build = (parentId: string | null): any[] => {
    const items: any[] = [];
    for (const folder of folders.filter(f => (f.parentFolderId || null) === parentId)) {
      items.push({ name: folder.name, item: build(folder.id) });
    }
    for (const req of requests.filter(r => (r.folderId || null) === parentId)) {
      items.push(toV21Item(req));
    }
    return items;
  };
  const doc: any = {
    info: { name: collection.name, schema: V21_SCHEMA },
    item: build(null),
  };
  if (collection.variables?.length) {
    doc.variable = collection.variables.map((v: any) => ({ key: v.key, value: v.value || v.currentValue || '' }));
  }
  const event = scriptEvents(collection.preRequestScript, collection.testScript);
  if (event.length) doc.event = event;
  return { collection, doc };
}

async function assertRole(req: AuthRequest, workspaceId: string, min: 'viewer' | 'editor'): Promise<string | null> {
  if (req.user?.isSuperAdmin) return null;
  const role = await getUserWorkspaceRole(String(req.user!._id), workspaceId);
  if (!role) return 'No access to this workspace';
  if (min === 'editor' && role === 'viewer') return 'Editor role required';
  return null;
}

router.get('/collections/:id/export', async (req: AuthRequest, res: Response) => {
  const built = await buildV21(req.params.id as string);
  if (!built) return res.status(404).json({ message: 'Collection not found' });
  const denied = await assertRole(req, built.collection.workspaceId, 'viewer');
  if (denied) return res.status(403).json({ message: denied });
  return res.json(built.doc);
});

router.post('/collections/import', validateBody(collectionImportBody), async (req: AuthRequest, res: Response) => {
  const workspaceId = req.body?.workspaceId as string | undefined;
  const doc = req.body?.collection ?? req.body;
  if (!workspaceId) return res.status(400).json({ message: 'workspaceId required' });
  if (!doc || !Array.isArray(doc.item)) return res.status(400).json({ message: 'ReqSpace v2.1 collection is required' });
  const denied = await assertRole(req, workspaceId, 'editor');
  if (denied) return res.status(403).json({ message: denied });

  const scripts = scriptsFromEvents(doc.event);
  const collection = await CollectionRepository.create({
    workspaceId,
    name: doc.info?.name || 'Imported Collection',
    description: doc.info?.description || '',
    createdBy: String(req.user!._id),
    variables: (doc.variable || []).map((v: any) => ({ key: v.key, value: v.value || '', enabled: true })),
    preRequestScript: scripts.preRequestScript,
    testScript: scripts.testScript,
  });

  const walk = async (items: any[], parentFolderId: string | null) => {
    for (const item of items) {
      if (Array.isArray(item?.item)) {
        const folder = await FolderRepository.create({
          collectionId: collection.id,
          name: item.name || 'Folder',
          parentFolderId,
        });
        await walk(item.item, folder.id);
        continue;
      }
      const request = item?.request;
      if (!request) continue;
      const url = typeof request.url === 'string' ? request.url : (request.url?.raw || '');
      const header = (request.header || []).map((h: any) => ({
        key: h.key || '', value: h.value || '', enabled: !h.disabled, description: h.description || '',
      }));
      const params = (request.url?.query || []).map((p: any) => ({
        key: p.key || '', value: p.value || '', enabled: !p.disabled,
      }));
      let body: any = { mode: 'none' };
      if (request.body?.mode === 'raw') body = { mode: 'raw', raw: request.body.raw || '', rawLanguage: request.body.options?.raw?.language || 'text' };
      else if (request.body?.mode === 'urlencoded') body = { mode: 'urlencoded', urlencoded: request.body.urlencoded || [] };
      else if (request.body?.mode === 'formdata' || request.body?.mode === 'form-data') {
        body = { mode: 'form-data', formData: request.body.formdata || request.body.formData || [] };
      }
      const itemScripts = scriptsFromEvents(item.event);
      await RequestRepository.create({
        collectionId: collection.id,
        folderId: parentFolderId,
        name: item.name || 'Request',
        method: request.method || 'GET',
        url,
        headers: header,
        params,
        body,
        preRequestScript: itemScripts.preRequestScript,
        testScript: itemScripts.testScript,
        createdBy: String(req.user!._id),
      });
    }
  };

  await walk(doc.item, null);
  emitToWorkspace(workspaceId, 'collection:created', collection);
  return res.status(201).json({ collectionId: collection.id, name: collection.name });
});

router.post('/requests/import/curl', validateBody(curlImportBody), async (req: AuthRequest, res: Response) => {
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

router.post('/requests/import/raw-http', validateBody(rawImportBody), async (req: AuthRequest, res: Response) => {
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
router.post('/import/wsdl', requireWorkspaceRole('editor'), validateBody(wsdlImportBody), async (req: AuthRequest, res: Response) => {
  const { url, workspaceId } = req.body;
  if (!url || !workspaceId) {
    return res.status(400).json({ message: 'url and workspaceId are required' });
  }

  try {
    const systemConfig = await SystemConfigRepository.getConfig();
    await assertSsrfSafe(url, systemConfig?.proxy?.allowPrivateTargets ?? false);

    const client = await soap.createClientAsync(url);
    const description = client.describe();

    const collection = await CollectionRepository.create({
      name: `WSDL: ${url.split('/').pop() || 'Service'}`,
      workspaceId,
      createdBy: String(req.user!._id),
    });

    const services = (client as unknown as { wsdl?: { services?: Record<string, SoapServiceMap> } }).wsdl?.services;

    for (const [serviceName, service] of Object.entries(description)) {
      // Create Folder for Service
      const serviceFolder = await FolderRepository.create({
        name: serviceName,
        collectionId: collection.id,
      });

      for (const [portName, port] of Object.entries(service as Record<string, any>)) {
        // Create Folder for Port
        const portFolder = await FolderRepository.create({
          name: portName,
          collectionId: collection.id,
          parentFolderId: serviceFolder.id,
        });

        const location = services?.[serviceName]?.ports?.[portName]?.location || url;

        for (const [operationName, operation] of Object.entries(port as Record<string, any>)) {
          const methods = services?.[serviceName]?.ports?.[portName]?.binding?.methods || {};
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
            collectionId: collection.id,
            folderId: portFolder.id,
            method: 'POST',
            url: location,
            headers: [
              { key: 'Content-Type', value: 'text/xml; charset=utf-8', enabled: true, _id: uuidv4() },
              ...(soapAction ? [{ key: 'SOAPAction', value: `"${soapAction}"`, enabled: true, _id: uuidv4() }] : []),
            ],
            body: { mode: 'raw', raw: xmlBody, rawLanguage: 'xml' },
            createdBy: String(req.user!._id),
          });
        }
      }
    }

    res.json({ message: 'WSDL Imported Successfully', collectionId: collection.id });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to parse WSDL: ' + error.message });
  }
});

export default router;
