import { test, expect } from './fixtures';
import { registerUser } from './helpers';

test('Get app button is hidden inside the desktop app', async ({ page }) => {
  await page.addInitScript(() => { (window as any).electron = {}; });
  await registerUser(page, 'get_app_el');
  await expect(page.getByTestId('env-select')).toBeVisible();
  await expect(page.getByTestId('get-app-btn')).toHaveCount(0);
});

test('Get app button opens the download modal with desktop and extension links; Escape closes', async ({ page }) => {
  await registerUser(page, 'get_app');
  await page.getByTestId('get-app-btn').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Download Extension \(\.zip\)/ })).toHaveAttribute('href', /reqspace-transport\.zip$/);
  await expect(dialog.getByRole('link', { name: /\.crx in a \.zip/ })).toHaveAttribute('href', /reqspace-transport-crx\.zip$/);
  await expect(dialog.getByRole('link', { name: /Desktop app \(Windows\)/ })).toHaveAttribute('href', /reqSpace-Setup\.exe$/);
  await expect(dialog.getByRole('link', { name: /standalone/ })).toHaveAttribute('href', /reqSpace-Portable\.exe$/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
