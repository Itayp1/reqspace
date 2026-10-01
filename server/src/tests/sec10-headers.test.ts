import request from 'supertest';
import { app } from '../index';

// SEC-10: baseline CSP + HSTS. Verifies the headers directly rather than the
// exact directive strings, so this doesn't churn every time the policy is
// tightened — the point is that a real policy exists at all.
describe('SEC-10: CSP and HSTS headers', () => {
  it('sends a Content-Security-Policy that is not just default-src', async () => {
    const res = await request(app).get('/api/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('script-src');
    expect(csp).toContain('object-src');
  });

  it('sets Strict-Transport-Security based on NODE_ENV, captured once at boot', async () => {
    // index.ts reads process.env.NODE_ENV === 'production' once when the
    // module first loads (helmet's hsts option), so this asserts against
    // whatever this jest process actually booted as — it can't flip it
    // per-test the way a live server restarted per-deployment would.
    const isProd = process.env.NODE_ENV === 'production';
    const res = await request(app).get('/api/health');
    if (isProd) {
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    } else {
      expect(res.headers['strict-transport-security']).toBeUndefined();
    }
  });
});
