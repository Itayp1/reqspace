const fs = require('fs');

const path = 'c:/projects/reqspace/server/src/routes/collections.ts';
let code = fs.readFileSync(path, 'utf8');

// The original logic missed folder:updated and request:updated because I used a specific string replacement that didn't match perfectly.
// Let's use regex.

code = code.replace(
  /if \(!folder\) return res\.status\(404\)\.json\(\{ message: 'Folder not found' \}\);\s*return res\.json\(folder\);/,
  "if (!folder) return res.status(404).json({ message: 'Folder not found' });\n    io.to('workspace:' + (req as any).resolvedWorkspaceId).emit('folder:updated', folder);\n    return res.json(folder);"
);

code = code.replace(
  /if \(!request\) return res\.status\(404\)\.json\(\{ message: 'Request not found' \}\);\s*return res\.json\(request\);/,
  "if (!request) return res.status(404).json({ message: 'Request not found' });\n    io.to('workspace:' + (req as any).resolvedWorkspaceId).emit('request:updated', request);\n    return res.json(request);"
);

fs.writeFileSync(path, code, 'utf8');
