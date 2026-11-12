/**
 * DB Configuration Tests
 *
 * Tests the dbConfig module: reading from env vars, writing/reading config files,
 * and correct default values per DB type.
 */

import path from 'path';
import fs from 'fs';
import os from 'os';

// We use a temp dir so we don't pollute the project directory
let tmpDir: string;
let configFilePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reqspace-test-'));
  configFilePath = path.join(tmpDir, 'db-config.json');
  // db-config.json is read from the working directory, so point that at the temp dir.
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  // Clear cached env vars
  delete process.env.DB_CONNECTION_STRING;
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Re-import fresh each time by clearing the module cache
function freshConfig() {
  jest.resetModules();
  return require('../db/dbConfig');
}

describe('dbConfig — defaults', () => {
  it('defaults to sqlite when no config exists', () => {
    const savedPath = process.env.DB_STORAGE_PATH;
    delete process.env.DB_STORAGE_PATH;
    try {
      const { getDbConfig } = freshConfig();
      const cfg = getDbConfig();
      expect(cfg.type).toBe('sqlite');
      expect(cfg.storagePath).toMatch(/data.sqlite$/);
    } finally {
      if (savedPath !== undefined) process.env.DB_STORAGE_PATH = savedPath;
    }
  });

  it('derives postgres from the connection string scheme', () => {
    process.env.DB_CONNECTION_STRING = 'postgres://user:pass@host/db';
    const { getDbConfig } = freshConfig();
    const cfg = getDbConfig();
    expect(cfg.type).toBe('postgres');
    expect(cfg.port).toBe(5432);
  });

  it('derives mysql from the connection string scheme with the default port', () => {
    process.env.DB_CONNECTION_STRING = 'mysql://root@host/db';
    const { getDbConfig } = freshConfig();
    const cfg = getDbConfig();
    expect(cfg.type).toBe('mysql');
    expect(cfg.port).toBe(3306);
  });

  it('derives mssql from the connection string scheme with the default port', () => {
    process.env.DB_CONNECTION_STRING = 'mssql://sa:pass@host/db';
    const { getDbConfig } = freshConfig();
    const cfg = getDbConfig();
    expect(cfg.type).toBe('mssql');
    expect(cfg.port).toBe(1433);
  });

  it('sqlite uses storagePath', () => {
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

    expect(fs.existsSync(configFilePath)).toBe(true);

    jest.resetModules();
    const { getDbConfig: getDbConfig2 } = require('../db/dbConfig');
    const cfg = getDbConfig2();
    expect(cfg.type).toBe('mysql');
    expect(cfg.host).toBe('localhost');
    expect(cfg.database).toBe('testdb');
  });

  it('the connection string wins over the file type', () => {
    const { writeConfigFile } = freshConfig();
    writeConfigFile({ type: 'mysql', host: 'file-host', port: 3306 });

    process.env.DB_CONNECTION_STRING = 'postgres://user:pass@env-host/db';
    jest.resetModules();
    const { getDbConfig } = require('../db/dbConfig');
    const cfg = getDbConfig();
    expect(cfg.type).toBe('postgres');
  });

  it('writes valid JSON to config file', () => {
    const { writeConfigFile } = freshConfig();
    writeConfigFile({ type: 'mssql', host: 'sql-server', port: 1433 });
    const raw = fs.readFileSync(configFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.type).toBe('mssql');
  });
});

describe('dbConfig — connection string mode', () => {
  it('supports SQL connection string via DB_CONNECTION_STRING', () => {
    process.env.DB_CONNECTION_STRING = 'postgres://user:pass@host:5432/db';
    const { getDbConfig } = freshConfig();
    const cfg = getDbConfig();
    expect(cfg.connectionString).toBe('postgres://user:pass@host:5432/db');
  });
});
