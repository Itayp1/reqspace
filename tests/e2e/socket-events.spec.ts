import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';

test.describe('Socket events coverage', () => {
  test('Cover all 13 event families via direct socket connection', async ({ request, baseURL }) => {
    // 1. Login as admin and get cookie
    // We will override baseURL for API calls
    const apiUrl = 'http://localhost:3005/api';
    let res = await request.post(`${apiUrl}/auth/login`, {
      data: { email: 'admin', password: 'admin' }
    });
    if (!res.ok()) {
      res = await request.post(`${apiUrl}/auth/login`, {
        data: { email: 'admin', password: 'admin123456' }
      });
    }
    if (!res.ok()) {
      throw new Error('Admin login failed: ' + await res.text());
    }
    const cookieHeader = res.headers()['set-cookie'];
    
    // Get workspaces
    const wsRes = await request.get(`${apiUrl}/workspaces`, { headers: { Cookie: cookieHeader } });
    const wsList = await wsRes.json();
    const wsId = wsList[0]._id;
    
    // 2. Connect socket
    const socket = io('http://localhost:3005', {
      path: '/ws',
      extraHeaders: { Cookie: cookieHeader },
      transports: ['websocket']
    });

    await new Promise<void>(resolve => {
      socket.on('connect', () => {
        socket.emit('join:workspace', wsId);
        setTimeout(resolve, 500); // Give server time to check auth and join room
      });
    });

    const receivedEvents = new Set<string>();
    const expectedEvents = [
      'collection:created', 'collection:updated', 'collection:deleted',
      'folder:created', 'folder:updated', 'folder:deleted',
      'request:created', 'request:updated', 'request:deleted',
      'workspace:reordered',
      'environment:created', 'environment:updated', 'environment:deleted'
    ];

    expectedEvents.forEach(evt => {
      socket.on(evt, () => receivedEvents.add(evt));
    });

    // 3. Trigger events
    const headers = { Cookie: cookieHeader };
    // Create Environment
    let envRes = await request.post(`${apiUrl}/workspaces/${wsId}/environments`, { data: { name: 'E1' }, headers });
    const envId = (await envRes.json())._id;
    // Update Environment
    await request.put(`${apiUrl}/environments/${envId}`, { data: { name: 'E2' }, headers });
    // Delete Environment
    await request.delete(`${apiUrl}/environments/${envId}`, { headers });

    // Create Collection
    let colRes = await request.post(`${apiUrl}/workspaces/${wsId}/collections`, { data: { name: 'C1' }, headers });
    const colId = (await colRes.json())._id;
    // Update Collection
    await request.put(`${apiUrl}/collections/${colId}`, { data: { name: 'C2' }, headers });

    // Create Folder
    let folRes = await request.post(`${apiUrl}/collections/${colId}/folders`, { data: { name: 'F1' }, headers });
    const folId = (await folRes.json())._id;
    // Update Folder
    await request.put(`${apiUrl}/folders/${folId}`, { data: { name: 'F2' }, headers });

    // Create Request
    let reqRes = await request.post(`${apiUrl}/collections/${colId}/requests`, { data: { name: 'R1', method: 'GET', folderId: folId }, headers });
    const reqId = (await reqRes.json())._id;
    // Update Request
    await request.put(`${apiUrl}/requests/${reqId}`, { data: { name: 'R2', method: 'POST' }, headers });
    
    // Reorder
    await request.post(`${apiUrl}/workspaces/${wsId}/reorder`, { 
      data: { type: 'request', items: [{ id: reqId, order: 1 }] }, headers 
    });

    // Delete Request
    await request.delete(`${apiUrl}/requests/${reqId}`, { headers });
    // Delete Folder
    await request.delete(`${apiUrl}/folders/${folId}`, { headers });
    // Delete Collection
    await request.delete(`${apiUrl}/collections/${colId}`, { headers });

    // 4. Wait a bit for events to arrive
    await new Promise(r => setTimeout(r, 1000));
    socket.disconnect();

    console.log('receivedEvents:', Array.from(receivedEvents));

    // 5. Assert all expected events were received
    for (const evt of expectedEvents) {
      expect(receivedEvents.has(evt), `Expected socket to receive event: ${evt}`).toBeTruthy();
    }
  });
});
