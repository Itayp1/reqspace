import { Router, Response } from 'express';
import { authenticate, AuthRequest, requireSuperAdmin } from '../middleware/auth';
import { User } from '../models/User';
import { Workspace } from '../models/Workspace';
import { logAudit, AuditLogRepository } from '../repositories/AuditLogRepository';
import { SystemConfigRepository } from '../repositories/SystemConfigRepository';
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
router.get('/config', async (_req: AuthRequest, res: Response) => {
  const config = await SystemConfigRepository.getConfig();
  return res.json(config);
});

// ── PUT /api/admin/config ───────────────────────────────────────────────────
router.put('/config', async (req: AuthRequest, res: Response) => {
  const { auth, history } = req.body;
  const config = await SystemConfigRepository.updateConfig(req.body);
  await logAudit(req.user!._id as any, 'admin.config.update', {
    ip: req.ip, details: req.body,
  });
  return res.json(config);
});

export default router;
