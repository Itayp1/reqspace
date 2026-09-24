import path from 'path';
import fs from 'fs';

export type DbType = 'mongodb' | 'mysql' | 'postgres' | 'mssql' | 'sqlite';

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

const CONFIG_FILE = process.env.DB_CONFIG_FILE || path.join(process.cwd(), 'db-config.json');

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

export function getDbConfig(): DbConfig {
  const fileConfig = readConfigFile();

  const type = (process.env.DB_TYPE || fileConfig.type || 'mongodb') as DbType;

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

  if (type === 'mongodb') {
    return {
      type: 'mongodb',
      connectionString:
        process.env.MONGODB_URI ||
        process.env.MONGO_URI ||
        fileConfig.connectionString ||
        'mongodb://localhost:27017/reqspace-web',
    };
  }

  // SQL types
  return {
    type,
    connectionString: process.env.DB_CONNECTION_STRING || fileConfig.connectionString,
    host: process.env.DB_HOST || fileConfig.host || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : (fileConfig.port ?? defaultPort(type)),
    database: process.env.DB_NAME || fileConfig.database || 'reqspace',
    username: process.env.DB_USER || fileConfig.username || 'root',
    password: process.env.DB_PASSWORD || fileConfig.password || '',
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
