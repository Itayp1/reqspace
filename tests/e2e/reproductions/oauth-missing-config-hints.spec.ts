import { test, expect } from '../fixtures';
import { apiAsAdmin, loginAdminUi } from '../helpers';

/**
 * OAUTH3: an OAuth provider with missing settings (or a callback URL the server refuses) gave no hint
 * anywhere - the button just vanished or sign-in failed with a generic message.
 */
test.describe('OAuth missing-configuration hints', () => {
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

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
