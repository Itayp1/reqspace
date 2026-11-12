import { test, expect } from '../fixtures';
import { mockServer, scene } from './scene';

// QA-43: the snippets must say which pm.request.headers API is supported (object assignment, not add()).
test('QA-43: pre-request snippet documents pm.request.headers assignment and it works', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page);
  await page.getByTestId('req-tab-pre-request-script').click();
  await page.getByText('Set request header (pre-request)').click();
  await expect(page.getByTestId('monaco-editor-container')).toContainText('headers.add() is not supported');
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  expect(seen.some((r) => r.headers['x-header'] === 'value')).toBeTruthy();
});
