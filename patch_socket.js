const fs = require('fs');

const path = 'c:/projects/reqspace/server/src/routes/collections.ts';
let code = fs.readFileSync(path, 'utf8');

// Add import io
if (!code.includes("import { io }")) {
  code = code.replace(
    "import { UserRole } from \"../models/User\";",
    "import { UserRole } from \"../models/User\";\nimport { io } from '../index';"
  );
}

// Add resolvedWorkspaceId
code = code.replace(
  "if (coll) workspaceId = coll.workspaceId;\n      }",
  "if (coll) workspaceId = coll.workspaceId;\n      }\n      (req as any).resolvedWorkspaceId = workspaceId;"
);

// Collections
code = code.replace(
  "return res.status(201).json(collection);",
  "io.to('workspace:' + req.params.workspaceId).emit('collection:created', collection);\n    return res.status(201).json(collection);"
);
code = code.replace(
  "return res.json(collection);",
  "io.to('workspace:' + (req as any).resolvedWorkspaceId).emit('collection:updated', collection);\n    return res.json(collection);"
);
code = code.replace(
  "return res.json({ message: 'Collection deleted' });",
  "io.to('workspace:' + (req as any).resolvedWorkspaceId).emit('collection:deleted', req.params.id);\n    return res.json({ message: 'Collection deleted' });"
);

// Folders
code = code.replace(
  "return res.status(201).json(folder);",
  "Collection.findById(req.params.collectionId).then(col => { if(col) io.to('workspace:' + col.workspaceId).emit('folder:created', folder); });\n      return res.status(201).json(folder);"
);
code = code.replace(
  "if (!folder) return res.status(404).json({ message: 'Folder not found' });\n    return res.json(folder);",
  "if (!folder) return res.status(404).json({ message: 'Folder not found' });\n    io.to('workspace:' + (req as any).resolvedWorkspaceId).emit('folder:updated', folder);\n    return res.json(folder);"
);
code = code.replace(
  "return res.json({ message: 'Folder deleted' });",
  "io.to('workspace:' + (req as any).resolvedWorkspaceId).emit('folder:deleted', req.params.id);\n    return res.json({ message: 'Folder deleted' });"
);

// Requests
code = code.replace(
  "return res.status(201).json(request);",
  "if (col) io.to('workspace:' + col.workspaceId).emit('request:created', request);\n      return res.status(201).json(request);"
);
code = code.replace(
  "if (!request) return res.status(404).json({ message: 'Request not found' });\n    return res.json(request);",
  "if (!request) return res.status(404).json({ message: 'Request not found' });\n    io.to('workspace:' + (req as any).resolvedWorkspaceId).emit('request:updated', request);\n    return res.json(request);"
);
code = code.replace(
  "return res.json({ message: 'Request deleted' });",
  "io.to('workspace:' + (req as any).resolvedWorkspaceId).emit('request:deleted', req.params.id);\n    return res.json({ message: 'Request deleted' });"
);

// Reorder
code = code.replace(
  "return res.json({ message: 'Reordered' });",
  "// Not broadcasting reorder for now to avoid complexity, but could trigger a refetch\n    io.to('workspace:' + req.params.workspaceId).emit('workspace:reordered');\n    return res.json({ message: 'Reordered' });"
);

fs.writeFileSync(path, code, 'utf8');
