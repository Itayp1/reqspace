import { validate } from '../middleware/validate';
import * as schemas from '../schemas/admin.schemas';
import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireSuperAdmin, createPersonalWorkspace } from '../middleware/auth';
import { disconnectUserSockets } from '../socketUtils';
import { UserRepository } from '../repositories/UserRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { logAudit, AuditLogRepository } from '../repositories/AuditLogRepository';
import { SqlUser, SqlCollection, SqlFolder, SqlRequest, SqlEnvironment } from '../db/sql-models';
import { FpErrorRepository } from '../repositories/FpErrorRepository';
import { CascadeRepository } from '../repositories/CascadeRepository';
import { listErrorsQuerySchema } from '../schemas/errors.schemas';
import { isValidId } from '../utils/ids';
import { superAdminCache, workspaceRoleCache } from '../utils/cache';
import { likeAnyColumn, MAX_SEARCH_LENGTH } from '../utils/escapeLike';
import { isPrivateOrReservedHost, SsrfBlockedError } from '../utils/ssrf';
import { Op, fn, col } from 'sequelize';
import { OAUTH_PROVIDERS, allowedRedirectUris } from '../utils/oauthProviders';

const router = Router();
router.use(authenticate, requireSuperAdmin);

router.get('/users', async (req: AuthRequest, res: Response) => {
  const { cursor, limit, search } = req.query as Record<string, string>;
  const term = typeof search === 'string' ? search.trim().slice(0, MAX_SEARCH_LENGTH) : '';
  const filter = term ? likeAnyColumn(['email', 'name'], term) : {};
  const result = await UserRepository.list(filter, { limit: Math.min(Number(limit) || 50, 200), cursor });
  return res.json({ users: result.items.map(publicUser), nextCursor: result.nextCursor });
});

/**
 * Create a user on someone's behalf. The account is flagged
 * mustChangePassword, so the password the admin typed is single-use and the
 * ForcePasswordChangeModal takes over on first login.
 */
router.post('/users', validate(schemas.createUserSchema), async (req: AuthRequest, res: Response) => {
  const { name, email, password, isSuperAdmin } = req.body as {
    name: string; email: string; password: string; isSuperAdmin?: boolean;
  };

  const existing = await UserRepository.findByEmail(email);
  if (existing) return res.status(409).json({ message: 'Email already registered' });

  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await UserRepository.create({
    name,
    email,
    passwordHash,
    authType: 'password',
    isSuperAdmin: !!isSuperAdmin,
    mustChangePassword: true,
  });

  // Same as self-registration: without a personal workspace the new account
  // lands on an app with nowhere to put anything, and forking has no target.
  await createPersonalWorkspace(user);

  await logAudit(String(req.user!._id), 'admin.user.create', {
    targetType: 'User',
    targetId: String(user._id),
    ip: req.ip,
    details: { email: user.email, isSuperAdmin: !!isSuperAdmin },
  });

  // Never echo the hash back.
  const { passwordHash: _omit, ...safe } = user as any;
  return res.status(201).json(safe);
});

// ── User management ─────────────────────────────────────────────────────────
// The Users tab has always shown Make Admin / Revoke Admin / Suspend / Delete
// buttons; none of these routes existed, so every click 404'd.

function publicUser(u: any) {
  if (!u) return u;
  const { passwordHash: _omit, clientCertificates: _certs, tokenVersion: _tv, ...safe } = u;
  // The user's own outbound-proxy password lives in their settings blob; an
  // admin listing has no reason to see it.
  if (safe.settings && typeof safe.settings === 'object') {
    const { proxyPassword: _pp, ...settings } = safe.settings;
    safe.settings = settings;
  }
  return safe;
}

async function loadTargetUser(req: AuthRequest, res: Response) {
  if (!isValidId(req.params.id)) {
    res.status(400).json({ message: 'Invalid user id' });
    return null;
  }
  const target = await UserRepository.findById(req.params.id);
  if (!target) {
    res.status(404).json({ message: 'User not found' });
    return null;
  }
  return target;
}

