import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireSuperAdmin } from '../middleware/auth';
import { logAudit, AuditLogRepository } from '../repositories/AuditLogRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { CollectionRepository } from '../repositories/CollectionRepository';
import { FolderRepository } from '../repositories/FolderRepository';
import { RequestRepository } from '../repositories/RequestRepository';
import { EnvironmentRepository } from '../repositories/EnvironmentRepository';
import { UserRepository, IUserRecord } from '../repositories/UserRepository';
import { redisMode } from '../redis';
import bcrypt from 'bcryptjs';
import { validateBody, adminCreateUserBody, adminUpdateUserBody, adminConfigBody, smtpTestBody, adminImportBody } from '../validation/body';

function publicUser(user: IUserRecord) {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

const router = Router();
router.use(authenticate, requireSuperAdmin);

router.get('/runtime', (_req: AuthRequest, res: Response) => {
  return res.json({ redisConcurrency: redisMode() });
});

// ── GET /api/admin/users ────────────────────────────────────────────────────
router.get('/users', async (req: AuthRequest, res: Response) => {
  const { search, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const { users, total } = await UserRepository.search({
    search: search || undefined,
    status: status || undefined,
    limit: +limit,
    skip: (+page - 1) * +limit,
  });
  return res.json({ users: users.map(publicUser), total, page: +page, limit: +limit });
});

// ── PUT /api/admin/users/:id ────────────────────────────────────────────────
router.put('/users/:id', validateBody(adminUpdateUserBody), async (req: AuthRequest, res: Response) => {
  const { name, email, status, password } = req.body;
  const update: Partial<IUserRecord & { passwordHash: string }> = {};
  if (name) update.name = name;
  if (email) update.email = email.toLowerCase();
  if (status) update.status = status;
  if (password) update.passwordHash = await bcrypt.hash(password, 12);

  const user = await UserRepository.update(req.params.id, update);
  if (!user) return res.status(404).json({ message: 'User not found' });

  await logAudit(req.user!._id, 'admin.user.update', {
    targetType: 'User', targetId: user._id,
    ip: req.ip, details: { fields: Object.keys(update) },
  });

  return res.json(publicUser(user));
});

// ── POST /api/admin/users ── Create User ──────────────────────────────────────
router.post('/users', validateBody(adminCreateUserBody), async (req: AuthRequest, res: Response) => {
  const { name, email, password, isSuperAdmin } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const existing = await UserRepository.findByEmail(email);
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await UserRepository.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    authType: 'password',
    isSuperAdmin: !!isSuperAdmin,
    mustChangePassword: true,
  });

  const { createPersonalWorkspace } = require('../middleware/auth');
  await createPersonalWorkspace(user);

  await logAudit(req.user!._id, 'user.create', {
    targetType: 'User', targetId: user._id, ip: req.ip,
  });

  return res.status(201).json({ message: 'User created successfully', user: { _id: user._id, name: user.name, email: user.email } });
});

// ── POST /api/admin/users/:id/promote – Set SuperAdmin ──────────────────────
router.post('/users/:id/promote', async (req: AuthRequest, res: Response) => {
  const user = await UserRepository.update(req.params.id as string, { isSuperAdmin: true });
  if (!user) return res.status(404).json({ message: 'User not found' });

  await logAudit(req.user!._id, 'user.promote', {
    targetType: 'User', targetId: user._id, ip: req.ip,
  });
  return res.json({ message: 'User promoted to SuperAdmin', user: publicUser(user) });
});

// ── POST /api/admin/users/:id/revoke – Remove SuperAdmin ────────────────────
router.post('/users/:id/revoke', async (req: AuthRequest, res: Response) => {
  if (String(req.params.id) === String(req.user!._id)) {
    return res.status(400).json({ message: 'Cannot revoke your own SuperAdmin privileges' });
  }
  const user = await UserRepository.update(req.params.id as string, { isSuperAdmin: false });
  if (!user) return res.status(404).json({ message: 'User not found' });

  await logAudit(req.user!._id, 'user.revoke', {
    targetType: 'User', targetId: user._id, ip: req.ip,
  });
  return res.json({ message: 'SuperAdmin revoked', user: publicUser(user) });
});

