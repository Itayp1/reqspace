const fs = require('fs');
const p = 'server/src/routes/collections.ts';
let code = fs.readFileSync(p, 'utf8');

const helper = 
async function checkPermissionByItem(req: AuthRequest, res: Response, next: NextFunction, Model: any, minRole: UserRole) {
  if (req.user?.isSuperAdmin) return next();
  try {
    const item = await Model.findById(req.params.id || req.params.collectionId);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    let workspaceId = item.workspaceId;
    if (!workspaceId && item.collectionId) {
      const coll = await Collection.findById(item.collectionId);
      if (coll) workspaceId = coll.workspaceId;
    }
    if (!workspaceId) return res.status(400).json({ message: 'No workspace attached' });
    req.params.workspaceId = String(workspaceId);
    return requireWorkspaceRole(minRole)(req, res, next);
  } catch(e) { next(e); }
}
;

if(!code.includes('checkPermissionByItem')) {
  code = code.replace('const router = Router();', 'import { NextFunction } from "express";\nimport { UserRole } from "../models/User";\nconst router = Router();\n' + helper);
}

// Collections put
code = code.replace(
  /router\.put\('\/collections\/:id',[\s\S]*?return res\.json\(collection\);\s*\}/,
  \outer.put('/collections/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Collection, 'editor'), async (req: AuthRequest, res: Response) => {
  const collection = await Collection.findByIdAndUpdate(req.params.id, req.body, { new: true });
  return res.json(collection);
}\
);

// Collections delete
code = code.replace(
  /router\.delete\('\/collections\/:id',[\s\S]*?return res\.json\(\{ message: 'Collection deleted' \}\);\s*\}/,
  \outer.delete('/collections/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Collection, 'editor'), async (req: AuthRequest, res: Response) => {
  await Folder.deleteMany({ collectionId: req.params.id });
  await ApiRequest.deleteMany({ collectionId: req.params.id });
  await Collection.findByIdAndDelete(req.params.id);
  return res.json({ message: 'Collection deleted' });
}\
);

// Folders put
code = code.replace(
  /router\.put\('\/folders\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/,
  \outer.put('/folders/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Folder, 'editor'), async (req: AuthRequest, res: Response) => {\
);

// Folders delete
code = code.replace(
  /router\.delete\('\/folders\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/,
  \outer.delete('/folders/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Folder, 'editor'), async (req: AuthRequest, res: Response) => {\
);

// Requests put
code = code.replace(
  /router\.put\('\/requests\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/,
  \outer.put('/requests/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'editor'), async (req: AuthRequest, res: Response) => {\
);

// Requests delete
code = code.replace(
  /router\.delete\('\/requests\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/,
  \outer.delete('/requests/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'editor'), async (req: AuthRequest, res: Response) => {\
);

fs.writeFileSync(p, code);
