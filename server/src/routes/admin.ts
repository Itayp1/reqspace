import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireSuperAdmin } from '../middleware/auth';
import { User } from '../models/User';
import { Workspace } from '../models/Workspace';
import { logAudit, AuditLogRepository } from '../repositories/AuditLogRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { Collection } from '../models/Collection';
import { Folder } from '../models/Folder';
import { Request as ApiRequest } from '../models/Request';
import { Environment } from '../models/Environment';
import { UserRepository } from '../repositories/UserRepository';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const router = Router();
router.use(authenticate, requireSuperAdmin);

// ── GET /api/admin/users ────────────────────────────────────────────────────
router.get('/users', async (req: AuthRequest, res: Response) => {
  const { search, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const query: Record<string, unknown> = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  if (status) query.status = status;

  const users = await User.find(query)
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .skip((+page - 1) * +limit)
    .limit(+limit)
    .lean();

  const total = await User.countDocuments(query);
  return res.json({ users, total, page: +page, limit: +limit });
});

// ── PUT /api/admin/users/:id ────────────────────────────────────────────────
router.put('/users/:id', async (req: AuthRequest, res: Response) => {
  const { name, email, status, password } = req.body;
  const update: Record<string, unknown> = {};
  if (name) update.name = name;
  if (email) update.email = email.toLowerCase();
  if (status) update.status = status;
  if (password) update.passwordHash = await bcrypt.hash(password, 12);

  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
    .select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found' });

  await logAudit(req.user!._id as any, 'admin.user.update', {
    targetType: 'User', targetId: user._id as any,
    ip: req.ip, details: { fields: Object.keys(update) },
  });

  return res.json(user);
});

// ── POST /api/admin/users ── Create User ──────────────────────────────────────
router.post('/users', async (req: AuthRequest, res: Response) => {
  const { name, email, password, isSuperAdmin } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    authType: 'password',
    isSuperAdmin: !!isSuperAdmin,
    mustChangePassword: true, // Force password change on first login
  });

  const { createPersonalWorkspace } = require('../middleware/auth');
  await createPersonalWorkspace(user);

  await logAudit(req.user!._id as any, 'user.create', {
    targetType: 'User', targetId: user._id as any, ip: req.ip,
  });

  return res.status(201).json({ message: 'User created successfully', user: { _id: user._id, name: user.name, email: user.email } });
});

// ── POST /api/admin/users/:id/promote – Set SuperAdmin ──────────────────────
router.post('/users/:id/promote', async (req: AuthRequest, res: Response) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isSuperAdmin: true },
    { new: true }
  ).select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found' });

  await logAudit(req.user!._id as any, 'user.promote', {
    targetType: 'User', targetId: user._id as any, ip: req.ip,
  });
  return res.json({ message: 'User promoted to SuperAdmin', user });
});

// ── POST /api/admin/users/:id/revoke – Remove SuperAdmin ────────────────────
router.post('/users/:id/revoke', async (req: AuthRequest, res: Response) => {
  if (String(req.params.id) === String(req.user!._id)) {
    return res.status(400).json({ message: 'Cannot revoke your own SuperAdmin privileges' });
  }
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isSuperAdmin: false },
    { new: true }
  ).select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found' });

  await logAudit(req.user!._id as any, 'user.revoke', {
    targetType: 'User', targetId: user._id as any, ip: req.ip,
  });
  return res.json({ message: 'SuperAdmin revoked', user });
});

// ── POST /api/admin/users/:id/suspend ───────────────────────────────────────
router.post('/users/:id/suspend', async (req: AuthRequest, res: Response) => {
  if (String(req.params.id) === String(req.user!._id)) {
    return res.status(400).json({ message: 'Cannot suspend yourself' });
  }
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'suspended' },
    { new: true }
  ).select('-passwordHash');
  if (!user) return res.status(404).json({ message: 'User not found' });

  await logAudit(req.user!._id as any, 'user.suspend', {
    targetType: 'User', targetId: user._id as any, ip: req.ip,
  });
  return res.json({ message: 'User suspended', user });
});

// ── DELETE /api/admin/users/:id ─────────────────────────────────────────────
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  if (String(req.params.id) === String(req.user!._id)) {
    return res.status(400).json({ message: 'Cannot delete yourself' });
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  await logAudit(req.user!._id as any, 'user.delete', {
    targetType: 'User', targetId: user._id as any, ip: req.ip,
  });
  return res.json({ message: 'User deleted' });
});

