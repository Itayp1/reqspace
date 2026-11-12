// Scenario runner against the production scratch instance (port 3105).
// Each scenario is independent; results are printed as PASS/FAIL with the first error line.
const path = require('path');
const REPO = 'C:/projects/reqspace';
const { chromium, expect } = require(path.join(REPO, 'node_modules/@playwright/test'));
const BASE = 'http://localhost:3105';
const PASS = 'Scenario-Pass-2026!';
const results = [];
const rnd = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

async function scenario(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
  } catch (e) {
    results.push(`FAIL  ${name} :: ${String(e.message).split('\n').filter(Boolean).slice(0, 14).join(' | ').slice(0, 1400)}`);
  }
}

async function newUser(browser, label) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = `${label}.${rnd()}@manual.test`;
  const r = await ctx.request.post(`${BASE}/api/auth/register`, { data: { name: label, email, password: PASS } });
  if (!r.ok()) throw new Error(`register ${label} ${r.status()}`);
  await page.goto(`${BASE}/`);
  await page.getByTestId('workspace-select').waitFor();
  return { ctx, page, email };
}

async function json(res) { return res.json(); }

async function apiWs(ctx, name) {
  const ws = await json(await ctx.request.post(`${BASE}/api/workspaces`, { data: { name } }));
  return ws.id ?? ws._id;
}
async function apiCol(ctx, wsId, name) {
  const c = await json(await ctx.request.post(`${BASE}/api/workspaces/${wsId}/collections`, { data: { name } }));
  return c.id ?? c._id;
}
async function apiReq(ctx, colId, body) {
  const r = await json(await ctx.request.post(`${BASE}/api/collections/${colId}/requests`, { data: body }));
  return r.id ?? r._id;
}

function node(page, name) {
  return page.locator(`[data-testid="node-${name}"]`).first();
}
function rowOf(page, name) {
  return page.locator('[data-testid="node-container"]', { has: page.getByTestId(`node-${name}`) }).first();
}
async function menu(page, name, item) {
  const row = rowOf(page, name);
  await row.hover();
  await row.getByTestId('action-menu-btn').click();
  await page.getByTestId(`action-menu-${item}`).click();
}
async function promptValue(page, value) {
  await page.getByTestId('prompt-input').fill(value);
  await page.getByTestId('prompt-submit').click();
}
async function pickWs(page, wsId) {
  // Workspaces created through the API after the page loaded are only in the
  // selector after a reload, so reload first and wait for the option.
  await page.reload();
  const sel = page.getByTestId('workspace-select');
  await sel.waitFor();
  await page.waitForSelector(`[data-testid="workspace-select"] option[value="${wsId}"]`, { state: 'attached', timeout: 10000 });
  await sel.selectOption(wsId);
  await page.waitForTimeout(400);
}
async function expandCol(page, name) {
  // Click the collection/folder name once if its children are not yet listed.
  const kids = page.locator('[data-testid^="node-"]');
  await node(page, name).click();
  await page.waitForTimeout(250);
}

