import { test, expect } from '@playwright/test';

test.describe('Advanced Features E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    const uniqueEmail = `advtest${Date.now()}@example.com`;
    await page.fill('input[type="text"]', 'Adv User');
    await page.fill('input[type="email"]', uniqueEmail);
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await expect(page.locator('text=Collections').first()).toBeVisible();
  });

  test('Features: Inline Rename, Duplicate, Delete Confirm, Code Gen, Runner, Console', async ({ page }) => {
    // 1. Create a Collection
    await page.click('button[title="New Collection"]');
    await page.fill('input[placeholder="Enter collection name:"]', 'Core API');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Core API').first()).toBeVisible();

    const collGroup = page.locator('.group', { hasText: 'Core API' }).first();

    // 2. Add Request to Collection
    await collGroup.hover();
    await collGroup.locator('.lucide-more-vertical').first().click();
    await page.locator('text=New Request').click();
    await page.fill('input[placeholder="Request name:"]', 'Get Posts');
    await page.click('button:has-text("Save")');

    // Expand collection
    await collGroup.locator('.lucide-chevron-right').click();
    await expect(page.locator('text=Get Posts').first()).toBeVisible();

    // 3. Test Multi-Tab: click request to open in tab
    await page.locator('text=Get Posts').first().click();
    await expect(page.locator('button[title="Generate Code"]')).toBeVisible();

    // 4. Test Code Generation Modal
    await page.click('button[title="Generate Code"]');
    await expect(page.locator('h2:has-text("Generate Code")')).toBeVisible();
    await expect(page.locator('button:has-text("cURL")')).toBeVisible();
    await expect(page.locator('text=JavaScript (fetch)')).toBeVisible();
    await page.click('button:has-text("JavaScript (fetch)")');
    await expect(page.locator('button:has-text("Copy Code")')).toBeVisible();
    // Close Code Gen modal
    await page.locator('div.fixed.inset-0').locator('button:has(.lucide-x)').click();
    await expect(page.locator('h2:has-text("Generate Code")')).not.toBeVisible();

    // 5. Test Duplicate Request
    const reqGroup = page.locator('.group', { hasText: 'Get Posts' }).first();
    await reqGroup.hover();
    await reqGroup.locator('.lucide-more-vertical').first().click();
    await page.locator('text=Duplicate').click();
    await expect(page.locator('text=Get Posts (Copy)').first()).toBeVisible();

    // 6. Test Delete with Custom Confirmation Modal (No browser alert)
    const copyReqGroup = page.locator('.group', { hasText: 'Get Posts (Copy)' }).first();
    await copyReqGroup.hover();
    await copyReqGroup.locator('.lucide-more-vertical').first().click();
    await page.locator('.z-\\[60\\]').locator('text=Delete').click();

    // Verify Custom Confirm Modal appeared
    await expect(page.locator('h2:has-text("Delete Request")')).toBeVisible();
    await expect(page.locator('text=This cannot be undone.')).toBeVisible();
    // Click Delete in the modal
    await page.locator('div.fixed.inset-0').locator('button:has-text("Delete")').click();
    await expect(page.locator('h2:has-text("Delete Request")')).not.toBeVisible();
    await expect(page.locator('span:has-text("Get Posts (Copy)")')).not.toBeVisible();

    // 7. Test Collection Runner Modal
    await collGroup.hover();
    await collGroup.locator('.lucide-more-vertical').first().click();
    await page.locator('text=Run Collection').click();
    await expect(page.locator('h2:has-text("Run Collection: Core API")')).toBeVisible();
    await expect(page.locator('button:has-text("Run")')).toBeVisible();
    // Close runner
    await page.locator('div.fixed.inset-0').locator('button:has-text("Close")').click();
    await expect(page.locator('h2:has-text("Run Collection: Core API")')).not.toBeVisible();

    // 8. Test Console Drawer toggle from status bar
    await page.click('button:has-text("Console")');
    await expect(page.locator('span:has-text("Console (")')).toBeVisible();
    // Close console drawer
    await page.locator('button[title="Close Console"]').click();
    await expect(page.locator('span:has-text("Console (")')).not.toBeVisible();
  });

  test('Features: Dark/Light Mode, Cookie Manager, OpenAPI Import', async ({ page }) => {
    // 1. Test Theme Toggle
    const themeBtn = page.locator('button[title*="Mode"]');
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();
    await expect(page.locator('button[title*="Mode"]')).toBeVisible();
    await themeBtn.click();

    // 2. Test Cookie Manager Modal
    const cookieBtn = page.locator('button[title="Manage Cookies"]').first();
    await expect(cookieBtn).toBeVisible();
    await cookieBtn.click();
    await expect(page.locator('h2:has-text("Manage Cookies")')).toBeVisible();

    // Add Domain
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.fill('input[placeholder="e.g. example.com"]', 'api.testdomain.com');
    await page.locator('form button[type="submit"]').click();
    await expect(page.locator('span:has-text("api.testdomain.com")').first()).toBeVisible();

    // Add Cookie
    await page.locator('button:has-text("Add Cookie")').click();
    await expect(page.locator('input[value="new_cookie"]').first()).toBeVisible();

    // Close Cookie Manager
    await page.locator('div.fixed.inset-0').locator('button:has-text("Close")').click();
    await expect(page.locator('h2:has-text("Manage Cookies")')).not.toBeVisible();

    // 3. Test OpenAPI / Swagger Import
    await page.click('button[title="Import"]');
    await expect(page.locator('h2:has-text("Import")')).toBeVisible();
    await page.click('button:has-text("OpenAPI / Swagger")');

    const openApiYaml = `openapi: "3.0.0"
info:
  title: "Petstore API"
  version: "1.0.0"
paths:
  /pets:
    get:
      summary: "List Pets"
      tags:
        - Pets`;

    await page.locator('textarea').fill(openApiYaml);
    await page.locator('div.fixed.inset-0 button:has-text("Import")').click();

    // Modal closes and collection appears
    await expect(page.locator('h2:has-text("Import")')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Petstore API').first()).toBeVisible({ timeout: 10000 });
  });
});
