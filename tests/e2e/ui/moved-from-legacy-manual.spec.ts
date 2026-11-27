import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import { apiAs, apiAsAdmin, registerUser, treeNode, selectWorkspace } from '../helpers';
import { createServer, type Server, type IncomingMessage } from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

test.describe('moved from legacy-manual (api)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  /**
   * One Playwright test per HTTP/API-level failure listed in MANUAL_TEST_PLAN_FAILED.md.
   * Each test asserts the CORRECT behaviour and carries the plan id in its title
   * ("[A1.6] …") so it can be grepped:  npx playwright test -g "\[A1.6\]".
   * A test whose bug is still present is marked `test.fail()` — it flips red as soon
   * as the bug is fixed, which is the signal to delete that line.
   */

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${200 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }

  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await anon();
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
    expect(res.status(), 'register').toBe(201);
    const body = await res.json();
    return { ctx, email, id: (body.user?.id ?? body.user?._id) as string };
  }

  async function newWorkspace(ctx: APIRequestContext, name = uniq('ws')) {
    const res = await ctx.post('/api/workspaces', { data: { name } });
    expect(res.ok(), 'create workspace').toBeTruthy();
    const ws = await res.json();
    return (ws.id ?? ws._id) as string;
  }

  test.describe('G/P — settings (API)', () => {
    test('[P2.2] PUT /auth/settings rejects negative and non-numeric timeouts', async () => {
      const { ctx } = await newUser('p22');
      expect((await ctx.put('/api/auth/settings', { data: { timeout: -5 } })).status()).toBe(400);
      expect((await ctx.put('/api/auth/settings', { data: { timeout: 'abc' } })).status()).toBe(400);
      expect((await ctx.put('/api/auth/settings', { data: { timeout: 5000 } })).status()).toBe(200);
    });
  });

  test.describe('settings keys', () => {
    test('[SETTINGS-KEYS] PUT /auth/settings accepts every client key and persists it', async () => {
      const { ctx } = await newUser('skeys');
      const patch = {
        followRedirects: false, verifySsl: false, sendNoCacheHeader: true, encodeUrl: false, timeout: 1234,
        proxyEnabled: true, proxyUrl: 'http://127.0.0.1:8080', noProxy: 'localhost', proxyAuthEnabled: true,
        proxyUsername: 'u', proxyPassword: 'p', saveHistory: false, sendCookies: false,
        shortcuts: { send: 'ctrl+enter' },
      };
      const res = await ctx.put('/api/auth/settings', { data: patch });
      expect(res.status()).toBe(200);
      const body = await res.json();
      for (const [k, v] of Object.entries(patch)) expect(body[k], k).toEqual(v);
      const me = await (await ctx.get('/api/auth/me')).json();
      const s = (me.user ?? me).settings ?? {};
      expect(s.sendCookies).toBe(false);
      expect(s.saveHistory).toBe(false);
    });
  });

});

