import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

test.describe('missing-variable modal and environment selector UX', () => {
  test('sending a request with an undefined {{variable}} asks about it, and Run Anyway is remembered', async ({ page }) => {
    await registerUser(page, 'missingvar');
    let hits = 0;
    await page.route('https://mv.example.test/**', (route) => { hits++; return route.fulfill({ status: 200, body: 'ok' }); });
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://mv.example.test/{{phoneNumber}}');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('missing-variables-modal')).toBeVisible();
    await expect(page.getByTestId('missing-var-phoneNumber')).toBeVisible();
    await page.getByRole('button', { name: 'Run Anyway' }).click();
    await expect.poll(() => hits).toBe(1);
    await page.getByTestId('request-send-btn').click();
    await expect.poll(() => hits).toBe(2);
    await expect(page.getByTestId('missing-variables-modal')).toHaveCount(0);
  });

  test('the environment editor shows the active environment and switches it', async ({ page }) => {
    await registerUser(page, 'envsel');
    await page.getByTestId('tab-environments').click();
    for (const name of ['EnvA', 'EnvB']) {
      await page.getByTestId('new-env-btn').click();
      await page.getByTestId('prompt-input').fill(name);
      await page.getByTestId('prompt-input').press('Enter');
      await expect(page.getByTestId(`env-node-${name}`)).toBeVisible();
    }
    const select = page.getByTestId('env-active-select');
    await select.selectOption({ label: 'EnvA' });
    await expect(page.getByTestId('env-select')).toHaveValue(await select.inputValue());
    await select.selectOption({ label: 'EnvB' });
    await expect(page.getByTestId('env-select').locator('option:checked')).toHaveText('EnvB');
  });
});
