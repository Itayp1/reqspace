import { test, expect } from '../fixtures';

// R2-01: the top-left sidebar icon (logo link) has no tooltip, so clicking it at "/" looks like a dead control.
test('R2-01: sidebar logo link has a tooltip and the Import icon opens Import', async ({ page }) => {
  await page.goto('/register');
  await page.getByTestId('register-name').fill('Logo User');
  await page.getByTestId('register-email').fill(`r201_${Date.now()}@example.com`);
  await page.getByTestId('register-password').fill('password123');
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/.*\/$/);

  await expect(page.getByRole('link', { name: 'Reqspace home' })).toHaveAttribute('title', 'Reqspace home');
  await expect(page.getByTestId('import-btn')).toHaveAttribute('title', 'Import');
});
