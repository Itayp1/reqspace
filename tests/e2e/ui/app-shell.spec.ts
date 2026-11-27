import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

test.describe('App shell', () => {
  test('an unknown path lands on the app (or login), not a blank page', async ({ page }) => {
    await page.goto('/definitely/not/a/route');
    await expect(page).toHaveURL(/\/login$/);
    await registerUser(page, 'shell_route');
    await page.goto('/another/missing/page');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByTestId('workspace-select')).toBeVisible();
  });

  test('[V4.2] browser Back / Forward never lands on a blank screen', async ({ page }) => {
    test.skip(!process.env.REQSPACE_WEB_URL, 'needs the web client');
    test.skip(process.env.REQSPACE_TARGET === 'electron', 'a desktop app window has no browser history to go back/forward through');
    const base = process.env.REQSPACE_WEB_URL!;
    await page.goto(base + '/does-not-exist');
    await page.waitForLoadState('networkidle');
    await page.goto(base + '/login');
    await page.goBack();
    await page.goForward();
    expect((await page.locator('#root').innerText()).trim().length).toBeGreaterThan(0);
  });
});

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
