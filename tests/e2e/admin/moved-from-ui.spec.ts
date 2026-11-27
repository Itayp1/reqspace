import { test, expect } from '../fixtures';

// these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
test.describe('Admin add-user modal', () => {
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();

  test('an admin can create a user who can then log in', async ({ page, browser }) => {
    const newEmail = `created_${ts}@example.com`;

    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin123456');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    await page.getByTestId('admin-dashboard-link').click();
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();

    await page.getByTestId("admin-add-user-btn").click();
    const modal = page.getByTestId('add-user-modal');
    await expect(modal).toBeVisible();
    await page.getByTestId('add-user-name').fill('Created User');
    await page.getByTestId('add-user-email').fill(newEmail);
    await page.getByTestId('add-user-password').fill('created-password-1');
    await page.getByTestId('add-user-submit-btn').click();
    await expect(modal).toBeHidden();

    await expect(page.locator('tr[data-testid^="user-row-"]').filter({ hasText: newEmail })).toBeVisible();

    // Still there after a reload, i.e. actually created rather than appended
    // to the table in memory.
    await page.reload();
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();
    await expect(page.locator('tr[data-testid^="user-row-"]').filter({ hasText: newEmail })).toBeVisible();

    // The strongest proof the user exists: they can sign in.
    const ctx = await browser.newContext();
    const fresh = await ctx.newPage();
    await fresh.goto('/login');
    await fresh.getByTestId('login-email').fill(newEmail);
    await fresh.getByTestId('login-password').fill('created-password-1');
    await fresh.getByTestId('login-submit').click();
    // Admin-created accounts are forced to change their password on first use.
    const forced = fresh.getByTestId('new-password-input');
    if (await forced.isVisible({ timeout: 8000 }).catch(() => false)) {
      await forced.fill('changed-password-1');
      await fresh.getByTestId('confirm-password-input').fill('changed-password-1');
      await fresh.getByTestId('change-password-submit').click();
      await expect(forced).toBeHidden();
    }
    await expect(fresh.getByTestId('workspace-select')).toBeVisible();
    await ctx.close();
  });

  test('a duplicate email is rejected with a message, not silently', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin123456');
    await page.getByTestId('login-submit').click();
    await page.getByTestId('admin-dashboard-link').click();
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();

    await page.getByTestId("admin-add-user-btn").click();
    await page.getByTestId('add-user-name').fill('Duplicate');
    await page.getByTestId('add-user-email').fill(`created_${ts}@example.com`);
    await page.getByTestId('add-user-password').fill('another-password-1');
    await page.getByTestId('add-user-submit-btn').click();

    // The modal stays open and says why.
    await expect(page.getByTestId('add-user-modal')).toBeVisible();
    await expect(page.getByTestId('add-user-modal').getByRole('alert')).toBeVisible();
  });
});