// ── POST /api/admin/users/:id/suspend ───────────────────────────────────────
router.post('/users/:id/suspend', async (req: AuthRequest, res: Response) => {
  if (String(req.params.id) === String(req.user!._id)) {
    return res.status(400).json({ message: 'Cannot suspend yourself' });
  }
  const user = await UserRepository.update(req.params.id as string, { status: 'suspended' });
  if (!user) return res.status(404).json({ message: 'User not found' });

  await logAudit(req.user!._id, 'user.suspend', {
    targetType: 'User', targetId: user._id, ip: req.ip,
  });
  return res.json({ message: 'User suspended', user: publicUser(user) });
});

// ── DELETE /api/admin/users/:id ─────────────────────────────────────────────
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  if (String(req.params.id) === String(req.user!._id)) {
    return res.status(400).json({ message: 'Cannot delete yourself' });
  }
  const user = await UserRepository.findById(req.params.id as string);
  if (!user) return res.status(404).json({ message: 'User not found' });
  await UserRepository.delete(user.id);

  await logAudit(req.user!._id, 'user.delete', {
    targetType: 'User', targetId: user._id, ip: req.ip,
  });
  return res.json({ message: 'User deleted' });
});

// ── GET /api/admin/workspaces ───────────────────────────────────────────────
router.get('/workspaces', async (_req: AuthRequest, res: Response) => {
  const workspaces = await WorkspaceRepository.list();
  const owners = await Promise.all(workspaces.map(w => UserRepository.findById(w.ownerId)));
  return res.json(workspaces.map((w, i) => ({
    ...w,
    ownerId: owners[i] ? { _id: owners[i]!.id, name: owners[i]!.name, email: owners[i]!.email } : w.ownerId,
  })));
});

// ── GET /api/admin/audit-logs ───────────────────────────────────────────────
router.get('/audit-logs', async (req: AuthRequest, res: Response) => {
  const { action, userId, from, to, page = '1', limit = '100' } = req.query as Record<string, string>;
  const skip = (+page - 1) * +limit;
  const { logs, total } = await AuditLogRepository.query({
    action: action || undefined,
    userId: userId || undefined,
    from: from || undefined,
    to: to || undefined,
    limit: +limit,
    skip,
  });

  const userIds = [...new Set(logs.map(l => l.userId))];
  const users = await Promise.all(userIds.map(id => UserRepository.findById(id)));
  const userMap = Object.fromEntries(users.flatMap(u => u ? [[u._id, { _id: u._id, name: u.name, email: u.email }]] : []));
  
  const populatedLogs = logs.map(l => ({
    ...l,
    userId: userMap[l.userId] || l.userId
  }));

  return res.json({ logs: populatedLogs, total });
});

// ── GET /api/admin/config ───────────────────────────────────────────────────
// Secrets (SMTP password, OAuth client secret, outbound proxy password) are
// masked rather than returned in plaintext — the admin UI only needs to know
// one is set, not its value, and this response is one XSS/network-sniff away
// from leaking real credentials otherwise. Sending the *same* config object
// back to PUT /config with an unmodified mask leaves the stored secret alone
// (see updateConfig's masked-value handling below).
const SECRET_MASK = '••••••••';
function maskConfigSecrets(config: any) {
  if (!config) return config;
  const masked = JSON.parse(JSON.stringify(config));
  if (masked.auth?.smtp?.pass) masked.auth.smtp.pass = SECRET_MASK;
  if (masked.auth?.googleOAuth?.clientSecret) masked.auth.googleOAuth.clientSecret = SECRET_MASK;
  if (masked.proxy?.password) masked.proxy.password = SECRET_MASK;
  return masked;
}

router.get('/config', async (_req: AuthRequest, res: Response) => {
  const config = await SystemConfigRepository.getConfig();
  return res.json(maskConfigSecrets(config));
});

// ── PUT /api/admin/config ───────────────────────────────────────────────────
router.put('/config', validateBody(adminConfigBody), async (req: AuthRequest, res: Response) => {
  const update = JSON.parse(JSON.stringify(req.body));
  // The client only ever sees the masked placeholder for secret fields (see
  // GET /config above); if it comes back unchanged, drop it from the update
  // so it doesn't overwrite the real stored secret with the mask itself.
  if (update.auth?.smtp?.pass === SECRET_MASK) delete update.auth.smtp.pass;
  if (update.auth?.googleOAuth?.clientSecret === SECRET_MASK) delete update.auth.googleOAuth.clientSecret;
  if (update.proxy?.password === SECRET_MASK) delete update.proxy.password;

  const config = await SystemConfigRepository.updateConfig(update);
  await logAudit(req.user!._id, 'admin.config.update', {
    // Field names only — never the raw values, which can include SMTP/OAuth/proxy secrets.
    ip: req.ip, details: { fields: Object.keys(req.body) },
  });
  return res.json(maskConfigSecrets(config));
});

