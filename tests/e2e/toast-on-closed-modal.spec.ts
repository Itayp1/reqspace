import { test, expect } from '@playwright/test';
import { ADMIN_PASSWORD } from './global-setup';

// UI-2: an error raised by a request that finishes after its modal has
// already closed must still surface — previously it went nowhere, because
// every modal held its error in its own local `useState`, which is gone
// the moment the component unmounts. This drives the exact race: submit,
// close the modal before the (deliberately delayed, deliberately failing)
// response arrives, and assert the toast still appears.
test('a failed save after its modal is closed still shows a toast', async ({ page }) => {
  await page.goto('/login');
  await page.getByTestId('login-email').fill('admin');
  await page.getByTestId('login-password').fill(ADMIN_PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/.*\/$/);

  await page.goto('/admin');
  await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();

  // Delay and fail the create-user call so we have a window to close the
  // modal before it settles — a real network round-trip is too fast to
  // race reliably otherwise.
  await page.route('**/api/admin/users', async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Email already in use' }),
    });
  });

  await page.getByTestId('admin-add-user-btn').click();
  await expect(page.getByTestId('add-user-modal')).toBeVisible();

  await page.getByTestId('add-user-name').fill('Race Condition User');
  await page.getByTestId('add-user-email').fill(`race-${Date.now()}@example.com`);
  await page.getByTestId('add-user-password').fill('whatever-password');
  await page.getByTestId('add-user-submit-btn').click();

  // Close the modal immediately — well before the mocked 1s response lands.
  await page.getByTestId('add-user-close-btn').click();
  await expect(page.getByTestId('add-user-modal')).not.toBeVisible();

  // The modal (and its local error state) is gone, but the toast store is
  // independent of it — the error must still show up.
  await expect(page.getByTestId('toast-error')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('toast-error')).toContainText('Email already in use');
});
