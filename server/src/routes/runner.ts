import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// Collection runs execute in the browser (Collection Runner). This route used
// to answer `{ message: 'Run started (stub)' }` and do nothing (CR#13).
router.post('/runner/run', (_req: AuthRequest, res: Response) => {
  return res.status(410).json({
    message: 'Server-side collection runs are not supported. Use the in-app Collection Runner.',
  });
});

export default router;
