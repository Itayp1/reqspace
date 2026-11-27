import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { registerUser, createCollectionUi, addViaMenu, treeNode, openNodeMenu, apiAs, selectWorkspace, activeWorkspaceId } from '../helpers';

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

test('viewer: missing-variable modal offers Personal only', async ({ page, browser }) => {
  const ownerEmail = await registerUser(page, 'mvowner');
  const wsId = await activeWorkspaceId(page);
  const owner = await apiAs(ownerEmail);
  expect((await owner.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'MV Env', variables: [] } })).ok()).toBeTruthy();
  const col = await (await owner.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'MVV Col' } })).json();
  const made = await owner.post(`/api/collections/${col.id ?? col._id}/requests`, { data: { name: 'MVV Req', method: 'GET', url: 'https://mvv.example.test/{{viewerVar}}' } });
  expect(made.ok()).toBeTruthy();

  const viewerPage = await browser.newPage();
  const viewerEmail = await registerUser(viewerPage, 'mvviewer');
  expect((await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } })).ok()).toBeTruthy();
  await viewerPage.reload();
  await expect(viewerPage.getByTestId('workspace-select')).toBeVisible();
  await selectWorkspace(viewerPage, wsId);

  await viewerPage.route('https://mvv.example.test/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await viewerPage.getByTestId('node-MVV Col').click();
  await viewerPage.getByTestId('node-MVV Req').click();
  await viewerPage.getByTestId('request-send-btn').click();

  const scope = viewerPage.getByLabel('Scope for viewerVar');
  await expect(scope).toHaveValue('profile');
  for (const s of ['environment', 'collection', 'global']) {
    await expect(scope.locator(`option[value="${s}"]`)).toBeDisabled();
  }
  await expect(viewerPage.getByTestId('missing-variables-modal')).toContainText('view-only access');
  await viewerPage.close();
});

test.describe('missing-variable modal UX', () => {
  test('sending a request with an undefined {{variable}} asks about it, and Run Anyway is remembered', async ({ page }) => {
    await registerUser(page, 'missingvar');
    let hits = 0;
    await page.route('https://mv.example.test/**', (route) => { hits++; return route.fulfill({ status: 200, body: 'ok' }); });
    await page.getByTestId('new-tab-btn').click();
    await page.getByTestId('request-url-input').fill('https://mv.example.test/{{phoneNumber}}');
    await page.getByTestId('request-send-btn').click();
    await expect(page.getByTestId('missing-variables-modal')).toBeVisible();
    await expect(page.getByTestId('missing-var-phoneNumber')).toBeVisible();
    await page.getByRole('button', { name: 'Run Anyway' }).click();
    await expect.poll(() => hits).toBe(1);
    await page.getByTestId('request-send-btn').click();
    await expect.poll(() => hits).toBe(2);
    await expect(page.getByTestId('missing-variables-modal')).toHaveCount(0);
  });
});
