import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';
import { mockServer, scene } from '../scene';

// UX pass on the request editor screens (QA-08, QA-50, QA-57, script snippets, a11y names).
test.describe('request editor UX', () => {
  test.beforeEach(async ({ page }) => {
    await registerUser(page, 'requx');
    await page.getByTestId('new-tab-btn').click();
  });

  test('request sections are exposed as tabs and snippets as buttons', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Params' })).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('req-tab-pre-request-script').click();
    await expect(page.getByRole('button', { name: 'Get Environment Variable' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set request header (pre-request)' })).toBeVisible();
  });


  test('manual Content-Type with a form body type shows an ignored-header warning', async ({ page }) => {
    await page.getByTestId('req-tab-headers').click();
    await page.getByTestId('kv-key-0').fill('Content-Type');
    await page.getByTestId('req-tab-body').click();
    await expect(page.getByTestId('body-content-type-warning')).toHaveCount(0);
    await page.getByTestId('body-mode-urlencoded').click();
    await expect(page.getByTestId('body-content-type-warning')).toBeVisible();
  });

  test('URL bar icon buttons have names and the connection button is spelled out', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Generate code' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save options' })).toBeVisible();
    await expect(page.getByTestId('new-connection-btn')).toHaveText('Connection');
  });

  test('code generation languages wrap instead of scrolling sideways', async ({ page }) => {
    await page.getByTestId('codegen-btn').click();
    await expect(page.getByTestId('codegen-lang-csharp')).toBeInViewport();
  });
});

test('request editor keeps a usable height with the console open', async ({ page }) => {
  await registerUser(page, 'layout');
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('console-toggle-btn').click();
  await expect(page.getByTestId('console-drawer')).toBeVisible();
  await expect(page.getByTestId('kv-key-0')).toBeInViewport();
  await expect(page.getByTestId('new-connection-btn')).toContainText('Conn');
});

test('empty raw body editor shows a placeholder that disappears once you type', async ({ page }) => {
  await registerUser(page, 'editor_ph');
  await page.getByTestId('new-tab-btn').click();
  await page.getByTestId('req-tab-body').click();
  await page.getByTestId('body-mode-raw').click();
  const ph = page.getByTestId('editor-placeholder');
  await expect(ph).toBeVisible();
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.type('{}');
  await expect(ph).toBeHidden();
});


// QA-15: Ctrl+Enter in the URL bar sent the request twice (window shortcut + the input's Enter handler).
test('QA-15: Ctrl+Enter in the URL bar sends exactly once', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page);
  await page.getByTestId('request-url-input').click();
  await page.keyboard.press('Control+Enter');
  await expect(page.getByTestId('response-status')).toContainText('200');
  await page.waitForTimeout(500);
  expect(seen.length).toBe(1);
});
