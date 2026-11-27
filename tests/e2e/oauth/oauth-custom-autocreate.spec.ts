import { test, expect } from '../fixtures';
import { apiAsAdmin } from '../helpers';
import { startMockIdp, enableCustomProvider, disableCustomProvider, type MockIdp } from '../mock-idp';

// the register call is refused on purpose; the app records it in fperrors
test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

/**
 * With self registration off, a user the custom SSO provider vouches for is still created on first
 * sign-in, while open (password) registration stays closed.
 */
let idp: MockIdp;
test.beforeAll(async () => {
  idp = await startMockIdp();
  await enableCustomProvider(idp);
});
test.afterAll(async () => {
  const admin = await apiAsAdmin();
  await admin.put('/api/admin/config', { data: { auth: { allowSelfRegistration: true } } });
  await disableCustomProvider();
  await idp.close();
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
