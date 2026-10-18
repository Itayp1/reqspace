import { test, expect, type Page } from './fixtures';

/**
 * Socket.IO connection tabs (FEAT-2). The other three protocols live in
 * `connections.spec.ts`; Socket.IO needs its own file because mocking it
 * means speaking Engine.IO rather than raw frames.
 *
 * `installSocketIoMock` implements just enough of Engine.IO v4 over
 * `page.routeWebSocket` to stand in for a real server, so these tests stay
 * hermetic while exercising the actual socket.io-client in the app:
 *
 *   server -> `0{...}`               OPEN, with the session parameters
 *   client -> `40` / `40/ns,`        CONNECT to a namespace
 *   server -> `40{"sid":...}`        namespace accepted
 *   client -> `42["name",args]`      EVENT
 *   server -> `2`, client -> `3`     heartbeat
 *
 * The mock echoes every event back as `echo:<name>` with its arguments
 * intact, so a received row can only have come from a real emit.
 */
async function installSocketIoMock(page: Page) {
  // Keep the app's own realtime socket out of the mock's pass-through (see
  // connections.spec.ts): a handler that never answers.
  await page.routeWebSocket(/localhost:\d+\/ws\/\?EIO=/, () => {});
  await page.routeWebSocket(/localhost:9876\/socket\.io\//, (ws) => {
    ws.send('0' + JSON.stringify({
      sid: 'mock-engine-sid',
      upgrades: [],
      pingInterval: 25000,
      pingTimeout: 20000,
      maxPayload: 1000000,
    }));

    ws.onMessage((raw) => {
      const msg = String(raw);

      if (msg === '2') { ws.send('3'); return; } // ping -> pong

      if (msg.startsWith('40')) { // CONNECT
        // `40/chat,{...}` keeps its namespace; a bare `40` is the "/" one.
        const rest = msg.slice(2);
        const ns = rest.startsWith('/') ? rest.slice(0, rest.indexOf(',') + 1) : '';
        ws.send(`40${ns}` + JSON.stringify({ sid: 'mock-socket-sid' }));
        return;
      }

      if (msg.startsWith('42')) { // EVENT
        const rest = msg.slice(2);
        const nsEnd = rest.startsWith('/') ? rest.indexOf(',') + 1 : 0;
        const ns = rest.slice(0, nsEnd);
        // The client now emits with an ack callback, so the packet is `42<ns><ackId>[...]`.
        const m = /^(\d*)([\s\S]*)$/.exec(rest.slice(nsEnd))!;
        const [name, ...args] = JSON.parse(m[2]);
        ws.send(`42${ns}` + JSON.stringify([`echo:${name}`, ...args]));
        return;
      }
    });
  });
}

