import { SqlSystemConfig } from '../db/sql-models';
import { systemConfigCache } from '../utils/cache';
import { OAUTH_PROVIDERS, configKey, OAuthProviderConfig } from '../utils/oauthProviders';

export interface ISystemConfigRecord {
  _id: string;
  id: string;
  auth: {
    allowSelfRegistration: boolean;
    allowedEmailDomains: string[];
    jwtTtlDays: number;
    jwtRefreshHoursBeforeExpiry: number;
    googleOAuth?: OAuthProviderConfig;
    githubOAuth?: OAuthProviderConfig;
    microsoftOAuth?: OAuthProviderConfig;
    customOAuth?: OAuthProviderConfig;
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
    /** Per-user cap on stored entries; 0 or absent = unlimited. */
    maxRecords?: number;
    /** Entries older than this many days are purged; 0 or absent = keep forever. */
    retentionDays?: number;
    cleanupPolicy: 'fifo';
  };
  proxy: {
    enabled: boolean;
    url: string;
    username?: string;
    password?: string;
    allowPrivateTargets?: boolean;
  };
}

// Header (X-Auth-User) authentication was removed. Stored configs may still carry
// its fields; drop them so they are never written back.
function normalizeAuth(auth: any) {
  const { mode: _mode, headerName: _headerName, ...rest } = auth || {};
  return rest;
}

function sqlToRecord(c: SqlSystemConfig): ISystemConfigRecord {
  return {
    _id: c.id,
    id: c.id,
    auth: normalizeAuth(JSON.parse(c.auth)),
    history: JSON.parse(c.history),
    proxy: JSON.parse(c.proxy),
  };
}

const DEFAULT_CONFIG = {
  auth: {
    // Default closed: a fresh deployment should not be open to public signup
    // until an admin explicitly enables it (CR#24).
    allowSelfRegistration: true,
    allowedEmailDomains: [] as string[],
    jwtTtlDays: 7,
    jwtRefreshHoursBeforeExpiry: 24,
    googleOAuth: { enabled: false, clientId: '', clientSecret: '' },
    githubOAuth: { enabled: false, clientId: '', clientSecret: '' },
    microsoftOAuth: { enabled: false, clientId: '', clientSecret: '', tenantId: 'common' },
    customOAuth: { enabled: false, clientId: '', clientSecret: '', name: 'SSO', authorizeUrl: '', tokenUrl: '', userinfoUrl: '', scope: 'openid email profile' },
  },
  history: {
    maxRequestBodyKB: 1024,
    maxTotalPerUserMB: 100,
    cleanupPolicy: 'fifo' as const,
  },
  proxy: {
    enabled: false,
    url: '',
    username: '',
    password: '',
    allowPrivateTargets: false,
  }
};

export const SystemConfigRepository = {
  async getConfig(): Promise<ISystemConfigRecord | null> {
    const cached = systemConfigCache.get('global');
    if (cached) return cached;
    const c = await SqlSystemConfig.findOne();
    if (!c) return null;
    const record = sqlToRecord(c);

    // Deployments can supply provider credentials via env instead of the admin UI:
    // <PROVIDER>_CLIENT_ID / _CLIENT_SECRET / _OAUTH_ENABLED (+ MICROSOFT_TENANT_ID, and for the custom provider CUSTOM_NAME / _AUTHORIZE_URL / _TOKEN_URL /
    // _USERINFO_URL / _SCOPE).
    for (const id of OAUTH_PROVIDERS) {
      const prefix = id.toUpperCase();
      const clientId = process.env[`${prefix}_CLIENT_ID`];
      const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
      if (!clientId && !clientSecret) continue;
      const key = configKey(id);
      const cfg = (record.auth[key] = record.auth[key] || { enabled: false, clientId: '', clientSecret: '' });
      if (clientId) cfg.clientId = clientId;
      if (clientSecret) cfg.clientSecret = clientSecret;
      if (id === 'microsoft' && process.env.MICROSOFT_TENANT_ID) cfg.tenantId = process.env.MICROSOFT_TENANT_ID;
      if (id === 'custom') {
        if (process.env.CUSTOM_NAME) cfg.name = process.env.CUSTOM_NAME;
        if (process.env.CUSTOM_AUTHORIZE_URL) cfg.authorizeUrl = process.env.CUSTOM_AUTHORIZE_URL;
        if (process.env.CUSTOM_TOKEN_URL) cfg.tokenUrl = process.env.CUSTOM_TOKEN_URL;
        if (process.env.CUSTOM_USERINFO_URL) cfg.userinfoUrl = process.env.CUSTOM_USERINFO_URL;
        if (process.env.CUSTOM_SCOPE) cfg.scope = process.env.CUSTOM_SCOPE;
      }
      const flag = process.env[`${prefix}_OAUTH_ENABLED`];
      cfg.enabled = flag !== undefined ? flag === 'true' : true;
    }

    systemConfigCache.set('global', record);
    return record;
  },

  async ensure(): Promise<ISystemConfigRecord> {
    const existing = await this.getConfig();
    if (existing) return existing;
    
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
        githubOAuth: { ...current.auth.githubOAuth, ...(data.auth?.githubOAuth || {}) },
        microsoftOAuth: { ...current.auth.microsoftOAuth, ...(data.auth?.microsoftOAuth || {}) },
        customOAuth: { ...current.auth.customOAuth, ...(data.auth?.customOAuth || {}) },
        smtp: { ...current.auth.smtp, ...(data.auth?.smtp || {}) },
      },
      history: { ...current.history, ...(data.history || {}) },
      proxy: { ...current.proxy, ...(data.proxy || {}) },
    };

    const existing = await SqlSystemConfig.findOne();
    if (!existing) return null;

    existing.auth = JSON.stringify(merged.auth);
    existing.history = JSON.stringify(merged.history);
    existing.proxy = JSON.stringify(merged.proxy);

    await existing.save();
    systemConfigCache.delete('global');
    return this.getConfig();
  },
};
