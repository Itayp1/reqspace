import { validate } from '../middleware/validate';
import * as schemas from '../schemas/importExport.schemas';
import { Router, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
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
import { noteRouteError } from '../utils/errorReporter';
import { parseCurl } from '../utils/curlParser';
import { emitToWorkspace } from '../socketUtils';
import { parsePostmanCollection, toPostmanCollection, ImportError, type ParsedCollection } from '../utils/postmanCollection';

const router = Router();
router.use(authenticate);

// Postman v2.1 export of the whole tree. Secrets (tokens, passwords, API key
// values) come out as "STRIPPED" unless ?includeSecrets=true.
router.get('/collections/:id/export',
  requireRoleOnCollection('viewer', (req) => req.params.id),
  async (req: AuthRequest, res: Response) => {
    const collection = await CollectionRepository.findById(req.params.id);
    if (!collection) return res.status(404).json({ message: 'Not found' });
    const [folders, requests] = await Promise.all([
      FolderRepository.findByCollection(req.params.id),
      RequestRepository.findByCollection(req.params.id),
    ]);
    const includeSecrets = req.query.includeSecrets === 'true';
    res.json(toPostmanCollection(collection, folders, requests, { includeSecrets }));
  });

// Imports a Postman / reqSpace v2.0 or v2.1 collection file with its whole
// tree: folders, requests, auth, bodies, scripts and variables.
router.post('/collections/import',
  validate(schemas.importCollectionSchema),
  requireWorkspaceRole('editor'),
  async (req: AuthRequest, res: Response) => {
    const { workspaceId, collection } = req.body;
    if (!workspaceId || !collection) return res.status(400).json({ message: 'Invalid body' });

    let parsed: ParsedCollection;
    try {
      parsed = parsePostmanCollection(collection);
    } catch (err) {
      if (err instanceof ImportError) return res.status(400).json({ message: err.message });
      throw err;
    }

    const userId = String(req.user!._id);
    // Importing the same file twice must not leave two collections with one name.
    const taken = new Set((await CollectionRepository.findByWorkspace(workspaceId)).map(c => c.name));
    let name = parsed.name;
    for (let n = 2; taken.has(name); n++) name = `${parsed.name} (${n})`;

    const newCol = await CollectionRepository.create({
      name,
      description: parsed.description,
      workspaceId,
      createdBy: userId,
      variables: parsed.variables,
      auth: parsed.auth,
      preRequestScript: parsed.preRequestScript,
      testScript: parsed.testScript,
      order: await CollectionRepository.countByWorkspace(workspaceId),
    });

    let folderCount = 0;
    let requestCount = 0;
    const createLevel = async (items: ParsedCollection['items'], parentFolderId: string | null) => {
      let folderOrder = 0;
      let requestOrder = 0;
      for (const node of items) {
        if (node.kind === 'folder') {
          const folder = await FolderRepository.create({
            collectionId: newCol._id,
            parentFolderId,
            name: node.name,
            description: node.description,
            auth: node.auth,
            preRequestScript: node.preRequestScript,
            testScript: node.testScript,
            order: folderOrder++,
          });
          folderCount++;
          await createLevel(node.items, folder._id);
        } else {
          await RequestRepository.create({
            collectionId: newCol._id,
            folderId: parentFolderId,
            name: node.name,
            method: node.method,
            url: node.url,
            params: node.params,
            headers: node.headers,
            auth: node.auth,
            body: node.body,
            preRequestScript: node.preRequestScript,
            testScript: node.testScript,
            description: node.description,
            createdBy: userId,
            order: requestOrder++,
          });
          requestCount++;
        }
      }
    };
    await createLevel(parsed.items, null);

    emitToWorkspace(workspaceId, 'collection:created', newCol);
    res.json({ collectionId: newCol._id, collection: newCol, folders: folderCount, requests: requestCount });
  });

router.post('/requests/import/curl', validate(schemas.importCurlSchema), async (req: AuthRequest, res: Response) => {
  const { curl, workspaceId } = req.body;
  if (!curl) return res.status(400).json({ message: 'curl string required' });

  return res.json({ name: 'Imported cURL', ...parseCurl(curl) });
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

  let body = lines.slice(i).join('\n');
  // A chunked body is sent un-chunked by the client, so decode it and drop the
  // header that describes framing that no longer exists.
  const chunkedIdx = headers.findIndex(h => h.key.toLowerCase() === 'transfer-encoding' && /chunked/i.test(h.value));
  if (chunkedIdx !== -1) {
    headers.splice(chunkedIdx, 1);
    let decoded = '';
    let rest = body;
    for (;;) {
      const m = /^\s*([0-9a-fA-F]+)[^\n]*\n/.exec(rest);
      if (!m) break;
      const size = parseInt(m[1], 16);
      if (size === 0) break;
      decoded += rest.substr(m[0].length, size);
      rest = rest.slice(m[0].length + size).replace(/^\r?\n/, '');
    }
    body = decoded;
  }
  
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
  const { url: wsdlUrl, wsdl: wsdlText, workspaceId } = req.body;
  if ((!wsdlUrl && !wsdlText) || !workspaceId) {
    return res.status(400).json({ message: 'url (or wsdl) and workspaceId are required' });
  }
  const url: string = wsdlUrl || '';

  let tmpDir: string | null = null;
  try {
    let source = url;
    if (wsdlText) {
      // Pasted or uploaded document: hand soap a temp file, never a path from the client.
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsdl-'));
      source = path.join(tmpDir, 'service.wsdl');
      fs.writeFileSync(source, wsdlText);
    } else {
      const systemConfig = await SystemConfigRepository.getConfig();
      await assertSsrfSafe(url, systemConfig?.proxy?.allowPrivateTargets ?? false);
    }

    const client = await soap.createClientAsync(source);
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
              { key: 'Content-Type', value: 'text/xml; charset=utf-8', enabled: true },
              ...(soapAction ? [{ key: 'SOAPAction', value: `"${soapAction}"`, enabled: true }] : [])
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
    // An unreachable, blocked or malformed WSDL is a problem with the URL the
    // user gave, not a server fault.
    res.status(400).json({ message: 'Failed to parse WSDL: ' + error.message });
  } finally {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

export default router;
