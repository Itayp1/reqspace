import { test, expect } from './fixtures';
import { loginUi } from './helpers';
import { PERF, readPerfState, wsName, colName, folderName } from './perf-seed';

/**
 * Speed of everyday actions while the bulk data from global-setup is in the database (see perf-seed.ts):
 * dragging a request into another folder, duplicating a request, saving a request, switching between open tabs
 * and duplicating a tab (right-click → Duplicate Tab, then choosing where to save the copy). Each is timed in the page from
 * the user's gesture until the result is on screen (and, for save, until the dirty marker is gone).
 * Search is timed in search-latency.spec.ts.
 */
const BUDGET_MS = Number(process.env.REQSPACE_ACTION_BUDGET_MS || 200);

/**
 * Arms an in-page stopwatch: it starts when `event` first fires on an element matching `startSel`
 * (capture phase, i.e. the user's gesture) and stops when `doneBody` (a function body returning boolean)
 * first holds in the DOM. Measuring in the page leaves out Playwright's own round trips.
 */
async function armStopwatch(page: import('@playwright/test').Page, event: string, startSel: string, doneBody: string) {
  await page.evaluate(({ event, startSel, doneBody }) => {
    const done = new Function(doneBody) as () => boolean;
    (window as any).__lat = new Promise<number>(resolve => {
      let t0: number | null = null;
      const check = () => { if (t0 !== null && done()) { obs.disconnect(); resolve(performance.now() - t0); } };
      const obs = new MutationObserver(check);
      obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      document.addEventListener(event, e => {
        if (t0 === null && (e.target as Element).closest?.(startSel)) { t0 = performance.now(); check(); }
      }, true);
      setTimeout(() => resolve(-1), 10_000);
    });
  }, { event, startSel, doneBody });
}
const stopwatch = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__lat as Promise<number>);

test.describe.configure({ mode: 'serial' });

