import { test, expect } from '@playwright/test';

test.describe('Tab Operations', () => {
  test('Drag and drop to reorder tabs', async ({ page }) => {
    // 1. Register
    const timestamp = Date.now();
    const testEmail = `tabs_${timestamp}@example.com`;
    const testPassword = 'password123';

    await page.goto('/register');
    await page.getByTestId('register-name').fill('Tab User');
    await page.getByTestId('register-email').fill(testEmail);
    await page.getByTestId('register-password').fill(testPassword);
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    
    // Create first request tab and save into a new collection
    await page.getByTestId('create-request-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Request 1');
    
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      
      // Dialog will appear
      const dialogHandler = async (dialog: any) => {
        await dialog.accept('Tab Collection');
      };
      page.once('dialog', dialogHandler);
      
      await expect(page.getByTestId('node-Tab Collection')).toBeVisible();
    }
    await page.getByTestId('save-req-submit-btn').click();

    // Create second request tab and save to same collection
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/post');
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Request 2');
    await page.getByTestId('save-req-submit-btn').click();

    // Close all tabs
    let tabs = page.locator('[data-testid^="tab-"]');
    while(await tabs.count() > 0) {
      await tabs.nth(0).hover();
      await tabs.nth(0).getByTestId('close-tab-btn').click();
      await page.waitForTimeout(200); // Wait for animation or state update
    }

    // Open them from sidebar
    // Click the collection folder if it's closed? Actually saving might leave it open, but let's click the requests
    await page.getByTestId('node-Request 1').click();
    await page.getByTestId('node-Request 2').click();

    // Verify two tabs are open
    tabs = page.locator('[data-testid^="tab-"]');
    await expect(tabs).toHaveCount(2);

    // Verify order
    await expect(tabs.nth(0)).toContainText('Request 1');
    await expect(tabs.nth(1)).toContainText('Request 2');

    // Drag second tab before first tab
    const tab1 = tabs.nth(0);
    const tab2 = tabs.nth(1);
    await tab2.dragTo(tab1);

    // Wait a bit for React to process the drop
    await page.waitForTimeout(500);

    // Verify order changed
    await expect(tabs.nth(0)).toContainText('Request 2');
    await expect(tabs.nth(1)).toContainText('Request 1');
  });

  test.fixme('drag-reorder only and content persistence', async ({ page }) => {
    expect(true).toBe(true);
  });
});
