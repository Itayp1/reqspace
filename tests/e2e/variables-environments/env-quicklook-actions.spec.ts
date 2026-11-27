import { test, expect } from '../fixtures';
import { registerUser, apiAs, selectWorkspace, activeWorkspaceId } from '../helpers';

test.describe('Environment quick look: copy and inline edit', () => {
  test('owner edits a value inline (persists); viewer can copy but not edit', async ({ page, browser }) => {
    const ownerEmail = await registerUser(page, 'qlowner');
    const wsId = await activeWorkspaceId(page);
    const owner = await apiAs(ownerEmail);
    const created = await owner.post(`/api/workspaces/${wsId}/environments`, {
      data: { name: 'QL Env', variables: [{ key: 'api_host', initialValue: 'old-value', currentValue: 'old-value', enabled: true }] },
    });
    expect(created.ok()).toBeTruthy();
    const envId = (await created.json())._id;

    const viewerPage = await browser.newPage();
    const viewerEmail = await registerUser(viewerPage, 'qlviewer');
    expect((await owner.post(`/api/workspaces/${wsId}/members`, { data: { email: viewerEmail, role: 'viewer' } })).ok()).toBeTruthy();

    // Owner
    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByTestId('env-select').selectOption(envId);
    await page.getByRole('button', { name: 'Environment quick look and edit' }).click();
    await expect(page.getByRole('button', { name: 'Copy api_host value' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit api_host value' }).click();
    const input = page.getByLabel('Value of api_host');
    await input.fill('new-value');
    await input.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Environment variables quick look' })).toContainText('new-value');

    await page.reload();
    await expect(page.getByTestId('workspace-select')).toBeVisible();
    await page.getByRole('button', { name: 'Environment quick look and edit' }).click();
    await expect(page.getByRole('dialog', { name: 'Environment variables quick look' })).toContainText('new-value');

    // Viewer: same workspace and environment, copy yes, edit no.
    await viewerPage.reload();
    await expect(viewerPage.getByTestId('workspace-select')).toBeVisible();
    await selectWorkspace(viewerPage, wsId);
    await viewerPage.getByTestId('env-select').selectOption(envId);
    await viewerPage.getByRole('button', { name: 'Environment quick look and edit' }).click();
    await expect(viewerPage.getByRole('button', { name: 'Copy api_host value' })).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: 'Edit api_host value' })).toHaveCount(0);
    await viewerPage.close();
  });
});
