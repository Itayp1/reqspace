import 'express-async-errors';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { zipDirectory } from './utils/zipDir';
// import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

import authRouter from './routes/auth';
import workspacesRouter from './routes/workspaces';
import collectionsRouter from './routes/collections';
import environmentsRouter from './routes/environments';
import historyRouter from './routes/history';

import adminRouter from './routes/admin';
import usersRouter from './routes/users';
import shareRouter from './routes/share';
import importExportRouter from './routes/importExport';
import localVariablesRouter from './routes/localVariables';
import userProfileVariablesRouter from './routes/userProfileVariables';
import forksRouter from './routes/forks';
import errorsRouter from './routes/errors';
import { recordError, recordHandledError } from './utils/errorReporter';
import { FpErrorRepository } from './repositories/FpErrorRepository';
import { SystemConfigRepository } from './repositories/SystemConfigRepository';
import { UserRepository } from './repositories/UserRepository';
import { WorkspaceRepository } from './repositories/WorkspaceRepository';
import { SqlWorkspace } from './db/sql-models';
import { getUserWorkspaceRole } from './middleware/rbac';
import { resolveJwtSecret } from './utils/jwtSecret';
import { dbDownBody } from './utils/dbGate';
import { rateLimit } from './middleware/rateLimit';
import bcrypt from 'bcryptjs';

const JWT_SECRET = resolveJwtSecret();

const app = express();
const server = http.createServer(app);

// ג”€ג”€ DB state (updated during bootstrap) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
let dbStatus: 'starting' | 'ok' | 'error' = 'starting';
let dbError: string | null = null;
let dbType: string = 'unknown';

// Socket.io
export const io = new SocketIOServer(server, {
  // Mirrors the REST API's CORS policy: same-origin only in production,
  // the Vite dev server in development. '*' would let any site open an
  // authenticated socket against this server.
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', ...(process.env.DEV_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  path: '/ws',
  });

  if (process.env.REDIS_URL) {
    const pubClient = new Redis(process.env.REDIS_URL);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
  }

/** Verifies the socket's auth cookie and returns the userId, or null. */
function getSocketUserId(socket: import('socket.io').Socket): string | null {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) return null;
    const token = cookieHeader
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith('token='))
      ?.slice('token='.length);
    if (!token) return null;
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    return payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

import { workspaceRoleCache, superAdminCache } from './utils/cache';

io.on('connection', (socket) => {
  socket.data.userId = getSocketUserId(socket);
  const userId = socket.data.userId;
  // Per-user room: lets the server push user-targeted events (e.g. workspace
  // access revoked) to every tab/device of that user.
  if (userId) socket.join('user:' + userId);
  // A suspended (or deleted) user must not be able to (re)open a live socket (A9.3).
  if (userId) {
    UserRepository.findById(userId)
      .then((u) => { if (!u || u.status !== 'active') socket.disconnect(true); })
      .catch(() => {});
  }
  const MAX_ROOMS = 50;

  const authorizedWorkspaces = new Set<string>();
  // Periodic token check
  const tokenInterval = setInterval(() => {
    const currentUserId = getSocketUserId(socket);
    if (!currentUserId || currentUserId !== userId) {
      socket.disconnect(true);
    }
  }, 60000);

  socket.on('disconnect', () => clearInterval(tokenInterval));

  socket.on('join:workspace', async (workspaceId: string) => {
    if (!userId || typeof workspaceId !== 'string') return;
    if (socket.rooms.size >= MAX_ROOMS) return; // cap rooms per socket (SOCK-4)

    // Use roleCache to avoid DB reads during reconnect storms (PERF-5/SOCK-4)
    let cachedRole = workspaceRoleCache.get(`${userId}:${workspaceId}`);
    let cachedSuperAdmin = superAdminCache.get(userId);
    let cached = (cachedRole !== undefined && cachedSuperAdmin !== undefined) ? { role: cachedRole, isSuperAdmin: cachedSuperAdmin } : undefined;
    if (!cached) {
      const role = await getUserWorkspaceRole(userId, workspaceId).catch(() => null);
      const user = await UserRepository.findById(userId).catch(() => null);
      cached = { role, isSuperAdmin: user?.isSuperAdmin ?? false };
      workspaceRoleCache.set(`${userId}:${workspaceId}`, cached.role);
      superAdminCache.set(userId, cached.isSuperAdmin);
    }
    if (!cached.role && !cached.isSuperAdmin) return;
    authorizedWorkspaces.add(workspaceId);
    socket.join('workspace:' + workspaceId);
  });

  socket.on('leave:workspace', (workspaceId: string) => {
    authorizedWorkspaces.delete(workspaceId);
    socket.leave('workspace:' + workspaceId);
  });

  socket.on('presence:open', ({ workspaceId, requestId, user }) => {
    if (!socket.rooms.has('workspace:' + workspaceId)) return;
    socket.to('workspace:' + workspaceId).emit('presence:open', { requestId, user });
  });
  socket.on('presence:close', ({ workspaceId, requestId, user }) => {
    if (!socket.rooms.has('workspace:' + workspaceId)) return;
    socket.to('workspace:' + workspaceId).emit('presence:close', { requestId, user });
  });
});

