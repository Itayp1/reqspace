import { test, expect } from '@playwright/test';

test.describe('Share Links', () => {
  test('should open ShareLinkModal and generate a link', async ({ page }) => {
    // Register unique user
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'share' + ts + '@example.com');
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
    await page.getByTestId('prompt-input').fill('Test Collection Share');
    await page.getByTestId('prompt-submit').click();

    // Open context menu for first collection
    const actionMenuBtn = page.getByTestId('action-menu-btn').first();
    await actionMenuBtn.waitFor({ state: 'visible' });
    await actionMenuBtn.click();

    // Click "Share via Link"
    await page.getByTestId('action-menu-share-via-link').click();

    // Verify modal is open
    const modal = page.getByTestId('share-link-modal');
    await expect(modal).toBeVisible();

    // Click Generate Link
    const generateBtn = page.getByTestId('share-link-generate-btn');
    await generateBtn.click();

    // Verify result is generated
    const resultInput = page.getByTestId('share-link-result');
    await expect(resultInput).toBeVisible();
    const linkVal = await resultInput.inputValue();
    expect(linkVal.length).toBeGreaterThan(0);
  });
});
