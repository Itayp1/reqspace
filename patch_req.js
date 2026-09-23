const fs = require('fs');
let code = fs.readFileSync('c:/projects/reqspace/server/src/models/Request.ts', 'utf8');

code = code.replace(
  'enabled: boolean;',
  "enabled: boolean;\n  type?: 'text' | 'file';\n  fileName?: string;\n  fileData?: string;"
);

code = code.replace(
  'enabled: { type: Boolean, default: true },',
  "enabled: { type: Boolean, default: true },\n    type: { type: String },\n    fileName: { type: String },\n    fileData: { type: String },"
);

fs.writeFileSync('c:/projects/reqspace/server/src/models/Request.ts', code, 'utf8');
