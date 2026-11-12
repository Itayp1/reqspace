import { test, expect } from './fixtures';
import { registerUser } from './helpers';

test('history Save/Delete buttons become visible when keyboard focus lands in the row', async ({ page }) => {
  await registerUser(page, 'hist_kbd');
  await page.route('https://hist.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('request-url-input').fill('https://hist.example.test/kbd');
  const saved = page.waitForResponse(r => /\/history$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByTestId('request-send-btn').click();
  await saved;
  await page.getByTestId('tab-history').click();
  const del = page.getByTestId('history-item').first().getByTitle('Delete');
  await expect(del).toHaveCSS('opacity', '0');
  await del.focus();
  await expect(del).toHaveCSS('opacity', '1');
});
