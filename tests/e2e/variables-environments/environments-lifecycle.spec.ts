import { test, expect, API_URL } from '../fixtures';
import { request as pwRequest } from '@playwright/test';
import { registerUser, apiAs, expectToast, selectWorkspace, activeWorkspaceId } from '../helpers';

/**
 * Environment sidebar actions. "Duplicate" and "Copy to Workspace" called
 * POST /environments/:id/duplicate, a route that did not exist — both 404'd.
 * Rename and Delete had no coverage at all.
 */
test.describe('Environment sidebar actions', () => {
  let email = '';

  async function envMenu(page: import('@playwright/test').Page, envName: string, action: string) {
    await page.getByTestId(`env-node-${envName}`).click({ button: 'right' });
    await page.getByTestId('context-menu-item').filter({ hasText: action }).click();
  }

  async function createEnv(page: import('@playwright/test').Page, name: string, key: string, value: string) {
    await page.getByTestId('tab-environments').click();
    await page.getByTestId('new-env-btn').click();
    await page.getByTestId('prompt-input').fill(name);
    await page.getByTestId('prompt-input').press('Enter');
    await expect(page.getByTestId(`env-node-${name}`)).toBeVisible();
    await page.getByTestId('add-env-var-btn').click();
    await page.getByTestId('env-var-key-0').fill(key);
    await page.getByTestId('env-var-initial-0').fill(value);
    await page.getByTestId('env-save-btn').click();
    await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
  }

  test.beforeEach(async ({ page }) => {
    email = await registerUser(page, 'envcrud');
  });

  test('Duplicate copies the environment and its variables', async ({ page }) => {
    await createEnv(page, 'Base Env', 'token', 'abc123');
    const dup = page.waitForResponse(r => r.url().includes('/duplicate'));
    await envMenu(page, 'Base Env', 'Duplicate');
    expect((await dup).status()).toBe(201);
    await expect(page.getByTestId('env-node-Base Env (Copy)')).toBeVisible();

    await page.getByTestId('env-node-Base Env (Copy)').click();
    await expect(page.getByTestId('env-var-key-0')).toHaveValue('token');
    await expect(page.getByTestId('env-var-initial-0')).toHaveValue('abc123');

    // Stored, not just drawn.
    await page.reload();
    await page.getByTestId('tab-environments').click();
    await expect(page.getByTestId('env-node-Base Env (Copy)')).toBeVisible();
  });

  test('Rename and Delete persist', async ({ page }) => {
    await createEnv(page, 'Old Name', 'k', 'v');
    await envMenu(page, 'Old Name', 'Rename');
    await page.getByTestId('prompt-input').fill('New Name');
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('env-node-New Name')).toBeVisible();
    await expect(page.getByTestId('env-node-Old Name')).toHaveCount(0);

    await envMenu(page, 'New Name', 'Delete');
    await page.getByTestId('confirm-btn').click();
    await expect(page.getByTestId('env-node-New Name')).toHaveCount(0);

    await page.reload();
    await page.getByTestId('tab-environments').click();
    await expect(page.getByTestId('env-node-New Name')).toHaveCount(0);
    await expect(page.getByTestId('env-node-Old Name')).toHaveCount(0);
  });

  test('Copy to Workspace puts a copy in the other workspace', async ({ page }) => {
    const target = `Env Target ${Date.now()}`;
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(target);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('workspace-select')).toHaveText(target);
    const targetId = await activeWorkspaceId(page);
    // Back to the personal workspace to create the source.
    await selectWorkspace(page, { index: 0 });

    await createEnv(page, 'Portable', 'region', 'eu');
    await envMenu(page, 'Portable', 'Copy to Workspace');
    await page.getByTestId('copy-target-workspace-select').selectOption(targetId);
    await page.getByTestId('copy-submit-btn').click();
    await expectToast(page, 'success', 'Copied "Portable"');

    const api = await apiAs(email);
    const envs = await (await api.get(`/api/workspaces/${targetId}/environments`)).json();
    expect(envs.map((e: any) => e.name)).toEqual(['Portable (Copy)']);
    expect(envs[0].variables[0]).toEqual(expect.objectContaining({ key: 'region' }));
    await api.dispose();

    await selectWorkspace(page, targetId);
    await page.getByTestId('tab-environments').click();
    await expect(page.getByTestId('env-node-Portable (Copy)')).toBeVisible();
  });

  test('the editor\'s own Copy-to-Workspace control copies too', async ({ page }) => {
    const target = `Env Target B ${Date.now()}`;
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(target);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('workspace-select')).toHaveText(target);
    const targetId = await activeWorkspaceId(page);
    await selectWorkspace(page, { index: 0 });

    await createEnv(page, 'From Editor', 'x', 'y');
    await page.getByTestId('env-copy-target').selectOption(targetId);
    await page.getByTestId('env-copy-btn').click();
    await expectToast(page, 'success', 'copied to workspace');

    const api = await apiAs(email);
    const envs = await (await api.get(`/api/workspaces/${targetId}/environments`)).json();
    expect(envs.map((e: any) => e.name)).toEqual(['From Editor (Copy)']);
    await api.dispose();
  });
});

