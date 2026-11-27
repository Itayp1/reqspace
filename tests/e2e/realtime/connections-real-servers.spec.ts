import { test, expect } from '../fixtures';
import { type Page } from '@playwright/test';
import path from 'path';
import { createServer, type Server, type IncomingMessage } from 'http';
import { registerUser, treeNode } from '../helpers';

test.describe('connection tabs against real servers', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

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

test.describe('O — connections (real servers)', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'conn');
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

  async function connectSio(page: Page, port: number) {
    await openConnectionTab(page, 'SOCKETIO');
    await page.getByTestId('connection-url-input').fill(`http://127.0.0.1:${port}/chat`);
    await page.getByTestId('connection-sio-path-input').fill('/custom-io');
    await page.getByTestId('connection-sio-auth-input').fill('{"token":"abc"}');
    await page.getByTestId('connection-connect-btn').click();
    await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();
    await page.getByTestId('connection-clear-btn').click();
  }

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
});
});
