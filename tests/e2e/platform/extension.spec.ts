import { test as base, chromium, expect, API_URL } from '../fixtures';
import path from 'path';
import http from 'node:http';
import { seedRequest } from '../requests/seed';

const extensionPath = path.join(__dirname, '../../../extension');

const test = base.extend<{
  context: any;
  extensionId: string;
}>({
  context: async ({ baseURL }, use) => {
    const context = await chromium.launchPersistentContext('', {
      baseURL,
      // New headless Chromium (channel 'chromium') is the one mode that still loads extensions.
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    // The extension only serves allow-listed origins and stacks run on their own ports, so allow this one.
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await worker.evaluate((origin) => (globalThis as any).chrome.storage.local.set({ originAllowlist: [origin] }), new URL(baseURL!).origin);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background)
      background = await context.waitForEvent('serviceworker');

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

test('extension transport works', async ({ page }) => {
  test.setTimeout(120_000); // a fresh profile cold-loads the Vite client, then the context has to shut down
  await page.goto('/');

  // Wait for extension to be detected
  const isInstalled = await page.evaluate(() => {
    return new Promise(resolve => {
      // The client pings immediately on load, but in case of race conditions,
      // ping again.
      window.postMessage({ source: 'reqspace-client', type: 'REQSPACE_PING' }, '*');
      
      const listener = (event: MessageEvent) => {
        if (event.data?.type === 'REQSPACE_PONG') {
          window.removeEventListener('message', listener);
          resolve(true);
        }
      };
      window.addEventListener('message', listener);
      setTimeout(() => resolve(false), 2000);
    });
  });
  
  expect(isInstalled).toBeTruthy();
  
  // The actual transport logic needs the UI to select it, but we can call it manually
  const res = await page.evaluate(async (apiUrl) => {
    // Assuming the app has a way to test it, or we just call the transport layer
    return new Promise(resolve => {
      const id = 'test-id-123';
      const listener = (event: MessageEvent) => {
        if (event.data?.type === 'REQSPACE_RESPONSE' && event.data.id === id) {
          window.removeEventListener('message', listener);
          resolve(event.data.response);
        }
      };
      window.addEventListener('message', listener);
      window.postMessage({
        source: 'reqspace-client',
        type: 'REQSPACE_SEND',
        id,
        payload: {
          method: 'GET',
          url: `${apiUrl}/api/auth/me`,
          headers: {}
        }
      }, '*');
    });
  }, API_URL);
  
  expect((res as any).status).toBeDefined();
});

test('a 230 MB response streams through the real extension: stalls at the cap, survives idling, then saves to disk', async ({ page }) => {
  test.setTimeout(900_000);
  // No CORS header: a plain browser fetch() cannot read this, so only the extension can deliver it.
  const chunk = Buffer.alloc(1024 * 1024, 'a');
  const srv = http.createServer((_q, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    let sent = 0;
    const go = () => { while (sent < 230 && !res.destroyed) { sent++; if (!res.write(chunk)) return void res.once('drain', go); } res.end(); };
    go();
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(srv.address() as any).port}/big`;
  // The native save dialog cannot be driven, so stand in for showSaveFilePicker and count the bytes written.
  await page.addInitScript(() => {
    const saved = { bytes: 0, closed: false };
    (window as any).__saved = saved;
    (window as any).showSaveFilePicker = async () => ({
      createWritable: async () => ({
        write: async (c: Uint8Array) => { saved.bytes += c.byteLength; },
        close: async () => { saved.closed = true; },
        abort: async () => {},
      }),
    });
  });
  try {
    await seedRequest(page, 'extreal', url);
    await page.getByTestId('request-send-btn').click();
    const t0 = Date.now();
    await expect(page.getByTestId('oversized-response')).toContainText('over 200 MB', { timeout: 180_000 });
    console.log(`[extension stream] cap reached after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await expect(page.getByRole('button', { name: 'Render Anyway' })).toHaveCount(0);
    // Longer than a service worker's 30 s idle limit: the download must still be there.
    await page.waitForTimeout(35_000);
    await page.getByTestId('oversized-save').click();
    await expect(page.getByTestId('oversized-result')).toContainText('Saved', { timeout: 300_000 });
    expect(await page.evaluate(() => (window as any).__saved)).toEqual({ bytes: 230 * 1024 * 1024, closed: true });
  } finally {
    srv.closeAllConnections();
    srv.close();
  }
});
