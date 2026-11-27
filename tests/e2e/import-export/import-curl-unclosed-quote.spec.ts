import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/** QA-70: Import stayed enabled for a cURL command with an unclosed quote. */
test('cURL import is disabled with a parse error until the command is valid', async ({ page }) => {
  await registerUser(page, 'curl_bad');
  await page.getByTestId('import-btn').click();
  await page.getByTestId('import-tab-curl').click();
  await page.getByTestId('import-curl-input').fill("curl -X GET http://localhost:3205/x -H 'X-Probe: 1");
  await expect(page.getByTestId('import-submit')).toBeDisabled();
  await expect(page.getByTestId('import-curl-error')).toContainText('Unclosed');

  await page.getByTestId('import-curl-input').fill("curl -X GET http://localhost:3205/x -H 'X-Probe: 1'");
  await expect(page.getByTestId('import-submit')).toBeEnabled();
});
