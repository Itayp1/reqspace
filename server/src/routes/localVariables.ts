import { validate } from '../middleware/validate';
import * as schemas from '../schemas/localVariables.schemas';
import express, { Response } from 'express';
import { SqlLocalVariable } from '../db/sql-models';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// GET /api/local-variables/:workspaceId
router.get('/:workspaceId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const localVariable = await SqlLocalVariable.findOne({
      where: {
        workspaceId: req.params.workspaceId,
        userId: req.user?.id || req.user?._id,
      }
    });
    if (!localVariable) {
      return res.json({ variables: [] });
    }
    const data = localVariable.toJSON();
    data.variables = JSON.parse(data.variables);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/local-variables/:workspaceId
router.put('/:workspaceId', validate(schemas.updateLocalVariablesSchema), authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { variables } = req.body;
    let localVariable = await SqlLocalVariable.findOne({
      where: {
        workspaceId: req.params.workspaceId,
        userId: req.user?.id || req.user?._id,
      }
    });

    if (localVariable) {
      localVariable.variables = JSON.stringify(variables);
      await localVariable.save();
    } else {
      localVariable = await SqlLocalVariable.create({
        workspaceId: req.params.workspaceId,
        userId: req.user?.id || req.user?._id,
        variables: JSON.stringify(variables),
      });
    }

    const data = localVariable.toJSON();
    data.variables = JSON.parse(data.variables);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
