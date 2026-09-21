const fs = require('fs');
const path = require('path');

function processCollections() {
  const p = path.join('server', 'src', 'routes', 'collections.ts');
  let content = fs.readFileSync(p, 'utf8');

  const helper = `
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
`;

  if(!content.includes('checkPermissionByItem')) {
    content = content.replace('const router = Router();', 'import { NextFunction } from "express";\nimport { UserRole } from "../models/User";\nconst router = Router();\n' + helper);
  }

  // Collections put
  content = content.replace(
    /router\.put\('\/collections\/:id',[\s\S]*?return res\.json\(collection\);\s*\}/,
    `router.put('/collections/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Collection, 'editor'), async (req: AuthRequest, res: Response) => {
    const collection = await Collection.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.json(collection);
  }`
  );

  // Collections delete
  content = content.replace(
    /router\.delete\('\/collections\/:id',[\s\S]*?return res\.json\(\{ message: 'Collection deleted' \}\);\s*\}/,
    `router.delete('/collections/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Collection, 'editor'), async (req: AuthRequest, res: Response) => {
    await Folder.deleteMany({ collectionId: req.params.id });
    await ApiRequest.deleteMany({ collectionId: req.params.id });
    await Collection.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Collection deleted' });
  }`
  );

  content = content.replace(/router\.put\('\/folders\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/, `router.put('/folders/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Folder, 'editor'), async (req: AuthRequest, res: Response) => {`);
  content = content.replace(/router\.delete\('\/folders\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/, `router.delete('/folders/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, Folder, 'editor'), async (req: AuthRequest, res: Response) => {`);
  content = content.replace(/router\.put\('\/requests\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/, `router.put('/requests/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'editor'), async (req: AuthRequest, res: Response) => {`);
  content = content.replace(/router\.delete\('\/requests\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/, `router.delete('/requests/:id', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'editor'), async (req: AuthRequest, res: Response) => {`);
  content = content.replace(/router\.post\('\/requests\/:id\/comments',\s*async \(req: AuthRequest, res: Response\) => \{/, `router.post('/requests/:id/comments', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'viewer'), async (req: AuthRequest, res: Response) => {`);
  content = content.replace(/router\.delete\('\/requests\/:id\/comments\/:commentId',\s*async \(req: AuthRequest, res: Response\) => \{/, `router.delete('/requests/:id/comments/:commentId', (req: AuthRequest, res: Response, next: NextFunction) => checkPermissionByItem(req, res, next, ApiRequest, 'viewer'), async (req: AuthRequest, res: Response) => {`);

  fs.writeFileSync(p, content);
}

function processEnvironments() {
  const p = path.join('server', 'src', 'routes', 'environments.ts');
  let content = fs.readFileSync(p, 'utf8');

  const helper = `
async function checkEnvPermission(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.isSuperAdmin) return next();
  try {
    const item = await Environment.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Environment not found' });
    req.params.workspaceId = String(item.workspaceId);
    return requireWorkspaceRole('editor')(req, res, next);
  } catch(e) { next(e); }
}
`;
  if (!content.includes('checkEnvPermission')) {
    content = content.replace('const router = Router();', 'import { NextFunction } from "express";\nconst router = Router();\n' + helper);
  }

  content = content.replace(/router\.put\('\/environments\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/, `router.put('/environments/:id', checkEnvPermission, async (req: AuthRequest, res: Response) => {`);
  content = content.replace(/router\.delete\('\/environments\/:id',\s*async \(req: AuthRequest, res: Response\) => \{/, `router.delete('/environments/:id', checkEnvPermission, async (req: AuthRequest, res: Response) => {`);
  content = content.replace(/router\.post\('\/environments\/:id\/duplicate',\s*async \(req: AuthRequest, res: Response\) => \{/, `router.post('/environments/:id/duplicate', checkEnvPermission, async (req: AuthRequest, res: Response) => {`);

  fs.writeFileSync(p, content);
}

processCollections();
processEnvironments();
