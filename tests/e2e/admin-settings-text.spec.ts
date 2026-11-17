import { test, expect } from './fixtures';
import fs from 'fs';
import path from 'path';

// Finding 8: the Admin → Settings text for "Allow requests to internal/private network addresses"
// claimed the guard blocks every user's "Send". Send runs from the browser/desktop app, so the
// server-side SSRF guard only covers requests the server makes itself (URL imports).
test('Admin settings SSRF text does not claim to govern "Send"', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../client/src/pages/AdminPage.tsx'), 'utf8');
  // The private-network toggle is no longer rendered in the Admin UI (the server proxy relay was removed),
  // so the page must simply not make the old claim; if the toggle returns, its text must carry the caveats.
  expect(src).not.toContain(`every user's "Send"`);
  const start = src.indexOf('Allow requests to internal/private network addresses');
  if (start === -1) return;
  const text = src.slice(start, start + 1200).replace(/\s+/g, ' ');
  expect(text).toContain("on a user's behalf");
  expect(text).toContain('It does not affect "Send"');
});
