import path from 'path';
import fs from 'fs';

export type DbType = 'mysql' | 'postgres' | 'mssql' | 'sqlite';

export interface DbConfig {
  type: DbType;
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  // SQLite only
  storagePath?: string;
}

const CONFIG_FILE = path.join(process.cwd(), 'db-config.json');

function readConfigFile(): Partial<DbConfig> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

export function writeConfigFile(config: DbConfig) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

function typeFromConnectionString(connectionString?: string): DbType | undefined {
  const scheme = connectionString?.split(':')[0].toLowerCase();
  if (scheme === 'postgres' || scheme === 'postgresql') return 'postgres';
  if (scheme === 'mysql') return 'mysql';
  if (scheme === 'mssql' || scheme === 'sqlserver') return 'mssql';
  return undefined;
}

export function getDbConfig(): DbConfig {
  const fileConfig = readConfigFile();

  // The database type comes from the connection string scheme; without one it is SQLite.
  const connectionString = process.env.DB_CONNECTION_STRING || fileConfig.connectionString;
  const type = (typeFromConnectionString(connectionString) || fileConfig.type || 'sqlite') as DbType;

  if (type === 'sqlite') {
    let defaultSqlitePath = path.join(process.cwd(), 'data.sqlite');
    
    // If running in a desktop/production environment, save to OS user data dir to persist across updates
    if (process.env.NODE_ENV === 'production') {
      const appData = process.env.APPDATA 
        || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Application Support') : path.join(process.env.HOME || '', '.config'));
      
      if (appData) {
        const reqspaceDir = path.join(appData, 'reqspace');
        if (!fs.existsSync(reqspaceDir)) {
          fs.mkdirSync(reqspaceDir, { recursive: true });
        }
        defaultSqlitePath = path.join(reqspaceDir, 'data.sqlite');
      }
    }

    return {
      type: 'sqlite',
      storagePath: process.env.DB_STORAGE_PATH || fileConfig.storagePath || defaultSqlitePath,
    };
  }

  // SQL types
  return {
    type,
    connectionString,
    host: fileConfig.host || 'localhost',
    port: fileConfig.port ?? defaultPort(type),
    database: fileConfig.database || 'reqspace',
    username: fileConfig.username || 'root',
    password: fileConfig.password || '',
  };
}

function defaultPort(type: DbType): number {
  switch (type) {
    case 'mysql': return 3306;
    case 'postgres': return 5432;
    case 'mssql': return 1433;
    default: return 5432;
  }
}
