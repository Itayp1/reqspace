import 'express-async-errors';
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

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
import runnerRouter from './routes/runner';
import { SystemConfigRepository } from './repositories/SystemConfigRepository';
import { UserRepository } from './repositories/UserRepository';
import { WorkspaceRepository } from './repositories/WorkspaceRepository';
import { getUserWorkspaceRole } from './middleware/rbac';
import { resolveJwtSecret } from './utils/jwtSecret';
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

// Middleware
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
  credentials: true,
}));

// ── Health check — always responds, reports DB state ─────────────────────────
app.get('/api/health', (_req, res) => {
  const status = dbStatus === 'ok' ? 200 : (dbStatus === 'starting' ? 503 : 503);
  res.status(status).json({
    status: dbStatus,
    dbType,
    dbError: dbError || undefined,
    uptime: process.uptime(),
    mongoState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

// ── Block API routes if DB is not ready ──────────────────────────────────────
app.use('/api', (req, res, next) => {
  // Always allow health check and dbConfig endpoints even if DB is down
  if (req.path === '/health' || req.path.startsWith('/admin/db-config')) return next();
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
app.use('/api', runnerRouter);

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
  const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message ?? 'Internal server error');
  res.status(500).json({ message });
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

    const adminCount = (await UserRepository.list({ isSuperAdmin: true })).length;
    if (adminCount === 0) {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
      const passwordHash = await bcrypt.hash(adminPassword, 10);
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
