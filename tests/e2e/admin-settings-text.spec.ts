import { test, expect } from './fixtures';
import fs from 'fs';
import path from 'path';

// Finding 8: the Admin → Settings text for "Allow requests to internal/private network addresses"
// claimed the guard blocks every user's "Send". Send runs from the browser/desktop app, so the
// server-side SSRF guard only covers requests the server makes itself (URL imports).
test('Admin settings SSRF text does not claim to govern "Send"', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../client/src/pages/AdminPage.tsx'), 'utf8');
  const start = src.indexOf('Allow requests to internal/private network addresses');
  expect(start).toBeGreaterThan(-1);
  const text = src.slice(start, start + 1200).replace(/\s+/g, ' ');
  expect(text).not.toContain(`every user's "Send"`);
  expect(text).toContain('on a user\'s behalf');
  expect(text).toContain('It does not affect "Send"');
});