// ── GET /api/admin/workspaces ───────────────────────────────────────────────
router.get('/workspaces', async (_req: AuthRequest, res: Response) => {
  const workspaces = await Workspace.find()
    .populate('ownerId', 'name email')
    .lean();
  return res.json(workspaces);
});

// ── GET /api/admin/audit-logs ───────────────────────────────────────────────
router.get('/audit-logs', async (req: AuthRequest, res: Response) => {
  const { action, userId, from, to, page = '1', limit = '100' } = req.query as Record<string, string>;
  const query: Record<string, unknown> = {};
  if (action) query.action = { $regex: action, $options: 'i' };
  if (userId) query.userId = new mongoose.Types.ObjectId(userId);
  if (from || to) {
    query.createdAt = {};
    if (from) (query.createdAt as Record<string, unknown>).$gte = new Date(from);
    if (to) (query.createdAt as Record<string, unknown>).$lte = new Date(to);
  }

  const skip = (+page - 1) * +limit;
  const logs = await AuditLogRepository.list(query, +limit, skip);
  const total = await AuditLogRepository.count(query);

  const userIds = [...new Set(logs.map(l => l.userId))];
  const users = await Promise.all(userIds.map(id => UserRepository.findById(id)));
  const userMap = Object.fromEntries(users.filter(Boolean).map((u: any) => [u!.id || (u as any)._id.toString(), { _id: u!.id || (u as any)._id.toString(), name: u!.name, email: u!.email }]));
  
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
router.put('/config', async (req: AuthRequest, res: Response) => {
  const update = JSON.parse(JSON.stringify(req.body));
  // The client only ever sees the masked placeholder for secret fields (see
  // GET /config above); if it comes back unchanged, drop it from the update
  // so it doesn't overwrite the real stored secret with the mask itself.
  if (update.auth?.smtp?.pass === SECRET_MASK) delete update.auth.smtp.pass;
  if (update.auth?.googleOAuth?.clientSecret === SECRET_MASK) delete update.auth.googleOAuth.clientSecret;
  if (update.proxy?.password === SECRET_MASK) delete update.proxy.password;

  const config = await SystemConfigRepository.updateConfig(update);
  await logAudit(req.user!._id as any, 'admin.config.update', {
    // Field names only — never the raw values, which can include SMTP/OAuth/proxy secrets.
    ip: req.ip, details: { fields: Object.keys(req.body) },
  });
  return res.json(maskConfigSecrets(config));
});

// ── POST /api/admin/test-smtp ──────────────────────────────────────
router.post('/test-smtp', async (req: AuthRequest, res: Response) => {
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

    const collections = await Collection.find({ workspaceId }).lean();
    const folders = await Folder.find({ workspaceId }).lean();
    const requests = await ApiRequest.find({ workspaceId }).lean();
    const environments = await Environment.find({ workspaceId }).lean();
        const config = await SystemConfigRepository.getConfig();

    const dump = {
      workspace,
      collections,
      folders,
      requests,
      environments,
            config
    };

    await logAudit(req.user!._id as any, 'admin.export', { ip: req.ip, targetId: workspaceId as any });
    
    // Set headers to trigger a download of the JSON file
    res.setHeader('Content-disposition', `attachment; filename=reqspace-export-${workspaceId}-${new Date().toISOString().split('T')[0]}.json`);
    res.setHeader('Content-type', 'application/json');
    return res.send(JSON.stringify(dump, null, 2));
  } catch(err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// ── POST /api/admin/import/:workspaceId ─────────────────────────────
router.post('/import/:workspaceId', async (req: AuthRequest, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const dump = req.body;
    
    // In a real scenario we should validate and insert. 
    // Since this is a dump, we can insert collections, folders, requests, environments, globals.
    if (dump.collections) await Collection.insertMany(dump.collections.map((c: any) => ({ ...c, workspaceId, _id: undefined })));
    if (dump.folders) await Folder.insertMany(dump.folders.map((f: any) => ({ ...f, workspaceId, _id: undefined })));
    if (dump.requests) await ApiRequest.insertMany(dump.requests.map((r: any) => ({ ...r, workspaceId, _id: undefined })));
    if (dump.environments) await Environment.insertMany(dump.environments.map((e: any) => ({ ...e, workspaceId, _id: undefined })));

    // Deliberately ignore dump.config: importing a *workspace* must never
    // rewrite system-wide settings (SMTP creds, OAuth secrets, proxy) — that
    // let a crafted export hijack the whole instance (CR#14).

    await logAudit(req.user!._id as any, 'admin.import', { ip: req.ip, targetId: workspaceId as any });
    return res.json({ message: 'Import successful' });
  } catch(err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
