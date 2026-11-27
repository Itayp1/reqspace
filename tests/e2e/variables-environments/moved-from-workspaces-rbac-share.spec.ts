import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

test.describe('App shell', () => {
  test('dynamic variables resolve to fresh values when the request is sent', async ({ page }) => {
    await registerUser(page, 'shell_dyn');
    const seen: string[] = [];
    await page.route('https://dyn.example.test/**', (route) => {
      seen.push(route.request().url());
      return route.fulfill({ status: 200, body: 'ok' });
    });
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://dyn.example.test/item?id={{$guid}}&n={{$randomInt}}&t={{$timestamp}}');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]);
    expect(url.searchParams.get('id')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(url.searchParams.get('n')).toMatch(/^\d+$/);
    expect(Number(url.searchParams.get('t'))).toBeGreaterThan(1_700_000_000);
  });
});
