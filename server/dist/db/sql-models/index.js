"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlSharedLink = exports.SqlSystemConfig = exports.SqlAuditLog = exports.SqlHistory = exports.SqlGlobalEnvironment = exports.SqlEnvironment = exports.SqlRequest = exports.SqlFolder = exports.SqlCollection = exports.SqlWorkspace = exports.SqlUser = void 0;
exports.initSqlModels = initSqlModels;
const sequelize_1 = require("sequelize");
const sequelize_2 = require("../sequelize");
const uuid_1 = require("uuid");
// ─────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────
class SqlUser extends sequelize_1.Model {
}
exports.SqlUser = SqlUser;
// ─────────────────────────────────────────────────
// WORKSPACES
// ─────────────────────────────────────────────────
class SqlWorkspace extends sequelize_1.Model {
}
exports.SqlWorkspace = SqlWorkspace;
// ─────────────────────────────────────────────────
// COLLECTIONS
// ─────────────────────────────────────────────────
class SqlCollection extends sequelize_1.Model {
}
exports.SqlCollection = SqlCollection;
// ─────────────────────────────────────────────────
// FOLDERS
// ─────────────────────────────────────────────────
class SqlFolder extends sequelize_1.Model {
}
exports.SqlFolder = SqlFolder;
// ─────────────────────────────────────────────────
// REQUESTS
// ─────────────────────────────────────────────────
class SqlRequest extends sequelize_1.Model {
}
exports.SqlRequest = SqlRequest;
// ─────────────────────────────────────────────────
// ENVIRONMENTS
// ─────────────────────────────────────────────────
class SqlEnvironment extends sequelize_1.Model {
}
exports.SqlEnvironment = SqlEnvironment;
class SqlGlobalEnvironment extends sequelize_1.Model {
}
exports.SqlGlobalEnvironment = SqlGlobalEnvironment;
// ─────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────
class SqlHistory extends sequelize_1.Model {
}
exports.SqlHistory = SqlHistory;
// ─────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────
class SqlAuditLog extends sequelize_1.Model {
}
exports.SqlAuditLog = SqlAuditLog;
// ─────────────────────────────────────────────────
// SYSTEM CONFIG
// ─────────────────────────────────────────────────
class SqlSystemConfig extends sequelize_1.Model {
}
exports.SqlSystemConfig = SqlSystemConfig;
// ─────────────────────────────────────────────────
// SHARED LINKS
// ─────────────────────────────────────────────────
class SqlSharedLink extends sequelize_1.Model {
}
exports.SqlSharedLink = SqlSharedLink;
// ─────────────────────────────────────────────────
// INIT — define all models
// ─────────────────────────────────────────────────
function initSqlModels() {
    const sq = (0, sequelize_2.getSequelize)();
    SqlUser.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        name: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        email: { type: sequelize_1.DataTypes.STRING(255), allowNull: false, unique: true },
        passwordHash: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
        authType: { type: sequelize_1.DataTypes.STRING(20), defaultValue: 'password' },
        isSuperAdmin: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false },
        status: { type: sequelize_1.DataTypes.STRING(20), defaultValue: 'active' },
        avatar: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        settings: { type: sequelize_1.DataTypes.TEXT, defaultValue: '{}' },
        clientCertificates: { type: sequelize_1.DataTypes.TEXT, defaultValue: '[]' },
        historyUsedBytes: { type: sequelize_1.DataTypes.INTEGER, defaultValue: 0 },
        mustChangePassword: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false },
        lastLoginAt: { type: sequelize_1.DataTypes.DATE, allowNull: true },
    }, { sequelize: sq, tableName: 'users', timestamps: true });
    SqlWorkspace.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        name: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        description: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        ownerId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        members: { type: sequelize_1.DataTypes.TEXT, defaultValue: '[]' },
        isPublic: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false },
    }, { sequelize: sq, tableName: 'workspaces', timestamps: true });
    SqlCollection.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        workspaceId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        name: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        description: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        variables: { type: sequelize_1.DataTypes.TEXT, defaultValue: '[]' },
        preRequestScript: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        testScript: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        order: { type: sequelize_1.DataTypes.INTEGER, defaultValue: 0 },
        createdBy: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
    }, { sequelize: sq, tableName: 'collections', timestamps: true });
    SqlFolder.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        collectionId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        parentFolderId: { type: sequelize_1.DataTypes.STRING(36), allowNull: true },
        name: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        description: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        preRequestScript: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        testScript: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        order: { type: sequelize_1.DataTypes.INTEGER, defaultValue: 0 },
    }, { sequelize: sq, tableName: 'folders', timestamps: true });
    SqlRequest.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        collectionId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        folderId: { type: sequelize_1.DataTypes.STRING(36), allowNull: true },
        name: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        method: { type: sequelize_1.DataTypes.STRING(10), defaultValue: 'GET' },
        url: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        params: { type: sequelize_1.DataTypes.TEXT, defaultValue: '[]' },
        headers: { type: sequelize_1.DataTypes.TEXT, defaultValue: '[]' },
        auth: { type: sequelize_1.DataTypes.TEXT, defaultValue: '{"type":"none"}' },
        body: { type: sequelize_1.DataTypes.TEXT, defaultValue: '{"mode":"none"}' },
        preRequestScript: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        testScript: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        description: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        order: { type: sequelize_1.DataTypes.INTEGER, defaultValue: 0 },
        comments: { type: sequelize_1.DataTypes.TEXT, defaultValue: '[]' },
        createdBy: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
    }, { sequelize: sq, tableName: 'requests', timestamps: true });
    SqlEnvironment.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        workspaceId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        name: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        variables: { type: sequelize_1.DataTypes.TEXT, defaultValue: '[]' },
        createdBy: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
    }, { sequelize: sq, tableName: 'environments', timestamps: true });
    SqlGlobalEnvironment.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        workspaceId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false, unique: true },
        variables: { type: sequelize_1.DataTypes.TEXT, defaultValue: '[]' },
    }, { sequelize: sq, tableName: 'global_environments', timestamps: false, updatedAt: 'updatedAt', createdAt: false });
    SqlHistory.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        userId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        workspaceId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        method: { type: sequelize_1.DataTypes.STRING(10) },
        url: { type: sequelize_1.DataTypes.TEXT },
        statusCode: { type: sequelize_1.DataTypes.INTEGER, allowNull: true },
        duration: { type: sequelize_1.DataTypes.INTEGER, allowNull: true },
        requestData: { type: sequelize_1.DataTypes.TEXT, defaultValue: '{}' },
        responseData: { type: sequelize_1.DataTypes.TEXT, defaultValue: '{}' },
    }, { sequelize: sq, tableName: 'history', timestamps: true, updatedAt: false });
    SqlAuditLog.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        userId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        action: { type: sequelize_1.DataTypes.STRING(50), allowNull: false },
        targetType: { type: sequelize_1.DataTypes.STRING(50), allowNull: true },
        targetId: { type: sequelize_1.DataTypes.STRING(36), allowNull: true },
        ip: { type: sequelize_1.DataTypes.STRING(45), allowNull: true },
        details: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    }, { sequelize: sq, tableName: 'audit_logs', timestamps: true, createdAt: 'createdAt', updatedAt: false });
    SqlSystemConfig.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        auth: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
        history: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
        proxy: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    }, { sequelize: sq, tableName: 'system_config', timestamps: false, updatedAt: 'updatedAt', createdAt: false });
    SqlSharedLink.init({
        id: { type: sequelize_1.DataTypes.STRING(36), primaryKey: true, defaultValue: () => (0, uuid_1.v4)() },
        collectionId: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        token: { type: sequelize_1.DataTypes.STRING(64), allowNull: false, unique: true },
        createdBy: { type: sequelize_1.DataTypes.STRING(36), allowNull: false },
        expiresAt: { type: sequelize_1.DataTypes.DATE, allowNull: true },
    }, { sequelize: sq, tableName: 'shared_links', timestamps: true, updatedAt: false });
}
//# sourceMappingURL=index.js.map