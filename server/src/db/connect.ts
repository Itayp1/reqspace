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
    // Only relax TLS verification when explicitly opted in (dev against a
    // self-signed server). Defaulting to tlsInsecure disabled cert validation
    // for every deployment, including Atlas (CR#6).
    const opts: mongoose.ConnectOptions =
      process.env.MONGO_TLS_INSECURE === 'true' ? ({ tlsInsecure: true } as mongoose.ConnectOptions) : {};
    await mongoose.connect(uri, opts);
    console.log('✅ MongoDB connected:', uri.replace(/\/\/.*@/, '//***@'));
    return;
  }

  // SQL path
  const sq = initSequelize(config);
  initSqlModels();

  await sq.authenticate();
  console.log(`✅ ${config.type.toUpperCase()} connected`);

  // `alter: true` diffs and mutates the live schema on every boot — a standing
  // data-loss risk in production (CR#18). Only auto-alter outside production;
  // in production just create missing tables non-destructively. Real schema
  // changes should go through migrations.
  await sq.sync(process.env.NODE_ENV === 'production' ? {} : { alter: true });
  console.log('✅ SQL tables synced');
}
