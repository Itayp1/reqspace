import { expect, type Page, type Locator, type APIRequestContext, request as playwrightRequest } from '@playwright/test';
import { API_URL } from './fixtures';

/** Registers a fresh account through the UI and lands on the app with its personal workspace. */
export async function registerUser(page: Page, prefix: string, name = 'Test User'): Promise<string> {
  const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/register');
  await page.getByTestId('register-name').fill(name);
  await page.getByTestId('register-email').fill(email);
  await page.getByTestId('register-password').fill('password123');
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/.*\/$/);
  await expect(page.getByTestId('workspace-select')).toBeVisible();
  return email;
}

export async function loginUi(page: Page, email: string, password = 'password123') {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('workspace-select')).toBeVisible();
}

export async function loginAdminUi(page: Page) {
  await loginUi(page, 'admin', 'admin123456');
}

/** The row for a tree node (collection, folder or request) by its visible name. */
export function treeNode(page: Page, name: string) {
  return page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${name}`) }).first();
}

export async function openNodeMenu(page: Page, name: string) {
  const node = treeNode(page, name);
  await node.hover();
  await node.getByTestId('action-menu-btn').click();
}

export async function createCollectionUi(page: Page, name: string) {
  const empty = page.getByTestId('new-collection-empty-btn');
  if (await empty.isVisible().catch(() => false)) await empty.click();
  else await page.getByTestId('new-collection-btn').click();
  await page.getByTestId('prompt-input').fill(name);
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId(`node-${name}`)).toBeVisible();
}

/** Opens the inline "new request" row of a collection/folder through its "Add Request" row (expanding it if needed). */
export async function startNewRequest(page: Page, parent: string | Locator) {
  const node = typeof parent === 'string' ? treeNode(page, parent) : parent;
  // The parent's own row is the last one in its subtree (nested folders render theirs above it).
  const row = node.locator('xpath=..').getByTestId('add-request-row').last();
  if (await row.count() === 0) await node.click();
  await row.click();
}

export async function addViaMenu(page: Page, parent: string, kind: 'new-request' | 'new-folder', name: string) {
  if (kind === 'new-request') await startNewRequest(page, parent);
  else {
    await openNodeMenu(page, parent);
    await page.getByTestId(`action-menu-${kind}`).click();
  }
  await page.getByTestId('prompt-input').fill(name);
  await page.getByTestId('prompt-input').press('Enter');
  await expect(page.getByTestId(`node-${name}`)).toBeVisible();
}

/** A toast of the given type containing `text` (several toasts can be on screen at once). */
export async function expectToast(page: Page, type: 'success' | 'error' | 'info', text: string | RegExp) {
  await expect(page.getByTestId(`toast-${type}`).filter({ hasText: text }).first()).toBeVisible();
}

/** An API context logged in as the given account (its own rate-limit bucket). */
export async function apiAs(email: string, password = 'password123'): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { 'X-Forwarded-For': `10.250.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}` },
  });
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  expect(res.ok(), `login ${email}`).toBeTruthy();
  return ctx;
}

export async function apiAsAdmin(): Promise<APIRequestContext> {
  return apiAs('admin', 'admin123456');
}
