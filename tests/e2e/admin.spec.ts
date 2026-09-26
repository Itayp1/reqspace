import { test, expect } from '@playwright/test';

test.describe('Admin Features', () => {
  test('Admin login and dashboard', async ({ page }) => {
    // 1. Go to login page
    await page.goto('/login');

    // 2. Login as admin (using the default seed)
    await page.fill('[data-testid="login-email"]', 'admin');
    await page.fill('[data-testid="login-password"]', 'admin');
    let loginResPromise = page.waitForResponse(res => res.url().includes('/auth/login'));
    await page.click('[data-testid="login-submit"]');
    let loginRes = await loginResPromise;

    if (loginRes.status() === 401) {
      await page.fill('[data-testid="login-password"]', 'admin123456');
      loginResPromise = page.waitForResponse(res => res.url().includes('/auth/login'));
      await page.click('[data-testid="login-submit"]');
      loginRes = await loginResPromise;
    }
    
    // Wait for the reload to finish
    await page.waitForResponse(res => res.url().includes('/auth/me') && res.status() === 200, { timeout: 15000 });

    // Handle forced password change if it appears
    const newPasswordInput = page.locator('[data-testid="new-password-input"]');
    if (await newPasswordInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await newPasswordInput.fill('admin123456');
      await page.fill('[data-testid="confirm-password-input"]', 'admin123456');
      await page.click('[data-testid="change-password-submit"]');
      await expect(newPasswordInput).toBeHidden({ timeout: 5000 });
    }

    // 3. Navigate to Admin Dashboard
    await page.click('[data-testid="admin-dashboard-link"]');

    // 4. Verify Admin Dashboard loaded
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();

    // 5. Verify Users tab
    await expect(page.locator('tr[data-testid^="user-row-"]').first()).toBeVisible();

    // 6. Go to Settings tab
    await page.click('[data-testid="admin-tab-settings"]');
    await expect(page.getByTestId('admin-settings-title')).toBeVisible();
  });

  test('login + dashboard render only system config update', async ({ page }) => {
    // 1. Go to login page
    await page.goto('/login');

    // 2. Login as admin (using the default seed)
    await page.fill('[data-testid="login-email"]', 'admin');
    await page.fill('[data-testid="login-password"]', 'admin');
    let loginResPromise = page.waitForResponse(res => res.url().includes('/auth/login'));
    await page.click('[data-testid="login-submit"]');
    let loginRes = await loginResPromise;

    if (loginRes.status() === 401) {
      await page.fill('[data-testid="login-password"]', 'admin123456');
      loginResPromise = page.waitForResponse(res => res.url().includes('/auth/login'));
      await page.click('[data-testid="login-submit"]');
      loginRes = await loginResPromise;
    }
    
    // Wait for the reload to finish
    await page.waitForResponse(res => res.url().includes('/auth/me') && res.status() === 200, { timeout: 15000 });
    const newPasswordInput = page.locator('[data-testid="new-password-input"]');
    if (await newPasswordInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await newPasswordInput.fill('admin123456');
      await page.fill('[data-testid="confirm-password-input"]', 'admin123456');
      await page.click('[data-testid="change-password-submit"]');
      await expect(newPasswordInput).toBeHidden({ timeout: 5000 }).catch(async () => {
        const errText = await page.locator('.text-red-500.bg-red-500\\/10').textContent().catch(() => 'No error text');
        console.error('MODAL DID NOT CLOSE. Error text:', errText);
        throw new Error('Modal did not close');
      });
    }

    // 3. Navigate to Admin Dashboard
    await page.click('[data-testid="admin-dashboard-link"]');

    // 4. Go to Settings tab
    await page.click('[data-testid="admin-tab-settings"]');
    await expect(page.getByTestId('admin-settings-title')).toBeVisible();

    // 5. Update configuration
    const historyInput = page.locator('label:has-text("Max Total History per User MB") + input');
    await historyInput.fill('25');
    
    // Save
    const savePromise = page.waitForResponse(res => res.url().includes('/admin/config') && res.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save System Config' }).click();
    const saveRes = await savePromise;
    if (saveRes.status() !== 200) {
      console.error('SAVE CONFIG FAILED:', saveRes.status(), await saveRes.text());
    }
    expect(saveRes.status()).toBe(200);

    // Reload and verify
    await page.reload();
    await page.click('[data-testid="admin-tab-settings"]');
    await expect(page.getByTestId('admin-settings-title')).toBeVisible();
    await expect(historyInput).toHaveValue('25');

    // Revert
    await historyInput.fill('20');
    const revertPromise = page.waitForResponse(res => res.url().includes('/admin/config') && res.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save System Config' }).click();
    await revertPromise;
  });
});