// ── POST /api/admin/test-smtp ──────────────────────────────────────
router.post('/test-smtp', validateBody(smtpTestBody), async (req: AuthRequest, res: Response) => {
  const { host, port, user, pass, fromAddress } = req.body;
  if (!host || !port) return res.status(400).json({ message: 'Host and port are required' });
  
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    await transporter.verify();
    
    // Optionally send a test email to the admin
    await transporter.sendMail({
      from: fromAddress || 'noreply@reqspace.com',
      to: req.user!.email,
      subject: 'Reqspace SMTP Test',
      text: 'This is a test email from your Reqspace system to verify SMTP settings are working correctly.',
    });
    
    return res.json({ message: 'SMTP connection successful and test email sent!' });
  } catch (err: any) {
    return res.status(500).json({ message: 'SMTP Error: ' + err.message });
  }
});

// ── GET /api/admin/export/:workspaceId ──────────────────────────────
router.get('/export/:workspaceId', async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const workspace = await WorkspaceRepository.findById(workspaceId);
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const collections = await CollectionRepository.findByWorkspace(workspaceId);
    const folders = (await Promise.all(collections.map(c => FolderRepository.findByCollection(c.id)))).flat();
    const requests = (await Promise.all(collections.map(c => RequestRepository.findByCollection(c.id)))).flat();
    const environments = await EnvironmentRepository.findByWorkspace(workspaceId);
        const config = await SystemConfigRepository.getConfig();

    const dump = {
      workspace,
      collections,
      folders,
      requests,
      environments,
            config
    };

    await logAudit(req.user!._id, 'admin.export', { ip: req.ip, targetId: workspaceId });
    
    // Set headers to trigger a download of the JSON file
    res.setHeader('Content-disposition', `attachment; filename=reqspace-export-${workspaceId}-${new Date().toISOString().split('T')[0]}.json`);
    res.setHeader('Content-type', 'application/json');
    return res.send(JSON.stringify(dump, null, 2));
  } catch(err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ── POST /api/admin/import/:workspaceId ─────────────────────────────
router.post('/import/:workspaceId', validateBody(adminImportBody), async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const dump = req.body;
    
    // In a real scenario we should validate and insert. 
    // Since this is a dump, we can insert collections, folders, requests, environments, globals.
    if (Array.isArray(dump.collections)) {
      for (const c of dump.collections) {
        await CollectionRepository.create({
          workspaceId,
          name: c.name,
          description: c.description,
          createdBy: String(req.user!._id),
          variables: c.variables,
          preRequestScript: c.preRequestScript,
          testScript: c.testScript,
          order: c.order,
        });
      }
    }
    if (Array.isArray(dump.folders)) {
      for (const f of dump.folders) {
        if (!f.collectionId || !f.name) continue;
        await FolderRepository.create({
          collectionId: f.collectionId,
          name: f.name,
          parentFolderId: f.parentFolderId ?? null,
          description: f.description,
          order: f.order,
        });
      }
    }
    if (Array.isArray(dump.requests)) {
      for (const r of dump.requests) {
        if (!r.collectionId || !r.name) continue;
        await RequestRepository.create({
          collectionId: r.collectionId,
          folderId: r.folderId ?? null,
          name: r.name,
          method: r.method || 'GET',
          url: r.url || '',
          params: r.params,
          headers: r.headers,
          auth: r.auth,
          body: r.body,
          order: r.order,
          createdBy: String(req.user!._id),
        });
      }
    }
    if (Array.isArray(dump.environments)) {
      for (const e of dump.environments) {
        if (!e.name) continue;
        await EnvironmentRepository.create({
          workspaceId,
          name: e.name,
          variables: e.variables,
          createdBy: String(req.user!._id),
          isGlobal: !!e.isGlobal,
          order: e.order,
        });
      }
    }

    // Deliberately ignore dump.config: importing a *workspace* must never
    // rewrite system-wide settings (SMTP creds, OAuth secrets, proxy) — that
    // let a crafted export hijack the whole instance (CR#14).

    await logAudit(req.user!._id, 'admin.import', { ip: req.ip, targetId: workspaceId });
    return res.json({ message: 'Import successful' });
  } catch(err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
