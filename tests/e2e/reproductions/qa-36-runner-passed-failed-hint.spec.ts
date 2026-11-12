import { test, expect } from '../fixtures';

// QA-36: Passed/Failed counts for responses without tests are unexplained.
test('QA-36: runner Passed/Failed boxes explain how a request is counted', async ({ page }) => {
  await page.goto('/register');
  await page.getByTestId('register-name').fill('Runner User');
  await page.getByTestId('register-email').fill(`qa36_${Date.now()}@example.com`);
  await page.getByTestId('register-password').fill('password123');
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/.*\/$/);

  await page.getByTestId('new-collection-empty-btn').click();
  await page.getByTestId('prompt-input').fill('Run Col');
  await page.getByTestId('prompt-submit').click();

  const node = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Run Col') });
  await node.hover();
  await node.getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-new-request').click();
  await page.getByTestId('prompt-input').fill('R1');
  await page.getByTestId('prompt-submit').click();

  await node.hover();
  await node.getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-run-collection').click();
  await page.getByTestId('collection-runner-run-btn').click();

  await expect(page.getByTestId('runner-passed')).toHaveAttribute('title', /no tests.*2xx or 3xx/i);
  await expect(page.getByTestId('runner-failed')).toHaveAttribute('title', /no tests.*400 or more/i);
});
