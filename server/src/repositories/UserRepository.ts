import { decodeCursor, encodeCursor, getCursorWhere } from '../utils/pagination';
import { SqlUser } from '../db/sql-models';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { escapeLike, MAX_SEARCH_LENGTH } from '../utils/escapeLike';

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

export const UserRepository = {
  async findById(id: string): Promise<IUserRecord | null> {
    const u = await SqlUser.findByPk(id);
    return u ? sqlToRecord(u) : null;
  },

  async findByEmail(email: string): Promise<IUserRecord | null> {
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
    await SqlUser.update({
      ...data,
      settings: data.settings ? JSON.stringify(data.settings) : undefined,
        clientCertificates: data.clientCertificates ? JSON.stringify(data.clientCertificates) : undefined,
    }, { where: { id } });
    return this.findById(id);
  },

  async delete(id: string): Promise<void> {
    await SqlUser.destroy({ where: { id } });
  },

  async list(filter: Record<string, any> = {}, options?: { limit?: number, cursor?: string }): Promise<{ items: IUserRecord[], nextCursor: string | null }> {
    const limit = (options && options.limit && options.limit <= 200) ? options.limit : 200;
    const cursorObj = decodeCursor(options?.cursor);
    const cursorWhere = getCursorWhere(cursorObj, 'createdAt', true); // DESC
    
    const users = await SqlUser.findAll({ 
      where: { ...filter, ...cursorWhere } as any,
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: limit + 1
    });

    let nextCursor = null;
    if (users.length > limit) {
      users.pop();
      const lastItem = users[users.length - 1];
      nextCursor = encodeCursor(lastItem.createdAt, lastItem.id);
    }

    return { items: users.map(sqlToRecord), nextCursor };
  },

  async count(): Promise<number> {
    return SqlUser.count();
  },

  async existsByEmail(email: string): Promise<boolean> {
    const u = await this.findByEmail(email);
    return !!u;
  },

  async search(query: string): Promise<Pick<IUserRecord, '_id' | 'name' | 'email' | 'avatar'>[]> {
    const { Op } = require('sequelize');
    // Escaped here as well as at the route, so a second caller cannot skip it.
    const term = escapeLike(String(query).slice(0, MAX_SEARCH_LENGTH));
    if (!term) return [];
    const users = await SqlUser.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.like]: `${term}%` } },
          { email: { [Op.like]: `${term}%` } }
        ]
      },
      limit: 10,
      attributes: ['id', 'name', 'email', 'avatar']
    });
    return users.map(u => ({
      _id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar
    }));
  }
};