// Behind an Ingress/reverse proxy, trust X-Forwarded-* so req.ip, rate limiting
// and `secure` cookies work correctly (CR#8, CR#16). Opt-in via TRUST_PROXY.
// R5.5: the default is NOT to trust X-Forwarded-For (a directly reachable server
// would let any client pick its own req.ip and dodge the rate limiters). Behind
// a proxy set TRUST_PROXY to the hop count (e.g. 1) or a CIDR/IP list.
const trustProxyEnv = (process.env.TRUST_PROXY ?? '').trim();
app.set('trust proxy', trustProxyEnv === '' || trustProxyEnv === 'false' ? false : (/^\d+$/.test(trustProxyEnv) ? parseInt(trustProxyEnv, 10) : trustProxyEnv));

// Middleware
app.use(morgan('dev'));
// Baseline HTTP hardening. CSP is left disabled here because the SPA + Monaco
// currently need a permissive policy; tighten via a dedicated CSP later.
const isProd = process.env.NODE_ENV === 'production';
// HTTPS-only behaviour (upgrade-insecure-requests, HSTS) follows the same switch
// as the session cookie's Secure flag: COOKIE_SECURE=false is the documented
// opt-out for HTTP-only self-hosting, where forcing an upgrade breaks the app.
const httpsOnly = isProd && process.env.COOKIE_SECURE !== 'false';

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-eval' is required by the script runner (client/src/utils/scripts.ts uses
      // new Function). SEC-3 is what removes it; 'wasm-unsafe-eval' does NOT cover new Function.
      // NOTE: We implemented SEC-3 which uses new Function inside worker.ts. So the worker needs 'unsafe-eval'.
      // Actually, since we still use new Function in worker.ts, we need it.
      // static.cloudflareinsights.com: Cloudflare Web Analytics beacon, auto-injected when the site is proxied by Cloudflare.
      scriptSrc: ["'self'", "'unsafe-eval'", "https://static.cloudflareinsights.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],          // Tailwind + inline <style> in App.tsx
      imgSrc: ["'self'", "data:", "blob:"],
      // Open on purpose: the browser transport calls arbitrary third-party APIs.
      // Hosts that don't send CORS headers are handled by the browser extension.
      connectSrc: ["'self'", "https:", "http:", "ws:", "wss:"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: httpsOnly ? [] : null,
    },
  },
  hsts: httpsOnly ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));
// PERF-6: gzip API responses. The tree/list endpoints are the ones this
// actually matters for — JSON compresses well, and text-heavy request
// bodies/scripts are exactly what make those payloads large.
app.use(compression());
// Cap request bodies. 50mb made the process trivial to OOM (CR#8). Override via
// MAX_BODY_SIZE if a deployment legitimately needs larger payloads.
const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE || '5mb';
app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY_SIZE }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', ...(process.env.DEV_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)],
  credentials: true,
}));

