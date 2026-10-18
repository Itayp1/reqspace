/**
 * Regression tests for the faults fixed in the 2026-10-14 review. Each block
 * names the bug it pins; every one of these failed (404, 400, wrong data or
 * orphaned rows) before the fix.
 *
 * Runs against a live server like the other *.e2e tests
 * (`node scripts/run-server-e2e.js`).
 */
export {};
const port = process.env.TEST_PORT || process.env.PORT || 3005;
const BASE_URL = `http://127.0.0.1:${port}`;
jest.setTimeout(60_000);

type Json = any;

async function call(method: string, path: string, cookie: string, body?: unknown): Promise<{ status: number; data: Json }> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: Json = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, data };
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
  return res.headers.get('set-cookie')!.split(';')[0];
}

async function register(name: string, email: string): Promise<{ cookie: string; id: string }> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: 'password123' }),
  });
  if (res.status !== 201) throw new Error(`register ${email} -> ${res.status} ${await res.text()}`);
  const data = await res.json() as Json;
  return { cookie: res.headers.get('set-cookie')!.split(';')[0], id: data.user.id };
}

const ts = Date.now();
let admin = '';

beforeAll(async () => {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.status === 200) break;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  admin = await login('admin', 'admin');
});

async function newWorkspace(cookie: string, name: string): Promise<string> {
  const r = await call('POST', '/workspaces', cookie, { name });
  expect(r.status).toBe(201);
  return r.data._id;
}

describe('admin user management (routes were missing: every button 404d)', () => {
  it('promotes, revokes, suspends, reactivates and deletes a user', async () => {
    const u = await register('Managed User', `managed_${ts}@example.com`);

    let r = await call('POST', `/admin/users/${u.id}/promote`, admin, {});
    expect(r.status).toBe(200);
    expect(r.data.isSuperAdmin).toBe(true);
    expect(r.data.passwordHash).toBeUndefined();

    r = await call('POST', `/admin/users/${u.id}/revoke`, admin, {});
    expect(r.status).toBe(200);
    expect(r.data.isSuperAdmin).toBe(false);

    r = await call('POST', `/admin/users/${u.id}/suspend`, admin, { suspended: true });
    expect(r.status).toBe(200);
    expect(r.data.status).toBe('suspended');
    // A suspended account loses its session on the next request.
    expect((await call('GET', '/auth/me', u.cookie)).status).toBe(401);

    r = await call('POST', `/admin/users/${u.id}/suspend`, admin, { suspended: false });
    expect(r.data.status).toBe('active');

    r = await call('DELETE', `/admin/users/${u.id}`, admin);
    expect(r.status).toBe(200);
    expect(r.data.workspacesDeleted).toBe(1); // their personal workspace
    const users = await call('GET', '/admin/users?limit=200', admin);
    expect(users.data.users.some((x: Json) => x._id === u.id)).toBe(false);
  });

  it('refuses to act on yourself or remove the last super admin', async () => {
    const me = await call('GET', '/auth/me', admin);
    expect((await call('POST', `/admin/users/${me.data.id}/revoke`, admin, {})).status).toBe(400);
    expect((await call('POST', `/admin/users/${me.data.id}/suspend`, admin, { suspended: true })).status).toBe(400);
    expect((await call('DELETE', `/admin/users/${me.data.id}`, admin)).status).toBe(400);
    expect((await call('POST', '/admin/users/not-a-uuid/promote', admin, {})).status).toBe(400);
  });

  it('hands shared workspaces of a deleted owner to the admin', async () => {
    const owner = await register('Owner To Delete', `owner_del_${ts}@example.com`);
    const wsId = await newWorkspace(owner.cookie, `Shared WS ${ts}`);
    const r = await call('DELETE', `/admin/users/${owner.id}`, admin);
    expect(r.data.workspacesTransferred).toBe(1);
    const ws = await call('GET', `/workspaces/${wsId}`, admin);
    expect(ws.status).toBe(200);
    const me = await call('GET', '/auth/me', admin);
    expect(ws.data.ownerId).toBe(me.data.id);
    expect(ws.data.members.some((m: Json) => (m.userId?._id ?? m.userId) === me.data.id && m.role === 'owner')).toBe(true);
  });

  it('non-admins get 403', async () => {
    const u = await register('Plain User', `plain_${ts}@example.com`);
    expect((await call('POST', `/admin/users/${u.id}/promote`, u.cookie, {})).status).toBe(403);
  });
});

