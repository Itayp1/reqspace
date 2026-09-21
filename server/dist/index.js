"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
require("express-async-errors");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const auth_1 = __importDefault(require("./routes/auth"));
const workspaces_1 = __importDefault(require("./routes/workspaces"));
const collections_1 = __importDefault(require("./routes/collections"));
const environments_1 = __importDefault(require("./routes/environments"));
const history_1 = __importDefault(require("./routes/history"));
const proxy_1 = __importDefault(require("./routes/proxy"));
const capture_1 = __importDefault(require("./routes/capture"));
const admin_1 = __importDefault(require("./routes/admin"));
const users_1 = __importDefault(require("./routes/users"));
const share_1 = __importDefault(require("./routes/share"));
const shareProxy_1 = __importDefault(require("./routes/shareProxy"));
const importExport_1 = __importDefault(require("./routes/importExport"));
const runner_1 = __importDefault(require("./routes/runner"));
const SystemConfigRepository_1 = require("./repositories/SystemConfigRepository");
const UserRepository_1 = require("./repositories/UserRepository");
const WorkspaceRepository_1 = require("./repositories/WorkspaceRepository");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// ── DB state (updated during bootstrap) ──────────────────────────────────────
let dbStatus = 'starting';
let dbError = null;
let dbType = 'unknown';
// Socket.io
exports.io = new socket_io_1.Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/ws',
});
exports.io.on('connection', (socket) => {
    socket.on('join:workspace', (workspaceId) => {
        socket.join('workspace:' + workspaceId);
    });
    socket.on('leave:workspace', (workspaceId) => {
        socket.leave('workspace:' + workspaceId);
    });
    socket.on('presence:open', ({ workspaceId, requestId, user }) => {
        socket.to('workspace:' + workspaceId).emit('presence:open', { requestId, user });
    });
    socket.on('presence:close', ({ workspaceId, requestId, user }) => {
        socket.to('workspace:' + workspaceId).emit('presence:close', { requestId, user });
    });
});
// Middleware
app.use((0, morgan_1.default)('dev'));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.use((0, cookie_parser_1.default)());
app.use((0, cors_1.default)({
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
        mongoState: mongoose_1.default.connection.readyState,
        timestamp: new Date().toISOString(),
    });
});
// ── Block API routes if DB is not ready ──────────────────────────────────────
app.use('/api', (req, res, next) => {
    // Always allow health check and dbConfig endpoints even if DB is down
    if (req.path === '/health' || req.path.startsWith('/admin/db-config'))
        return next();
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
app.use('/api/auth', auth_1.default);
app.use('/api/workspaces', workspaces_1.default);
app.use('/api', collections_1.default);
app.use('/api', environments_1.default);
app.use('/api', history_1.default);
app.use('/api/proxy', proxy_1.default);
app.use('/api/capture', capture_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/users', users_1.default);
app.use('/api/share', share_1.default);
app.use('/api/share', shareProxy_1.default);
app.use('/api', importExport_1.default);
app.use('/api', runner_1.default);
// Serve client static files (production)
const clientDistPath = process.env.CLIENT_DIST_PATH
    ? path_1.default.resolve(__dirname, '..', process.env.CLIENT_DIST_PATH)
    : path_1.default.resolve(__dirname, '../../client/dist');
app.use(express_1.default.static(clientDistPath));
app.get('*', (_req, res) => {
    res.sendFile(path_1.default.join(clientDistPath, 'index.html'));
});
// Error handler
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: err.message ?? 'Internal server error' });
});
// ── Start ─────────────────────────────────────────────────────────────────────
async function bootstrap() {
    const { getDbConfig } = await Promise.resolve().then(() => __importStar(require('./db/dbConfig')));
    const { connectDb } = await Promise.resolve().then(() => __importStar(require('./db/connect')));
    const port = parseInt(process.env.PORT ?? '3000', 10);
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
        await SystemConfigRepository_1.SystemConfigRepository.ensure();
        console.log('✅ SystemConfig initialized');
        const adminCount = (await UserRepository_1.UserRepository.list({ isSuperAdmin: true })).length;
        if (adminCount === 0) {
            const passwordHash = await bcryptjs_1.default.hash('admin', 10);
            const adminUser = await UserRepository_1.UserRepository.create({
                name: 'Admin',
                email: 'admin',
                passwordHash,
                authType: 'password',
                isSuperAdmin: true,
                mustChangePassword: true
            });
            await WorkspaceRepository_1.WorkspaceRepository.create({
                name: `Admin's Workspace`,
                description: 'Personal workspace',
                ownerId: adminUser.id,
            });
            console.log('✅ Default superadmin created (admin / admin) - password change required');
        }
        else {
            console.log('✅ Default admin ensured');
        }
        dbStatus = 'ok';
    }
    catch (err) {
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
//# sourceMappingURL=index.js.map