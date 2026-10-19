import { test, expect } from '../fixtures';
import { apiAsAdmin } from '../helpers';

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
