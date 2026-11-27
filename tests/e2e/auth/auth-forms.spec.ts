import { test, expect } from '../fixtures';

// Signed-out context: the register and login pages must state the password rule up front
// (QA-65) and the error banner must have a dark-mode variant.
test.describe('signed-out forms', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('register shows the 8-character password rule next to the field', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByTestId('register-password')).toHaveAttribute('aria-describedby', 'register-password-hint');
    await expect(page.locator('#register-password-hint')).toHaveText('At least 8 characters.');
  });

  test('register error banner has a dark variant', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('register-error')).toHaveClass(/dark:bg-red-950/);
  });

  test('login error banner has a dark variant', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveClass(/dark:bg-red-950/);
  });
});

// QA-54/67: empty submits showed the browser's own (Hebrew) validation bubble.
// QA-65: register showed only "Invalid request body" instead of the field issues.
test.describe('validation messages', () => {
  test.use({ allowFpErrors: [/status code 40[0139]/] });

  test('login: an empty submit shows an in-app message, not the browser bubble', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('Enter your username or email and your password.');
  });

  test('register: an empty submit shows an in-app message', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('register-error')).toHaveText('Enter a name, an email and a password.');
  });

  test('register: a too-short password names the rule instead of "Invalid request body"', async ({ page }) => {
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Short Pw');
    await page.getByTestId('register-email').fill(`short_${Date.now()}@example.com`);
    await page.getByTestId('register-password').fill('abc');
    await page.getByTestId('register-submit').click();
    await expect(page.getByTestId('register-error')).toContainText('Password must be at least 8 characters');
  });
});

// QA-75: RegisterPage had no submitting state, so a double click sent /auth/register twice.
test.describe('register double submit', () => {
  test.use({ allowFpErrors: [/status code 400/] });

  test('double-clicking Create Account sends one register request', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/auth/register', async (route) => {
      calls++;
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({ status: 400, json: { message: 'Registration blocked' } });
    });
    await page.goto('/register');
    await page.getByTestId('register-name').fill('Dbl Click');
    await page.getByTestId('register-email').fill('dbl@example.com');
    await page.getByTestId('register-password').fill('password123');
    await page.getByTestId('register-submit').dblclick();
    await expect(page.getByTestId('register-error')).toBeVisible();
    expect(calls).toBe(1);
  });
});

const lum = (rgb: number[]) => {
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('primary submit button has >= 4.5:1 contrast for white text', async ({ page }) => {
  await page.goto('/login');
  const btn = page.getByTestId('login-submit');
  const bg = await btn.evaluate(el => getComputedStyle(el).backgroundColor);
  // Computed colour may be rgb() or oklab()/srgb; draw it on a canvas to normalise.
  const rgb = await page.evaluate((c) => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
  }, bg);
  expect((1.05) / (lum(rgb) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
