import { test, expect, API_URL, expandAdminSections } from '../fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { startNewRequest, expectWorkspaceListed, apiAsAdmin } from '../helpers';

test.describe('Import / Export', () => {
  test('should export workspace data and import it successfully', async ({ page }) => {
    const ts = Date.now();
    // The Admin dashboard link only renders for a superadmin — a freshly
    // registered user can't reach it, so log in as the seeded admin instead.
    await page.goto('/login');
    await page.getByTestId('login-email').fill('admin');
    await page.getByTestId('login-password').fill('admin123456');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/.*\/$/);

    // A dedicated workspace keeps the export scoped to exactly what this
    // test creates — the admin account accumulates workspaces/collections
    // across the whole suite, so collections[0] wouldn't otherwise be safe
    // to assume is this test's own collection.
    await page.getByTestId('new-workspace-btn').click();
    await page.getByTestId('prompt-input').fill(`Import Export WS ${ts}`);
    await page.getByTestId('prompt-submit').click();
    await expectWorkspaceListed(page, `Import Export WS ${ts}`);

    // Create a new collection to export (custom in-app modal, not a native dialog)
    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    await page.getByTestId('prompt-input').fill('Export Collection ' + ts);
    await page.getByTestId('prompt-input').press('Enter');
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-Export Collection ${ts}`) });
    await expect(colNode).toBeVisible();

    // Create a request in it
    await colNode.hover();
    await startNewRequest(page, colNode);
    await page.getByTestId('prompt-input').fill('Export Request');
    await page.getByTestId('prompt-input').press('Enter');

    // Open it and set its URL, then save
    await page.getByTestId('node-Export Request').click();
    await page.getByTestId('request-url-input').fill('https://example.com');
    await page.getByTestId('request-save-btn').click();

    // Navigate to Admin Page
    const adminLink = page.getByTestId('admin-dashboard-link');
    await adminLink.waitFor({ state: 'visible' });
    await adminLink.click();

    // Go to Settings tab in Admin Dashboard
    const settingsTab = page.getByTestId('admin-tab-settings');
    await settingsTab.waitFor({ state: 'visible' });
    await settingsTab.click();
    await expandAdminSections(page);

    // Export Data
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-data-btn').click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    const fs = require('fs');
    const dumpData = JSON.parse(fs.readFileSync(path, 'utf8'));
    expect(dumpData.collections).toBeDefined();
    expect(dumpData.collections.length).toBeGreaterThan(0);
    expect(dumpData.collections[0].name).toBe('Export Collection ' + ts);
    expect(dumpData.requests.length).toBeGreaterThan(0);

    // Modify dump data to import
    dumpData.collections[0].name = 'Imported Collection ' + ts;
    const importPath = path + '_import.json';
    fs.writeFileSync(importPath, JSON.stringify(dumpData));

    // Import Data. The confirmation is a custom in-app modal (ConfirmModal),
    // not a native dialog — it opens only after the file's been read, and
    // the POST only fires once the user confirms it.
    await page.getByTestId('import-data-input').setInputFiles(importPath);
    await expect(page.locator('#confirm-modal-description')).toContainText('This will insert all dumped');

    // The workspace already has data, so the server asks for an explicit
    // choice: add alongside (append) or replace (overwrite).
    const importResponse = page.waitForResponse(resp =>
      resp.url().includes('/api/admin/import/') && resp.url().includes('mode=append') && resp.request().method() === 'POST'
    );
    await page.getByTestId('confirm-btn').click();
    await expect(page.locator('#confirm-modal-description')).toContainText('already has');
    await page.getByTestId('confirm-btn').click();
    const response = await importResponse;
    expect(response.status()).toBe(200);
    
    // Wait for toast
    await expect(page.locator('text=Import successful! Reloading…')).toBeVisible();
    
    // Give it a moment to reload
    await page.waitForTimeout(2000);
    
    // Go back to workspace to verify
    await page.goto('/');
    await page.waitForSelector('[data-testid="workspace-select"]');
    
    // Check if imported collection exists
    await expect(page.locator(`text=Imported Collection ${ts}`)).toBeVisible();
  });
});

test.describe('Admin dump import / export (API)', () => {
  // these tests provoke 4xx/handled failures on purpose; the app records them in fperrors
  test.use({ allowFpErrors: [/server-auth|status code 40[013]|Error parsing data file/] });

  let seq = 0;
  const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
  const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const idOf = (o: any) => (o.id ?? o._id) as string;

  async function anon(): Promise<APIRequestContext> {
    return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
  }
  async function newUser(prefix: string) {
    const email = `${uniq(prefix)}@example.com`;
    const ctx = await anon();
    const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
    expect(res.status(), 'register').toBe(201);
    const wsList = await (await ctx.get('/api/workspaces')).json();
    const ws = wsList.find((w: any) => w.isPersonal) ?? wsList[0];
    return { ctx, email, wsId: idOf(ws) };
  }
  async function mkCollection(ctx: APIRequestContext, wsId: string, name: string) {
    const col = await (await ctx.post(`/api/workspaces/${wsId}/collections`, { data: { name } })).json();
    return { colId: idOf(col) };
  }

  test('[L5.3] importing a workspace dump into a non-empty workspace needs an explicit mode', async () => {
    const admin = await apiAsAdmin();
    const u = await newUser('l53');
    await mkCollection(u.ctx, u.wsId, 'Existing');
    const dump = await (await admin.get(`/api/admin/export/${u.wsId}`)).json();
    const res = await admin.post(`/api/admin/import/${u.wsId}`, { data: dump });
    expect(res.status()).toBe(409);
    const cols = await (await u.ctx.get(`/api/workspaces/${u.wsId}/collections`)).json();
    expect(cols.length).toBe(1);
  });

  test('[L5.5] workspace dump does not contain secret variable values in plaintext by default', async () => {
    const admin = await apiAsAdmin();
    const u = await newUser('l55');
    const env = await u.ctx.post(`/api/workspaces/${u.wsId}/environments`, { data: { name: 'E', variables: [{ key: 'tok', value: 'S3CR3T-VALUE', isSecret: true, enabled: true }] } });
    expect(env.ok(), await env.text()).toBeTruthy();
    const text = await (await admin.get(`/api/admin/export/${u.wsId}`)).text();
    expect(text).not.toContain('S3CR3T-VALUE');
  });
});
