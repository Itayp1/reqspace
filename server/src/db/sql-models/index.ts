import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../sequelize';
import { v4 as uuidv4 } from 'uuid';

// ─────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────
export class SqlUser extends Model {
  declare id: string;
  declare name: string;
  declare email: string;
  declare passwordHash: string | null;
  declare authType: string;
  declare isSuperAdmin: boolean;
  declare status: string;
  declare avatar: string | null;
  declare settings: string; // JSON
  declare clientCertificates: string; // JSON
  declare historyUsedBytes: number;
  declare mustChangePassword: boolean;
  declare lastLoginAt: Date | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

// ─────────────────────────────────────────────────
// WORKSPACES
// ─────────────────────────────────────────────────
export class SqlWorkspace extends Model {
  declare id: string;
  declare name: string;
  declare description: string;
  declare ownerId: string;
  declare members: string; // JSON array
  declare isPublic: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

// ─────────────────────────────────────────────────
// COLLECTIONS
// ─────────────────────────────────────────────────
export class SqlCollection extends Model {
  declare id: string;
  declare workspaceId: string;
  declare name: string;
  declare description: string;
  declare variables: string; // JSON
  declare preRequestScript: string;
  declare testScript: string;
  declare roles: string; // JSON
  declare order: number;
  declare createdBy: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

// ─────────────────────────────────────────────────
// FOLDERS
// ─────────────────────────────────────────────────
export class SqlFolder extends Model {
  declare id: string;
  declare collectionId: string;
  declare parentFolderId: string | null;
  declare name: string;
  declare description: string;
  declare preRequestScript: string;
  declare testScript: string;
  declare roles: string; // JSON
  declare order: number;
  declare createdAt: Date;
  declare updatedAt: Date;
}

// ─────────────────────────────────────────────────
// REQUESTS
// ─────────────────────────────────────────────────
export class SqlRequest extends Model {
  declare id: string;
  declare collectionId: string;
  declare folderId: string | null;
  declare name: string;
  declare method: string;
  declare url: string;
  declare params: string; // JSON
  declare headers: string; // JSON
  declare auth: string; // JSON
  declare body: string; // JSON
  declare preRequestScript: string;
  declare testScript: string;
  declare description: string;
  declare order: number;
  declare comments: string; // JSON
  declare createdBy: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

// ─────────────────────────────────────────────────
// ENVIRONMENTS
// ─────────────────────────────────────────────────
export class SqlEnvironment extends Model {
  declare id: string;
  declare workspaceId: string;
  declare name: string;
  declare variables: string; // JSON
  declare createdBy: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export class SqlGlobalEnvironment extends Model {
  declare id: string;
  declare workspaceId: string;
  declare variables: string; // JSON
  declare updatedAt: Date;
}

// ─────────────────────────────────────────────────
// HISTORY
// ─────────────────────────────────────────────────
export class SqlHistory extends Model {
  declare id: string;
  declare userId: string;
  declare workspaceId: string;
  declare method: string;
  declare url: string;
  declare statusCode: number | null;
  declare duration: number | null;
  declare requestData: string; // JSON
  declare responseData: string; // JSON
  declare createdAt: Date;
}

// ─────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────
export class SqlAuditLog extends Model {
  declare id: string;
  declare userId: string;
  declare action: string;
  declare targetType: string | null;
  declare targetId: string | null;
  declare ip: string | null;
  declare details: string | null; // JSON
  declare createdAt: Date;
}

// ─────────────────────────────────────────────────
// SYSTEM CONFIG
// ─────────────────────────────────────────────────
export class SqlSystemConfig extends Model {
  declare id: string;
  declare auth: string; // JSON
  declare history: string; // JSON
  declare proxy: string; // JSON
  declare updatedAt: Date;
}

// ─────────────────────────────────────────────────
// SHARED LINKS
// ─────────────────────────────────────────────────
export class SqlSharedLink extends Model {
  declare id: string;
  declare shortId: string;
  declare collectionId: string;
  declare workspaceId: string;
  declare token: string;
  declare createdBy: string;
  declare expiresAt: Date | null;
  declare createdAt: Date;
}

// ─────────────────────────────────────────────────
// LOCAL VARIABLES
// ─────────────────────────────────────────────────
export class SqlLocalVariable extends Model {
  declare id: string;
  declare workspaceId: string;
  declare userId: string;
  declare variables: string; // JSON
  declare createdAt: Date;
  declare updatedAt: Date;
}

// ─────────────────────────────────────────────────
// INIT — define all models
// ─────────────────────────────────────────────────
export function initSqlModels() {
  const sq = getSequelize();

  SqlUser.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.TEXT, allowNull: true },
    authType: { type: DataTypes.STRING(20), defaultValue: 'password' },
    isSuperAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.STRING(20), defaultValue: 'active' },
    avatar: { type: DataTypes.STRING(255), allowNull: true },
    settings: { type: DataTypes.TEXT, defaultValue: '{}' },
    clientCertificates: { type: DataTypes.TEXT, defaultValue: '[]' },
    historyUsedBytes: { type: DataTypes.INTEGER, defaultValue: 0 },
    mustChangePassword: { type: DataTypes.BOOLEAN, defaultValue: false },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  }, { sequelize: sq, tableName: 'users', timestamps: true });

