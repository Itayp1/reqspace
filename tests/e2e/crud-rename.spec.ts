import { test, expect } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

test.describe('Full CRUD / Rename Matrix', () => {
  const email = `matrix_${uuidv4()}@example.com`;
  const pass = 'password123';
  const timestamp = Date.now();

  test.beforeAll(async ({ request }) => {
    // Fast register to prep user
    await request.post('/api/auth/register', {
      data: { name: 'Matrix Tester', email, password: pass }
    });
  });

  test('Matrix Test: Rename Workspace, Collection, Request, Variable, and Parameter', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(pass);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    
    // Initial workspace creation prompt on first login
    page.on('dialog', async (dialog) => {
      // Sometimes it prompts for the first workspace
      if (dialog.message().includes('Workspace Name')) {
        await dialog.accept('Initial WS');
      }
    });

    // 2. Create Workspace and Rename it
    const wsName = `WS_${timestamp}`;
    const renamedWs = `${wsName}_Renamed`;
    
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('workspace-name-input').fill(wsName);
    await page.getByTestId('workspace-submit-btn').click();
    await expect(page.getByTestId('workspace-select')).toContainText(wsName);
    
    // Select it
    await page.getByTestId('workspace-select').selectOption({ label: wsName });

    // Rename Workspace
    await page.getByTestId('workspace-settings-btn').click();
    await page.getByTestId('workspace-name-input').fill(renamedWs);
    await page.getByTestId('workspace-save-btn').click();
    await page.getByTestId('close-workspace-modal').click();
    await expect(page.getByTestId('workspace-select')).toContainText(renamedWs);

    // 3. Create Environment, Variable, and Rename Variable
    await page.getByTestId('tab-environments').click();
    
    // The prompt is handled by Playwright dialog handler, but we need to reset it for the Env prompt
    page.once('dialog', dialog => dialog.accept('Test Env'));
    await page.getByTestId('new-env-btn').click();
    await expect(page.getByTestId('env-node-Test Env')).toBeVisible();

    // Add Variable
    await page.getByTestId('add-env-var-btn').click();
    await page.getByTestId('env-var-key-0').fill('old_var');
    await page.getByTestId('env-var-initial-0').fill('value1');
    await page.getByTestId('env-save-btn').click();
    // Rename Variable
    await page.getByTestId('env-var-key-0').fill('renamed_var');
    await page.getByTestId('env-save-btn').click();

    // 4. Create Collection, Request, and Parameter, then Rename them
    await page.getByTestId('tab-collections').click();

    // Create Collection
    page.once('dialog', dialog => dialog.accept('Test Collection'));
    const createColBtn = page.getByTestId('new-collection-empty-btn');
    if (await createColBtn.isVisible()) {
      await createColBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection') });
    await expect(colNode).toBeVisible();

    // Rename Collection
    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-rename').click();
    await page.getByTestId('inline-rename-input').fill('Renamed Collection');
    await page.getByTestId('inline-rename-input').press('Enter');
    
    const renamedColNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Renamed Collection') });
    await expect(renamedColNode).toBeVisible();

    // Create Request inside Collection
    await renamedColNode.hover();
    await renamedColNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    
    page.once('dialog', dialog => dialog.accept('Initial Request'));
    const reqNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-New Request') });
    // Note: The UI creates it as 'New Request' and double clicking renames it, or we use action menu.
    // Wait for the new request to appear
    await expect(reqNode).toBeVisible();

    // Rename Request
    await reqNode.hover();
    await reqNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-rename').click();
    await page.getByTestId('inline-rename-input').fill('Renamed Request');
    await page.getByTestId('inline-rename-input').press('Enter');

    const renamedReqNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Renamed Request') });
    await expect(renamedReqNode).toBeVisible();

    // Open the Request
    await renamedReqNode.click();
    await expect(page.getByTestId('request-url-input')).toBeVisible();

    // Add Query Parameter
    await page.getByTestId('kv-key-0').fill('old_param');
    await page.getByTestId('kv-val-0').fill('old_value');
    
    // Verify it updates URL
    await expect(page.getByTestId('request-url-input')).toHaveValue(/\?old_param=old_value/);

    // Rename Query Parameter
    await page.getByTestId('kv-key-0').fill('renamed_param');
    
    // Verify it updates URL with new name
    await expect(page.getByTestId('request-url-input')).toHaveValue(/\?renamed_param=old_value/);

    // Save Request
    await page.getByTestId('request-save-btn').click();
    // Verify no save prompt (already in a collection)
    await expect(page.getByTestId('save-req-submit-btn')).not.toBeVisible();
    
    // Test successfully completes the full CRUD renaming matrix!
  });
});
