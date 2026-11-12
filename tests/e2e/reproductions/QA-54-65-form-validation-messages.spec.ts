import { test, expect } from '../fixtures';

// QA-54/67: empty submits showed the browser's own (Hebrew) validation bubble.
// QA-65: register showed only "Invalid request body" instead of the field issues.
test.use({ allowFpErrors: [/status code 40[0139]/] });

test('login: an empty submit shows an in-app message, not the browser bubble', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toHaveText('Enter your username or email and your password.');
});

test('register: an empty submit shows an in-app message', async ({ page }) => {
  await page.goto('/register');
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('register-error')).toHaveText('Enter a name, an email and a password.');
});

test('register: a too-short password names the rule instead of "Invalid request body"', async ({ page }) => {
  await page.goto('/register');
  await page.getByTestId('register-name').fill('Short Pw');
  await page.getByTestId('register-email').fill(`short_${Date.now()}@example.com`);
  await page.getByTestId('register-password').fill('abc');
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('register-error')).toContainText('Password must be at least 8 characters');
});