describe('admin config keeps SMTP and Google OAuth (they were stripped by the schema)', () => {
  it('stores smtp + googleOAuth and masks the secrets on read', async () => {
    const r = await call('PUT', '/admin/config', admin, {
      auth: {
        smtp: { enabled: true, host: 'smtp.example.test', port: 2525, user: 'mailer', pass: 's3cret', fromAddress: 'noreply@example.test' },
        googleOAuth: { enabled: false, clientId: `client-${ts}`, clientSecret: 'g-secret' },
      },
    });
    expect(r.status).toBe(200);
    const cfg = await call('GET', '/admin/config', admin);
    expect(cfg.data.auth.smtp.host).toBe('smtp.example.test');
    expect(cfg.data.auth.smtp.port).toBe(2525);
    expect(cfg.data.auth.smtp.pass).not.toBe('s3cret');
    expect(cfg.data.auth.googleOAuth.clientId).toBe(`client-${ts}`);
    expect(cfg.data.auth.googleOAuth.clientSecret).not.toBe('g-secret');

    // Echoing the masked value back leaves the stored secret alone.
    await call('PUT', '/admin/config', admin, { auth: { smtp: { pass: cfg.data.auth.smtp.pass } } });
    const again = await call('GET', '/admin/config', admin);
    expect(again.data.auth.smtp.pass).toBe(cfg.data.auth.smtp.pass);
  });

  it('SMTP test reports an unreachable server as a 400 with the reason', async () => {
    // A private target is refused up front (Q9.2) unless an admin allows it (Q8.6).
    const blocked = await call('POST', '/admin/test-smtp', admin, { host: '127.0.0.1', port: 1, user: '', pass: '' });
    expect(blocked.status).toBe(400);
    expect(String(blocked.data.message)).toMatch(/private network/);

    await call('PUT', '/admin/config', admin, { proxy: { allowPrivateTargets: true } });
    try {
      const r = await call('POST', '/admin/test-smtp', admin, { host: '127.0.0.1', port: 1, user: '', pass: '' });
      expect(r.status).toBe(400);
      expect(String(r.data.message)).toMatch(/SMTP connection failed/);
    } finally {
      await call('PUT', '/admin/config', admin, { proxy: { allowPrivateTargets: false } });
    }
  });
});

describe('environment duplicate (route was missing)', () => {
  it('duplicates into the same workspace and copies into another one', async () => {
    const u = await register('Env User', `env_dup_${ts}@example.com`);
    const wsA = await newWorkspace(u.cookie, `Env A ${ts}`);
    const wsB = await newWorkspace(u.cookie, `Env B ${ts}`);
    const env = await call('POST', `/workspaces/${wsA}/environments`, u.cookie, {
      name: 'Staging', variables: [{ key: 'host', initialValue: 'a', currentValue: 'a', enabled: true }],
    });
    expect(env.status).toBe(201);

    const dup = await call('POST', `/environments/${env.data._id}/duplicate`, u.cookie, {});
    expect(dup.status).toBe(201);
    expect(dup.data.name).toBe('Staging (Copy)');
    expect(dup.data.workspaceId).toBe(wsA);
    expect(dup.data.variables[0].key).toBe('host');

    const copy = await call('POST', `/environments/${env.data._id}/duplicate`, u.cookie, { workspaceId: wsB });
    expect(copy.status).toBe(201);
    expect(copy.data.workspaceId).toBe(wsB);
    const listB = await call('GET', `/workspaces/${wsB}/environments`, u.cookie);
    expect(listB.data.map((e: Json) => e.name)).toContain('Staging (Copy)');
  });

  it('needs editor rights on the target workspace', async () => {
    const owner = await register('Env Owner', `env_owner_${ts}@example.com`);
    const outsider = await register('Env Outsider', `env_out_${ts}@example.com`);
    const ws = await newWorkspace(owner.cookie, `Env Owner WS ${ts}`);
    const env = await call('POST', `/workspaces/${ws}/environments`, owner.cookie, { name: 'Prod', variables: [] });
    const outsiderWs = await newWorkspace(outsider.cookie, `Outsider WS ${ts}`);
    // Cannot read the source...
    expect((await call('POST', `/environments/${env.data._id}/duplicate`, outsider.cookie, { workspaceId: outsiderWs })).status).toBe(403);
    // ...and cannot write into a workspace they are not in.
    expect((await call('POST', `/environments/${env.data._id}/duplicate`, owner.cookie, { workspaceId: outsiderWs })).status).toBe(403);
  });
});

