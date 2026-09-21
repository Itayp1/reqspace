import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { User } from '../models/User';

const router = Router();

router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) {
    return res.json([]);
  }
  const regex = new RegExp(q, 'i');
  const users = await User.find({
    $or: [{ name: regex }, { email: regex }]
  }).select('_id name email avatar').limit(10);
  
  res.json(users);
});

export default router;
