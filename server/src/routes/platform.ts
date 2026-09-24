import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { toJUnit, scanSecrets } from '../features/reports';
import { createSafeLookup } from '../utils/ssrf';

const router = Router();
const storePath = path.join(process.cwd(), 'data', 'platform.json');

type MockRule = { match: string; status: number; body: string; headers?: Record<string, string>; delayMs?: number };
type MockRecord = { token: string; name: string; rules: MockRule[]; createdBy: string };
type HookRecord = { token: string; collectionId: string; createdBy: string };
type MonitorRecord = { id: string; collectionId: string; intervalMs: number; nextRun: number; createdBy: string };

interface PlatformFile { mocks: MockRecord[]; hooks: HookRecord[]; monitors: MonitorRecord[] }

function readStore(): PlatformFile {
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch {
    return { mocks: [], hooks: [], monitors: [] };
  }
}

function writeStore(data: PlatformFile) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

async function canRead(userId: string, isSuperAdmin: boolean, workspaceId: string) {
  if (isSuperAdmin) return true;
  return !!(await getUserWorkspaceRole(userId, workspaceId));
}

router.post('/collections/:id/fork', authenticate, async (req: AuthRequest, res: Response) => {
  const source = await CollectionRepository.findById(req.params.id);
  if (!source) return res.status(404).json({ message: 'Collection not found' });
  const { workspaceId } = req.body || {};
  if (!workspaceId) return res.status(400).json({ message: 'workspaceId is required' });
  if (!(await canRead(String(req.user!._id), !!req.user!.isSuperAdmin, source.workspaceId))) {
    return res.status(403).json({ message: 'Access denied' });
  }
  if (!(await canRead(String(req.user!._id), !!req.user!.isSuperAdmin, workspaceId))) {
    return res.status(403).json({ message: 'Access denied' });
  }
  const targetRole = req.user!.isSuperAdmin ? 'owner' : await getUserWorkspaceRole(String(req.user!._id), workspaceId);
  if (!targetRole || !['editor', 'owner'].includes(targetRole)) {
    return res.status(403).json({ message: 'Editor access required' });
  }
  const copy = await CollectionRepository.create({
    workspaceId,
    name: `${source.name} fork`,
    description: source.description,
    createdBy: String(req.user!._id),
    variables: source.variables,
    preRequestScript: source.preRequestScript,
    testScript: source.testScript,
  });
  const folders = await FolderRepository.findByCollection(source._id);
  const folderMap = new Map<string, string>();
  const pending = [...folders];
  while (pending.length) {
    const next = pending.find((f) => !f.parentFolderId || folderMap.has(f.parentFolderId));
    if (!next) break;
    pending.splice(pending.indexOf(next), 1);
    const created = await FolderRepository.create({
      collectionId: copy._id,
      name: next.name,
      parentFolderId: next.parentFolderId ? folderMap.get(next.parentFolderId) : null,
      description: next.description,
      preRequestScript: next.preRequestScript,
      testScript: next.testScript,
      order: next.order,
    });
    folderMap.set(next._id, created._id);
  }
  const requests = await RequestRepository.findByCollection(source._id);
  for (const request of requests) {
    await RequestRepository.create({
      name: request.name,
      method: request.method,
      url: request.url,
      params: request.params,
      headers: request.headers,
      auth: request.auth,
      body: request.body,
      preRequestScript: request.preRequestScript,
      testScript: request.testScript,
      description: request.description,
      order: request.order,
      collectionId: copy._id,
      folderId: request.folderId ? folderMap.get(request.folderId) || null : null,
      createdBy: String(req.user!._id),
    });
  }
  return res.status(201).json(copy);
});

router.post('/mocks', authenticate, async (req: AuthRequest, res: Response) => {
  const rules = Array.isArray(req.body?.rules) ? req.body.rules : [];
  const record: MockRecord = {
    token: crypto.randomBytes(12).toString('hex'),
    name: String(req.body?.name || 'Mock'),
    rules: rules.map((rule: MockRule) => ({
      match: String(rule.match || '/'),
      status: Number(rule.status || 200),
      body: String(rule.body || ''),
      headers: rule.headers || {},
      delayMs: Math.min(10_000, Number(rule.delayMs || 0)),
    })),
    createdBy: String(req.user!._id),
  };
  const store = readStore();
  store.mocks.push(record);
  writeStore(store);
  return res.status(201).json({ token: record.token, url: `/api/mocks/${record.token}` });
});

router.all('/mocks/:token', serveMock);
router.all('/mocks/:token/*', serveMock);