  SqlWorkspace.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, defaultValue: '' },
    ownerId: { type: DataTypes.STRING(36), allowNull: false },
    members: { type: DataTypes.TEXT, defaultValue: '[]' },
    isPublic: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, { sequelize: sq, tableName: 'workspaces', timestamps: true, indexes: [{ fields: ['ownerId'] }] });

  SqlCollection.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    workspaceId: { type: DataTypes.STRING(36), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, defaultValue: '' },
    variables: { type: DataTypes.TEXT, defaultValue: '[]' },
    preRequestScript: { type: DataTypes.TEXT, defaultValue: '' },
    testScript: { type: DataTypes.TEXT, defaultValue: '' },
    roles: { type: DataTypes.TEXT, defaultValue: '[]' },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    createdBy: { type: DataTypes.STRING(36), allowNull: false },
  }, {
    sequelize: sq, tableName: 'collections', timestamps: true,
    // Index the FK + the field used for ordered listing (Sequelize emits the
    // dialect-correct CREATE INDEX for each backend on sync).
    indexes: [{ fields: ['workspaceId'] }, { fields: ['workspaceId', 'order'] }],
  });

  SqlFolder.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    collectionId: { type: DataTypes.STRING(36), allowNull: false },
    parentFolderId: { type: DataTypes.STRING(36), allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, defaultValue: '' },
    preRequestScript: { type: DataTypes.TEXT, defaultValue: '' },
    testScript: { type: DataTypes.TEXT, defaultValue: '' },
    roles: { type: DataTypes.TEXT, defaultValue: '[]' },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, {
    sequelize: sq, tableName: 'folders', timestamps: true,
    indexes: [{ fields: ['collectionId'] }, { fields: ['collectionId', 'parentFolderId'] }],
  });

  SqlRequest.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    collectionId: { type: DataTypes.STRING(36), allowNull: false },
    folderId: { type: DataTypes.STRING(36), allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    method: { type: DataTypes.STRING(10), defaultValue: 'GET' },
    url: { type: DataTypes.TEXT, defaultValue: '' },
    params: { type: DataTypes.TEXT, defaultValue: '[]' },
    headers: { type: DataTypes.TEXT, defaultValue: '[]' },
    auth: { type: DataTypes.TEXT, defaultValue: '{"type":"none"}' },
    body: { type: DataTypes.TEXT, defaultValue: '{"mode":"none"}' },
    preRequestScript: { type: DataTypes.TEXT, defaultValue: '' },
    testScript: { type: DataTypes.TEXT, defaultValue: '' },
    description: { type: DataTypes.TEXT, defaultValue: '' },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    comments: { type: DataTypes.TEXT, defaultValue: '[]' },
    createdBy: { type: DataTypes.STRING(36), allowNull: false },
  }, {
    sequelize: sq, tableName: 'requests', timestamps: true,
    // A 20M-row requests table is unusable without these; the listing queries
    // filter by collectionId (+ folderId) and sort by order.
    indexes: [
      { fields: ['collectionId'] },
      { fields: ['folderId'] },
      { fields: ['collectionId', 'folderId', 'order'] },
    ],
  });

  SqlEnvironment.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    workspaceId: { type: DataTypes.STRING(36), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    variables: { type: DataTypes.TEXT, defaultValue: '[]' },
    createdBy: { type: DataTypes.STRING(36), allowNull: false },
  }, { sequelize: sq, tableName: 'environments', timestamps: true, indexes: [{ fields: ['workspaceId'] }] });

  SqlGlobalEnvironment.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    workspaceId: { type: DataTypes.STRING(36), allowNull: false, unique: true },
    variables: { type: DataTypes.TEXT, defaultValue: '[]' },
  }, { sequelize: sq, tableName: 'global_environments', timestamps: false, updatedAt: 'updatedAt', createdAt: false });

  SqlHistory.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    userId: { type: DataTypes.STRING(36), allowNull: false },
    workspaceId: { type: DataTypes.STRING(36), allowNull: false },
    method: { type: DataTypes.STRING(10) },
    url: { type: DataTypes.TEXT },
    statusCode: { type: DataTypes.INTEGER, allowNull: true },
    duration: { type: DataTypes.INTEGER, allowNull: true },
    requestData: { type: DataTypes.TEXT, defaultValue: '{}' },
    responseData: { type: DataTypes.TEXT, defaultValue: '{}' },
  }, { sequelize: sq, tableName: 'history', timestamps: true, updatedAt: false, indexes: [{ fields: ['userId', 'workspaceId'] }, { fields: ['createdAt'] }] });

  SqlAuditLog.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    userId: { type: DataTypes.STRING(36), allowNull: false },
    action: { type: DataTypes.STRING(50), allowNull: false },
    targetType: { type: DataTypes.STRING(50), allowNull: true },
    targetId: { type: DataTypes.STRING(36), allowNull: true },
    ip: { type: DataTypes.STRING(45), allowNull: true },
    details: { type: DataTypes.TEXT, allowNull: true },
  }, { sequelize: sq, tableName: 'audit_logs', timestamps: true, createdAt: 'createdAt', updatedAt: false, indexes: [{ fields: ['userId'] }, { fields: ['targetId'] }] });

  SqlSystemConfig.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    auth: { type: DataTypes.TEXT, allowNull: false },
    history: { type: DataTypes.TEXT, allowNull: false },
    proxy: { type: DataTypes.TEXT, allowNull: false },
  }, { sequelize: sq, tableName: 'system_config', timestamps: false, updatedAt: 'updatedAt', createdAt: false });

  SqlSharedLink.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    shortId: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    collectionId: { type: DataTypes.STRING(36), allowNull: false },
    workspaceId: { type: DataTypes.STRING(36), allowNull: false },
    token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    createdBy: { type: DataTypes.STRING(36), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
  }, { sequelize: sq, tableName: 'shared_links', timestamps: true, updatedAt: false });

  SqlLocalVariable.init({
    id: { type: DataTypes.STRING(36), primaryKey: true, defaultValue: () => uuidv4() },
    workspaceId: { type: DataTypes.STRING(36), allowNull: false },
    userId: { type: DataTypes.STRING(36), allowNull: false },
    variables: { type: DataTypes.TEXT, defaultValue: '[]' },
  }, { sequelize: sq, tableName: 'local_variables', timestamps: true, indexes: [{ fields: ['workspaceId', 'userId'], unique: true }] });
}


