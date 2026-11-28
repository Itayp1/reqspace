import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

test.describe('Extension install prompt', () => {
  // same allow list the prompt test had at file level in settings-certs-admin.spec.ts
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });


  test('the extension prompt appears in a plain browser and stays dismissed', async ({ page }) => {
    await registerUser(page, 'ext', 'Ext User');

    // Chromium here has no extension, so the prompt shows after its probe.
    const prompt = page.getByTestId('extension-install-prompt');
    await expect(prompt).toBeVisible({ timeout: 10000 });
    await expect(prompt).toContainText('Extension not active');

    // "How to install" opens the download instructions.
    await prompt.getByRole('button', { name: 'How to install' }).click();
    await expect(page.getByText(/Load unpacked|chrome:\/\/extensions/i).first()).toBeVisible();
    await page.keyboard.press('Escape');

    await prompt.getByLabel('Dismiss').click();
    await expect(prompt).toBeHidden();

    // The dismissal is remembered across reloads, so it isn't nagging.
    await page.reload();
    await page.waitForTimeout(2500); // past the 1500ms extension probe
    await expect(prompt).toBeHidden();
  });
});
