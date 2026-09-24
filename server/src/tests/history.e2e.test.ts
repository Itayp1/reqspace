// Using native Node fetch. Exercises SEC-0.3: history is now written by a
// client-driven endpoint after the request itself is sent by the client's
// transport, not the server. The server must still enforce workspace
// membership and must never trust the client's own byte-accounting.
export {};

const BASE_URL = 'http://localhost:3005';

async function waitForHealth() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Server not healthy');
}

function cookieFrom(res: Response): string {
  return res.headers.get('set-cookie')?.split(';')[0] || '';
}

async function registerAndLogin(name: string, email: string, password = 'password123') {
  await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = cookieFrom(loginRes);
  const me = (await (
    await fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie } })
  ).json()) as any;
  return { cookie, userId: me.id as string };
}

function historyPayload(opts: { bodyLength: number; claimedSize: number }) {
  return {
    requestSnapshot: { method: 'GET', url: 'https://example.com/test' },
    responseSnapshot: {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'x'.repeat(opts.bodyLength),
      responseTime: 42,
      size: opts.claimedSize,
    },
    testResults: [],
  };
}

describe('E2E History - client-driven write endpoint (SEC-0.3)', () => {
  let adminCookie = '';
  let ownerCookie = '';
  let viewerCookie = '';
  let outsiderCookie = '';
  let workspaceId = '';
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

  beforeAll(async () => {
    await waitForHealth();

    const adminLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin', password: 'admin' }),
    });
    adminCookie = cookieFrom(adminLogin);
    await fetch(`${BASE_URL}/api/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ auth: { allowSelfRegistration: true } }),
    });

    const owner = await registerAndLogin(`Owner ${suffix}`, `history-owner-${suffix}@example.com`);
    ownerCookie = owner.cookie;
    const viewer = await registerAndLogin(`Viewer ${suffix}`, `history-viewer-${suffix}@example.com`);
    viewerCookie = viewer.cookie;
    const outsider = await registerAndLogin(`Outsider ${suffix}`, `history-outsider-${suffix}@example.com`);
    outsiderCookie = outsider.cookie;

    const wsRes = await fetch(`${BASE_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ownerCookie },
      body: JSON.stringify({ name: `History Test WS ${suffix}` }),
    });
    const ws = (await wsRes.json()) as any;
    workspaceId = ws._id;

    await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: ownerCookie },
      body: JSON.stringify({ email: `history-viewer-${suffix}@example.com`, role: 'viewer' }),
    });
  }, 40000);

  it('(a) a viewer can write their own history in a workspace they belong to', async () => {
    const res = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: viewerCookie },
      body: JSON.stringify(historyPayload({ bodyLength: 50, claimedSize: 50 })),
    });
    expect(res.status).toBe(201);

    const listRes = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/history`, {
      headers: { cookie: viewerCookie },
    });
    const list = (await listRes.json()) as any;
    expect(list.items.length).toBeGreaterThanOrEqual(1);
  });

  it('(b) a non-member gets 403 when trying to write history into the workspace', async () => {
    const res = await fetch(`${BASE_URL}/api/workspaces/${workspaceId}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: outsiderCookie },
      body: JSON.stringify(historyPayload({ bodyLength: 50, claimedSize: 50 })),
    });
    expect(res.status).toBe(403);
  });

  it("(c) a client claiming size:0 on a large body still has the real size counted against its quota", async () => {
    // Isolate this scenario with its own workspace + fresh user so leftover
    // history from (a) does not affect the byte accounting below.
    const quotaUser = await registerAndLogin(
      `Quota ${suffix}`,
      `history-quota-${suffix}@example.com`
    );
    const wsRes = await fetch(`${BASE_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: quotaUser.cookie },
      body: JSON.stringify({ name: `History Quota WS ${suffix}` }),
    });
    const quotaWs = (await wsRes.json()) as any;

    // Cap the user's total history to ~5000 bytes, and raise the per-entry
    // truncation limit well above our 2000-byte test bodies so truncation
    // itself does not interfere with the quota math below.
    await fetch(`${BASE_URL}/api/admin/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        history: { maxRequestBodyKB: 1024, maxTotalPerUserMB: 5000 / 1024 / 1024 },
      }),
    });

    const post = (bodyLength: number) =>
      fetch(`${BASE_URL}/api/workspaces/${quotaWs._id}/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: quotaUser.cookie },
        body: JSON.stringify(historyPayload({ bodyLength, claimedSize: 0 })),
      });

    // Entry 1: real usage ~2000 bytes, but the client lies and claims size: 0.
    const r1 = await post(2000);
    expect(r1.status).toBe(201);
    // Entry 2: another ~2000 bytes, also claiming size: 0. Total real usage is
    // now ~4000 bytes — still under the ~5000 byte cap, so nothing is evicted
    // yet.
    const r2 = await post(2000);
    expect(r2.status).toBe(201);

    let list = (await (
      await fetch(`${BASE_URL}/api/workspaces/${quotaWs._id}/history`, {
        headers: { cookie: quotaUser.cookie },
      })
    ).json()) as any;
    expect(list.total).toBe(2);
    // The server must have recomputed the real size — never the client's
    // claimed 0 — for every stored entry.
    for (const item of list.items) {
      expect(item.responseSnapshot.size).toBe(2000);
    }

    // Entry 3: another ~2000 bytes claiming size: 0. If the server had
    // trusted the client's claimed sizes (0, 0, 0), real usage would look
    // like 0 bytes and nothing would ever be evicted. Because the server
    // recomputes real byte length, cumulative usage is now ~6000 bytes,
    // which exceeds the ~5000 byte cap and forces the oldest entry (entry 1)
    // to be evicted before entry 3 is written.
    const r3 = await post(2000);
    expect(r3.status).toBe(201);

    list = (await (
      await fetch(`${BASE_URL}/api/workspaces/${quotaWs._id}/history`, {
        headers: { cookie: quotaUser.cookie },
      })
    ).json()) as any;
    // Entry 1 was evicted to stay under quota — only 2 entries remain, proving
    // the client's lied `size: 0` was never used for quota accounting.
    expect(list.total).toBe(2);
  }, 20000);
});
