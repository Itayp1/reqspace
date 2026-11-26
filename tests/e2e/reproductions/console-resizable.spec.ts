import { test, expect } from '../fixtures';
import { registerUser } from '../helpers';

/** The Console drawer had a fixed height; its top edge is now a drag handle (and arrow keys). */
test('the Console height can be changed by dragging its top edge and with the keyboard', async ({ page }) => {
  await registerUser(page, 'consolesz');
  await page.getByTestId('console-toggle-btn').click();
  const drawer = page.getByTestId('console-drawer');
  const handle = page.getByTestId('console-resize-handle');
  const before = (await drawer.boundingBox())!.height;

  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y - 100, { steps: 5 });
  await page.mouse.up();
  const dragged = (await drawer.boundingBox())!.height;
  expect(dragged).toBeGreaterThan(before + 80);

  await handle.focus();
  await page.keyboard.press('ArrowDown');
  expect((await drawer.boundingBox())!.height).toBeLessThan(dragged);
});
