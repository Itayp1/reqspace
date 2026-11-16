import { test, expect } from '../fixtures';
import { loginAdminUi, registerUser } from '../helpers';

test.describe('admin screen exit, shortcuts and environment UX', () => {
  test('admin screen has a Close button that returns to the app', async ({ page }) => {
    await loginAdminUi(page);
    await page.goto('/admin');
    await page.getByTestId('admin-close').click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('Ctrl+Z reverts an unsaved admin setting and Ctrl+S saves', async ({ page }) => {
    await loginAdminUi(page);
    await page.goto('/admin');
    await page.getByTestId('admin-tab-settings').click();
    await page.getByTestId('admin-server-settings').getByRole('button').first().click();
    const box = page.getByTestId('admin-server-capture-auth-failures');
    const before = await box.isChecked();
    await box.click();
    await expect(box).toBeChecked({ checked: !before });
    await page.getByTestId('admin-dashboard-title').click(); // focus off the checkbox
    await page.keyboard.press('Control+z');
    await expect(box).toBeChecked({ checked: before });
    await page.keyboard.press('Control+s');
    await expect(page.getByText('Config saved')).toBeVisible();
  });

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
