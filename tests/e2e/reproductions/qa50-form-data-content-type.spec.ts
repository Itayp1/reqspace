import { test, expect } from '../fixtures';
import { mockServer, scene } from './scene';

const formBody = (rows: unknown[]) => ({
  method: 'POST',
  headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
  body: { mode: 'form-data', formData: rows },
});

// QA-50: a manual Content-Type header overrode the form-data mode, and empty form-data sent a boundary-only body.
test('QA-50: form-data is sent as multipart even with a manual Content-Type header', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page, formBody([{ key: 'a', value: '1', enabled: true, type: 'text' }]));
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  expect(seen.at(-1)!.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
});

test('QA-50: form-data with no rows sends no body', async ({ page }) => {
  const seen = await mockServer(page);
  await scene(page, formBody([]));
  await page.getByTestId('request-send-btn').click();
  await expect(page.getByTestId('response-status')).toContainText('200');
  expect(seen.at(-1)!.body).toBeNull();
});