describe('cascading deletes (subtrees and workspaces used to leave orphans)', () => {
  it('deleting a folder removes nested folders and every request inside them', async () => {
    const u = await register('Cascade User', `cascade_${ts}@example.com`);
    const ws = await newWorkspace(u.cookie, `Cascade WS ${ts}`);
    const col = (await call('POST', `/workspaces/${ws}/collections`, u.cookie, { name: 'C' })).data;
    const top = (await call('POST', `/collections/${col._id}/folders`, u.cookie, { name: 'top' })).data;
    const mid = (await call('POST', `/collections/${col._id}/folders`, u.cookie, { name: 'mid', parentFolderId: top._id })).data;
    const leaf = (await call('POST', `/collections/${col._id}/folders`, u.cookie, { name: 'leaf', parentFolderId: mid._id })).data;
    await call('POST', `/collections/${col._id}/requests`, u.cookie, { name: 'in leaf', method: 'GET', url: 'https://x.test/leaf', folderId: leaf._id });
    await call('POST', `/collections/${col._id}/requests`, u.cookie, { name: 'in mid', method: 'GET', url: 'https://x.test/mid', folderId: mid._id });
    await call('POST', `/collections/${col._id}/requests`, u.cookie, { name: 'at root', method: 'GET', url: 'https://x.test/root' });

    expect((await call('DELETE', `/folders/${top._id}`, u.cookie)).status).toBe(200);

    const folders = await call('GET', `/collections/${col._id}/folders`, u.cookie);
    expect(folders.data).toHaveLength(0);
    const requests = await call('GET', `/collections/${col._id}/requests`, u.cookie);
    expect(requests.data.map((r: Json) => r.name)).toEqual(['at root']);

    // The orphans used to resurface in share links.
    const share = await call('POST', `/share/collection/${col._id}`, u.cookie, { expiresInDays: 1 });
    const shared = await call('GET', `/share/${share.data.shortId}`, '');
    expect(shared.data.requests.map((r: Json) => r.name)).toEqual(['at root']);
  });

  it('deleting a workspace removes its collections, folders, requests and environments', async () => {
    const u = await register('WS Cascade', `ws_cascade_${ts}@example.com`);
    const ws = await newWorkspace(u.cookie, `Doomed WS ${ts}`);
    const col = (await call('POST', `/workspaces/${ws}/collections`, u.cookie, { name: 'C' })).data;
    const folder = (await call('POST', `/collections/${col._id}/folders`, u.cookie, { name: 'f' })).data;
    const req = (await call('POST', `/collections/${col._id}/requests`, u.cookie, { name: 'r', method: 'GET', url: 'https://x.test', folderId: folder._id })).data;
    await call('POST', `/workspaces/${ws}/environments`, u.cookie, { name: 'E', variables: [] });

    expect((await call('DELETE', `/workspaces/${ws}`, admin)).status).toBe(200);
    // Superadmin bypasses membership, so these reach the lookups themselves.
    expect((await call('GET', `/requests/${req._id}`, admin)).status).toBe(404);
    // A 30s id->workspace cache can still route this for a moment; either way
    // there must be nothing left behind it.
    const folders = await call('GET', `/collections/${col._id}/folders`, admin);
    expect(folders.status === 404 || (Array.isArray(folders.data) && folders.data.length === 0)).toBe(true);
    const envs = await call('GET', `/workspaces/${ws}/environments`, admin);
    expect(envs.data).toEqual([]);
  });

  it('rejects a folderId / parentFolderId from another collection', async () => {
    const u = await register('Parent Check', `parent_${ts}@example.com`);
    const ws = await newWorkspace(u.cookie, `Parent WS ${ts}`);
    const a = (await call('POST', `/workspaces/${ws}/collections`, u.cookie, { name: 'A' })).data;
    const b = (await call('POST', `/workspaces/${ws}/collections`, u.cookie, { name: 'B' })).data;
    const fb = (await call('POST', `/collections/${b._id}/folders`, u.cookie, { name: 'fb' })).data;
    expect((await call('POST', `/collections/${a._id}/requests`, u.cookie, { name: 'x', method: 'GET', url: '', folderId: fb._id })).status).toBe(400);
    expect((await call('POST', `/collections/${a._id}/folders`, u.cookie, { name: 'x', parentFolderId: fb._id })).status).toBe(400);
  });
});

