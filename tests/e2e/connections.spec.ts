import { test, expect } from './fixtures';

/**
 * Connection tabs (FEAT-1 WebSocket, FEAT-2 Socket.IO, FEAT-3 SSE,
 * FEAT-4 Kafka) shipped with no e2e coverage at all.
 *
 * Both halves are mocked inside the browser rather than against a real
 * broker: `page.routeWebSocket` stands in for the ws server, and a plain
 * route serving `text/event-stream` stands in for the SSE endpoint. That
 * keeps the test hermetic while still exercising the real client code —
 * ConnectionEditor's own WebSocket / EventSource usage.
 */
test.describe('Connection Tabs', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // routeWebSocket has to be installed before the first navigation, so all
    // the ws-server behaviour this file needs lives in one handler keyed by
    // path rather than one route per test:
    //   /echo   — echoes every frame back with a prefix, so a received
    //             message can only have come through the real socket
    //   /closes — closes the connection as soon as it receives anything
    // page.routeWebSocket swaps every WebSocket in the page for Playwright's
    // mock, the app's own realtime socket (Socket.IO on /ws) included. Passed
    // through, that socket made the mock throw "WebSocket is already in
    // CLOSING or CLOSED state" when React's dev double-mount closed it
    // mid-handshake (a real browser only logs that line), and the error landed
    // in fperrors. Realtime is not what these tests are about, so that socket
    // gets a handler that simply never answers.
    await page.routeWebSocket(/\/ws\/\?EIO=/, () => {});
    await page.routeWebSocket(/^ws:\/\/localhost:9999\//, (ws) => {
      const path = new URL(ws.url()).pathname;
      // An echo can land after the page has already closed the socket; the mock throws on that.
      let open = true;
      ws.onClose(() => { open = false; });
      ws.onMessage((message) => {
        if (path === '/closes') ws.close();
        else if (open) ws.send(`echo:${message}`);
      });
    });

    await page.goto('/register');
    await page.getByTestId('register-name').fill('Conn User');
    await page.getByTestId('register-email').fill(`conn_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
  });

  test('WebSocket: connect, send, receive an echo, then disconnect', async ({ page }) => {
    await page.getByTestId('new-connection-btn').click();
    await expect(page.getByTestId('connection-protocol-select')).toHaveValue('WS');
    await page.getByTestId('connection-url-input').fill('ws://localhost:9999/echo');

    await expect(page.getByTestId('connection-message-log')).toContainText('No messages yet');
    await page.getByTestId('connection-connect-btn').click();

    await expect(page.getByTestId('connection-msg-info').first()).toContainText('Connected to WebSocket');
    // The button flips to Disconnect only once the socket is actually open.
    await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();
    await expect(page.getByTestId('connection-connect-btn')).toBeHidden();

    await page.getByTestId('connection-message-input').fill('hello-ws');
    await page.getByTestId('connection-send-btn').click();

    await expect(page.getByTestId('connection-msg-sent')).toHaveText(/hello-ws/);
    await expect(page.getByTestId('connection-msg-received')).toHaveText(/echo:hello-ws/);
    // The composer clears itself after a send.
    await expect(page.getByTestId('connection-message-input')).toHaveValue('');

    await page.getByTestId('connection-disconnect-btn').click();
    await expect(page.getByTestId('connection-connect-btn')).toBeVisible();
    await expect(page.getByTestId('connection-message-log')).toContainText('Disconnected');

    // Clearing empties the transcript without reconnecting.
    await page.getByTestId('connection-clear-btn').click();
    await expect(page.getByTestId('connection-message-log')).toContainText('No messages yet');
  });

  test('WebSocket: Enter in the URL field connects, Enter in the composer sends', async ({ page }) => {
    await page.getByTestId('new-connection-btn').click();
    await page.getByTestId('connection-url-input').fill('ws://localhost:9999/echo');
    await page.getByTestId('connection-url-input').press('Enter');
    await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();

    await page.getByTestId('connection-message-input').fill('via-enter');
    await page.getByTestId('connection-message-input').press('Enter');
    await expect(page.getByTestId('connection-msg-received')).toHaveText(/echo:via-enter/);
  });

  test('WebSocket: a server-side close is reported', async ({ page }) => {
    await page.getByTestId('new-connection-btn').click();
    await page.getByTestId('connection-url-input').fill('ws://localhost:9999/closes');
    await page.getByTestId('connection-connect-btn').click();
    await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();

    await page.getByTestId('connection-message-input').fill('bye');
    await page.getByTestId('connection-send-btn').click();

    await expect(page.getByTestId('connection-message-log')).toContainText('WebSocket closed');
    // Closing from the server side has to put the UI back to "not connected".
    await expect(page.getByTestId('connection-connect-btn')).toBeVisible();
  });

  test('SSE: receives server-pushed events and cannot send', async ({ page }) => {
    await page.route('**/sse-stream', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: 'data: first-event\n\ndata: second-event\n\n',
      })
    );

    await page.getByTestId('new-connection-btn').click();
    await page.getByTestId('connection-protocol-select').selectOption('SSE');
    await page.getByTestId('connection-url-input').fill('http://localhost:5173/sse-stream');
    await page.getByTestId('connection-connect-btn').click();

    const received = page.getByTestId('connection-msg-received');
    await expect(received.nth(0)).toContainText('first-event');
    await expect(received.nth(1)).toContainText('second-event');

    // SSE is one-directional, so the composer stays locked out.
    await expect(page.getByTestId('connection-message-input')).toBeDisabled();
    await expect(page.getByTestId('connection-send-btn')).toBeDisabled();
  });

  test('Kafka: the stub reports itself rather than pretending to connect', async ({ page }) => {
    await page.getByTestId('new-connection-btn').click();
    await page.getByTestId('connection-protocol-select').selectOption('KAFKA');
    await page.getByTestId('connection-url-input').fill('kafka://localhost:9092');

    // Kafka has no browser client: the editor says so explicitly and offers no
    // Connect button, so it can never show a fake "connected" state. If real
    // Kafka support lands, update this test, don't delete it.
    await expect(page.getByTestId('connection-kafka-stub-banner')).toContainText('stub');
    await expect(page.getByTestId('connection-connect-btn')).toBeHidden();
    await expect(page.getByTestId('connection-send-btn')).toBeDisabled();
  });

  test('connect failures are reported for both WS and SSE, not swallowed', async ({ page }) => {
    await page.getByTestId('new-connection-btn').click();

    // Port 1 is outside the mocked range, so this is a genuine failed connect.
    await page.getByTestId('connection-url-input').fill('ws://localhost:1/nothing-listening');
    await page.getByTestId('connection-connect-btn').click();
    await expect(page.getByTestId('connection-msg-error').first()).toContainText('WebSocket error');
    await expect(page.getByTestId('connection-connect-btn')).toBeVisible();

    // The protocol selector keeps working after a failed connect, and the
    // SSE error path reports and resets the same way.
    await page.getByTestId('connection-clear-btn').click();
    await page.getByTestId('connection-protocol-select').selectOption('SSE');
    await expect(page.getByTestId('connection-protocol-select')).toHaveValue('SSE');

    await page.route('**/sse-broken', (route) => route.fulfill({ status: 500, body: 'nope' }));
    await page.getByTestId('connection-url-input').fill('http://localhost:5173/sse-broken');
    await page.getByTestId('connection-connect-btn').click();
    await expect(page.getByTestId('connection-msg-error').first()).toContainText('SSE HTTP 500');
    await expect(page.getByTestId('connection-connect-btn')).toBeVisible();
  });
});
