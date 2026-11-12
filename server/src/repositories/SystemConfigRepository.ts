import { SqlSystemConfig } from '../db/sql-models';
import { systemConfigCache } from '../utils/cache';
import { OAuthProviderConfig } from '../utils/oauthProviders';
import { seal, open, isEncrypted } from '../utils/cryptoBox';

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
  server: IServerSettings;
}

/**
 * Runtime settings the admin edits on the Settings screen. Only the database
 * connection, REDIS_URL and the admin password stay in the environment.
 */
export interface IServerSettings {
  /** 'auto' = secure cookies in production only. */
  cookieSecure: 'auto' | 'on' | 'off';
  rateLimit: {
    enabled: boolean;
    loginMax: number;
    registerMax: number;
    /** Writes per minute per IP. */
    mutationMax: number;
    /** Reads per minute per IP. */
    readMax: number;
    /** Shared-link fetches per 15 min per IP. */
    shareMax: number;
    /** Client error reports per minute per IP. */
    errorReportMax: number;
  };
  /** Identical errors inside this window are counted on one row; 0 records every occurrence. */
  errorDedupeMs: number;
  /** Extra OAuth redirect URIs (all providers); empty = the local dev / desktop defaults. */
  oauthAllowedRedirectUris: string[];
  /** Extra browser origins allowed by CORS / the CSRF origin check. Ignored in production (same-origin only). */
  allowedOrigins: string[];
  /** Express "trust proxy": '' or 'false' = off, a hop count ('1'), or a comma-separated CIDR/IP list. */
  trustProxy: string;
  /** Record 401/403 responses (other than login/me/logout) in the error log. */
  captureAuthFailures: boolean;
}

const DEFAULT_SERVER_SETTINGS: IServerSettings = {
  cookieSecure: 'auto',
  rateLimit: {
    enabled: true,
    loginMax: process.env.NODE_ENV === 'test' ? 1000 : 15,
    registerMax: process.env.NODE_ENV === 'test' ? 1000 : 10,
    mutationMax: 300,
    readMax: 2000,
    shareMax: 100,
    errorReportMax: 30,
  },
  errorDedupeMs: 60_000,
  oauthAllowedRedirectUris: [],
  allowedOrigins: [],
  trustProxy: '',
  captureAuthFailures: true,
};

function normalizeServer(raw: any): IServerSettings {
  const s = raw || {};
  return {
    ...DEFAULT_SERVER_SETTINGS,
    ...s,
    rateLimit: { ...DEFAULT_SERVER_SETTINGS.rateLimit, ...(s.rateLimit || {}) },
  };
}

// Synchronous view for hot paths (cookie options, rate limiters, error dedupe)
// that cannot await. Refreshed whenever the config is loaded or saved, and in
// the background when older than the cache TTL so other replicas' edits arrive.
let serverSnapshot: IServerSettings = normalizeServer(null);
let serverSnapshotAt = 0;
const SNAPSHOT_TTL_MS = 30_000;

function setSnapshot(server: IServerSettings) {
  serverSnapshot = server;
  serverSnapshotAt = Date.now();
}

/** Current server settings; never throws and never waits on the database. */
export function getServerSettings(): IServerSettings {
  if (Date.now() - serverSnapshotAt > SNAPSHOT_TTL_MS) {
    serverSnapshotAt = Date.now(); // one refresh in flight at a time
    systemConfigCache.delete('global');
    SystemConfigRepository.getConfig().catch(() => { /* keep the last snapshot */ });
  }
  return serverSnapshot;
}

// Header (X-Auth-User) authentication was removed. Stored configs may still carry
// its fields; drop them so they are never written back.
function normalizeAuth(auth: any) {
  const { mode: _mode, headerName: _headerName, ...rest } = auth || {};
  return rest;
}

// Credentials stored in the settings are sealed with CERT_ENCRYPTION_KEY (AES-256-GCM),
// so a database dump or backup does not expose them. Plaintext values written by
// older versions still read fine (open() passes them through) and are sealed on the
// next save / by migration 020.
const OAUTH_KEYS = ['googleOAuth', 'githubOAuth', 'microsoftOAuth', 'customOAuth'] as const;

function mapSecrets(auth: any, proxy: any, fn: (v: string) => string) {
  const apply = (obj: any, field: string) => {
    if (obj && typeof obj[field] === 'string' && obj[field]) obj[field] = fn(obj[field]);
  };
  for (const key of OAUTH_KEYS) apply(auth?.[key], 'clientSecret');
  apply(auth?.smtp, 'pass');
  apply(proxy, 'password');
}

/** Seals a secret; without a usable key it is stored as-is outside production. */
export function sealSecret(value: string): string {
  if (isEncrypted(value)) return value;
  try {
    return seal(value);
  } catch (e) {
    if (process.env.NODE_ENV === 'production') throw e;
    return value;
  }
}

export function sealConfigSecrets(auth: any, proxy: any) {
  mapSecrets(auth, proxy, sealSecret);
}

function sqlToRecord(c: SqlSystemConfig): ISystemConfigRecord {
  const auth = normalizeAuth(JSON.parse(c.auth));
  const proxy = JSON.parse(c.proxy);
  mapSecrets(auth, proxy, (v) => {
    try {
      return open(v);
    } catch (e) {
      // Wrong/missing CERT_ENCRYPTION_KEY: treat the secret as unset rather than failing every request.
      console.error('Could not decrypt a stored settings secret; re-enter it in Admin > Settings.', (e as Error).message);
      return '';
    }
  });
  return {
    _id: c.id,
    id: c.id,
    auth,
    history: JSON.parse(c.history),
    proxy,
    server: normalizeServer(c.server ? JSON.parse(c.server) : null),
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
    setSnapshot(record.server);
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
      server: JSON.stringify(DEFAULT_SERVER_SETTINGS),
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
      server: {
        ...current.server,
        ...(data.server || {}),
        rateLimit: { ...current.server.rateLimit, ...(data.server?.rateLimit || {}) },
      },
    };

    const existing = await SqlSystemConfig.findOne();
    if (!existing) return null;

    sealConfigSecrets(merged.auth, merged.proxy);
    existing.auth = JSON.stringify(merged.auth);
    existing.history = JSON.stringify(merged.history);
    existing.proxy = JSON.stringify(merged.proxy);
    existing.server = JSON.stringify(merged.server);

    await existing.save();
    systemConfigCache.delete('global');
    return this.getConfig();
  },
};
