import { Op } from 'sequelize';
import { isMongo } from '../db/connect';
import { escapeRegex } from '../utils/escapeRegex';
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
  settings: any;
  clientCertificates: any[];
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
    settings: typeof u.settings === 'string' ? JSON.parse(u.settings) : u.settings,
      clientCertificates: typeof u.clientCertificates === 'string' ? JSON.parse(u.clientCertificates) : (u.clientCertificates || []),
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
    settings: u.settings,
      clientCertificates: u.clientCertificates || [],
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
        settings: { followRedirects: true, verifySsl: true, sendNoCacheHeader: false, encodeUrl: true, timeout: 0, proxyEnabled: false, proxyUrl: 'http://127.0.0.1:8080', proxyAuthEnabled: false, proxyUsername: '', proxyPassword: '', saveHistory: true, shortcuts: { search: 'ctrl+k', save: 'ctrl+s', send: 'ctrl+enter' } },
        clientCertificates: [],
      });
      return mongoToRecord(u);
    }
    const u = await SqlUser.create({
      id: uuidv4(),
      ...data,
      email: data.email.toLowerCase(),
      settings: JSON.stringify({ followRedirects: true, verifySsl: true, sendNoCacheHeader: false, encodeUrl: true, timeout: 0, proxyEnabled: false, proxyUrl: 'http://127.0.0.1:8080', proxyAuthEnabled: false, proxyUsername: '', proxyPassword: '', saveHistory: true, shortcuts: { search: 'ctrl+k', save: 'ctrl+s', send: 'ctrl+enter' } }),
        clientCertificates: '[]',
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
      settings: data.settings ? JSON.stringify(data.settings) : undefined,
        clientCertificates: data.clientCertificates ? JSON.stringify(data.clientCertificates) : undefined,
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

  async search(opts: { search?: string; status?: string; limit: number; skip: number }): Promise<{ users: IUserRecord[]; total: number }> {
    const limit = opts.limit;
    const skip = opts.skip;
    if (isMongo()) {
      const query: Record<string, unknown> = {};
      if (opts.status) query.status = opts.status;
      if (opts.search) {
        const safe = escapeRegex(opts.search);
        query.$or = [
          { name: { $regex: safe, $options: 'i' } },
          { email: { $regex: safe, $options: 'i' } },
        ];
      }
      const [users, total] = await Promise.all([
        User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        User.countDocuments(query),
      ]);
      return { users: users.map(mongoToRecord), total };
    }
    const where: any = {};
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      const like = `%${opts.search.replace(/[%_]/g, '')}%`;
      where[Op.or] = [
        { name: { [Op.like]: like } },
        { email: { [Op.like]: like } },
      ];
    }
    const total = await SqlUser.count({ where: where as any });
    const users = await SqlUser.findAll({
      where: where as any,
      order: [['createdAt', 'DESC']],
      limit,
      offset: skip,
    });
    return { users: users.map(sqlToRecord), total };
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
