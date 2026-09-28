import { test, expect } from '@playwright/test';

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
    await page.getByTestId('prompt-submit').click();
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

  test('Each runner iteration substitutes its data-file row into the request', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'runner_json_' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');
    await page.waitForSelector('[data-testid="workspace-select"]');

    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) { await newBtn.click(); }
    else { await page.getByTestId('new-collection-btn').click(); }
    await page.getByTestId('prompt-input').fill('Test Collection Runner JSON');
    await page.getByTestId('prompt-submit').click();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection Runner JSON') });
    await expect(colNode).toBeVisible();

    // Create the request (custom in-app modal, not a native dialog), then
    // open it to set its URL — the "New Request" prompt only asks for a name.
    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Echo Request');
    await page.getByTestId('prompt-submit').click();
    await page.getByTestId('node-Echo Request').click();
    await page.getByTestId('request-url-input').fill('http://runner-test.local/echo?val={{var}}');
    await page.getByTestId('request-save-btn').click();

    const interceptedVals: string[] = [];
    await page.route('http://runner-test.local/echo*', async route => {
      const url = new URL(route.request().url());
      interceptedVals.push(url.searchParams.get('val') || '');
      await route.fulfill({ status: 200, body: 'ok' });
    });

    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-run-collection').click();
    await expect(page.getByTestId('collection-runner-modal')).toBeVisible();

    const iterInput = page.locator('input[type="number"]').nth(1);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'data.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([{ "var": "apple" }, { "var": "banana" }, { "var": "cherry" }]))
    });

    await expect(iterInput).toHaveValue('3');
    await page.getByTestId('collection-runner-run-btn').click();

    await expect.poll(() => interceptedVals.length).toBe(3);
    expect(interceptedVals).toEqual(['apple', 'banana', 'cherry']);
  });

  test('CSV data file drives iterations identically to JSON', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'runner_csv_' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');
    await page.waitForSelector('[data-testid="workspace-select"]');

    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) { await newBtn.click(); }
    else { await page.getByTestId('new-collection-btn').click(); }
    await page.getByTestId('prompt-input').fill('Test Collection Runner CSV');
    await page.getByTestId('prompt-submit').click();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection Runner CSV') });
    await expect(colNode).toBeVisible();

    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Echo Request');
    await page.getByTestId('prompt-submit').click();
    await page.getByTestId('node-Echo Request').click();
    await page.getByTestId('request-url-input').fill('http://runner-test.local/echo?val={{var}}');
    await page.getByTestId('request-save-btn').click();

    const interceptedVals: string[] = [];
    await page.route('http://runner-test.local/echo*', async route => {
      const url = new URL(route.request().url());
      interceptedVals.push(url.searchParams.get('val') || '');
      await route.fulfill({ status: 200, body: 'ok' });
    });

    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-run-collection').click();
    await expect(page.getByTestId('collection-runner-modal')).toBeVisible();

    const iterInput = page.locator('input[type="number"]').nth(1);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('var\ndog\ncat\nbird')
    });

    await expect(iterInput).toHaveValue('3');
    await page.getByTestId('collection-runner-run-btn').click();

    await expect.poll(() => interceptedVals.length).toBe(3);
    expect(interceptedVals).toEqual(['dog', 'cat', 'bird']);
  });

  test('Stop mid-run actually halts remaining iterations', async ({ page }) => {
    const ts = Date.now();
    await page.goto('/register');
    await page.fill('[data-testid="register-name"]', 'Test User');
    await page.fill('[data-testid="register-email"]', 'runner_stop_' + ts + '@example.com');
    await page.fill('[data-testid="register-password"]', 'password123');
    await page.click('[data-testid="register-submit"]');
    await page.waitForSelector('[data-testid="workspace-select"]');

    const newBtn = page.getByTestId('new-collection-empty-btn');
    if (await newBtn.isVisible().catch(() => false)) { await newBtn.click(); }
    else { await page.getByTestId('new-collection-btn').click(); }
    await page.getByTestId('prompt-input').fill('Test Collection Runner Stop');
    await page.getByTestId('prompt-submit').click();
    const colNode = page.locator('[data-testid="node-container"]', { has: page.getByTestId('node-Test Collection Runner Stop') });
    await expect(colNode).toBeVisible();

    await colNode.hover();
    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-new-request').click();
    await page.getByTestId('prompt-input').fill('Slow Request');
    await page.getByTestId('prompt-submit').click();
    await page.getByTestId('node-Slow Request').click();
    await page.getByTestId('request-url-input').fill('http://runner-test.local/slow');
    await page.getByTestId('request-save-btn').click();

    let callCount = 0;
    await page.route('http://runner-test.local/slow', async route => {
      callCount++;
      await new Promise(r => setTimeout(r, 1000));
      await route.fulfill({ status: 200, body: 'ok' });
    });

    await colNode.getByTestId('action-menu-btn').click();
    await page.getByTestId('action-menu-run-collection').click();
    await expect(page.getByTestId('collection-runner-modal')).toBeVisible();

    const iterInput = page.locator('input[type="number"]').nth(1);
    await iterInput.fill('5');
    await page.getByTestId('collection-runner-run-btn').click();

    const stopBtn = page.getByTestId('collection-runner-stop-btn');
    await expect(stopBtn).toBeVisible();
    await stopBtn.click();

    await page.waitForTimeout(2000);
    expect(callCount).toBeLessThan(5);
  });
});