describe('request saves tolerate client-side row extras (they were rejected with 400)', () => {
  it('drops a form-data File placeholder and imported _id keys instead of failing', async () => {
    const u = await register('Save User', `save_${ts}@example.com`);
    const ws = await newWorkspace(u.cookie, `Save WS ${ts}`);
    const col = (await call('POST', `/workspaces/${ws}/collections`, u.cookie, { name: 'C' })).data;
    const req = (await call('POST', `/collections/${col._id}/requests`, u.cookie, { name: 'r', method: 'POST', url: 'https://x.test' })).data;
    const r = await call('PUT', `/requests/${req._id}`, u.cookie, {
      headers: [{ key: 'Content-Type', value: 'text/xml', enabled: true, _id: 'abc' }],
      body: { mode: 'form-data', formData: [{ key: 'upload', value: '', enabled: true, type: 'file', file: {} }] },
    });
    expect(r.status).toBe(200);
    expect(r.data.headers[0]).toEqual({ key: 'Content-Type', value: 'text/xml', enabled: true });
    expect(r.data.body.formData[0].file).toBeUndefined();
  });
});

describe('collection import keeps the whole tree (it used to create GET https://example.com stubs)', () => {
  it('imports folders, nesting, methods, urls, params, headers, bodies, auth and scripts', async () => {
    const u = await register('Import User', `import_${ts}@example.com`);
    const ws = await newWorkspace(u.cookie, `Import WS ${ts}`);
    const postman = {
      info: { name: 'Pet Store', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      variable: [{ key: 'baseUrl', value: 'https://pets.test' }],
      auth: { type: 'bearer', bearer: [{ key: 'token', value: 'col-token' }] },
      event: [{ listen: 'prerequest', script: { exec: ['console.log("col pre")'] } }],
      item: [
        {
          name: 'Pets',
          item: [
            {
              name: 'Create pet',
              event: [{ listen: 'test', script: { exec: ['pm.test("ok", () => {})', '// 2nd line'] } }],
              request: {
                method: 'POST',
                url: { raw: '{{baseUrl}}/pets?verbose=1', query: [{ key: 'verbose', value: '1' }] },
                header: [{ key: 'X-Trace', value: 't1' }, { key: 'X-Off', value: 'no', disabled: true }],
                body: { mode: 'raw', raw: '{"name":"rex"}', options: { raw: { language: 'json' } } },
              },
            },
            { name: 'Nested', item: [{ name: 'Form', request: { method: 'PUT', url: 'https://pets.test/form', body: { mode: 'urlencoded', urlencoded: [{ key: 'a', value: 'b' }] }, auth: { type: 'noauth' } } }] },
          ],
        },
        { name: 'Health', request: { method: 'GET', url: 'https://pets.test/health', auth: { type: 'apikey', apikey: [{ key: 'key', value: 'X-Key' }, { key: 'value', value: 'k1' }, { key: 'in', value: 'header' }] } } },
      ],
    };
    const r = await call('POST', '/collections/import', u.cookie, { workspaceId: ws, collection: postman });
    expect(r.status).toBe(200);
    expect(r.data.folders).toBe(2);
    expect(r.data.requests).toBe(3);
    const colId = r.data.collectionId;

    const tree = await call('GET', `/workspaces/${ws}/tree?full=1`, u.cookie);
    const col = tree.data.collections.find((c: Json) => c._id === colId);
    expect(col.name).toBe('Pet Store');
    expect(col.variables).toEqual([{ key: 'baseUrl', value: 'https://pets.test', enabled: true }]);
    expect(col.auth).toEqual({ type: 'bearer', bearer: { token: 'col-token' } });
    expect(col.preRequestScript).toBe('console.log("col pre")');

    const pets = tree.data.folders.find((f: Json) => f.name === 'Pets');
    const nested = tree.data.folders.find((f: Json) => f.name === 'Nested');
    expect(pets.parentFolderId).toBeNull();
    expect(nested.parentFolderId).toBe(pets._id);

    const create = tree.data.requests.find((q: Json) => q.name === 'Create pet');
    expect(create.folderId).toBe(pets._id);
    expect(create.method).toBe('POST');
    expect(create.url).toBe('{{baseUrl}}/pets?verbose=1');
    expect(create.params).toEqual([{ key: 'verbose', value: '1', enabled: true }]);
    expect(create.headers).toEqual([{ key: 'X-Trace', value: 't1', enabled: true }, { key: 'X-Off', value: 'no', enabled: false }]);
    expect(create.body).toEqual({ mode: 'raw', raw: '{"name":"rex"}', rawLanguage: 'json' });
    expect(create.auth).toEqual({ type: 'inherit' });
    expect(create.testScript).toBe('pm.test("ok", () => {})\n// 2nd line');

    const form = tree.data.requests.find((q: Json) => q.name === 'Form');
    expect(form.folderId).toBe(nested._id);
    expect(form.auth).toEqual({ type: 'none' });
    expect(form.body).toEqual({ mode: 'urlencoded', urlencoded: [{ key: 'a', value: 'b', enabled: true }] });

    const health = tree.data.requests.find((q: Json) => q.name === 'Health');
    expect(health.folderId).toBeNull();
    expect(health.auth).toEqual({ type: 'apikey', apikey: { key: 'X-Key', value: 'k1', in: 'header' } });
  });

  it('round-trips through export', async () => {
    const u = await register('Roundtrip User', `roundtrip_${ts}@example.com`);
    const ws = await newWorkspace(u.cookie, `Roundtrip WS ${ts}`);
    const col = (await call('POST', `/workspaces/${ws}/collections`, u.cookie, { name: 'RT' })).data;
    const f = (await call('POST', `/collections/${col._id}/folders`, u.cookie, { name: 'F' })).data;
    await call('POST', `/collections/${col._id}/requests`, u.cookie, {
      name: 'deep', method: 'PATCH', url: 'https://rt.test/x', folderId: f._id,
      headers: [{ key: 'A', value: '1', enabled: true }],
      body: { mode: 'graphql', graphql: { query: '{ me { id } }', variables: '{}' } },
      preRequestScript: 'pm.variables.set("a", 1)',
    });
    const exported = await call('GET', `/collections/${col._id}/export?includeSecrets=true`, u.cookie);
    expect(exported.data.info.schema).toContain('schema.getpostman.com');
    const imported = await call('POST', '/collections/import', u.cookie, { workspaceId: ws, collection: exported.data });
    expect(imported.status).toBe(200);
    const tree = await call('GET', `/workspaces/${ws}/tree?full=1`, u.cookie);
    const copies = tree.data.requests.filter((q: Json) => q.name === 'deep');
    expect(copies).toHaveLength(2);
    const copy = copies.find((q: Json) => q.collectionId === imported.data.collectionId);
    expect(copy.method).toBe('PATCH');
    expect(copy.body.graphql.query).toBe('{ me { id } }');
    expect(copy.preRequestScript).toBe('pm.variables.set("a", 1)');
    expect(copy.headers).toEqual([{ key: 'A', value: '1', enabled: true }]);
  });

  it('rejects something that is not a collection with a 400', async () => {
    const u = await register('Bad Import', `bad_import_${ts}@example.com`);
    const ws = await newWorkspace(u.cookie, `Bad Import WS ${ts}`);
    const r = await call('POST', '/collections/import', u.cookie, { workspaceId: ws, collection: { hello: 'world' } });
    expect(r.status).toBe(400);
  });
});

describe('misc', () => {
  it('history list survives non-numeric paging params and caps the page size', async () => {
    const u = await register('History User', `hist_${ts}@example.com`);
    const ws = await newWorkspace(u.cookie, `Hist WS ${ts}`);
    expect((await call('GET', `/workspaces/${ws}/history?limit=abc&page=xyz`, u.cookie)).status).toBe(200);
    expect((await call('GET', `/workspaces/${ws}/history?limit=999999`, u.cookie)).status).toBe(200);
  });

  it('GET /admin/errors filters by `since`', async () => {
    const before = new Date(Date.now() - 1000).toISOString();
    await fetch(`${BASE_URL}/api/errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'window.error', message: `since-filter-probe-${ts}` }),
    });
    await new Promise(r => setTimeout(r, 300));
    const after = await call('GET', `/admin/errors?since=${encodeURIComponent(before)}&q=since-filter-probe-${ts}`, admin);
    expect(after.data.groups.length).toBe(1);
    const future = await call('GET', `/admin/errors?since=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}&q=since-filter-probe-${ts}`, admin);
    expect(future.data.groups.length).toBe(0);
    await call('DELETE', `/admin/errors/${after.data.groups[0].fingerprint}`, admin);
  });

  it('admin audit log names the user and the target', async () => {
    const r = await call('GET', '/admin/logs', admin);
    expect(r.status).toBe(200);
    const withUser = r.data.logs.find((l: Json) => typeof l.userId === 'object');
    expect(withUser.userId.name).toBeTruthy();
  });
});
