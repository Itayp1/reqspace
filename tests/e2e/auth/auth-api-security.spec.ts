import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest } from '@playwright/test';
import { apiAsAdmin } from '../helpers';

// these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

test.describe('Auth API & Security Edge Cases', () => {
  test('API requests for config should 403/401 for unauthorized users', async ({ request }) => {
    // Attempt to fetch admin config without authentication
    const response = await request.get('/api/admin/config');
    expect(response.status()).toBe(401);
  });

  test('identity headers (x-user-id / x-user-email) do not authenticate', async ({ request }) => {
    const response = await request.get('/api/auth/me', {
      headers: {
        'x-user-id': 'mocked-sso-id',
        'x-user-email': 'sso@example.com'
      }
    });
    expect(response.status()).toBe(401);
  });

  test('the legacy X-Auth-User header no longer authenticates, and header mode is not a setting', async () => {
    const ctx = await pwRequest.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { 'X-Auth-User': 'header-user@example.com', 'X-Forwarded-For': '10.77.1.1' },
    });
    expect((await ctx.get('/api/auth/me')).status()).toBe(401);

    const admin = await apiAsAdmin();
    const res = await admin.put('/api/admin/config', { data: { auth: { mode: 'header', headerName: 'X-Auth-User' } } });
    expect(res.ok()).toBeTruthy();
    const cfg = await (await admin.get('/api/admin/config')).json();
    expect(cfg.auth.mode).toBeUndefined();
    expect((await ctx.get('/api/auth/me')).status()).toBe(401);
  });
});
