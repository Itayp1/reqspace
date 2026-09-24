import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { User } from '../models/User';
import { escapeRegex } from '../utils/escapeRegex';

const router = Router();

router.get('/search', authenticate, async (req: AuthRequest, res: Response) => {
  const q = req.query.q as string;
  if (!q || q.length < 2) {
    return res.json([]);
  }
  // Anchored prefix match on escaped input — the previous version passed the
  // raw query straight into `new RegExp()`, which is both a ReDoS vector
  // (a crafted pattern with catastrophic backtracking) and let a substring
  // match anywhere scrape the whole user directory a little at a time.
  const regex = new RegExp('^' + escapeRegex(q), 'i');
  const users = await User.find({
    $or: [{ name: regex }, { email: regex }]
  }).select('_id name email avatar').limit(10);

  res.json(users);
});

export default router;
