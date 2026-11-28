import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { WorkspaceRepository } from '../repositories/WorkspaceRepository';
import { UserRepository } from '../repositories/UserRepository';
import { logAudit } from '../repositories/AuditLogRepository';
import { workspaceRoleCache } from '../utils/cache';
import { emitToUser, emitToWorkspace } from '../socketUtils';
import { noteRouteError } from '../utils/errorReporter';

const router = Router();
router.use(authenticate);

// Tokens are 32 random bytes; throttling keeps guessing hopeless.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: 'Too many requests' });
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;
const GONE = { revoked: 'This invite was revoked', expired: 'This invite has expired', used: 'This invite was already used' };

/** Resolves the link in :token, or answers 404 / 410 itself and returns null. */
async function resolve(req: AuthRequest, res: Response) {
  const link = TOKEN_RE.test(req.params.token) ? await WorkspaceRepository.findInviteLinkByToken(req.params.token) : null;
  const ws = link ? await WorkspaceRepository.findById(link.workspaceId) : null;
  if (!link || !ws) { res.status(404).json({ message: 'Invite not found' }); return null; }
  const problem = WorkspaceRepository.inviteLinkProblem(link);
  if (problem) { res.status(410).json({ message: GONE[problem] }); return null; }
  return { link, ws, member: ws.members.find(m => String(m.userId) === String(req.user!._id)) };
}

router.get('/:token', limiter, async (req: AuthRequest, res: Response) => {
  try {
    const r = await resolve(req, res);
    if (!r) return;
    const inviter = await UserRepository.findById(r.link.createdBy).catch(() => null);
    return res.json({
      workspaceId: r.ws.id, workspaceName: r.ws.name, role: r.member?.role ?? r.link.role,
      invitedByName: inviter?.name ?? 'A workspace owner', expiresAt: r.link.expiresAt, alreadyMember: !!r.member,
    });
  } catch (err) {
    noteRouteError(res, err);
    return res.status(500).json({ message: 'Error loading invite' });
  }
});

router.post('/:token/accept', validate(z.any()), limiter, async (req: AuthRequest, res: Response) => {
  try {
    const r = await resolve(req, res);
    if (!r) return;
    const userId = String(req.user!._id);
    if (r.member) return res.json({ workspaceId: r.ws.id, role: r.member.role, alreadyMember: true });
    if (!(await WorkspaceRepository.consumeInviteLink(r.link.id))) {
      // Lost the race (or it expired / was revoked meanwhile): re-read to say why.
      const fresh = await WorkspaceRepository.findInviteLinkByToken(req.params.token);
      const problem = fresh && WorkspaceRepository.inviteLinkProblem(fresh);
      return res.status(410).json({ message: GONE[problem || 'used'] });
    }
    await WorkspaceRepository.addMember(r.ws.id, userId, r.link.role, r.link.createdBy);
    workspaceRoleCache.delete(`${userId}:${r.ws.id}`);
    logAudit(userId, 'workspace.invite_link.accept', {
      targetType: 'Workspace', targetId: r.ws.id, ip: req.ip, details: { linkId: r.link.id, role: r.link.role },
    });
    emitToUser(userId, 'workspace:added', { workspaceId: r.ws.id });
    emitToWorkspace(r.ws.id, 'workspace:members_changed', { workspaceId: r.ws.id });
    return res.json({ workspaceId: r.ws.id, role: r.link.role, alreadyMember: false });
  } catch (err) {
    noteRouteError(res, err);
    return res.status(500).json({ message: 'Error accepting invite' });
  }
});

export default router;
