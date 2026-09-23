const fs = require('fs');

const path = 'c:/projects/reqspace/server/src/routes/environments.ts';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes("import { io }")) {
  code = code.replace(
    "import { NextFunction } from \"express\";",
    "import { NextFunction } from \"express\";\nimport { io } from '../index';"
  );
}

// POST
code = code.replace(
  "return res.status(201).json(env);",
  "io.to('workspace:' + req.params.workspaceId).emit('environment:created', env);\n    return res.status(201).json(env);"
);

// PUT
code = code.replace(
  "if (!env) return res.status(404).json({ message: 'Environment not found' });\n  return res.json(env);",
  "if (!env) return res.status(404).json({ message: 'Environment not found' });\n  io.to('workspace:' + req.params.workspaceId).emit('environment:updated', env);\n  return res.json(env);"
);

// DELETE
code = code.replace(
  "await Environment.findByIdAndDelete(req.params.id);\n  return res.json({ message: 'Environment deleted' });",
  "await Environment.findByIdAndDelete(req.params.id);\n  io.to('workspace:' + req.params.workspaceId).emit('environment:deleted', req.params.id);\n  return res.json({ message: 'Environment deleted' });"
);

// Duplicate
code = code.replace(
  "return res.status(201).json(duplicate);",
  "io.to('workspace:' + targetWorkspaceId).emit('environment:created', duplicate);\n  return res.status(201).json(duplicate);"
);

// Reorder
code = code.replace(
  "return res.json({ success: true });",
  "io.to('workspace:' + req.params.workspaceId).emit('environment:updated');\n  return res.json({ success: true });"
);

fs.writeFileSync(path, code, 'utf8');
