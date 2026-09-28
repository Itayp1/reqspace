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

    // Mock a delayed response. There is no server-side proxy relay — the
    // browser transport does a direct fetch(url), so the mock has to match
    // the actual request target, not a backend endpoint.
    await page.route('**/delayed-endpoint', async (route) => {
      // Delay by 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Delayed Response' }),
      });
    });

    // Create 10 tabs
    for (let i = 0; i < 10; i++) {
      await page.getByTestId('new-tab-btn').click();
    }

    // Select the first tab. The sidebar's "Envs"/"History" panel switches
    // also use a `tab-*` testid prefix (tab-environments, tab-history) but
    // carry role="tab" — the request tabs don't, so exclude those to avoid
    // matching both sets.
    const tabs = page.locator('[data-testid^="tab-"]:not([role="tab"])');
    await expect(tabs).toHaveCount(10); // a fresh session starts with 0 tabs, not 1

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
    const responseViewer = page.getByTestId('response-body-viewer');
    await expect(responseViewer).toContainText('Delayed Response');
  });
});
