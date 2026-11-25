import { test, expect } from '../fixtures';
import { startMockIdp, enableCustomProvider, disableCustomProvider, type MockIdp } from '../mock-idp';

/**
 * After an SSO sign-in the workspace list was never fetched (password login reloads the page to
 * get it), so Workspace Settings had no active workspace and showed "Loading details…" forever.
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

test('Workspace Settings opens after a custom SSO sign-in', async ({ page }) => {
  idp.mode = 'allow';
  idp.userinfo = { email: `sso_ws_${Date.now()}@example.com`, name: 'Sso Ws', email_verified: true };

  await page.goto('/login');
  await page.getByTestId('oauth-custom').click();
  await page.getByTestId('workspace-settings-btn').click();
  await expect(page.getByRole('dialog', { name: 'Workspace Settings' })).toBeVisible();
  await expect(page.getByText('Loading details…')).toBeHidden({ timeout: 5000 });
});