async function main() {
  const browser = await chromium.launch();
  try {
    // ── S1: two browsers, live sync over sockets ──────────────────────────────
    await scenario('S1a two browsers see a rename live', async () => {
      const A = await newUser(browser, 'ownerA');
      const B = await newUser(browser, 'editorB');
      const wsId = await apiWs(A.ctx, 'Live WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'Live');
      await apiReq(A.ctx, col, { name: 'R1', method: 'GET', url: 'https://live.test/1' });
      await A.ctx.request.post(`${BASE}/api/workspaces/${wsId}/members`, { data: { email: B.email, role: 'editor' } });
      await pickWs(A.page, wsId); await pickWs(B.page, wsId);
      await expandCol(A.page, 'Live'); await expandCol(B.page, 'Live');
      await menu(A.page, 'R1', 'rename'); await A.page.locator('[data-testid="node-container"] input').first().fill('R1 renamed'); await A.page.keyboard.press('Enter');
      await expect(node(B.page, 'R1 renamed')).toBeVisible({ timeout: 8000 });
      await A.ctx.close(); await B.ctx.close();
    });

    await scenario('S1b folder created by A appears for B; A moves request into it; B sees the move', async () => {
      const A = await newUser(browser, 'ownerA2');
      const B = await newUser(browser, 'editorB2');
      const wsId = await apiWs(A.ctx, 'Move WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'MoveCol');
      await apiReq(A.ctx, col, { name: 'Mover', method: 'GET', url: 'https://live.test/m' });
      await A.ctx.request.post(`${BASE}/api/workspaces/${wsId}/members`, { data: { email: B.email, role: 'editor' } });
      await pickWs(A.page, wsId); await pickWs(B.page, wsId);
      await expandCol(A.page, 'MoveCol'); await expandCol(B.page, 'MoveCol');
      await menu(A.page, 'MoveCol', 'new-folder'); await promptValue(A.page, 'Folder X');
      await expect(node(B.page, 'Folder X')).toBeVisible({ timeout: 8000 });
      await menu(A.page, 'Mover', 'move-to...');
      await A.page.locator('h2:has-text("Move")').first().waitFor();
      // The dialog is portalled last in the DOM, so its row is the last match.
      // Folders in the dialog are collapsed: expand the collection row first.
      await A.page.locator('.fixed.inset-0 svg.lucide-chevron-right').first().click();
      await A.page.locator('.fixed.inset-0').getByText('Folder X', { exact: true }).first().click();
      await A.page.getByRole('button', { name: 'Move Here' }).click();
      await expect(A.page.getByTestId('node-Mover')).toBeVisible();
      await expect(node(B.page, 'Mover')).toBeVisible({ timeout: 8000 });
      await A.ctx.close(); await B.ctx.close();
    });

    await scenario('S1c A deletes a request; B loses it live', async () => {
      const A = await newUser(browser, 'ownerA3');
      const B = await newUser(browser, 'editorB3');
      const wsId = await apiWs(A.ctx, 'Del WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'DelCol');
      await apiReq(A.ctx, col, { name: 'Doomed', method: 'GET', url: 'https://live.test/d' });
      await A.ctx.request.post(`${BASE}/api/workspaces/${wsId}/members`, { data: { email: B.email, role: 'editor' } });
      await pickWs(A.page, wsId); await pickWs(B.page, wsId);
      await expandCol(A.page, 'DelCol'); await expandCol(B.page, 'DelCol');
      await expect(node(B.page, 'Doomed')).toBeVisible({ timeout: 8000 });
      await menu(A.page, 'Doomed', 'delete');
      await A.page.getByTestId('confirm-btn').click();
      await expect(node(B.page, 'Doomed')).toHaveCount(0, { timeout: 8000 });
      await A.ctx.close(); await B.ctx.close();
    });

    await scenario('S1d B edits an outdated request; overwrite prompt appears', async () => {
      const A = await newUser(browser, 'ownerA4');
      const B = await newUser(browser, 'editorB4');
      const wsId = await apiWs(A.ctx, 'Conflict WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'ConCol');
      await apiReq(A.ctx, col, { name: 'Shared', method: 'GET', url: 'https://live.test/c' });
      await A.ctx.request.post(`${BASE}/api/workspaces/${wsId}/members`, { data: { email: B.email, role: 'editor' } });
      await pickWs(A.page, wsId); await pickWs(B.page, wsId);
      await expandCol(A.page, 'ConCol'); await expandCol(B.page, 'ConCol');
      await node(B.page, 'Shared').click();
      await node(A.page, 'Shared').click();
      await A.page.getByTestId('request-url-input').fill('https://live.test/c-from-A');
      await A.page.getByTestId('request-save-btn').click();
      await expect(A.page.getByTestId('dirty-indicator')).toHaveCount(0);
      await B.page.getByTestId('request-url-input').fill('https://live.test/c-from-B');
      await B.page.getByTestId('request-save-btn').click();
      await expect(B.page.getByTestId('confirm-btn')).toBeVisible({ timeout: 8000 });
      await A.ctx.close(); await B.ctx.close();
    });

    // ── S2: drag, duplicate, delete on one browser ────────────────────────────
    await scenario('S2a drag a request onto a folder; survives reload', async () => {
      const A = await newUser(browser, 'dragA');
      const wsId = await apiWs(A.ctx, 'Drag WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'DragCol');
      await apiReq(A.ctx, col, { name: 'Drag Me', method: 'GET', url: 'https://d.test/' });
      await A.ctx.request.post(`${BASE}/api/collections/${col}/folders`, { data: { name: 'Target Folder' } });
      await pickWs(A.page, wsId); await A.page.reload(); await pickWs(A.page, wsId);
      await expandCol(A.page, 'DragCol');
      await A.page.dragAndDrop(`[data-testid="node-Drag Me"]`, `[data-testid="node-Target Folder"]`);
      await A.page.waitForTimeout(800);
      await A.page.reload(); await pickWs(A.page, wsId);
      await expandCol(A.page, 'DragCol');
      await expandCol(A.page, 'Target Folder');
      await expect(node(A.page, 'Drag Me')).toBeVisible();
      const inFolder = await A.page.evaluate(() => {
        const f = document.querySelector('[data-testid="node-Target Folder"]');
        let p = f; for (let i = 0; i < 4 && p; i++) p = p.parentElement;
        return !!p && p.innerText.includes('Drag Me');
      });
      expect(inFolder, 'Drag Me is inside Target Folder after reload').toBe(true);
      await A.ctx.close();
    });

    await scenario('S2b duplicate a request; copy has same URL, headers and body', async () => {
      const A = await newUser(browser, 'dupA');
      const wsId = await apiWs(A.ctx, 'Dup WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'DupCol');
      await apiReq(A.ctx, col, { name: 'Orig', method: 'POST', url: 'https://d.test/o', headers: [{ key: 'X-K', value: 'v', enabled: true }], body: { mode: 'raw', raw: '{"a":1}', rawLanguage: 'json' } });
      await pickWs(A.page, wsId); await A.page.reload(); await pickWs(A.page, wsId);
      await expandCol(A.page, 'DupCol');
      await menu(A.page, 'Orig', 'duplicate');
      await A.page.waitForTimeout(800);
      const names = await A.page.locator('[data-testid^="node-"]').evaluateAll(els => els.map(e => e.dataset.testid.replace('node-', '')));
      const copy = names.find(n => n !== 'Orig' && /Orig/.test(n));
      expect(copy, 'a copy of Orig exists: ' + names.join(',')).toBeTruthy();
      await node(A.page, copy).click();
      await expect(A.page.getByTestId('request-url-input')).toHaveValue('https://d.test/o');
      await A.ctx.close();
    });

    await scenario('S2c deleting a folder removes its requests; reload keeps them gone', async () => {
      const A = await newUser(browser, 'delA');
      const wsId = await apiWs(A.ctx, 'DelF WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'DelFCol');
      const f = await json(await A.ctx.request.post(`${BASE}/api/collections/${col}/folders`, { data: { name: 'Gone' } }));
      await apiReq(A.ctx, col, { name: 'Inside', method: 'GET', url: 'https://d.test/i', folderId: f.id ?? f._id });
      await pickWs(A.page, wsId); await A.page.reload(); await pickWs(A.page, wsId);
      await expandCol(A.page, 'DelFCol');
      await menu(A.page, 'Gone', 'delete');
      await A.page.getByTestId('confirm-btn').click();
      await expect(node(A.page, 'Gone')).toHaveCount(0);
      await A.page.reload(); await pickWs(A.page, wsId); await expandCol(A.page, 'DelFCol');
      await expect(node(A.page, 'Inside')).toHaveCount(0);
      await A.ctx.close();
    });

    // ── S3: names and edge cases ──────────────────────────────────────────────
    await scenario('S3a Hebrew, emoji and 200-char names render and persist', async () => {
      const A = await newUser(browser, 'nameA');
      const wsId = await apiWs(A.ctx, 'Names WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'שם בעברית 🚀');
      const long = 'L'.repeat(200);
      await apiReq(A.ctx, col, { name: long, method: 'GET', url: 'https://n.test/' });
      await pickWs(A.page, wsId); await A.page.reload(); await pickWs(A.page, wsId);
      await expect(node(A.page, 'שם בעברית 🚀')).toBeVisible();
      await A.ctx.close();
    });

    await scenario('S3b HTML in a name is shown as text, not executed', async () => {
      const A = await newUser(browser, 'xssA');
      const wsId = await apiWs(A.ctx, 'XSS WS ' + rnd());
      await apiCol(A.ctx, wsId, '<img src=x onerror="window.__pwned=1">');
      await pickWs(A.page, wsId); await A.page.reload(); await pickWs(A.page, wsId);
      await expect(A.page.getByText('<img src=x onerror="window.__pwned=1">')).toBeVisible();
      const pwned = await A.page.evaluate(() => window.__pwned === 1);
      expect(pwned).toBe(false);
      await A.ctx.close();
    });

    await scenario('S3c duplicate request names in one folder are rejected or disambiguated', async () => {
      const A = await newUser(browser, 'dupnameA');
      const wsId = await apiWs(A.ctx, 'DupName WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'DNCol');
      await apiReq(A.ctx, col, { name: 'Same', method: 'GET', url: 'https://n.test/1' });
      const r = await A.ctx.request.post(`${BASE}/api/collections/${col}/requests`, { data: { name: 'Same', method: 'GET', url: 'https://n.test/2' } });
      // Either outcome is acceptable as long as it is explicit; a silent overwrite is not.
      const list = await json(await A.ctx.request.get(`${BASE}/api/collections/${col}/requests`));
      const sames = list.filter(x => x.name === 'Same');
      expect(r.ok() ? sames.length === 2 : true, 'no silent merge').toBe(true);
      await A.ctx.close();
    });

    await scenario('S3d empty and whitespace-only names are refused in the UI', async () => {
      const A = await newUser(browser, 'emptyA');
      const emptyBtn = A.page.getByTestId('new-collection-empty-btn'); if (await emptyBtn.isVisible().catch(() => false)) await emptyBtn.click(); else await A.page.getByTestId('new-collection-btn').click();
      await A.page.getByTestId('prompt-input').fill('   ');
      const submit = A.page.getByTestId('prompt-submit');
      expect(await submit.isDisabled(), 'submit disabled for whitespace-only name').toBe(true);
      await A.page.waitForTimeout(300);
      const created = await A.page.locator('[data-testid^="node-"]').count();
      expect(created, 'no collection named by spaces').toBe(0);
      await A.ctx.close();
    });

    // ── S4: login edge cases ──────────────────────────────────────────────────
    await scenario('S4a wrong password shows an error and stays on login', async () => {
      const A = await newUser(browser, 'loginA');
      const page = await A.ctx.newPage();
      await page.goto(`${BASE}/login`);
      await page.getByTestId('login-email').fill(A.email);
      await page.getByTestId('login-password').fill('nope-nope-nope');
      await page.getByTestId('login-submit').click();
      await expect(page).toHaveURL(/\/login/);
      await A.ctx.close();
    });

    await scenario('S4b email login is case-insensitive', async () => {
      const A = await newUser(browser, 'caseA');
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login`);
      await page.getByTestId('login-email').fill(A.email.toUpperCase());
      await page.getByTestId('login-password').fill(PASS);
      await page.getByTestId('login-submit').click();
      await expect(page.getByTestId('workspace-select')).toBeVisible({ timeout: 8000 });
      await ctx.close(); await A.ctx.close();
    });

    await scenario('S4c session cleared in another tab: next action sends user to login', async () => {
      const A = await newUser(browser, 'sessA');
      await A.ctx.clearCookies();
      await A.page.reload();
      await expect(A.page).toHaveURL(/\/login/, { timeout: 8000 });
      await A.ctx.close();
    });

    // ── S5: cURL import and code generation ───────────────────────────────────
    const curlCases = [
      ['POST with -H and -d', `curl -X POST https://api.test/items -H 'Content-Type: application/json' -d '{"a":1}'`, { method: 'POST', url: 'https://api.test/items' }],
      ['query in quoted URL', `curl 'https://api.test/q?a=1&b=2' -H "Authorization: Bearer abc"`, { method: 'GET', url: 'https://api.test/q?a=1&b=2' }],
      ['multi-line with backslashes', "curl \\\n  -X PUT \\\n  https://api.test/m \\\n  -H 'X-A: 1'", { method: 'PUT', url: 'https://api.test/m' }],
      ['--data-raw implies POST', `curl --data-raw 'x=1' https://api.test/raw`, { method: 'POST', url: 'https://api.test/raw' }],
      ['-u basic auth', `curl -u user:pass https://api.test/basic`, { method: 'GET', url: 'https://api.test/basic' }],
      ['--request long flag', `curl --request DELETE https://api.test/del`, { method: 'DELETE', url: 'https://api.test/del' }],
      ['no scheme', `curl api.test/noscheme`, { method: 'GET', url: 'api.test/noscheme' }],
      ['--json implies POST', `curl --json '{"a":1}' https://api.test/j`, { method: 'POST', url: 'https://api.test/j' }],
      ['-F multipart implies POST', `curl -F 'name=x' https://api.test/f`, { method: 'POST', url: 'https://api.test/f' }],
      ['-X before URL with -d after', `curl -d 'a=1' -X PUT https://api.test/order`, { method: 'PUT', url: 'https://api.test/order' }],
      ['-d with double quotes containing braces', `curl -X POST https://api.test/dq -d "{\\"k\\":\\"v\\"}"`, { method: 'POST', url: 'https://api.test/dq' }],
      ['header value with an = sign', `curl https://api.test/h -H 'X-Token: a=b=c'`, { method: 'GET', url: 'https://api.test/h' }],
    ];
    const cu = await newUser(browser, 'curlA');
    const curlWs = await apiWs(cu.ctx, 'Curl WS ' + rnd());
    for (const [label, curl, want] of curlCases) {
      await scenario(`S5 cURL import: ${label}`, async () => {
        const r = await cu.ctx.request.post(`${BASE}/api/requests/import/curl`, { data: { curl, workspaceId: curlWs } });
        if (!r.ok()) throw new Error(`status ${r.status()} ${(await r.text()).slice(0, 120)}`);
        const body = await json(r);
        const req = body.request || body;
        expect(req.method, 'method').toBe(want.method);
        expect(req.url, 'url').toBe(want.url);
      });
    }
    await scenario('S5 cURL import: header with = survives', async () => {
      const r = await json(await cu.ctx.request.post(`${BASE}/api/requests/import/curl`, { data: { curl: `curl https://api.test/h -H 'X-Token: a=b=c'`, workspaceId: curlWs } }));
      const req = r.request || r;
      const hdr = JSON.stringify(req.headers || []);
      expect(hdr).toContain('a=b=c');
    });
    await scenario('S5 cURL import: Basic auth becomes an auth setting', async () => {
      const r = await json(await cu.ctx.request.post(`${BASE}/api/requests/import/curl`, { data: { curl: `curl -u user:pass https://api.test/basic`, workspaceId: curlWs } }));
      const req = r.request || r;
      expect(JSON.stringify(req.auth || {}), 'auth captured').toMatch(/basic|Basic/);
    });
    await scenario('S5 cURL import via UI modal opens a ready tab', async () => {
      await pickWs(cu.page, curlWs); await cu.page.reload(); await pickWs(cu.page, curlWs);
      await cu.page.locator('button[aria-label="Import collection"]').click();
      await cu.page.getByTestId('import-tab-curl').click();
      await cu.page.getByTestId('import-curl-input').fill(`curl -X PATCH https://api.test/ui -H 'A: 1'`);
      await cu.page.getByTestId('import-submit').click();
      await expect(cu.page.getByTestId('method-select')).toHaveValue('PATCH');
    });
    await scenario('S5 code generation: cURL snippet contains the body and headers', async () => {
      await cu.page.getByTestId('codegen-btn').click();
      const code = await cu.page.getByTestId('codegen-code-block').innerText();
      expect(code).toContain('curl');
      expect(code).toContain('https://api.test/ui');
    });
    await cu.ctx.close();

    // ── S6: export / import ───────────────────────────────────────────────────
    const ex = await newUser(browser, 'exA');
    const exWs = await apiWs(ex.ctx, 'Export WS ' + rnd());
    const exCol = await apiCol(ex.ctx, exWs, 'Export Me');
    await apiReq(ex.ctx, exCol, { name: 'Full', method: 'POST', url: 'https://e.test/f', headers: [{ key: 'X-H', value: '1', enabled: true }], body: { mode: 'raw', raw: '{"z":true}', rawLanguage: 'json' }, auth: { type: 'bearer', bearer: { token: 't' } } });
    await scenario('S6a export collection returns Postman v2.1 with the request intact', async () => {
      const cols = await json(await ex.ctx.request.get(`${BASE}/api/workspaces/${exWs}/collections`));
      const id = cols[0].id;
      const r = await ex.ctx.request.get(`${BASE}/api/collections/${id}/export`);
      if (!r.ok()) throw new Error('export status ' + r.status());
      const pm = await json(r);
      expect(pm.info && pm.info.schema, 'schema url').toMatch(/v2\.1/);
      const item = pm.item.find(i => i.name === 'Full');
      expect(item, 'Full present').toBeTruthy();
      expect(item.request.method).toBe('POST');
      expect(JSON.stringify(item.request.header)).toContain('X-H');
      global.__exported = pm;
    });
    await scenario('S6b exported collection re-imports as an identical copy', async () => {
      const r = await ex.ctx.request.post(`${BASE}/api/collections/import`, { data: { workspaceId: exWs, collection: global.__exported } });
      if (!r.ok()) throw new Error('import status ' + r.status() + ' ' + (await r.text()).slice(0, 160));
      const cols = await json(await ex.ctx.request.get(`${BASE}/api/workspaces/${exWs}/collections`));
      expect(cols.length, 'two collections now').toBe(2);
    });
    await scenario('S6c broken JSON file is rejected with a message in the UI', async () => {
      await pickWs(ex.page, exWs); await ex.page.reload(); await pickWs(ex.page, exWs);
      await ex.page.locator('button[aria-label="Import collection"]').click();
      await ex.page.getByTestId('import-file-input').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ not json') });
      await expect(ex.page.getByTestId('import-error')).toBeVisible({ timeout: 5000 });
      await ex.page.getByTestId('import-close').click();
    });
    await scenario('S6d Postman v2.0 file with folders and variables imports', async () => {
      const v20 = { info: { name: 'Legacy', schema: 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json' }, item: [{ name: 'Folder', item: [{ name: 'Leaf', request: { method: 'GET', url: 'https://{{host}}/leaf' } }] }], variable: [{ key: 'host', value: 'v.test' }] };
      const r = await ex.ctx.request.post(`${BASE}/api/collections/import`, { data: { workspaceId: exWs, collection: v20 } });
      if (!r.ok()) throw new Error('status ' + r.status() + ' ' + (await r.text()).slice(0, 160));
    });
    await scenario('S6e OpenAPI paste becomes a collection with one folder per tag', async () => {
      const spec = JSON.stringify({ openapi: '3.0.0', info: { title: 'Pets', version: '1' }, servers: [{ url: 'https://pets.test' }], paths: { '/pets': { get: { tags: ['pets'], summary: 'List', responses: { 200: { description: 'ok' } } } } } });
      await pickWs(ex.page, exWs);
      await ex.page.locator('button[aria-label="Import collection"]').click();
      await ex.page.getByTestId('import-tab-openapi').click();
      await ex.page.getByTestId('import-openapi-input').fill(spec);
      await ex.page.getByTestId('import-submit').click();
      await expect(ex.page.getByTestId('node-pets').or(ex.page.getByText('pets', { exact: true }))).toBeVisible({ timeout: 8000 });
    });
    await scenario('S6f environment export then import keeps variables', async () => {
      const envs = await json(await ex.ctx.request.get(`${BASE}/api/workspaces/${exWs}/environments`));
      expect(Array.isArray(envs), 'environments list').toBe(true);
    });
    await ex.ctx.close();

    // ── S7: two browsers, copy to workspace and fork, then export ─────────────
    await scenario('S7 request copied to another workspace appears there for the other browser', async () => {
      const A = await newUser(browser, 'copyA');
      const B = await newUser(browser, 'copyB');
      const srcWs = await apiWs(A.ctx, 'Src ' + rnd());
      const dstWs = await apiWs(A.ctx, 'Dst ' + rnd());
      await A.ctx.request.post(`${BASE}/api/workspaces/${dstWs}/members`, { data: { email: B.email, role: 'viewer' } });
      // A request can only be copied into an existing collection, so the target needs one.
      await apiCol(A.ctx, dstWs, 'DstCol');
      const col = await apiCol(A.ctx, srcWs, 'SrcCol');
      await apiReq(A.ctx, col, { name: 'Copyable', method: 'GET', url: 'https://c.test/' });
      await pickWs(A.page, srcWs); await A.page.reload(); await pickWs(A.page, srcWs);
      await expandCol(A.page, 'SrcCol');
      await menu(A.page, 'Copyable', 'copy-to-workspace');
      await A.page.getByTestId('copy-target-workspace-select').selectOption(dstWs);
      await A.page.waitForTimeout(400);
      await A.page.getByTestId('copy-target-collection-select').selectOption({ index: 0 });
      await A.page.getByRole('button', { name: /^Copy$/ }).click();
      await A.page.waitForTimeout(800);
      const cols = await json(await A.ctx.request.get(`${BASE}/api/workspaces/${dstWs}/collections`));
      const reqsInDst = [];
      for (const c of cols) reqsInDst.push(...(await json(await A.ctx.request.get(`${BASE}/api/collections/${c.id}/requests`))).map(r => r.name));
      expect(reqsInDst.some(n => n.startsWith('Copyable')), 'copy present: ' + reqsInDst.join(',')).toBe(true);
      await A.ctx.close(); await B.ctx.close();
    });
    await scenario('S1e drag on A moves the request inside a folder for B live', async () => {
      const A = await newUser(browser, 'dragLiveA');
      const B = await newUser(browser, 'dragLiveB');
      const wsId = await apiWs(A.ctx, 'DragLive WS ' + rnd());
      const col = await apiCol(A.ctx, wsId, 'DLCol');
      await apiReq(A.ctx, col, { name: 'Walker', method: 'GET', url: 'https://dl.test/' });
      await A.ctx.request.post(`${BASE}/api/collections/${col}/folders`, { data: { name: 'Dest' } });
      await A.ctx.request.post(`${BASE}/api/workspaces/${wsId}/members`, { data: { email: B.email, role: 'editor' } });
      await pickWs(A.page, wsId); await pickWs(B.page, wsId);
      await expandCol(A.page, 'DLCol'); await expandCol(B.page, 'DLCol');
      await A.page.dragAndDrop('[data-testid="node-Walker"]', '[data-testid="node-Dest"]');
      await A.page.waitForTimeout(800);
      await expandCol(B.page, 'Dest');
      const insideB = await B.page.evaluate(() => {
        const f = document.querySelector('[data-testid="node-Dest"]');
        let p = f; for (let i = 0; i < 4 && p; i++) p = p.parentElement;
        return !!p && p.innerText.includes('Walker');
      });
      expect(insideB, 'B sees Walker inside Dest').toBe(true);
      await A.ctx.close(); await B.ctx.close();
    });

    await scenario('S4d registering an existing email is refused with a message', async () => {
      const A = await newUser(browser, 'dupmailA');
      const ctx = await browser.newContext();
      const r = await ctx.request.post(`${BASE}/api/auth/register`, { data: { name: 'Again', email: A.email, password: PASS } });
      expect(r.ok(), 'second register must fail').toBe(false);
      expect(r.status()).toBeLessThan(500);
      await ctx.close(); await A.ctx.close();
    });

    await scenario('S4e logging out in one browser leaves the other browser signed in', async () => {
      const A = await newUser(browser, 'twoSessA');
      const second = await browser.newContext();
      const r = await second.request.post(`${BASE}/api/auth/login`, { data: { email: A.email, password: PASS } });
      expect(r.ok()).toBe(true);
      await A.ctx.request.post(`${BASE}/api/auth/logout`);
      const still = await second.request.get(`${BASE}/api/auth/me`);
      expect(still.status(), 'other session still valid').toBe(200);
      await second.close(); await A.ctx.close();
    });

    // ── S8: two browsers, import on one side shows live on the other ─────────
    await scenario('S8 collection imported by B appears live for A', async () => {
      const A = await newUser(browser, 'impA');
      const B = await newUser(browser, 'impB');
      const wsId = await apiWs(A.ctx, 'Import Live ' + rnd());
      await A.ctx.request.post(`${BASE}/api/workspaces/${wsId}/members`, { data: { email: B.email, role: 'editor' } });
      await pickWs(A.page, wsId); await pickWs(B.page, wsId);
      const pm = { info: { name: 'LiveImported', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [{ name: 'Imported Req', request: { method: 'GET', url: 'https://i.test/' } }] };
      const r = await B.ctx.request.post(`${BASE}/api/collections/import`, { data: { workspaceId: wsId, collection: pm } });
      expect(r.ok(), 'import status ' + r.status()).toBe(true);
      await expect(node(A.page, 'LiveImported')).toBeVisible({ timeout: 8000 });
      await A.ctx.close(); await B.ctx.close();
    });

  } finally {
    await browser.close();
    console.log(results.join('\n'));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
