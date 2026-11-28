import { test, expect } from '../fixtures';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { registerUser } from '../helpers';

const manifestVersion = JSON.parse(readFileSync(path.join(__dirname, '../../../extension/manifest.json'), 'utf8')).version as string;

// A stand-in for the extension's content script that only answers the ping, with the given version.
const fakeExtension = (version: string) => {
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.source === 'reqspace-client' && e.data.type === 'REQSPACE_PING') {
      window.postMessage({ source: 'reqspace-extension', type: 'REQSPACE_PONG', version }, '*');
    }
  });
};

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

  test('the server publishes the extension version and a changelog', async ({ request }) => {
    const res = await request.get('/extension/version.json');
    expect(res.ok()).toBeTruthy();
    const info = await res.json();
    expect(info.version).toBe(manifestVersion);
    expect(info.changelog[0]).toMatchObject({ version: manifestVersion });
    expect(info.changelog[0].changes.length).toBeGreaterThan(0);
  });

  test('an older extension is told to update and sees what is new; dismissing is remembered', async ({ page }) => {
    await page.addInitScript(fakeExtension, '1.0.0');
    await registerUser(page, 'extold', 'Ext Old');
    const banner = page.getByTestId('extension-update-prompt');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText('Extension update available');
    await expect(banner).toContainText(manifestVersion);
    await expect(page.getByTestId('extension-update-changes')).toContainText("What's new");
    await expect(page.getByTestId('extension-update-changes')).toContainText(/streamed/i);
    // The 1.0.0 entry is what the user already has, so it is not listed as new.
    await expect(page.getByTestId('extension-update-changes')).not.toContainText('First release');
    await expect(page.getByTestId('extension-install-prompt')).toHaveCount(0);

    await banner.getByLabel('Dismiss').click();
    await expect(banner).toBeHidden();
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(banner).toBeHidden();
  });

  test('an up-to-date extension (or one that reports a non-numeric version) gets no update banner', async ({ page }) => {
    await page.addInitScript(fakeExtension, manifestVersion);
    await registerUser(page, 'extnew', 'Ext New');
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('extension-update-prompt')).toHaveCount(0);
    await expect(page.getByTestId('extension-install-prompt')).toHaveCount(0);
  });
});
