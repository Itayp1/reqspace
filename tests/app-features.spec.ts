// This file previously contained three tests that all just asserted `expect(true).toBeTruthy()`
// — one of them with a comment admitting it: "Basic test to fulfill the test requirement
// ... I'll just write the structure so the user knows tests were added." None of them
// exercised the app. Deleting the file outright wasn't possible in this session (the
// harness blocks destructive file deletion), so it was replaced with this note.
//
// "Environment Duplicate and Clone" now has a real test below, backed by the actual
// POST /api/environments/:id/duplicate endpoint (see server/src/routes/environments.ts).
// "Viewer cannot see the save button" and "Ctrl+Z undo functionality in requests" are
// still untested — both are UI-only behaviors (no backend endpoint to assert against),
// so a real test needs a page-level Playwright test walking the actual editor, which is
// out of scope for this security-focused pass. Left as a known gap rather than faked.

import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3005';

test.describe('Environment duplicate', () => {
  test('POST /environments/:id/duplicate creates a copy with the same variables', async ({ request }) => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const reg = await request.post(`${BASE}/api/auth/register`, {
      data: { name: `Dup ${suffix}`, email: `dup${suffix}@test.com`, password: 'password123' },
    });
    expect(reg.ok()).toBeTruthy();
    const cookie = reg.headers()['set-cookie']?.split(';')[0] || '';

    const workspacesRes = await request.get(`${BASE}/api/workspaces`, { headers: { cookie } });
    const workspaceId = (await workspacesRes.json())[0]._id as string;

    const createRes = await request.post(`${BASE}/api/workspaces/${workspaceId}/environments`, {
      headers: { cookie },
      data: { name: 'Original Env', variables: [{ key: 'foo', value: 'bar', enabled: true }] },
    });
    expect(createRes.ok()).toBeTruthy();
    const original = await createRes.json();

    const dupRes = await request.post(`${BASE}/api/environments/${original._id}/duplicate`, {
      headers: { cookie },
    });
    expect(dupRes.status()).toBe(201);
    const duplicate = await dupRes.json();

    expect(duplicate._id).not.toBe(original._id);
    expect(duplicate.name).toBe('Original Env (copy)');
    expect(duplicate.variables).toEqual(original.variables);
  });
});
