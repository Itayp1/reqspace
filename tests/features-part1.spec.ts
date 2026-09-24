import { serverOrigin } from './helpers/baseUrl';
import { test, expect } from '@playwright/test';

test.describe('Features Part 1: Environments, History, Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and register (unique account per test — beforeEach runs once per test)
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
    await page.goto(`${serverOrigin()}/`);
    try {
      await expect(page.locator('text=Login to Reqspace')).toBeVisible({ timeout: 3000 });
      await page.locator('text=Register').click();
      await page.fill('input[type="text"]', `Test User ${suffix}`);
      await page.fill('input[placeholder="admin or test@example.com"]', `test${suffix}@test.com`);
      await page.fill('input[type="password"]', 'password123');
      await page.click('button[type="submit"]');
    } catch {
      // Already logged in
    }
    await expect(page.getByRole('button', { name: 'Collections' })).toBeVisible({ timeout: 5000 });
  });

  test('Environment Duplication', async ({ page }) => {
    // Open the Envs tab in the sidebar
    await page.getByRole('button', { name: /^envs$/i }).click();

    // Creating an environment goes through a native prompt() dialog, and the
    // new environment auto-opens as a tab — so scope to the sidebar (first
    // match in DOM order), not the tab bar, which would also match by text.
    page.once('dialog', dialog => dialog.accept('My Env'));
    await page.getByTitle('New Environment').click();
    const envRow = page.locator('div', { hasText: /^My Env$/ }).first();
    await expect(envRow).toBeVisible();

    // Right-click to open the context menu, then Duplicate
    await envRow.click({ button: 'right' });
    await page.getByText('Duplicate', { exact: true }).click();

    // Server names duplicates "<name> (copy)"
    await expect(page.locator('text=My Env (copy)').first()).toBeVisible();
  });

  test('History Search', async ({ page }) => {
    // A fresh account has no request tab open yet
    await page.getByRole('button', { name: 'Create a Request' }).click();

    // Send a request to populate history
    await page.fill('input[placeholder="Enter request URL"]', 'https://httpbin.org/get');
    await page.click('button:has-text("Send")');
    await expect(page.locator('text=200 OK')).toBeVisible({ timeout: 10000 });

    // Open History tab
    await page.locator('button:has-text("History")').click();
    
    // Search history
    await page.fill('input[placeholder="Search history..."]', 'httpbin');
    
    // Check if result is there
    await expect(page.locator('text=https://httpbin.org/get').first()).toBeVisible();

    // Search something else
    await page.fill('input[placeholder="Search history..."]', 'notfound.xyz');
    await expect(page.locator('text=No history found.')).toBeVisible();
  });

  test('Request Settings', async ({ page }) => {
    // Open the General Settings modal (gear icon in the top bar)
    await page.getByTitle('General Settings').click();

    // Check if toggles exist
    await expect(page.locator('text=Follow Redirects')).toBeVisible();
    await expect(page.locator('text=Verify SSL Certificates')).toBeVisible();

    // Toggle one of them
    await page.locator('label').filter({ hasText: 'Verify SSL' }).click();
  });
});