router.post('/users/:id/promote', validate(schemas.emptyBodySchema), async (req: AuthRequest, res: Response) => {
  const target = await loadTargetUser(req, res);
  if (!target) return;
  const updated = await UserRepository.update(target.id, { isSuperAdmin: true } as any);
  superAdminCache.delete(target.id);
  await logAudit(req.user!.id, 'admin.user.promote', { targetType: 'User', targetId: target.id, ip: req.ip, details: { email: target.email } });
  return res.json(publicUser(updated));
});

// Revoke/delete check "is this the last super admin" and then write. Two
// requests interleaving between that check and the write could each see the
// other admin still present and leave none, so they run one at a time.
let adminGuard: Promise<unknown> = Promise.resolve();
function serializeAdminChange<T>(fn: () => Promise<T>): Promise<T> {
  const run = adminGuard.then(fn, fn);
  adminGuard = run.catch(() => undefined);
  return run;
}

router.post('/users/:id/revoke', validate(schemas.emptyBodySchema), (req: AuthRequest, res: Response) => serializeAdminChange(async () => {
  const target = await loadTargetUser(req, res);
  if (!target) return;
  if (target.id === req.user!.id) return res.status(400).json({ message: 'You cannot revoke your own super admin role' });
  if (target.isSuperAdmin && (await UserRepository.countSuperAdmins()) <= 1) {
    return res.status(400).json({ message: 'At least one super admin must remain' });
  }
  const updated = await UserRepository.update(target.id, { isSuperAdmin: false } as any);
  superAdminCache.delete(target.id);
  await logAudit(req.user!.id, 'admin.user.revoke', { targetType: 'User', targetId: target.id, ip: req.ip, details: { email: target.email } });
  return res.json(publicUser(updated));
}));

router.post('/users/:id/suspend', validate(schemas.suspendUserSchema), async (req: AuthRequest, res: Response) => {
  const target = await loadTargetUser(req, res);
  if (!target) return;
  const { suspended } = req.body as { suspended: boolean };
  if (suspended && target.id === req.user!.id) return res.status(400).json({ message: 'You cannot suspend your own account' });
  // authenticate() rejects any status other than 'active', so this takes
  // effect on the user's very next request.
  const updated = await UserRepository.update(target.id, { status: suspended ? 'suspended' : 'active' } as any);
  // Close the suspended user's open sockets so they stop receiving live events (A9.3).
  if (suspended) disconnectUserSockets(target.id);
  await logAudit(req.user!.id, suspended ? 'admin.user.suspend' : 'admin.user.unsuspend', { targetType: 'User', targetId: target.id, ip: req.ip, details: { email: target.email } });
  return res.json(publicUser(updated));
});

router.delete('/users/:id', (req: AuthRequest, res: Response) => serializeAdminChange(async () => {
  const target = await loadTargetUser(req, res);
  if (!target) return;
  if (target.id === req.user!.id) return res.status(400).json({ message: 'You cannot delete your own account' });
  if (target.isSuperAdmin && (await UserRepository.countSuperAdmins()) <= 1) {
    return res.status(400).json({ message: 'At least one super admin must remain' });
  }
  const result = await CascadeRepository.deleteUserTree(target.id, req.user!.id);
  superAdminCache.delete(target.id);
  workspaceRoleCache.deleteByPrefix(`${target.id}:`);
  await logAudit(req.user!.id, 'admin.user.delete', { targetType: 'User', targetId: target.id, ip: req.ip, details: { email: target.email, ...result } });
  return res.json({ message: 'User deleted', ...result });
}));

