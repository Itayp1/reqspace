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

  async list(filter: Record<string, any> = {}): Promise<IUserRecord[]> {
    const users = await SqlUser.findAll({ where: filter as any });
    return users.map(sqlToRecord);
  },

  async count(): Promise<number> {
    return SqlUser.count();
  },

  async existsByEmail(email: string): Promise<boolean> {
    const u = await this.findByEmail(email);
    return !!u;
  }
};
