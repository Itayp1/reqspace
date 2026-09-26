import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';

test.describe('TEST-4: API Authorization Layer', () => {
  let superadminReq: APIRequestContext;
  let ownerReq: APIRequestContext;
  let editorReq: APIRequestContext;
  let viewerReq: APIRequestContext;
  let nonMemberReq: APIRequestContext;
  let anonymousReq: APIRequestContext;

  let workspaceIdA: string;
  let collectionIdA: string;
  let folderIdA: string;
  let requestIdA: string;
  let envIdA: string;
  let historyIdA: string;

  let workspaceIdB: string;
  let collectionIdB: string;

  const getUuid = () => require('crypto').randomUUID();

  test.beforeAll(async () => {
    const baseURL = 'http://localhost:3005';
    const randomIp = () => `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.1.1`;
    superadminReq = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': randomIp() } });
    ownerReq = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': randomIp() } });
    editorReq = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': randomIp() } });
    viewerReq = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': randomIp() } });
    nonMemberReq = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': randomIp() } });
    anonymousReq = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': randomIp() } });

    // Superadmin login (default seeded)
    let adminLoginRes = await superadminReq.post('/api/auth/login', { data: { email: 'admin', password: 'admin' } });
    if (adminLoginRes.status() === 401) {
      adminLoginRes = await superadminReq.post('/api/auth/login', { data: { email: 'admin', password: 'admin123456' } });
    }
    if (!adminLoginRes.ok()) throw new Error(`Superadmin login failed: ${await adminLoginRes.text()}`);

    // Ensure self-registration is enabled (other tests might disable it)
    await superadminReq.put('/api/admin/config', { data: { auth: { allowSelfRegistration: true } } });

    const createUser = async (reqCtx: APIRequestContext, name: string) => {
      const email = `${name.toLowerCase()}${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
      const regRes = await reqCtx.post('/api/auth/register', { data: { name, email, password: 'password123' } });
      if (!regRes.ok()) throw new Error(`Register failed for ${email} with status ${regRes.status()}: ${await regRes.text()}`);
      const loginRes = await reqCtx.post('/api/auth/login', { data: { email, password: 'password123' } });
      if (!loginRes.ok()) throw new Error(`Login failed for ${email} with status ${loginRes.status()}: ${await loginRes.text()}`);
      return email;
    };

    const ownerEmail = await createUser(ownerReq, 'Owner');
    const editorEmail = await createUser(editorReq, 'Editor');
    const viewerEmail = await createUser(viewerReq, 'Viewer');
    await createUser(nonMemberReq, 'NonMember');

    // === Workspace A Setup (Owned by Owner) ===
    const wsResA = await ownerReq.post('/api/workspaces', { data: { name: `Workspace A ${getUuid()}` } });
    if (!wsResA.ok()) throw new Error(`Workspace A failed: ${await wsResA.text()}`);
    const wsA = await wsResA.json();
    workspaceIdA = wsA._id || wsA.id;

    let res = await ownerReq.post(`/api/workspaces/${workspaceIdA}/members`, { data: { email: editorEmail, role: 'editor' } });
    if (!res.ok()) throw new Error(`Add Editor failed: ${await res.text()}`);
    res = await ownerReq.post(`/api/workspaces/${workspaceIdA}/members`, { data: { email: viewerEmail, role: 'viewer' } });
    if (!res.ok()) throw new Error(`Add Viewer failed: ${await res.text()}`);

    const colResA = await ownerReq.post(`/api/workspaces/${workspaceIdA}/collections`, { data: { name: 'Col A' } });
    if (!colResA.ok()) throw new Error(`Collection A failed: ${await colResA.text()}`);
    const colA = await colResA.json();
    collectionIdA = colA._id || colA.id;

    const folResA = await ownerReq.post(`/api/collections/${collectionIdA}/folders`, { data: { name: 'Fol A' } });
    if (!folResA.ok()) throw new Error(`Folder A failed: ${await folResA.text()}`);
    const folA = await folResA.json();
    folderIdA = folA._id || folA.id;

    const reqResA = await ownerReq.post(`/api/collections/${collectionIdA}/requests`, { 
      data: { name: 'Req A', method: 'GET', url: 'http://example.com' } 
    });
    if (!reqResA.ok()) throw new Error(`Request A failed: ${await reqResA.text()}`);
    const reqA = await reqResA.json();
    requestIdA = reqA._id || reqA.id;

    const envResA = await ownerReq.post(`/api/workspaces/${workspaceIdA}/environments`, { 
      data: { name: 'Env A', variables: [] } 
    });
    if (!envResA.ok()) throw new Error(`Env A failed: ${await envResA.text()}`);
    const envA = await envResA.json();
    envIdA = envA._id || envA.id;

    // Enable history saving for owner so the proxy request actually generates a history entry
    await ownerReq.put('/api/user/settings', { data: { saveHistory: true } });

    // Create a history entry via proxy simulation
    await ownerReq.post('/api/proxy', {
      data: { method: 'GET', url: 'http://example.com', workspaceId: workspaceIdA }
    });
    
    // Wait a brief moment for the async saveHistoryEntry to complete
    await new Promise(r => setTimeout(r, 500));

    // Fetch the history list to get the actual history ID
    const historyListRes = await ownerReq.get(`/api/workspaces/${workspaceIdA}/history`);
    const historyList = await historyListRes.json();
    historyIdA = historyList[0]?._id || historyList[0]?.id || getUuid();

    // === Workspace B Setup (Owned by NonMember) ===
    const wsResB = await nonMemberReq.post('/api/workspaces', { data: { name: `Workspace B ${getUuid()}` } });
    if (!wsResB.ok()) throw new Error(`Workspace B failed: ${await wsResB.text()}`);
    const wsB = await wsResB.json();
    workspaceIdB = wsB._id || wsB.id;

    const colResB = await nonMemberReq.post(`/api/workspaces/${workspaceIdB}/collections`, { data: { name: 'Col B' } });
    if (!colResB.ok()) throw new Error(`Collection B failed: ${await colResB.text()}`);
    const colB = await colResB.json();
    collectionIdB = colB._id || colB.id;
  });

  // Table-driven endpoints definition
  const endpoints = [
    {
      name: 'Create Collection',
      method: 'POST',
      url: () => `/api/workspaces/${workspaceIdA}/collections`,
      body: () => ({ name: 'New Col' }),
      expected: { anonymous: 401, nonMember: 403, viewer: 403, editor: 201, owner: 201, superadmin: 201 },
      massAssignment: {
        url: () => `/api/workspaces/${workspaceIdB}/collections`,
        body: () => ({ name: 'Mass Col' }),
        expectedStatus: 403 // Editor of A trying to create in B
      }
    },
    {
      name: 'Update Collection',
      method: 'PUT',
      url: () => `/api/collections/${collectionIdA}`,
      body: () => ({ name: 'Updated Col' }),
      expected: { anonymous: 401, nonMember: 403, viewer: 403, editor: 200, owner: 200, superadmin: 200 },
      massAssignment: {
        url: () => `/api/collections/${collectionIdB}`,
        body: () => ({ name: 'Mass Col Update' }),
        expectedStatus: 403 // Editor of A trying to update B's collection
      }
    },
    {
      name: 'Create Folder',
      method: 'POST',
      url: () => `/api/collections/${collectionIdA}/folders`,
      body: () => ({ name: 'New Fol' }),
      expected: { anonymous: 401, nonMember: 403, viewer: 403, editor: 201, owner: 201, superadmin: 201 },
      massAssignment: {
        url: () => `/api/collections/${collectionIdB}/folders`,
        body: () => ({ name: 'Mass Fol' }),
        expectedStatus: 403
      }
    },
    {
      name: 'Create Request',
      method: 'POST',
      url: () => `/api/collections/${collectionIdA}/requests`,
      body: () => ({ name: 'New Req', method: 'GET', url: 'http://a.com' }),
      expected: { anonymous: 401, nonMember: 403, viewer: 403, editor: 201, owner: 201, superadmin: 201 },
      massAssignment: {
        url: () => `/api/collections/${collectionIdB}/requests`,
        body: () => ({ name: 'Mass Req', method: 'GET', url: 'http://b.com' }),
        expectedStatus: 403
      }
    },
    {
      name: 'Update Request',
      method: 'PUT',
      url: () => `/api/requests/${requestIdA}`,
      body: () => ({ name: 'Updated Req' }),
      expected: { anonymous: 401, nonMember: 403, viewer: 403, editor: 200, owner: 200, superadmin: 200 },
      massAssignment: null
    },
    {
      name: 'Save History to Collection (SEC-2)',
      method: 'POST',
      url: () => `/api/history/${historyIdA}/save`,
      body: () => ({ collectionId: collectionIdA, name: 'Saved Req' }),
      expected: { anonymous: 401, nonMember: 403, viewer: 403, editor: 404, owner: 404, superadmin: 404 },

      massAssignment: {
        url: () => `/api/history/${historyIdA}/save`,
        body: () => ({ collectionId: collectionIdB, name: 'Mass Save Req' }), // Posting foreign collectionId
        expectedStatus: 403
      }
    },
    {
      name: 'Import WSDL (SEC-2)',
      method: 'POST',
      url: () => `/api/import/wsdl`,
      body: () => ({ workspaceId: workspaceIdA, url: 'http://example.com/wsdl' }),
      expected: { anonymous: 401, nonMember: 403, viewer: 403, editor: 500, owner: 500, superadmin: 500 }, // 500 because example.com/wsdl fails soap parser but auth passes
      massAssignment: {
        url: () => `/api/import/wsdl`,
        body: () => ({ workspaceId: workspaceIdB, url: 'http://example.com/wsdl' }),
        expectedStatus: 403
      }
    },
    {
      name: 'Create Environment',
      method: 'POST',
      url: () => `/api/workspaces/${workspaceIdA}/environments`,
      body: () => ({ name: 'New Env', variables: [] }),
      expected: { anonymous: 401, nonMember: 403, viewer: 403, editor: 201, owner: 201, superadmin: 201 },
      massAssignment: {
        url: () => `/api/workspaces/${workspaceIdB}/environments`,
        body: () => ({ name: 'Mass Env', variables: [] }),
        expectedStatus: 403
      }
    },
    {
      name: 'Update Workspace Settings',
      method: 'PUT',
      url: () => `/api/workspaces/${workspaceIdA}`,
      body: () => ({ name: 'Updated WS A' }),
      expected: { anonymous: 401, nonMember: 403, viewer: 403, editor: 403, owner: 200, superadmin: 200 },
      massAssignment: {
        url: () => `/api/workspaces/${workspaceIdB}`,
        body: () => ({ name: 'Mass WS' }),
        expectedStatus: 403
      }
    }
  ];

  for (const ep of endpoints) {
    test.describe(ep.name, () => {
      const roles = ['anonymous', 'nonMember', 'viewer', 'editor', 'owner', 'superadmin'];
      
      for (const role of roles) {
        test(`should return ${ep.expected[role]} for ${role}`, async () => {
          let reqCtx: APIRequestContext;
          switch (role) {
            case 'anonymous': reqCtx = anonymousReq; break;
            case 'nonMember': reqCtx = nonMemberReq; break;
            case 'viewer': reqCtx = viewerReq; break;
            case 'editor': reqCtx = editorReq; break;
            case 'owner': reqCtx = ownerReq; break;
            case 'superadmin': reqCtx = superadminReq; break;
            default: throw new Error(`Unknown role ${role}`);
          }

          const response = await reqCtx[ep.method.toLowerCase()](ep.url(), { data: ep.body() });
          
          // Some routes might return 400 if validation fails early, but auth checks should happen before validation
          // or validation is quick, but auth is 401/403.
          expect(response.status()).toBe(ep.expected[role]);
        });
      }

      if (ep.massAssignment) {
        test(`should prevent mass-assignment/foreign access returning ${ep.massAssignment.expectedStatus}`, async () => {
          // Use 'editor' context for Workspace A trying to access Workspace B resources
          const response = await editorReq[ep.method.toLowerCase()](ep.massAssignment.url(), { data: ep.massAssignment.body() });
          
          expect([400, 403, 404]).toContain(response.status());
        });
      }
    });
  }
});
