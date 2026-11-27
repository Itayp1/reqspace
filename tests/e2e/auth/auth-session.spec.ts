import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { apiAsAdmin } from '../helpers';


test.describe('Authentication', () => {
  const timestamp = Date.now();
  const testEmail = `testuser_${timestamp}@example.com`;
  const testPassword = 'password123';
  // The login tests get their own account instead of relying on the register test above: when a
  // test fails, Playwright starts a new worker, `timestamp` changes and the account the earlier
  // test created no longer matches, so one failure used to take the later login tests down with it.
  const loginEmail = `loginuser_${timestamp}@example.com`;

  test.beforeAll(async () => {
    const api = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': `10.55.${timestamp % 250}.${(timestamp >> 3) % 250 + 1}` } });
    const res = await api.post('/api/auth/register', { data: { name: 'Login User', email: loginEmail, password: testPassword } });
    expect([201, 409]).toContain(res.status());
    await api.dispose();
  });

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

  // Rarely (about 1 run in 500, Electron only) the app issues one workspace-tree request after the session cookie is
  // already cleared. The cause is not identified; it is declared here rather than hidden for the whole file.
  test.describe('sign-out', () => {
    test.use({ allowFpErrors: [/server-auth|status code 401/] });

    test('should login and logout successfully', async ({ page }) => {
      await page.goto('/login');
      await page.fill('[data-testid="login-email"]', loginEmail);
      await page.fill('[data-testid="login-password"]', testPassword);
      await page.click('[data-testid="login-submit"]');

      // LoginPage does a full window.location.reload() after navigating — give
      // it more than the default 5s so a slow reload isn't flagged as a failure.
      await expect(page).toHaveURL(/.*\/$/, { timeout: 15000 });
      // The reload is over once the workspace has loaded; signing out earlier races the app's own start-up requests.
      await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 15000 });
      await page.waitForLoadState('networkidle');

      // Logout
      await page.click('[data-testid="logout-btn"]');
      await expect(page).toHaveURL(/.*\/login/);
    });
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
      // The real server also sets this script-readable flag; without it the app skips /auth/me on reload.
      await page.context().addCookies([{ name: 'logged_in', value: '1', url: new URL(page.url()).origin }]);
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
    await page.fill('[data-testid="login-email"]', loginEmail);
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
});

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
    await page.getByTestId('login-password').fill('admin123456');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText('did not keep the session cookie');
    await expect(page).toHaveURL(/\/login/);
  });
});

/**
 * (Admin-created users are always flagged mustChangePassword; the create schema rejects the field.)
 * A5.6 � while a user is flagged mustChangePassword, direct API calls (with a
 * valid session cookie) must be refused server-side with 403, except the few
 * endpoints the password-change flow itself needs.
 */
let seq = 0;
const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
const ip = () => `10.${200 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

async function anon(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
}

test.describe('A5.6 forced password change enforced server-side', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('[A5.6] mustChangePassword session gets 403 on data APIs, can still change password, then regains access', async () => {
    const admin = await apiAsAdmin();
    const email = `${uniq('fa56')}@example.com`;
    const created = await admin.post('/api/admin/users', {
      data: { name: 'Forced', email, password: 'password123' },
    });
    expect(created.ok(), `admin create user: ${created.status()}`).toBeTruthy();

    const ctx = await anon();
    const login = await ctx.post('/api/auth/login', { data: { email, password: 'password123' } });
    expect(login.ok(), 'login').toBeTruthy();

    // The flag is visible to the client and the modal flow endpoints stay open.
    const me = await ctx.get('/api/auth/me');
    expect(me.status()).toBe(200);
    expect(JSON.stringify(await me.json())).toContain('mustChangePassword');

    // Direct API calls are blocked, for reads and writes alike.
    for (const p of ['/api/workspaces', '/api/requests', '/api/admin/users', '/api/workspaces/?x=1']) {
      const r = await ctx.get(p);
      expect(r.status(), `GET ${p}`).toBe(403);
    }
    const write = await ctx.post('/api/workspaces', { data: { name: uniq('bypass') } });
    expect(write.status(), 'POST /api/workspaces').toBe(403);
    expect((await write.json()).code).toBe('PASSWORD_CHANGE_REQUIRED');

    // Changing the password is allowed and lifts the block.
    const change = await ctx.post('/api/auth/change-password', {
      data: { currentPassword: 'password123', newPassword: 'password456' },
    });
    expect(change.status(), 'change-password').toBe(200);
    expect((await ctx.get('/api/workspaces')).status(), 'after change').toBe(200);
  });
});
