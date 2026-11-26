import { test, expect, API_URL } from '../fixtures';
import { apiAs, apiAsAdmin } from '../helpers';
import { request as playwrightRequest } from '@playwright/test';

/** A superadmin must see every workspace, including other users' private ones. */
test('admin workspace list includes private workspaces of other users', async () => {
  const email = `ws_owner_${Date.now()}@example.com`;
  const anon = await playwrightRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': '10.251.7.7' } });
  const reg = await anon.post('/api/auth/register', { data: { name: 'Owner', email, password: 'password123' } });
  expect(reg.ok(), await reg.text()).toBeTruthy();
  const owner = await apiAs(email);
  const name = `Private ${Date.now()}`;
  const created = await owner.post('/api/workspaces', { data: { name, isPublic: false } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const id = (await created.json())._id ?? (await created.json()).id;

  const admin = await apiAsAdmin();
  const list = await (await admin.get('/api/workspaces')).json();
  expect(list.map((w: any) => w._id ?? w.id)).toContain(id);
});
