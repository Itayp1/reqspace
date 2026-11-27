import { test, expect } from '../fixtures';
import { apiAsAdmin } from '../helpers';

test('a NUL in an id or name is still refused', async () => {
  const admin = await apiAsAdmin();
  const res = await admin.post('/api/workspaces', { data: { name: 'bad\u0000name' } });
  expect(res.status()).toBe(400);
});
