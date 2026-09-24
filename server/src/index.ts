import 'express-async-errors';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

import { httpStatus } from './utils/errors';
import authRouter from './routes/auth';
import workspacesRouter from './routes/workspaces';
import collectionsRouter from './routes/collections';
import environmentsRouter from './routes/environments';
import historyRouter from './routes/history';
import proxyRouter from './routes/proxy';
import captureRouter from './routes/capture';
import adminRouter from './routes/admin';
import usersRouter from './routes/users';
import shareRouter from './routes/share';
import shareProxyRouter from './routes/shareProxy';
import importExportRouter from './routes/importExport';
import { SystemConfigRepository } from './repositories/SystemConfigRepository';
import { UserRepository } from './repositories/UserRepository';
import { WorkspaceRepository } from './repositories/WorkspaceRepository';
import { getUserWorkspaceRole } from './middleware/rbac';
import { resolveJwtSecret } from './utils/jwtSecret';
import { connectRedis, attachSocketAdapter, redisMode } from './redis';
import { subscribeCacheInvalidation } from './cache';
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

io.on('connection', (socket) => {
  const userId = getSocketUserId(socket);
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
// Baseline HTTP hardening. frame-src 'self' lets the response visualizer iframe
// load /visualizer.html. A sandboxed iframe is a unique origin, so those assets
// must opt out of Helmet's default same-origin CORP or the frame stays blank.
app.use((req, res, next) => {
  if (req.path === '/visualizer.html' || req.path === '/sandbox.html' || req.path.startsWith('/vendor/')) {
    const setHeader = res.setHeader.bind(res);
    res.setHeader = ((name: string, value: number | string | readonly string[]) => {
      if (String(name).toLowerCase() === 'cross-origin-resource-policy') {
        return setHeader(name, 'cross-origin');
      }
      return setHeader(name, value);
    }) as typeof res.setHeader;
  }
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameSrc: ["'self'"],
      baseUri: ["'self'"],
    },
  },
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
    redisConcurrency: redisMode(),
    dbError: dbError ? (isProd ? 'Database unavailable' : dbError) : undefined,
    uptime: process.uptime(),
    mongoState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

// ── Block API routes if DB is not ready ──────────────────────────────────────
app.use('/api', (req, res, next) => {
  // Always allow the health check even if the DB is down. (The previous
  // '/admin/db-config' carve-out referenced a route that doesn't exist — CR#18.)
  if (req.path === '/health') return next();
  if (dbStatus !== 'ok') {
    return res.status(503).json({
      message: 'Database not available',
      dbError: dbError || 'Database is not connected',
      dbType,
      dbStatus,
    });
  }
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api', collectionsRouter);
app.use('/api', environmentsRouter);
app.use('/api', historyRouter);
app.use('/api/proxy', proxyRouter);
app.use('/api/capture', captureRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/share', shareRouter);
app.use('/api/share', shareProxyRouter);
app.use('/api', importExportRouter);
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
  const status = httpStatus(err);
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

  await connectRedis();
  await subscribeCacheInvalidation();
  await attachSocketAdapter(io);

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

    const adminCount = (await UserRepository.list({ isSuperAdmin: true })).length;
    if (adminCount === 0) {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
      // Never seed a known-default admin/admin superadmin in production — the
      // account is fully usable between boot and first login (CR#6). Require an
      // explicit strong ADMIN_PASSWORD instead.
      if (process.env.NODE_ENV === 'production' && adminPassword === 'admin') {
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

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
