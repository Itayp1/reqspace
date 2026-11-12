import { test, expect } from '../fixtures';
import { mockServer, scene } from './scene';

// QA-41: params saved on a request were not sent when the stored URL has no query string.
test('QA-41: saved enabled params are sent when the URL has no query', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page, {
    url: 'https://mock.test/params-only',
    params: [{ key: 'p1', value: 'a', enabled: true }, { key: 'p2', value: 'b', enabled: true }, { key: 'off', value: 'x', enabled: false }],
  });
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  expect(seen.at(-1)!.url).toBe('https://mock.test/params-only?p1=a&p2=b');
});
