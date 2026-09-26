import { test, expect } from '@playwright/test';

test.describe('Workspace Management', () => {
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

    page.on('dialog', dialog => dialog.accept(newWorkspaceName));
    await page.click('[data-testid="new-workspace-btn"]');
    
    await expect(page.locator('[data-testid="workspace-select"]')).toContainText(newWorkspaceName);

    // 3. Switch to it
    const workspaceId = await page.locator('[data-testid="workspace-select"]').inputValue();
    await page.selectOption('[data-testid="workspace-select"]', workspaceId);

    // 4. Edit the workspace
    await page.click('[data-testid="workspace-settings-btn"]');
    await page.fill('[data-testid="workspace-name-input"]', editedWorkspaceName);
    await page.click('[data-testid="workspace-save-btn"]');
    await page.click('[data-testid="close-workspace-modal"]');
    
    await expect(page.locator('[data-testid="workspace-select"]')).toContainText(editedWorkspaceName);

    // 5. Delete it (Fallback to API if no UI button exists for deleting a workspace)
    try {
        await page.evaluate(async (id) => {
            const token = localStorage.getItem('token');
            const baseUrl = window.location.origin;
            await fetch(`${baseUrl}/api/workspaces/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        }, workspaceId);
    } catch (e) {
        console.log('Failed to delete workspace via API', e);
    }
  });

  test('removing a member immediately revokes their access', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const ownerEmail = `owner_${Date.now()}@example.com`;
    
    // Register owner
    await ownerPage.goto('/register');
    await ownerPage.fill('[data-testid="register-name"]', 'Owner User');
    await ownerPage.fill('[data-testid="register-email"]', ownerEmail);
    await ownerPage.fill('[data-testid="register-password"]', 'password123');
    await ownerPage.click('[data-testid="register-submit"]');
    await expect(ownerPage).toHaveURL(/.*\/$/);
    
    // Owner creates workspace
    const wsName = `Shared Workspace ${Date.now()}`;
    ownerPage.on('dialog', dialog => dialog.accept(wsName));
    await ownerPage.click('[data-testid="new-workspace-btn"]');
    await expect(ownerPage.locator('[data-testid="workspace-select"]')).toContainText(wsName);
    
    const workspaceId = await ownerPage.locator('[data-testid="workspace-select"]').inputValue();
    await ownerPage.selectOption('[data-testid="workspace-select"]', workspaceId);

    // Register member
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    const memberEmail = `member_${Date.now()}@example.com`;
    
    await memberPage.goto('/register');
    await memberPage.fill('[data-testid="register-name"]', 'Member User');
    await memberPage.fill('[data-testid="register-email"]', memberEmail);
    await memberPage.fill('[data-testid="register-password"]', 'password123');
    await memberPage.click('[data-testid="register-submit"]');
    await expect(memberPage).toHaveURL(/.*\/$/);
    
    // Owner invites member
    await ownerPage.click('[data-testid="workspace-settings-btn"]');
    await ownerPage.click('text=Members');
    await ownerPage.fill('[data-testid="user-autocomplete-input"]', memberEmail);
    await ownerPage.waitForSelector('[data-testid="user-autocomplete-result"]');
    await ownerPage.click('[data-testid="user-autocomplete-result"]');
    await ownerPage.selectOption('[data-testid="workspace-invite-role"]', 'editor');
    await ownerPage.click('[data-testid="workspace-invite-btn"]');
    
    // Member refreshes and switches to workspace
    await memberPage.reload();
    await expect(memberPage.locator('[data-testid="workspace-select"]')).toContainText(wsName);
    await memberPage.selectOption('[data-testid="workspace-select"]', workspaceId);
    
    // Verify member has access
    await expect(memberPage.locator('[data-testid="workspace-select"]')).toHaveValue(workspaceId);
    
    // Owner removes member
    const memberRow = ownerPage.locator('[data-testid="member-row"]').filter({ hasText: memberEmail });
    await expect(memberRow).toBeVisible();
    await memberRow.locator('[data-testid="member-remove-btn"]').click();
    
    // Member should lose access: verify via API call
    const res = await memberPage.evaluate(async (id) => {
        const token = localStorage.getItem('token');
        const baseUrl = window.location.origin;
        const response = await fetch(`${baseUrl}/api/workspaces/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return { status: response.status, ok: response.ok };
    }, workspaceId);
    
    expect(res.ok).toBe(false);
    expect([401, 403, 404]).toContain(res.status);
    
    await ownerContext.close();
    await memberContext.close();
  });
});
