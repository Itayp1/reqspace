import { test, expect } from '../fixtures';
import { startMockIdp, enableCustomProvider, disableCustomProvider, type MockIdp } from '../mock-idp';

/** First SSO sign-in creates the user's own personal workspace; signing out and in again returns to it. */
let idp: MockIdp;
test.beforeAll(async () => {
  idp = await startMockIdp();
  await enableCustomProvider(idp);
});
test.afterAll(async () => {
  await disableCustomProvider();
  await idp.close();
});

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
  await expect(page.getByTestId('workspace-select')).toContainText("Sso Personal's Workspace");

  await page.request.post('/api/auth/logout');
  await page.goto('/login');
  await page.getByTestId('oauth-custom').click();
  await expect(page.getByTestId('workspace-select')).toContainText("Sso Personal's Workspace", { timeout: 20000 });
  const again = await (await page.request.get('/api/workspaces')).json();
  expect(again.filter((w: any) => w.isPersonal)).toHaveLength(1);
});
