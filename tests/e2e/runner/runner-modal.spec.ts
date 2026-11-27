import { test, expect } from '../fixtures';
import { startNewRequest, registerUser, createCollectionUi, openNodeMenu } from '../helpers';

test.describe('Collection Runner', () => {
  test('should open CollectionRunnerModal, configure and run', async ({ page }) => {
    // Register unique user
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'runner' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');

    await page.waitForSelector('[data-testid="workspace-select"]');

    // Create a new collection
    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
    } else {
      await page.getByTestId('new-collection-btn').click();
    }
    await page.getByTestId('prompt-input').fill('Test Collection Runner');
    await page.getByTestId('prompt-input').press('Enter');
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection Runner') });
    await expect(colNode).toBeVisible();

    // Open action menu for collection
    await colNode.hover();
    const actionMenuBtn = colNode.getByTestId('action-menu-btn');
    await actionMenuBtn.click();

    // Click "Run Collection"
    await page.getByTestId('action-menu-run-collection').click();

    // Verify modal is open
    const modal = page.getByTestId('collection-runner-modal');
    await expect(modal).toBeVisible();

    // Click Run (force click even if disabled due to no requests)
    const runBtn = page.getByTestId('collection-runner-run-btn');
    await runBtn.click({ force: true });
  });
});

/** QA-35: the runner's Data File picker used the browser-localised native input ("בחירת קובץ"). It must show an English label. */
test('Run Collection data-file picker shows an English "Choose file" label', async ({ page }) => {
  await registerUser(page, 'qa35');
  await createCollectionUi(page, 'RunCol');
  await openNodeMenu(page, 'RunCol');
  await page.getByTestId('action-menu-run-collection').click();
  const modal = page.getByTestId('collection-runner-modal');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Choose file', { exact: true })).toBeVisible();
  await expect(page.getByTestId('collection-runner-data-file')).toHaveClass(/sr-only/); // visually hidden native input
});

// QA-36: Passed/Failed counts for responses without tests are unexplained.
test('QA-36: runner Passed/Failed boxes explain how a request is counted', async ({ page }) => {
  await page.goto('/register');
  await page.getByTestId('register-name').fill('Runner User');
  await page.getByTestId('register-email').fill(`qa36_${Date.now()}@example.com`);
  await page.getByTestId('register-password').fill('password123');
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/.*\/$/);

  await page.getByTestId('new-collection-empty-btn').click();
  await page.getByTestId('prompt-input').fill('Run Col');
  await page.getByTestId('prompt-submit').click();

  const node = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Run Col') });
  await node.hover();
  await startNewRequest(page, node);
  await page.getByTestId('prompt-input').fill('R1');
  await page.getByTestId('prompt-submit').click();

  await node.hover();
  await node.getByTestId('action-menu-btn').click();
  await page.getByTestId('action-menu-run-collection').click();
  await page.getByTestId('collection-runner-run-btn').click();

  await expect(page.getByTestId('runner-passed')).toHaveAttribute('title', /no tests.*2xx or 3xx/i);
  await expect(page.getByTestId('runner-failed')).toHaveAttribute('title', /no tests.*400 or more/i);
});
