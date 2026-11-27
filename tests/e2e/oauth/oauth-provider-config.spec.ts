import { expandAdminSections, test, expect, API_URL } from '../fixtures';
import { request as pwRequest } from '@playwright/test';
import { apiAsAdmin, loginAdminUi } from '../helpers';

// these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

// Isolated source address so the login limiter budget of other specs is untouched.
let seq = 0;
const anon = () =>
  pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': `10.77.${Math.floor(Math.random() * 250)}.${(seq++ % 250) + 1}` } });

test.describe('OAuth providers (GitHub, Microsoft) config', () => {
  test('admin can store GitHub and Microsoft config; secrets are masked and public config hides them', async () => {
    const admin = await apiAsAdmin();
    try {
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
    } finally {
      // Leave the shared server as we found it.
      await admin.put('/api/admin/config', {
        data: { auth: { githubOAuth: { enabled: false }, microsoftOAuth: { enabled: false } } },
      });
    }
  });

  test('optional per-provider proxy URL is stored, validated, and not exposed publicly', async () => {
    const admin = await apiAsAdmin();
    try {
      const bad = await admin.put('/api/admin/config', { data: { auth: { githubOAuth: { proxyUrl: 'not a url' } } } });
      expect(bad.status()).toBe(400);

      const put = await admin.put('/api/admin/config', { data: { auth: { githubOAuth: { enabled: true, clientId: 'gh-client', proxyUrl: 'http://proxy.local:8080' } } } });
      expect(put.ok()).toBeTruthy();
      const cfg = await (await admin.get('/api/admin/config')).json();
      expect(cfg.auth.githubOAuth.proxyUrl).toBe('http://proxy.local:8080');
      const pub = await (await (await anon()).get('/api/auth/config')).json();
      expect(JSON.stringify(pub)).not.toContain('proxy.local');
    } finally {
      await admin.put('/api/admin/config', { data: { auth: { githubOAuth: { enabled: false, proxyUrl: '' } } } });
    }
  });
});

/**
 * OAUTH3: an OAuth provider with missing settings (or a callback URL the server refuses) gave no hint
 * anywhere - the button just vanished or sign-in failed with a generic message.
 */
test.describe('OAuth missing-configuration hints', () => {
  test.afterEach(async () => {
    const admin = await apiAsAdmin();
    await admin.put('/api/admin/config', { data: { auth: { githubOAuth: { enabled: false, clientId: '', clientSecret: '' } } } });
  });

  test('the admin screen lists what is missing for an enabled provider', async ({ page }) => {
    const admin = await apiAsAdmin();
    await admin.put('/api/admin/config', { data: { auth: { githubOAuth: { enabled: true, clientId: 'gh-id', clientSecret: '' } } } });
    await loginAdminUi(page);
    await page.goto('/admin');
    await page.getByTestId('admin-tab-settings').click().catch(() => {});
    await expandAdminSections(page);
    const hint = page.getByTestId('admin-github-missing');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Client Secret');
    await expect(hint).not.toContainText('Client ID');
  });

  test('signing in with a half-configured provider tells the user what the administrator must set', async () => {
    const admin = await apiAsAdmin();
    await admin.put('/api/admin/config', { data: { auth: { githubOAuth: { enabled: true, clientId: 'gh-id', clientSecret: '' } } } });
    const anon = await (await import('@playwright/test')).request.newContext({ baseURL: process.env.REQSPACE_API_URL });
    const { state } = await (await anon.get('/api/auth/state')).json();
    const res = await anon.post('/api/auth/github', { data: { code: 'x', state, redirectUri: `${process.env.REQSPACE_WEB_URL}/auth/github/callback` } });
    const body = await res.json();
    expect(body.message).toContain('Client Secret');
    await anon.dispose();
  });
});
