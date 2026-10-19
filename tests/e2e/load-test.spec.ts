import { test, expect } from './fixtures';

/**
 * The Load Tester had no coverage. It isn't a perf benchmark — what matters
 * is that it fires exactly the requested number of requests, tallies
 * successes against failures, and that Stop really stops.
 */
test.describe('Load Tester', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Load User');
    await page.getByTestId('register-email').fill(`load_${ts}@example.com`);
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').click();
    await expect(page).toHaveURL(/.*\/$/);
    await page.getByTestId('create-request-btn').click();
  });

  test('runs exactly the configured number of iterations', async ({ page }) => {
    let hits = 0;
    await page.route('https://load.example.com/**', (route) => {
      hits++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.getByTestId('request-url-input').fill('https://load.example.com/ping');
    await page.getByTestId('load-test-open-btn').click();
    const modal = page.getByTestId('load-test-modal');
    await expect(modal).toBeVisible();

    await expect(page.getByTestId('load-test-iterations')).toHaveValue('10');
    await expect(page.getByTestId('load-test-concurrency')).toHaveValue('1');
    await page.getByTestId('load-test-iterations').fill('5');
    await page.getByTestId('load-test-start-btn').click();

    await expect(page.getByTestId('load-test-success')).toHaveText('5', { timeout: 20000 });
    await expect(page.getByTestId('load-test-failed')).toHaveText('0');
    // The run is over, so the button is back to Start, not Stop.
    await expect(page.getByTestId('load-test-start-btn')).toBeVisible();
    expect(hits).toBe(5);
  });

  test('failures are counted separately from successes', async ({ page }) => {
    // Every other call is rejected outright, so the tally has to split.
    let n = 0;
    await page.route('https://flaky.example.com/**', (route) => {
      n++;
      return n % 2 === 0 ? route.abort('failed')
        : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.getByTestId('request-url-input').fill('https://flaky.example.com/ping');
    await page.getByTestId('load-test-open-btn').click();
    await page.getByTestId('load-test-iterations').fill('4');
    await page.getByTestId('load-test-start-btn').click();

    await expect(page.getByTestId('load-test-success')).toHaveText('2', { timeout: 20000 });
    await expect(page.getByTestId('load-test-failed')).toHaveText('2');
  });

  test('concurrency runs the workers in parallel, still totalling the iterations', async ({ page }) => {
    let inFlight = 0;
    let maxInFlight = 0;
    await page.route('https://parallel.example.com/**', async (route) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 150));
      inFlight--;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.getByTestId('request-url-input').fill('https://parallel.example.com/ping');
    await page.getByTestId('load-test-open-btn').click();
    await page.getByTestId('load-test-iterations').fill('6');
    await page.getByTestId('load-test-concurrency').fill('3');
    await page.getByTestId('load-test-start-btn').click();

    await expect(page.getByTestId('load-test-success')).toHaveText('6', { timeout: 30000 });
    expect(maxInFlight).toBeGreaterThan(1);
  });

  test('Stop halts a run in progress', async ({ page }) => {
    let hits = 0;
    await page.route('https://stoppable.example.com/**', async (route) => {
      hits++;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.getByTestId('request-url-input').fill('https://stoppable.example.com/ping');
    await page.getByTestId('load-test-open-btn').click();
    await page.getByTestId('load-test-iterations').fill('50');
    await page.getByTestId('load-test-start-btn').click();

    // Stop appears only while running.
    const stop = page.getByTestId('load-test-stop-btn');
    await expect(stop).toBeVisible();
    await expect(page.getByTestId('load-test-success')).not.toHaveText('0');
    await stop.click();
    await expect(page.getByTestId('load-test-start-btn')).toBeVisible();

    // Nothing new goes out after the stop — 50 iterations at 200ms each would
    // take ten seconds, so a quiet second here means it really halted.
    const afterStop = hits;
    await page.waitForTimeout(1000);
    expect(hits).toBeLessThanOrEqual(afterStop + 1);
    expect(hits).toBeLessThan(50);
  });
});
