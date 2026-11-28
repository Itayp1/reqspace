import { test, expect, type Locator, type Page } from '../fixtures';
import { registerUser } from '../helpers';

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
    await registerUser(page, 'tabs', 'Tab User');
    
    // Create first request tab and save into a new collection
    await page.getByTestId('create-request-btn').click();
    await page.getByTestId('request-url-input').fill('https://httpbin.org/get');
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
      await page.getByTestId('prompt-input').fill('Tab Collection');
      await page.getByTestId('prompt-input').press('Enter');
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
    await registerUser(page, 'tabs2', 'Tab User2');
    
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

/**
 * Tab housekeeping. The tab context menu used to close tabs with unsaved
 * edits without asking; it now confirms first, like the x button.
 */
test.describe('Tab close and context menu', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'tabs_hist');
  });

  async function openTabs(page: import('@playwright/test').Page, urls: string[]) {
    for (const url of urls) {
      await page.getByTestId('new-tab-btn').click();
      await page.getByTestId('request-url-input').fill(url);
    }
    // The url edits make every one of these tabs dirty; that's what the
    // confirmations below are about. Mark them clean by reading their count.
    await expect(page.locator('[data-testid^="tab-"]').filter({ has: page.getByTestId('close-tab-btn') })).toHaveCount(urls.length);
  }

  const tabs = (page: import('@playwright/test').Page) =>
    page.locator('[data-testid^="tab-"]').filter({ has: page.getByTestId('close-tab-btn') });

  test('closing a dirty tab asks first; Cancel keeps it, confirming closes it', async ({ page }) => {
    await openTabs(page, ['https://one.example.test']);
    await tabs(page).first().getByTestId('close-tab-btn').click();
    await expect(page.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible();
    await page.getByTestId('confirm-cancel-btn').click();
    await expect(tabs(page)).toHaveCount(1);

    await tabs(page).first().getByTestId('close-tab-btn').click();
    await page.getByTestId('confirm-btn').click();
    await expect(tabs(page)).toHaveCount(0);
    await expect(page.getByTestId('create-request-btn')).toBeVisible();
  });

  test('the tab context menu closes others / to the right / to the left, confirming unsaved ones', async ({ page }) => {
    await openTabs(page, ['https://a.example.test', 'https://b.example.test', 'https://c.example.test', 'https://d.example.test']);

    // Close All to the Right of the 2nd tab -> a, b remain.
    await tabs(page).nth(1).click({ button: 'right' });
    await page.getByTestId('tab-menu-close-right').click();
    await expect(page.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible();
    await page.getByTestId('confirm-btn').click();
    await expect(tabs(page)).toHaveCount(2);

    // Close All to the Left of the 2nd tab -> only b remains.
    await tabs(page).nth(1).click({ button: 'right' });
    await page.getByTestId('tab-menu-close-left').click();
    await page.getByTestId('confirm-btn').click();
    await expect(tabs(page)).toHaveCount(1);
    await expect(page.getByTestId('request-url-input')).toHaveValue('https://b.example.test');

    // Close Other Tabs, cancelled, keeps everything.
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://e.example.test');
    await tabs(page).first().click({ button: 'right' });
    await page.getByTestId('tab-menu-close-others').click();
    await page.getByTestId('confirm-cancel-btn').click();
    await expect(tabs(page)).toHaveCount(2);
  });
});

/** UX (QA-68): the tab bar scrolls without a visible scrollbar; long tab names have a tooltip. */
test('tab bar hides its scrollbar and tabs carry a title tooltip', async ({ page }) => {
  await registerUser(page, 'uxtabs');
  await page.getByTestId('new-tab-btn').click();
  const bar = page.getByTestId('new-tab-btn').locator('xpath=ancestor::div[contains(@class,"scrollbar-hide")][1]');
  await expect(bar).toHaveCSS('scrollbar-width', 'none');
  await expect(bar.locator('span.truncate').first()).toHaveAttribute('title', /.+/);
});

test('request tab method label uses the theme method token', async ({ page }) => {
  await registerUser(page, 'tab_method_color');
  await page.getByTestId('new-tab-btn').click();
  const label = page.locator('[data-testid^="tab-"]').filter({ has: page.getByTestId('close-tab-btn') }).first().getByText('GET', { exact: true });
  const [actual, token] = await Promise.all([
    label.evaluate(el => getComputedStyle(el).color),
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-get)';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }),
  ]);
  expect(actual).toBe(token);
});

test('Escape cancels a confirm dialog and keeps the dirty tab', async ({ page }) => {
  await registerUser(page, 'esc_modals');
  // A dirty-tab close prompts a ConfirmModal; Escape cancels it and keeps the tab.
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('request-url-input').fill('https://esc.example.test');
  await page.getByTestId('close-tab-btn').first().click();
  await expect(page.getByTestId('confirm-cancel-btn')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('confirm-cancel-btn')).toBeHidden();
  await expect(page.getByTestId('close-tab-btn')).toHaveCount(1);
});
