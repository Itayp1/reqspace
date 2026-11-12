import { test, expect } from '../fixtures';

// QA-75: RegisterPage had no submitting state, so a double click sent /auth/register twice.
test.use({ allowFpErrors: [/status code 400/] });

test('double-clicking Create Account sends one register request', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/auth/register', async (route) => {
    calls++;
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({ status: 400, json: { message: 'Registration blocked' } });
  });
  await page.goto('/register');
  await page.getByTestId('register-name').fill('Dbl Click');
  await page.getByTestId('register-email').fill('dbl@example.com');
  await page.getByTestId('register-password').fill('password123');
  await page.getByTestId('register-submit').dblclick();
  await expect(page.getByTestId('register-error')).toBeVisible();
  expect(calls).toBe(1);
});
