import { test, expect } from './fixtures';
import { loginUi } from './helpers';
import { PERF, readPerfState, wsName, colName, folderName } from './perf-seed';

/**
 * With the bulk data loaded by global-setup (PERF.workspaces × 200 collections × 5 folders × 5 requests),
 * typing a folder's name into global search (Ctrl+K) must show it within 200ms.
 * Global search covers the collections the sidebar has expanded, so the target collection is expanded first.
 */
const BUDGET_MS = 200;

test.describe('Global search latency under load', () => {
  // The bulk seed writes the SQLite file directly (perf-seed.ts), so there is nothing to seed on other backends.
  test.skip((process.env.DB_TYPE || 'sqlite') !== 'sqlite', 'bulk perf seed is SQLite-only');

  test('a folder is found within 200ms of the last keystroke, in a workspace among 5', async ({ page }) => {
    test.setTimeout(120_000);
    const { email } = readPerfState();
    const w = Math.floor(PERF.workspaces / 2), c = Math.floor(PERF.collections / 2), f = 3;

    await loginUi(page, email, PERF.password);
    const options = await page.getByTestId('workspace-select').locator('option').count();
    expect(options).toBeGreaterThanOrEqual(PERF.workspaces);
    await page.getByTestId('workspace-select').selectOption({ label: wsName(w) });

    await page.getByTestId(`node-${colName(w, c)}`).click();
    await expect(page.getByTestId(`node-${folderName(w, c, f)}`)).toBeVisible();

    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Global search' });
    await expect(dialog).toBeVisible();
    const input = dialog.getByRole('combobox');
    await expect(input).toBeFocused();

    // Timed in the page: from the last keystroke until the folder shows up as a result, so the figure
    // is the app's own latency without Playwright round-trips.
    const target = folderName(w, c, f);
    const elapsed = await page.evaluate(async (name) => {
      const el = document.querySelector('[role="dialog"] input[role="combobox"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      const found = () => Array.from(document.querySelectorAll('[role="dialog"] [role="option"]')).some(o => o.textContent?.includes(name));
      const type = async (text: string) => {
        setter.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 0));
      };
      // Everything but the last character is typed (and settles) before the clock starts, as with a person typing.
      for (let i = 1; i < name.length; i++) await type(name.slice(0, i));
      await new Promise(r => setTimeout(r, 500));
      const t0 = performance.now();
      await type(name);
      while (!found()) {
        if (performance.now() - t0 > 5000) return -1;
        await new Promise(r => requestAnimationFrame(r));
      }
      return performance.now() - t0;
    }, target);

    console.log(`[search-latency] "${target}" found in ${elapsed.toFixed(1)}ms`);
    expect(elapsed, 'folder never appeared in the results').toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
