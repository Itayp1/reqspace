import { test, expect } from './fixtures';
import { apiAsAdmin } from './helpers';
import { startMockIdp, enableCustomProvider, disableCustomProvider, type MockIdp } from './mock-idp';

/**
 * End-to-end sign-in through the "custom" OAuth2/OIDC provider, against a mock identity provider
 * started by the test (see mock-idp.ts), which decides whether a sign-in is allowed.
 */
let idp: MockIdp;

test.beforeAll(async () => {
  idp = await startMockIdp();
  await enableCustomProvider(idp);
});

test.afterAll(async () => {
  await disableCustomProvider();
  await idp.close();
});

test.beforeEach(() => {
  idp.mode = 'allow';
  idp.tokenRequests.length = 0;
});

test.describe('Custom OAuth2 / OIDC provider (mock identity provider)', () => {
  test('the login page shows the configured label and the secret is never public', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('oauth-custom')).toContainText('Continue with Acme SSO');
    const pub = await (await page.request.get('/api/auth/config')).json();
    expect(pub.customOAuth).toMatchObject({ enabled: true, clientId: 'acme-client', name: 'Acme SSO' });
    expect(JSON.stringify(pub)).not.toContain('acme-secret');
  });

  test('a sign-in the provider allows creates the account and logs the user in', async ({ page }) => {
    const email = `oidc_${Date.now()}@example.com`;
    idp.userinfo = { email, name: 'Oidc Person', email_verified: true };

    await page.goto('/login');
    await page.getByTestId('oauth-custom').click();

    await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 20000 });
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.email).toBe(email);
    expect(me.name).toBe('Oidc Person');
    expect(me.authType).toBe('sso');

    // The server exchanged the code with the client credentials from the admin settings.
    expect(idp.tokenRequests).toHaveLength(1);
    expect(idp.tokenRequests[0].get('client_id')).toBe('acme-client');
    expect(idp.tokenRequests[0].get('client_secret')).toBe('acme-secret');
    expect(idp.tokenRequests[0].get('grant_type')).toBe('authorization_code');
  });

  test('a returning user is signed into the same account', async ({ page }) => {
    const email = `oidcagain${Date.now()}@example.com`;
    idp.userinfo = { email, name: 'Again', email_verified: true };
    for (let i = 0; i < 2; i++) {
      await page.context().clearCookies();
      await page.goto('/login');
      await page.getByTestId('oauth-custom').click();
      await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 20000 });
    }
    const admin = await apiAsAdmin();
    const users = await (await admin.get(`/api/admin/users?search=${encodeURIComponent(email)}`)).json();
    const items = Array.isArray(users) ? users : users.items ?? users.users ?? [];
    expect(items.filter((u: any) => u.email === email)).toHaveLength(1);
  });

  test('a sign-in the provider denies shows an error and does not log in', async ({ page }) => {
    idp.mode = 'deny';
    idp.userinfo = { email: `denied_${Date.now()}@example.com`, email_verified: true };

    await page.goto('/login');
    await page.getByTestId('oauth-custom').click();

    await expect(page.getByText('OAuth Error')).toBeVisible({ timeout: 15000 });
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
    expect(idp.tokenRequests).toHaveLength(0);
  });

  test('an email the provider reports as unverified is refused', async ({ page }) => {
    idp.userinfo = { email: `unverified_${Date.now()}@example.com`, email_verified: false };

    await page.goto('/login');
    await page.getByTestId('oauth-custom').click();

    await expect(page.getByText('OAuth Error')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Failed to sign in/)).toBeVisible();
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  });

  test('a provider that returns no email is refused', async ({ page }) => {
    idp.userinfo = { name: 'No Email' };

    await page.goto('/login');
    await page.getByTestId('oauth-custom').click();

    await expect(page.getByText('OAuth Error')).toBeVisible({ timeout: 15000 });
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  });

  test('the admin API rejects a non-http(s) provider URL', async () => {
    const admin = await apiAsAdmin();
    const res = await admin.put('/api/admin/config', { data: { auth: { customOAuth: { authorizeUrl: 'javascript:alert(1)' } } } });
    expect(res.status()).toBe(400);
  });
});