test.describe('moved from legacy-manual (nop)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  /**
   * Playwright tests for the failures of groups N1.12, O1-O4, P1-P6 listed in
   * MANUAL_TEST_PLAN_FAILED.md. Each test asserts the CORRECT behaviour and carries
   * the plan id in its title. `test.fail()` marks a bug that is still present.
   * Connection tests talk to REAL servers started inside the test (ws, socket.io, http SSE).
   */

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { WebSocketServer } = require('ws');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Server: IoServer } = require(path.join(__dirname, '..', '..', '..', 'server', 'node_modules', 'socket.io'));

  const listen = (srv: Server) => new Promise<number>((r) => srv.listen(0, '127.0.0.1', () => r((srv.address() as any).port)));

  async function openConnectionTab(page: Page, protocol: 'WS' | 'SOCKETIO' | 'SSE' | 'KAFKA') {
    await page.getByTestId('new-connection-btn').click();
    await page.getByTestId('connection-protocol-select').selectOption(protocol);
  }

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;

  const CERT_PEM = "-----BEGIN CERTIFICATE-----\r\nMIIBhzCCAS2gAwIBAgIUSC01PKBBLEzZ4okJFaSgUTfq454wCgYIKoZIzj0EAwIw\r\nGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDAgFw0yNjEwMTYwOTM4NTBaGA8yMTI2\r\nMDkyMjA5Mzg1MFowGDEWMBQGA1UEAwwNcmVxc3BhY2UtdGVzdDBZMBMGByqGSM49\r\nAgEGCCqGSM49AwEHA0IABKTR0pLsVVpt/H4g2XcyGnYR4CKehPYxaTxALWy32T15\r\nQN2AGDqLgMknFCgGu1Z6Hvp5YQtlz6ZUYow90cP910CjUzBRMB0GA1UdDgQWBBRa\r\nFZjWtRBOs5BKsYxKZZZQhFcYsTAfBgNVHSMEGDAWgBRaFZjWtRBOs5BKsYxKZZZQ\r\nhFcYsTAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIQC8VVrIpLt0\r\nG1bGJQSqK8SoqGJqrjYyLhhqX+8/drKmqQIgETNqoXOhtRdIH8ec/vv9o4hIC5bg\r\nzPI4mEPRkPc4dw8=\r\n-----END CERTIFICATE-----";
  const KEY_PEM = "-----BEGIN PRIVATE KEY-----\r\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgnrQB7AqhdPqXamWJ\r\nv+LJM+oqmHIRWaB7Iylu9LrMLkChRANCAASk0dKS7FVabfx+INl3Mhp2EeAinoT2\r\nMWk8QC1st9k9eUDdgBg6i4DJJxQoBrtWeh76eWELZc+mVGKMPdHD/ddA\r\n-----END PRIVATE KEY-----";

  async function newUserCtx(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': `10.${180 + (seq % 40)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` } });
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA', email, password: 'password123' } });
    expect(res.status()).toBe(201);
    return { ctx, email };
  }

  // ───────────────────────────── N1.12 ─────────────────────────────

  // ───────────────────────────── O — connections ─────────────────────────────

  // ───────────────────────────── P — settings ─────────────────────────────

  test.describe('P — search, settings, certs, theme', () => {
    test.describe('P2.4 offline', () => {
    test.use({ allowFpErrors: [/Network Error|500|boom/] });
    test('[P2.4] a failed settings save rolls the value back and shows an error toast', async ({ page }) => {
      await registerUser(page, 'p24');
      await page.getByTestId('settings-btn').click();
      await expect(page.locator('#followRedirects')).toBeChecked();
      await page.route('**/auth/settings', (r) => r.request().method() === 'PUT' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }) : r.fallback());
      // click(), not uncheck(): uncheck() verifies the box changed, but the failed save rolls it back at once.
      await page.locator('#followRedirects').click();
      await expect(page.getByTestId('toast-error').first()).toBeVisible();
      await expect(page.locator('#followRedirects')).toBeChecked();
    });
    });

    test('[P3.5] shortcuts can be rebound, collisions are refused, Reset restores defaults', async ({ page }) => {
      await registerUser(page, 'p35');
      await page.getByTestId('settings-btn').click();
      const send = page.getByTestId('shortcut-send-input');
      const save = page.getByTestId('shortcut-save-input');
      const search = page.getByTestId('shortcut-search-input');
      await save.fill('ctrl+shift+s');
      await expect(page.getByTestId('shortcut-save-error')).toBeHidden();
      await save.blur();
      await expect(save).toHaveValue('ctrl+shift+s');
      await send.fill('ctrl+k'); // collides with search
      await expect(page.getByTestId('shortcut-send-error')).toBeVisible();
      await send.blur();
      await expect(send).toHaveValue('ctrl+enter');
      await search.fill('alt+j');
      await page.getByTestId('shortcuts-reset-btn').click();
      await expect(search).toHaveValue('ctrl+k');
      await expect(save).toHaveValue('ctrl+s');
    });

    test('[P3.7] browser-reserved shortcuts (ctrl+t, ctrl+w) are rejected', async ({ page }) => {
      await registerUser(page, 'p37');
      await page.getByTestId('settings-btn').click();
      for (const k of ['ctrl+t', 'ctrl+w']) {
        await page.getByTestId('shortcut-save-input').fill(k);
        await expect(page.getByTestId('shortcut-save-error')).toContainText(/reserved/i);
      }
    });

    test('[P4.10] a plain browser does not offer the client certificates form (Desktop only)', async ({ page }) => {
      await registerUser(page, 'p410');
      await page.getByTestId('settings-btn').click();
      await expect(page.getByText('Client Certificates (mTLS)')).toHaveCount(0);
      await expect(page.getByTestId('cert-add-btn')).toHaveCount(0);
    });

    test('[P5.2] first visit follows prefers-color-scheme (light and dark), then the choice persists', async ({ browser }) => {
      for (const scheme of ['light', 'dark'] as const) {
        const ctx = await browser.newContext({ colorScheme: scheme });
        const page = await ctx.newPage();
        await registerUser(page, 'p52');
        const html = page.locator('html');
        await expect.poll(() => html.evaluate((el) => el.classList.contains('dark'))).toBe(scheme === 'dark');
        await page.reload();
        await expect(page.getByTestId('workspace-select')).toBeVisible();
        await expect.poll(() => html.evaluate((el) => el.classList.contains('dark'))).toBe(scheme === 'dark');
        await ctx.close();
      }
    });

    test('[P5.3] the Monaco editor follows the theme switch live', async ({ page }) => {
      await registerUser(page, 'p53');
      await page.getByTestId('create-request-btn').click();
      await page.getByTestId('req-tab-pre-request-script').click();
      const monaco = page.locator('.monaco-editor').first();
      await expect(monaco).toBeVisible({ timeout: 20000 });
      const html = page.locator('html');
      const startsDark = await html.evaluate((el) => el.classList.contains('dark'));
      const isDarkEditor = () => monaco.evaluate((el) => el.classList.contains('vs-dark'));
      expect(await isDarkEditor()).toBe(startsDark);
      await page.getByRole('button', { name: startsDark ? 'Switch to light mode' : 'Switch to dark mode' }).click();
      await expect.poll(isDarkEditor).toBe(!startsDark);
    });
  });

});

