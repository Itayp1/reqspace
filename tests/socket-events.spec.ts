import { test, expect } from '@playwright/test';
test.describe('Socket events coverage', () => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    const timestamp = Date.now();
    const emailA = `userA_${timestamp}@example.com`;
    const emailB = `userB_${timestamp}@example.com`;
    const pass = 'password123';

    // 1. Register User A in Context A
    await pageA.goto('/register');
    await pageA.getByTestId('register-name').fill('User A');
    await pageA.getByTestId('register-email').fill(emailA);
    await pageA.getByTestId('register-password').fill(pass);
    await pageA.getByTestId('register-submit').click();
    await expect(pageA).toHaveURL(/.*\/$/);
    
    // 2. Register User B in Context B
    await pageB.goto('/register');
    await pageB.getByTestId('register-name').fill('User B');
    await pageB.getByTestId('register-email').fill(emailB);
    await pageB.getByTestId('register-password').fill(pass);
    await pageB.getByTestId('register-submit').click();
    await expect(pageB).toHaveURL(/.*\/$/);

    // 3. User A creates Workspace
    const wsName = `WS_${timestamp}`;
    pageA.once('dialog', async dialog => await dialog.accept(wsName));
    await pageA.getByTestId('new-workspace-btn').click();
    await expect(pageA.getByTestId('workspace-select')).toContainText(wsName);

    const wsRes = await pageA.request.get('/api/workspaces');
    const workspaces = await wsRes.json();
    const ws = workspaces.find((w: any) => w.name === wsName);
    const wsId = ws._id;

    // 4. User A invites User B via UI
    await pageA.getByTestId('workspace-settings-btn').click();
    await pageA.getByTestId('workspace-members-tab').click();
    await pageA.getByTestId('user-autocomplete-input').fill(emailB);
    await pageA.getByTestId('user-autocomplete-result').first().click();
    await pageA.getByTestId('workspace-invite-btn').click();
    await expect(pageA.getByTestId('member-email').filter({ hasText: emailB })).toBeVisible();
    await pageA.getByTestId('close-workspace-modal').click();

    // 5. User B switches to the workspace
    await pageB.reload();
    await expect(pageB.getByTestId('workspace-select')).toContainText(wsName);
    await pageB.getByTestId('workspace-select').selectOption({ label: wsName });

    await pageB.waitForTimeout(1000); // ensure sockets are connected

    // 6. Environments (created, updated, deleted)
    const envRes = await pageA.request.post(`/api/workspaces/${wsId}/environments`, { data: { name: 'E1' } });
    const envObj = await envRes.json();
    await expect(pageB.getByTestId('env-node-E1')).toBeVisible();

    await pageA.request.put(`/api/environments/${envObj._id}`, { data: { name: 'E1-up', variables: [] } });
    await expect(pageB.getByTestId('env-node-E1-up')).toBeVisible();
    await expect(pageB.getByTestId('env-node-E1')).not.toBeVisible();

    await pageA.request.delete(`/api/environments/${envObj._id}`);
    await expect(pageB.getByTestId('env-node-E1-up')).not.toBeVisible();

    // 7. Collections (created, updated, deleted)
    const colRes = await pageA.request.post(`/api/workspaces/${wsId}/collections`, { data: { name: 'C1' } });
    const colObj = await colRes.json();
    await expect(pageB.getByTestId('node-C1')).toBeVisible();

    await pageA.request.put(`/api/collections/${colObj._id}`, { data: { name: 'C1-up' } });
    await expect(pageB.getByTestId('node-C1-up')).toBeVisible();

    // 8. Folders (created, updated, deleted)
    const folRes = await pageA.request.post(`/api/collections/${colObj._id}/folders`, { data: { name: 'F1', collectionId: colObj._id } });
    const folObj = await folRes.json();
    await expect(pageB.getByTestId('node-F1')).toBeVisible();

    await pageA.request.put(`/api/folders/${folObj._id}`, { data: { name: 'F1-up', collectionId: colObj._id } });
    await expect(pageB.getByTestId('node-F1-up')).toBeVisible();

    // 9. Requests (created, updated, deleted)
    const reqRes = await pageA.request.post(`/api/collections/${colObj._id}/requests`, { data: { name: 'R1', method: 'GET', url: 'https://x.com', folderId: folObj._id, collectionId: colObj._id } });
    const reqObj = await reqRes.json();
    await expect(pageB.getByTestId('node-R1')).toBeVisible();

    await pageA.request.put(`/api/requests/${reqObj._id}`, { data: { name: 'R1-up', method: 'POST', url: 'https://y.com', folderId: folObj._id, collectionId: colObj._id } });
    await expect(pageB.getByTestId('node-R1-up')).toBeVisible();

    // 10. Reorder
    const req2Res = await pageA.request.post(`/api/collections/${colObj._id}/requests`, { data: { name: 'R2', method: 'GET', url: 'https://x.com', folderId: folObj._id, collectionId: colObj._id } });
    const req2Obj = await req2Res.json();
    await expect(pageB.getByTestId('node-R2')).toBeVisible();

    await pageA.request.put(`/api/reorder`, { data: { type: 'request', items: [{ id: reqObj._id, order: 2 }, { id: req2Obj._id, order: 1 }] } });
    await pageB.waitForTimeout(500);

    // 11. Delete request
    await pageA.request.delete(`/api/requests/${reqObj._id}`);
    await expect(pageB.getByTestId('node-R1-up')).not.toBeVisible();
    await pageA.request.delete(`/api/requests/${req2Obj._id}`);
    await expect(pageB.getByTestId('node-R2')).not.toBeVisible();

    // 12. Delete folder
    await pageA.request.delete(`/api/folders/${folObj._id}`);
    await expect(pageB.getByTestId('node-F1-up')).not.toBeVisible();

    // 13. Delete collection
    await pageA.request.delete(`/api/collections/${colObj._id}`);
    await expect(pageB.getByTestId('node-C1-up')).not.toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
