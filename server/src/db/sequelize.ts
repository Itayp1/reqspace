import { Sequelize, Options } from 'sequelize';
import { DbConfig } from './dbConfig';

let _sequelize: Sequelize | null = null;

export function getSequelize(): Sequelize {
  if (!_sequelize) throw new Error('Sequelize not initialized. Call initSequelize() first.');
  return _sequelize;
}

export function initSequelize(config: DbConfig): Sequelize {
  if (config.type === 'mongodb') {
    // There is no MongoDB driver; fail with a message that says what to do
    // instead of a null dereference further down.
    throw new Error('DB_TYPE=mongodb is not supported. Use sqlite (the default), postgres, mysql or mssql.');
  }
  if (config.type === 'sqlite') {
    _sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: config.storagePath,
      logging: false,
      // R-CONC: wait for the write lock instead of failing with SQLITE_BUSY.
      retry: { max: 5, match: [/SQLITE_BUSY/, /database is locked/] },
      hooks: {
        afterConnect: async (conn: any) => {
          await new Promise<void>((resolve) => {
            conn.serialize(() => {
              conn.run('PRAGMA busy_timeout = 10000');
              conn.run('PRAGMA journal_mode = WAL');
              conn.run('PRAGMA synchronous = NORMAL', () => resolve());
            });
          });
        },
      },
    });
    return _sequelize;
  }

  const dialectMap: Record<string, Options['dialect']> = {
    mysql: 'mysql',
    postgres: 'postgres',
    mssql: 'mssql',
  };

  const dialect = dialectMap[config.type];
  if (!dialect) throw new Error(`Unsupported DB type: ${config.type}`);

  if (config.connectionString) {
    _sequelize = new Sequelize(config.connectionString, {
      dialect,
      logging: false,
      dialectOptions: config.type === 'mssql'
        ? { options: { encrypt: false, trustServerCertificate: true } }
        : {},
    });
  } else {
    _sequelize = new Sequelize(
      config.database!,
      config.username!,
      config.password || undefined,
      {
        dialect,
        host: config.host,
        port: config.port,
        logging: false,
        dialectOptions: config.type === 'mssql'
          ? { options: { encrypt: false, trustServerCertificate: true } }
          : {},
      }
    );
  }

  return _sequelize;
}
