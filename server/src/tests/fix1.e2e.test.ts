export {};
const BASE_URL = 'http://localhost:3005';

describe('FIX-1: Admin workspace export/import', () => {
  let cookie = '';
  let workspaceId = '';

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
    });
    cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
    
    const wsRes = await fetch(`${BASE_URL}/api/workspaces`, { headers: { cookie } });
    const wss = await wsRes.json() as any;
    workspaceId = wss[0].id || wss[0]._id;
  });

  it('exports workspace, imports to fresh workspace, and rejects dangling parentFolderId', async () => {
    // 1. Create a fresh workspace for import
    const newWsRes = await fetch(`${BASE_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Import Target', description: 'desc' })
    });
    expect(newWsRes.status).toBe(201);
    const newWs = await newWsRes.json() as any;
    const targetWorkspaceId = newWs.id || newWs._id || newWs.workspace?.id;

    // 2. Export original workspace (it has a collection from SEC-9 test)
    const exportRes = await fetch(`${BASE_URL}/api/admin/export/${workspaceId}`, { headers: { cookie } });
    expect(exportRes.status).toBe(200);
    const dump = await exportRes.json() as any;

    // Add a dangling folder
    const brokenDump = JSON.parse(JSON.stringify(dump));
    brokenDump.folders = brokenDump.folders || [];
    brokenDump.folders.push({
      id: 'dummy',
      name: 'broken',
      collectionId: dump.collections[0].id,
      parentFolderId: 'dangling-123'
    });

    // 3. Import broken dump should fail with transaction rollback
    const importRes = await fetch(`${BASE_URL}/api/admin/import/${targetWorkspaceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(brokenDump)
    });
    expect(importRes.status).toBe(400);

    // 4. Verify target workspace is empty (transaction rolled back)
    const verifyExport = await fetch(`${BASE_URL}/api/admin/export/${targetWorkspaceId}`, { headers: { cookie } });
    const verifyDump = await verifyExport.json() as any;
    expect(verifyDump.folders?.length || 0).toBe(0);

    // 5. Import valid dump
    const importValidRes = await fetch(`${BASE_URL}/api/admin/import/${targetWorkspaceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(dump)
    });
    const resText = await importValidRes.text();
    console.log('VALID IMPORT RES:', resText);
    expect(importValidRes.status).toBe(200);

    // 6. Verify target workspace has identical contents
    const finalExport = await fetch(`${BASE_URL}/api/admin/export/${targetWorkspaceId}`, { headers: { cookie } });
    const finalDump = await finalExport.json() as any;
    
    expect(finalDump.collections.length).toBe(dump.collections.length);
    expect(finalDump.folders.length).toBe(dump.folders.length);
    expect(finalDump.requests.length).toBe(dump.requests.length);
    expect(finalDump.environments.length).toBe(dump.environments.length);
  });
});
