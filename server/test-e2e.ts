import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3005';

async function waitHealthy() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.status === 200) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function runTests() {
  const healthy = await waitHealthy();
  if (!healthy) throw new Error('Server not healthy');

  // Test Registration
  const email = `test-${Date.now()}@test.com`;
  const password = 'password123';
  
  console.log('Testing User Registration...');
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email, password })
  });

  if (regRes.status !== 201) {
    throw new Error(`Registration failed: ${await regRes.text()}`);
  }
  const regData = await regRes.json();
  console.log('Registration OK:', regData.user.email);

  // Test Login
  console.log('Testing User Login...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${await loginRes.text()}`);
  }
  const loginData = await loginRes.json();
  console.log('Login OK:', loginData.user.email, 'Token length:', loginData.token.length);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
