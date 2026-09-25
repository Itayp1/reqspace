const fs = require('fs');
let code = fs.readFileSync('src/routes/collections.ts', 'utf8');

code = code.replace(
  /router\.get\('\/workspaces\/:workspaceId\/collections',[\s\S]*?async \(req: AuthRequest, res: Response\) => \{[\s\S]*?return res\.json\(collections\);\n  \}\n\);/,
  `router.get('/workspaces/:workspaceId/collections',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    let limit = parseInt(req.query.limit as string, 10);
    if (isNaN(limit)) limit = 50;
    const cursor = req.query.cursor as string;
    
    const result = await CollectionRepository.findByWorkspace(req.params.workspaceId, { limit, cursor });
    return res.json(result);
  }
);`
);

fs.writeFileSync('src/routes/collections.ts', code);
