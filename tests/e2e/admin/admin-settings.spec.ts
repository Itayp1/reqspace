import { expandAdminSections, test, expect } from '../fixtures';
import { apiAsAdmin, loginAdminUi, expectToast } from '../helpers';
import net from 'net';
import type { AddressInfo } from 'net';
import fs from 'fs';
import path from 'path';

async function openAdminTab(page: import('@playwright/test').Page, tab: string) {
  await loginAdminUi(page);
  await page.getByTestId('admin-dashboard-link').click();
  await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();
  await page.getByTestId(`admin-tab-${tab}`).click();
}

test('Admin login and dashboard', async ({ page }) => {
  // 1. Go to login page
  await page.goto('/login');

  // 2. Login as admin (the superadmin the harness creates)
  await page.fill('[data-testid="login-email"]', 'admin');
  await page.fill('[data-testid="login-password"]', 'admin123456');
  let loginResPromise = page.waitForResponse(res => res.url().includes('/auth/login'));
  await page.click('[data-testid="login-submit"]');
  let loginRes = await loginResPromise;

  if (loginRes.status() === 401) {
    await page.fill('[data-testid="login-password"]', 'admin123456');
    loginResPromise = page.waitForResponse(res => res.url().includes('/auth/login'));
    await page.click('[data-testid="login-submit"]');
    loginRes = await loginResPromise;
  }

  // Wait for the reload to finish
  await page.waitForResponse(res => res.url().includes('/auth/me') && res.status() === 200, { timeout: 15000 });

  // Handle forced password change if it appears
  const newPasswordInput = page.locator('[data-testid="new-password-input"]');
  if (await newPasswordInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await newPasswordInput.fill('admin123456');
    await page.fill('[data-testid="confirm-password-input"]', 'admin123456');
    await page.click('[data-testid="change-password-submit"]');
    await expect(newPasswordInput).toBeHidden({ timeout: 5000 });
  }

  // 3. Navigate to Admin Dashboard
  await page.click('[data-testid="admin-dashboard-link"]');

  // 4. Verify Admin Dashboard loaded
  await expect(page.getByTestId('admin-dashboard-title')).toBeVisible();

  // 5. Verify Users tab
  await expect(page.locator('tr[data-testid^="user-row-"]').first()).toBeVisible();

  // 6. Go to Settings tab
  await page.click('[data-testid="admin-tab-settings"]');
  await expect(page.getByTestId('admin-settings-title')).toBeVisible();
  await expandAdminSections(page);
});

test('clicking a Settings checkbox label toggles it', async ({ page }) => {
  await openAdminTab(page, 'settings');
  await expandAdminSections(page);
  const box = page.getByTestId('admin-self-registration');
  const before = await box.isChecked();
  await page.getByText('2. Self Registration (Local DB Users)').click();
  await expect(box).toBeChecked({ checked: !before });
});

test.describe('Q9.6 SMTP test connection double click', () => {
  test('[Q9.6] double-clicking Test Connection sends a single request', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/admin/test-smtp', async (route) => {
      calls++;
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'ok' }) });
    });
    await openAdminTab(page, 'settings');
    await expandAdminSections(page);
    const smtp = page.getByTestId('admin-smtp-enabled');
    if (!(await smtp.isChecked())) await smtp.check();
    await page.getByTestId('admin-smtp-host').fill('smtp.example.test');
    const btn = page.getByTestId('admin-smtp-test');
    await btn.dblclick({ delay: 0 });
    // Also fire two clicks in the same task, before React can re-render the disabled state.
    await btn.evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
    await expect(btn).toHaveText('Test Connection', { timeout: 10_000 });
    expect(calls).toBe(1);
  });
});

// Finding 8: the Admin → Settings text for "Allow requests to internal/private network addresses"
// claimed the guard blocks every user's "Send". Send runs from the browser/desktop app, so the
// server-side SSRF guard only covers requests the server makes itself (URL imports).
test('Admin settings SSRF text does not claim to govern "Send"', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../../client/src/pages/AdminPage.tsx'), 'utf8');
  // The private-network toggle is no longer rendered in the Admin UI (the server proxy relay was removed),
  // so the page must simply not make the old claim; if the toggle returns, its text must carry the caveats.
  expect(src).not.toContain(`every user's "Send"`);
  const start = src.indexOf('Allow requests to internal/private network addresses');
  if (start === -1) return;
  const text = src.slice(start, start + 1200).replace(/\s+/g, ' ');
  expect(text).toContain("on a user's behalf");
  expect(text).toContain('It does not affect "Send"');
});