test.describe('Socket.IO connections', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await installSocketIoMock(page);
    await page.goto('/register');
    await page.getByTestId('register-name').fill('SocketIO User');
    await page.getByTestId('register-email').fill(`sio_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    await page.getByTestId('new-connection-btn').click();
    await page.getByTestId('connection-protocol-select').selectOption('SOCKETIO');
  });

  test('connects, emits a named event and receives the echo', async ({ page }) => {
    await page.getByTestId('connection-url-input').fill('http://localhost:9876');
    await page.getByTestId('connection-connect-btn').click();

    await expect(page.getByTestId('connection-msg-info').first()).toContainText('Connected to Socket.IO');
    await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();

    // The event-name box is specific to Socket.IO and defaults to "message".
    const eventName = page.getByTestId('connection-event-name-input');
    await expect(eventName).toBeVisible();
    await expect(eventName).toHaveValue('message');

    await eventName.fill('chat:send');
    await page.getByTestId('connection-message-input').fill('hello-socketio');
    await page.getByTestId('connection-send-btn').click();

    await expect(page.getByTestId('connection-msg-sent')).toContainText('Event [chat:send]');
    await expect(page.getByTestId('connection-msg-sent')).toContainText('hello-socketio');
    // Echoed back as echo:<name>, so the emit really reached the server.
    await expect(page.getByTestId('connection-msg-received')).toContainText('Event [echo:chat:send]');
    await expect(page.getByTestId('connection-msg-received')).toContainText('hello-socketio');
  });

  test('a JSON payload is emitted as structured arguments, not a string', async ({ page }) => {
    await page.getByTestId('connection-url-input').fill('http://localhost:9876');
    await page.getByTestId('connection-connect-btn').click();
    await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();

    await page.getByTestId('connection-event-name-input').fill('order:create');
    await page.getByTestId('connection-message-input').fill('{"id":42,"ok":true}');
    await page.getByTestId('connection-send-btn').click();

    // An object, not a quoted string — the mock echoes the argument verbatim,
    // so this is evidence of what actually went over the wire.
    const received = page.getByTestId('connection-msg-received');
    await expect(received).toContainText('Event [echo:order:create]');
    await expect(received).toContainText('{"id":42,"ok":true}');
    await expect(received).not.toContainText('\\"id\\"');
  });

  test('each inbound event is logged exactly once', async ({ page }) => {
    await page.getByTestId('connection-url-input').fill('http://localhost:9876');
    await page.getByTestId('connection-connect-btn').click();
    await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();

    // "message" is the name that used to be logged twice, because
    // on('message') and onAny both fired for it.
    await page.getByTestId('connection-event-name-input').fill('message');
    await page.getByTestId('connection-message-input').fill('once-only');
    await page.getByTestId('connection-send-btn').click();

    await expect(page.getByTestId('connection-msg-received')).toHaveCount(1);
    await expect(page.getByTestId('connection-msg-received')).toContainText('Event [echo:message]');
  });

  test('a namespace in the URL is honoured', async ({ page }) => {
    await page.getByTestId('connection-url-input').fill('http://localhost:9876/chat');
    await page.getByTestId('connection-connect-btn').click();

    // The mock only acknowledges the namespace the client asked for, so
    // connecting at all proves `/chat` went out in the CONNECT packet.
    await expect(page.getByTestId('connection-msg-info').first()).toContainText('Connected to Socket.IO');
    await page.getByTestId('connection-event-name-input').fill('ping');
    await page.getByTestId('connection-message-input').fill('ns-payload');
    await page.getByTestId('connection-send-btn').click();
    await expect(page.getByTestId('connection-msg-received')).toContainText('Event [echo:ping]');
  });

  test('disconnect reports the reason and locks the composer', async ({ page }) => {
    await page.getByTestId('connection-url-input').fill('http://localhost:9876');
    await page.getByTestId('connection-connect-btn').click();
    await expect(page.getByTestId('connection-disconnect-btn')).toBeVisible();

    await page.getByTestId('connection-disconnect-btn').click();
    await expect(page.getByTestId('connection-connect-btn')).toBeVisible();
    await expect(page.getByTestId('connection-message-log')).toContainText('Disconnected');
    await expect(page.getByTestId('connection-message-input')).toBeDisabled();
    await expect(page.getByTestId('connection-event-name-input')).toBeDisabled();
  });

  test('an unreachable server surfaces connect_error and then gives up', async ({ page }) => {
    // Port 9877 has no mock, so the handshake genuinely fails.
    await page.getByTestId('connection-url-input').fill('http://localhost:9877');
    await page.getByTestId('connection-connect-btn').click();

    await expect(page.getByTestId('connection-msg-error').first())
      .toContainText('Socket.IO connect error', { timeout: 20000 });
    await expect(page.getByTestId('connection-connect-btn')).toBeVisible();

    // Reconnection is capped, so the transcript stops growing instead of
    // filling with retries forever.
    await expect(async () => {
      const before = await page.getByTestId('connection-msg-error').count();
      await page.waitForTimeout(2500);
      expect(await page.getByTestId('connection-msg-error').count()).toBe(before);
    }).toPass({ timeout: 40000 });
  });
});
