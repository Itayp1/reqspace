import type { Page } from '@playwright/test';
import { expect } from '../fixtures';
import { registerUser } from '../helpers';

/**
 * Register a user, seed collection "Col" with one GET request "Req" to `url`, and open it.
 * The dev server only accepts the Origin of the client port, so /api calls get the page's real origin.
 */
export async function seedRequest(page: Page, prefix: string, url: string, beforeReload?: () => Promise<void>) {
  await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: new URL(page.url()).origin } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
  await registerUser(page, prefix);
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const col = await (await page.request.post(`/api/workspaces/${ws.id ?? ws._id}/collections`, { data: { name: 'Col' } })).json();
  const r = await page.request.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'Req', method: 'GET', url } });
  expect(r.ok()).toBeTruthy();
  await beforeReload?.();
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();
  await page.getByTestId('node-Col').click();
  await page.getByTestId('node-Req').click();
}

/** Register (UI), turn on sending jar cookies (off by default) and open a new request. */
export async function registerAndOpenRequest(page: Page, tag: string) {
  const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await page.goto('/register');
  await page.getByTestId('register-name').fill('Cookie User');
  await page.getByTestId('register-email').fill(`${tag}_${ts}@example.com`);
  await page.getByTestId('register-password').fill('password123');
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/.*\/$/);
  await page.request.put('/api/auth/settings', { data: { sendCookies: true } });
  await page.reload();
  await page.getByTestId('create-request-btn').click();
}
