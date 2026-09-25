const fs = require('fs');
let c = fs.readFileSync('server/src/routes/auth.ts', 'utf8');
c = c.replace(/router\.get\('\/state', async \(req: Request, res: Response\) => \{/, "router.get('/state', async (req: Request, res: Response) => { console.log('HIT STATE ROUTE!!!');");
fs.writeFileSync('server/src/routes/auth.ts', c);
