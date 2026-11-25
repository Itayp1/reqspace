import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { registerUser, createCollectionUi, addViaMenu, treeNode, openNodeMenu, apiAs, activeWorkspaceId } from './helpers';

async function openMissingModal(page: Page, name: string) {
  await page.route('https://mvt.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await createCollectionUi(page, 'MVT Col');
  await addViaMenu(page, 'MVT Col', 'new-request', 'One');
  await treeNode(page, 'One').click();
  await page.getByTestId('request-url-input').fill(`https://mvt.example.test/{{${name}}}`);
  await page.getByTestId('request-save-btn').click();
  await expect(page.getByTestId('dirty-indicator')).toHaveCount(0);
  await openNodeMenu(page, 'MVT Col');
  await page.getByTestId('action-menu-run-collection').click();
  await page.getByTestId('collection-runner-run-btn').click();
  const dialog = page.getByTestId('missing-variables-modal');
  await expect(dialog).toContainText(name);
  return dialog;
}

test('missing variable scope defaults to Personal', async ({ page }) => {
  await registerUser(page, 'mvt1');
  const dialog = await openMissingModal(page, 'seg');
  await expect(dialog.getByLabel('Scope for seg')).toHaveValue('profile');
});

test('missing variable can be created in a chosen environment', async ({ page }) => {
  const email = await registerUser(page, 'mvt2');
  const wsId = await activeWorkspaceId(page);
  const api = await apiAs(email);
  for (const name of ['Alpha', 'Beta']) {
    const res = await api.post(`/api/workspaces/${wsId}/environments`, { data: { name, variables: [] } });
    expect(res.ok()).toBeTruthy();
  }
  await page.reload();
  await expect(page.getByTestId('workspace-select')).toBeVisible();

  const dialog = await openMissingModal(page, 'seg');
  await dialog.getByLabel('Scope for seg').selectOption('environment');
  await dialog.getByLabel('Environment for seg').selectOption({ label: 'Beta' });
  await page.getByTestId('missing-var-value-seg').fill('v1');
  await page.getByTestId('missing-variables-create').click();
  await expect(dialog).toHaveCount(0);

  const envs = await (await api.get(`/api/workspaces/${wsId}/environments`)).json();
  const keys = (n: string) => envs.find((e: any) => e.name === n).variables.map((v: any) => v.key);
  expect(keys('Beta')).toContain('seg');
  expect(keys('Alpha')).not.toContain('seg');
  await api.dispose();
});

test('missing variable can be created in the global environment', async ({ page }) => {
  const email = await registerUser(page, 'mvt3');
  const wsId = await activeWorkspaceId(page);
  const dialog = await openMissingModal(page, 'seg');
  await dialog.getByLabel('Scope for seg').selectOption('global');
  await page.getByTestId('missing-var-value-seg').fill('g1');
  await page.getByTestId('missing-variables-create').click();
  await expect(dialog).toHaveCount(0);

  const api = await apiAs(email);
  const g = await (await api.get(`/api/workspaces/${wsId}/global-environment`)).json();
  expect(g.variables.map((v: any) => v.key)).toContain('seg');
  await api.dispose();
});
