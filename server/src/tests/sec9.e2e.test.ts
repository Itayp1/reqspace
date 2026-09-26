// Using native Node fetch
export {};
const BASE_URL = 'http://127.0.0.1:3005';

describe('E2E SEC-9', () => {
  let cookie = '';
  let workspaceId = '';
  let collectionId = '';

  beforeAll(async () => {
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.status === 200) { healthy = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!healthy) throw new Error('Server not healthy');

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin', password: 'admin' })
    }, 35000);
    cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
    
    const wsRes = await fetch(`${BASE_URL}/api/workspaces`, { headers: { cookie } });
    const wss = await wsRes.json() as any;
    workspaceId = wss[0].id || wss[0]._id;

    const colRes = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'SEC9 Collection' })
    });
    const col = await colRes.json() as any;
    collectionId = col.id || col._id;
  });

  it('rejects unknown fields like foreign workspaceId', async () => {
    const res = await fetch(`${BASE_URL}/api/collections/${collectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'x', workspaceId: '<other>' })
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.message).toBe('Invalid request body');
    expect(data.issues[0].code).toBe('unrecognized_keys');
  });
});
