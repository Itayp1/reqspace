import { expect, type Page } from '../fixtures';
import { registerUser } from '../helpers';

/** Routes https://mock.test/** (answers CORS too) and records what the browser actually sent. */
export async function mockServer(page: Page) {
  const seen: Array<{ url: string; method: string; headers: Record<string, string>; body: string | null }> = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
  await page.route('https://mock.test/**', async (route) => {
    const r = route.request();
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    seen.push({ url: r.url(), method: r.method(), headers: r.headers(), body: r.postData() });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}', headers: cors });
  });
  return seen;
}

/** Registers a user, creates collection "Col" with one request "Req" (fields from `request`), opens it. */
export async function scene(page: Page, request: Record<string, unknown> = {}, env?: Array<Record<string, unknown>>) {
  // The dev server only accepts the Origin of the client port.
  await page.route(/\/api\//, async (route) => { try { const res = await route.fetch({ headers: { ...route.request().headers(), origin: new URL(page.url()).origin } }); await route.fulfill({ response: res }); } catch { /* page closed */ } });
  await registerUser(page, 'repro');
  const wsList = await (await page.request.get('/api/workspaces')).json();
  const list = Array.isArray(wsList) ? wsList : wsList.workspaces;
  const ws = list.find((w: any) => w.isPersonal) ?? list[0];
  const wsId = ws.id ?? ws._id;
  const col = await (await page.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'Col' } })).json();
  const colId = col.id ?? col._id;
  const r = await page.request.post(`/api/collections/${colId}/requests`, { data: { name: 'Req', method: 'GET', url: 'https://mock.test/x', ...request } });
  expect(r.ok(), 'create request ' + (await r.text())).toBeTruthy();
  const reqId = (await r.json())._id;
  if (env) {
    const e = await page.request.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'EnvA', variables: env } });
    expect(e.ok()).toBeTruthy();
  }
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();
  await page.getByTestId('node-Col').click();
  await page.getByTestId('node-Req').click();
  if (env) await page.getByTestId('env-select').selectOption({ label: 'EnvA' });
  return { wsId, colId, reqId };
}

export const envVar = (key: string, val: string) => ({ key, value: val, initialValue: val, currentValue: val, enabled: true });
