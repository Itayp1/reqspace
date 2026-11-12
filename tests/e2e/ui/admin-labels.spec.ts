import { test, expect } from '../fixtures';
import { loginAdminUi } from '../helpers';

async function openTab(page: import('@playwright/test').Page, tab: string) {
  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await page.getByTestId(`admin-tab-${tab}`).click();
}

test('Logs and Errors date filters show visible From / To labels', async ({ page }) => {
  await openTab(page, 'logs');
  await expect(page.locator('label', { hasText: /^From/ }).first()).toBeVisible();
  await expect(page.locator('label', { hasText: /^To/ }).first()).toBeVisible();
  await page.getByTestId('admin-tab-errors').click();
  await expect(page.locator('label', { hasText: /^From/ }).first()).toBeVisible();
});

test('clicking a Settings checkbox label toggles it', async ({ page }) => {
  await openTab(page, 'settings');
  const box = page.getByTestId('admin-self-registration');
  const before = await box.isChecked();
  await page.getByText('2. Self Registration (Local DB Users)').click();
  await expect(box).toBeChecked({ checked: !before });
});
