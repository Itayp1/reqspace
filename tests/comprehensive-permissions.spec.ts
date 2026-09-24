import { serverOrigin } from './helpers/baseUrl';
// This file previously generated ~294 tests that all asserted `expect(true).toBeTruthy()`
// (role-matrix loops, "UI component interaction N", "Copy collection scenario N",
// "Admin can X - Variant N", "Viewport scale stress test N") — none of them exercised
// any actual code path, so they always passed regardless of real behavior and only
// inflated the reported test count. Deleting the file outright wasn't possible in this
// session (the harness blocks destructive file deletion), so the placeholder tests were
// replaced with this note instead.
//
// The one test in here that did call a real endpoint (header-auth auto-login) is kept
// below. Real, assertion-backed coverage for role-based access control now lives in
// access-control.spec.ts, including the read-path IDOR gaps this suite's structure
// implied were covered but never actually checked (GET /requests/:id, GET
// /collections/:id/folders, GET /collections/:id/requests, GET /environments/:id, and
// POST /share/collection/:id all previously had no membership check at all).

import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from './helpers/adminAuth';

test.describe('Header-based auto-login (system config auth.mode = "both")', () => {
  test.beforeAll(async ({ request }) => {
    const admin = await loginAsSuperAdmin(request);
    await request.put(`${serverOrigin()}/api/admin/config`, {
      data: { auth: { mode: 'both', headerName: 'uid' } },
      headers: { cookie: admin.cookie },
    });
  });

  test('logs in automatically when the configured header is present', async ({ request }) => {
    const res = await request.get(`${serverOrigin()}/api/auth/me`, {
      headers: { uid: 'test-header-user' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.email).toBe('test-header-user');
  });
});
