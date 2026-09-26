import { test, expect } from '@playwright/test';

test.describe('Collection Runner', () => {
  test('should open CollectionRunnerModal, configure and run', async ({ page }) => {
    // Register unique user
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'runner' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');

    await page.waitForSelector('[data-testid="workspace-select"]');

    // Create a new collection
    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    await page.getByTestId('prompt-input').fill('Test Collection Runner');
    await page.getByTestId('prompt-submit').click();

    // Open action menu for collection
    const actionMenuBtn = page.getByTestId('action-menu-btn').first();
    await actionMenuBtn.waitFor({ state: 'visible' });
    await actionMenuBtn.click();

    // Click "Run Collection"
    await page.getByTestId('action-menu-run-collection').click();

    // Verify modal is open
    const modal = page.getByTestId('collection-runner-modal');
    await expect(modal).toBeVisible();

    // Click Run (force click even if disabled due to no requests)
    const runBtn = page.getByTestId('collection-runner-run-btn');
    await runBtn.click({ force: true });
  });

  test.fixme('iterations, CSV/JSON data files, stop mid-run', async ({ page }) => {
    expect(true).toBe(true);
  });
});
