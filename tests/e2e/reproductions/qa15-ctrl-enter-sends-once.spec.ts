import { test, expect } from '../fixtures';
import { mockServer, scene } from './scene';

// QA-15: Ctrl+Enter in the URL bar sent the request twice (window shortcut + the input's Enter handler).
test('QA-15: Ctrl+Enter in the URL bar sends exactly once', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page);
  await page.getByTestId('request-url-input').click();
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('response-status')).toContainText('200');
  await page.waitForTimeout(500);
  expect(seen.length).toBe(1);
});
