import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.post('/runner/run', async (req: AuthRequest, res: Response) => {
  // Trigger runner via websockets
  res.json({ message: 'Run started (stub)' });
});

export default router;
