import { test, expect } from '../fixtures';

// QA-10: the "Create the admin account" screen offered "Register" and showed a failed setup twice
// (inline banner + toast).
async function firstRunScreen(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/config', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), needsSetup: true } });
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Create the admin account' })).toBeVisible();
}

test.describe('first-run setup screen', () => {
  test.use({ allowFpErrors: [/status code 40[0139]/] });

  test('does not offer the Register link', async ({ page }) => {
    await firstRunScreen(page);
    await expect(page.getByRole('link', { name: 'Register' })).toHaveCount(0);
  });

  test('a failed setup shows its error once (inline only, no toast)', async ({ page }) => {
    await firstRunScreen(page);
    await page.route('**/api/auth/setup', (route) => route.fulfill({ status: 403, json: { message: 'Cross-origin request blocked' } }));
    await page.getByTestId('setup-name').fill('Intruder');
    await page.getByTestId('login-email').fill('intruder@example.com');
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('Cross-origin request blocked');
    await expect(page.getByTestId('toast-error')).toHaveCount(0);
  });
});
