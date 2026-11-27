import { test, expect } from '../fixtures';

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

  test('Kafka: browser says it is desktop-only and never fakes a connection', async ({ page }) => {
    await page.getByTestId('new-connection-btn').click();
    await page.getByTestId('connection-protocol-select').selectOption('KAFKA');
    await page.getByTestId('connection-url-input').fill('localhost:9092');

    await expect(page.getByTestId('connection-kafka-desktop-banner')).toContainText('Electron');
    await page.getByTestId('connection-kafka-topic').fill('orders');
    await page.getByTestId('connection-kafka-sasl').check();
    await page.getByTestId('connection-kafka-ssl').check();
    await expect(page.getByTestId('connection-kafka-mechanism')).toBeVisible();
    await expect(page.getByTestId('connection-kafka-verify-ssl')).toBeChecked();
    await expect(page.getByTestId('connection-kafka-load-lists')).toBeDisabled();

    await page.getByTestId('connection-connect-btn').click();
    await expect(page.getByTestId('connection-msg-error').first()).toContainText('Electron');
    await expect(page.getByTestId('connection-connect-btn')).toBeVisible();
    await expect(page.getByTestId('connection-send-btn')).toBeDisabled();
  });

});
