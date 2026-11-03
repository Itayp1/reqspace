import { updateConfigSchema } from '../schemas/admin.schemas';

// AdminPage.saveConfig PUTs the whole config document (minus id/timestamps).
// validate() re-parses that body with .strict(). Nested keys missing from the
// schema are stripped, so the handler merges a partial document and the
// settings form's SMTP, Google OAuth, and proxy credential edits never persist.
const uiPayload = {
  auth: {
    mode: 'login' as const,
    headerName: 'X-Auth-User',
    allowSelfRegistration: true,
    allowedEmailDomains: [] as string[],
    jwtTtlDays: 7,
    jwtRefreshHoursBeforeExpiry: 24,
    googleOAuth: { enabled: true, clientId: 'cid', clientSecret: 'csecret' },
    smtp: {
      enabled: true,
      host: 'smtp.example.com',
      port: 587,
      user: 'mailer',
      pass: 'secret',
      fromAddress: 'noreply@example.com',
    },
  },
  history: { maxRequestBodyKB: 5120, maxTotalPerUserMB: 25, cleanupPolicy: 'fifo' as const },
  proxy: {
    enabled: true,
    url: 'http://proxy.example.com:8080',
    username: 'proxyuser',
    password: 'proxypass',
    allowPrivateTargets: false,
  },
};

describe('updateConfigSchema', () => {
  it('keeps the admin settings payload the UI saves', () => {
    const parsed = updateConfigSchema.strict().safeParse(uiPayload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.auth?.smtp).toEqual(uiPayload.auth.smtp);
    expect(parsed.data.auth?.googleOAuth).toEqual(uiPayload.auth.googleOAuth);
    expect(parsed.data.auth?.allowedEmailDomains).toEqual([]);
    expect(parsed.data.history).toEqual(uiPayload.history);
    expect(parsed.data.proxy).toEqual(uiPayload.proxy);
  });

  it('still accepts a partial auth update', () => {
    const parsed = updateConfigSchema.strict().safeParse({ auth: { allowSelfRegistration: true } });
    expect(parsed.success).toBe(true);
  });
});
