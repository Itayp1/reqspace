export {};
const BASE_URL = 'http://127.0.0.1:3005';

describe('SEC-10: Rate limiting', () => {
  it('should rate limit POST requests after 300 attempts', async () => {
    // Generate a unique dummy workspace payload so we don't conflict
    const payload = JSON.stringify({ name: 'RateLimit Test', description: 'test' });
    
    let hit429 = false;
    for (let i = 0; i < 350; i++) {
      const res = await fetch(`${BASE_URL}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
      // Note: we might get 401 Unauthorized here because we aren't logged in,
      // but the limiter runs BEFORE auth, so we should STILL hit 429 eventually.
      if (res.status === 429) {
        hit429 = true;
        break;
      }
    }
    
    expect(hit429).toBe(true);
  }, 20000);
});
