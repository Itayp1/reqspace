import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  const timestamp = Date.now();
  const testEmail = `testuser_${timestamp}@example.com`;
  const testPassword = 'password123';

  test('should fail to login with non-existent user', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', 'notreal@example.com');
    await page.fill('[data-testid="login-password"]', 'wrongpass');
    await page.click('[data-testid="login-submit"]');
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
  });

  test('should register a new user successfully', async ({ page }) => {
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', testEmail);
    await page.fill('[data-testid="register-password"]', testPassword);
    await page.click('[data-testid="register-submit"]');
    
    // Should navigate to home
    await expect(page).toHaveURL(/.*\/$/);
    await expect(page.locator('[data-testid="logout-btn"]')).toBeVisible();
  });

  test('should login and logout successfully', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', testEmail);
    await page.fill('[data-testid="login-password"]', testPassword);
    await page.click('[data-testid="login-submit"]');
    
    await expect(page).toHaveURL(/.*\/$/);
    
    // Logout
    await page.click('[data-testid="logout-btn"]');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test.fixme('forced first-login change, expired session, SSO', async ({ page }) => {
    expect(true).toBe(true);
  });
});
