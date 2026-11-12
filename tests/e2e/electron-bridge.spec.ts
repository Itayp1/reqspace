import { test, expect } from './fixtures';

// Guards the dual-target setup: in the electron project the page must be the real desktop
// window (preload bridge present); in the browser projects it must not be.
// The desktop bridge is present only when the electron project runs with the real transport.
test.use({ desktopTransport: 'real' } as any);

test('the test page is the target it claims to be', async ({ page }) => {
  await page.goto('/login');
  const hasBridge = await page.evaluate(() => typeof (window as any).electron?.sendRequest === 'function');
  expect(hasBridge).toBe(process.env.REQSPACE_TARGET === 'electron');
});
