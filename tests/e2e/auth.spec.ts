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

    // RegisterPage does a full window.location.reload() after navigating —
    // give it more than the default 5s so a slow reload isn't flagged as a failure.
    await expect(page).toHaveURL(/.*\/$/, { timeout: 15000 });
    await expect(page.locator('[data-testid="logout-btn"]')).toBeVisible();
  });

  test('should login and logout successfully', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="login-email"]', testEmail);
    await page.fill('[data-testid="login-password"]', testPassword);
    await page.click('[data-testid="login-submit"]');

    // LoginPage does a full window.location.reload() after navigating — give
    // it more than the default 5s so a slow reload isn't flagged as a failure.
    await expect(page).toHaveURL(/.*\/$/, { timeout: 15000 });

    // Logout
    await page.click('[data-testid="logout-btn"]');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('should enforce forced first-login password change', async ({ page }) => {
    // The real /auth/login response nests the id under `id` (not `_id`) and
    // never carries a `token` — the session lives in an httpOnly cookie set
    // by the server, invisible to a page.route mock either way.
    const mockUser = {
      id: 'mock-user',
      email: 'mock@example.com',
      name: 'Mock User',
      mustChangePassword: true,
    };

    // App mounts globally (ForcePasswordChangeModal isn't scoped to the '/'
    // route) and probes /auth/me on every load, including this test's own
    // page.goto('/login') below — so /auth/me must stay "logged out" until
    // the mocked login actually happens, or the modal covers the login form
    // before it's ever submitted.
    let loggedIn = false;

    await page.route('**/api/auth/login', async (route) => {
      loggedIn = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: mockUser }),
      });
    });

    // LoginPage does a full `window.location.reload()` after login (to fetch
    // workspaces), which re-runs the app's bootstrap fetch of /auth/me and
    // /workspaces — both need mocking too, or the reload finds no real
    // session, treats the user as logged out, and bounces back to /login
    // before the force-password-change modal ever gets a chance to render.
    await page.route('**/api/auth/me', async (route) => {
      if (!loggedIn) {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'Not authenticated' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    await page.route('**/api/workspaces', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
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

    // LoginPage does a full window.location.reload() after navigating, which
    // re-runs the app bootstrap (auth/me + workspaces fetch) — give it more
    // than the default 5s so a slow reload doesn't get flagged as a failure.
    await expect(page).toHaveURL(/.*\/$/, { timeout: 15000 });
    // The reload lands on "/" before React mounts the session listener.
    // Wait until the app shell is up so the event is not dropped.
    await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 15000 });

    // Simulate expired session (Axios interceptor dispatches 'unauthorized')
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('unauthorized')));

    await expect(page).toHaveURL(/.*\/login/, { timeout: 10000 });
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
