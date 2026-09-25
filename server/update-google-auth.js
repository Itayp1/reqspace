const fs = require('fs');
let c = fs.readFileSync('server/src/routes/auth.ts', 'utf8');

const regex = /router\.post\('\/google', validate\(schemas\.googleAuthSchema\), loginLimiter, async \(req: Request, res: Response\) => \{\r?\n\s+const \{ code, redirectUri \} = req\.body;\r?\n\s+if \(!code\) return res\.status\(400\)\.json\(\{ message: 'Code is required' \}\);\r?\n\r?\n\s+const config = await SystemConfigRepository\.getConfig\(\);/;

const replacement = `router.post('/google', validate(schemas.googleAuthSchema), loginLimiter, async (req: Request, res: Response) => {
  const { code, redirectUri, state } = req.body;
  if (!code) return res.status(400).json({ message: 'Code is required' });

  const crypto = await import('crypto');
  const cookieState = req.cookies?.oauth_state;
  res.clearCookie('oauth_state', { path: '/' }); // clear immediately

  const ok = typeof state === 'string' && typeof cookieState === 'string' &&
    state.length === 64 && cookieState.length === 64 &&
    crypto.timingSafeEqual(Buffer.from(state, 'hex'), Buffer.from(cookieState, 'hex'));
    
  if (!ok) {
    return res.status(403).json({ message: 'Invalid or expired OAuth state' });
  }

  const config = await SystemConfigRepository.getConfig();`;

if (regex.test(c)) {
  c = c.replace(regex, replacement);
  fs.writeFileSync('server/src/routes/auth.ts', c);
  console.log('replaced');
} else {
  console.log('not found');
}
