import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/** History housekeeping and the theme toggle. */
test.describe('Tabs, history and theme', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'tabs_hist');
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

test.describe('Theme follows the system and the editor', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('[P5.2] first visit follows prefers-color-scheme (light and dark), then the choice persists', async ({ browser }) => {
    for (const scheme of ['light', 'dark'] as const) {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await registerUser(page, 'p52');
      const html = page.locator('html');
      await expect.poll(() => html.evaluate((el) => el.classList.contains('dark'))).toBe(scheme === 'dark');
      await page.reload();
      await expect(page.getByTestId('workspace-select')).toBeVisible();
      await expect.poll(() => html.evaluate((el) => el.classList.contains('dark'))).toBe(scheme === 'dark');
      await ctx.close();
    }
  });

  test('[P5.3] the Monaco editor follows the theme switch live', async ({ page }) => {
    await registerUser(page, 'p53');
    await page.getByTestId('create-request-btn').click();
    await page.getByTestId('req-tab-pre-request-script').click();
    const monaco = page.locator('.monaco-editor').first();
    await expect(monaco).toBeVisible({ timeout: 20000 });
    const html = page.locator('html');
    const startsDark = await html.evaluate((el) => el.classList.contains('dark'));
    const isDarkEditor = () => monaco.evaluate((el) => el.classList.contains('vs-dark'));
    expect(await isDarkEditor()).toBe(startsDark);
    await page.getByRole('button', { name: startsDark ? 'Switch to light mode' : 'Switch to dark mode' }).click();
    await expect.poll(isDarkEditor).toBe(!startsDark);
  });
});
