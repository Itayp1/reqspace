const fs = require('fs');
let c = fs.readFileSync('server/src/index.ts', 'utf8');

c = c.replace(/\/\/ API Routes\r?\napp\.use\('\/api\/auth', authRouter\);/, 
`// API Routes
import { rateLimit } from './middleware/rateLimit';
const mutationLimiter = rateLimit({ windowMs: 60_000, max: 300, message: 'Too many requests - please slow down.' });
app.use('/api', (req, res, next) =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? mutationLimiter(req, res, next) : next()
);
app.use('/api/auth', authRouter);`);
fs.writeFileSync('server/src/index.ts', c);
