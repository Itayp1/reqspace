import { test, expect } from '../fixtures';
import { apiAsAdmin, expectWorkspaceListed } from '../helpers';
import { startMockIdp, enableCustomProvider, disableCustomProvider, type MockIdp } from '../mock-idp';

/**
 * End-to-end sign-in through the "custom" OAuth2/OIDC provider, against a mock identity provider
 * started by the test (see mock-idp.ts), which decides whether a sign-in is allowed.
 * One shared idp for the whole file; allowFpErrors is scoped to the describes that need it.
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

/**
 * OAUTH1: starting a second sign-in (second click, second tab) overwrote the single oauth_state
 * cookie, so finishing the FIRST sign-in failed with "Invalid or expired OAuth state".
 */
test.describe('OAuth state is per sign-in attempt', () => {
  test('two sign-ins started in the same browser can both complete', async ({ page }) => {
    idp.mode = 'allow';
    idp.userinfo = { email: `oauth_state_${Date.now()}@example.com`, name: 'State', email_verified: true };

    const first = await (await page.request.get('/api/auth/state')).json();
    const second = await (await page.request.get('/api/auth/state')).json();
    expect(first.state).not.toBe(second.state);

    const redirectUri = `${new URL(page.url() === 'about:blank' ? (process.env.REQSPACE_WEB_URL as string) : page.url()).origin}/auth/custom/callback`;
    const a = await page.request.post('/api/auth/custom', { data: { code: 'good-code', state: first.state, redirectUri } });
    expect(a.status(), await a.text()).toBe(200);
    const b = await page.request.post('/api/auth/custom', { data: { code: 'good-code', state: second.state, redirectUri } });
    expect(b.status(), await b.text()).toBe(200);
  });

  test('the state endpoint is not cacheable', async ({ page }) => {
    const res = await page.request.get('/api/auth/state');
    expect(res.headers()['cache-control']).toContain('no-store');
  });
});

/** First SSO sign-in creates the user's own personal workspace; signing out and in again returns to it. */
test('first SSO login gets a personal workspace, kept after re-login', async ({ page }) => {
  idp.mode = 'allow';
  idp.userinfo = { email: `sso_pw_${Date.now()}@example.com`, name: 'Sso Personal', email_verified: true };

  await page.goto('/login');
  await page.getByTestId('oauth-custom').click();
  await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 20000 });

  const list = await (await page.request.get('/api/workspaces')).json();
  const personal = list.filter((w: any) => w.isPersonal);
  expect(personal).toHaveLength(1);
  expect(personal[0].name).toBe("Sso Personal's Workspace");
  await expectWorkspaceListed(page, "Sso Personal's Workspace");

  await page.request.post('/api/auth/logout');
  await page.goto('/login');
  await page.getByTestId('oauth-custom').click();
  await expectWorkspaceListed(page, "Sso Personal's Workspace");
  const again = await (await page.request.get('/api/workspaces')).json();
  expect(again.filter((w: any) => w.isPersonal)).toHaveLength(1);
});

/**
 * After an SSO sign-in the workspace list was never fetched (password login reloads the page to
 * get it), so Workspace Settings had no active workspace and showed "Loading details…" forever.
 */
test('Workspace Settings opens after a custom SSO sign-in', async ({ page }) => {
  idp.mode = 'allow';
  idp.userinfo = { email: `sso_ws_${Date.now()}@example.com`, name: 'Sso Ws', email_verified: true };

  await page.goto('/login');
  await page.getByTestId('oauth-custom').click();
  await page.getByTestId('workspace-settings-btn').click();
  await expect(page.getByRole('dialog', { name: 'Workspace Settings' })).toBeVisible();
  await expect(page.getByText('Loading details…')).toBeHidden({ timeout: 5000 });
});

test.describe('Custom OAuth2 / OIDC provider (mock identity provider)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test.beforeEach(() => {
    idp.mode = 'allow';
    idp.tokenRequests.length = 0;
  });

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
});

/**
 * With self registration off, a user the custom SSO provider vouches for is still created on first
 * sign-in, while open (password) registration stays closed.
 */
test.describe('custom SSO with self registration off', () => {
  // the register call is refused on purpose; the app records it in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test.afterAll(async () => {
    const admin = await apiAsAdmin();
    await admin.put('/api/admin/config', { data: { auth: { allowSelfRegistration: true } } });
  });

  test('custom SSO creates the user even when self registration is off', async ({ page }) => {
    const admin = await apiAsAdmin();
    await admin.put('/api/admin/config', { data: { auth: { allowSelfRegistration: false } } });

    const email = `sso_auto_${Date.now()}@example.com`;
    idp.mode = 'allow';
    idp.userinfo = { email, name: 'Auto Created', email_verified: true };

    await page.goto('/login');
    await page.getByTestId('oauth-custom').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 20000 });
    const me = await (await page.request.get('/api/auth/me')).json();
    expect(me.email).toBe(email);

    // password registration is still closed
    const reg = await page.request.post('/api/auth/register', {
      data: { name: 'Nope', email: `nope_${Date.now()}@example.com`, password: 'Sup3rSecret!pass' },
    });
    expect(reg.status()).toBe(403);
  });
});
