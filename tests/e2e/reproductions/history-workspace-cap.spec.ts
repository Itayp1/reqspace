import { test, expect } from '../fixtures';
import { registerUser, apiAsAdmin } from '../helpers';

/** History is capped per user in each workspace (default 10 MB); the oldest entries are deleted first. */
test('history over the per-workspace cap drops the oldest entries', async ({ page }) => {
  const admin = await apiAsAdmin();
  await admin.put('/api/admin/config', { data: { history: { maxTotalPerWorkspaceMB: 1 } } });
  try {
    await registerUser(page, 'histcap');
    const list = await (await page.request.get('/api/workspaces')).json();
    const wsId = (Array.isArray(list) ? list : list.workspaces)[0]._id;
    const body = 'x'.repeat(400 * 1024);
    for (let i = 0; i < 5; i++) {
      const res = await page.request.post(`/api/workspaces/${wsId}/history`, {
        data: {
          requestSnapshot: { method: 'GET', url: `https://cap.example.com/${i}`, headers: {}, params: [], body: '' },
          responseBody: body, responseStatus: 200, responseStatusText: 'OK', responseHeaders: {}, responseTime: 1, responseSize: body.length,
        },
      });
      expect(res.status(), await res.text()).toBe(201);
    }
    const { items, total } = await (await page.request.get(`/api/workspaces/${wsId}/history?limit=50`)).json();
    expect(total).toBeLessThanOrEqual(2);
    expect(items[0].url).toBe('https://cap.example.com/4');

    // A burst of concurrent saves must not overshoot the cap either (the prune is serialised per user + workspace).
    const save = (i: number) => page.request.post(`/api/workspaces/${wsId}/history`, {
      data: { requestSnapshot: { method: 'GET', url: `https://burst.example.com/${i}`, headers: {}, params: [], body: '' }, responseBody: body, responseStatus: 200, responseStatusText: 'OK', responseHeaders: {}, responseTime: 1, responseSize: body.length },
    });
    for (const r of await Promise.all(Array.from({ length: 8 }, (_, i) => save(i)))) expect(r.status()).toBe(201);
    const after = await (await page.request.get(`/api/workspaces/${wsId}/history?limit=50`)).json();
    expect(after.total).toBeLessThanOrEqual(3);
  } finally {
    await admin.put('/api/admin/config', { data: { history: { maxTotalPerWorkspaceMB: 10 } } });
  }
});
