import { test, expect } from '@playwright/test';
import { v4 as uuidv4 } from 'uuid';

test.describe('Performance Tests', () => {
  const perfLimit = parseInt(process.env.PERF_TIMEOUT || '100', 10);

  test(`API endpoints should respond in under ${perfLimit}ms`, async ({ request }) => {
    // 1. Create a user to get auth token (using API bypass to measure raw speed)
    const email = `perf${uuidv4()}@example.com`;
    const pass = 'password123';
    
    const regStart = Date.now();
    const regRes = await request.post('/api/auth/register', {
      data: { name: 'Perf User', email, password: pass }
    });
    const regTime = Date.now() - regStart;
    
    // Registration involves bcrypt hashing, which is intentionally slow (cost factor).
    // We log it, but don't strictly assert <100ms because bcrypt *should* take longer.
    console.log(`Registration took ${regTime}ms`);

    const loginRes = await request.post('/api/auth/login', {
      data: { email, password: pass }
    });
    const { token } = await loginRes.json();

    // 2. Measure a fast data fetch (e.g. Workspaces)
    const wsStart = Date.now();
    const wsRes = await request.get('/api/workspaces', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const wsTime = Date.now() - wsStart;
    console.log(`Fetch Workspaces took ${wsTime}ms`);
    
    // Assert that the raw database/API read is under the performance limit!
    expect(wsTime).toBeLessThan(perfLimit);
  });
});
