import { test, expect, request as pwRequest, API_URL } from '../fixtures';
import { selectWorkspace, activeWorkspaceId, expectWorkspaceListed } from '../helpers';
import { makeUser } from './invite-helpers';

test.describe('Workspace Management', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  const timestamp = Date.now();
  const testEmail = `wsuser_${timestamp}@example.com`;
  const testPassword = 'password123';

  test('should register, login, create, edit, switch and delete a workspace', async ({ page }) => {
    // 1. Register and Login
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'WS User');
    await page.fill('[data-testid="register-email"]', testEmail);
    await page.fill('[data-testid="register-password"]', testPassword);
    await page.click('[data-testid="register-submit"]');
    await expect(page).toHaveURL(/.*\/$/);
    
    // 2. Create a new Workspace
    const newWorkspaceName = `Test Workspace ${timestamp}`;
    const editedWorkspaceName = `${newWorkspaceName} Edited`;

    await page.click('[data-testid="new-workspace-btn"]');
    await page.getByTestId('prompt-input').fill(newWorkspaceName);
    await page.getByTestId('prompt-submit').click();
    
    await expectWorkspaceListed(page, newWorkspaceName);

    // 3. Switch to it
    const workspaceId = await activeWorkspaceId(page);
    await selectWorkspace(page, workspaceId);

    // 4. Edit the workspace
    await page.click('[data-testid="workspace-settings-btn"]');
    await page.fill('[data-testid="workspace-name-input"]', editedWorkspaceName);
    const saved = page.waitForResponse(
      (r) => r.request().method() === 'PUT' && /\/workspaces\/[^/]+$/.test(r.url()) && r.ok(),
    );
    await page.click('[data-testid="workspace-save-btn"]');
    await saved;
    await page.click('[data-testid="close-workspace-modal"]');
    
    await expectWorkspaceListed(page, editedWorkspaceName);

    // Cookie session authenticates; there is no Bearer token in localStorage.
    const status = await page.evaluate(async (id) => {
      const r = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
      return r.status;
    }, workspaceId);
    expect(status).toBe(200);
    await page.reload();
    await expect(page.locator('[data-testid="workspace-select"]')).not.toContainText(editedWorkspaceName);
  });
});

test.describe('Workspace duplicate', () => {
  // the 403 for a non-owner is provoked on purpose
  test.use({ allowFpErrors: [/server-auth|status code 403/] });

  const ip = () => `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.2.2`;

  async function user(name: string) {
    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
    const email = `${name}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
    expect((await ctx.post('/api/auth/register', { data: { name, email, password: 'password123' } })).ok()).toBeTruthy();
    expect((await ctx.post('/api/auth/login', { data: { email, password: 'password123' } })).ok()).toBeTruthy();
    return { ctx, email };
  }

  test('duplicating a workspace copies content and members; opt-outs are honoured', async () => {
    const owner = await user('dupowner');
    const editor = await user('dupeditor');
    const ws = await (await owner.ctx.post('/api/workspaces', { data: { name: 'Src' } })).json();
    await owner.ctx.post(`/api/workspaces/${ws._id}/members`, { data: { email: editor.email, role: 'editor' } });
    await editor.ctx.get('/api/workspaces'); // a pending invite becomes a membership on the invitee's next request
    const col = await (await owner.ctx.post(`/api/workspaces/${ws._id}/collections`, { data: { name: 'Col' } })).json();
    const folder = await (await owner.ctx.post(`/api/collections/${col._id}/folders`, { data: { name: 'Fol' } })).json();
    await owner.ctx.post(`/api/collections/${col._id}/requests`, { data: { name: 'Req', method: 'GET', url: 'http://x', folderId: folder._id } });
    await owner.ctx.post(`/api/workspaces/${ws._id}/environments`, { data: { name: 'Env', variables: [{ key: 'tok', value: 's3cret', type: 'secret', enabled: true }] } });

    // Everything on by default.
    const full = await owner.ctx.post(`/api/workspaces/${ws._id}/duplicate`, { data: { name: 'Copy' } });
    expect(full.status()).toBe(201);
    const copy = await full.json();
    expect(copy.members.map((m: any) => m.role).sort()).toEqual(['editor', 'owner']);
    const cols = await (await owner.ctx.get(`/api/workspaces/${copy._id}/collections`)).json();
    expect(cols.map((c: any) => c.name)).toEqual(['Col']);
    const envs = await (await owner.ctx.get(`/api/workspaces/${copy._id}/environments`)).json();
    expect(envs[0].variables[0].value).toBe('s3cret');
    // The editor can see the copy.
    expect((await editor.ctx.get(`/api/workspaces/${copy._id}`)).ok()).toBeTruthy();

    // Opt out of members and secret values.
    const lean = await (await owner.ctx.post(`/api/workspaces/${ws._id}/duplicate`, { data: { name: 'Lean', includeMembers: false, includeSecretValues: false } })).json();
    expect(lean.members).toHaveLength(1);
    const leanEnvs = await (await owner.ctx.get(`/api/workspaces/${lean._id}/environments`)).json();
    expect(leanEnvs[0].variables[0].value).toBe('');

    // Only owners may duplicate.
    expect((await editor.ctx.post(`/api/workspaces/${ws._id}/duplicate`, { data: { name: 'Nope' } })).status()).toBe(403);
  });
});

test.describe('Workspace API rules', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]/] });

  test('[B1.5] a personal workspace cannot be deleted', async () => {
    const { ctx } = await makeUser('b15');
    const list = await (await ctx.get('/api/workspaces')).json();
    const arr: any[] = Array.isArray(list) ? list : list.workspaces;
    const personal = arr.find((w) => w.isPersonal);
    expect(personal, 'registration creates a personal workspace').toBeTruthy();
    const res = await ctx.delete(`/api/workspaces/${personal.id ?? personal._id}`);
    expect([400, 403, 409]).toContain(res.status());
  });

  test('[B2.2] a public workspace is listed for users who are not members', async () => {
    const owner = await makeUser('b22o');
    const res = await owner.ctx.post('/api/workspaces', { data: { name: `pub_${Date.now()}`, isPublic: true } });
    const ws = await res.json();
    const id = ws.id ?? ws._id;
    const other = await makeUser('b22x');
    const list = await (await other.ctx.get('/api/workspaces')).json();
    const arr: any[] = Array.isArray(list) ? list : list.workspaces;
    expect(arr.some((w) => (w.id ?? w._id) === id)).toBe(true);
  });
});