async function serveMock(req: AuthRequest, res: Response) {
  const store = readStore();
  const mock = store.mocks.find((item) => item.token === req.params.token);
  if (!mock) return res.status(404).json({ message: 'Mock not found' });
  const pathname = '/' + (req.params[0] || '');
  const rule = mock.rules.find((item) => pathname === item.match || pathname.startsWith(item.match)) || mock.rules[0];
  if (!rule) return res.status(404).json({ message: 'No mock rule' });
  const headerMatch = rule.headers?.['x-mock-match'];
  if (headerMatch && req.header('x-mock-match') !== headerMatch) {
    return res.status(404).json({ message: 'Mock rule did not match' });
  }
  if (rule.delayMs) await new Promise((resolve) => setTimeout(resolve, rule.delayMs));
  res.status(rule.status);
  return res.send(rule.body);
}

router.post('/hooks', authenticate, async (req: AuthRequest, res: Response) => {
  const collection = await CollectionRepository.findById(String(req.body?.collectionId || ''));
  if (!collection) return res.status(404).json({ message: 'Collection not found' });
  if (!(await canRead(String(req.user!._id), !!req.user!.isSuperAdmin, collection.workspaceId))) {
    return res.status(403).json({ message: 'Access denied' });
  }
  const store = readStore();
  const token = crypto.randomBytes(16).toString('hex');
  store.hooks.push({ token, collectionId: collection._id, createdBy: String(req.user!._id) });
  writeStore(store);
  return res.status(201).json({ token, url: `/api/hooks/${token}` });
});

router.post('/hooks/:token', async (req: AuthRequest, res: Response) => {
  const hook = readStore().hooks.find((item) => item.token === req.params.token);
  if (!hook) return res.status(404).json({ message: 'Hook not found' });
  const results = await runCollection(hook.collectionId);
  return res.json({ results, junit: toJUnit(hook.collectionId, results) });
});

router.post('/monitors', authenticate, async (req: AuthRequest, res: Response) => {
  const collection = await CollectionRepository.findById(String(req.body?.collectionId || ''));
  if (!collection) return res.status(404).json({ message: 'Collection not found' });
  if (!(await canRead(String(req.user!._id), !!req.user!.isSuperAdmin, collection.workspaceId))) {
    return res.status(403).json({ message: 'Access denied' });
  }
  const intervalMs = Math.max(60_000, Number(req.body?.intervalMs || 300_000));
  const store = readStore();
  const monitor: MonitorRecord = {
    id: crypto.randomBytes(8).toString('hex'),
    collectionId: collection._id,
    intervalMs,
    nextRun: Date.now() + intervalMs,
    createdBy: String(req.user!._id),
  };
  store.monitors.push(monitor);
  writeStore(store);
  return res.status(201).json(monitor);
});

router.get('/monitors', authenticate, async (_req: AuthRequest, res: Response) => {
  return res.json(readStore().monitors);
});

router.post('/reports/junit', authenticate, async (req: AuthRequest, res: Response) => {
  const results = Array.isArray(req.body?.results) ? req.body.results : [];
  res.type('application/xml');
  return res.send(toJUnit(String(req.body?.name || 'ReqSpace'), results));
});

router.post('/workspaces/:id/secret-scan', authenticate, async (req: AuthRequest, res: Response) => {
  const workspace = await WorkspaceRepository.findById(req.params.id);
  if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
  if (!(await canRead(String(req.user!._id), !!req.user!.isSuperAdmin, workspace._id))) {
    return res.status(403).json({ message: 'Access denied' });
  }
  const collections = await CollectionRepository.findByWorkspace(workspace._id);
  const findings: Array<{ requestId: string; name: string; patterns: string[] }> = [];
  for (const collection of collections) {
    const requests = await RequestRepository.findByCollection(collection._id);
    for (const request of requests) {
      const patterns = scanSecrets(JSON.stringify({ url: request.url, headers: request.headers, body: request.body, auth: request.auth }));
      if (patterns.length) findings.push({ requestId: request._id, name: request.name, patterns });
    }
  }
  return res.json({ findings });
});

export async function runDueMonitors() {
  const store = readStore();
  const now = Date.now();
  let changed = false;
  for (const monitor of store.monitors) {
    if (monitor.nextRun > now) continue;
    await runCollection(monitor.collectionId).catch(() => undefined);
    monitor.nextRun = now + monitor.intervalMs;
    changed = true;
  }
  if (changed) writeStore(store);
}

async function runCollection(collectionId: string) {
  const requests = await RequestRepository.findByCollection(collectionId);
  const { fetch: undiciFetch, Agent } = await import('undici');
  const dispatcher = new Agent({ connect: { lookup: createSafeLookup(false) } });
  const results = [];
  for (const request of requests.slice(0, 25)) {
    const started = Date.now();
    try {
      const response = await undiciFetch(request.url, {
        method: request.method || 'GET',
        dispatcher,
        signal: AbortSignal.timeout(15_000),
      });
      await response.body?.cancel?.();
      results.push({ name: request.name, passed: response.status < 400, timeMs: Date.now() - started, error: response.status < 400 ? undefined : `HTTP ${response.status}` });
    } catch (err) {
      results.push({ name: request.name, passed: false, timeMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

setInterval(() => { runDueMonitors().catch(() => undefined); }, 60_000).unref?.();

export default router;