// These tests save the shared system config (history limits, SMTP, allowPrivateTargets, the whole
// server-settings form), so they must not run in parallel with each other.
test.describe('Admin settings that change the saved config', () => {
  test.describe.configure({ mode: 'serial' });

  test('login + dashboard render only system config update', async ({ page }) => {
    await openAdminTab(page, 'settings');
    await expect(page.getByTestId('admin-settings-title')).toBeVisible();
    await expandAdminSections(page);

    // Update configuration
    const historyInput = page.locator('label:has-text("Max Total History per User MB") + input');
    const original = await historyInput.inputValue();
    await historyInput.fill('25');

    // Save
    const savePromise = page.waitForResponse(res => res.url().includes('/admin/config') && res.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save System Config' }).click();
    const saveRes = await savePromise;
    if (saveRes.status() !== 200) {
      console.error('SAVE CONFIG FAILED:', saveRes.status(), await saveRes.text());
    }
    expect(saveRes.status()).toBe(200);

    // Reload and verify
    await page.reload();
    await page.click('[data-testid="admin-tab-settings"]');
    await expect(page.getByTestId('admin-settings-title')).toBeVisible();
    await expandAdminSections(page);
    await expect(historyInput).toHaveValue('25');

    // Revert to the value it had before
    await historyInput.fill(original);
    const revertPromise = page.waitForResponse(res => res.url().includes('/admin/config') && res.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save System Config' }).click();
    await revertPromise;
  });

  test('SMTP and Google OAuth settings are saved; Test Connection reports a failure', async ({ page }) => {
    const ts = Date.now();
    await openAdminTab(page, 'settings');
    await expandAdminSections(page);
    await expect(page.getByTestId('admin-settings-title')).toBeVisible();

    const smtp = page.getByTestId('admin-smtp-enabled');
    if (!(await smtp.isChecked())) await smtp.check();
    await page.getByTestId('admin-smtp-host').fill('127.0.0.1');
    await page.getByTestId('admin-smtp-port').fill('1');
    await page.getByTestId('admin-smtp-from').fill(`noreply-${ts}@example.test`);

    const google = page.getByTestId('admin-google-enabled');
    if (!(await google.isChecked())) await google.check();
    await page.getByTestId('admin-google-client-id').fill(`client-${ts}.apps.example`);

    const save = page.waitForResponse(r => r.url().includes('/admin/config') && r.request().method() === 'PUT');
    await page.getByTestId('admin-save-config').click();
    expect((await save).status()).toBe(200);

    await page.getByTestId('admin-smtp-test').click();
    // 127.0.0.1 is a private target, so the guard rejects it before any connection is attempted.
    await expectToast(page, 'error', /SMTP connection failed|private network/i);

    await page.reload();
    await page.getByTestId('admin-tab-settings').click();
    await expandAdminSections(page);
    await expect(page.getByTestId('admin-smtp-host')).toHaveValue('127.0.0.1');
    await expect(page.getByTestId('admin-smtp-from')).toHaveValue(`noreply-${ts}@example.test`);
    await expect(page.getByTestId('admin-google-client-id')).toHaveValue(`client-${ts}.apps.example`);

    // Leave Google OAuth off so the login page of later tests is unchanged.
    await page.getByTestId('admin-google-enabled').uncheck();
    await page.getByTestId('admin-smtp-enabled').uncheck();
    const revert = page.waitForResponse(r => r.url().includes('/admin/config') && r.request().method() === 'PUT');
    await page.getByTestId('admin-save-config').click();
    await revert;
  });

  test('[Q8.1] System Settings has max-records and retention-days fields that persist', async ({ page }) => {
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    try {
      await openAdminTab(page, 'settings');
      await expandAdminSections(page);
      const maxRecords = page.getByTestId('admin-history-max-records');
      const retention = page.getByTestId('admin-history-retention-days');
      await expect(maxRecords).toBeVisible();
      await expect(retention).toBeVisible();
      await maxRecords.fill('777');
      await retention.fill('45');
      await page.getByTestId('admin-save-config').click();
      await expect.poll(async () => {
        const cfg = await (await admin.get('/api/admin/config')).json();
        return `${cfg.history?.maxRecords}/${cfg.history?.retentionDays}`;
      }).toBe('777/45');
    } finally {
      await admin.put('/api/admin/config', {
        data: { history: { maxRecords: before.history?.maxRecords ?? 0, retentionDays: before.history?.retentionDays ?? 0 } },
      });
    }
  });

  // allowPrivateTargets switch (SMTP test; the server no longer fetches URLs for users)
  test('[Q8.6] SMTP Test Connection to a private address is blocked when off and reaches the host when on', async () => {
    // Minimal SMTP responder: greets, answers EHLO, accepts QUIT.
    let hits = 0;
    const CRLF = String.fromCharCode(13, 10);
    const smtp = net.createServer((sock) => {
      hits++;
      sock.write('220 q86.test ESMTP' + CRLF);
      sock.on('data', (d) => {
        const line = d.toString().toUpperCase();
        if (line.startsWith('EHLO') || line.startsWith('HELO')) sock.write('250 q86.test' + CRLF);
        else if (line.startsWith('QUIT')) sock.end('221 bye' + CRLF);
        else sock.write('250 OK' + CRLF);
      });
    });
    await new Promise<void>((r) => smtp.listen(0, '127.0.0.1', r));
    const port = (smtp.address() as AddressInfo).port;
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    const original = !!before.proxy?.allowPrivateTargets;
    try {
      expect((await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: false } } })).ok()).toBeTruthy();
      const started = Date.now();
      const blocked = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port } });
      expect(blocked.status()).toBe(400);
      expect((await blocked.json()).message).toMatch(/private|internal|blocked/i);
      // Q9.2: must be rejected up front, not after a network timeout.
      expect(Date.now() - started).toBeLessThan(3000);
      expect(hits).toBe(0);

      expect((await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: true } } })).ok()).toBeTruthy();
      // Wait out the 1s duplicate-check cooldown is unnecessary: the guard key includes the policy.
      const allowed = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port } });
      const body = await allowed.json();
      expect(allowed.status()).toBe(200);
      expect(body.message).toContain(`127.0.0.1:${port}`);
      expect(hits).toBeGreaterThan(0);
    } finally {
      await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: original } } });
      smtp.close();
    }
  });

  test('Ctrl+Z reverts an unsaved admin setting and Ctrl+S saves', async ({ page }) => {
    await openAdminTab(page, 'settings');
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
});