router.get('/workspaces', async (req: AuthRequest, res: Response) => {
  const { cursor, limit } = req.query as Record<string, string>;
  const result = await WorkspaceRepository.list({ limit: Math.min(Number(limit) || 50, 200), cursor });

  // Owner and size are what an admin scans this table for; the stored row only
  // has the owner's id and no counts.
  const wsIds = result.items.map(w => w.id);
  const ownerIds = [...new Set(result.items.map(w => w.ownerId))];
  const owners = ownerIds.length ? await SqlUser.findAll({ where: { id: ownerIds }, attributes: ['id', 'name', 'email'], raw: true }) : [];
  const ownerById = new Map(owners.map((u: any) => [String(u.id), u]));
  const collections = wsIds.length ? await SqlCollection.findAll({ where: { workspaceId: wsIds }, attributes: ['id', 'workspaceId'], raw: true }) : [];
  const wsOfCollection = new Map(collections.map((c: any) => [String(c.id), String(c.workspaceId)]));
  const requestRows = collections.length
    ? await SqlRequest.findAll({ where: { collectionId: collections.map((c: any) => c.id) }, raw: true })
    : [];
  const storageBytes = new Map<string, number>();
  const requestCounts: any[] = [];
  {
    const perCol = new Map<string, number>();
    for (const r of requestRows as any[]) {
      const k = String(r.collectionId);
      perCol.set(k, (perCol.get(k) || 0) + 1);
      const wsId = wsOfCollection.get(k);
      if (wsId) storageBytes.set(wsId, (storageBytes.get(wsId) || 0) + Buffer.byteLength(JSON.stringify(r)));
    }
    for (const [collectionId, n] of perCol) requestCounts.push({ collectionId, n });
  }
  const collectionCount = new Map<string, number>();
  const requestCount = new Map<string, number>();
  for (const c of collections as any[]) storageBytes.set(String(c.workspaceId), (storageBytes.get(String(c.workspaceId)) || 0) + Buffer.byteLength(JSON.stringify(c)));
  for (const c of collections as any[]) collectionCount.set(String(c.workspaceId), (collectionCount.get(String(c.workspaceId)) || 0) + 1);
  for (const r of requestCounts as any[]) {
    const wsId = wsOfCollection.get(String(r.collectionId));
    if (wsId) requestCount.set(wsId, (requestCount.get(wsId) || 0) + Number(r.n));
  }

  const workspaces = result.items.map(w => {
    const o: any = ownerById.get(String(w.ownerId));
    return {
      ...w,
      owner: o ? { _id: o.id, name: o.name, email: o.email } : null,
      collectionCount: collectionCount.get(w.id) || 0,
      requestCount: requestCount.get(w.id) || 0,
      storageBytes: storageBytes.get(w.id) || 0,
    };
  });
  return res.json({ workspaces, nextCursor: result.nextCursor });
});

router.get('/logs', async (req: AuthRequest, res: Response) => {
  // Newest first, filterable by actor/action/date and paged with page+limit.
  const { userId, action, from, to, page, limit } = req.query as Record<string, string>;
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const pageNo = Math.max(Number(page) || 1, 1);
  const filter: Record<string, any> = {};
  if (userId) filter.userId = String(userId);
  if (action) filter.action = String(action).slice(0, 50);
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && !isNaN(fromDate.getTime())) filter.createdAt = { ...(filter.createdAt || {}), [Op.gte]: fromDate };
  if (toDate && !isNaN(toDate.getTime())) filter.createdAt = { ...(filter.createdAt || {}), [Op.lte]: toDate };
  const [logs, total] = await Promise.all([
    AuditLogRepository.list(filter, pageSize, (pageNo - 1) * pageSize),
    AuditLogRepository.count(filter),
  ]);
  // Same enrichment as the workspace Activity tab: the table only stores the
  // user id, which told the admin nothing.
  const userIds = [...new Set(logs.map(l => String(l.userId)))];
  const users = userIds.length ? await SqlUser.findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'], raw: true }) : [];
  const byId = new Map(users.map((u: any) => [String(u.id), u]));
  const enriched = logs.map(l => {
    const u = byId.get(String(l.userId));
    return { ...l, userId: u ? { _id: u.id, name: u.name, email: u.email } : l.userId };
  });
  // Audit entries carry user-controlled names. Emit `<`, `>` and `&` as JSON
  // unicode escapes so the raw body can never carry markup; JSON.parse on the
  // client still yields the original text, which React renders as plain text.
  const body = JSON.stringify({ logs: enriched, total, page: pageNo, limit: pageSize })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return res.type('application/json').send(body);
});

