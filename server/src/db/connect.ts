import mongoose from 'mongoose';
import { DbConfig } from './dbConfig';
import { initSequelize } from './sequelize';
import { initSqlModels } from './sql-models';

let _dbType: string = 'mongodb';

export function isMongo(): boolean {
  return _dbType === 'mongodb';
}

export async function connectDb(config: DbConfig): Promise<void> {
  _dbType = config.type;

  if (config.type === 'mongodb') {
    const uri = config.connectionString!;
    await mongoose.connect(uri, { tlsInsecure: true } as mongoose.ConnectOptions);
    console.log('✅ MongoDB connected:', uri.replace(/\/\/.*@/, '//***@'));
    return;
  }

  // SQL path
  const sq = initSequelize(config);
  initSqlModels();

  await sq.authenticate();
  console.log(`✅ ${config.type.toUpperCase()} connected`);

  // Create tables that don't exist yet (non-destructive)
  await sq.sync({ alter: true });
  console.log('✅ SQL tables synced');
}
