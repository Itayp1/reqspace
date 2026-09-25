import express, { Response } from 'express';
import LocalVariable from '../models/LocalVariable';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/local-variables/:workspaceId
router.get('/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const localVariable = await LocalVariable.findOne({
      workspaceId: req.params.workspaceId,
      userId: req.user?.id || req.user?._id,
    });
    if (!localVariable) {
      return res.json({ variables: [] });
    }
    res.json(localVariable);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/local-variables/:workspaceId
router.put('/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { variables } = req.body;
    let localVariable = await LocalVariable.findOne({
      workspaceId: req.params.workspaceId,
      userId: req.user?.id || req.user?._id,
    });

    if (localVariable) {
      localVariable.variables = variables;
      await localVariable.save();
    } else {
      localVariable = await LocalVariable.create({
        workspaceId: req.params.workspaceId,
        userId: req.user?.id || req.user?._id,
        variables,
      });
    }

    res.json(localVariable);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
