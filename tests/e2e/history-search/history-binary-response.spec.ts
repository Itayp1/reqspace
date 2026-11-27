import { test, expect } from '../fixtures';
import { apiAsAdmin } from '../helpers';

/** HIST1: saving history for a binary response (its text contains NUL) was refused with 400 by the global NUL guard. */
test('history accepts a response body that contains NUL characters', async () => {
  const admin = await apiAsAdmin();
  const workspaces = await (await admin.get('/api/workspaces')).json();
  const wsId = workspaces[0]._id;
  const res = await admin.post(`/api/workspaces/${wsId}/history`, {
    data: {
      requestSnapshot: { method: 'GET', url: 'https://example.test/file.zip' },
      responseBody: 'PK\u0003\u0004\u0000ÿþ\u0000\u0001\u0002',
      responseStatus: 200, responseStatusText: 'OK', responseHeaders: {}, responseTime: 5, responseSize: 10,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
});

test('a NUL in an id or name is still refused', async () => {
  const admin = await apiAsAdmin();
  const res = await admin.post('/api/workspaces', { data: { name: 'bad\u0000name' } });
  expect(res.status()).toBe(400);
});
