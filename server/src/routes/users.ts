import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRepository } from '../repositories/UserRepository';
import { escapeRegex } from '../utils/escapeRegex';

const router = Router();

router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) {
    return res.json([]);
  }
  const users = await UserRepository.search(q);
  res.json(users);
});

export default router;
