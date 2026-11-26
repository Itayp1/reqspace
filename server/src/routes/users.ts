import { validate } from '../middleware/validate';
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRepository } from '../repositories/UserRepository';
import { MAX_SEARCH_LENGTH } from '../utils/escapeLike';

const router = Router();

router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  // `?q[]=a&q[]=b` makes req.query.q an array — the old `as string` cast then
  // read .length off it and stringified it straight into the LIKE pattern.
  const raw = req.query.q;
  const q = (typeof raw === 'string' ? raw : '').trim().slice(0, MAX_SEARCH_LENGTH);
  if (q.length < 2) {
    return res.json([]);
  }
  // USER_DIRECTORY_GLOBAL=true (e.g. a company-internal server) lets everyone find everyone.
  // Otherwise only people who share a workspace with the caller are searchable; super admins
  // already see every account in the admin panel.
  const global = /^(1|true|yes)$/i.test(process.env.USER_DIRECTORY_GLOBAL ?? '') || req.user!.isSuperAdmin;
  const users = await UserRepository.search(q, global ? undefined : await UserRepository.coMemberIds(String(req.user!._id)));
  res.json(users);
});

export default router;
