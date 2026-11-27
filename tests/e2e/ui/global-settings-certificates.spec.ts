import { test, expect } from '../fixtures';

/**
 * Client certificates (mTLS), desktop only.
 *
 * Certificates are the interesting case for persistence — the server seals
 * the private key and passphrase and returns metadata only (SEC-8), so a
 * reload is the only way to confirm the row is really stored, and the only
 * thing that may come back is the hostname.
 */
test.describe('Certificates', () => {
  test.describe.configure({ mode: 'serial' });

  const ts = Date.now();

  // A real throwaway self-signed pair: the server validates PEM and key/cert match.
  const CERT_PEM = "-----BEGIN CERTIFICATE-----\r\nMIIBhzCCAS2gAwIBAgIUSC01PKBBLEzZ4okJFaSgUTfq454wCgYIKoZIzj0EAwIw\r\nGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDAgFw0yNjEwMTYwOTM4NTBaGA8yMTI2\r\nMDkyMjA5Mzg1MFowGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDBZMBMGByqGSM49\r\nAgEGCCqGSM49AwEHA0IABKTR0pLsVVpt/H4g2XcyGnYR4CKehPYxaTxALWy32T15\r\nQN2AGDqLgMknFCgGu1Z6Hvp5YQtlz6ZUYow90cP910CjUzBRMB0GA1UdDgQWBBRa\r\nFZjWtRBOs5BKsYxKZZZQhFcYsTAfBgNVHSMEGDAWgBRaFZjWtRBOs5BKsYxKZZZQ\r\nhFcYsTAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQC8VVrIpLt0\r\nG1bGJQSqK8SoqGJqrjYyLhhqX+8/drKmqQIgETNqoXOhtRdIH8ec/vv9o4hIC5bg\r\nzPI4mEPRkPc4dw8=\r\n-----END CERTIFICATE-----";
  const KEY_PEM = "-----BEGIN PRIVATE KEY-----\r\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgnrQB7AqhdPqXamWJ\r\nv+LJM+oqmHIRWaB7Iylu9LrMLkChRANCAASk0dKS7FVabfx+INl3Mhp2EeAinoT2\r\nMWk8QC1st9k9eUDdgBg6i4DJJxQoBrtWeh76eWELZc+mVGKMPdHD/ddA\r\n-----END PRIVATE KEY-----";

  test('a client certificate persists across a reload, and only metadata comes back', async ({ page }) => {
    test.skip(process.env.REQSPACE_TARGET !== 'electron', 'client certificates UI is desktop-only');
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
    test.skip(process.env.REQSPACE_TARGET !== 'electron', 'client certificates UI is desktop-only');
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
});