router.get('/errors', async (req: AuthRequest, res: Response) => {
  const parsed = listErrorsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid query', issues: parsed.error.issues });
  }
  const groups = await FpErrorRepository.listGroups(parsed.data);
  return res.json({ groups, hasMore: groups.length === parsed.data.limit });
});

router.get('/errors/:fingerprint', async (req: AuthRequest, res: Response) => {
  const items = await FpErrorRepository.findOccurrences(req.params.fingerprint);
  return res.json({ items });
});

// "Fixed": the fault is resolved, so every stored occurrence of it is removed.
router.delete('/errors/:fingerprint', async (req: AuthRequest, res: Response) => {
  const deleted = await FpErrorRepository.deleteFingerprint(req.params.fingerprint);
  await logAudit(req.user!.id, 'fperror.resolve', {
    targetType: 'fperror',
    targetId: req.params.fingerprint,
    ip: req.ip,
    details: { deleted },
  });
  return res.json({ deleted });
});

// Stands in for a stored secret on read; a PUT that echoes it back leaves the
// stored value untouched.
const SECRET_MASK = '••••••••';
function maskConfigSecrets(config: any) {
  if (!config) return config;
  const masked = JSON.parse(JSON.stringify(config));
  if (masked.auth?.smtp?.pass) masked.auth.smtp.pass = SECRET_MASK;
  for (const key of ['googleOAuth', 'githubOAuth', 'microsoftOAuth', 'customOAuth']) {
    if (masked.auth?.[key]?.clientSecret) masked.auth[key].clientSecret = SECRET_MASK;
  }
  if (masked.proxy?.password) masked.proxy.password = SECRET_MASK;
  return masked;
}

router.get('/config', async (_req: AuthRequest, res: Response) => {
  const config = await SystemConfigRepository.getConfig();
  // Lets the settings screen warn when a provider's callback URL would be refused.
  const oauthRedirectAllowlist = Object.fromEntries(OAUTH_PROVIDERS.map((id) => [id, allowedRedirectUris(id)]));
  return res.json({ ...maskConfigSecrets(config), oauthRedirectAllowlist });
});

router.put('/config', validate(schemas.updateConfigSchema), async (req: AuthRequest, res: Response) => {
  const update = JSON.parse(JSON.stringify(req.body));
  if (update.auth?.smtp?.pass === SECRET_MASK) delete update.auth.smtp.pass;
  for (const key of ['googleOAuth', 'githubOAuth', 'microsoftOAuth', 'customOAuth']) {
    if (update.auth?.[key]?.clientSecret === SECRET_MASK) delete update.auth[key].clientSecret;
  }
  if (update.proxy?.password === SECRET_MASK) delete update.proxy.password;

  const config = await SystemConfigRepository.updateConfig(update);
  await logAudit(req.user!._id as any, 'admin.config.update', {
    ip: req.ip, details: { fields: Object.keys(req.body) },
  });
  return res.json(maskConfigSecrets(config));
});

