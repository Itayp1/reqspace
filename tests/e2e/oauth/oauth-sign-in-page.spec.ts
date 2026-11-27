import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest } from '@playwright/test';
import { apiAsAdmin } from '../helpers';

// Isolated source address so the login limiter budget of other specs is untouched.
let seq = 0;
const anon = () =>
  pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': `10.77.${Math.floor(Math.random() * 250)}.${(seq++ % 250) + 1}` } });

test.describe('OAuth sign-in page: GitHub and Microsoft', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('sign-in page offers each enabled provider and redirects to its authorize endpoint', async ({ page }) => {
    await page.route('**/api/auth/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          githubOAuth: { enabled: true, clientId: 'gh-client' },
          microsoftOAuth: { enabled: true, clientId: 'ms-client', tenantId: 'my-tenant' },
        }),
      }),
    );
    await page.route('**/api/auth/state', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ state: 'a'.repeat(64) }) }),
    );
    await page.route('https://github.com/**', (route) => route.fulfill({ status: 200, body: 'GitHub mock' }));
    await page.route('https://login.microsoftonline.com/**', (route) => route.fulfill({ status: 200, body: 'Microsoft mock' }));

    await page.goto('/login');
    await expect(page.getByTestId('oauth-google')).toHaveCount(0);

    await page.getByTestId('oauth-microsoft').click();
    await expect(page).toHaveURL(/login\.microsoftonline\.com\/my-tenant\/oauth2\/v2\.0\/authorize\?.*client_id=ms-client/);

    await page.goto('/login');
    await page.getByTestId('oauth-github').click();
    await expect(page).toHaveURL(/github\.com\/login\/oauth\/authorize\?.*client_id=gh-client/);
  });

  for (const provider of ['github', 'microsoft']) {
    test(`POST /api/auth/${provider} rejects a missing/invalid CSRF state`, async () => {
      const ctx = await anon();
      const res = await ctx.post(`/api/auth/${provider}`, {
        data: { code: 'abc', redirectUri: `http://localhost:5173/auth/${provider}/callback`, state: 'b'.repeat(64) },
      });
      expect(res.status()).toBe(403);
    });
  }
});

/** OAUTH2: the Google button showed a blue circle with a letter instead of the four-colour Google "G". */
test('the Google sign-in button shows the four-colour Google logo', async ({ page }) => {
  const admin = await apiAsAdmin();
  await admin.put('/api/admin/config', { data: { auth: { googleOAuth: { enabled: true, clientId: 'g-client', clientSecret: 'g-secret' } } } });
  try {
    await page.goto('/login');
    const svg = page.getByTestId('oauth-google').locator('svg');
    await expect(svg).toBeVisible();
    const html = await svg.innerHTML();
    for (const c of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) expect(html.toUpperCase()).toContain(c);
    expect(html).not.toContain('<text');
  } finally {
    await admin.put('/api/admin/config', { data: { auth: { googleOAuth: { enabled: false } } } });
  }
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
