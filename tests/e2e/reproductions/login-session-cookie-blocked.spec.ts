import { test, expect } from '../fixtures';

/**
 * LOGIN1: when the browser drops the session cookie (e.g. a Secure cookie over plain HTTP), sign-in
 * "succeeded" and every later call answered 401 with nothing on screen explaining why.
 */
test.describe('session cookie dropped by the browser', () => {
  test.use({ allowFpErrors: [/server-auth|status code 401/] });

  test('the login page explains it instead of entering a broken app', async ({ page }) => {
    // The browser dropped the cookie: the very next authenticated call is anonymous.
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Unauthorized"}' }));
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText('did not keep the session cookie');
    await expect(page).toHaveURL(/\/login/);
  });
});
