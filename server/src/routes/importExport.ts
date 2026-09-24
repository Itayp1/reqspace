import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { requireRoleOnCollection } from '../middleware/resolveWorkspace';
import { Collection } from '../models/Collection';
import { Folder } from '../models/Folder';
import { Request as ApiRequest } from '../models/Request';
import { SystemConfig } from '../models/SystemConfig';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { assertSsrfSafe } from '../utils/ssrf';
import * as soap from 'soap';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate);

// ── GET /api/collections/:id/export — v1 collection export ─────────────────
// SEC-2 hole #3: this used to be reachable by any authenticated user with no
// role check at all, and returned a dummy `{ info, item: [] }` payload no
// matter what the collection actually contained.
router.get(
  '/collections/:id/export',
  requireRoleOnCollection('viewer', (req) => req.params.id),
  async (req: AuthRequest, res: Response) => {
    const collection = await CollectionRepository.findById(req.params.id);
    if (!collection) return res.status(404).json({ message: 'Collection not found' });

    const folders = await FolderRepository.findByCollection(collection.id);
    const requests = await RequestRepository.findByCollection(collection.id);

    const dump = {
      version: 1,
      collection: {
        name: collection.name,
        description: collection.description,
        variables: collection.variables,
        preRequestScript: collection.preRequestScript,
        testScript: collection.testScript,
      },
      folders: folders.map((f) => ({
        _id: f.id,
        parentFolderId: f.parentFolderId,
        name: f.name,
        description: f.description,
        preRequestScript: f.preRequestScript,
        testScript: f.testScript,
        order: f.order,
      })),
      requests: requests.map((r) => ({
        _id: r.id,
        folderId: r.folderId,
        name: r.name,
        method: r.method,
        url: r.url,
        params: r.params,
        headers: r.headers,
        auth: r.auth,
        body: r.body,
        preRequestScript: r.preRequestScript,
        testScript: r.testScript,
        description: r.description,
        order: r.order,
      })),
    };

    res.setHeader('Content-disposition', `attachment; filename=${collection.name.replace(/[^a-z0-9_-]+/gi, '_')}.json`);
    res.setHeader('Content-type', 'application/json');
    return res.json(dump);
  }
);

// ── POST /api/collections/import — v1 collection import ────────────────────
// SEC-2 hole #4: this used to be a stub with no persistence and no checks at
// all (`{ workspaceId } = req.body` wasn't even read). Requires editor on the
// target workspace (read from `req.body.workspaceId` — rbac.ts already falls
// back to that) and re-creates the collection tree with fresh ids.
router.post('/collections/import', requireWorkspaceRole('editor'), async (req: AuthRequest, res: Response) => {
  const { workspaceId, data } = req.body;
  if (!data || data.version !== 1 || !data.collection) {
    return res.status(400).json({ message: 'Invalid or unsupported collection export' });
  }

  const count = await CollectionRepository.countByWorkspace(workspaceId);
  const collection = await CollectionRepository.create({
    workspaceId,
    name: data.collection.name || 'Imported Collection',
    description: data.collection.description,
    variables: data.collection.variables,
    preRequestScript: data.collection.preRequestScript,
    testScript: data.collection.testScript,
    createdBy: String(req.user!._id),
    order: count,
  });

  const idMap = new Map<string, string>();

  // Folders must be created parents-first so parentFolderId can be remapped.
  const remaining = [...(data.folders ?? [])];
  let progressed = true;
  while (remaining.length && progressed) {
    progressed = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const f = remaining[i];
      const oldParent = f.parentFolderId ? String(f.parentFolderId) : null;
      if (oldParent && !idMap.has(oldParent)) continue;
      const created = await FolderRepository.create({
        collectionId: collection.id,
        parentFolderId: oldParent ? idMap.get(oldParent) ?? null : null,
        name: f.name,
        description: f.description,
        preRequestScript: f.preRequestScript,
        testScript: f.testScript,
        order: f.order,
      });
      idMap.set(String(f._id ?? f.id), created.id);
      remaining.splice(i, 1);
      progressed = true;
    }
  }

  for (const r of data.requests ?? []) {
    const oldFolder = r.folderId ? String(r.folderId) : null;
    await RequestRepository.create({
      collectionId: collection.id,
      folderId: oldFolder ? idMap.get(oldFolder) ?? null : null,
      name: r.name,
      method: r.method,
      url: r.url,
      params: r.params,
      headers: r.headers,
      auth: r.auth,
      body: r.body,
      preRequestScript: r.preRequestScript,
      testScript: r.testScript,
      description: r.description,
      order: r.order,
      createdBy: String(req.user!._id),
    });
  }

  return res.status(201).json({ message: 'Import successful', collectionId: collection.id });
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
// SEC-2 hole #2: this used to create a collection in whatever `workspaceId`
// the client sent with no membership check at all — reachable by any
// authenticated user, in any workspace, just by guessing or reusing an id.
router.post('/import/wsdl', requireWorkspaceRole('editor'), async (req: AuthRequest, res: Response) => {
  const { url, workspaceId } = req.body;
  if (!url || !workspaceId) {
    return res.status(400).json({ message: 'url and workspaceId are required' });
  }

  try {
    const systemConfig = await SystemConfig.findById('global');
    await assertSsrfSafe(url, systemConfig?.proxy?.allowPrivateTargets ?? false);

    const client = await soap.createClientAsync(url);
    const description = client.describe();
    
    // Create Collection
    const collection = await Collection.create({
      name: `WSDL: ${url.split('/').pop() || 'Service'}`,
      workspaceId,
      ownerId: req.user!._id,
      createdBy: req.user!._id
    });

    const services = (client as any).wsdl.services;

    for (const [serviceName, service] of Object.entries(description)) {
      // Create Folder for Service
      const serviceFolder = await Folder.create({
        name: serviceName,
        collectionId: collection._id
      });

      for (const [portName, port] of Object.entries(service as Record<string, any>)) {
        // Create Folder for Port
        const portFolder = await Folder.create({
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

          await ApiRequest.create({
            name: operationName,
            collectionId: collection._id,
            folderId: portFolder._id,
            method: 'POST',
            url: location,
            headers: [
              { key: 'Content-Type', value: 'text/xml; charset=utf-8', enabled: true, _id: new mongoose.Types.ObjectId().toString() },
              ...(soapAction ? [{ key: 'SOAPAction', value: `"${soapAction}"`, enabled: true, _id: new mongoose.Types.ObjectId().toString() }] : [])
            ],
            body: { mode: 'raw', raw: xmlBody, rawLanguage: 'xml' },
            createdBy: req.user!._id
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
