import { isMongo } from '../db/connect';
import { User, IUser } from '../models/User';
import { SqlUser } from '../db/sql-models';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export interface IUserRecord {
  _id: string;
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  authType: string;
  isSuperAdmin: boolean;
  status: string;
  avatar?: string | null;
  preferences: any;
  historyUsedBytes: number;
  mustChangePassword?: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function sqlToRecord(u: SqlUser): IUserRecord {
  return {
    _id: u.id,
    id: u.id,
    name: u.name,
    email: u.email,
    passwordHash: u.passwordHash,
    authType: u.authType,
    isSuperAdmin: u.isSuperAdmin,
    status: u.status,
    avatar: u.avatar,
    preferences: typeof u.preferences === 'string' ? JSON.parse(u.preferences) : u.preferences,
    historyUsedBytes: Number(u.historyUsedBytes),
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function mongoToRecord(u: any): IUserRecord {
  return {
    _id: u._id.toString(),
    id: u._id.toString(),
    name: u.name,
    email: u.email,
    passwordHash: u.passwordHash,
    authType: u.authType,
    isSuperAdmin: u.isSuperAdmin,
    status: u.status,
    avatar: u.avatar,
    preferences: u.preferences,
    historyUsedBytes: u.historyUsedBytes,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export const UserRepository = {
  async findById(id: string): Promise<IUserRecord | null> {
    if (isMongo()) {
      const u = await User.findById(id).lean();
      return u ? mongoToRecord(u) : null;
    }
    const u = await SqlUser.findByPk(id);
    return u ? sqlToRecord(u) : null;
  },

  async findByEmail(email: string): Promise<IUserRecord | null> {
    if (isMongo()) {
      const u = await User.findOne({ email: email.toLowerCase() }).lean();
      return u ? mongoToRecord(u) : null;
    }
    const u = await SqlUser.findOne({ where: { email: email.toLowerCase() } });
    return u ? sqlToRecord(u) : null;
  },

  async create(data: {
    name: string;
    email: string;
    passwordHash?: string | null;
    authType?: string;
    isSuperAdmin?: boolean;
    status?: string;
    mustChangePassword?: boolean;
  }): Promise<IUserRecord> {
    if (isMongo()) {
      const u = await User.create({
        ...data,
        email: data.email.toLowerCase(),
        preferences: { saveHistory: true, historyIncludeResponseBody: true, historyIncludeResponseHeaders: true, historyClearOlderThanDays: 30 },
      });
      return mongoToRecord(u);
    }
    const u = await SqlUser.create({
      id: uuidv4(),
      ...data,
      email: data.email.toLowerCase(),
      preferences: JSON.stringify({ saveHistory: true, historyIncludeResponseBody: true, historyIncludeResponseHeaders: true, historyClearOlderThanDays: 30 }),
    });
    return sqlToRecord(u);
  },

  async update(id: string, data: Partial<IUserRecord & { passwordHash: string }>): Promise<IUserRecord | null> {
    if (isMongo()) {
      const u = await User.findByIdAndUpdate(id, data, { new: true }).lean();
      return u ? mongoToRecord(u) : null;
    }
    await SqlUser.update({
      ...data,
      preferences: data.preferences ? JSON.stringify(data.preferences) : undefined,
    }, { where: { id } });
    return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    if (isMongo()) {
      await User.findByIdAndDelete(id);
      return;
    }
    await SqlUser.destroy({ where: { id } });
  },

  async list(filter: Record<string, any> = {}): Promise<IUserRecord[]> {
    if (isMongo()) {
      const users = await User.find(filter).lean();
      return users.map(mongoToRecord);
    }
    const users = await SqlUser.findAll({ where: filter as any });
    return users.map(sqlToRecord);
  },

  async count(): Promise<number> {
    if (isMongo()) return User.countDocuments();
    return SqlUser.count();
  },

  async existsByEmail(email: string): Promise<boolean> {
    const u = await this.findByEmail(email);
    return !!u;
  },

  // Returns the raw Mongoose document (for routes that still need .save())
  async findRawMongoById(id: string): Promise<IUser | null> {
    if (!isMongo()) return null;
    return User.findById(id);
  },

  async findRawMongoByEmail(email: string): Promise<IUser | null> {
    if (!isMongo()) return null;
    return User.findOne({ email: email.toLowerCase() });
  },
};
