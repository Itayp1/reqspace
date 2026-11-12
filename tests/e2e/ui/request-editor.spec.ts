import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

// UX pass on the request editor screens (QA-08, QA-50, QA-57, script snippets, a11y names).
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

test('unresolved variable is not error-red: dashed underline plus tooltip', async ({ page }) => {
  await page.getByTestId('request-url-input').fill('{{nope}}/x');
  const span = page.locator('span', { hasText: '{{nope}}' }).first();
  await expect(span).toHaveClass(/decoration-dashed/);
  await expect(span).not.toHaveClass(/text-red-500/);
  await expect(page.getByTestId('request-url-input')).toHaveAttribute('title', /Undefined variable: nope/);
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