// "Test Connection" on the SMTP settings. Takes the form's current values, so
// an unsaved config can be checked; a masked password means "use the stored one".
// A bad host or login is the admin's input, not a server fault, so it answers
// 400 with the transport's message rather than a 500.
const smtpTestInFlight = new Set<string>();
router.post('/test-smtp', validate(schemas.testSmtpSchema), async (req: AuthRequest, res: Response) => {
  // Q9.6: one identical SMTP check per admin at a time (double click / retry
  // storm). "Identical" includes the effective private-target policy, so
  // re-running after an admin flips that setting is not a duplicate.
  const body = req.body as { host: string; port?: number; user?: string };
  const allowPrivate = !!(await SystemConfigRepository.getConfig())?.proxy?.allowPrivateTargets;
  const adminId = String((req as any).user?.id ?? (req as any).userId ?? req.ip ?? 'admin');
  const guardKey = [adminId, body.host, body.port ?? '', body.user ?? '', allowPrivate].join('|');
  if (smtpTestInFlight.has(guardKey)) {
    return res.status(429).json({ message: 'An SMTP test is already running - please wait.' });
  }
  smtpTestInFlight.add(guardKey);
  try {
    return await runSmtpTest(req, res);
  } finally {
    // Short cooldown so a double click whose first check failed instantly is still coalesced.
    setTimeout(() => smtpTestInFlight.delete(guardKey), 1000).unref();
  }
});

async function runSmtpTest(req: AuthRequest, res: Response) {
  const body = req.body as { host: string; port?: number; user?: string; pass?: string };
  let pass = body.pass;
  if (pass === SECRET_MASK) pass = (await SystemConfigRepository.getConfig())?.auth.smtp?.pass;
  const port = body.port || 587;
  // Same guard as the WSDL import: without "allow private targets" this
  // endpoint must not be usable to probe the server's own network.
  const cfg = await SystemConfigRepository.getConfig();
  if (!cfg?.proxy?.allowPrivateTargets && (await isPrivateOrReservedHost(body.host.replace(/^\[|\]$/g, '')))) {
    return res.status(400).json({ message: new SsrfBlockedError().message });
  }
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: body.host,
    port,
    secure: port === 465,
    auth: body.user ? { user: body.user, pass: pass || '' } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  try {
    await transporter.verify();
    return res.json({ message: `Connected to ${body.host}:${port}` });
  } catch (err: any) {
    return res.status(400).json({ message: `SMTP connection failed: ${err?.message || 'unknown error'}` });
  } finally {
    transporter.close();
  }
}

router.get('/export/:workspaceId', async (req: AuthRequest, res: Response) => {
  const workspaceId = req.params.workspaceId;
  const workspace = await WorkspaceRepository.findById(workspaceId);
  const collections = await SqlCollection.findAll({ where: { workspaceId }, raw: true });
  const collectionIds = collections.map(c => c.id);
  const folders = collectionIds.length > 0 ? await SqlFolder.findAll({ where: { collectionId: collectionIds }, raw: true }) : [];
  const requests = collectionIds.length > 0 ? await SqlRequest.findAll({ where: { collectionId: collectionIds }, raw: true }) : [];
  let environments: any[] = await SqlEnvironment.findAll({ where: { workspaceId }, raw: true });

  // Secret variables leave the server blank unless the admin explicitly asks
  // for them: a dump is a file that gets copied, mailed and left in Downloads.
  const includeSecrets = req.query.includeSecrets === 'true';
  if (!includeSecrets) {
    environments = environments.map(env => {
      let vars: any;
      try { vars = JSON.parse(env.variables); } catch { return env; }
      if (!Array.isArray(vars)) return env;
      const stripped = vars.map((v: any) => (v && (v.isSecret === true || v.type === 'secret'))
        ? { ...v, value: '', initialValue: '', currentValue: '' }
        : v);
      return { ...env, variables: JSON.stringify(stripped) };
    });
  }

  const dump = { workspace, collections, folders, requests, environments };
  await logAudit(req.user!._id as any, includeSecrets ? 'admin.export.secrets' : 'admin.export', { ip: req.ip, targetId: workspaceId as any });
  // The client triggers this via `window.location.href` (not fetch+blob) —
  // without Content-Disposition: attachment, the browser just navigates to
  // and renders the JSON instead of downloading it, abandoning the SPA.
  res.setHeader('Content-Disposition', `attachment; filename="reqspace-export-${workspaceId}.json"`);
  return res.json(dump);
});

