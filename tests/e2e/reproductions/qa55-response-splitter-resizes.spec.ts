import { test, expect } from '../fixtures';
import { scene } from './scene';

// QA-55 / QA-78: dragging the request/response splitter resizes the panes and selects no text.
test('QA-55: dragging the splitter up makes the response pane taller', async ({ page }) => {
  await scene(page);
  const pane = page.getByTestId('response-pane');
  const before = (await pane.boundingBox())!.height;
  const box = (await page.getByTestId('response-splitter').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 40, { steps: 5 });
  await page.mouse.up();
  expect((await pane.boundingBox())!.height).toBeGreaterThan(before + 30);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
});