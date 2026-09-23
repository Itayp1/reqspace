import { isMongo } from '../db/connect';
import { SystemConfig, ISystemConfig } from '../models/SystemConfig';
import { SqlSystemConfig } from '../db/sql-models';

export interface ISystemConfigRecord {
  _id: string;
  id: string;
  auth: {
    mode: 'login' | 'header' | 'both';
    headerName: string;
    allowSelfRegistration: boolean;
    allowedEmailDomains: string[];
    jwtTtlDays: number;
    jwtRefreshHoursBeforeExpiry: number;
    googleOAuth?: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
    };
    smtp?: {
      enabled: boolean;
      host: string;
      port: number;
      user: string;
      pass: string;
      fromAddress: string;
    };
  };
  history: {
    maxRequestBodyKB: number;
    maxTotalPerUserMB: number;
    cleanupPolicy: 'fifo';
  };
  proxy: {
    enabled: boolean;
    url: string;
    username?: string;
    password?: string;
  };
}

function sqlToRecord(c: SqlSystemConfig): ISystemConfigRecord {
  return {
    _id: c.id,
    id: c.id,
    auth: JSON.parse(c.auth),
    history: JSON.parse(c.history),
    proxy: JSON.parse(c.proxy),
  };
}

function mongoToRecord(c: any): ISystemConfigRecord {
  return {
    _id: c._id.toString(),
    id: c._id.toString(),
    auth: c.auth,
    history: c.history,
    proxy: c.proxy,
  };
}

const DEFAULT_CONFIG = {
  auth: {
    mode: 'login' as const,
    headerName: 'X-Auth-User',
    allowSelfRegistration: true,
    allowedEmailDomains: [] as string[],
    jwtTtlDays: 7,
    jwtRefreshHoursBeforeExpiry: 24,
    googleOAuth: {
      enabled: false,
      clientId: '',
      clientSecret: '',
    }
  },
  history: {
    maxRequestBodyKB: 5120,
    maxTotalPerUserMB: 100,
    cleanupPolicy: 'fifo' as const,
  },
  proxy: {
    enabled: false,
    url: '',
    username: '',
    password: '',
  }
};

export const SystemConfigRepository = {
  async getConfig(): Promise<ISystemConfigRecord | null> {
    if (isMongo()) {
      const c = await SystemConfig.findOne().lean();
      return c ? mongoToRecord(c) : null;
    }
    const c = await SqlSystemConfig.findOne();
    return c ? sqlToRecord(c) : null;
  },

  async ensure(): Promise<ISystemConfigRecord> {
    const existing = await this.getConfig();
    if (existing) return existing;
    
    if (isMongo()) {
      const c = await SystemConfig.create({
        _id: 'global',
        ...DEFAULT_CONFIG
      });
      return mongoToRecord(c);
    }
    
    const c = await SqlSystemConfig.create({
      id: 'global',
      auth: JSON.stringify(DEFAULT_CONFIG.auth),
      history: JSON.stringify(DEFAULT_CONFIG.history),
      proxy: JSON.stringify(DEFAULT_CONFIG.proxy),
    });
    return sqlToRecord(c);
  },

  async updateConfig(data: any): Promise<ISystemConfigRecord | null> {
    // Merge rather than replace: a caller that PUTs only { auth: { mode: 'both' } }
    // must not silently wipe out unrelated fields like allowSelfRegistration.
    const current = await this.getConfig();
    if (!current) return null;

    const merged = {
      auth: {
        ...current.auth,
        ...(data.auth || {}),
        googleOAuth: { ...current.auth.googleOAuth, ...(data.auth?.googleOAuth || {}) },
        smtp: { ...current.auth.smtp, ...(data.auth?.smtp || {}) },
      },
      history: { ...current.history, ...(data.history || {}) },
      proxy: { ...current.proxy, ...(data.proxy || {}) },
    };

    if (isMongo()) {
      const c = await SystemConfig.findOneAndUpdate({}, { $set: merged }, { new: true, upsert: true }).lean();
      return c ? mongoToRecord(c) : null;
    }

    const existing = await SqlSystemConfig.findOne();
    if (!existing) return null;

    existing.auth = JSON.stringify(merged.auth);
    existing.history = JSON.stringify(merged.history);
    existing.proxy = JSON.stringify(merged.proxy);

    await existing.save();
    return this.getConfig();
  },
};
