export {};
const BASE_URL = 'http://127.0.0.1:3005';

describe('FEAT-10: Server-side collection export/import', () => {
  let cookie = '';
  let workspaceId = '';
  let collectionId = '';
  let requestId = '';

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

    // Create a collection
    const colRes = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'FEAT-10 Collection', variables: [{ key: 'var1', value: 'val1' }] })
    });
    const col = await colRes.json() as any;
    collectionId = col._id || col.id;

    // Create a request with bearer token
    const reqRes = await fetch(`${BASE_URL}/api/collections/${collectionId}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        name: 'FEAT-10 Request',
        method: 'GET',
        url: 'https://example.com',
        auth: { type: 'bearer', bearer: { token: 'secret-token-123' } },
        headers: [],
        body: { mode: 'none' },
        params: []
      })
    });
    const req = await reqRes.json() as any;
    console.log('CREATE REQ:', req);
    requestId = req._id || req.id;
  });

  it('exports collection without secrets by default', async () => {
    const res = await fetch(`${BASE_URL}/api/collections/${collectionId}/export`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    
    expect(data.info.name).toBe('FEAT-10 Collection');
    expect(data.variable.length).toBe(1);
    expect(data.variable[0].key).toBe('var1');
    
    const req = data.item[0];
    console.log(JSON.stringify(data, null, 2));
    expect(req.name).toBe('FEAT-10 Request');
    expect(req.request.auth.type).toBe('bearer');
    const token = req.request.auth.bearer.find((x: any) => x.key === 'token');
    expect(token.value).toBe('STRIPPED');
  });

  it('exports collection with secrets when includeSecrets=true', async () => {
    const res = await fetch(`${BASE_URL}/api/collections/${collectionId}/export?includeSecrets=true`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    
    const req = data.item[0];
    const token = req.request.auth.bearer.find((x: any) => x.key === 'token');
    expect(token.value).toBe('secret-token-123');
  });

  it('imports collection and preserves the tree', async () => {
    // 1. Export the collection
    const exportRes = await fetch(`${BASE_URL}/api/collections/${collectionId}/export?includeSecrets=true`, { headers: { cookie } });
    const data = await exportRes.json();

    // 2. Create new workspace
    const newWsRes = await fetch(`${BASE_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Import Target FEAT-10', description: 'desc' })
    });
    const newWs = await newWsRes.json() as any;
    const targetWorkspaceId = newWs.id || newWs._id || newWs.workspace?.id;

    // 3. Import collection
    const importRes = await fetch(`${BASE_URL}/api/collections/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ workspaceId: targetWorkspaceId, collection: data })
    });
    expect(importRes.status).toBe(200);
    const importData = await importRes.json() as any;
    const newCollectionId = importData.collectionId;
    expect(newCollectionId).toBeDefined();

    // 4. Export the new collection and verify
    const verifyExport = await fetch(`${BASE_URL}/api/collections/${newCollectionId}/export?includeSecrets=true`, { headers: { cookie } });
    const verifyData = await verifyExport.json() as any;

    expect(verifyData.info.name).toBe('FEAT-10 Collection');
    expect(verifyData.variable.length).toBe(1);
    expect(verifyData.item.length).toBe(1);
    
    const req = verifyData.item[0];
    expect(req.name).toBe('FEAT-10 Request');
    expect(req.request.auth.type).toBe('bearer');
    const token = req.request.auth.bearer.find((x: any) => x.key === 'token');
    expect(token.value).toBe('secret-token-123');
  });
});