router.post('/import/:workspaceId', validate(schemas.importDumpSchema), async (req: AuthRequest, res: Response) => {
  const workspaceId = req.params.workspaceId;
  const dump = req.body;

  // Importing into a workspace that already has data needs an explicit choice,
  // otherwise every collection and environment silently doubles.
  const oldCollections = await SqlCollection.findAll({ where: { workspaceId }, attributes: ['id'], raw: true }) as Array<{ id: string }>;
  const oldEnvironments = await SqlEnvironment.findAll({ where: { workspaceId }, attributes: ['id'], raw: true }) as Array<{ id: string }>;
  const mode = req.query.mode;
  if (oldCollections.length + oldEnvironments.length > 0 && mode !== 'append' && mode !== 'overwrite') {
    return res.status(409).json({
      code: 'WORKSPACE_NOT_EMPTY',
      message: 'Workspace is not empty. Retry with ?mode=append to add to it or ?mode=overwrite to replace its collections and environments.',
      collections: oldCollections.length,
      environments: oldEnvironments.length,
    });
  }
  const crypto = await import('crypto');
  const uuidv4 = crypto.randomUUID;

  const idMap = new Map<string, string>();
  
  const t = await SqlCollection.sequelize!.transaction();
  try {
    if (dump.collections) {
      const mapped = dump.collections.map((c: any) => {
        const newId = uuidv4();
        idMap.set(c.id, newId);
        return { ...c, workspaceId, id: newId };
      });
      await SqlCollection.bulkCreate(mapped, { transaction: t });
    }
    
    if (dump.folders) {
      const mapped = dump.folders.map((f: any) => {
        const newId = uuidv4();
        idMap.set(f.id, newId);
        return { 
          ...f, 
          id: newId,
          collectionId: idMap.get(f.collectionId) || f.collectionId,
          parentFolderId: f.parentFolderId ? (idMap.get(f.parentFolderId) || f.parentFolderId) : null
        };
      });
      // Check for dangling parentFolderIds
      for (const f of mapped) {
        if (f.parentFolderId && !mapped.find((x: any) => x.id === f.parentFolderId)) {
          throw new Error('Dangling parentFolderId');
        }
      }
      await SqlFolder.bulkCreate(mapped, { transaction: t });
    }
    
    if (dump.requests) {
      const mapped = dump.requests.map((r: any) => {
        const newId = uuidv4();
        idMap.set(r.id, newId);
        return { 
          ...r, 
          id: newId,
          collectionId: idMap.get(r.collectionId) || r.collectionId,
          folderId: r.folderId ? (idMap.get(r.folderId) || r.folderId) : null
        };
      });
      await SqlRequest.bulkCreate(mapped, { transaction: t });
    }
    
    if (dump.environments) {
      const mapped = dump.environments.map((e: any) => {
        const newId = uuidv4();
        return { ...e, workspaceId, id: newId };
      });
      await SqlEnvironment.bulkCreate(mapped, { transaction: t });
    }
    
    await t.commit();
  } catch (err) {
    await t.rollback();
    return res.status(400).json({ message: 'Import failed due to constraints', error: String(err) });
  }

  // Replace: the dump is already in, so a failed import never loses the old data.
  if (mode === 'overwrite') {
    for (const c of oldCollections) await CascadeRepository.deleteCollectionTree(c.id);
    if (oldEnvironments.length > 0) await SqlEnvironment.destroy({ where: { id: oldEnvironments.map(e => e.id) } });
  }

  await logAudit(req.user!._id as any, 'admin.import', { ip: req.ip, targetId: workspaceId as any });
  return res.json({ message: 'Import successful' });
});

export default router;
