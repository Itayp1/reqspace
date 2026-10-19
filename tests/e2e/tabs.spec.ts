import { test, expect, type Locator, type Page } from './fixtures';

/**
 * Drag `source` onto the left half of `target`, so the drop resolves to
 * "before" it.
 *
 * This spec used to flake, and the cause was in the app, not here: handleDrop
 * bailed out whenever dragOverTabId was null, and dragleave nulls it the
 * moment the pointer crosses into any child of the tab. Both are fixed — the
 * drop side now comes from the drop event itself — so a plain
 * down / move / move / up is enough, and the order assertions that follow
 * auto-retry while React settles.
 */
async function dragTabOnto(page: Page, source: Locator, target: Locator) {
  // HTML5 drag-and-drop (draggable="true") needs the browser's drag events; raw mouse moves
  // don't reliably fire them on every runner (CI's Chromium ignored them). dragTo dispatches them.
  // Dropping near the target's left edge places the source before it.
  const box = (await target.boundingBox())!;
  await source.dragTo(target, { targetPosition: { x: 4, y: box.height / 2 } });
}

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
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      await page.getByTestId('prompt-input').fill('Tab Collection');
      await page.getByTestId('prompt-submit').click();
      await expect(page.getByTestId('node-Tab Collection')).toBeVisible();
    }
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Request 1');
    await page.getByTestId('save-req-submit-btn').click();

    // Create second request tab and save to same collection
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/post');
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill('Request 2');
    await page.getByTestId('save-req-submit-btn').click();

    // Close all tabs
    let tabs = page.locator('[data-testid^="tab-"]:not([role="tab"])');
    while(await tabs.count() > 0) {
      await tabs.nth(0).hover();
      await tabs.nth(0).getByTestId('close-tab-btn').click();
      await page.waitForTimeout(200); // Wait for animation or state update
    }

    // Open them from sidebar
    // Click the collection folder if it's closed? Actually saving might leave it open, but let's click the requests
    if (await page.getByTestId('node-Request 1').isHidden()) {
      await page.getByTestId('node-Tab Collection').click();
    }
    await expect(page.getByTestId('node-Request 1')).toBeVisible();
    await page.getByTestId('node-Request 1').click();
    await page.getByTestId('node-Request 2').click();

    // Verify two tabs are open
    tabs = page.locator('[data-testid^="tab-"]:not([role="tab"])');
    await expect(tabs).toHaveCount(2);

    // Verify order
    await expect(tabs.nth(0)).toContainText('Request 1');
    await expect(tabs.nth(1)).toContainText('Request 2');

    // Drag second tab before first tab
    await dragTabOnto(page, tabs.nth(1), tabs.nth(0));

    // Verify order changed
    await expect(tabs.nth(0)).toContainText('Request 2');
    await expect(tabs.nth(1)).toContainText('Request 1');
  });

  test('drag-reorder only and content persistence', async ({ page }) => {
    // Register to get a clean state
    const timestamp = Date.now();
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Tab User2');
    await page.getByTestId('register-email').fill(`tabs2_${timestamp}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    
    // Create first request tab
    await page.getByTestId('create-request-btn').click();
    await page.getByTestId('request-url-input').fill('https://example.com/1');
    await page.getByTestId('method-select').selectOption('POST');
    
    // Create second request tab
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://example.com/2');
    await page.getByTestId('method-select').selectOption('PUT');

    // Verify two tabs are open
    const tabs = page.locator('[data-testid^="tab-"]:not([role="tab"])');
    await expect(tabs).toHaveCount(2);

    // Switch back to first tab
    await tabs.nth(0).click();

    // Verify content persisted in first tab
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://example.com/1');
    await expect(page.getByTestId('method-select')).toHaveValue('POST');
    
    // The tab should also have an unsaved indicator (isDirty)
    await expect(tabs.nth(0).locator('[title="Unsaved changes"]')).toBeVisible();

    // Switch to second tab
    await tabs.nth(1).click();
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://example.com/2');
    await expect(page.getByTestId('method-select')).toHaveValue('PUT');
    await expect(tabs.nth(1).locator('[title="Unsaved changes"]')).toBeVisible();

    // Drag second tab before first tab
    await dragTabOnto(page, tabs.nth(1), tabs.nth(0));

    // Verify order changed
    // Click tab at index 0 which should now be the "second" tab (https://example.com/2)
    await tabs.nth(0).click();
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://example.com/2');
    await expect(page.getByTestId('method-select')).toHaveValue('PUT');
    
    // Switch to the now-second tab (which was tab1, https://example.com/1)
    await tabs.nth(1).click();
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://example.com/1');
    await expect(page.getByTestId('method-select')).toHaveValue('POST');
  });
});