// QA-73: an environment added while a Rename prompt is open vanished from the list, because the
// handler wrote back the list it captured before the prompt.
test('QA-73: env created while the Rename prompt is open stays in the list', async ({ page }) => {
  await registerUser(page, 'qa73');
  await page.getByTestId('tab-environments').click();
  await page.getByTestId('new-env-btn').click();
  await page.getByTestId('prompt-input').fill('Env One');
  await page.getByTestId('prompt-submit').click();
  await expect(page.getByTestId('env-node-Env One')).toBeVisible();

  await page.getByTestId('env-node-Env One').click({ button: 'right' });
  await page.getByTestId('context-menu-item').filter({ hasText: 'Rename' }).click();
  await expect(page.getByTestId('prompt-input')).toBeVisible();

  // Another client adds an env; the socket pushes it into the list while the prompt is open.
  await page.evaluate(async () => {
    const ws = (await (await fetch('/api/workspaces')).json()).find((w: any) => w.isPersonal);
    await fetch(`/api/workspaces/${ws._id ?? ws.id}/environments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Env Two', variables: [] }),
    });
  });
  await expect(page.getByTestId('env-node-Env Two')).toBeVisible();

  await page.getByTestId('prompt-input').fill('Env One Renamed');
  await page.getByTestId('prompt-submit').click();
  await expect(page.getByTestId('env-node-Env One Renamed')).toBeVisible();
  await expect(page.getByTestId('env-node-Env Two')).toBeVisible();
});

test.describe('Environments API: duplicate names and secrets', () => {
  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const v = (key: string, val: string, extra: Record<string, unknown> = {}) => ({ key, value: val, initialValue: val, currentValue: val, enabled: true, ...extra });

  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA', email, password: 'password123' } });
    expect(res.status()).toBe(201);
    return { ctx, email };
  }

  test('[G3.3] copying an environment twice into the same workspace gives unique names', async () => {
    const { ctx } = await newUser('g33');
    const ws = (await (await ctx.post('/api/workspaces', { data: { name: uniq('ws') } })).json());
    const wsId = ws.id ?? ws._id;
    const env = await (await ctx.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'Src', variables: [] } })).json();
    const id = env.id ?? env._id;
    const a = await (await ctx.post(`/api/environments/${id}/duplicate`, { data: {} })).json();
    const b = await (await ctx.post(`/api/environments/${id}/duplicate`, { data: {} })).json();
    expect(a.name).not.toBe(b.name);
  });

  test('[G4.2] secret variable values are not returned to a read-only member', async () => {
    const owner = await newUser('g42o');
    const viewer = await newUser('g42v');
    const ws = (await (await owner.ctx.post('/api/workspaces', { data: { name: uniq('ws') } })).json());
    const wsId = ws.id ?? ws._id;
    expect((await owner.ctx.post(`/api/workspaces/${wsId}/members`, { data: { email: viewer.email, role: 'viewer' } })).ok()).toBeTruthy();
    await owner.ctx.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'S', variables: [v('sec', 'TOPSECRET', { isSecret: true, type: 'secret' })] } });
    const asViewer = await (await viewer.ctx.get(`/api/workspaces/${wsId}/environments`)).text();
    expect(asViewer).not.toContain('TOPSECRET');
    const asOwner = await (await owner.ctx.get(`/api/workspaces/${wsId}/environments`)).text();
    expect(asOwner).toContain('TOPSECRET');
  });
});