// R5.3b: defence in depth next to SameSite=Lax — reject state-changing API calls
// whose Origin is a foreign site. Requests without an Origin (curl, server-to-server,
// same-origin GET-like navigations) are unaffected.
// DEV_ORIGINS (comma-separated) lets parallel dev/test clients on other ports pass the check in non-production.
const devOrigins = ['http://localhost:5173', ...(process.env.DEV_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)];
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  let originHost: string | null = null;
  try { originHost = new URL(origin).host; } catch { /* malformed -> rejected below */ }
  const fwdHost = req.app.get('trust proxy') ? req.get('x-forwarded-host') : undefined;
  if (originHost && (originHost === req.get('host') || originHost === fwdHost || (!isProd && devOrigins.includes(origin)))) return next();
  res.status(403).json({ message: 'Cross-origin request blocked' });
});

// A NUL byte in the URL path can never be a valid id/segment; letting it reach
// the DB layer surfaces as an SQL syntax error (500). Reject it as a 400 instead.
app.use('/api', (req, res, next) => {
  let decoded = req.path;
  try { decoded = decodeURIComponent(req.path); } catch { return res.status(400).json({ message: 'Malformed URL' }); }
  if (decoded.includes(' ')) return res.status(400).json({ message: 'Invalid characters in URL' });
  next();
});

// Same for NUL characters inside JSON string values (ids, names, ...): embedded in a
// query they break the SQL (500). No legitimate payload contains one.
function hasNul(v: any, depth = 0): boolean {
  if (typeof v === 'string') return v.includes(String.fromCharCode(0));
  if (!v || typeof v !== 'object' || depth > 20) return false;
  for (const k of Object.keys(v)) { if (k.includes(String.fromCharCode(0)) || hasNul(v[k], depth + 1)) return true; }
  return false;
}
app.use('/api', (req, res, next) => {
  if (req.body && typeof req.body === 'object' && hasNul(req.body)) return res.status(400).json({ message: 'Invalid characters in request body' });
  next();
});

// Records 5xx responses that routes send without throwing. Exceptions that reach
// the error handler set res.locals.errorRecorded so they are not recorded twice.
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 500 || res.locals.errorRecorded || req.path === '/api/health') return;
    const cause = res.locals.routeError;
    const causeError = cause instanceof Error ? cause : cause != null ? new Error(String(cause)) : null;
    void recordError({
      source: 'server',
      kind: 'server-5xx',
      message: causeError ? `${req.method} ${req.path} responded ${res.statusCode}: ${causeError.message}` : `${req.method} ${req.path} responded ${res.statusCode}`,
      stack: causeError?.stack ?? null,
      route: req.path,
      method: req.method,
      status: res.statusCode,
      userId: (req as { user?: { id?: string } }).user?.id ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  });
  next();
});

