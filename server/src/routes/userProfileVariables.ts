import express, { Response } from 'express';
import { z } from 'zod';
import { SqlUserProfileVariable } from '../db/sql-models';
import { authenticate, AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
router.use(authenticate);

const updateSchema = z.object({
  variables: z.array(z.object({
    key: z.string(),
    value: z.string().optional().default(''),
    enabled: z.boolean().optional().default(true),
    type: z.enum(['default', 'secret']).optional().default('default'),
  })),
});

// GET /api/user-profile-variables
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const row = await SqlUserProfileVariable.findOne({ where: { userId } });
    if (!row) return res.json({ variables: [] });
    const data = row.toJSON() as any;
    data.variables = JSON.parse(data.variables || '[]');
    return res.json(data);
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/user-profile-variables
router.put('/', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid body', errors: parsed.error.errors });
    const { variables } = parsed.data;
    const userId = req.user?.id || req.user?._id;

    let row = await SqlUserProfileVariable.findOne({ where: { userId } });
    if (row) {
      (row as any).variables = JSON.stringify(variables);
      await row.save();
    } else {
      row = await SqlUserProfileVariable.create({
        id: uuidv4(),
        userId,
        variables: JSON.stringify(variables),
      });
    }

    const data = row.toJSON() as any;
    data.variables = JSON.parse(data.variables || '[]');
    return res.json(data);
  } catch {
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
