import { test, expect } from './fixtures';
import { request as pwRequest, type Page, type APIRequestContext } from '@playwright/test';
import { createServer, type Server, type IncomingMessage } from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { API_URL } from './fixtures';
import { registerUser, apiAs, treeNode } from './helpers';

/**
 * Playwright tests for the failures of groups N1.12, O1-O4, P1-P6 listed in
 * MANUAL_TEST_PLAN_FAILED.md. Each test asserts the CORRECT behaviour and carries
 * the plan id in its title. `test.fail()` marks a bug that is still present.
 * Connection tests talk to REAL servers started inside the test (ws, socket.io, http SSE).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { WebSocketServer } = require('ws');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Server: IoServer } = require(path.join(__dirname, '..', '..', 'server', 'node_modules', 'socket.io'));

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
test.describe('N — realtime access changes', () => {
  async function setup(browser: any, page: Page, role: 'viewer' | 'editor') {
    const ownerEmail = await registerUser(page, 'n112own');
    const owner = await apiAs(ownerEmail);
    const ws = await (await owner.post('/api/workspaces', { data: { name: `N112 ${Date.now()}` } })).json();
    const wsId: string = ws.id ?? ws._id;
    await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Live Col' } });
    const mctx = await browser.newContext();
    const mpage = await mctx.newPage();
    const memberEmail = await registerUser(mpage, 'n112mem');
    expect((await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: memberEmail, role } })).ok()).toBeTruthy();
    const member = await apiAs(memberEmail);
    const me = await (await member.get('/api/auth/me')).json();
    const memberId: string = me.user?.id ?? me.user?._id ?? me.id ?? me._id;
    await mpage.reload();
    await mpage.getByTestId('workspace-select').selectOption(wsId);
    await expect(treeNode(mpage, 'Live Col')).toBeVisible();
    return { owner, wsId, mpage, mctx, memberId };
  }

  test('[N1.12] removing a member is pushed live: the removed member loses the workspace without reloading', async ({ page, browser }) => {
    const { owner, wsId, mpage, mctx, memberId } = await setup(browser, page, 'editor');
    const res = await owner.delete(`/api/workspaces/${wsId}/members/${memberId}`);
    expect(res.ok()).toBeTruthy();
    await expect(treeNode(mpage, 'Live Col')).toHaveCount(0, { timeout: 8000 });
    await expect(mpage.getByTestId('workspace-select').locator(`option[value="${wsId}"]`)).toHaveCount(0);
    await mctx.close();
  });

  test('[N1.12] a role change is pushed live to the member', async ({ page, browser }) => {
    const { owner, wsId, mpage, mctx, memberId } = await setup(browser, page, 'viewer');
    const res = await owner.put(`/api/workspaces/${wsId}/members/${memberId}`, { data: { role: 'editor' } });
    expect(res.ok()).toBeTruthy();
    await expect(mpage.getByTestId('toast-info').filter({ hasText: /role .* is now editor/i }).first()).toBeVisible({ timeout: 8000 });
    await mctx.close();
  });
});

// ───────────────────────────── O — connections ─────────────────────────────
test.describe('O — connections (real servers)', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'conn');
  });

  test('[O1.4] WebSocket sub-protocol (Sec-WebSocket-Protocol) is sent and negotiated', async ({ page }) => {
    const seen: string[] = [];
    const http = createServer();
    const wss = new WebSocketServer({ server: http, handleProtocols: (p: Set<string>) => { seen.push([...p].join(',')); return [...p][0]; } });
    const port = await listen(http);
    try {
      await openConnectionTab(page, 'WS');
      await page.getByTestId('connection-url-input').fill(`ws://127.0.0.1:${port}/`);
      await page.getByTestId('connection-ws-protocols-input').fill('chat.v1, chat.v2');
      await page.getByTestId('connection-connect-btn').click();
      await expect(page.getByTestId('connection-msg-info').first()).toContainText('protocol: chat.v1');
      expect(seen[0]).toBe('chat.v1,chat.v2');
    } finally { wss.close(); http.close(); }
  });

  test('[O1.4] {{var}} in the sub-protocol field resolves (token from a variable)', async ({ page }) => {
    const seen: string[] = [];
    const http = createServer();
    const wss = new WebSocketServer({ server: http, handleProtocols: (p: Set<string>) => { seen.push([...p].join(',')); return [...p][0]; } });
    const port = await listen(http);
    try {
      const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
      const put = await page.request.put(`/api/workspaces/${wsId}/global-environment`, { data: { variables: [{ key: 'tok', initialValue: 'secret-tok', currentValue: 'secret-tok', enabled: true, type: 'default' }] } });
      expect(put.ok()).toBeTruthy();
      await page.reload();
      await expect(page.getByTestId('workspace-select')).toBeVisible();
      await openConnectionTab(page, 'WS');
      await page.getByTestId('connection-url-input').fill(`ws://127.0.0.1:${port}/`);
      await page.getByTestId('connection-ws-protocols-input').fill('{{tok}}');
      await page.getByTestId('connection-connect-btn').click();
      await expect(page.getByTestId('connection-msg-info').first()).toContainText('protocol: secret-tok');
    } finally { wss.close(); http.close(); }
  });

  test('[O1.8] connection settings and draft message survive a refresh; the connection can be saved to the tree', async ({ page }) => {
    await openConnectionTab(page, 'WS');
    await page.getByTestId('connection-url-input').fill('ws://127.0.0.1:1/keep');
    await page.getByTestId('connection-ws-protocols-input').fill('proto-a');
    await page.reload();
    await expect(page.getByTestId('connection-url-input')).toHaveValue('ws://127.0.0.1:1/keep');
    await expect(page.getByTestId('connection-ws-protocols-input')).toHaveValue('proto-a');
    // ... and a connection tab should be savable into a collection like any request.
    await expect(page.getByTestId('request-save-btn')).toBeVisible({ timeout: 2000 });
    // Save it into a collection; reopening it from the tree restores the connection tab.
    const name = uniq('conn-saved');
    const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
    expect((await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'ConnCol' } })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId('connection-url-input')).toHaveValue('ws://127.0.0.1:1/keep');
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill(name);
    await page.getByTestId('save-req-submit-btn').click();
    await expect(treeNode(page, name)).toBeVisible();
    await page.getByTestId('new-connection-btn').click(); // move focus to another tab
    await treeNode(page, name).click();
    await expect(page.getByTestId('connection-url-input')).toHaveValue('ws://127.0.0.1:1/keep');
    await expect(page.getByTestId('connection-protocol-select')).toHaveValue('WS');
    await expect(page.getByTestId('connection-ws-protocols-input')).toHaveValue('proto-a');
  });

  test('[O1.9] {{var}} in a WebSocket URL is resolved before connecting', async ({ page }) => {
    const http = createServer();
    const wss = new WebSocketServer({ server: http });
    const port = await listen(http);
    try {
      const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
      await page.request.put(`/api/workspaces/${wsId}/global-environment`, { data: { variables: [{ key: 'wsport', initialValue: String(port), currentValue: String(port), enabled: true, type: 'default' }] } });
      await page.reload();
      await expect(page.getByTestId('workspace-select')).toBeVisible();
      await openConnectionTab(page, 'WS');
      await page.getByTestId('connection-url-input').fill('ws://127.0.0.1:{{wsport}}/');
      await page.getByTestId('connection-connect-btn').click();
      await expect(page.getByTestId('connection-msg-info').first()).toContainText('Connected to WebSocket');
    } finally { wss.close(); http.close(); }
  });

  // --- Socket.IO ---
  async function sioServer() {
    const http = createServer();
    const io = new IoServer(http, { path: '/custom-io', cors: { origin: '*' } });
    const live = { count: 0 };
    const chat = io.of('/chat');
    chat.use((s: any, next: any) => (s.handshake.auth?.token === 'abc' ? next() : next(new Error('bad token'))));
    chat.on('connection', (s: any) => {
      live.count++;
      s.on('disconnect', () => { live.count--; });
      s.emit('hello', { token: s.handshake.auth.token, a: s.handshake.query.a });
      s.on('go', () => { s.emit('evA', 1); s.emit('evB', 2); });
      s.on('multi', (...a: any[]) => { const ack = a.pop(); ack(a); });
    });
    const port = await listen(http);
    return { http, io, port, live };
  }

  test('[O2.1] Socket.IO: namespace, custom path, query and auth payload are all sent', async ({ page }) => {
    const { http, io, port } = await sioServer();
    try {
      await openConnectionTab(page, 'SOCKETIO');
      await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/chat`);
      await page.getByTestId('connection-sio-path-input').fill('/custom-io');
      await page.getByTestId('connection-sio-query-input').fill('a=1');
      await page.getByTestId('connection-sio-auth-input').fill('{"token":"abc"}');
      await page.getByTestId('connection-connect-btn').click();
      const rec = page.getByTestId('connection-msg-received');
      await expect(rec.first()).toContainText('Event [hello]');
      await expect(rec.first()).toContainText('"token":"abc"');
      await expect(rec.first()).toContainText('"a":"1"');
    } finally { io.close(); http.close(); }
  });

  async function connectSio(page: Page, port: number) {
    await openConnectionTab(page, 'SOCKETIO');
    await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/chat`);
    await page.getByTestId('connection-sio-path-input').fill('/custom-io');
    await page.getByTestId('connection-sio-auth-input').fill('{"token":"abc"}');
    await page.getByTestId('connection-connect-btn').click();
    await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();
    await page.getByTestId('connection-clear-btn').click();
  }

  test('[O2.2] Socket.IO: listen list filters events; removing the listener shows them again', async ({ page }) => {
    const { http, io, port } = await sioServer();
    try {
      await connectSio(page, port);
      await page.getByTestId('connection-listen-input').fill('evA');
      await page.getByTestId('connection-listen-input').press('Enter');
      await expect(page.getByTestId('connection-listen-chip')).toHaveCount(1);
      await page.getByTestId('connection-event-name-input').fill('go');
      await page.getByTestId('connection-message-input').fill('x');
      await page.getByTestId('connection-send-btn').click();
      await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'Event [evA]' })).toHaveCount(1);
      await page.waitForTimeout(500);
      await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'Event [evB]' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Remove evA' }).click();
      await expect(page.getByTestId('connection-listen-chip')).toHaveCount(0);
      await page.getByTestId('connection-message-input').fill('y');
      await page.getByTestId('connection-send-btn').click();
      await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'Event [evB]' })).toHaveCount(1);
    } finally { io.close(); http.close(); }
  });

  test('[O2.3] Socket.IO emit: JSON array becomes multiple args, acks are shown, invalid JSON is blocked', async ({ page }) => {
    const { http, io, port } = await sioServer();
    try {
      await connectSio(page, port);
      await page.getByTestId('connection-event-name-input').fill('multi');
      await page.getByTestId('connection-message-input').fill('[1,{"a":2},"x"]');
      await page.getByTestId('connection-send-btn').click();
      await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'Ack [multi]' })).toContainText('[[1,{"a":2},"x"]]');
      await page.getByTestId('connection-message-input').fill('{bad json');
      await page.getByTestId('connection-send-btn').click();
      await expect(page.getByTestId('connection-msg-error').filter({ hasText: /Invalid JSON/i })).toBeVisible();
      await expect(page.getByTestId('connection-msg-sent')).toHaveCount(1);
    } finally { io.close(); http.close(); }
  });

  test('[O2.5] Socket.IO reserved event names are refused for emit and listen', async ({ page }) => {
    const { http, io, port } = await sioServer();
    try {
      await connectSio(page, port);
      for (const name of ['connect', 'disconnect', 'error']) {
        await page.getByTestId('connection-event-name-input').fill(name);
        await page.getByTestId('connection-message-input').fill('x');
        await page.getByTestId('connection-send-btn').click();
        await expect(page.getByTestId('connection-msg-error').filter({ hasText: `"${name}" is a reserved` }).first()).toBeVisible();
      }
      await expect(page.getByTestId('connection-msg-sent')).toHaveCount(0);
      await page.getByTestId('connection-listen-input').fill('disconnect');
      await page.getByTestId('connection-listen-input').press('Enter');
      await expect(page.getByTestId('connection-listen-chip')).toHaveCount(0);
    } finally { io.close(); http.close(); }
  });

  test('[O2.8] closing a Socket.IO tab while another connection tab is open really disconnects it', async ({ page }) => {
    const { http, io, port, live } = await sioServer();
    try {
      await connectSio(page, port);
      await expect.poll(() => live.count).toBe(1);
      await page.getByTestId('new-connection-btn').click(); // second connection tab becomes active
      await page.getByTestId('close-tab-btn').first().click({ force: true });
      const confirm = page.getByTestId('confirm-submit');
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await expect.poll(() => live.count, { timeout: 8000 }).toBe(0);
    } finally { io.close(); http.close(); }
  });

  // --- SSE ---
  async function sseServer(handler: (req: IncomingMessage, res: any, n: number) => void) {
    const reqs: IncomingMessage[] = [];
    const http = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      reqs.push(req);
      handler(req, res, reqs.length);
    });
    const port = await listen(http);
    return { http, port, reqs };
  }
  const sseHead = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' };

  test('[O3.1] SSE shows event name, id and data for named events', async ({ page }) => {
    const { http, port } = await sseServer((_q, res) => {
      res.writeHead(200, sseHead);
      res.write('event: custom\nid: 7\ndata: hello\n\ndata: plain\n\n');
    });
    try {
      await openConnectionTab(page, 'SSE');
      await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/s`);
      await page.getByTestId('connection-connect-btn').click();
      const rec = page.getByTestId('connection-msg-received');
      await expect(rec.nth(0)).toContainText('[custom]');
      await expect(rec.nth(0)).toContainText('#7');
      await expect(rec.nth(0)).toContainText('hello');
      await expect(rec.nth(1)).toContainText('plain');
    } finally { http.closeAllConnections(); http.close(); }
  });

  test('[O3.2] SSE sends custom headers (Authorization) and explains the EventSource limit', async ({ page }) => {
    const { http, port, reqs } = await sseServer((_q, res) => { res.writeHead(200, sseHead); res.write('data: ok\n\n'); });
    try {
      await openConnectionTab(page, 'SSE');
      await expect(page.getByText(/EventSource/).first()).toBeVisible();
      await page.getByTestId('connection-sse-add-header').click();
      await page.getByTestId('connection-sse-header-key').fill('Authorization');
      await page.getByTestId('connection-sse-header-value').fill('Bearer t0k');
      await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/s`);
      await page.getByTestId('connection-connect-btn').click();
      await expect(page.getByTestId('connection-msg-received').first()).toContainText('ok');
      expect(reqs[0].headers.authorization).toBe('Bearer t0k');
    } finally { http.closeAllConnections(); http.close(); }
  });

  test('[O3.3] SSE reconnects after a server drop using retry and Last-Event-ID', async ({ page }) => {
    const { http, port, reqs } = await sseServer((_q, res, n) => {
      res.writeHead(200, sseHead);
      if (n === 1) { res.end('retry: 200\nid: 5\ndata: first\n\n'); } else { res.write('data: second\n\n'); }
    });
    try {
      await openConnectionTab(page, 'SSE');
      await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/s`);
      await page.getByTestId('connection-connect-btn').click();
      await expect(page.getByTestId('connection-msg-received').filter({ hasText: 'second' })).toBeVisible({ timeout: 8000 });
      expect(reqs[1].headers['last-event-id']).toBe('5');
    } finally { http.closeAllConnections(); http.close(); }
  });

  test('[O3.4] SSE errors show the HTTP status and a wrong Content-Type message', async ({ page }) => {
    const { http, port } = await sseServer((q, res) => {
      if (q.url === '/401') { res.writeHead(401); res.end('no'); }
      else if (q.url === '/404') { res.writeHead(404); res.end('no'); }
      else { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('hi'); }
    });
    try {
      await openConnectionTab(page, 'SSE');
      for (const [p, re] of [['/401', /401/], ['/404', /404/], ['/plain', /text\/event-stream/]] as const) {
        await page.getByTestId('connection-clear-btn').click();
        await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}${p}`);
        await page.getByTestId('connection-connect-btn').click();
        await expect(page.getByTestId('connection-msg-error').first()).toContainText(re);
        await expect(page.getByTestId('connection-connect-btn')).toBeVisible();
      }
    } finally { http.closeAllConnections(); http.close(); }
  });

  test('[O4.1] Kafka tab says it is a stub and never fakes a connection', async ({ page }) => {
    await openConnectionTab(page, 'KAFKA');
    await page.getByTestId('connection-url-input').fill('kafka://localhost:9092');
    await expect(page.getByTestId('connection-kafka-stub-banner')).toContainText(/stub/i);
    await expect(page.getByTestId('connection-connect-btn')).toBeHidden();
    await expect(page.getByTestId('connection-disconnect-btn')).toBeHidden();
  });
});

// ───────────────────────────── P — settings ─────────────────────────────
test.describe('P — search, settings, certs, theme', () => {
  test('[P1.2] global search shows the Collection › Folder path and finds by method', async ({ page }) => {
    const email = await registerUser(page, 'p12');
    const api = await apiAs(email);
    const wsId = (await (await api.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id ?? undefined;
    const col = await (await api.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'PathCol' } })).json();
    const colId = col.id ?? col._id;
    const folder = await (await api.post(`/api/collections/${colId}/folders`, { data: { name: 'PathFolder' } })).json();
    await api.post(`/api/collections/${colId}/requests`, { data: { name: 'DeepReq', method: 'DELETE', url: 'http://x.test/zz', folderId: folder.id ?? folder._id } });
    await page.reload();
    await page.getByTestId('node-PathCol').click();
    await expect(page.getByTestId('node-PathFolder')).toBeVisible();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Global search' });
    await dialog.getByRole('combobox').fill('DeepReq');
    await expect(dialog.getByTestId('search-result-path').first()).toHaveText('PathCol › PathFolder');
    await dialog.getByRole('combobox').fill('delete');
    await expect(dialog.getByRole('option', { name: /request: DeepReq/ })).toBeVisible();
  });

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

  test('[P2.5] the request editor has per-request settings that override the global ones', async ({ page }) => {
    await registerUser(page, 'p25');
    const wsId0 = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
    expect((await page.request.post(`/api/workspaces/${wsId0}/collections`, { data: { name: 'P25Col' } })).ok()).toBeTruthy();
    await page.reload();
    await page.getByTestId('create-request-btn').click();
    await expect(page.getByTestId('req-tab-settings')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('req-tab-settings').click();
    await page.getByTestId('req-setting-followRedirects').selectOption('false');
    await page.getByTestId('req-setting-timeout').fill('1234');
    // Saved on the request: persists across a reload of the stored request.
    const name = uniq('p25');
    await page.getByTestId('request-save-btn').click();
    await page.getByTestId('save-req-name-input').fill(name);
    await page.getByTestId('save-req-submit-btn').click();
    await expect(treeNode(page, name)).toBeVisible();
    const wsId = (await (await page.request.get('/api/workspaces')).json()).find((w: any) => w.isPersonal)._id;
    const cols = await (await page.request.get(`/api/workspaces/${wsId}/collections`)).json();
    const colId = (cols[0] ?? cols.collections?.[0])._id;
    const list = await (await page.request.get(`/api/collections/${colId}/requests`)).json();
    const saved = (Array.isArray(list) ? list : list.requests).find((r: any) => r.name === name);
    const full = await (await page.request.get(`/api/requests/${saved._id}`)).json();
    expect(full.settings).toMatchObject({ followRedirects: false, timeout: 1234 });
  });

  // A plain browser cannot route a request through a proxy, so this runs against the desktop
  // transport (electron/httpRequest.js): REQSPACE_TARGET=electron npx playwright test -g P3.1
  test.describe('[P3.1] desktop transport @electron', () => {
  test.use({ desktopTransport: 'real' } as any);
  test('[P3.1] requests go through the configured local proxy (and directly when off)', async ({ page }) => {
    const proxied: string[] = [];
    const direct: string[] = [];
    const proxy: Server = createServer((req, res) => { proxied.push(req.url || ''); res.end('via-proxy'); });
    const origin: Server = createServer((req, res) => { direct.push(req.url || ''); res.end('direct'); });
    await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
    await new Promise<void>((r) => origin.listen(0, '127.0.0.1', r));
    const proxyPort = (proxy.address() as any).port;
    const originPort = (origin.address() as any).port;
    try {
      await registerUser(page, 'p31');
      await page.getByTestId('settings-btn').click();
      await page.getByTestId('proxy-enable-checkbox').check();
      await page.getByTestId('proxy-url-input').fill(`http://127.0.0.1:${proxyPort}`);
      await page.getByTestId('proxy-noproxy-input').fill('');
      await page.getByTestId('global-settings-close-btn').click();

      await page.getByTestId('new-tab-btn').click();
      // An unresolvable host: it can only be answered by the proxy.
      await page.getByTestId('request-url-input').fill('http://proxied-host.invalid/p31');
      await page.getByTestId('request-send-btn').click();
      await expect(page.getByTestId('response-status')).toContainText('200', { timeout: 15000 });
      expect(proxied.some((u) => u.includes('proxied-host.invalid/p31'))).toBe(true);

      await page.getByTestId('settings-btn').click();
      await page.getByTestId('proxy-enable-checkbox').uncheck();
      await page.getByTestId('global-settings-close-btn').click();

      const before = proxied.length;
      await page.getByTestId('request-url-input').fill(`http://127.0.0.1:${originPort}/p31-direct`);
      await page.getByTestId('request-send-btn').click();
      await expect.poll(() => direct.length, { timeout: 15000 }).toBeGreaterThan(0);
      expect(direct[0]).toBe('/p31-direct');
      expect(proxied.length).toBe(before);
    } finally {
      proxy.close();
      origin.close();
    }
  });
  });

  test('[P3.2] an invalid proxy URL (abc / empty) shows an inline error; a valid URL does not', async ({ page }) => {
    await registerUser(page, 'p32');
    await page.getByTestId('settings-btn').click();
    await page.getByTestId('proxy-enable-checkbox').check();
    await page.getByTestId('proxy-url-input').fill('abc');
    await expect(page.getByTestId('proxy-url-error')).toBeVisible();
    await page.getByTestId('proxy-url-input').fill('');
    await expect(page.getByTestId('proxy-url-error')).toBeVisible();
    await page.getByTestId('proxy-url-input').fill('http://127.0.0.1:8080');
    await expect(page.getByTestId('proxy-url-error')).toBeHidden();
    await page.getByTestId('proxy-auth-checkbox').check();
    await expect(page.getByTestId('proxy-username-input')).toBeVisible();
    await expect(page.getByTestId('proxy-password-input')).toBeVisible();
  });

  test('[P3.3] No-proxy field exists and a plain browser warns that the proxy is not applied', async ({ page }) => {
    await registerUser(page, 'p33');
    await page.getByTestId('settings-btn').click();
    await page.getByTestId('proxy-enable-checkbox').check();
    await expect(page.getByTestId('proxy-noproxy-input')).toBeVisible();
    await page.getByTestId('proxy-noproxy-input').fill('localhost, *.internal');
    await expect(page.getByTestId('proxy-browser-warning')).toBeVisible();
  });

  test('[P3.4] the proxy password is a password field and never stored in localStorage', async ({ page }) => {
    await registerUser(page, 'p34');
    await page.getByTestId('settings-btn').click();
    await page.getByTestId('proxy-enable-checkbox').check();
    await page.getByTestId('proxy-url-input').fill('http://127.0.0.1:8080');
    await page.getByTestId('proxy-auth-checkbox').check();
    await page.getByTestId('proxy-password-input').fill('S3cretProxyPw');
    await expect(page.getByTestId('proxy-password-input')).toHaveAttribute('type', 'password');
    await page.waitForTimeout(500);
    const dump = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
    expect(dump).not.toContain('S3cretProxyPw');
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

  test('[P4.2] mTLS: sending to a server that demands a client cert succeeds with it and fails without', async () => {
    // Electron-only transport (electron/httpRequest.js); exercised directly in Node against a real mTLS server.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { sendRequest } = require(path.join(__dirname, '..', '..', 'electron', 'httpRequest.js'));
    const https = await import('https');
    const srv = https.createServer({ key: KEY_PEM, cert: CERT_PEM, ca: [CERT_PEM], requestCert: true, rejectUnauthorized: true }, (_q, r) => { r.end('mtls-ok'); });
    const port = await listen(srv as unknown as Server);
    try {
      const url = `https://127.0.0.1:${port}/`;
      const ok = await sendRequest({ method: 'GET', url, verifySsl: false, clientCertificates: [{ hostname: '127.0.0.1', cert: CERT_PEM, key: KEY_PEM }] });
      expect(ok.body).toBe('mtls-ok');
      await expect(sendRequest({ method: 'GET', url, verifySsl: false, clientCertificates: [] })).rejects.toThrow();
    } finally { srv.close(); }
  });

  test('[P4.3] mTLS hostname matching: mismatch not attached; wildcard matches subdomains only', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { hostnameMatches, findClientCertificate } = require(path.join(__dirname, '..', '..', 'electron', 'httpRequest.js'));
    expect(hostnameMatches('*.example.com', 'a.example.com')).toBe(true);
    expect(hostnameMatches('*.example.com', 'a.b.example.com')).toBe(true);
    expect(hostnameMatches('*.example.com', 'example.com')).toBe(false);
    expect(hostnameMatches('api.example.com', 'other.example.com')).toBe(false);
    expect(findClientCertificate([{ hostname: 'api.example.com' }], 'other.example.com')).toBeUndefined();
  });

  test('[P4.4] invalid certificate files are rejected with a clear 400 message', async () => {
    const { ctx } = await newUserCtx('p44');
    const post = (data: object) => ctx.post('/api/auth/certificates', { data: { hostname: 'h.test', ...data } });
    let r = await post({ cert: 'just some text', key: 'more text' });
    expect(r.status()).toBe(400);
    expect((await r.json()).message).toMatch(/certificate/i);
    r = await post({ cert: KEY_PEM, key: KEY_PEM });
    expect(r.status()).toBe(400);
    const enc = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'right' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    r = await post({ cert: CERT_PEM, key: enc.privateKey });
    expect(r.status()).toBe(400);
    expect((await r.json()).message).toMatch(/passphrase/i);
    r = await post({ cert: CERT_PEM, key: enc.privateKey, passphrase: 'wrong' });
    expect(r.status()).toBe(400);
    expect((await r.json()).message).toMatch(/passphrase/i);
    r = await post({ cert: CERT_PEM, key: enc.privateKey, passphrase: 'right' });
    expect(r.status()).toBe(400); // valid key, but does not match the certificate
    expect((await r.json()).message).toMatch(/match/i);
  });

  test('[P4.8] a second certificate for the same hostname (any case) replaces the first', async () => {
    const { ctx } = await newUserCtx('p48');
    expect((await ctx.post('/api/auth/certificates', { data: { hostname: 'Dup.Example.com', cert: CERT_PEM, key: KEY_PEM } })).status()).toBe(201);
    const r = await ctx.post('/api/auth/certificates', { data: { hostname: 'dup.example.com', cert: CERT_PEM, key: KEY_PEM } });
    expect(r.status()).toBe(201);
    expect((await r.json())).toHaveLength(1);
  });

  test('[P4.10] a plain browser says client certificates are not applied (Desktop/Extension required)', async ({ page }) => {
    await registerUser(page, 'p410');
    await page.getByTestId('settings-btn').click();
    await expect(page.getByTestId('cert-browser-warning')).toContainText(/Desktop/i);
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

  test('[P6.1] first visit without the extension prompts, and the Download link serves a real zip', async ({ page }) => {
    await registerUser(page, 'p61');
    const prompt = page.getByTestId('extension-install-prompt');
    await expect(prompt).toBeVisible({ timeout: 10000 });
    const res = await (await pwRequest.newContext()).get(`${API_URL}/extension/reqspace-transport.zip`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/zip/);
    expect((await res.body()).subarray(0, 2).toString()).toBe('PK');
  });
});
