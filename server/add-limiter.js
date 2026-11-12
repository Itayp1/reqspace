const fs = require('fs');
let c = fs.readFileSync('server/src/index.ts', 'utf8');

c = c.replace(/import \{ dbDownBody \} from '\.\/utils\/dbGate';/, "import { dbDownBody } from './utils/dbGate';\nimport { rateLimit } from './middleware/rateLimit';");

const limiterCode = `
const mutationLimiter = rateLimit({ windowMs: 60_000, max: 300, message: 'Too many requests — please slow down.' });
app.use('/api', (req, res, next) =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? mutationLimiter(req, res, next) : next()
);
`;

c = c.replace(/app\.use\('\/api\/auth', authRoutes\);/, limiterCode + "app.use('/api/auth', authRoutes);");
fs.writeFileSync('server/src/index.ts', c);
