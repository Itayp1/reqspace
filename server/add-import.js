const fs = require('fs');
let c = fs.readFileSync('server/src/routes/importExport.ts', 'utf8');
c = "import { logAudit } from '../repositories/AuditLogRepository';\n" + c;
fs.writeFileSync('server/src/routes/importExport.ts', c);
