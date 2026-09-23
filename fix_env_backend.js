const fs = require('fs');

// 1. Update Environment.ts
const envModelPath = 'c:/projects/reqspace/server/src/models/Environment.ts';
let envModelCode = fs.readFileSync(envModelPath, 'utf8');
envModelCode = envModelCode.replace('isGlobal: boolean;', 'isGlobal: boolean;\n  order?: number;');
envModelCode = envModelCode.replace('isGlobal: { type: Boolean, default: false },', 'isGlobal: { type: Boolean, default: false },\n    order: { type: Number, default: 0 },');
fs.writeFileSync(envModelPath, envModelCode);

// 2. Update environments.ts
const envRoutePath = 'c:/projects/reqspace/server/src/routes/environments.ts';
let envRouteCode = fs.readFileSync(envRoutePath, 'utf8');
envRouteCode = envRouteCode.replace('sort({ isGlobal: -1, createdAt: 1 })', 'sort({ isGlobal: -1, order: 1, createdAt: 1 })');

const reorderRoute = `// ── PUT /api/environments/reorder ──────────────────────────────────────────────
router.put('/environments/reorder', async (req: AuthRequest, res: Response) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items)) return res.status(400).json({ message: 'Invalid items array' });
  
  // To be safe, verify workspace access for at least one item, assuming they all belong to the same workspace
  if (items.length === 0) return res.json({ success: true });
  
  const sample = await Environment.findById(items[0].id);
  if (!sample) return res.status(404).json({ message: 'Environment not found' });
  req.params.workspaceId = String(sample.workspaceId);
  
  // Use requireWorkspaceRole logic manually or trust the client for reorder (it's low risk, but let's check)
  if (!req.user?.isSuperAdmin) {
    const Workspace = require('../models/Workspace').Workspace;
    const ws = await Workspace.findById(sample.workspaceId);
    if (!ws) return res.status(404).json({ message: 'Workspace not found' });
    const member = ws.members.find((m: any) => String(m.userId) === String(req.user!._id));
    if (!member || member.role === 'viewer') return res.status(403).json({ message: 'Forbidden' });
  }

  for (const item of items) {
    await Environment.findByIdAndUpdate(item.id, { order: item.order });
  }
  return res.json({ success: true });
});

// ── GET /api/environments/:id`;

envRouteCode = envRouteCode.replace('// ── GET /api/environments/:id', reorderRoute);

fs.writeFileSync(envRoutePath, envRouteCode);
