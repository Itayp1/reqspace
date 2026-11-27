import { test, expect } from '../fixtures';
import { apiAsAdmin } from '../helpers';

const pw = (s: string) => Buffer.from(s).toString('base64');

test.describe('Full system backup (admin)', () => {
  test('an encrypted export can be checked and merged back; a wrong password is refused', async () => {
    const admin = await apiAsAdmin();
    const exp = await admin.post('/api/admin/system/export', { data: { password: 'backup-pass-1' } });
    expect(exp.status()).toBe(200);
    expect(exp.headers()['content-disposition']).toContain('.rqsx');
    const file = await exp.body();
    expect(file.toString()).not.toContain('passwordHash');

    const send = (path: string, password: string) => admin.post(path, { data: file, headers: { 'content-type': 'application/octet-stream', 'x-transfer-password': pw(password) } });

    const wrong = await send('/api/admin/system/import/preview?mode=merge', 'not-the-password');
    expect(wrong.status()).toBe(422);

    const prev = await send('/api/admin/system/import/preview?mode=merge', 'backup-pass-1');
    expect(prev.status()).toBe(200);
    expect((await prev.json()).counts.users).toBeGreaterThan(0);

    const merged = await send('/api/admin/system/import?mode=merge', 'backup-pass-1');
    expect(merged.status(), await merged.text()).toBe(200);
    expect((await merged.json()).skipped.users).toBeGreaterThan(0);
  });

  test.use({ allowFpErrors: [/system\/export responded 401/] });
  test('export needs a password of at least 8 characters and an admin', async ({ request }) => {
    const admin = await apiAsAdmin();
    expect((await admin.post('/api/admin/system/export', { data: { password: 'short' } })).status()).toBe(400);
    expect((await request.post('/api/admin/system/export', { data: { password: 'long-enough-pw' } })).status()).toBeGreaterThanOrEqual(401);
  });
});
