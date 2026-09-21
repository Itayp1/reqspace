import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemConfig extends Document<string> {
  _id: string; // 'global'
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

const SystemConfigSchema = new Schema<ISystemConfig>({
  _id: { type: String, default: 'global' },
  auth: {
    mode: { type: String, enum: ['login', 'header', 'both'], default: 'login' },
    headerName: { type: String, default: 'X-Auth-User' },
    allowSelfRegistration: { type: Boolean, default: true },
    allowedEmailDomains: { type: [String], default: [] },
    jwtTtlDays: { type: Number, default: 7 },
    jwtRefreshHoursBeforeExpiry: { type: Number, default: 24 },
    googleOAuth: {
      enabled: { type: Boolean, default: false },
      clientId: { type: String, default: '' },
      clientSecret: { type: String, default: '' }
    }
  },
  history: {
    maxRequestBodyKB: { type: Number, default: 5120 }, // 5MB
    maxTotalPerUserMB: { type: Number, default: 100 },
    cleanupPolicy: { type: String, enum: ['fifo'], default: 'fifo' },
  },
  proxy: {
    enabled: { type: Boolean, default: false },
    url: { type: String, default: '' },
    username: { type: String, default: '' },
    password: { type: String, default: '' },
  },
});

export const SystemConfig = mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);

export async function ensureSystemConfig() {
  const count = await SystemConfig.countDocuments();
  if (count === 0) {
    await SystemConfig.create({
      _id: 'global',
      auth: {
        mode: 'login',
        headerName: 'X-Auth-User',
        allowSelfRegistration: true,
        allowedEmailDomains: [],
        jwtTtlDays: 7,
        jwtRefreshHoursBeforeExpiry: 24,
      },
      history: {
        maxRequestBodyKB: 5120,
        maxTotalPerUserMB: 100,
        cleanupPolicy: 'fifo',
      },
      proxy: {
        enabled: false,
        url: '',
        username: '',
        password: '',
      }
    });
  }
}
