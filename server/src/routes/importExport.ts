import { validate } from '../middleware/validate';
import * as schemas from '../schemas/importExport.schemas';
import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { requireRoleOnCollection } from '../middleware/resolveWorkspace';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { assertSsrfSafe } from '../utils/ssrf';
import * as soap from 'soap';

const router = Router();
router.use(authenticate);

router.get('/collections/:id/export',
  requireRoleOnCollection('viewer', (req) => req.params.id),
  async (req: AuthRequest, res: Response) => {
    const collection = await CollectionRepository.findById(req.params.id);
    if (!collection) return res.status(404).json({ message: 'Not found' });
    
    const requests = await RequestRepository.findByCollection(req.params.id);
    const includeSecrets = req.query.includeSecrets === 'true';
    
    const item = requests.map(r => {
      let authArr: any = undefined;
      if (r.auth && r.auth.type === 'bearer' && r.auth.bearer) {
        authArr = [{ key: 'token', value: includeSecrets ? r.auth.bearer.token : 'STRIPPED' }];
      }
      return {
        name: r.name,
        request: {
          auth: r.auth ? { type: r.auth.type, bearer: authArr } : undefined
        }
      };
    });

    res.json({
      info: { name: collection.name },
      variable: collection.variables || [],
      item
    });
  });

router.post('/collections/import',
  validate(schemas.importCollectionSchema),
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const { workspaceId, collection } = req.body;
    if (!workspaceId || !collection) return res.status(400).json({ message: 'Invalid body' });

    const newCol = await CollectionRepository.create({
      name: collection.info?.name || 'Imported Collection',
      workspaceId,
      createdBy: req.user!._id,
      variables: collection.variable || []
    });

    for (let i = 0; i < (collection.item || []).length; i++) {
      const r = collection.item[i];
      let auth: any = undefined;
      if (r.request?.auth) {
        auth = { type: r.request.auth.type };
        if (auth.type === 'bearer' && r.request.auth.bearer) {
          const t = r.request.auth.bearer.find((x: any) => x.key === 'token');
          if (t) auth.bearer = { token: t.value };
        }
      }
      await RequestRepository.create({
        collectionId: newCol.id || newCol._id,
        name: r.name || 'Request',
        method: 'GET',
        url: 'https://example.com',
        auth,
        headers: [],
        createdBy: req.user!._id,
        order: i
      });
    }
    res.json({ collectionId: newCol.id || newCol._id });
  });

router.post('/requests/import/curl', validate(schemas.importCurlSchema), async (req: AuthRequest, res: Response) => {
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

router.post('/requests/import/raw-http', validate(schemas.importRawHttpSchema), async (req: AuthRequest, res: Response) => {
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
// requireWorkspaceRole falls back to req.body.workspaceId, which is where this
// route takes it from — without the guard it creates a collection in any
// workspace the caller names.
router.post('/import/wsdl', validate(schemas.importWsdlSchema), requireWorkspaceRole('editor'), async (req: AuthRequest, res: Response) => {
  const { url, workspaceId } = req.body;
  if (!url || !workspaceId) {
    return res.status(400).json({ message: 'url and workspaceId are required' });
  }

  try {
    const systemConfig = await SystemConfigRepository.getConfig();
    await assertSsrfSafe(url, systemConfig?.proxy?.allowPrivateTargets ?? false);

    const client = await soap.createClientAsync(url);
    const description = client.describe();
    
    // Create Collection
    const collection = await CollectionRepository.create({
      name: `WSDL: ${url.split('/').pop() || 'Service'}`,
      workspaceId,
      createdBy: req.user!._id
    });

    const services = (client as any).wsdl.services;

    for (const [serviceName, service] of Object.entries(description)) {
      // Create Folder for Service
      const serviceFolder = await FolderRepository.create({
        name: serviceName,
        collectionId: collection._id,
      });

      for (const [portName, port] of Object.entries(service as Record<string, any>)) {
        // Create Folder for Port
        const portFolder = await FolderRepository.create({
          name: portName,
          collectionId: collection._id,
          parentFolderId: serviceFolder._id
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
              { key: 'Content-Type', value: 'text/xml; charset=utf-8', enabled: true, _id: uuidv4() },
              ...(soapAction ? [{ key: 'SOAPAction', value: `"${soapAction}"`, enabled: true, _id: uuidv4() }] : [])
            ],
            body: { mode: 'raw', raw: xmlBody, rawLanguage: 'xml' },
            createdBy: req.user!._id,
            params: [],
            auth: { type: 'none' },
            preRequestScript: '',
            testScript: '',
            order: 0,
            comments: [],
            description: ''
          });
        }
      }
    }

    res.json({ message: 'WSDL Imported Successfully', collectionId: collection._id });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to parse WSDL: ' + error.message });
  }
});

export default router;
