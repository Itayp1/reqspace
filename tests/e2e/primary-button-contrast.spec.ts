import { test, expect } from './fixtures';

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
