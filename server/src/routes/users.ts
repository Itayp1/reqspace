import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UserRepository } from '../repositories/UserRepository';

const router = Router();

router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) return res.json([]);
  const users = await UserRepository.searchPrefix(q, 10);
  res.json(users.map((u) => ({ _id: u._id, name: u.name, email: u.email, avatar: u.avatar })));
});

export default router;
