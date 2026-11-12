import { Router, Request, Response } from 'express';
import { secretStatus } from '../utils/secrets';

// Tells the login page which required secrets are missing. Booleans only; the values are
// generated in the browser and never pass through the server.
const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  res.json(secretStatus());
});

export default router;
