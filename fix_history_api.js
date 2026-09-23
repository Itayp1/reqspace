const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/server/src/routes/history.ts', 'utf8');

const wipeAllRoute = `// ── DELETE /api/history ─ Clear all history for user ──────────────────
router.delete('/history', async (req: AuthRequest, res: Response) => {
  await History.deleteMany({ userId: req.user!._id });
  await User.findByIdAndUpdate(req.user!._id, { historyUsedBytes: 0 });
  return res.json({ message: 'All history cleared' });
});\n\n`;

code = code.replace('// ── DELETE /api/workspaces/:workspaceId/history', wipeAllRoute + '// ── DELETE /api/workspaces/:workspaceId/history');
fs.writeFileSync('c:/projects/reqspace/server/src/routes/history.ts', code, 'utf8');
