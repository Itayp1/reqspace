import { test, expect } from '../fixtures';
import { scene } from './scene';

test.use({ allowFpErrors: [/Network Error|Failed to fetch/] });

// QA-66/QA-109: an undefined {{variable}} was reported as a generic network/CORS error without naming it.
test('QA-109: the response pane names the undefined variable', async ({ page }) => {
  await scene(page, { url: '{{nohost}}/get' });
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('0');
  await expect(page.getByTestId('response-body-viewer')).toContainText('nohost');
  await expect(page.getByTestId('response-body-viewer')).toContainText('not defined') // string match: the viewer renders spaces as nbsp, which a regex would not match;
  await expect(page.getByTestId('response-body-viewer')).not.toContainText(/CORS/);
});
