import { test, expect } from '@playwright/test';

test.describe('Concurrency & Tabs', () => {
  test('Open multiple tabs and ensure delayed request completes in background', async ({ page }) => {
    // Register and login
    const timestamp = Date.now();
    const email = `concurrency_${timestamp}@example.com`;
    const pass = 'password123';
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Concurrency User');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill(pass);
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    // Mock a delayed response
    await page.route('**/proxy', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const postData = request.postDataJSON();
        if (postData && postData.url.includes('delayed-endpoint')) {
          // Delay by 3 seconds
          await new Promise(resolve => setTimeout(resolve, 3000));
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 200,
              statusText: 'OK',
              headers: {},
              body: { success: true, message: 'Delayed Response' },
              time: 3000,
              size: 100
            }),
          });
          return;
        }
      }
      await route.continue();
    });

    // Create 10 tabs
    for (let i = 0; i < 10; i++) {
      await page.getByTestId('new-tab-btn').click();
    }

    // Select the first tab
    const tabs = page.locator('[data-testid^="tab-"]');
    await expect(tabs).toHaveCount(11); // 1 default + 10 new

    await tabs.nth(1).click();
    
    // Set up delayed request
    await page.getByTestId('request-url-input').fill('https://example.com/delayed-endpoint');
    await page.getByTestId('request-send-btn').click();

    // Switch to another tab immediately
    await tabs.nth(5).click();
    
    // Wait for the delay
    await page.waitForTimeout(3500);

    // Switch back to the first tab
    await tabs.nth(1).click();

    // Verify the response is there
    const responseViewer = page.getByTestId('monaco-editor-container').last();
    await expect(responseViewer).toContainText('Delayed Response');
  });
});
