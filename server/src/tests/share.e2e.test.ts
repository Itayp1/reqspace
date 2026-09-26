// Using native Node fetch
export {};
const BASE_URL = 'http://127.0.0.1:3005';

describe('E2E Share - SEC-0.6', () => {
  let cookie = '';
  let collectionId = '';
  let workspaceId = '';

  beforeAll(async () => {
    // Wait for health
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.status === 200) {
          healthy = true;
          break;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 1000));
    }
    if (!healthy) throw new Error('Server not healthy');

    // Login as admin
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin', password: 'admin' })
    });
    cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
    
    // Get personal workspace
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie } });
    const me = await meRes.json() as any;
    
    const wsRes = await fetch(`${BASE_URL}/api/workspaces`, { headers: { cookie } });
    const wss = await wsRes.json() as any;
    workspaceId = wss[0].id || wss[0]._id;

    // Create a collection
    const colRes = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Share Test Col' })
    });
    if (colRes.status !== 201) throw new Error(await colRes.text());
    const col = await colRes.json() as any;
    collectionId = col.id || col._id;

    // Create a request with secrets and scripts
    const reqRes = await fetch(`${BASE_URL}/api/collections/${collectionId}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        name: 'Secret Req',
        method: 'GET',
        url: 'https://api.example.com',
        auth: { type: 'bearer', bearer: { token: 'SUPER_SECRET_TOKEN' } },
        headers: [{ key: 'Authorization', value: 'Bearer XYZ', enabled: true }],
        testScript: 'console.log("secret script");',
        preRequestScript: 'console.log("pre script");'
      })
    });
    if (reqRes.status !== 201) throw new Error(await reqRes.text());
  }, 35000);

  it('should strip sensitive fields from public share link', async () => {
    // 1. Create a share link
    const shareRes = await fetch(`${BASE_URL}/api/share/collection/${collectionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ expiresInDays: 7 })
    });
    expect(shareRes.status).toBe(200);
    const shareData = await shareRes.json() as any;
    expect(shareData.shortId).toBeTruthy();

    // 2. Fetch it anonymously
    const getRes = await fetch(`${BASE_URL}/api/share/${shareData.shortId}`);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json() as any;

    expect(getData.requests.length).toBe(1);
    const req = getData.requests[0];
    
    // Auth should be stripped to type only
    expect(req.auth.type).toBe('bearer');
    expect(req.auth.token).toBeUndefined();

    // Scripts should be entirely omitted
    expect(req.testScript).toBeUndefined();
    expect(req.preRequestScript).toBeUndefined();

    // Sensitive headers should be filtered out
    expect(req.headers.length).toBe(0);
  });

  it('should allow creator to revoke link', async () => {
    // 1. Create a share link
    const shareRes = await fetch(`${BASE_URL}/api/share/collection/${collectionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ expiresInDays: 7 })
    });
    const shareData = await shareRes.json() as any;

    // 2. Revoke it
    const delRes = await fetch(`${BASE_URL}/api/share/${shareData.shortId}`, {
      method: 'DELETE',
      headers: { cookie }
    });
    expect(delRes.status).toBe(200);

    // 3. Fetch it should 404
    const getRes = await fetch(`${BASE_URL}/api/share/${shareData.shortId}`);
    expect(getRes.status).toBe(404);
  });
});
