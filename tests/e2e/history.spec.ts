import { test, expect } from '@playwright/test';

test.describe('History Logging', () => {
  const timestamp = Date.now();
  const testEmail = `history_${timestamp}@example.com`;

  test('Request history is logged and replayable', async ({ page }) => {
    // Register
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'History User');
    await page.fill('[data-testid="register-email"]', testEmail);
    await page.fill('[data-testid="register-password"]', 'password');
    await page.click('[data-testid="register-submit"]');
    await expect(page).toHaveURL(/.*\/$/);

    // Create Workspace
    const wsName = `Hist WS ${timestamp}`;
    await page.click('[data-testid="new-workspace-btn"]');
    await page.getByTestId('prompt-input').fill(wsName);
    await page.getByTestId('prompt-submit').click();

    // Create a request and send
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId('response-status')).toContainText('200 OK');

    // Change URL and send again to verify state
    await page.getByTestId('request-url-input').fill('https://httpbin.org/status/201');
    await page.click('[data-testid="request-send-btn"]');
    await expect(page.getByTestId('response-status')).toContainText('201 CREATED');

    // Open History sidebar
    await page.click('[data-testid="tab-history"]');

    // Verify first request is in history
    const historyItems = page.locator('[data-testid="history-item"]');
    await expect(historyItems.first()).toBeVisible();
    await expect(page.locator('[data-testid="history-item"]:has-text("httpbin.org/get")')).toBeVisible();

    // Click the history item to restore it
    await page.click('[data-testid="history-item"]:has-text("httpbin.org/get")');

    // Verify the URL input now has the restored URL
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://httpbin.org/get');
  });
});
