import { test, expect } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

test.describe('Client Local Proxy Settings', () => {
  const userEmail = `proxy${uuidv4()}@example.com`;
  const userPassword = 'password123';

  test.beforeEach(async ({ page }) => {
    // 1. Register and login
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Proxy User');
    await page.getByTestId('register-email').fill(userEmail);
    await page.getByTestId('register-password').fill(userPassword);
    await page.getByTestId('register-submit').click();

    await expect(page.getByTestId('sidebar-workspaces')).toBeVisible({ timeout: 15000 });

    // 2. Create a Workspace
    const wsName = `Proxy WS ${uuidv4()}`;
    await page.getByTestId('create-workspace-btn').click();
    await page.getByTestId('workspace-name-input').fill(wsName);
    await page.getByTestId('workspace-submit-btn').click();
    
    // Switch to it
    await page.getByTestId('workspace-select').selectOption({ label: wsName });

    // 3. Create a Request
    await page.getByTestId('create-request-btn').click();
  });

  test('Proxy configuration without auth', async ({ page }) => {
    // 1. Configure proxy in settings
    await page.getByTestId('settings-btn').click();
    await page.getByTestId('proxy-enable-checkbox').check();
    await page.getByTestId('proxy-url-input').fill('http://myproxy.local:8888');
    
    // Close settings (click outside or press ESC - settings modal just uses click outside or 'X')
    // We can just press Escape
    await page.keyboard.press('Escape');
    
    // 2. Mock backend proxy route to verify payload
    let capturedProxyPayload: any = null;
    await page.route('**/api/proxy', async (route) => {
      capturedProxyPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 200, data: 'proxy success' })
      });
    });

    // 3. Send request
    await page.getByTestId('request-url-input').fill('https://example.com/api');
    await page.getByTestId('request-send-btn').click();

    // 4. Assert response
    await expect(page.getByTestId('response-status')).toHaveText('200');

    // 5. Verify that the correct proxy settings were sent to the backend
    expect(capturedProxyPayload).not.toBeNull();
    expect(capturedProxyPayload.localProxy).toBeDefined();
    expect(capturedProxyPayload.localProxy.url).toBe('http://myproxy.local:8888');
    expect(capturedProxyPayload.localProxy.authEnabled).toBe(false);
  });

  test('Proxy configuration with auth', async ({ page }) => {
    // 1. Configure proxy with auth in settings
    await page.getByTestId('settings-btn').click();
    await page.getByTestId('proxy-enable-checkbox').check();
    await page.getByTestId('proxy-url-input').fill('http://mysecureproxy.local:9999');
    
    await page.getByTestId('proxy-auth-checkbox').check();
    await page.getByTestId('proxy-username-input').fill('proxyuser');
    await page.getByTestId('proxy-password-input').fill('proxypass');
    
    await page.keyboard.press('Escape');
    
    // 2. Mock backend proxy route to verify payload
    let capturedProxyPayload: any = null;
    await page.route('**/api/proxy', async (route) => {
      capturedProxyPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 200, data: 'secure proxy success' })
      });
    });

    // 3. Send request
    await page.getByTestId('request-url-input').fill('https://example.com/api/secure');
    await page.getByTestId('request-send-btn').click();

    // 4. Assert response
    await expect(page.getByTestId('response-status')).toHaveText('200');

    // 5. Verify that the correct proxy settings were sent to the backend
    expect(capturedProxyPayload).not.toBeNull();
    expect(capturedProxyPayload.localProxy).toBeDefined();
    expect(capturedProxyPayload.localProxy.url).toBe('http://mysecureproxy.local:9999');
    expect(capturedProxyPayload.localProxy.authEnabled).toBe(true);
    expect(capturedProxyPayload.localProxy.username).toBe('proxyuser');
    expect(capturedProxyPayload.localProxy.password).toBe('proxypass');
  });
});
