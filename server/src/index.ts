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
import path from 'path';
// import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

import authRouter from './routes/auth';
import workspacesRouter from './routes/workspaces';
import collectionsRouter from './routes/collections';
import environmentsRouter from './routes/environments';
import historyRouter from './routes/history';
import proxyRouter from './routes/proxy';

import adminRouter from './routes/admin';
import usersRouter from './routes/users';
import shareRouter from './routes/share';
import shareProxyRouter from './routes/shareProxy';
import importExportRouter from './routes/importExport';
import localVariablesRouter from './routes/localVariables';
import { SystemConfigRepository } from './repositories/SystemConfigRepository';
import { UserRepository } from './repositories/UserRepository';
import { WorkspaceRepository } from './repositories/WorkspaceRepository';
import { getUserWorkspaceRole } from './middleware/rbac';
import { resolveJwtSecret } from './utils/jwtSecret';
import { dbDownBody } from './utils/dbGate';
import { rateLimit } from './middleware/rateLimit';
import bcrypt from 'bcryptjs';

const JWT_SECRET = resolveJwtSecret();

const app = express();
const server = http.createServer(app);

// ── DB state (updated during bootstrap) ──────────────────────────────────────
let dbStatus: 'starting' | 'ok' | 'error' = 'starting';
let dbError: string | null = null;
let dbType: string = 'unknown';

// Socket.io
export const io = new SocketIOServer(server, {
  // Mirrors the REST API's CORS policy: same-origin only in production,
  // the Vite dev server in development. '*' would let any site open an
  // authenticated socket against this server.
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
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

import { roleCache } from './utils/cache';

io.on('connection', (socket) => {
  socket.data.userId = getSocketUserId(socket);
  const userId = socket.data.userId;
  const MAX_ROOMS = 50;

  // Periodic token check
  const tokenInterval = setInterval(() => {
    const currentUserId = getSocketUserId(socket);
    if (!currentUserId || currentUserId !== userId) {
      socket.disconnect(true);
    }
  }, 60000);

  socket.on('disconnect', () => clearInterval(tokenInterval));
  const authorizedWorkspaces = new Set<string>();

  socket.on('join:workspace', async (workspaceId: string) => {
    if (!userId || typeof workspaceId !== 'string') return;
    const role = await getUserWorkspaceRole(userId, workspaceId).catch(() => null);
    const user = await UserRepository.findById(userId).catch(() => null);
    if (!role && !user?.isSuperAdmin) return; // not a member, workspace not public, and not superadmin
    authorizedWorkspaces.add(workspaceId);
    socket.join('workspace:' + workspaceId);
  });

  socket.on('leave:workspace', (workspaceId: string) => {
    authorizedWorkspaces.delete(workspaceId);
    socket.leave('workspace:' + workspaceId);
  });

  socket.on('presence:open', ({ workspaceId, requestId, user }) => {
    if (!authorizedWorkspaces.has(workspaceId)) return;
    socket.to('workspace:' + workspaceId).emit('presence:open', { requestId, user });
  });
  socket.on('presence:close', ({ workspaceId, requestId, user }) => {
    if (!authorizedWorkspaces.has(workspaceId)) return;
    socket.to('workspace:' + workspaceId).emit('presence:close', { requestId, user });
  });
});

// Behind an Ingress/reverse proxy, trust X-Forwarded-* so req.ip, rate limiting
// and `secure` cookies work correctly (CR#8, CR#16). Configurable; defaults to
// one hop (typical single proxy) — set TRUST_PROXY=false to disable.
app.set('trust proxy', process.env.TRUST_PROXY === 'false' ? false : (process.env.TRUST_PROXY ?? 1));

// Middleware
app.use(morgan('dev'));
// Baseline HTTP hardening. CSP is left disabled here because the SPA + Monaco
// currently need a permissive policy; tighten via a dedicated CSP later.
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-eval' is required by the script runner (client/src/utils/scripts.ts uses
      // new Function). SEC-3 is what removes it; 'wasm-unsafe-eval' does NOT cover new Function.
      // NOTE: We implemented SEC-3 which uses new Function inside worker.ts. So the worker needs 'unsafe-eval'.
      // Actually, since we still use new Function in worker.ts, we need it.
      scriptSrc: ["'self'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],          // Tailwind + inline <style> in App.tsx
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));
// Cap request bodies. 50mb made the process trivial to OOM (CR#8). Override via
// MAX_BODY_SIZE if a deployment legitimately needs larger payloads.
const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE || '5mb';
app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY_SIZE }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
  credentials: true,
}));

