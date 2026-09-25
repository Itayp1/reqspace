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
  const users = await UserRepository.search(q);
  res.json(users);
});

export default router;
