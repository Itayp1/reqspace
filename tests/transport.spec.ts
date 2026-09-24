import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from './helpers/adminAuth';

// SEC-0.2 "done when": the client never calls the server-side proxy anymore
// (grep for it in client/src is part of code review); this proves the other
// half — a real request goes out and its response renders — end to end
// through whichever transport the app actually picked (the browser fallback
// here, since this is a plain Chromium tab with no Electron bridge and no
// extension installed).
test('sending a request renders a real response through the active transport', async ({ page, request }) => {
  const { cookie } = await loginAsSuperAdmin(request);

  const ws = await (await request.post('http://localhost:3005/api/workspaces', {
    headers: { cookie },
    data: { name: 'TransportSpecWS' },
  })).json();
  const col = await (await request.post(`http://localhost:3005/api/workspaces/${ws._id}/collections`, {
    headers: { cookie },
    data: { name: 'TransportSpecCol' },
  })).json();
  await request.post(`http://localhost:3005/api/collections/${col._id}/requests`, {
    headers: { cookie },
    data: { name: 'TransportSpecReq', method: 'GET', url: 'https://jsonplaceholder.typicode.com/todos/1' },
  });

  await page.goto('http://localhost:3005/login');
  await page.fill('input[placeholder="admin or test@example.com"]', 'admin');
  await page.fill('input[type="password"]', 'AdminReset!2026');
  await page.click('button:has-text("Sign In")');

  await page.waitForSelector('option:has-text("TransportSpecWS")', { timeout: 15000, state: 'attached' });
  await page.locator('select').first().selectOption({ label: 'TransportSpecWS' });
  await page.waitForSelector('text=TransportSpecCol', { timeout: 15000 });
  await page.locator('text=TransportSpecCol').first().click();
  await page.waitForSelector('text=TransportSpecReq', { timeout: 15000 });
  await page.locator('text=TransportSpecReq').first().click();

  await expect(page.getByPlaceholder('Enter request URL')).toHaveValue('https://jsonplaceholder.typicode.com/todos/1');
  const sendBtn = page.locator('button:has-text("Send")');
  await expect(sendBtn).toBeEnabled();
  await sendBtn.click();

  // Also proves the HTTP/2 statusText backfill (types.ts normalizeStatusText):
  // jsonplaceholder answers over h2, which has no reason phrase on the wire.
  await expect(page.locator('text=/Status:\\s*200\\s*OK/')).toBeVisible({ timeout: 15000 });
});