// ── Health check — always responds, reports DB state ─────────────────────────
app.get('/api/health', (_req, res) => {
  const status = dbStatus === 'ok' ? 200 : (dbStatus === 'starting' ? 503 : 503);
  // Never leak the raw DB error (can contain a connection string) in
  // production — return a generic message instead (CR#24).
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

// ── Block API routes if DB is not ready ──────────────────────────────────────
app.use('/api', (req, res, next) => {
  // Always allow the health check even if the DB is down. (The previous
  // '/admin/db-config' carve-out referenced a route that doesn't exist — CR#18.)
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
const mutationLimiter = rateLimit({ windowMs: 60_000, max: 300, message: 'Too many requests - please slow down.' });
app.use('/api', (req, res, next) =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? mutationLimiter(req, res, next) : next()
);
app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspacesRouter);
// Mounted before the generic-'/api' routers below: their own `router.use(authenticate)`
// has no path prefix, so it swallows every '/api/*' request that reaches it — including
// these two routers' deliberately-public routes (anonymous share-link viewing) — unless
// share is matched first.
app.use('/api/share', shareRouter);
app.use('/api/share', shareProxyRouter);
app.use('/api', collectionsRouter);
app.use('/api', environmentsRouter);
app.use('/api', historyRouter);
app.use('/api/proxy', proxyRouter);

app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api', importExportRouter);
app.use('/api/local-variables', localVariablesRouter);

// Serve client static files (production)
const clientDistPath = process.env.CLIENT_DIST_PATH
  ? path.resolve(__dirname, '..', process.env.CLIENT_DIST_PATH)
  : path.resolve(__dirname, '../../client/dist');

app.use(express.static(clientDistPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handler — logs the real error server-side but never echoes internal
// messages (DB connection strings, file paths, stack detail) back to the
// client, which is publicly reachable once this is deployed as a SaaS.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  // Honour explicit client-error statuses (e.g. 413 payload-too-large, 400) so
  // they aren't masked as 500. Server errors stay generic in production.
  const status = (err as any).status || (err as any).statusCode || 500;
  const message = status < 500
    ? (err.message ?? 'Request error')
    : (process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message ?? 'Internal server error'));
  res.status(status).json({ message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function bootstrap() {
  const { getDbConfig } = await import('./db/dbConfig');
  const { connectDb } = await import('./db/connect');

  const port = parseInt(process.env.PORT ?? '3005', 10);

  // Start listening first — so the client can load and show errors
  server.listen(port, () => {
    console.log('🚀 Server running on http://localhost:' + port);
  });

  const dbConfig = getDbConfig();
  dbType = dbConfig.type;
  console.log(`🗄️  Connecting to DB: ${dbConfig.type}`);

  try {
    await connectDb(dbConfig);
    console.log(`✅ DB connected (${dbConfig.type})`);

    await SystemConfigRepository.ensure();
    console.log('✅ SystemConfig initialized');

    const adminCount = (await UserRepository.list({ isSuperAdmin: true })).items.length;
    if (adminCount === 0) {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
      // Never seed a known-default admin/admin superadmin in production — the
      // account is fully usable between boot and first login (CR#6). Require an
      // explicit strong ADMIN_PASSWORD instead.
      if (process.env.NODE_ENV === 'production' && adminPassword === 'admin' && process.env.ALLOW_DEFAULT_ADMIN !== 'true') {
        console.error('❌ Refusing to bootstrap the default admin/admin superadmin in production. Set a strong ADMIN_PASSWORD and restart.');
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
        mustChangePassword: adminPassword === 'admin' // Force change if using default fallback
      });
      await WorkspaceRepository.create({
        name: `Admin's Workspace`,
        description: 'Personal workspace',
        ownerId: adminUser.id,
      });
      console.log(`✅ Default superadmin created (${adminEmail} / ${'*'.repeat(adminPassword.length)})`);
    } else {
      console.log('✅ Superadmin exists');
    }

    dbStatus = 'ok';
  } catch (err: any) {
    dbStatus = 'error';
    dbError = err?.message ?? String(err);
    console.error(`❌ DB connection failed (${dbConfig.type}):`, dbError);
    console.error('Server is running but DB is unavailable. Check /api/health for details.');
    // Don't exit — the UI will show the error so user can fix config via Admin panel
  }
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

export { app };

