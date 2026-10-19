import { test, expect } from './fixtures';
import { request as pwRequest } from '@playwright/test';
import { API_URL } from './fixtures';
import { apiAsAdmin } from './helpers';

// these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

// Isolated source address so the login limiter budget of other specs is untouched.
let seq = 0;
const anon = () =>
  pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': `10.77.${Math.floor(Math.random() * 250)}.${(seq++ % 250) + 1}` } });

test.describe('OAuth providers (GitHub, Microsoft) and removal of header auth', () => {
  test('admin can store GitHub and Microsoft config; secrets are masked and public config hides them', async () => {
    const admin = await apiAsAdmin();
    const put = await admin.put('/api/admin/config', {
      data: {
        auth: {
          githubOAuth: { enabled: true, clientId: 'gh-client', clientSecret: 'gh-secret' },
          microsoftOAuth: { enabled: true, clientId: 'ms-client', clientSecret: 'ms-secret', tenantId: 'contoso.onmicrosoft.com' },
        },
      },
    });
    expect(put.ok()).toBeTruthy();

    const cfg = await (await admin.get('/api/admin/config')).json();
    expect(cfg.auth.githubOAuth.clientId).toBe('gh-client');
    expect(cfg.auth.githubOAuth.clientSecret).not.toBe('gh-secret');
    expect(cfg.auth.microsoftOAuth.tenantId).toBe('contoso.onmicrosoft.com');
    expect(cfg.auth.microsoftOAuth.clientSecret).not.toBe('ms-secret');
    expect(cfg.auth.headerName).toBeUndefined();
    expect(cfg.auth.mode).toBeUndefined();

    const pub = await (await (await anon()).get('/api/auth/config')).json();
    expect(pub.githubOAuth).toEqual({ enabled: true, clientId: 'gh-client' });
    expect(pub.microsoftOAuth).toEqual({ enabled: true, clientId: 'ms-client', tenantId: 'contoso.onmicrosoft.com' });
    expect(JSON.stringify(pub)).not.toContain('secret');

    // Leave the shared server as we found it.
    await admin.put('/api/admin/config', {
      data: { auth: { githubOAuth: { enabled: false }, microsoftOAuth: { enabled: false } } },
    });
  });

  test('sign-in page offers each enabled provider and redirects to its authorize endpoint', async ({ page }) => {
    await page.route('**/api/auth/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          githubOAuth: { enabled: true, clientId: 'gh-client' },
          microsoftOAuth: { enabled: true, clientId: 'ms-client', tenantId: 'my-tenant' },
        }),
      }),
    );
    await page.route('**/api/auth/state', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'a'.repeat(64) }) }),
    );
    await page.route('https://github.com/**', (route) => route.fulfill({ status: 200, body: 'GitHub mock' }));
    await page.route('https://login.microsoftonline.com/**', (route) => route.fulfill({ status: 200, body: 'Microsoft mock' }));

    await page.goto('/login');
    await expect(page.getByTestId('oauth-google')).toHaveCount(0);

    await page.getByTestId('oauth-microsoft').click();
    await expect(page).toHaveURL(/login\.microsoftonline\.com\/my-tenant\/oauth2\/v2\.0\/authorize\?.*client_id=ms-client/);

    await page.goto('/login');
    await page.getByTestId('oauth-github').click();
    await expect(page).toHaveURL(/github\.com\/login\/oauth\/authorize\?.*client_id=gh-client/);
  });

  for (const provider of ['github', 'microsoft']) {
    test(`POST /api/auth/${provider} rejects a missing/invalid CSRF state`, async () => {
      const ctx = await anon();
      const res = await ctx.post(`/api/auth/${provider}`, {
        data: { code: 'abc', redirectUri: `http://localhost:5173/auth/${provider}/callback`, state: 'b'.repeat(64) },
      });
      expect(res.status()).toBe(403);
    });
  }

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