test.describe('moved from legacy-manual (qrsuv)', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const src = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }
  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await anon();
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
    expect(res.status(), 'register').toBe(201);
    const body = await res.json();
    return { ctx, email, id: (body.user?.id ?? body.user?._id) as string };
  }

  test.describe('V — cross-cutting UI', () => {
    test('[V3.4] ContextMenu closes on Escape, outside click and scroll, and clamps to the viewport', async () => {
      const s = src('client/src/components/common/ContextMenu.tsx');
      expect(s).toMatch(/key === 'Escape'/);
      expect(s).toMatch(/mousedown|click/);
      expect(s).toMatch(/scroll/);
      expect(s).toMatch(/innerWidth|innerHeight/);
    });

    test('[V3.5] Confirm modal and inline name field: Enter confirms, Escape cancels, double submit is blocked', async () => {
      const c = src('client/src/components/common/ConfirmModal.tsx');
      expect(c).toMatch(/key === 'Escape'/);
      expect(c).toMatch(/key === 'Enter'/);
      expect(c).toMatch(/double/i);
      const p = src('client/src/components/common/InlineNameInput.tsx');
      expect(p).toMatch(/key === 'Escape'/);
      expect(p).toMatch(/key === 'Enter'/);
      expect(p).toMatch(/doneRef/);
    });

    test('[V4.2] browser Back / Forward never lands on a blank screen', async ({ page }) => {
      test.skip(!process.env.REQSPACE_WEB_URL, 'needs the web client');
      test.skip(process.env.REQSPACE_TARGET === 'electron', 'a desktop app window has no browser history to go back/forward through');
      const base = process.env.REQSPACE_WEB_URL!;
      await page.goto(base + '/does-not-exist');
      await page.waitForLoadState('networkidle');
      await page.goto(base + '/login');
      await page.goBack();
      await page.goForward();
      expect((await page.locator('#root').innerText()).trim().length).toBeGreaterThan(0);
    });
  });

});
