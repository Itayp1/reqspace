import { test, expect } from './fixtures';
import { registerUser } from './helpers';

/**
 * Tab housekeeping, history housekeeping and the theme toggle — the parts of
 * those features no spec exercised. The tab context menu used to close tabs
 * with unsaved edits without asking; it now confirms first, like the x button.
 */
test.describe('Tabs, history and theme', () => {
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

  test('history: delete one entry, then clear all', async ({ page }) => {
    await page.route('https://hist.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
    for (const path of ['first', 'second']) {
      await page.getByTestId('new-tab-btn').click();
      await page.getByTestId('request-url-input').fill(`https://hist.example.test/${path}`);
      const saved = page.waitForResponse(r => /\/history$/.test(r.url()) && r.request().method() === 'POST');
      await page.getByTestId('request-send-btn').click();
      await saved;
    }
    await page.getByTestId('tab-history').click();
    const items = page.getByTestId('history-item');
    await expect(items).toHaveCount(2);

    const del = page.waitForResponse(r => /\/api\/history\//.test(r.url()) && r.request().method() === 'DELETE');
    // The row's actions only show on hover.
    await items.filter({ hasText: '/first' }).hover();
    await items.filter({ hasText: '/first' }).getByTitle('Delete').click();
    expect((await del).status()).toBe(200);
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('/second');

    await page.getByTitle('Clear All').click();
    await page.getByTestId('confirm-btn').click();
    await expect(items).toHaveCount(0);
    await page.reload();
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-item')).toHaveCount(0);
  });

  test('turning off "Save Request History" stops logging new sends', async ({ page }) => {
    await page.route('https://nohist.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
    await page.getByTestId('tab-history').click();
    // Controlled checkbox: it only flips once the confirmation is accepted.
    await page.locator('#saveHistoryToggle').click();
    await page.getByTestId('confirm-btn').click();
    await expect(page.locator('#saveHistoryToggle')).not.toBeChecked();

    let historyPosts = 0;
    page.on('request', (r) => { if (/\/history$/.test(r.url()) && r.method() === 'POST') historyPosts++; });
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://nohist.example.test/x');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(historyPosts).toBe(0);
    await expect(page.getByTestId('history-item')).toHaveCount(0);

    // Back on, so the setting doesn't leak into anything else this user does.
    await page.locator('#saveHistoryToggle').click();
    await expect(page.locator('#saveHistoryToggle')).toBeChecked();
  });

  test('the theme toggle switches dark/light and the choice survives a reload', async ({ page }) => {
    const html = page.locator('html');
    const startsDark = await html.evaluate(el => el.classList.contains('dark'));
    await page.getByRole('button', { name: startsDark ? 'Switch to light mode' : 'Switch to dark mode' }).click();
    await expect.poll(() => html.evaluate(el => el.classList.contains('dark'))).toBe(!startsDark);
    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await expect.poll(() => html.evaluate(el => el.classList.contains('dark'))).toBe(!startsDark);
  });
});
