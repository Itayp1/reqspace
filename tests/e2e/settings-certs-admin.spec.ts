import { test, expect } from '@playwright/test';

/**
 * Three more surfaces that had no coverage: client certificates (mTLS),
 * the admin Add User modal, and the extension install prompt.
 *
 * Certificates are the interesting case for persistence — the server seals
 * the private key and passphrase and returns metadata only (SEC-8), so a
 * reload is the only way to confirm the row is really stored, and the only
 * thing that may come back is the hostname.
 */
test.describe('Certificates, admin users, extension prompt', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();

  // A throwaway self-signed pair's worth of text. The server seals and stores
  // it without parsing, so the exact bytes don't matter here.
  const CERT_PEM = '-----BEGIN CERTIFICATE-----\nMIIBdummycertforthetest\n-----END CERTIFICATE-----';
  const KEY_PEM = '-----BEGIN PRIVATE KEY-----\nMIIBdummykeyforthetest\n-----END PRIVATE KEY-----';

  test('a client certificate persists across a reload, and only metadata comes back', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Cert User');
    await page.getByTestId('register-email').fill(`cert_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    await page.getByTestId('settings-btn').click();
    await expect(page.getByText('No client certificates configured.')).toBeVisible();

    await page.getByTestId('cert-add-btn').click();
    await page.getByTestId('cert-hostname-input').fill('secure.internal.example');
    await page.getByTestId('cert-cert-input').fill(CERT_PEM);
    await page.getByTestId('cert-key-input').fill(KEY_PEM);
    await page.getByTestId('cert-passphrase-input').fill('cert-passphrase');

    const postPromise = page.waitForResponse(
      (r) => r.url().includes('/auth/certificates') && r.request().method() === 'POST'
    );
    await page.getByTestId('cert-save-btn').click();
    const postRes = await postPromise;
    expect(postRes.status()).toBe(201);

    // SEC-8: the response is metadata only. Nothing secret may come back.
    const body = await postRes.text();
    expect(body).toContain('secure.internal.example');
    expect(body).not.toContain('PRIVATE KEY');
    expect(body).not.toContain('cert-passphrase');

    await expect(page.getByTestId('cert-row')).toHaveCount(1);
    await expect(page.getByTestId('cert-hostname')).toHaveText('secure.internal.example');

    // The real check: it is on the server, not in this tab.
    await page.reload();
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('cert-row')).toHaveCount(1);
    await expect(page.getByTestId('cert-hostname')).toHaveText('secure.internal.example');

    // Deleting removes it for good, not just from the open modal.
    await page.getByTestId('cert-delete-btn').click();
    await expect(page.getByTestId('cert-row')).toHaveCount(0);
    await page.reload();
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('cert-row')).toHaveCount(0);
    await expect(page.getByText('No client certificates configured.')).toBeVisible();
  });

  test('a certificate needs a hostname, a cert and a key', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill(`cert_${ts}@example.com`);
    await page.getByTestId('login-password').fill('password123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('workspace-select')).toBeVisible();

    await page.getByTestId('settings-btn').click();
    await page.getByTestId('cert-add-btn').click();
    await page.getByTestId('cert-hostname-input').fill('missing-the-rest.example');
    await page.getByTestId('cert-save-btn').click();

    // Rejected client-side, and the form stays open with the input intact.
    await expect(page.getByText('Hostname, Cert, and Key are required')).toBeVisible();
    await expect(page.getByTestId('cert-hostname-input')).toHaveValue('missing-the-rest.example');
    await expect(page.getByTestId('cert-row')).toHaveCount(0);
  });

  test('an admin can create a user who can then log in', async ({ page, browser }) => {
    const newEmail = `created_${ts}@example.com`;

    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    await page.getByTestId('admin-dashboard-link').click();
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();

    await page.getByTestId("admin-add-user-btn").click();
    const modal = page.getByTestId('add-user-modal');
    await expect(modal).toBeVisible();
    await page.getByTestId('add-user-name').fill('Created User');
    await page.getByTestId('add-user-email').fill(newEmail);
    await page.getByTestId('add-user-password').fill('created-password-1');
    await page.getByTestId('add-user-submit-btn').click();
    await expect(modal).toBeHidden();

    await expect(page.locator('tr[data-testid^="user-row-"]').filter({ hasText: newEmail })).toBeVisible();

    // Still there after a reload, i.e. actually created rather than appended
    // to the table in memory.
    await page.reload();
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();
    await expect(page.locator('tr[data-testid^="user-row-"]').filter({ hasText: newEmail })).toBeVisible();

    // The strongest proof the user exists: they can sign in.
    const ctx = await browser.newContext();
    const fresh = await ctx.newPage();
    await fresh.goto('/login');
    await fresh.getByTestId('login-email').fill(newEmail);
    await fresh.getByTestId('login-password').fill('created-password-1');
    await fresh.getByTestId('login-submit').click();
    // Admin-created accounts are forced to change their password on first use.
    const forced = fresh.getByTestId('new-password-input');
    if (await forced.isVisible({ timeout: 8000 }).catch(() => false)) {
      await forced.fill('changed-password-1');
      await fresh.getByTestId('confirm-password-input').fill('changed-password-1');
      await fresh.getByTestId('change-password-submit').click();
      await expect(forced).toBeHidden();
    }
    await expect(fresh.getByTestId('workspace-select')).toBeVisible();
    await ctx.close();
  });

  test('a duplicate email is rejected with a message, not silently', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin');
    await page.getByTestId('login-submit').click();
    await page.getByTestId('admin-dashboard-link').click();
    await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();

    await page.getByTestId("admin-add-user-btn").click();
    await page.getByTestId('add-user-name').fill('Duplicate');
    await page.getByTestId('add-user-email').fill(`created_${ts}@example.com`);
    await page.getByTestId('add-user-password').fill('another-password-1');
    await page.getByTestId('add-user-submit-btn').click();

    // The modal stays open and says why.
    await expect(page.getByTestId('add-user-modal')).toBeVisible();
    await expect(page.getByTestId('toast-error')).toBeVisible();
  });

  test('the extension prompt appears in a plain browser and stays dismissed', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Ext User');
    await page.getByTestId('register-email').fill(`ext_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

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
