import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate';
import { rateLimit } from '../middleware/rateLimit';
import * as schemas from '../schemas/errors.schemas';
import { recordError } from '../utils/errorReporter';

const router = Router();

// Public on purpose: the login page can fail before any session exists.
const reportLimiter = rateLimit({ windowMs: 60_000, max: 30, message: 'Too many error reports.' });

router.post('/', reportLimiter, validate(schemas.reportErrorSchema), (req: Request, res: Response) => {
  void recordError({
    ...req.body,
    source: 'client',
    userAgent: req.get('user-agent') ?? null,
  });
  return res.status(204).end();
});

export default router;
