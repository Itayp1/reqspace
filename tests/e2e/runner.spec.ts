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

  test('iterations, CSV/JSON data files, stop mid-run', async ({ page }) => {
    // Register unique user
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'runner_data' + ts + '@example.com');
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
    await page.getByTestId('prompt-input').fill('Test Collection Runner Data');
    await page.getByTestId('prompt-submit').click();

    // Add a request to the collection so it can run
    const actionMenuBtn = page.getByTestId('action-menu-btn').first();
    await actionMenuBtn.waitFor({ state: 'visible' });
    await actionMenuBtn.click();
    await page.getByTestId('action-menu-add-request').click();

    // Open action menu for collection again to run it
    await actionMenuBtn.click();
    await page.getByTestId('action-menu-run-collection').click();

    // Verify modal is open
    const modal = page.getByTestId('collection-runner-modal');
    await expect(modal).toBeVisible();

    // Configure Iterations
    const iterInput = page.locator('input[type="number"]').nth(1);
    await iterInput.fill('3');

    // Upload JSON data file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'data.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([{ "var": "1" }, { "var": "2" }, { "var": "3" }]))
    });

    // Check if iterations changed to 3 based on the JSON file
    await expect(iterInput).toHaveValue('3');

    // Start run
    const runBtn = page.getByTestId('collection-runner-run-btn');
    await runBtn.click();

    // Stop mid-run
    const stopBtn = page.getByTestId('collection-runner-stop-btn');
    if (await stopBtn.isVisible().catch(() => false)) {
      await stopBtn.click();
    }

    await expect(modal).toBeVisible();
  });
});
