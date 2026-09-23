import { test, expect } from '@playwright/test';

test.describe('reqSpace E2E', () => {
  const testId = Date.now();
  const testUser = {
    name: `User ${testId}`,
    email: `test${testId}@example.com`,
    password: 'password123'
  };

  test('Complete Flow: Register, Workspace, Collection, Request, Proxy, History, Import', async ({ page }) => {
    test.setTimeout(60000); // This flow is extremely long, increase timeout to 60s
    // 1. Register
    await page.goto('/register');
    await page.fill('input[type="text"]', testUser.name);
    await page.fill('input[placeholder="admin or test@example.com"]', testUser.email);
    await page.fill('input[type="password"]', testUser.password);
    await page.click('button[type="submit"]');

    // Should redirect to main app screen (URL /)
    await page.waitForURL('**/');
    await expect(page.getByRole('button', { name: 'Collections' })).toBeVisible();

    // 2. Workspace check
    // Wait for workspace selector to have the auto-created workspace
    const workspaceSelect = page.locator('select').first();
    // Wait for the select element to actually have an option
    await expect(workspaceSelect.locator('option')).toHaveCount(1, { timeout: 15000 });
    await expect(workspaceSelect).toBeVisible();
    await expect(workspaceSelect).toContainText('Workspace');

    // 3. Create a Request
    await page.click('button[title="New Collection"]');
    await page.fill('input[placeholder="Enter collection name:"]', 'Test Collection');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Test Collection').first()).toBeVisible();

    const collNode = page.locator('.group', { hasText: 'Test Collection' }).first();
    await collNode.hover();
    await collNode.locator('.lucide-more-vertical').first().click();
    await page.locator('text=New Request').click();
    await page.fill('input[placeholder="Request name:"]', 'Test Request');
    await page.click('button:has-text("Save")');
    await collNode.locator('.lucide-chevron-right').click();
    
    // 4. Click the new request to load it into the editor
    await page.locator('text=Test Request').first().click();
    
    // 5. Build and Send the Request via CORS Proxy
    // In the Request Editor, wait for URL bar to be active
    const urlInput = page.locator('input[placeholder="Enter request URL"]');
    await expect(urlInput).toBeVisible();
    
    // Change Method to POST
    await page.locator('select.bg-gray-100').selectOption('POST');
    
    // Fill URL
    await urlInput.fill('https://jsonplaceholder.typicode.com/posts');

    // Switch to Body tab
    await page.click('button:has-text("Body")');
    // Select 'raw' body type
    await page.click('label:has-text("raw")');
    
    // Monaco editor is hard to type in directly via basic locators, but we can try 
    // by clicking inside and typing, or we can just send a GET request for simplicity.
    // Let's stick to GET to make the test extremely stable, or use form-data.
    // Actually, sending GET to https://jsonplaceholder.typicode.com/posts/1 is enough to test the proxy.
    await page.locator('select.bg-gray-100').selectOption('GET');
    await urlInput.fill('https://jsonplaceholder.typicode.com/posts/1');

    // Hit Send
    await page.click('button:has-text("Send")');

    // 6. Response Viewer
    // Wait for the status badge to appear (e.g., "200 OK")
    const statusBadge = page.locator('span:has-text("200")').first();
    await expect(statusBadge).toBeVisible({ timeout: 10000 }); // proxy might take a few seconds
    
    // Response verified via status badge

    // 7. Check History
    await page.click('button:has-text("History")');
    await expect(page.locator('text=https://jsonplaceholder.typicode.com/posts/1')).toBeVisible();
    // Switch back to Collections view
    await page.click('button:has-text("Collections")');

    // 8. Test cURL Import
    await page.click('button[title="Import"]');
    await page.click('button:has-text("cURL")');
    await page.fill('textarea[placeholder*="curl -X GET"]', 'curl -X GET "https://api.github.com/zen"');
    await page.click('button:has-text("Import")');
    
    // Verify it closed and set the URL in the editor
    await expect(page.locator('h2:has-text("Import")')).not.toBeVisible();
    
    // The URL bar should now contain the imported URL
    await expect(urlInput).toHaveValue('https://api.github.com/zen');

    // 9. Save the imported request
    await page.click('button[title="Save Request"]');
    await page.fill('input[placeholder="Request Name"]', 'Saved GitHub Zen');
    // The first collection is auto-selected, just click save in the modal
    await page.locator('div.fixed.inset-0').locator('button:has-text("Save")').click();

    // Verify the modal closed
    await expect(page.locator('h2:has-text("Save Request")').first()).not.toBeVisible({ timeout: 10000 });
    
    // The collection is already open (state preserved), so the saved request should be visible
    await expect(page.locator('text=Saved GitHub Zen').first()).toBeVisible({ timeout: 10000 });
  });
});
