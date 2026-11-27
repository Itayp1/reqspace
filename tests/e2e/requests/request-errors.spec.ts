import http from 'node:http';
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
import { scene } from '../scene';
import { seedRequest } from './seed';

async function openSeededRequest(page: Page, prefix: string, url: string, beforeReload?: () => Promise<void>) {
  await seedRequest(page, prefix, url, beforeReload);
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('Network Error');
}


test.describe('I4.4 mixed content error explanation', () => {
  test('[I4.4] a blocked plain-HTTP request mentions mixed content, not only CORS', async ({ page }) => {
    await openSeededRequest(page, 'i44', 'http://127.0.0.1:1/x');
    await expect(page.getByTestId('response-body-viewer')).toContainText(/mixed\s+content/i);
  });
});

test('[I4.5] an SSL/certificate failure explains SSL and hints at turning off Verify SSL', async ({ page }) => {
  // Simulate the browser's opaque failure for a bad certificate.
  await openSeededRequest(page, 'i45', 'https://selfsigned.test/x', () => page.route('https://selfsigned.test/**', (route) => route.abort('failed')));
  const body = page.getByTestId('response-body-viewer');
  await expect(body).toContainText(/certificate/i);
  await expect(body).toContainText(/turn\s+off\s+.{0,2}Verify\s+SSL/i);
});

// A server that answers but sends no Access-Control-Allow-Origin: the browser reports it as a bare
// "Failed to fetch". The response must say it is CORS and that the extension is not installed.
test('[CORS] a request blocked by CORS says so and points to the extension', async ({ page }) => {
  const srv = http.createServer((_q, s) => { s.end('ok'); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const port = (srv.address() as any).port;
  try {
    await seedRequest(page, 'cors1', `http://127.0.0.1:${port}/x`);
    await page.getByTestId('request-send-btn').click();
    const body = page.getByTestId('response-body-viewer');
    await expect(body).toContainText('Blocked by CORS');
    await expect(body).toContainText("Extension not installed");
  } finally { srv.close(); }
});

test.describe('unreachable and canceled requests', () => {
  const send = async (page: Page) => { await page.getByTestId('request-send-btn').click(); };
  const status = (page: Page) => page.getByTestId('response-status');

  test('[I4.2] connection refused (closed port) gives an explanatory message', async ({ page }) => {
    await scene(page, { url: 'http://127.0.0.1:1/x' });
    await send(page);
    await expect(status(page)).toContainText('Network Error');
    await expect(page.getByTestId('response-body-viewer')).toContainText('Could not reach http://127.0.0.1:1/x');
  });

  test('[I4.3] an unreachable response explains the problem and suggests the extension', async ({ page }) => {
    // Port 1 has no listener, so the browser's cross-origin fetch fails before any response arrives.
    await scene(page, { url: 'http://127.0.0.1:1/x' });
    await send(page);
    await expect(status(page)).toContainText('Network Error');
    await expect(page.getByTestId('response-body-viewer')).toContainText(/extension/i);
  });

  test('[I4.6] Cancel aborts the request and reports "Canceled" (distinct from a timeout)', async ({ page }) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    await page.route('https://slow.test/**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      await gate;
      await route.fulfill({ status: 200, body: 'late', headers: { 'access-control-allow-origin': '*' } }).catch(() => {});
    });
    await scene(page, { url: 'https://slow.test/x' });
    await send(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(status(page)).toContainText('Canceled');
    await expect(page.getByTestId('response-body-viewer')).not.toContainText(/timed out/i);
    release();
  });

});

// QA-66/QA-109: an undefined {{variable}} was reported as a generic network/CORS error without naming it.
test.describe('undefined variable', () => {
  test.use({ allowFpErrors: [/Network Error|Failed to fetch/] });

  test('QA-109: the response pane names the undefined variable', async ({ page }) => {
    await scene(page, { url: '{{nohost}}/get' });
    await page.getByTestId('request-send-btn').click();
    await page.getByRole('button', { name: 'Run Anyway' }).click();
    await expect(page.getByTestId('response-status')).toContainText('0');
    await expect(page.getByTestId('response-body-viewer')).toContainText('nohost');
    await expect(page.getByTestId('response-body-viewer')).toContainText('not defined') // string match: the viewer renders spaces as nbsp, which a regex would not match;
    await expect(page.getByTestId('response-body-viewer')).not.toContainText(/CORS/);
  });
});
