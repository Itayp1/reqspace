import { test, expect } from './fixtures';
import { parseCurl } from '../../server/src/utils/curlParser';

// Regression tests for the cURL import bugs found by hand (BUGS-MANUAL-PASS.md BUG-05..BUG-08).
// parseCurl is a pure function, so these need no browser or server.
test.describe('cURL import parser', () => {
  test('BUG-05: --data-raw, --json and -F imply POST', () => {
    expect(parseCurl(`curl --data-raw 'x=1' https://api.test/raw`).method).toBe('POST');
    expect(parseCurl(`curl --json '{"a":1}' https://api.test/j`).method).toBe('POST');
    expect(parseCurl(`curl -F 'name=x' https://api.test/f`).method).toBe('POST');
  });

  test('BUG-06: --request DELETE is honoured (long form of -X)', () => {
    expect(parseCurl('curl --request DELETE https://api.test/del').method).toBe('DELETE');
    expect(parseCurl('curl -XPUT https://api.test/p').method).toBe('PUT');
  });

  test('BUG-07: -u user:pass becomes basic auth', () => {
    const r = parseCurl('curl -u user:pass https://api.test/basic');
    expect(r.auth).toEqual({ type: 'basic', basic: { username: 'user', password: 'pass' } });
  });

  test('BUG-08: a URL without a scheme is kept (normalised to http://)', () => {
    expect(parseCurl('curl api.test/noscheme').url).toBe('http://api.test/noscheme');
  });
});