test.describe('Action latency under load', () => {
  // The bulk seed writes the SQLite file directly (perf-seed.ts), so there is nothing to seed on other backends.
  test.skip((process.env.DB_TYPE || 'sqlite') !== 'sqlite', 'bulk perf seed is SQLite-only');

  const w = Math.floor(PERF.workspaces / 2), c = Math.floor(PERF.collections / 2);
  const src = folderName(w, c, 0), dst = folderName(w, c, 1);
  const req = (f: number, r: number) => `PerfReq-${String(w).padStart(4, '0')}-${String(c).padStart(4, '0')}-${f}-${r}`;
  // A folder's header row is its node-container; its children render in the wrapper around that row.
  const container = (page: import('@playwright/test').Page, name: string) =>
    page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${name}`) }).last();
  const folderWithChildren = (page: import('@playwright/test').Page, name: string) => container(page, name).locator('xpath=..');

  test.beforeEach(async ({ page }) => {
    await loginUi(page, readPerfState().email, PERF.password);
    await page.getByTestId('workspace-select').selectOption({ label: wsName(w) });
    await page.getByTestId(`node-${colName(w, c)}`).click();
    await page.getByTestId(`node-${src}`).click();
    await page.getByTestId(`node-${dst}`).click();
    await expect(page.getByTestId(`node-${req(0, 0)}`)).toBeVisible();
    await expect(page.getByTestId(`node-${req(1, 0)}`)).toBeVisible();
  });

  test('dragging a request into another folder shows it there within budget', async ({ page }) => {
    const moved = req(0, 0);
    const wrap = (n: string) => `[...document.querySelectorAll('[data-testid="node-container"]')].filter(e => e.querySelector('[data-testid="node-${n}"]')).pop()?.parentElement`;
    await armStopwatch(page, 'drop', `[data-testid="node-container"]`,
      `return !!(${wrap(dst)})?.querySelector('[data-testid="node-${moved}"]') && !(${wrap(src)})?.querySelector('[data-testid="node-${moved}"]');`);
    await page.getByTestId(`node-${moved}`).dragTo(page.getByTestId(`node-${dst}`));
    const elapsed = await stopwatch(page);
    expect(elapsed, 'the request never showed up in the target folder').toBeGreaterThan(0);
    await expect(folderWithChildren(page, dst).getByTestId(`node-${moved}`)).toBeVisible();
    console.log(`[action-latency] drag ${elapsed}ms`);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  test('duplicating a request shows the copy within budget', async ({ page }) => {
    const name = req(2, 0);
    const node = container(page, name);
    await page.getByTestId(`node-${src}`).click().catch(() => {});
    await page.getByTestId(`node-${folderName(w, c, 2)}`).click();
    await expect(page.getByTestId(`node-${name}`)).toBeVisible();
    await node.hover();
    await node.getByTestId('action-menu-btn').click();
    await armStopwatch(page, 'click', '[data-testid="action-menu-duplicate"]',
      `return !!document.querySelector('[data-testid="node-${name} (Copy)"]');`);
    await page.getByTestId('action-menu-duplicate').click();
    const elapsed = await stopwatch(page);
    expect(elapsed, 'the copy never appeared').toBeGreaterThan(0);
    console.log(`[action-latency] duplicate ${elapsed}ms`);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  test('saving a request clears the unsaved marker within budget', async ({ page }) => {
    await page.getByTestId(`node-${req(1, 1)}`).click();
    await page.getByTestId('request-url-input').fill(`https://saved.example.com/${Date.now()}`);
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();
    await armStopwatch(page, 'click', '[data-testid="request-save-btn"]',
      `return !document.querySelector('[data-testid="dirty-indicator"]');`);
    await page.getByTestId('request-save-btn').click();
    const elapsed = await stopwatch(page);
    expect(elapsed, 'the unsaved marker never cleared').toBeGreaterThan(0);
    console.log(`[action-latency] save ${elapsed}ms`);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
  test('switching between open tabs is within budget', async ({ page }) => {
    const urls = new Map<string, string>();
    const names: string[] = [];
    for (const [f, r] of [[0, 1], [0, 2], [0, 3], [1, 4], [1, 2], [1, 3], [2, 1], [2, 2]] as const) {
      const name = req(f, r);
      names.push(name);
      urls.set(name, `https://perf.example.com/${w}/${c}/${f}/${r}`);
      await page.getByTestId(`node-${folderName(w, c, f)}`).click().catch(() => {});
      if (!(await page.getByTestId(`node-${name}`).isVisible())) await page.getByTestId(`node-${folderName(w, c, f)}`).click();
      await page.getByTestId(`node-${name}`).click();
      await expect(page.getByTestId('request-url-input')).toHaveValue(urls.get(name)!);
    }
    const tab = (name: string) => page.locator('[data-testid^="tab-"]', { hasText: name }).first();
    await expect(page.locator('[data-testid^="tab-"]').filter({ hasText: 'PerfReq-' })).toHaveCount(names.length);

    const times: number[] = [];
    // Every tab visited twice, in a jumbled order, each switch timed from the click to the editor showing that request.
    for (const name of [...names, ...[...names].reverse()]) {
      await armStopwatch(page, 'click', '[data-testid^="tab-"]',
        `return document.querySelector('[data-testid="request-url-input"]')?.value === ${JSON.stringify(urls.get(name))};`);
      await tab(name).click();
      const elapsed = await stopwatch(page);
      expect(elapsed, `switching to ${name} never showed its request`).toBeGreaterThanOrEqual(0);
      times.push(elapsed);
    }
    const worst = Math.max(...times);
    console.log(`[action-latency] tab switch worst ${worst.toFixed(1)}ms, median ${times.sort((a, b) => a - b)[times.length >> 1].toFixed(1)}ms over ${times.length} switches`);
    expect(worst).toBeLessThan(BUDGET_MS);
  });

  test('Duplicate Tab opens an unsaved copy whose Save asks where to put it', async ({ page }) => {
    const name = req(3, 0);
    const url = `https://perf.example.com/${w}/${c}/3/0`;
    await page.getByTestId(`node-${folderName(w, c, 3)}`).click();
    await page.getByTestId(`node-${name}`).click();
    await expect(page.getByTestId('request-url-input')).toHaveValue(url);
    const tabs = page.locator('[data-testid^="tab-"]').filter({ hasText: 'PerfReq-' });
    const before = await tabs.count();

    await tabs.filter({ hasText: name }).first().click({ button: 'right' });
    await armStopwatch(page, 'click', '[data-testid="tab-menu-duplicate"]',
      `return [...document.querySelectorAll('[data-testid^="tab-"]')].some(e => e.textContent.includes(${JSON.stringify(`${name} (Copy)`)}));`);
    await page.getByTestId('tab-menu-duplicate').click();
    const elapsed = await stopwatch(page);
    console.log(`[action-latency] duplicate tab ${elapsed.toFixed(1)}ms`);
    expect(elapsed, 'the duplicated tab never appeared').toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(BUDGET_MS);

    // The copy is a separate, unsaved tab next to the original, carrying the same request.
    await expect(tabs).toHaveCount(before + 1);
    await expect(tabs.filter({ hasText: name })).toHaveCount(2);
    await expect(page.getByTestId('request-url-input')).toHaveValue(url);
    await expect(page.getByTestId('dirty-indicator')).toBeVisible();

    // Saving it asks for a location instead of overwriting the original.
    await armStopwatch(page, 'click', '[data-testid="request-save-btn"]',
      `return !!document.querySelector('[data-testid="save-req-submit-btn"]');`);
    await page.getByTestId('request-save-btn').click();
    const dialogMs = await stopwatch(page);
    console.log(`[action-latency] save-location dialog ${dialogMs.toFixed(1)}ms`);
    expect(dialogMs, 'the save dialog never opened').toBeGreaterThan(0);
    expect(dialogMs).toBeLessThan(BUDGET_MS);
    const dialog = page.locator('form', { has: page.getByTestId('save-req-submit-btn') });
    await expect(page.getByTestId('save-req-name-input')).toHaveValue(`${name} (Copy)`);
    await dialog.getByText(colName(w, c + 1), { exact: true }).click();
    await page.getByTestId('save-req-submit-btn').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('dirty-indicator')).toBeHidden();

    // It landed in the collection that was picked, and the original is untouched.
    if (!(await page.getByTestId(`node-${name} (Copy)`).isVisible())) await page.getByTestId(`node-${colName(w, c + 1)}`).click();
    await expect(page.getByTestId(`node-${name} (Copy)`)).toBeVisible();
    await expect(page.getByTestId(`node-${name}`)).toBeVisible();
  });
});
