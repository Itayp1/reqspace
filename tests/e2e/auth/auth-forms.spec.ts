import { test, expect } from '../fixtures';

// Signed-out context: the register and login pages must state the password rule up front
// (QA-65) and the error banner must have a dark-mode variant.
test.use({ storageState: { cookies: [], origins: [] } });

test('register shows the 8-character password rule next to the field', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByTestId('register-password')).toHaveAttribute('aria-describedby', 'register-password-hint');
  await expect(page.locator('#register-password-hint')).toHaveText('At least 8 characters.');
});

test('register error banner has a dark variant', async ({ page }) => {
  await page.goto('/register');
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('register-error')).toHaveClass(/dark:bg-red-950/);
});

test('login error banner has a dark variant', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toHaveClass(/dark:bg-red-950/);
});
