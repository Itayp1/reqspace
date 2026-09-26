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

  test('should enforce forced first-login password change', async ({ page }) => {
    // Mock the login response to return a user with mustChangePassword: true
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            _id: 'mock-user',
            email: 'mock@example.com',
            name: 'Mock User',
            mustChangePassword: true
          },
          token: 'mock-token'
        })
      });
    });
    
    await page.route('**/api/auth/change-password', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Password changed successfully' })
      });
    });

    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', 'mock@example.com');
    await page.fill('[data-testid="login-password"]', 'anypass');
    await page.click('[data-testid="login-submit"]');

    // Should show force password change modal
    await expect(page.locator('[data-testid="new-password-input"]')).toBeVisible();
    await page.fill('[data-testid="new-password-input"]', 'newpass123');
    await page.fill('[data-testid="confirm-password-input"]', 'newpass123');
    await page.click('[data-testid="change-password-submit"]');
    
    // Should dismiss the modal
    await expect(page.locator('[data-testid="new-password-input"]')).not.toBeVisible();
  });

  test('should handle expired session gracefully', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', testEmail);
    await page.fill('[data-testid="login-password"]', testPassword);
    await page.click('[data-testid="login-submit"]');
    
    await expect(page).toHaveURL(/.*\/$/);
    
    // Simulate expired session (Axios interceptor dispatches 'unauthorized')
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('unauthorized')));
    
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('should display SSO login option if enabled', async ({ page }) => {
    await page.route('**/api/auth/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          googleOAuth: { enabled: true, clientId: 'mock-client-id' }
        })
      });
    });

    await page.goto('/login');
    
    const googleBtn = page.getByText('Continue with Google');
    await expect(googleBtn).toBeVisible();
    
    await page.route('**/api/auth/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state: 'mock-state' })
      });
    });

    await page.route('https://accounts.google.com/**', async (route) => {
      await route.fulfill({ status: 200, body: 'Google Login Page Mock' });
    });

    await googleBtn.click();
    await expect(page).toHaveURL(/accounts\.google\.com/);
  });
});
