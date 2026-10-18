import { test, expect } from './fixtures';
import { registerUser, apiAs, expectToast } from './helpers';

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
    await page.getByTestId('prompt-submit').click();
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
    await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText(target);
    const targetId = await page.getByTestId('workspace-select').inputValue();
    // Back to the personal workspace to create the source.
    await page.getByTestId('workspace-select').selectOption({ index: 0 });

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

    await page.getByTestId('workspace-select').selectOption(targetId);
    await page.getByTestId('tab-environments').click();
    await expect(page.getByTestId('env-node-Portable (Copy)')).toBeVisible();
  });

  test('the editor\'s own Copy-to-Workspace control copies too', async ({ page }) => {
    const target = `Env Target B ${Date.now()}`;
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(target);
    await page.getByTestId('prompt-submit').click();
    await expect(page.getByTestId('workspace-select').locator('option:checked')).toHaveText(target);
    const targetId = await page.getByTestId('workspace-select').inputValue();
    await page.getByTestId('workspace-select').selectOption({ index: 0 });

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