// ג”€ג”€ Health check ג€” always responds, reports DB state ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
app.get('/api/health', (_req, res) => {
  const status = dbStatus === 'ok' ? 200 : (dbStatus === 'starting' ? 503 : 503);
  // Never leak the raw DB error (can contain a connection string) in
  // production ג€” return a generic message instead (CR#24).
  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    status: dbStatus,
    dbType,
    dbError: dbError ? (isProd ? 'Database unavailable' : dbError) : undefined,
    uptime: process.uptime(),
    // mongoState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

// ג”€ג”€ Block API routes if DB is not ready ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
// Client error reports go to a separate store, so they are accepted even when the main DB is down.
app.use('/api/errors', errorsRouter);

app.use('/api', (req, res, next) => {
  // Always allow the health check even if the DB is down. (The previous
  // '/admin/db-config' carve-out referenced a route that doesn't exist ג€” CR#18.)
  if (req.path === '/health') return next();
  if (dbStatus !== 'ok') {
    return res.status(503).json(dbDownBody({
      dbStatus,
      dbError,
      dbType,
      isProd: process.env.NODE_ENV === 'production',
    }));
  }
  next();
});

// API Routes
// Ceilings are env-driven so a test server can boot at the real limits
// (300 writes / 2000 reads per minute). NODE_ENV=test used to force 10000,
// which made the SEC-10 checks unable to observe a 429.
function envRateLimitMax(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

const mutationLimiter = rateLimit({ windowMs: 60_000, max: envRateLimitMax('MUTATION_RATE_LIMIT_MAX', 300), message: 'Too many requests - please slow down.' });
app.use('/api', (req, res, next) =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? mutationLimiter(req, res, next) : next()
);
// SEC-10: a high ceiling covering reads too (tree/list/history GETs), so a scripted
// attacker hammering read endpoints is still caught. Deliberately generous — even a
// workspace with hundreds of collections expanding many tree nodes in a burst stays
// far under this; it exists to catch automated abuse, not to throttle real usage.
const readLimiter = rateLimit({ windowMs: 60_000, max: envRateLimitMax('READ_RATE_LIMIT_MAX', 2000), message: 'Too many requests - please slow down.' });
app.use('/api', (req, res, next) => (req.method === 'GET' ? readLimiter(req, res, next) : next()));
app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspacesRouter);
// Mounted before the generic-'/api' routers below: their own `router.use(authenticate)`
// has no path prefix, so it swallows every '/api/*' request that reaches it ג€” including
// these two routers' deliberately-public routes (anonymous share-link viewing) ג€” unless
// share is matched first.
app.use('/api/share', shareRouter);
app.use('/api', collectionsRouter);
app.use('/api', environmentsRouter);
app.use('/api', historyRouter);

app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api', importExportRouter);
app.use('/api/local-variables', localVariablesRouter);
app.use('/api/user-profile-variables', userProfileVariablesRouter);
app.use('/api', forksRouter);

// Serve the extension as a zip (built in the Dockerfile) for "Load unpacked";
// Chrome no longer allows installing a self-hosted .crx outside the Web Store.
const extensionZipPath = path.resolve(__dirname, '../../reqspace-transport.zip');
const extensionDirPath = path.resolve(__dirname, '../../extension');
app.get('/extension/reqspace-transport.zip', (_req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // Production/Docker ship a prebuilt zip; in dev/Electron, zip the extension folder on the fly.
  if (fs.existsSync(extensionZipPath)) return res.download(extensionZipPath, 'reqspace-transport.zip');
  if (fs.existsSync(path.join(extensionDirPath, 'manifest.json'))) {
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="reqspace-transport.zip"' });
    return res.send(zipDirectory(extensionDirPath));
  }
  return res.status(404).json({ error: 'The browser extension package is not available on this server' });
});

// Catch unmatched /api/* routes before the SPA fallback to return a JSON 404
// instead of the client's index.html (R2.2).
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Serve client static files (production)
const clientDistPath = process.env.CLIENT_DIST_PATH
  ? path.resolve(__dirname, '..', process.env.CLIENT_DIST_PATH)
  : path.resolve(__dirname, '../../client/dist');

app.use(express.static(clientDistPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handler ג€” logs the real error server-side but never echoes internal
// messages (DB connection strings, file paths, stack detail) back to the
// client, which is publicly reachable once this is deployed as a SaaS.
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  // Honour explicit client-error statuses (e.g. 413 payload-too-large, 400) so
  // they aren't masked as 500. Server errors stay generic in production.
  const status = (err as any).status || (err as any).statusCode || 500;
  const message = status < 500
    ? (err.message ?? 'Request error')
    : (process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message ?? 'Internal server error'));
  if (status >= 500) {
    res.locals.errorRecorded = true;
    void recordError({
      source: 'server',
      kind: 'server-exception',
      message: err.message || 'Internal server error',
      stack: err.stack ?? null,
      route: req.path,
      method: req.method,
      status,
      userId: (req as { user?: { id?: string } }).user?.id ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }
  res.status(status).json({ message });
});

const FP_ERROR_RETENTION_DAYS = 30;
function startFpErrorPurge() {
  const purge = () => FpErrorRepository.purgeOlderThan(FP_ERROR_RETENTION_DAYS)
    .catch((err: Error) => { console.error('[fperrors] purge failed:', err.message); recordHandledError('fperrors-purge', err); });
  void purge();
  setInterval(purge, 24 * 60 * 60 * 1000).unref();
}

// ג”€ג”€ Start ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
async function bootstrap() {
  const { getDbConfig } = await import('./db/dbConfig');
  const { connectDb } = await import('./db/connect');

  const port = parseInt(process.env.PORT ?? '3005', 10);

  // Start listening first ג€” so the client can load and show errors
  // Offline mode signs in the local user automatically, so never listen beyond this machine.
  const listenHost = process.env.REQSPACE_OFFLINE === 'true' ? '127.0.0.1' : undefined;
  server.listen(port, listenHost as any, () => {
    console.log('נ€ Server running on http://localhost:' + port);
  });

  const dbConfig = getDbConfig();
  dbType = dbConfig.type;
  console.log(`נ—„ן¸  Connecting to DB: ${dbConfig.type}`);

  try {
    await connectDb(dbConfig);
    console.log(`ג… DB connected (${dbConfig.type})`);

    await SystemConfigRepository.ensure();
    console.log('ג… SystemConfig initialized');

    const adminCount = (await UserRepository.list({ isSuperAdmin: true })).items.length;
    if (adminCount === 0) {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
      // Never seed a known-default admin/admin superadmin in production ג€” the
      // account is fully usable between boot and first login (CR#6). Require an
      // explicit strong ADMIN_PASSWORD instead.
      if (process.env.NODE_ENV === 'production' && adminPassword === 'admin' && process.env.ALLOW_DEFAULT_ADMIN !== 'true') {
        console.error('ג Refusing to bootstrap the default admin/admin superadmin in production. Set a strong ADMIN_PASSWORD and restart.');
        dbStatus = 'ok';
        return;
      }
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      const adminUser = await UserRepository.create({
        name: 'Admin',
        email: adminEmail,
        passwordHash,
        authType: 'password',
        isSuperAdmin: true,
        mustChangePassword: adminPassword === 'admin' && process.env.NODE_ENV !== 'test' // Force change if using default fallback
      });
      await WorkspaceRepository.create({
        name: `Admin's Workspace`,
        description: 'Personal workspace',
        ownerId: adminUser.id,
        isPersonal: true,
      });
      console.log(`ג… Default superadmin created (${adminEmail} / ${'*'.repeat(adminPassword.length)})`);
    } else {
      // Databases created before the bootstrap admin's workspace was flagged
      // personal: without the flag Fork targets and menus misbehave for the admin.
      await SqlWorkspace.update({ isPersonal: true }, { where: { name: "Admin's Workspace", description: 'Personal workspace', isPersonal: false } });
      console.log('ג… Superadmin exists');
    }

    dbStatus = 'ok';
    startFpErrorPurge();
  } catch (err: any) {
    dbStatus = 'error';
    dbError = err?.message ?? String(err);
    recordHandledError('db-connect', err);
    console.error(`ג DB connection failed (${dbConfig.type}):`, dbError);
    console.error('Server is running but DB is unavailable. Check /api/health for details.');
    // Don't exit ג€” the UI will show the error so user can fix config via Admin panel
  }
}

if (require.main === module) {
  // A closed stdout/stderr pipe (e.g. a log consumer exiting) must not take the server down.
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EPIPE') throw err;
    });
  }

  // Node turns unhandled rejections into uncaught exceptions by default, so this covers both.
  process.on('uncaughtException', async (err) => {
    console.error(err);
    await Promise.race([
      recordError({ source: 'server', kind: 'process', message: err.message, stack: err.stack ?? null }),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    process.exit(1);
  });

  bootstrap().catch((err) => {
    console.error('Fatal startup error:', err);
    Promise.race([
      recordError({ source: 'server', kind: 'process', message: `Fatal startup error: ${err?.message ?? err}`, stack: err?.stack ?? null }),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]).finally(() => process.exit(1));
  });
}

export { app };

// Test helper to bypass the 503 DB check in tests that don't run bootstrap()
export const _setDbStatusForTest = (status: 'starting' | 'ok' | 'error') => {
  dbStatus = status;
};

