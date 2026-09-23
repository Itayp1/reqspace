import { test, expect } from '@playwright/test';

test.describe('Request Scripts (Pre & Post) Execution Lifecycle', () => {
  test('Should execute Pre-request and Test scripts correctly', async ({ request, page }) => {
    // 1. Create a dummy user and workspace via API for testing
    const suffix = Math.floor(Math.random() * 100000);
    const userRes = await request.post('http://localhost:3005/api/auth/register', {
      data: { name: `Script User ${suffix}`, email: `script${suffix}@test.com`, password: 'password123' }
    });
    const headers = {
      cookie: userRes.headers()['set-cookie']?.split(';')[0] || ''
    };

    // 2. Create Workspace
    const wsRes = await request.post('http://localhost:3005/api/workspaces', {
      data: { name: 'Scripts Workspace' },
      headers
    });
    const ws = await wsRes.json();

    // 3. Create Collection with Collection-level script
    const colRes = await request.post(`http://localhost:3005/api/workspaces/${ws._id}/collections`, {
      data: { 
        name: 'Scripts Collection',
        preRequestScript: 'pm.environment.set("colLevelVar", "hello-from-col");',
        testScript: 'pm.test("Col level test", () => { pm.expect(1).to.equal(1); });'
      },
      headers
    });
    const col = await colRes.json();

    // 4. Create Request with Pre-script and Post-script
    const reqRes = await request.post(`http://localhost:3005/api/collections/${col._id}/requests`, {
      data: { 
        name: 'My Scripted Request',
        method: 'GET',
        url: 'https://jsonplaceholder.typicode.com/posts/1?testVar={{myDynamicVar}}',
        preRequestScript: 'pm.environment.set("myDynamicVar", "hello-from-prescript");',
        testScript: 'pm.test("Status is 200", function () { pm.response.to.have.status(200); }); pm.test("Dynamic var was sent", function() { var url = pm.request.url.toString(); pm.expect(url).to.include("hello-from-prescript"); });'
      },
      headers
    });
    const apiReq = await reqRes.json();

    expect(apiReq.preRequestScript).toContain('myDynamicVar');
    expect(apiReq.testScript).toContain('Status is 200');

    // 5. Navigate to the app and login
    await page.goto('http://localhost:3005');
    try {
      await expect(page.locator('text=Login to Reqspace')).toBeVisible({ timeout: 2000 });
      await page.fill('input[placeholder="admin or test@example.com"]', `script${suffix}@test.com`);
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
    } catch (e) {
      // Already logged in or no login screen
    }

    // 6. Select the workspace from the dropdown
    await page.locator('select').first().selectOption({ label: 'Scripts Workspace' });

    // 7. Open the request in the UI
    await page.locator(`text=${col.name}`).first().click();
    await page.locator(`text=My Scripted Request`).first().click();

    // 8. Click Send
    await page.click('button:has-text("Send")');

    // 9. Wait for response and verify scripts executed
    await expect(page.locator('text=Status:').locator('..')).toContainText('200', { timeout: 15000 });
    
    // Check if the UI displays the Test Results tab
    const testResultsTab = page.locator('button:has-text("Test Results")');
    await testResultsTab.click();
    
    // Check if the tests passed (Request level)
    await expect(page.locator('text=Status is 200')).toBeVisible();
    await expect(page.locator('text=Dynamic var was sent')).toBeVisible();

    // Check if the tests passed (Collection level)
    await expect(page.locator('text=Col level test')).toBeVisible();
  });
});
