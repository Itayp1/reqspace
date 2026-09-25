import { test as base, chromium, expect } from '@playwright/test';
import path from 'path';

const extensionPath = path.join(__dirname, '../../extension');

const test = base.extend<{
  context: any;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
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
  const res = await page.evaluate(async () => {
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
          url: 'http://localhost:3005/api/auth/me',
          headers: {}
        }
      }, '*');
    });
  });
  
  expect((res as any).status).toBeDefined();
});
