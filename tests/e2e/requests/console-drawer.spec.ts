import { test, expect } from '../fixtures';
import { type Page } from '@playwright/test';
import { registerUser } from '../helpers';
import { mockServer, scene } from '../scene';
import { registerAndOpenRequest } from './seed';

test.describe('Cookies & Console', () => {

  test('the Console logs script output, resolved auth, the real URL, and clears', async ({ page }) => {
    await registerAndOpenRequest(page, 'console');

    await page.route('https://console-target.example.com/**', (route) =>
      route.fulfill({ status: 201, contentType: 'application/json', body: '{"created":true}' })
    );

    await page.getByTestId('request-url-input').fill('https://console-target.example.com/widgets');
    await page.getByTestId('method-select').selectOption('POST');

    // Bearer auth: the Console must show the Authorization header that was
    // genuinely sent, not a re-derivation of the headers table (which never
    // contained it).
    await page.getByTestId('req-tab-authorization').click();
    await page.getByTestId('auth-type-select').selectOption('bearer');
    await page.getByTestId('auth-bearer-token').fill('console-token');

    // A pre-request script that both writes a header and logs — the log line
    // is a separate Console entry type from the request entry.
    await page.getByTestId('req-tab-pre-request-script').click();
    await page.getByTestId('monaco-editor-container').locator('.monaco-editor').first().click();
    await page.keyboard.insertText(`console.log('from-pre-request');\nreq.headers.set('X-Script-Header', 'set-by-script');`);

    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('201', { timeout: 15000 });

    await page.getByTestId('console-toggle-btn').click();
    await expect(page.getByTestId('console-drawer')).toBeVisible();

    await expect(page.getByTestId('console-log-log')).toContainText('from-pre-request');

    const reqLog = page.getByTestId('console-log-request').first();
    await expect(reqLog).toContainText('POST');
    await expect(reqLog).toContainText('201');
    await reqLog.click();
    await page.getByTestId('console-reveal-btn').click();
    const details = page.getByTestId('console-log-details');
    await expect(details).toContainText('Bearer console-token');
    await expect(details).toContainText('set-by-script');
    await expect(details).toContainText('created');

    // Clear empties it; close hides the drawer without clearing.
    await page.getByTestId('console-clear-btn').click();
    await expect(page.getByTestId('console-drawer')).toContainText('No logs yet');
    await page.getByTestId('console-close-btn').click();
    await expect(page.getByTestId('console-drawer')).toBeHidden();
  });

  test('a form-data request can be expanded in the Console without breaking it', async ({ page }) => {
    await registerAndOpenRequest(page, 'console_form');

    await page.route('https://form-target.example.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
    await page.getByTestId('request-url-input').fill('https://form-target.example.com/upload');
    await page.getByTestId('method-select').selectOption('POST');
    await page.getByTestId('req-tab-body').click();
    await page.getByTestId('body-mode-form-data').click();
    await page.getByTestId('kv-key-0').fill('field');
    await page.getByTestId('kv-val-0').fill('value');

    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('response-status')).toContainText('200');

    // form-data makes the request body an object. The drawer renders it into
    // a <pre>, so it has to arrive as text — an object child throws in React
    // and used to blank the whole app on expand.
    await page.getByTestId('console-toggle-btn').click();
    await page.getByTestId('console-log-request').first().click();
    const details = page.getByTestId('console-log-details');
    await expect(details).toContainText('field');
    await expect(details).toContainText('value');
    await expect(page.getByTestId('console-drawer')).toBeVisible();
  });
});

test.describe('Console contents', () => {
  const send = async (page: Page) => { await page.getByTestId('request-send-btn').click(); };
  const status = (page: Page) => page.getByTestId('response-status');

  test('[I3.4] Authorization is masked in the console drawer until "Show secrets" is pressed', async ({ page }) => {
    await mockServer(page);
    await scene(page, { auth: { type: 'bearer', bearer: { token: 'SUPERSECRETTOKEN' } } });
    await page.getByTestId('console-toggle-btn').click();
    await send(page);
    await expect(status(page)).toContainText('200');
    await page.getByTestId('console-log-request').first().click();
    const details = page.getByTestId('console-log-details');
    await expect(details).toBeVisible();
    await expect(details).not.toContainText('SUPERSECRETTOKEN');
    await page.getByTestId('console-reveal-btn').click();
    await expect(details).toContainText('SUPERSECRETTOKEN');
  });

  test('[I3.5] the console keeps at most 1000 entries', async ({ page }) => {
    await mockServer(page);
    await scene(page, { preRequestScript: 'for (let i=0;i<1100;i++) console.log("line"+i);' });
    await page.getByTestId('console-toggle-btn').click();
    await send(page);
    await expect(status(page)).toContainText('200');
    await expect(page.getByTestId('console-drawer')).toContainText('Console (1000)');
  });
});


/** The Console drawer had a fixed height; its top edge is now a drag handle (and arrow keys). */
test('the Console height can be changed by dragging its top edge and with the keyboard', async ({ page }) => {
  await registerUser(page, 'consolesz');
  await page.getByTestId('console-toggle-btn').click();
  const drawer = page.getByTestId('console-drawer');
  const handle = page.getByTestId('console-resize-handle');
  const before = (await drawer.boundingBox())!.height;

  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 100, { steps: 5 });
  await page.mouse.up();
  const dragged = (await drawer.boundingBox())!.height;
  expect(dragged).toBeGreaterThan(before + 80);

  await handle.focus();
  await page.keyboard.press('ArrowDown');
  expect((await drawer.boundingBox())!.height).toBeLessThan(dragged);
});
