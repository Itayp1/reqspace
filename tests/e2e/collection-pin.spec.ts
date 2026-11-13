import { test, expect } from './fixtures';
import { registerUser, createCollectionUi, openNodeMenu, treeNode } from './helpers';

test.describe('Pinned collections', () => {
  test('a pinned collection stays on top across sort modes and reloads, and unpinning restores the order', async ({ page }) => {
    await registerUser(page, 'colpin');
    for (const n of ['Bravo', 'Alpha', 'Charlie']) await createCollectionUi(page, n);
    const names = () => page.locator('[data-testid="node-Bravo"], [data-testid="node-Alpha"], [data-testid="node-Charlie"]').allTextContents();
    expect(await names()).toEqual(['Bravo', 'Alpha', 'Charlie']);

    const pin = page.getByTestId('pin-Charlie');
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    const saved = page.waitForResponse(r => r.url().includes('/auth/settings') && r.request().method() === 'PUT');
    await treeNode(page, 'Charlie').hover();
    await pin.click();
    expect((await saved).ok()).toBeTruthy();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(names).toEqual(['Charlie', 'Bravo', 'Alpha']);

    await page.getByTestId('collection-sort-select').selectOption('name');
    await expect.poll(names).toEqual(['Charlie', 'Alpha', 'Bravo']);

    // Kept on the server, not just in this browser.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(treeNode(page, 'Alpha')).toBeVisible();
    await expect.poll(names).toEqual(['Charlie', 'Alpha', 'Bravo']);

    // Unpin from the context menu.
    await openNodeMenu(page, 'Charlie');
    await page.getByTestId('action-menu-unpin').click();
    await expect.poll(names).toEqual(['Alpha', 'Bravo', 'Charlie']);
    await expect(page.getByTestId('pin-Charlie')).toHaveAttribute('aria-pressed', 'false');
  });
});
