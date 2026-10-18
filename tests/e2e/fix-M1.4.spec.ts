import { test, expect } from './fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { API_URL } from './fixtures';

// these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

/**
 * M1.4 / finding 159. MANUAL_TEST_PLAN.md records a product DECISION: there is intentionally no
 * server-side proxy (shareProxyRouter) for the share page; requests run in the viewer's browser/extension.
 * So there is no product bug to fix and no SSRF surface to test. The closest meaningful test pins that
 * decision: the share link grants no server-side execution (no anonymous proxy that could reach
 * internal addresses) and the public payload is purely descriptive data.
 * This test passes both before and after (no code change was needed).
 */
let seq = 0;
const ip = () => `10.${200 + (seq++ % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const idOf = (o: any) => (o.id ?? o._id) as string;
async function anon(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
}

test('[M1.4] share link exposes no server-side request execution (no proxy, so no SSRF surface)', async () => {
  const owner = await anon();
  const email = `m14_${Date.now()}_${Math.floor(Math.random() * 1e5)}@example.com`;
  expect((await owner.post('/api/auth/register', { data: { name: 'QA', email, password: 'password123' } })).status()).toBe(201);
  const wsList = await (await owner.get('/api/workspaces')).json();
  const wsId = idOf(wsList.find((w: any) => w.isPersonal) ?? wsList[0]);
  const col = await (await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'M14 col' } })).json();
  const rq = await owner.post(`/api/collections/${idOf(col)}/requests`, { data: { method: 'GET', name: 'internal', url: 'http://127.0.0.1:1/admin' } });
  expect(rq.ok()).toBeTruthy();
  const link = await (await owner.post(`/api/share/collection/${idOf(col)}`, { data: {} })).json();

  const viewer = await anon();
  const view = await viewer.get(`/api/share/${link.shortId}`);
  expect(view.status()).toBe(200);
  const body = await view.json();
  // Descriptive data only: nothing that tells the page to execute through the server.
  expect(JSON.stringify(body)).not.toMatch(/proxy|execute/i);

  // No anonymous (or owner) server-side execution endpoint hangs off the share link.
  for (const path of ['proxy', 'execute', 'run', 'send']) {
    for (const ctx of [viewer, owner]) {
      const res = await ctx.post(`/api/share/${link.shortId}/${path}`, {
        data: { method: 'GET', url: 'http://127.0.0.1:1/admin' },
        headers: { origin: 'http://localhost:5173' },
      });
      expect([401, 403, 404], `${path} -> ${res.status()}`).toContain(res.status());
      expect(res.status()).not.toBeLessThan(400);
    }
  }
});
