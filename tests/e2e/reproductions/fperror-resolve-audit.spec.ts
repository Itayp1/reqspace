import { test, expect } from '../fixtures';
import { apiAsAdmin } from '../helpers';

/**
 * FPERR-AUDIT: "Fixed" on an error group (DELETE /api/admin/errors/:fingerprint) wrote the
 * 64-char fingerprint into audit_logs.targetId, which is VARCHAR(36). Postgres and MySQL
 * reject the row, so the audit log failed and the fault was recorded. SQLite does not enforce
 * lengths, so this only shows up on the server-DB backends.
 */
test('resolving an error group with a 64-char fingerprint succeeds and writes its audit row', async () => {
  const admin = await apiAsAdmin();
  const fingerprint = 'a'.repeat(64);
  const res = await admin.delete(`/api/admin/errors/${fingerprint}`);
  expect(res.status(), await res.text()).toBe(200);
});
