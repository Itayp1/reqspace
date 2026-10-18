import { validate } from '../middleware/validate';
import * as schemas from '../schemas/share.schemas';
import { Router, Request, Response } from 'express';
import { SqlSharedLink, SqlCollection } from '../db/sql-models';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getUserWorkspaceRole } from '../middleware/rbac';
import { RequestRepository, type IRequestRecord } from '../repositories/RequestRepository';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { emitToWorkspace } from '../socketUtils';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();
const shareGetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: 'Too many requests' });

// Ids are short hex strings; anything else (NUL bytes, quotes, a 1000-char id)
// cannot exist, so answer 404 without ever reaching the database.
const SHORT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Secrets people paste into URLs: ?access_token=..., ?api_key=..., user:pass@host.
const SENSITIVE_QUERY_RE = /auth|token|key|secret|cookie|pass|signature|credential|session/i;
function sanitizeSharedUrl(url: string): string {
  if (!url) return url;
  const [base, ...rest] = url.split('?');
  const cleanBase = base.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@?#]*@/i, '$1');
  if (rest.length === 0) return cleanBase;
  const [query, ...hash] = rest.join('?').split('#');
  const kept = query.split('&').map(pair => {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    let decoded = key;
    try { decoded = decodeURIComponent(key); } catch { /* keep raw */ }
    // A {{variable}} placeholder is not a secret; a literal value is.
    const isPlaceholder = eq !== -1 && /^(\{\{[^{}]+\}\}|%7B%7B.*%7D%7D)$/i.test(pair.slice(eq + 1));
    return SENSITIVE_QUERY_RE.test(decoded) && eq !== -1 && !isPlaceholder ? `${key}=` : pair;
  }).join('&');
  return cleanBase + '?' + kept + (hash.length ? '#' + hash.join('#') : '');
}

// What an anonymous viewer (and a fork made from the link) gets of a request.
function toSafeRequest(r: IRequestRecord) {
  return {
    name: r.name,
    method: r.method,
    url: sanitizeSharedUrl(r.url),
    description: r.description,
    headers: r.headers?.filter(h => !h.key?.toLowerCase().match(/auth|token|key|secret|cookie|pass/)),
    auth: { type: r.auth?.type || 'none' }
  };
}

router.get('/:shortId', shareGetLimiter, async (req: Request, res: Response) => {
  if (!SHORT_ID_RE.test(String(req.params.shortId))) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }
  const link = await SqlSharedLink.findOne({ where: { shortId: req.params.shortId } });
  if (!link) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }
  
  if (link.expiresAt && link.expiresAt < new Date()) {
    return res.status(404).json({ message: 'Link expired' });
  }

  const collection = await SqlCollection.findByPk(link.collectionId, { raw: true });
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }

  const rawRequests = await RequestRepository.findByCollection(String(collection.id));
  const safeRequests = rawRequests.map(toSafeRequest);
  
  return res.json({
    collection: {
      name: collection.name,
      description: collection.description
    },
    requests: safeRequests,
    expiresAt: link.expiresAt
  });
});

router.post('/collection/:id', validate(schemas.createShareSchema), authenticate, async (req: AuthRequest, res: Response) => {
  const { expiresInDays } = req.body;
  const days = parseInt(expiresInDays) || 7;
  
  const collection = await SqlCollection.findByPk(req.params.id);
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }

  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), String(collection.workspaceId));
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: 'Editor role required in this workspace to share a collection' });
    }
  }

  const shortId = crypto.randomBytes(6).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  const token = crypto.randomBytes(32).toString('hex');

  const link = await SqlSharedLink.create({
    shortId, token,
    collectionId: collection.id,
    workspaceId: collection.workspaceId,
    createdBy: req.user!._id,
    expiresAt
  });

  return res.json({ 
    shortId: link.shortId, token, 
    expiresAt: link.expiresAt,
    url: '/share/' + link.shortId
  });
});

// Active links of a collection, so they can still be seen and revoked after
// the dialog that created them was closed.
router.get('/collection/:id/links', authenticate, async (req: AuthRequest, res: Response) => {
  const collection = await SqlCollection.findByPk(req.params.id);
  if (!collection) {
    return res.status(404).json({ message: 'Collection not found' });
  }
  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), String(collection.workspaceId));
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: 'Editor role required in this workspace to manage share links' });
    }
  }
  const links = await SqlSharedLink.findAll({ where: { collectionId: collection.id }, order: [['createdAt', 'DESC']] });
  const now = new Date();
  return res.json(links
    .filter(l => !l.expiresAt || l.expiresAt >= now)
    .map(l => ({
      shortId: l.shortId,
      url: '/share/' + l.shortId,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
      canRevoke: req.user!.isSuperAdmin || String(l.createdBy) === String(req.user!._id),
    })));
});

// A signed-in user copies a shared collection into one of their workspaces.
// Only the public view is copied (no auth values, no secret-looking headers).
router.post('/:shortId/fork', validate(schemas.forkShareSchema), authenticate, async (req: AuthRequest, res: Response) => {
  if (!SHORT_ID_RE.test(String(req.params.shortId))) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }
  const link = await SqlSharedLink.findOne({ where: { shortId: req.params.shortId } });
  if (!link || (link.expiresAt && link.expiresAt < new Date())) {
    return res.status(404).json({ message: 'Link not found or expired' });
  }
  const source = await SqlCollection.findByPk(link.collectionId, { raw: true });
  if (!source) return res.status(404).json({ message: 'Collection not found' });

  const { workspaceId } = req.body;
  if (!req.user!.isSuperAdmin) {
    const role = await getUserWorkspaceRole(String(req.user!._id), String(workspaceId));
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: 'Editor role required in the target workspace' });
    }
  }

  const userId = String(req.user!._id);
  const collection = await CollectionRepository.create({
    name: source.name,
    description: source.description,
    workspaceId,
    createdBy: userId,
    order: await CollectionRepository.countByWorkspace(workspaceId),
  });
  const requests = await RequestRepository.findByCollection(String(source.id));
  let order = 0;
  for (const r of requests.map(toSafeRequest)) {
    await RequestRepository.create({
      collectionId: collection._id,
      folderId: null,
      name: r.name, method: r.method, url: r.url, description: r.description,
      headers: r.headers || [], params: [], auth: { type: 'none' },
      body: { mode: 'none' }, preRequestScript: '', testScript: '',
      comments: [], createdBy: userId, order: order++,
    });
  }
  emitToWorkspace(workspaceId, 'collection:created', collection);
  return res.json({ collectionId: collection._id, requests: requests.length });
});

router.delete('/:shortId', authenticate, async (req: AuthRequest, res: Response) => {
  if (!SHORT_ID_RE.test(String(req.params.shortId))) {
    return res.status(404).json({ message: 'Link not found' });
  }
  const link = await SqlSharedLink.findOne({ where: { shortId: req.params.shortId } });
  if (!link) {
    return res.status(404).json({ message: 'Link not found' });
  }
  if (!req.user!.isSuperAdmin && String(link.createdBy) !== String(req.user!._id)) {
    return res.status(403).json({ message: 'Only the creator can revoke this link' });
  }
  await link.destroy();
  return res.status(200).json({ message: 'Link revoked' });
});

export default router;
