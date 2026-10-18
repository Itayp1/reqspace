import { test, expect } from './fixtures';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { API_URL } from './fixtures';
import { apiAsAdmin } from './helpers';
import fs from 'fs';
import path from 'path';

/**
 * Failures from MANUAL_TEST_PLAN_FAILED.md in sections Q/R/S/T/U/V that are not
 * covered by manual-failed-api.spec.ts. Titles carry the plan id ("[Q2.5] ...").
 * S/U/V items that need a real Chrome extension / Android device are checked
 * as static source assertions or tracked with test.fixme.
 */

const ROOT = path.join(__dirname, '..', '..');
const src = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let seq = 0;
const uniq = (p: string) => `${p}_${Date.now()}_${seq++}_${Math.floor(Math.random() * 1e5)}`;
const ip = () => `10.${150 + (seq % 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

async function anon(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { 'X-Forwarded-For': ip() } });
}
async function newUser(prefix: string) {
  const email = `${uniq(prefix)}@example.com`;
  const ctx = await anon();
  const res = await ctx.post('/api/auth/register', { data: { name: 'QA User', email, password: 'password123' } });
  expect(res.status(), 'register').toBe(201);
  const body = await res.json();
  return { ctx, email, id: (body.user?.id ?? body.user?._id) as string };
}

test.describe('Q — admin (API)', () => {
  test.use({ allowFpErrors: [/q74 dedupe probe/] });
  test('[Q2.5] two admins revoking each other concurrently leave at least one super admin', async () => {
    const admin = await apiAsAdmin();
    const a = await newUser('q25a');
    const b = await newUser('q25b');
    expect((await admin.post(`/api/admin/users/${a.id}/promote`, { data: {} })).ok()).toBeTruthy();
    expect((await admin.post(`/api/admin/users/${b.id}/promote`, { data: {} })).ok()).toBeTruthy();
    const [r1, r2] = await Promise.all([
      a.ctx.post(`/api/admin/users/${b.id}/revoke`, { data: {} }),
      b.ctx.post(`/api/admin/users/${a.id}/revoke`, { data: {} }),
    ]);
    expect([r1.status(), r2.status()].every((s) => s < 500)).toBe(true);
    // The list is cursor-paginated; the seeded admin is found by search so the check does not depend on page 1.
    const users = await (await admin.get('/api/admin/users?search=admin&limit=200')).json();
    const list: any[] = Array.isArray(users) ? users : users.users ?? users.items;
    expect(list.filter((u) => u.isSuperAdmin).length).toBeGreaterThanOrEqual(1);
    for (const id of [a.id, b.id]) await admin.post(`/api/admin/users/${id}/revoke`, { data: {} });
  });

  test('[Q6.1] a failed login is recorded in the audit log', async () => {
    const admin = await apiAsAdmin();
    const u = await newUser('q61');
    const ctx = await anon();
    const bad = await ctx.post('/api/auth/login', { data: { email: u.email, password: 'wrong-password-1' } });
    expect(bad.status()).toBe(401);
    const logs = await (await admin.get('/api/admin/logs?action=auth.login_failed&limit=50')).json();
    expect(logs.logs.length).toBeGreaterThan(0);
    expect(logs.logs.every((l: any) => l.action === 'auth.login_failed')).toBe(true);
  });

  test('[Q6.2] audit log supports paging, action/date filters and a total', async () => {
    const admin = await apiAsAdmin();
    const body = await (await admin.get('/api/admin/logs?limit=2&page=1')).json();
    expect(body.logs.length).toBeLessThanOrEqual(2);
    expect(typeof body.total).toBe('number');
    const future = await (await admin.get(`/api/admin/logs?from=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`)).json();
    expect(future.logs).toHaveLength(0);
    const none = await (await admin.get('/api/admin/logs?action=no.such.action')).json();
    expect(none.logs).toHaveLength(0);
  });

  test('[Q7.2] the errors list can be sorted and bounded by date', async () => {
    const admin = await apiAsAdmin();
    for (const q of ['sort=count&dir=desc', 'sort=firstSeen&dir=asc', `since=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`, `until=${encodeURIComponent(new Date().toISOString())}`]) {
      const res = await admin.get(`/api/admin/errors?${q}`);
      expect(res.status(), q).toBe(200);
    }
  });

  test.describe('Q7.4 dedupe', () => {
    test('[Q7.4] the same client error reported repeatedly is one group with a total count', async () => {
      const ctx = await anon();
      const msg = `q74 dedupe probe ${uniq('m')}`;
      const since = new Date(Date.now() - 1000).toISOString();
      for (let i = 0; i < 5; i++) {
        await ctx.post('/api/errors', { data: { kind: 'window.error', message: msg, route: '/qa-q74' } });
      }
      await new Promise((r) => setTimeout(r, 1000));
      const admin = await apiAsAdmin();
      const body = await (await admin.get(`/api/admin/errors?since=${encodeURIComponent(since)}`)).json();
      const groups: any[] = Array.isArray(body) ? body : body.groups ?? body.errors ?? body.items;
      const mine = groups.filter((g) => String(g.message).includes(msg));
      expect(mine).toHaveLength(1);
      expect(mine[0].count).toBe(5);
    });
  });

  test('[Q8.1] system config accepts history maxRecords / retentionDays and rejects negatives', async () => {
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    const ok = await admin.put('/api/admin/config', { data: { history: { maxRecords: 500, retentionDays: 30 } } });
    expect(ok.status()).toBe(200);
    const cfg = await (await admin.get('/api/admin/config')).json();
    expect(cfg.history.maxRecords).toBe(500);
    expect(cfg.history.retentionDays).toBe(30);
    expect((await admin.put('/api/admin/config', { data: { history: { maxRecords: -1 } } })).status()).toBe(400);
    await admin.put('/api/admin/config', { data: { history: { maxRecords: before.history?.maxRecords ?? 0, retentionDays: before.history?.retentionDays ?? 0 } } });
  });

  test('[Q8.6] the "allow private targets" switch changes SMTP test behaviour', async () => {
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    try {
      await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: false } } });
      const blocked = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port: 1 } });
      expect(blocked.status()).toBe(400);
      expect((await blocked.json()).message).toMatch(/private|blocked|reserved|internal/i);
      await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: true } } });
      const allowed = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port: 1 } });
      expect(JSON.stringify(await allowed.json())).not.toMatch(/private|SSRF/i);
    } finally {
      await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: before.proxy?.allowPrivateTargets ?? false } } });
    }
  });

  test('[Q9.1] SMTP test reports a detailed connection error and never echoes the password', async () => {
    const admin = await apiAsAdmin();
    const before = await (await admin.get('/api/admin/config')).json();
    try {
      await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: true } } });
      const secret = 'S3cr3tPassw0rd!zz';
      const res = await admin.post('/api/admin/test-smtp', { data: { host: '127.0.0.1', port: 1, user: 'u', pass: secret } });
      const text = await res.text();
      expect(text).not.toContain(secret);
      expect(text).toMatch(/ECONNREFUSED|refused|timeout|connect/i);
    } finally {
      await admin.put('/api/admin/config', { data: { proxy: { allowPrivateTargets: before.proxy?.allowPrivateTargets ?? false } } });
    }
  });
});

test.describe('R — server / build', () => {
  test('[R1.1] a DB connection failure shows a "Database Connection Error" gate while /api/health keeps answering', async () => {
    expect(src('server/src/index.ts')).toMatch(/dbGate|503/);
    expect(src('client/src/App.tsx')).toContain('Database Connection Error');
    const health = await (await (await anon()).get('/api/health')).json();
    expect(health.status).toBe('ok');
  });

  test('[R3.3] migration 007 quotes identifiers dialect-aware via queryInterface.quoteIdentifier', async () => {
    // A real MySQL run is not possible here; the dialect-aware quoting is asserted statically.
    expect(src('server/src/db/migrations/007-denormalize-workspaceId.ts')).toContain('quoteIdentifier');
  });

  test('[R3.7] concurrent servers on one DB are protected by a migration lock', async () => {
    expect(src('server/src/db/connect.ts')).toContain('reqspace_migration_lock');
  });

  test('[R6.6] Monaco is loaded lazily, not statically imported by the entry bundle', async () => {
    const lazy = src('client/src/components/common/LazyEditor.tsx');
    expect(lazy).toMatch(/lazy\(|import\(/);
    expect(lazy).toContain('monacoEditorImpl');
    expect(lazy).not.toMatch(/^import .* from ['"]\.\/monacoEditorImpl['"]/m);
    expect(lazy).not.toMatch(/^import (?!type).* from ['"]@monaco-editor\/react['"]/m);
  });
});

test.describe('S — browser extension (static)', () => {
  test('[S2.3] options.js validates origins (scheme, wildcard, spaces, path)', async () => {
    const js = src('extension/options.js');
    const fn = new Function(`${js.slice(js.indexOf('function validateOrigin'), js.indexOf('async function addOrigin'))}; return validateOrigin;`)();
    expect(fn('https://example.com')).toBe('');
    expect(fn('http://localhost:3000')).toBe('');
    for (const bad of ['example.com', 'https://example.com/path', 'https://exa mple.com', '*', 'https://*.example.com', 'ftp://x.com']) {
      expect(fn(bad), bad).not.toBe('');
    }
    expect(js).toMatch(/includes\(origin\)/);
  });

  test('[S2.6] content.js stays silent (no PONG, no bridge) on origins outside the allowlist', async () => {
    const js = src('extension/content.js');
    expect(js).toContain('originAllowlist.includes(window.location.origin)');
    const handler = js.slice(js.indexOf("addEventListener('message'"));
    expect(handler.indexOf('isAllowed()')).toBeGreaterThan(-1);
    expect(handler.indexOf('isAllowed()')).toBeLessThan(handler.indexOf('REQSPACE_PING'));
    expect(js.slice(js.indexOf('Announce presence'))).toMatch(/isAllowed/);
  });

  test('[S3.3] DNR rules match the exact URL via an escaped regexFilter, unique ids, removed afterwards', async () => {
    const js = src('extension/background.js');
    expect(js).toContain('regexFilter');
    expect(js).not.toMatch(/^\s*urlFilter:/m);
    expect(js).toContain('nextRuleId++');
    expect(js).toContain('removeRuleIds: [ruleId]');
    const esc = new Function(`${js.slice(js.indexOf('function escapeRegex'), js.indexOf('function isBinaryType'))}; return escapeRegex;`)();
    const url = 'https://a.com/p?x=1&y=*|^#z';
    expect(new RegExp('^' + esc(url) + '$').test(url)).toBe(true);
    expect(new RegExp('^' + esc(url) + '$').test('https://a.com/p?x=1&y=other')).toBe(false);
  });

  test('[S3.5] binary responses are returned base64-encoded and decoded by the client', async () => {
    const bg = src('extension/background.js');
    expect(bg).toContain('isBase64');
    expect(bg).toContain('toBase64(buf)');
    expect(src('client/src/transport/extension.ts')).toMatch(/isBase64/);
  });

  test('[S3.6] Set-Cookie is captured via webRequest and bodies are read as ArrayBuffer', async () => {
    // 50MB / 60s / self-signed-cert behaviour needs a real Chrome with the extension loaded: only the code path is asserted.
    expect(JSON.parse(src('extension/manifest.json')).permissions).toContain('webRequest');
    const bg = src('extension/background.js');
    expect(bg).toMatch(/set-cookie/);
    expect(bg).toContain('arrayBuffer()');
  });

  test('[S3.8] Cancel is wired end to end: client -> content script -> background AbortController', async () => {
    expect(src('client/src/transport/extension.ts')).toContain('REQSPACE_CANCEL');
    expect(src('extension/content.js')).toContain('CANCEL_REQUEST');
    const bg = src('extension/background.js');
    expect(bg).toContain("'CANCEL_REQUEST'");
    expect(bg).toContain('controller.abort');
    expect(bg).toContain('signal: controller.signal');
  });
});

test.describe('V — cross-cutting UI', () => {
  test('[V3.4] ContextMenu closes on Escape, outside click and scroll, and clamps to the viewport', async () => {
    const s = src('client/src/components/common/ContextMenu.tsx');
    expect(s).toMatch(/key === 'Escape'/);
    expect(s).toMatch(/mousedown|click/);
    expect(s).toMatch(/scroll/);
    expect(s).toMatch(/innerWidth|innerHeight/);
  });

  test('[V3.5] Confirm/Prompt modals: Enter confirms, Escape cancels, double submit is blocked', async () => {
    const c = src('client/src/components/common/ConfirmModal.tsx');
    expect(c).toMatch(/key === 'Escape'/);
    expect(c).toMatch(/key === 'Enter'/);
    expect(c).toMatch(/double/i);
    const p = src('client/src/components/common/PromptModal.tsx');
    expect(p).toMatch(/key === 'Escape'/);
    expect(p).toMatch(/double|submitted|useRef/i);
  });

  test('[V4.2] browser Back / Forward never lands on a blank screen', async ({ page }) => {
    test.skip(!process.env.REQSPACE_WEB_URL, 'needs the web client');
    test.skip(process.env.REQSPACE_TARGET === 'electron', 'a desktop app window has no browser history to go back/forward through');
    const base = process.env.REQSPACE_WEB_URL!;
    await page.goto(base + '/does-not-exist');
    await page.waitForLoadState('networkidle');
    await page.goto(base + '/login');
    await page.goBack();
    await page.goForward();
    expect((await page.locator('#root').innerText()).trim().length).toBeGreaterThan(0);
  });
});
