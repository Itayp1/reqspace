"use strict";
/**
 * DB Configuration Tests
 *
 * Tests the dbConfig module: reading from env vars, writing/reading config files,
 * and correct default values per DB type.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
// We use a temp dir so we don't pollute the project directory
let tmpDir;
let configFilePath;
beforeEach(() => {
    tmpDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'postman-test-'));
    configFilePath = path_1.default.join(tmpDir, 'db-config.json');
    process.env.DB_CONFIG_FILE = configFilePath;
    // Clear cached env vars
    delete process.env.DB_TYPE;
    delete process.env.MONGO_URI;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_NAME;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_CONNECTION_STRING;
});
afterEach(() => {
    fs_1.default.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.DB_CONFIG_FILE;
});
// Re-import fresh each time by clearing the module cache
function freshConfig() {
    jest.resetModules();
    return require('../db/dbConfig');
}
describe('dbConfig — defaults', () => {
    it('defaults to mongodb when no config exists', () => {
        const { getDbConfig } = freshConfig();
        const cfg = getDbConfig();
        expect(cfg.type).toBe('mongodb');
        expect(cfg.connectionString).toContain('mongodb://');
    });
    it('uses DB_TYPE env var', () => {
        process.env.DB_TYPE = 'postgres';
        const { getDbConfig } = freshConfig();
        const cfg = getDbConfig();
        expect(cfg.type).toBe('postgres');
        expect(cfg.port).toBe(5432);
    });
    it('uses DB_TYPE=mysql with correct default port', () => {
        process.env.DB_TYPE = 'mysql';
        const { getDbConfig } = freshConfig();
        const cfg = getDbConfig();
        expect(cfg.type).toBe('mysql');
        expect(cfg.port).toBe(3306);
    });
    it('uses DB_TYPE=mssql with correct default port', () => {
        process.env.DB_TYPE = 'mssql';
        const { getDbConfig } = freshConfig();
        const cfg = getDbConfig();
        expect(cfg.type).toBe('mssql');
        expect(cfg.port).toBe(1433);
    });
    it('reads individual DB env vars', () => {
        process.env.DB_TYPE = 'postgres';
        process.env.DB_HOST = 'db.myserver.com';
        process.env.DB_PORT = '5433';
        process.env.DB_NAME = 'mydb';
        process.env.DB_USER = 'admin';
        process.env.DB_PASSWORD = 'secret';
        const { getDbConfig } = freshConfig();
        const cfg = getDbConfig();
        expect(cfg.host).toBe('db.myserver.com');
        expect(cfg.port).toBe(5433);
        expect(cfg.database).toBe('mydb');
        expect(cfg.username).toBe('admin');
        expect(cfg.password).toBe('secret');
    });
    it('sqlite uses storagePath', () => {
        process.env.DB_TYPE = 'sqlite';
        process.env.DB_STORAGE_PATH = '/tmp/test.sqlite';
        const { getDbConfig } = freshConfig();
        const cfg = getDbConfig();
        expect(cfg.type).toBe('sqlite');
        expect(cfg.storagePath).toBe('/tmp/test.sqlite');
    });
});
describe('dbConfig — file read/write', () => {
    it('writes and reads back config from file', () => {
        const { writeConfigFile, getDbConfig } = freshConfig();
        writeConfigFile({
            type: 'mysql',
            host: 'localhost',
            port: 3306,
            database: 'testdb',
            username: 'root',
            password: 'pass',
        });
        expect(fs_1.default.existsSync(configFilePath)).toBe(true);
        jest.resetModules();
        const { getDbConfig: getDbConfig2 } = require('../db/dbConfig');
        const cfg = getDbConfig2();
        expect(cfg.type).toBe('mysql');
        expect(cfg.host).toBe('localhost');
        expect(cfg.database).toBe('testdb');
    });
    it('env vars take precedence over file', () => {
        const { writeConfigFile } = freshConfig();
        writeConfigFile({ type: 'mysql', host: 'file-host', port: 3306 });
        process.env.DB_TYPE = 'postgres';
        process.env.DB_HOST = 'env-host';
        jest.resetModules();
        const { getDbConfig } = require('../db/dbConfig');
        const cfg = getDbConfig();
        // env var wins for type and host
        expect(cfg.type).toBe('postgres');
        expect(cfg.host).toBe('env-host');
    });
    it('writes valid JSON to config file', () => {
        const { writeConfigFile } = freshConfig();
        writeConfigFile({ type: 'mssql', host: 'sql-server', port: 1433 });
        const raw = fs_1.default.readFileSync(configFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        expect(parsed.type).toBe('mssql');
    });
});
describe('dbConfig — connection string mode', () => {
    it('supports mongodb connection string via env', () => {
        process.env.MONGO_URI = 'mongodb://user:pass@host:27017/mydb';
        const { getDbConfig } = freshConfig();
        const cfg = getDbConfig();
        expect(cfg.connectionString).toBe('mongodb://user:pass@host:27017/mydb');
    });
    it('supports SQL connection string via DB_CONNECTION_STRING', () => {
        process.env.DB_TYPE = 'postgres';
        process.env.DB_CONNECTION_STRING = 'postgres://user:pass@host:5432/db';
        const { getDbConfig } = freshConfig();
        const cfg = getDbConfig();
        expect(cfg.connectionString).toBe('postgres://user:pass@host:5432/db');
    });
});
//# sourceMappingURL=db.config.test.js.map