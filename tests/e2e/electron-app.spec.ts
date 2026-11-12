import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { apiAsAdmin } from './helpers';
import { startMockIdp, enableCustomProvider, disableCustomProvider } from './mock-idp';
import fs from 'fs';
import { launchDesktopApp, makeUserDataDir, electronEnv, MAIN_JS, CLIENT_ORIGIN } from './electron-target';

// Desktop-app behaviour that only exists in Electron (MANUAL_TEST_PLAN T5.4, T7.1, T10.1).
// These launch their own app, so they only run in the electron project.
test.skip(process.env.REQSPACE_TARGET !== 'electron', 'desktop-only: run with REQSPACE_TARGET=electron');

// Replaces shell.openExternal in the main process and records what the app tried to open.
async function recordExternalOpens(app: Awaited<ReturnType<typeof launchDesktopApp>>) {
  await app.evaluate(({ shell }) => {
    (globalThis as any).__opened = [];
    (shell as any).openExternal = async (url: string) => { (globalThis as any).__opened.push(url); };
  });
  return () => app.evaluate(() => (globalThis as any).__opened as string[]);
}

test.describe('Electron desktop app', () => {
  let userData: string;
  test.beforeEach(() => { userData = makeUserDataDir(); });
  test.afterEach(() => { fs.rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); });

  test('[T10.1] a second launch does not open a second window', async () => {
    const app = await launchDesktopApp(userData);
    await (await app.firstWindow()).waitForLoadState('domcontentloaded');

    // Same --user-data-dir = the same installation: the second process must hand over and exit.
    const electronPath = require('electron') as unknown as string;
    const second = spawn(electronPath, [MAIN_JS, `--user-data-dir=${userData}`], { env: electronEnv(), stdio: 'ignore' });
    const exited = await Promise.race([
      new Promise<boolean>((resolve) => second.on('exit', () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15_000)),
    ]);
    if (!exited) second.kill();
    expect(exited, 'second instance should quit on its own').toBe(true);
    expect(app.windows()).toHaveLength(1);
    await app.close();
  });

  test('[T7.1] a target=_blank link opens in the system browser, not in the app', async () => {
    const app = await launchDesktopApp(userData);
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const opened = await recordExternalOpens(app);

    await page.evaluate(() => window.open('https://example.com/docs', '_blank'));
    await expect.poll(opened).toEqual(['https://example.com/docs']);
    expect(app.windows()).toHaveLength(1);
    await app.close();
  });

  test('[T5.4] the window cannot be navigated to a foreign site', async () => {
    const app = await launchDesktopApp(userData);
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const opened = await recordExternalOpens(app);

    await expect(async () => {
      await page.evaluate(() => { window.location.href = 'https://example.org/phish'; });
    }).toPass();
    await expect.poll(opened).toEqual(['https://example.org/phish']);
    expect(new URL(page.url()).origin).toBe(CLIENT_ORIGIN);

    // Navigation inside the app's own origin keeps working.
    // The SPA can still be redirecting itself on startup; retry until the context is stable.
    await expect(async () => {
      await page.evaluate(() => { setTimeout(() => { window.location.href = '/login'; }, 0); });
    }).toPass();
    await expect(page).toHaveURL(`${CLIENT_ORIGIN}/login`);
    await app.close();
  });

  test('[T5.4] sign-in providers (Google / Microsoft Entra) stay inside the window', async () => {
    const app = await launchDesktopApp(userData);
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const opened = await recordExternalOpens(app);

    // LoginPage does window.location.href = <provider authorize URL>; the callback must come back to this window.
    for (const idp of ['https://accounts.google.com/o/oauth2/v2/auth', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize']) {
      await expect(async () => {
        await page.evaluate((u) => { setTimeout(() => { window.location.href = u; }, 0); }, idp);
      }).toPass();
      await page.waitForTimeout(1500);
      expect(await opened()).toEqual([]);
      await page.goto('/login').catch(() => {});
    }
    await app.close();
  });

  test('[T5.4] the admin-configured custom identity provider stays inside the window; other hosts do not', async () => {
    const idp = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>mock idp</title>'); });
    await new Promise<void>((r) => idp.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`;
    const admin = await apiAsAdmin();
    await admin.put('/api/admin/config', { data: { auth: { customOAuth: { enabled: true, clientId: 'c', authorizeUrl: `${base}/authorize`, tokenUrl: `${base}/token`, userinfoUrl: `${base}/userinfo` } } } });
    try {
      const app = await launchDesktopApp(userData);
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      const opened = await recordExternalOpens(app);

      // Another path on the same host is not the configured endpoint: it goes to the system browser.
      await expect(async () => {
        await page.evaluate((u) => { setTimeout(() => { window.location.href = u; }, 0); }, `${base}/somewhere-else`);
      }).toPass();
      await expect.poll(opened).toEqual([`${base}/somewhere-else`]);

      // The configured authorize endpoint loads in this window.
      await expect(async () => {
        await page.evaluate((u) => { setTimeout(() => { window.location.href = u; }, 0); }, `${base}/authorize?client_id=c`);
      }).toPass();
      await expect.poll(() => page.url(), { timeout: 15000 }).toContain(`${base}/authorize`);
      expect(await opened()).toEqual([`${base}/somewhere-else`]);
      await app.close();
    } finally {
      await admin.put('/api/admin/config', { data: { auth: { customOAuth: { enabled: false } } } });
      await new Promise<void>((r) => idp.close(() => r()));
    }
  });

  test('[T5.4] signing in through a custom OAuth provider returns the user to the app, logged in', async () => {
    const idp = await startMockIdp();
    const email = `electron_oidc_${Date.now()}@example.com`;
    idp.userinfo = { email, name: 'Desktop Person', email_verified: true };
    await enableCustomProvider(idp);
    try {
      const app = await launchDesktopApp(userData);
      const page = await app.firstWindow();
      await page.waitForLoadState('domcontentloaded');
      const opened = await recordExternalOpens(app);

      await expect(async () => {
        await page.evaluate((u) => { setTimeout(() => { window.location.href = u; }, 0); }, `${CLIENT_ORIGIN}/login`);
      }).toPass();
      await page.getByTestId('oauth-custom').click();

      // App -> IdP (inside this window) -> redirect back to the app's callback -> signed in.
      await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 20000 });
      expect(new URL(page.url()).origin).toBe(CLIENT_ORIGIN);
      expect(await opened()).toEqual([]);
      expect(idp.tokenRequests).toHaveLength(1);

      const me = await page.evaluate(async () => (await fetch('/api/auth/me')).json());
      expect(me.email).toBe(email);
      await app.close();
    } finally {
      await disableCustomProvider();
      await idp.close();
    }
  });
});
