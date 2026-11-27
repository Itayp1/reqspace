import http from 'node:http';
import { test, expect } from '../fixtures';
import type { Page } from '@playwright/test';
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
