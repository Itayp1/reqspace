import { Sequelize, Options } from 'sequelize';
import { DbConfig } from './dbConfig';

let _sequelize: Sequelize | null = null;

export function getSequelize(): Sequelize {
  if (!_sequelize) throw new Error('Sequelize not initialized. Call initSequelize() first.');
  return _sequelize;
}

export function initSequelize(config: DbConfig): Sequelize {
  if (config.type === 'mongodb' || config.type === 'sqlite') {
    if (config.type === 'sqlite') {
      _sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: config.storagePath,
        logging: false,
      });
    }
    return _sequelize!;
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
