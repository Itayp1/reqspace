import { test, expect } from '../fixtures';
import { mockServer, scene } from './scene';

// QA-42: the "Check Status Code is 200" snippet (pm.response.to.have.status) threw in the sandbox.
test('QA-42: pm.response.to.have.status(200) passes, a wrong status fails, in a test script', async ({ page }) => {
  await mockServer(page);
  await scene(page, { testScript: 'pm.test("ok200", function () { pm.response.to.have.status(200); });\npm.test("is404", function () { pm.response.to.have.status(404); });' });
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  await page.getByTestId('response-tab-test_results').click();
  const items = page.getByTestId('test-result-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0).getByTestId('test-result-status')).toHaveText('PASS');
  await expect(items.nth(1).getByTestId('test-result-status')).toHaveText('FAIL');
});
