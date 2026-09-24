# TODO — Reqspace

Execution plan. Written for someone who has **not** seen the codebase or the discussion behind it.

Every task has:

* **Goal** — what "working" means, in one sentence.
* **Where** — exact files and line numbers (verified 2026-09-24; re-check before editing).
* **Why** — the concrete failure. Never "best practice".
* **Steps** — numbered, ordered, small enough to commit one at a time.
* **Technical detail** — the actual code, index, query or command. Copy it, adapt names, verify it compiles.
* **Done when** — the test that proves it. No task is finished without one.

## Rules

1. **Do not invent scope.** If it is not in this file and not in [`IGNORE.md`](IGNORE.md), ask first.
2. **`IGNORE.md` is binding.** Do not build, plan or suggest anything listed there.
3. **Order:** `SEC` → `FIX` → `PERF` → `SOCK` → `TEST` → `UI` → `FEAT` → `CLEAN`. Within a section, top to bottom.
4. **One task per commit.** Commit message starts with the task id: `SEC-0.2: add client transport layer`.
5. **Every task ships a test that fails before the change and passes after.** Write the test first, watch it fail.
6. **No new `any`.** No new `import { X } from '../models/...'` outside `server/src/repositories/`.
7. **Delete the task from this file in the same commit that completes it.**

## Scale targets — these decide every design choice

| Entity | Target |
|---|---|
| Workspaces | 10,000 |
| Collections | 100,000 |
| Requests | 100,000+ (design headroom to 20M) |
| Concurrent sockets | 10,000 |

Rules of thumb that follow from those numbers:

* A query that is `O(total rows)` instead of `O(page size)` is a **defect**, not an optimisation.
* A list that renders one DOM node per row is a **defect** above ~200 rows.
* A socket event that triggers a refetch of anything larger than the changed item is a **defect**.
* A loop that issues one query per iteration is a **defect**. Batch it.

## Vocabulary

| Term | Meaning here |
|---|---|
| **Repository** | `server/src/repositories/*.ts`. The only place allowed to touch Mongoose or Sequelize. Every repository branches on `isMongo()` and returns a plain record type. |
| **The four backends** | sqlite, postgres, mysql, mongodb. Selected by `DB_TYPE`. |
| **Transport** | The thing that actually sends a user's HTTP request. After SEC-0 it is never the Reqspace server. |
| **Two-client test** | A test with two connected socket clients where the *observer* (which did not act) is the subject of the assertion. |

---

# SEC — Security

## SEC-0 — Delete the server-side proxy entirely

**Owner's decision:** the Reqspace server must never issue an HTTP request on a user's behalf. Request
sending belongs to the client.

This one change removes an entire class of vulnerability: the anonymous open proxy, all SSRF surface,
the proxy DoS vectors, the stored upstream-proxy credentials, and the server-side response-handling path.

### ⚠️ SEC-0.0 — Transport decision (read before touching any code)

A web page **cannot** send arbitrary cross-origin HTTP requests. CORS forbids custom headers and
non-simple methods unless the *target* server opts in — and the target is a third-party API we do not
control. Naively moving sending into `fetch()` inside the SPA means **most requests stop working**. This
is the reason every API client has a proxy, an agent or an extension.

| Option | Where the request is made | Works in a browser tab? | Cost |
|---|---|---|---|
| **A. Electron** | Electron main process, over IPC | n/a — desktop build | Smallest change. No CORS at all. |
| **B. Chrome extension** | MV3 service worker with `host_permissions` | ✅ | Per-browser build, store review, install friction. |
| **C. Local agent** | A small binary on `localhost` called by the SPA | ✅ | A new artifact to build, ship, update, document. |

**Decision: A + B.** Electron uses its main process; the web build talks to a Chrome extension
(SEC-0.7). C is documented as a future fallback and is **not** built now.

**Why the extension works:** an extension service worker granted `host_permissions` is not subject to the
page's CORS rules. It can `fetch` any origin, read the full body, and see response headers a page never
could. The page never makes the cross-origin call — it asks the extension to. The Reqspace **server**
still proxies nothing.

**Do not start SEC-0.1 until this decision is written at the top of the task.**

---

### SEC-0.1 — Inventory every server-side outbound call

* **Goal:** know exactly what is being deleted before deleting it.
* **Where:** `server/src/routes/proxy.ts`, `shareProxy.ts`, `capture.ts`, `importExport.ts`,
  `auth.ts`, `admin.ts`, `server/src/utils/ssrf.ts`

#### Steps

1. Run the inventory command below.
2. Classify every hit as **`move`** (the server acts on a user's behalf → must move to the client) or
   **`keep`** (the server acts as *itself* against a fixed, known host).
3. Paste the classified list into this task before proceeding.

#### Technical detail

```bash
grep -rn "undiciFetch\|await fetch(\|ProxyAgent\|createSafeLookup\|assertSsrfSafe\|soap\." server/src
```

Expected classification:

| Call site | Verdict | Reason |
|---|---|---|
| `routes/proxy.ts` — the whole file | **move** | This *is* the user proxy |
| `routes/shareProxy.ts` — the whole file | **move** (then delete) | Anonymous user proxy |
| `routes/capture.ts:140` `fetch(finalUrl, …)` | **move** | Forwards user traffic — see SEC-0.5 |
| `routes/importExport.ts:134` `soap.createClientAsync(url)` | **move** | Fetches a user-supplied WSDL URL |
| `routes/auth.ts:202,218` Google token + userinfo | **keep** | Server-to-Google, fixed hosts, server's own credentials |
| `routes/admin.ts` SMTP send | **keep** | Server-to-SMTP, admin-configured, not a user URL |

* **Done when:** the table above is filled in from real grep output and committed.

---

### SEC-0.2 — Build the client transport abstraction

* **Goal:** one module decides *how* a request goes out, so no UI component ever knows or cares.
* **Where:** new `client/src/transport/` — `types.ts`, `index.ts`, `electron.ts`, `extension.ts`, `browser.ts`
* **Current callers to migrate** (all four call `POST /api/proxy` today):
  * `client/src/components/request/UrlBar.tsx:250` — the main send button
  * `client/src/components/collection/CollectionRunnerModal.tsx:103` — the collection runner
  * `client/src/utils/scripts.ts:175` — `pm.sendRequest` inside user scripts
  * `client/src/components/request/LoadTestModal.tsx` — the load tester
  * `client/src/pages/SharedCollectionPage.tsx:19` — `executeRequest` on a public share page

#### Technical detail — the contract

Create `client/src/transport/types.ts` with **exactly** the shape the existing code already builds
(copied from `UrlBar.tsx:250-258`) so the migration is mechanical:

```ts
export interface OutboundRequest {
  method: string;                       // 'GET' | 'POST' | ...
  url: string;                          // already variable-resolved by the caller
  headers: Record<string, string>;
  body?: string | FormDataPayload | undefined;
  followRedirects: boolean;
  verifySsl: boolean;
  timeout: number;                      // ms; 0 is NOT allowed — see FEAT-9
  maxResponseBytes: number;             // FEAT-9
  clientCertId?: string;                // Electron only
  signal?: AbortSignal;
}

// Matches the `_isFormData` payload UrlBar.tsx:244 already builds.
export interface FormDataPayload {
  _isFormData: true;
  items: Array<
    | { type: 'text'; key: string; value: string }
    | { type: 'file'; key: string; filename: string; content: string /* base64 */ }
  >;
}

export interface OutboundResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;                         // utf8, or base64 when isBase64
  isBase64: boolean;
  responseTime: number;                 // ms
  size: number;                         // bytes actually received
  truncated: boolean;                   // hit maxResponseBytes
  redirects?: Array<{ status: number; location: string }>;
}

export interface Transport {
  readonly name: 'electron' | 'extension' | 'browser';
  isAvailable(): Promise<boolean>;
  send(req: OutboundRequest): Promise<OutboundResponse>;
}
```

`client/src/transport/index.ts`:

```ts
import { electronTransport } from './electron';
import { extensionTransport } from './extension';
import { browserTransport } from './browser';

let cached: Transport | null = null;

export async function getTransport(): Promise<Transport> {
  if (cached) return cached;
  for (const t of [electronTransport, extensionTransport, browserTransport]) {
    if (await t.isAvailable()) { cached = t; return t; }
  }
  return browserTransport;                  // always last-resort
}

export function resetTransport() { cached = null; }   // call when the extension installs/uninstalls

export async function sendRequest(req: OutboundRequest): Promise<OutboundResponse> {
  return (await getTransport()).send(req);
}
```

`browser.ts` must not swallow the CORS case:

```ts
async send(req) {
  try {
    const res = await fetch(req.url, { /* … */ });
    // …
  } catch (e) {
    // A CORS rejection surfaces as a TypeError with no status. Do not show "Network Error".
    throw new TransportError('CORS_BLOCKED', {
      message: `The browser blocked this request to ${new URL(req.url).origin} because that server ` +
               `does not allow cross-origin calls. Install the Reqspace extension to send it.`,
      installUrl: EXTENSION_INSTALL_URL,
    });
  }
}
```

`electron.ts` — IPC. Add the handler in `main.js` and expose it in `preload.js`:

```js
// preload.js
contextBridge.exposeInMainWorld('reqspace', {
  send: (req) => ipcRenderer.invoke('reqspace:send', req),
});

// main.js
const { net } = require('electron');
ipcMain.handle('reqspace:send', async (_evt, req) => { /* use net.request or undici */ });
```

`isAvailable()` for Electron is simply `typeof window.reqspace?.send === 'function'`.

#### Migration of the five callers

Replace each `api.post('/proxy', {...})` with `sendRequest({...})`. The response shape is already
compatible except `workspaceId`, which moves to the separate history call (SEC-0.3).

* **Done when:** `grep -rn "api.post('/proxy'" client/src` returns nothing, and a Playwright test sends a
  request end-to-end through the active transport and asserts the rendered status code.

---

### SEC-0.3 — Move history writing to a client-driven, server-validated endpoint

* **Goal:** history still works once the server never sees the response.
* **Where:** `server/src/routes/proxy.ts:149-170` (the current server-side write),
  `server/src/routes/history.ts:111-171` (`saveHistoryEntry`), `client/src/components/request/UrlBar.tsx`
* **Why:** history is written today inside the proxy handler, from data only the server had. After SEC-0
  only the client has it — but the client must not be trusted to respect its own quota.

#### Technical detail

New route in `server/src/routes/history.ts`:

```ts
router.post(
  '/workspaces/:workspaceId/history',
  requireWorkspaceRole('viewer'),
  validate(createHistorySchema),          // SEC-9
  async (req: AuthRequest, res: Response) => {
    // Reuse the existing quota + truncation logic. It must run server-side:
    // a client that lies about `size` must not be able to exceed its quota.
    await saveHistoryEntry(String(req.user!._id), req.params.workspaceId, req.body);
    return res.status(201).json({ ok: true });
  },
);
```

Change `saveHistoryEntry`'s signature from
`(userId: mongoose.Types.ObjectId, workspaceId: mongoose.Types.ObjectId, …)` to `(userId: string,
workspaceId: string, …)` — the `ObjectId` casts break on SQL UUIDs (see FIX-2 step 4).

Server-side caps to enforce, regardless of what the client sends:

| Cap | Source | Behaviour |
|---|---|---|
| Body size | `SystemConfig.history.maxRequestBodyKB` (default 10 KB) | Truncate, set `bodyTruncated` |
| Per-user total | `SystemConfig.history.maxTotalPerUserMB` (default 20 MB) | GC oldest first (batched — PERF-4) |
| Recompute `size` | Always | Never trust the client's `size` field |

Client, in `UrlBar.tsx` after a successful send:

```ts
if (settings.saveHistory && activeWorkspace?._id) {
  api.post(`/workspaces/${activeWorkspace._id}/history`, { requestSnapshot, responseSnapshot })
     .catch(() => { /* history is best-effort; never block the user */ });
}
```

* **Done when:** API tests prove (a) a viewer can write their own history, (b) a non-member gets 403,
  (c) a client claiming `size: 0` on a 5 MB body still has the real size counted against its quota.

---

### SEC-0.4 — Delete the routes and everything that existed only for them

#### Delete list

| Path | Action |
|---|---|
| `server/src/routes/proxy.ts` | delete file |
| `server/src/routes/shareProxy.ts` | delete file |
| `server/src/index.ts:164` `app.use('/api/proxy', proxyRouter)` | delete line + import at `:21` |
| `server/src/index.ts:169` `app.use('/api/share', shareProxyRouter)` | delete line + import at `:26` |
| `server/src/utils/ssrf.ts` | delete file |
| `server/src/tests/ssrf.test.ts` | delete file |
| `server/package.json` | remove `undici`, `http-proxy-middleware` |
| `server/src/models/SystemConfig.ts` | remove the `proxy` sub-document |
| `server/src/repositories/SystemConfigRepository.ts` | remove `proxy` from the defaults and the type |
| `client/src/pages/AdminPage.tsx` | remove the proxy settings panel |
| `client/src/store/settingsStore.ts:51-55` | remove `proxyEnabled`, `proxyUrl`, `proxyAuthEnabled`, `proxyUsername`, `proxyPassword` |
| `server/src/routes/auth.ts:271-275` | remove the proxy keys from `ALLOWED_SETTINGS_KEYS` |

#### Steps

1. Delete in the order above; run `npm run build --prefix server` after each file.
2. Note in the commit message that existing `SystemConfig` documents keep a dead `proxy` key. Harmless —
   do not write a migration to remove it.
3. Update `README.md`: the "Proxying is not the central server's job" principle becomes past tense, and
   the `proxy.username` / `proxy.password` rows leave the secrets inventory.

* **Done when:** `grep -rn "api/proxy\|shareProxy\|assertSsrfSafe\|createSafeLookup" server/src client/src`
  is empty and the full Playwright suite passes.

---

### SEC-0.5 — Decide the fate of traffic capture

* **Where:** `server/src/routes/capture.ts`, `client/src/components/layout/CaptureTrafficModal.tsx`
* **Why:** capture is a server-side forwarder (`capture.ts:140` calls the global `fetch`) — the same
  category as the proxy, and it cannot survive SEC-0 unchanged.
* **Options:** (a) delete it with the proxy; (b) move it into the Electron main process.
  **Do not** push it into the Chrome extension — capturing live browsing traffic needs a far wider
  permission surface than the transport does (see the scope note in SEC-0.7).
* **Done when:** capture either works through the chosen path, or is gone from server, client, tests and docs.
  A half-removed capture path is not acceptable.

---

### SEC-0.6 — Strip the public share payload, and make links revocable

* **Goal:** a share link cannot hand out credentials, and a leaked one can be killed.
* **Where:** `server/src/routes/share.ts:12-35`, `client/src/components/collection/ShareLinkModal.tsx`
* **Why:** `GET /api/share/:shortId` currently returns `ApiRequest.find({collectionId}).lean()` — the
  **whole document**, including `auth` (bearer tokens, basic passwords), every header, and both scripts —
  plus the full collection document with its `variables`, to anyone holding the link. `shortId` is
  `crypto.randomBytes(6)` = 48 bits. There is no delete route, so a leaked link lives until `expiresAt`.

#### Technical detail

Replace the response with an explicit projection — allowlist, never denylist:

```ts
const SAFE_HEADER_DENYLIST = new Set([
  'authorization', 'proxy-authorization', 'cookie', 'set-cookie',
  'x-api-key', 'api-key', 'x-auth-token', 'x-access-token',
]);

function publicRequest(r: IRequestRecord) {
  return {
    _id: r._id,
    name: r.name,
    method: r.method,
    url: r.url,
    description: r.description,
    params: (r.params ?? []).map(({ key, value, enabled }: any) => ({ key, value, enabled })),
    headers: (r.headers ?? [])
      .filter((h: any) => !SAFE_HEADER_DENYLIST.has(String(h.key).toLowerCase()))
      .map((h: any) => ({ key: h.key, value: h.value, enabled: h.enabled })),
    // deliberately absent: auth, preRequestScript, testScript, body, comments, createdBy
  };
}

return res.json({
  collection: { _id: collection._id, name: collection.name, description: collection.description },
  //            ^ NOT collection.variables
  requests: requests.map(publicRequest),
  expiresAt: link.expiresAt,
});
```

Also:

1. `share.ts:56` — `crypto.randomBytes(6)` → `crypto.randomBytes(16)` (128 bits).
2. New route:

```ts
router.delete('/:shortId', authenticate, async (req: AuthRequest, res: Response) => {
  const link = await SharedLink.findOne({ shortId: req.params.shortId });
  if (!link) return res.status(404).json({ message: 'Not found' });
  const isCreator = String(link.createdBy) === String(req.user!._id);
  let allowed = isCreator || !!req.user!.isSuperAdmin;
  if (!allowed) {
    const role = await getUserWorkspaceRole(String(req.user!._id), String(link.workspaceId));
    allowed = role === 'editor' || role === 'owner';
  }
  if (!allowed) return res.status(403).json({ message: 'Not allowed to revoke this link' });
  await SharedLink.deleteOne({ shortId: req.params.shortId });
  return res.json({ ok: true });
});
```

3. Rate-limit `GET /:shortId` per IP (reuse `middleware/rateLimit.ts`): 60/min.
4. Add a **Revoke** button to `ShareLinkModal.tsx` with a confirm (the app's `ConfirmModal`, not
   `window.confirm` — UI-1).
5. `SharedCollectionPage.tsx:19` `executeRequest` must now go through the client transport (SEC-0.2),
   since the share proxy is gone.

* **Done when:** an API test creates a share link for a collection whose request carries
  `auth: { type: 'bearer', bearer: { token: 'SECRET123' } }` and a header `Authorization: Bearer X`, then
  asserts neither `SECRET123` nor `Bearer X` appears anywhere in the public response body; a second test
  revokes the link and asserts a follow-up `GET` returns 404.

---

### SEC-0.7 — Build the Chrome extension transport

* **Goal:** the web build sends real requests to any host, with full headers and full response access,
  without the Reqspace server touching the traffic.
* **Where:** new top-level `extension/` (own `package.json`, own build), plus `client/src/transport/extension.ts`

#### SEC-0.7.1 — Manifest and skeleton (MV3)

```json
{
  "manifest_version": 3,
  "name": "Reqspace Transport",
  "version": "1.0.0",
  "description": "Lets the Reqspace app send API requests that browser CORS rules would block.",
  "background": { "service_worker": "background.js", "type": "module" },
  "host_permissions": ["<all_urls>"],
  "permissions": ["declarativeNetRequest", "storage"],
  "externally_connectable": {
    "matches": [
      "https://reqspace.example.com/*",
      "http://localhost:5173/*",
      "http://localhost:3005/*"
    ]
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

Notes for whoever implements this:

* `externally_connectable` is what lets the page call the extension with
  `chrome.runtime.sendMessage(EXTENSION_ID, msg, cb)` — **no content script is needed**. Do not add one.
* Do **not** request `tabs`, `cookies`, `webRequest` or `scripting`. Each widens both the store review
  and the blast radius. `declarativeNetRequest` is needed only for SEC-0.7.3.
* `<all_urls>` will draw review scrutiny. Write the justification text before submitting.

Handle a `ping` first, so detection can be built and tested before anything else:

```js
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!isAllowedOrigin(sender.origin)) return;                 // SEC-0.7.5
  if (msg?.type === 'ping') { sendResponse({ v: 1, ok: true }); return; }
  handleSend(msg).then(sendResponse);
  return true;                                                  // keep the channel open (async)
});
```

* **Done when:** the unpacked extension loads and answers `ping` from the app origin, and rejects it from
  any other origin.

#### SEC-0.7.2 — The request bridge

Message contract — versioned, mirroring `OutboundRequest` / `OutboundResponse` from SEC-0.2:

```ts
// page → extension
{ v: 1, type: 'send', id: string, method, url, headers, body, followRedirects, verifySsl, timeout, maxResponseBytes }
// extension → page
{ v: 1, id: string, ok: true,  status, statusText, headers, body, isBase64, responseTime, size, truncated, redirects }
{ v: 1, id: string, ok: false, error: { code: 'TIMEOUT'|'DNS'|'REFUSED'|'TOO_LARGE'|'BAD_URL', message } }
```

Implementation notes:

```js
async function handleSend(msg) {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), msg.timeout);          // timeout is mandatory, never 0
  const res = await fetch(msg.url, {
    method: msg.method,
    headers: msg.headers,
    body: msg.body,
    redirect: msg.followRedirects ? 'follow' : 'manual',
    credentials: 'omit',                                              // SEC-0.7.4
    signal: ctrl.signal,
  });
  clearTimeout(timer);

  // Return EVERY response header. This visibility is the main reason the extension exists —
  // a page can only read CORS-safelisted headers.
  const headers = {};
  res.headers.forEach((v, k) => { headers[k] = v; });

  // Stream and enforce the cap; never buffer an unbounded body (FEAT-9).
  const { bytes, truncated } = await readCapped(res.body, msg.maxResponseBytes);
  // …
}
```

`readCapped` reads from `res.body.getReader()` and aborts once the accumulated length exceeds the cap.
Base64-encode when the `content-type` is binary (`image/`, `application/pdf`, `audio/`, `video/`,
`application/octet-stream`) — the same rule `proxy.ts:98` used.

* **Done when:** the app sends a `POST` with a custom header to a public API that returns no CORS headers,
  and the response renders with all its headers visible.

#### SEC-0.7.3 — Restore the headers Chrome strips

* **Why:** `fetch` silently drops forbidden headers — `Origin`, `Referer`, `Cookie`, `Host`,
  `User-Agent`, `Connection`, `Sec-*`. An API client must be able to set them; silently sending something
  different from what the user typed is worse than refusing.

```js
const FORBIDDEN = ['user-agent', 'referer', 'origin', 'host', 'cookie', 'accept-encoding', 'connection'];

async function withHeaderRules(url, headers, fn) {
  const overrides = Object.entries(headers)
    .filter(([k]) => FORBIDDEN.includes(k.toLowerCase()))
    .map(([header, value]) => ({ header, operation: 'set', value }));
  if (!overrides.length) return fn();

  const id = nextRuleId();                       // pool ids; never reuse a live one
  await chrome.declarativeNetRequest.updateSessionRules({
    addRules: [{
      id, priority: 1,
      action: { type: 'modifyHeaders', requestHeaders: overrides },
      condition: { urlFilter: url, resourceTypes: ['xmlhttprequest'] },
    }],
  });
  try { return await fn(); }
  finally { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }); }
}
```

Keep an explicit allowlist of which forbidden headers the product supports, and report any header that
was dropped back to the app so the UI can warn the user.

* **Done when:** a test sets `User-Agent: ReqspaceTest/1.0` and `Referer: https://example.com` and an echo
  endpoint reports both exactly.

#### SEC-0.7.4 — Cookie policy

* **Decision:** default `credentials: 'omit'`. The user's real browser cookies are never attached
  automatically. Add an explicit per-request toggle "send browser cookies for this domain" which switches
  to `credentials: 'include'`.
* **Why:** attaching ambient cookies silently would make every request a potential CSRF against sites the
  user is logged into, fired from their own browser with their own session.
* The app's own cookie manager (`CookieManagerModal.tsx`) remains the default cookie source, sent as a
  normal `Cookie` header through SEC-0.7.3.
* **Done when:** a test sends a request to a domain the browser holds a session cookie for and asserts the
  cookie is absent unless the toggle is on.

#### SEC-0.7.5 — Harden the extension itself

An extension that can fetch any URL is a high-value target. Treat it as one.

1. **Origin check in the handler**, not only in the manifest:

```js
const ALLOWED_ORIGINS = new Set([
  'https://reqspace.example.com', 'http://localhost:5173', 'http://localhost:3005',
]);
const isAllowedOrigin = (origin) => ALLOWED_ORIGINS.has(origin);
```

2. No `eval`, no `new Function`, no remotely loaded code, no CDN. Strict CSP (already in the manifest).
3. The extension stores **nothing**: no credentials, no history, no user data. It is a dumb pipe — the app
   supplies the complete request every time.
4. Reject any URL whose protocol is not `http:` or `https:` (blocks `file:`, `chrome-extension:`, `data:`).
5. Zero runtime dependencies if possible; pin and review anything unavoidable.
6. Publish the source and a reproducible build so the store artifact can be verified.

* **Done when:** a test page served from an origin not in `ALLOWED_ORIGINS` calls the extension and is
  rejected, and a `file:///etc/passwd` URL is refused.

#### SEC-0.7.6 — App-side integration and UX

```ts
// client/src/transport/extension.ts
const EXT_ID = import.meta.env.VITE_EXTENSION_ID;

async function ping(): Promise<boolean> {
  if (!(window as any).chrome?.runtime?.sendMessage || !EXT_ID) return false;
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 300);
    (window as any).chrome.runtime.sendMessage(EXT_ID, { v: 1, type: 'ping' }, (r: any) => {
      clearTimeout(t);
      resolve(!!r?.ok);                       // chrome.runtime.lastError → undefined response
    });
  });
}
```

1. Cache the result; re-probe on any transport failure and on window focus.
2. Status chip in `TopBar.tsx`: **Desktop** / **Extension connected** / **Browser only (limited)**,
   clickable, explaining the difference.
3. When no transport can reach the target, show the `CORS_BLOCKED` error from SEC-0.2 with an install
   link — never a bare "Network Error".
4. Version negotiation: if the extension answers with a `v` lower than the app's contract, tell the user
   to update the extension instead of failing obscurely.

* **Done when:** with the extension disabled, sending to a non-CORS host shows the install prompt; with it
  enabled the same request succeeds; the status chip reflects both states.

#### SEC-0.7.7 — Build, test and ship

1. `npm run build:extension` produces both a loadable directory and a zip.
2. Playwright project that loads it:

```ts
// playwright.config.ts
{
  name: 'chromium-extension',
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: {
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
      ],
    },
  },
}
```

Note: extensions require a persistent context; use `chromium.launchPersistentContext` in a fixture if the
project-level args are not enough.

3. Document loading it unpacked for development and the store steps for release.
4. Firefox: MV3 and `externally_connectable` differ there. Out of scope — record it so nobody assumes
   cross-browser support.

* **Done when:** a CI Playwright project runs the core send flow through the extension.

> **Scope note:** this extension is a **transport**, not the traffic interceptor from the old parity list
> (item 43, in `IGNORE.md`). Capturing the user's live browsing traffic is a much broader permission
> surface. Do not let it creep in here.

---

## SEC-3 — Sandbox user scripts

* **Goal:** a pre-request or test script cannot read the user's session, tokens, cookies or DOM.
* **Where:** `client/src/utils/scripts.ts:131,306` (`new Function(...)`), `client/src/sandbox/worker.ts`
  (exists; referenced **only from a comment** at `RunnerModal.tsx:16`),
  `client/src/components/response/ResponseViewer.tsx:376-381` and `:536-562`
* **Why:** scripts currently run on the main thread with `window`, `document`, `localStorage` and the
  app's authenticated axios instance in scope (`scripts.ts:175` hands `api` straight to `pm.sendRequest`).
  A malicious test script in a shared collection can read the persisted bearer tokens (SEC-4) and issue
  requests as the user. The visualizer iframe has **no `sandbox` attribute at all** and loads
  `handlebars@latest` from jsDelivr.

#### Technical detail

1. **One sandbox, not two.** Keep `client/src/sandbox/worker.ts`; delete the `new Function` paths in
   `scripts.ts`. Two half-built implementations is the current state and it is what let the gap persist.

2. **Message protocol** — the worker never receives a live object, only data:

```ts
// host → worker
{ type: 'run', phase: 'pre'|'test', script: string,
  request: { method, url, headers, body },
  response?: { status, statusText, headers, body, time },
  variables: { environment: Record<string,string>, globals: Record<string,string>, collection: …, local: … } }

// worker → host
{ type: 'result',
  variableWrites: Array<{ scope: 'environment'|'globals'|'collection'|'local', key: string, value: string }>,
  testResults: Array<{ name: string, passed: boolean, error?: string }>,
  consoleLines: Array<{ level: string, args: string[] }>,
  visualizer?: { template: string, data: unknown } }

// worker → host (async, during the run)
{ type: 'sendRequest', id: string, request: { method, url, headers, body } }
// host → worker
{ type: 'sendRequestResult', id: string, response | error }
```

The host applies `variableWrites` to the stores **after** validating scope and key. The worker never
touches the stores itself.

3. **`pm.sendRequest`** becomes a message the host validates and routes through the SEC-0.2 transport —
   an allowlisted channel, not a handed-over HTTP client. Enforce a per-run cap (e.g. 10 requests) so a
   script cannot become a load generator.

4. **Visualizer iframe** (`ResponseViewer.tsx:536`):

```tsx
<iframe
  className="w-full h-full border-none"
  title="visualizer"
  sandbox="allow-scripts"     // ← scripts yes, same-origin NO. Never add allow-same-origin here.
  srcDoc={...}
/>
```

With `allow-scripts` and **without** `allow-same-origin` the frame gets an opaque origin: it can run
Handlebars but cannot reach `parent`, `localStorage` or cookies.

5. **Self-host Handlebars.** Replace
   `<script src="https://cdn.jsdelivr.net/npm/handlebars@latest/dist/handlebars.min.js">` with a bundled
   copy inlined into the `srcDoc`. `@latest` from a CDN is unpinned third-party code on the render path.

6. **HTML preview iframe** (`ResponseViewer.tsx:380`): `sandbox="allow-same-origin"` → `sandbox=""`.
   Scripts are already blocked (no `allow-scripts`), so `allow-same-origin` buys nothing and becomes an
   origin grant the day someone adds scripts.

* **Done when:** a test script running
  `pm.test('leak', () => { pm.expect(typeof localStorage).to.equal('undefined') })` passes, a script
  calling `window.parent` fails, and a Playwright test asserts the visualizer frame cannot access `parent`.

---

## SEC-4 — Stop persisting credentials to `localStorage`

* **Goal:** an XSS or a rogue script finds no tokens in browser storage.
* **Where:** `client/src/store/requestStore.ts:327-328`, `client/src/store/settingsStore.ts:55,70`,
  `client/src/store/cookieStore.ts:33`
* **Why:** `partialize: (state) => ({ tabs: state.tabs, activeTabId: state.activeTabId })` persists every
  tab **whole** — `auth.bearer.token`, `auth.basic.password`, every header value and every request body —
  into `localStorage` under `request-storage`. `settingsStore` persists `proxyPassword` (removed by
  SEC-0.4). `cookieStore` seeds a fake `sess_default_123`.

#### Technical detail

```ts
// client/src/store/requestStore.ts
const SENSITIVE_HEADER_KEYS = /^(authorization|proxy-authorization|cookie|x-api-key|api-key|x-auth-token)$/i;

function stripSecrets(tab: ActiveRequest): ActiveRequest {
  return {
    ...tab,
    auth: tab.auth ? { type: tab.auth.type } : undefined,      // keep the TYPE, drop every value
    headers: (tab.headers ?? []).map(h =>
      SENSITIVE_HEADER_KEYS.test(h.key) ? { ...h, value: '', needsReentry: true } : h),
    body: tab._id ? undefined : tab.body,   // saved requests refetch their body; only unsaved keep it
  };
}

persist(/* … */, {
  name: 'request-storage',
  version: 2,
  migrate: (persisted: any, from: number) =>
    from < 2 ? { ...persisted, tabs: (persisted.tabs ?? []).map(stripSecrets) } : persisted,
  partialize: (state) => ({
    tabs: state.tabs.map(stripSecrets),
    activeTabId: state.activeTabId,
  }),
});
```

* The `version` + `migrate` pair matters: it wipes secrets already sitting in users' browsers from the
  current build. Without it, the fix only protects new data.
* On rehydrate, tabs with `_id` refetch their saved request from the server. Fields marked
  `needsReentry` render with a visible "re-enter value" marker.
* Electron: store saved credentials in the OS keychain (`safeStorage`) instead.
* Delete the `sess_default_123` seed in `cookieStore.ts:33`.

* **Done when:** a Playwright test fills a bearer token, reloads the page, and asserts the token appears
  neither in `localStorage.getItem('request-storage')` nor anywhere in the DOM.

---

## SEC-5 — Stop exporting unmasked secrets

* **Where:** `server/src/routes/admin.ts:278,286` vs `maskConfigSecrets` at `:206`
* **Why:** `GET /api/admin/export/:workspaceId` embeds the raw `SystemConfig` — SMTP password, Google
  OAuth client secret, outbound proxy password — into a downloaded file, while `GET /api/admin/config`
  eighty lines above masks exactly those fields. The file then lives in a downloads folder or a ticket.

#### Technical detail

```ts
// server/src/routes/admin.ts — in GET /export/:workspaceId
const dump = {
  version: 1,
  workspace,
  collections,
  folders,
  requests,
  environments,
  // config removed: a workspace export must not carry instance-wide credentials.
  // POST /import already ignores dump.config, so nothing consumes it.
};
```

If the config must stay for some workflow, it goes through `maskConfigSecrets(config)` first — never raw.

* **Done when:** an API test sets an SMTP password, exports a workspace, and asserts the password string
  does not appear in the response body.

---

## SEC-6 — Escape every user string that reaches a regex

* **Where:** `server/src/routes/admin.ts:26-27` and `:174`,
  `server/src/repositories/RequestRepository.ts:133`
* **Why:** the earlier ReDoS fix landed only in `workspaces.ts` and `users.ts`. Global search goes through
  `RequestRepository.searchInWorkspace`, which does `new RegExp(query, 'i')` on raw user input —
  reachable by any logged-in user. A malformed pattern (`[`) throws a 500; a pathological one
  (`((((a+)+)+)+)$`) pins a CPU core.

#### Technical detail

```ts
// server/src/repositories/RequestRepository.ts
import { escapeRegex } from '../utils/escapeRegex';

const MAX_QUERY_LENGTH = 100;

async searchInWorkspace(query: string, collectionIds: string[]): Promise<IRequestRecord[]> {
  const q = String(query).slice(0, MAX_QUERY_LENGTH);
  if (!q) return [];
  if (isMongo()) {
    const rx = new RegExp(escapeRegex(q), 'i');
    return (await Request.find({
      collectionId: { $in: collectionIds },
      $or: [{ name: rx }, { url: rx }],
    }).limit(100).lean()).map(mongoToRecord);
  }
  // SQL side already uses Op.like, but escape the LIKE wildcards too:
  const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  // …
}
```

Same treatment in `admin.ts`:

```ts
if (search) {
  const rx = new RegExp(escapeRegex(String(search).slice(0, 100)), 'i');
  query.$or = [{ name: rx }, { email: rx }];
}
```

* **Done when:** API tests send `((((a+)+)+)+)$` and `[` as the search term and get a 200 or 400 within one
  second, with the process still responsive.

---

## SEC-7 — Stop leaking `dbError` to anonymous callers

* **Where:** `server/src/index.ts:143-156` (the `/api` DB-down gate), rendered by `client/src/App.tsx:63`
* **Why:** `/api/health` masks the error in production (`index.ts:135`), but the gate immediately below
  returns the same raw string — which can contain a connection string with credentials — on **every** API
  path, to unauthenticated callers, and the client prints it full-screen.

#### Technical detail

```ts
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next();
  if (dbStatus !== 'ok') {
    const isProd = process.env.NODE_ENV === 'production';
    return res.status(503).json({
      message: 'Database not available',
      dbError: isProd ? undefined : (dbError || 'Database is not connected'),
      dbType: isProd ? undefined : dbType,
      dbStatus,
    });
  }
  next();
});
```

`client/src/App.tsx` renders `dbError` when present and a generic "The server cannot reach its database —
check the server logs" when it is not.

* **Done when:** a test booting with `NODE_ENV=production` and an unreachable DB asserts the response body
  contains neither the connection string nor the driver error text.

---

## SEC-8 — Encrypt client certificates at rest

* **Where:** `server/src/routes/auth.ts:294-314` (create), `:130-143` (`GET /me` returns them)
* **Why:** `User.clientCertificates[]` stores the PEM private key and its passphrase in clear text, and
  `GET /api/auth/me` returns the whole array — key material included — on every session check.

#### Technical detail

```ts
// server/src/utils/cryptoBox.ts
import crypto from 'crypto';

const KEY = () => {
  const raw = process.env.CERT_ENCRYPTION_KEY;
  if (!raw || raw.length < 64) throw new Error('CERT_ENCRYPTION_KEY must be 32 bytes as 64 hex chars');
  return Buffer.from(raw, 'hex');
};

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function open(sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}
```

* `POST /certificates` seals `key` and `passphrase` before storing.
* `GET /me` returns metadata only: `{ _id, hostname, createdAt }` — never `cert`, `key` or `passphrase`.
* Decrypt only at the moment a certificate is handed to the Electron transport for a request.
* Add `CERT_ENCRYPTION_KEY` to `server/.env.example` and to the README secrets inventory.

* **Done when:** a repository test asserts the stored `key` is not the plaintext PEM, and an API test
  asserts `GET /api/auth/me` contains no `-----BEGIN` string.

---

## SEC-9 — Validate every request body with Zod

* **Where:** `zod` is at `server/package.json:71` and imported **nowhere** in `server/src`
* **Why:** the mass-assignment fixes so far are hand-written allowlists scattered across route handlers.
  One missed field is one privilege escalation. `ajv` (v6) is also installed and unused.

#### Technical detail

```ts
// server/src/middleware/validate.ts
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid request body',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    req.body = parsed.data;      // ← the point: unknown keys are DROPPED, not merely ignored
    next();
  };
}
```

```ts
// server/src/schemas/collections.ts
import { z } from 'zod';

export const updateCollectionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  variables: z.array(z.object({
    key: z.string().max(200), value: z.string().max(10_000), enabled: z.boolean().optional(),
  })).max(500).optional(),
  preRequestScript: z.string().max(100_000).optional(),
  testScript: z.string().max(100_000).optional(),
  order: z.number().int().min(0).optional(),
}).strict();     // ← .strict() rejects workspaceId outright instead of silently dropping it
```

Roll-out order: history.ts and importExport.ts routes → auth → admin → collections/environments/history.

Also replace `AuthRequest.user?: any` (`middleware/auth.ts:11`) with a real type:

```ts
export interface AuthUser {
  _id: string; email: string; name: string;
  isSuperAdmin: boolean; status: 'active' | 'suspended';
  mustChangePassword?: boolean; settings?: UserSettings; authType: AuthType;
}
export interface AuthRequest extends Request { user?: AuthUser; params: Record<string, string>; }
```

Then remove `ajv` from `package.json`.

* **Done when:** a test walks the Express router stack and fails if any `POST`/`PUT`/`PATCH` route has no
  `validate` middleware, and a test posting `{ name: 'x', workspaceId: '<other>' }` to
  `PUT /api/collections/:id` gets 400.

---

## SEC-10 — Baseline HTTP hardening, the remaining half

* **Where:** `server/src/index.ts:114` (`helmet({ contentSecurityPolicy: false })`),
  `server/src/middleware/rateLimit.ts` (in-memory), `routes/auth.ts:14-15` (only login/register limited)

#### Technical detail

```ts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],   // Monaco needs wasm; no CDN after SEC-3
      styleSrc: ["'self'", "'unsafe-inline'"],       // Tailwind injects styles
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],                        // the server never proxies now (SEC-0)
      workerSrc: ["'self'", 'blob:'],                // Monaco + the script sandbox (SEC-3)
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
```

Rate limiting — extend beyond login/register and key by user as well as IP:

```ts
const mutationLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  keyBy: (req) => (req as AuthRequest).user?._id ?? req.ip,
});
app.use('/api', (req, res, next) =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? mutationLimiter(req, res, next) : next());
```

Then move the store behind an interface so Redis backs it when SOCK-3 lands — an in-memory limiter does
nothing across replicas.

* **Done when:** a test asserts the CSP header is present, the app loads with zero CSP violations in the
  console, and the 301st mutation in a minute returns 429.

---

## SEC-11 — OAuth `state` / CSRF

* **Where:** `server/src/routes/auth.ts:183-268`, `client/src/pages/OAuthCallbackPage.tsx`
* **Why:** `redirect_uri` is now allowlisted, but there is no `state`, so a login-CSRF (attacker's code
  redeemed in the victim's browser, silently logging them into the attacker's account) is still possible.

#### Technical detail

```ts
// GET /api/auth/google/start — new route
const state = crypto.randomBytes(32).toString('hex');
res.cookie('oauth_state', state, {
  httpOnly: true, secure: cookieSecure(), sameSite: 'lax', path: '/', maxAge: 10 * 60 * 1000,
});
return res.json({ state, authUrl: buildGoogleAuthUrl(state) });

// POST /api/auth/google — verify before anything else
const cookieState = req.cookies?.oauth_state;
if (!cookieState || !req.body.state || cookieState !== req.body.state) {
  return res.status(400).json({ message: 'Invalid OAuth state' });
}
res.clearCookie('oauth_state', { path: '/' });
```

Client: call `/start`, keep `state` in memory, send it back from the callback page.

* **Done when:** an API test posting to `/api/auth/google` with no `oauth_state` cookie, and one with a
  mismatched value, both get 400.

---

## SEC-12 — Remove the NTLM auth option

* **Where:** `client/src/components/request/AuthEditor.tsx:13,182-220`,
  `client/src/components/request/UrlBar.tsx:172-178`, `client/src/store/requestStore.ts:22,27`
* **Why:** the UI collects a domain username and password and sends them as
  `x-reqspace-ntlm-username` / `-password` / `-domain` / `-workstation` headers. **Nothing reads them** —
  `grep -ri ntlm server/src` returns no matches. The handshake never happens; the user's domain
  credentials are simply transmitted in clear custom headers to whatever host they typed. NTLM is in
  `IGNORE.md`, so the fix is removal.

#### Technical detail

1. `requestStore.ts:22` — drop `'ntlm'` from the union; `:27` — delete the `ntlm?` field.
2. `AuthEditor.tsx:13` — remove the `AUTH_TYPES` entry; `:182-220` — delete the panel.
3. `UrlBar.tsx:172-178` — delete the branch.
4. Migrate on read: any stored request with `auth.type === 'ntlm'` becomes `{ type: 'none' }` — add it to
   the `requestStore` migration from SEC-4 (bump to `version: 3`).

* **Done when:** `grep -ri ntlm client/src server/src` returns nothing and a request saved with NTLM auth
  loads as "No Auth".

---

# FIX — Broken in place

## FIX-2 — Finish multi-database support

* **Goal:** all four advertised backends work end to end.
* **Where:** `server/src/routes/{environments,history,admin,capture,importExport,share}.ts` import
  Mongoose models directly (confirmed: `environments.ts:4` imports `../models/Environment`,
  `history.ts:4-8` imports five models) and fail under `DB_TYPE≠mongodb`.

#### Steps

1. **Extend `EnvironmentRepository`** to the full shape used by the routes. Reconcile the schema split:
   Mongo has one `environments` collection with an `isGlobal` flag; SQL has `environments` **plus**
   `global_environments` (`db/sql-models/index.ts:263-270`). Hide that difference inside the repository:

   ```ts
   async findByWorkspace(workspaceId: string): Promise<IEnvironmentRecord[]> {
     if (isMongo()) return (await Environment.find({ workspaceId, isGlobal: false }).lean()).map(toRecord);
     return (await SqlEnvironment.findAll({ where: { workspaceId } })).map(sqlToRecord);
   }
   async getGlobal(workspaceId: string): Promise<IEnvironmentRecord | null> {
     if (isMongo()) return toRecordOrNull(await Environment.findOne({ workspaceId, isGlobal: true }).lean());
     return toRecordOrNull(await SqlGlobalEnvironment.findOne({ where: { workspaceId } }));
   }
   ```

2. **Extend `HistoryRepository`** likewise. Mongo stores `requestSnapshot` / `responseSnapshot`; SQL
   stores `requestData` / `responseData` (`sql-models/index.ts:282-283`). Pick the Mongo names as the
   record shape and translate on the SQL side.

3. **Convert one route file per commit**, running the DB matrix (TEST-2) after each. Order:
   `environments.ts` → `history.ts` → `share.ts` → `importExport.ts` → `admin.ts` → `capture.ts`
   (or delete `capture.ts` per SEC-0.5).

4. **Remove every `ObjectId` cast on a user-supplied id.** Known sites:
   * `routes/proxy.ts:153-154` `new mongoose.Types.ObjectId(workspaceId)` — **throws on a SQL UUID**, and
     because it runs inside the handler's try block a successful send is reported as a 502. Deleted with
     SEC-0.4, but the same cast moves into SEC-0.3 if copied blindly — don't.
   * `routes/auth.ts:301` `new mongoose.Types.ObjectId()` for a certificate id → use `uuidv4()`.
   * `routes/importExport.ts:184-185` same.

5. **Add a guard so this cannot regress:**

   ```bash
   # scripts/check-repository-boundary.sh  — run in CI
   if grep -rn "from '\.\./models/" server/src/routes server/src/middleware; then
     echo "Route/middleware imports a model directly. Use a repository."; exit 1
   fi
   ```

* **Done when:** the full Playwright suite is green on all four backends, and the boundary check passes.

---

## FIX-3 — Add real migrations

* **Where:** `server/src/db/connect.ts:38` — `await sq.sync(isProd ? {} : { alter: true })`
* **Why:** `sync({})` creates **missing tables**. It does not add an index or a column to a table that
  already exists. Every index declared in `server/src/db/sql-models/index.ts` (lines 199, 215, 229,
  253-257, 266, 284, 294) is therefore absent on any database created before those declarations landed —
  which is exactly the long-lived, large database that needs them. The same applies to Mongo: Mongoose
  only builds indexes with `autoIndex`, which should be off in production.

#### Technical detail

```ts
// server/src/db/migrations/001-indexes.ts
import { QueryInterface } from 'sequelize';

export async function up({ context: qi }: { context: QueryInterface }) {
  const add = async (table: string, fields: string[], name: string) => {
    try { await qi.addIndex(table, fields, { name }); }
    catch (e: any) { if (!/already exists|duplicate/i.test(e.message)) throw e; }
  };
  await add('collections', ['workspaceId'],                          'idx_collections_workspace');
  await add('collections', ['workspaceId', 'order'],                 'idx_collections_workspace_order');
  await add('folders',     ['collectionId'],                         'idx_folders_collection');
  await add('folders',     ['collectionId', 'parentFolderId'],       'idx_folders_collection_parent');
  await add('requests',    ['collectionId'],                         'idx_requests_collection');
  await add('requests',    ['folderId'],                             'idx_requests_folder');
  await add('requests',    ['collectionId', 'folderId', 'order'],    'idx_requests_collection_folder_order');
  await add('environments',['workspaceId'],                          'idx_environments_workspace');
  await add('history',     ['userId', 'workspaceId'],                'idx_history_user_workspace');
  await add('history',     ['createdAt'],                            'idx_history_created');
  await add('audit_logs',  ['userId'],                               'idx_audit_user');
  await add('audit_logs',  ['targetId'],                             'idx_audit_target');
  await add('workspaces',  ['ownerId'],                              'idx_workspaces_owner');
}
```

Wire `umzug` in `connect.ts`, before `sync`:

```ts
const umzug = new Umzug({
  migrations: { glob: 'dist/db/migrations/*.js' },
  context: sq.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize: sq }),
  logger: console,
});
await umzug.up();                       // fail fast — do not swallow
await sq.sync(process.env.NODE_ENV === 'production' ? {} : { alter: true });
```

For MongoDB, at boot:

```ts
if (isMongo()) {
  for (const m of [Collection, Folder, Request, Environment, History, AuditLog, Workspace, User]) {
    const res = await m.syncIndexes();
    if (res.length) console.log(`📇 Mongo indexes created for ${m.modelName}:`, res);
  }
}
```

Add `"migrate": "node dist/db/migrate.js"` to `server/package.json` scripts.

* **Done when:** a test that boots against a database created **without** the index declarations asserts
  every index in the list above exists afterwards. Verify manually once per dialect:
  `psql -c '\di'`, `SHOW INDEX FROM requests;`, `PRAGMA index_list(requests);`,
  `db.requests.getIndexes()`.

---

# PERF — Efficiency at 10k workspaces / 100k collections / 100k requests

Every item below is a measured defect at the target scale. Each task must report a number: queries
issued, rows touched, bytes transferred, milliseconds.

## PERF-0 — Build the scale harness first

* **Goal:** nothing below can be verified without realistic data. **Do this before optimising anything.**
* **Where:** new `scripts/seed-scale.ts`, `scripts/measure.ts`

#### Technical detail

```ts
// scripts/seed-scale.ts — bulk insert, never through the API
// Usage: DB_TYPE=sqlite npx ts-node scripts/seed-scale.ts --workspaces=10000 --collections-per-ws=10 \
//                                                          --requests-per-collection=10 --users=200
// Insert in batches of 1000. Use insertMany / bulkCreate. Expect minutes, not seconds.
```

Targets: 10,000 workspaces · 100,000 collections · 100,000+ requests · 200 users with mixed roles ·
50,000 history rows. Make it idempotent and parameterised so a laptop can run `--workspaces=100`.

```ts
// scripts/measure.ts — count queries, not just time
import { Sequelize } from 'sequelize';
let queryCount = 0;
sequelize.options.logging = () => { queryCount++; };
mongoose.set('debug', () => { queryCount++; });

async function scenario(name: string, fn: () => Promise<void>) {
  queryCount = 0;
  const t0 = performance.now();
  await fn();
  console.log(`${name}: ${(performance.now() - t0).toFixed(0)}ms, ${queryCount} queries`);
}
```

Record a baseline table in this task for: login → list workspaces → open a workspace → expand a
collection → open a request → send → list history.

* **Done when:** `npm run seed:scale && npm run measure` prints the baseline on sqlite and mongodb, and
  the numbers are pasted into this task.

---

## PERF-1 — Opening a workspace issues 1 + 2×N HTTP requests

* **This is the single worst performance defect in the product.**
* **Where:** `client/src/store/collectionStore.ts:99-140` (`fetchCollectionsData`)
* **Why:** it fetches the collection list, then does **two HTTP requests per collection** — folders and
  requests — in a `Promise.all` over every collection:

```ts
await Promise.all(serverCols.map(async (col) => {
  const [fRes, rRes] = await Promise.all([
    api.get(`/collections/${col._id}/folders`),
    api.get(`/collections/${col._id}/requests`),
  ]);
  // …
}));
```

A workspace with 200 collections fires **401 HTTP requests**, in parallel, on open — and again on every
socket event and every window focus (SOCK-1). At 100k collections this is unusable, and each of those
requests runs `checkPermission` → `resolveWorkspaceId` → 1-2 DB reads (PERF-4).

#### Fix, in two parts

**Part 1 — one batched endpoint** (a stop-gap that is one line for the client and removes 2N round-trips):

```ts
// server/src/routes/collections.ts
router.get('/workspaces/:workspaceId/tree',
  requireWorkspaceRole('viewer'),
  async (req: AuthRequest, res: Response) => {
    const collections = await CollectionRepository.findByWorkspace(req.params.workspaceId, { limit: 200 });
    const ids = collections.map((c) => c._id);
    const [folders, requests] = await Promise.all([
      FolderRepository.findByCollections(ids),      // new: ONE query with $in / Op.in
      RequestRepository.findByCollections(ids, { summaryOnly: true }),
    ]);
    return res.json({ collections, folders, requests });
  });
```

New repository methods (mirroring the existing `findByCollection`):

```ts
// server/src/repositories/RequestRepository.ts
async findByCollections(collectionIds: string[], opts?: { summaryOnly?: boolean }) {
  if (!collectionIds.length) return [];
  const projection = opts?.summaryOnly
    ? { _id: 1, collectionId: 1, folderId: 1, name: 1, method: 1, order: 1 }   // PERF-6
    : undefined;
  if (isMongo()) {
    return (await Request.find({ collectionId: { $in: collectionIds } }, projection)
      .sort({ order: 1 }).lean()).map(mongoToRecord);
  }
  const { Op } = await import('sequelize');
  return (await SqlRequest.findAll({
    where: { collectionId: { [Op.in]: collectionIds } },
    attributes: opts?.summaryOnly ? ['id','collectionId','folderId','name','method','order'] : undefined,
    order: [['order', 'ASC']],
  })).map(sqlToRecord);
}
```

**Part 2 — lazy loading** (PERF-2). Part 1 alone still sends the whole tree; it is a bridge, not the
destination.

* **Done when:** `measure.ts` shows opening a workspace with 200 collections issuing **1** HTTP request
  and **≤ 3** DB queries.

---

## PERF-2 — Lazy-load the tree

* **Goal:** opening a workspace fetches collections only; children load on expand.
* **Where:** `client/src/store/collectionStore.ts`, `client/src/components/collection/CollectionExplorer.tsx`

#### Technical detail

```ts
interface CollectionStore {
  collections: Collection[];
  foldersByCollection: Record<string, Folder[] | 'loading' | undefined>;
  requestsByFolder: Record<string, ApiRequest[] | 'loading' | undefined>;   // key: `${collectionId}:${folderId ?? 'root'}`
  openCollectionIds: Set<string>;

  loadWorkspace(workspaceId: string): Promise<void>;          // collections page only
  loadCollectionChildren(collectionId: string): Promise<void>; // on first expand
  loadFolderChildren(collectionId: string, folderId: string): Promise<void>;
}
```

Rules:

1. `loadWorkspace` fetches one page of collections. Nothing else.
2. `loadCollectionChildren` runs **once** per collection — guard on the `'loading'` / present state.
3. Show a skeleton row while `'loading'`.
4. Expansion state lives in the store (it already does: `openCollectionIds`), so it survives re-render.
5. Keep the Dexie offline cache (`client/src/db`, used at `collectionStore.ts:101-113`) but make it
   per-node too, and treat it as a *hint*: paint from cache, then reconcile with the server.
6. Delete `fetchCollectionsData` once nothing references it.

* **Done when:** with the PERF-0 dataset, opening a workspace with 500 collections issues one request and
  transfers under 100 KB; expanding one collection issues exactly one more.

---

## PERF-3 — Paginate everything that returns a list

* **Goal:** no endpoint can return an unbounded collection.
* **Where:** `routes/collections.ts:60-66` (collections), `:108-114` (folders), `:154-168` (requests);
  `routes/workspaces.ts` (list); `routes/history.ts:17-33` (offset today); `routes/admin.ts:20-41` (offset)

#### Technical detail — use cursors, not offsets

Offset paging degrades linearly: `skip((page-1)*limit)` on page 500 makes the database walk 25,000 rows
it then discards. That is exactly what `history.ts:28` and `admin.ts:35` do now.

```ts
// Cursor = the last item's sort key, base64-encoded. For tree nodes: (order, _id).
function encodeCursor(order: number, id: string) {
  return Buffer.from(JSON.stringify([order, id])).toString('base64url');
}

// Mongo
const q = cursor
  ? { collectionId, $or: [{ order: { $gt: o } }, { order: o, _id: { $gt: id } }] }
  : { collectionId };
const items = await Request.find(q).sort({ order: 1, _id: 1 }).limit(limit + 1).lean();

// SQL (Sequelize)
const where = cursor
  ? { collectionId, [Op.or]: [{ order: { [Op.gt]: o } }, { order: o, id: { [Op.gt]: id } }] }
  : { collectionId };
const items = await SqlRequest.findAll({ where, order: [['order','ASC'], ['id','ASC']], limit: limit + 1 });
```

* Fetch `limit + 1` to know whether there is a next page without a `COUNT`.
* Response shape everywhere: `{ items, nextCursor }`.
* Cap `limit` server-side at 200 regardless of what the client asks for.
* The compound indexes this needs are in FIX-3: `(collectionId, folderId, order)` and `(userId, workspaceId)`.
* `history.ts` sorts by `executedAt` — its cursor is `(executedAt, _id)` and it needs an index
  `{ userId: 1, workspaceId: 1, executedAt: -1 }`.

* **Done when:** `measure.ts` shows every list endpoint answering in constant time at 100k rows, and no
  response carries more than 200 items.

---

## PERF-4 — Kill the N+1 queries

Each row is a confirmed round-trip multiplier. Fix with a batched query, never a loop.

| # | Where | What it does now | Fix |
|---|---|---|---|
| 1 | `routes/collections.ts:266-303` `PUT /reorder` | `resolveWorkspaceId(type, it.id)` **per item** (1–2 reads each), then one `repo.update` per item | One query to load all items; one bulk write |
| 2 | `routes/collections.ts:40-54` `checkPermission` | request → collection → workspace resolution on **every** mutating call (2 reads) | Denormalise `workspaceId` onto folders and requests; or cache (PERF-5) |
| 3 | `routes/history.ts:143-149` GC loop | `findOne().sort()` + `findByIdAndDelete` in a `while` loop until under quota | One ranged delete with a computed cutoff |
| 4 | `routes/history.ts:72-75` workspace clear | Loads **every** matching row into memory to sum bytes, then deletes | Aggregate the sum in the DB |
| 5 | `routes/admin.ts:32-39` | `find` + `countDocuments` on every page | Cursor paging (PERF-3); drop the count or cache it |
| 6 | `middleware/rbac.ts:18-29` | `WorkspaceRepository.findById` loads the whole workspace **including its full `members` array** to read one role | Project the matching member only; cache (PERF-5) |
| 7 | `RequestRepository.searchInWorkspace:131` | Takes `collectionIds: string[]` — at 100k collections this is a 100k-element `$in` | Query by `workspaceId` via a denormalised column, or search per page of collections |

#### Technical detail — #1, the reorder endpoint

```ts
router.put('/reorder', async (req: AuthRequest, res: Response) => {
  const { type, items } = req.body as { type: ItemKind; items: Array<{ id: string; order: number }> };
  if (!items?.length) return res.json({ message: 'Reordered' });
  if (items.length > 1000) return res.status(400).json({ message: 'Too many items' });

  // ONE query to load them all, instead of resolveWorkspaceId() per item.
  const ids = items.map((i) => i.id);
  const workspaceIds = await repoFor(type).findWorkspaceIdsByIds(ids);   // new, returns Set<string>
  if (workspaceIds.size === 0) return res.status(400).json({ message: 'Unknown items' });

  if (!req.user!.isSuperAdmin) {
    for (const wsId of workspaceIds) {
      const role = await getUserWorkspaceRole(String(req.user!._id), wsId);   // cached — PERF-5
      if (!role || role === 'viewer') return res.status(403).json({ message: 'Editor role required' });
    }
  }

  // ONE bulk write instead of N updates.
  await repoFor(type).bulkUpdateOrder(items);
  for (const wsId of workspaceIds) emitToWorkspace(wsId, 'workspace:reordered', { type, items });
  return res.json({ message: 'Reordered' });
});
```

```ts
// Mongo
await Request.bulkWrite(items.map(({ id, order }) => ({
  updateOne: { filter: { _id: id }, update: { $set: { order } } },
})));

// SQL — one statement, not N
await sq.query(
  `UPDATE requests SET "order" = CASE id ${items.map(() => 'WHEN ? THEN ?').join(' ')} END
   WHERE id IN (${items.map(() => '?').join(',')})`,
  { replacements: [...items.flatMap((i) => [i.id, i.order]), ...items.map((i) => i.id)] },
);
```

#### Technical detail — #3, the history GC loop

```ts
// Before: one query per deleted row, on the request path.
// After: find the cutoff in one aggregate, delete in one statement.
const rows = await History.find({ userId }).sort({ executedAt: 1 })
  .select({ executedAt: 1, 'responseSnapshot.body': 1 }).lean();
let freed = 0, cutoff: Date | null = null;
for (const r of rows) {
  if (usedBytes + bodySize - freed <= maxTotalMB) break;
  freed += Buffer.byteLength(r.responseSnapshot?.body ?? '', 'utf8');
  cutoff = r.executedAt;
}
if (cutoff) await History.deleteMany({ userId, executedAt: { $lte: cutoff } });
```

Better still: store `bodySize` as a column on the history row at write time so the sum is a
`SUM(bodySize)` aggregate instead of loading bodies. Do that.

#### Technical detail — #2 and #6, the resolution cost

Denormalising `workspaceId` onto `folders` and `requests` removes two reads from **every** mutating call:

```ts
// db/sql-models/index.ts — add to both models
workspaceId: { type: DataTypes.STRING(36), allowNull: false },
// and to the indexes array:
indexes: [{ fields: ['workspaceId'] }, { fields: ['collectionId'] }, /* … */]
```

Backfill in a migration (FIX-3, migration 002). Then `checkPermission` reads the item once and has the
workspace id directly — no chain. This also simplifies the admin export/import queries further (they
currently join through `collectionId`) and makes `searchInWorkspace` (#7) a single indexed query instead
of a 100k-element `$in`.

* **Done when:** `measure.ts` reports: reorder of 500 items ≤ 3 queries (from ~1,500); no endpoint above
  5 queries; history clear O(1) queries.

---

## PERF-5 — Cache RBAC and system config

* **Where:** `server/src/middleware/rbac.ts:18`, `server/src/repositories/SystemConfigRepository.ts`
* **Why:** `middleware/auth.ts:89` calls `SystemConfigRepository.getConfig()` on **every authenticated
  request** — one DB read per API call before anything else happens. `getUserWorkspaceRole` loads a whole
  workspace document per permission check, and `checkPermission` can call it twice in one request.

#### Technical detail

```ts
// server/src/utils/cache.ts
type Entry<T> = { value: T; expires: number };

export class TtlCache<T> {
  private map = new Map<string, Entry<T>>();
  constructor(private ttlMs: number, private max = 10_000) {}

  get(key: string): T | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) { this.map.delete(key); return undefined; }
    return e.value;
  }
  set(key: string, value: T) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);  // crude LRU
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
  }
  invalidate(prefix: string) {
    for (const k of this.map.keys()) if (k.startsWith(prefix)) this.map.delete(k);
  }
}

export const configCache = new TtlCache<SystemConfigRecord>(30_000, 1);
export const roleCache   = new TtlCache<UserRole | null>(30_000, 50_000);
```

Invalidation points — get these right or the cache becomes a permissions bug:

| Event | Invalidate |
|---|---|
| `PUT /api/admin/config` | `configCache` |
| Member added / removed / role changed (`routes/workspaces.ts`) | `roleCache.invalidate(\`${workspaceId}:\`)` |
| Workspace `isPublic` toggled | `roleCache.invalidate(\`${workspaceId}:\`)` |
| User suspended / deleted | `roleCache.invalidate(\`\`)` for that user's keys |

With multiple replicas the invalidation must be broadcast — publish it over the socket adapter / Redis
pub-sub (SOCK-3) so every node drops the entry. Until then, the 30 s TTL bounds the staleness. **Write
the TTL into the code comment** so nobody assumes it is instant.

* **Done when:** `measure.ts` shows one `SystemConfig` read per 30 s under sustained load instead of one
  per request, and an API test proves a revoked member loses access within the TTL.

---

## PERF-6 — Trim what the wire carries

* **Where:** every list endpoint; `routes/auth.ts:130-143` (`GET /me` returns `clientCertificates`
  including key material — also SEC-8)
* **Why:** `RequestRepository.findByCollection` returns the **full** record — `params`, `headers`, `auth`,
  `body`, `preRequestScript`, `testScript`, `comments` — for every request in the tree, just to render a
  sidebar row that shows a name and a method. On a 500-request collection that is megabytes for a list
  that needs kilobytes.

#### Technical detail

1. Add a summary projection (see `findByCollections` in PERF-1): `_id, collectionId, folderId, name,
   method, order`. Use it for every tree listing.
2. Full documents are fetched by `GET /api/requests/:id` when a tab opens — that route already exists
   (`collections.ts:196-203`).
3. Add compression — it is not installed today:

```ts
import compression from 'compression';
app.use(compression());          // before the routes
```

4. `GET /me` returns certificate metadata only.

* **Done when:** the tree payload for a 500-request collection is under 50 KB, asserted in a test.

---

## PERF-7 — Client bundle weight

* **Where:** `client/package.json`
* **Why:** `moment` (^2.30) **and** `date-fns` (^4.4) are both bundled; `lodash` is imported whole;
  `chai` and `crypto-js` ship to every user for the script sandbox; Monaco is loaded eagerly.

| Action | Detail |
|---|---|
| Drop `moment` | `grep -rn "from 'moment'" client/src` → migrate each to `date-fns`. `moment` is also injected into user scripts — keep it there via the lazy chunk below |
| `lodash` → per-function | `import debounce from 'lodash/debounce'` instead of `import _ from 'lodash'` |
| Lazy-load the script runtime | `const { default: chai } = await import('chai')` inside the sandbox worker, not at module top level |
| Lazy-load Monaco | `React.lazy` around the editor components; the sidebar and response headers do not need it |
| Self-host Handlebars | SEC-3 step 5 |
| Check `dexie` | It **is** used (`collectionStore.ts:101`) — keep it |
| Add a size budget to CI | `vite build` + a script that fails if the initial chunk exceeds 500 KB gzipped |

* **Done when:** the initial chunk is under 500 KB gzipped and CI fails on regression.

---

# SOCK — Realtime

## SOCK-1 — Apply deltas instead of refetching the tree

* **Where:** `client/src/components/common/SocketSync.tsx`
* **Why:** every structural event — and every window focus — calls `fetchCollectionsData`, which is the
  1 + 2×N storm from PERF-1. With 20 collaborators in a workspace of 200 collections, **one rename
  triggers 20 × 401 = 8,020 HTTP requests**.

#### Technical detail

```tsx
useEffect(() => {
  const s = socket;
  s.on('collection:updated', (c) => store.patchCollection(c._id, c));
  s.on('collection:deleted', (id) => store.removeCollection(id));
  s.on('folder:created',     (f) => store.addFolder(f));       // only if its collection is loaded
  s.on('folder:updated',     (f) => store.patchFolder(f._id, f));
  s.on('folder:deleted',     (id) => store.removeFolder(id));
  s.on('request:created',    (r) => store.addRequest(r));
  s.on('request:updated',    (r) => store.patchRequest(r._id, r));
  s.on('request:deleted',    (id) => store.removeRequest(id));
  s.on('workspace:reordered',({ type, items }) => store.applyOrder(type, items));
  return () => { /* off() every one */ };
}, [socket]);
```

Rules:

1. **Zero HTTP requests** in any handler. The payload is the update.
2. If the event's parent is not loaded (lazy loading, PERF-2), **drop the event** — do not fetch.
3. Replace the focus refetch with a cheap version check:
   `GET /api/workspaces/:id/version` → `{ version }` (a counter bumped on any structural change).
   Refetch only on mismatch.
4. Socket URL: replace `api.defaults.baseURL?.replace('/api','')` with an explicit
   `import.meta.env.VITE_SOCKET_URL ?? window.location.origin` — the current derivation breaks on a
   versioned base URL like `http://host/api/v1`.
5. Reconcile the local optimistic update with the echoed event: apply by `_id`, last-write-wins on
   `updatedAt`, so the actor does not see its own change flicker.

* **Done when:** a two-client test asserts the observer issues **zero** HTTP requests on receiving a
  rename and its sidebar shows the new name within 2 seconds.

---

## SOCK-2 — Cover every emit site with a two-client test

* **Where:** `tests/socket-realtime.spec.ts` covers `collection:updated` / `:deleted` only
* **Why:** coverage of one event in a family proves nothing about the others when they obtain their
  routing key differently — that is exactly how the original bug survived.

#### Technical detail

```bash
grep -n "emitToWorkspace" server/src/routes/*.ts     # derive the list from source, not from features
```

| Event | Route | Covered |
|---|---|---|
| `collection:created` | `POST /workspaces/:workspaceId/collections` | ✅ |
| `collection:updated` / `:deleted` | `PUT` / `DELETE /collections/:id` | ✅ |
| `folder:created` / `:updated` / `:deleted` | `collections.ts:127,140,148` | ❌ |
| `request:created` / `:updated` / `:deleted` | `collections.ts:191,213,219` | ❌ |
| `workspace:reordered` | `collections.ts:300` | ❌ |
| environment events | `routes/environments.ts` | ❌ |

Test shape — the observer must be a **separate connected client**, not a second tab:

```ts
const observed: any[] = [];
socketB.on('request:updated', (r) => observed.push(r));
await request.put(`${base}/api/requests/${requestId}`, {
  headers: { cookie: owner.cookie }, data: { name: 'renamed' },
});
await expect.poll(() => observed.length, { timeout: 3000 }).toBeGreaterThan(0);
expect(observed[0].name).toBe('renamed');
```

Clean up while you are there: `tests/socket-realtime.spec.ts:2` imports socket.io-client through
`../client/node_modules/...` (fragile), and its `once(socket, event)` helper ignores `event` and always
waits for `connect`. Move both to `tests/helpers/socket.ts` and fix them.

Add a CI guard so a new emit site cannot ship untested:

```bash
# every emitToWorkspace event name must appear in tests/
for ev in $(grep -ho "emitToWorkspace([^,]*, '[^']*'" server/src/routes/*.ts | sed "s/.*'\(.*\)'/\1/" | sort -u); do
  grep -rq "$ev" tests/ || { echo "No test for socket event: $ev"; exit 1; }
done
```

* **Done when:** every call site has a named test and the guard passes in CI.

---

## SOCK-3 — Redis adapter and horizontal scaling

* **Where:** `server/src/index.ts:47-57`, `k8s/deployment.yaml`, `k8s/ingress.yaml`
* **Why:** k8s runs `replicas: 2` + HPA. Without a shared adapter, a user on pod A never sees an event
  raised on pod B — and without sticky sessions, socket.io's handshake breaks across pods.

#### Technical detail

```ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

if (process.env.REDIS_URL) {
  const pub = createClient({ url: process.env.REDIS_URL });
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));
  console.log('🔴 Socket.io Redis adapter attached (horizontal scaling enabled)');
} else {
  console.log('⚪ Socket.io single-node mode (set REDIS_URL to scale out)');
}
```

Sticky sessions on the Ingress:

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/affinity: "cookie"
    nginx.ingress.kubernetes.io/session-cookie-name: "reqspace-affinity"
    nginx.ingress.kubernetes.io/session-cookie-expires: "86400"
    nginx.ingress.kubernetes.io/session-cookie-max-age: "86400"
```

Then move onto the same Redis: the rate limiter (SEC-10) and the caches (PERF-5, including cross-node
invalidation via pub-sub). Add an Active/Inactive indicator to the Admin Dashboard.

* **Done when:** a CI test boots two server processes against one Redis (service container), connects a
  client to each, raises an event on node A and asserts it arrives at the client on node B. Until this
  test exists, single-node socket tests are necessary but **explicitly insufficient** — say so in a
  comment on the spec.

---

## SOCK-4 — Connection hygiene at 10k sockets

* **Where:** `server/src/index.ts:77-103`
* **Why:** `join:workspace` currently issues **two DB reads per join** — `getUserWorkspaceRole` plus
  `UserRepository.findById` for the superadmin check (`index.ts:83-84`). 10,000 clients joining 5
  workspaces each is 100,000 reads.

#### Technical detail

1. Use the `roleCache` from PERF-5 for the role.
2. Carry `isSuperAdmin` in the JWT so the second read disappears:
   `jwt.sign({ sub: userId, sa: user.isSuperAdmin }, …)` in `middleware/auth.ts:18-22`. Keep the TTL
   short enough that a revoked superadmin loses it quickly, and invalidate on revoke.
3. Cap rooms per socket (say 20) and sockets per user (say 10); reject beyond it with a reason.
4. **Re-check membership on role change** and force-leave revoked users — today a removed member keeps
   receiving broadcasts until they disconnect:

```ts
// when a member is removed or downgraded:
const room = 'workspace:' + workspaceId;
const sockets = await io.in(room).fetchSockets();
for (const s of sockets) {
  if (String(s.data.userId) === String(removedUserId)) {
    s.leave(room);
    s.emit('workspace:access_revoked', { workspaceId });
  }
}
```

5. Handle token expiry on a live socket: verify periodically and disconnect with a reason the client can
   act on.
6. Load test: 10,000 concurrent connections, 100 joins/s. Record memory and p95 event latency.

* **Done when:** the load test holds 10k sockets under a documented memory ceiling with p95 delivery
  under 200 ms, and a test proves a revoked member stops receiving events immediately.

---

# TEST — Coverage

## Rules every new test must follow

1. **Two browser contexts, always, for anything realtime.** A single-browser test cannot detect a dead
   broadcast — the client updates its own tree optimistically, so the actor sees the change whether or not
   the server emitted anything. The **observer** is the subject of the assertion.
2. **The UI cannot test authorization.** The UI hides buttons a role may not use, so a UI test confirms the
   button is hidden and **never sends the request**. A route that wrongly accepts that request is invisible
   to every UI test that will ever be written. *If the UI can do it, test it through the UI; if the UI
   refuses to do it, that is exactly what the API test is for.*
3. **The database is a matrix axis, not a config edit.** `getDbConfig()` reads `process.env.DB_TYPE` ahead
   of any config file, so a leg is just a server process with different env vars. Each leg gets its own
   env, a **clean** database created and dropped by the harness, its own `DB_CONFIG_FILE`, and its own port.
4. **Tier the matrix.** Smoke (register → login → **first authenticated call** → workspace → collection →
   request → send) on all four backends every push; full suite on sqlite every push; full matrix nightly
   and before release. The first authenticated request is the single most valuable assertion in the matrix —
   it is where Mongoose-only paths fail on SQL.
5. **A test that passes before the fix is asserting on the wrong thing.** Write it, run it against
   unpatched code, watch it fail, then fix. Never commit a passing placeholder — use `test.fixme`.

## TEST-1 — Run the UI suite in CI

* **Where:** `.github/workflows/test.yml` — runs build + jest + `scripts/smoke-core.sh` only
* **Why:** ~800 Playwright tests exist and CI runs **none** of them. `docker-publish.yml` is gated on this
  workflow, so an image ships having never rendered the app once.

```yaml
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Playwright (sqlite)
        run: npx playwright test --project=chromium
        env:
          CI: 'true'

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Keep `retries: 2` on CI, but track every test that needed a retry — a flaky test is a bug to file, not
noise to absorb.

* **Done when:** deliberately breaking a selector makes CI red.

---

## TEST-2 — The database matrix

* **Where:** `playwright.config.ts:36` (`baseURL` commented out), `:85-89` (`webServer` commented out);
  every spec hardcodes `http://localhost:3005` (`grep -rn "localhost:3005" tests/ client/e2e/`)

#### Steps

1. **Mechanical URL refactor, one commit:** replace every hardcoded base with `baseURL`. For API calls in
   specs, use the `request` fixture's relative paths; Playwright resolves them against `baseURL`.
2. **Per-backend harness** — `tests/harness/server.ts`:

```ts
export async function startBackend(db: 'sqlite'|'postgres'|'mysql'|'mongodb', port: number) {
  const dbName = `reqspace_test_${db}_${Date.now()}`;
  await createDatabase(db, dbName);                    // drop + create, clean every run
  const proc = spawn('node', ['server/dist/index.js'], {
    env: {
      ...process.env,
      DB_TYPE: db,
      PORT: String(port),
      DB_CONFIG_FILE: `/tmp/db-config-${db}.json`,      // its own file — no cross-leg leakage
      ...connectionEnvFor(db, dbName),
    },
  });
  await waitForHealth(`http://localhost:${port}/api/health`);
  return { proc, async stop() { proc.kill(); await dropDatabase(db, dbName); } };
}
```

3. **Projects:**

```ts
projects: [
  { name: 'sqlite',   use: { baseURL: 'http://localhost:3011' } },
  { name: 'postgres', use: { baseURL: 'http://localhost:3012' } },
  { name: 'mysql',    use: { baseURL: 'http://localhost:3013' } },
  { name: 'mongodb',  use: { baseURL: 'http://localhost:3014' } },
]
```

4. Skip a leg locally when its connection string is absent; **fail** in CI if a leg was skipped:

```ts
if (process.env.CI && !process.env.TEST_DB_POSTGRES_URL) {
  throw new Error('CI must run every backend — TEST_DB_POSTGRES_URL is missing');
}
```

5. **Delete `test-all-dbs.ps1`.** It rewrites the real `server/.env`, depends on a running pm2 daemon,
   leaves the file rewritten if a run throws, and only ever exercised public routes — which is why it
   printed "ALL DATABASES TESTED SUCCESSFULLY" while the app was broken one request after login.

* **Done when:** `npx playwright test --project=postgres` runs the whole suite against a fresh Postgres,
  and CI runs all four nightly.

---

## TEST-3 — UI journey tests, per feature area

Each drives the real UI and asserts on what the user sees. One spec per area, all through `baseURL`, all
runnable on any backend. For each: the happy path, one permission-denied path, and one error path.

| # | Area | Must cover |
|---|---|---|
| 1 | **Auth** | Register; forced first-login password change; login; **logout asserting the cookie is cleared** (nothing tests this today); expired session redirect; Google SSO with a stubbed token endpoint |
| 2 | **Workspace** | Create, rename, settings, make public; invite a member at each role; change a role; remove a member (and assert they lose access); delete |
| 3 | **Collection tree** | Create / rename / duplicate / delete a collection; nested folders; move a request between folders; drag-reorder and assert the order survives a reload |
| 4 | **Request editing** | Method, URL, params ⇄ URL sync, headers, every body mode, every auth type, settings; dirty indicator; unsaved-close warning; undo/redo |
| 5 | **Sending** | Send; response in each mode (pretty / raw / preview / visualize); image and PDF responses; save to file; timing and size; error, timeout and CORS paths (SEC-0.2) |
| 6 | **Environments** | Create, duplicate, activate, edit; secret variables masked; `{{var}}` resolution in URL, headers and body; globals vs environment precedence; import / export |
| 7 | **Scripts** | Pre-request sets a variable the request uses; test assertions pass and fail; console output; `pm.sendRequest`; **a script cannot read `localStorage`** (SEC-3) |
| 8 | **History** | Entry appears after a send; search filters it; restore into a tab; save to a collection; delete one; clear workspace history; quota behaviour |
| 9 | **Runner** | Run a collection; iterations; CSV and JSON data files; per-request pass/fail; stop mid-run |
| 10 | **Import / Export** | cURL, raw HTTP, OpenAPI, Reqspace v2.1, environment; export then re-import and assert the tree matches |
| 11 | **Share** | Create a link; open it anonymously; **assert no auth, token or script is present** (SEC-0.6); revoke; assert 404 |
| 12 | **Admin** | User CRUD; promote / revoke / suspend; config save with masked secrets; audit log; workspace export and import |
| 13 | **Tabs** | Open many; reorder; close with unsaved changes; restore closed tab (FEAT-8); split pane (FEAT-7) |
| 14 | **Multi-user realtime** | Two browser contexts: a rename in A appears in B's sidebar; a delete in A removes it from B's tree |

Selector guidance: after UI-4 adds `aria-label`s, prefer `getByRole('button', { name: 'Send' })` over
`text=` and CSS. The current specs are full of `page.locator('input[type="text"]')`, which breaks on any
layout change.

* **Done when:** every area has a spec and `npx playwright test` passes on all four backends.

---

## TEST-4 — The API-authorization layer

* **Where:** `tests/api-authorization.spec.ts` (2 tests today)
* **Do:** for every mutating route, send the request four ways — anonymous, non-member, `viewer`,
  legitimate `editor` — and assert 401 / 403 / 403 / 2xx.

Table-driven, so adding a route is one line:

```ts
const CASES = [
  { name: 'update collection', method: 'put',    path: (c) => `/api/collections/${c.collectionId}`, body: { name: 'x' }, min: 'editor' },
  { name: 'delete request',    method: 'delete', path: (c) => `/api/requests/${c.requestId}`,       min: 'editor' },
  { name: 'save history',      method: 'post',   path: (c) => `/api/history/${c.historyId}/save`,   body: (c) => ({ collectionId: c.foreignCollectionId }), min: 'editor' },
  { name: 'wsdl import',       method: 'post',   path: () => `/api/import/wsdl`,                    body: (c) => ({ url: 'http://x', workspaceId: c.foreignWorkspaceId }), min: 'editor' },
  { name: 'admin import',      method: 'post',   path: (c) => `/api/admin/import/${c.workspaceId}`, min: 'superadmin' },
  { name: 'admin export',      method: 'get',    path: (c) => `/api/admin/export/${c.workspaceId}`, min: 'superadmin' },
  { name: 'delete comment',    method: 'delete', path: (c) => `/api/requests/${c.requestId}/comments/${c.otherUsersCommentId}`, min: 'author-or-editor' },
];
```

Also assert **mass assignment** explicitly: `PUT /api/collections/:id` with
`{ name: 'x', workspaceId: '<someone elses>' }` must leave `workspaceId` unchanged.

Add a CI guard: fail when a new route appears in `server/src/routes` with no matching entry in `CASES`.

* **Done when:** every case is covered and each one fails against the pre-fix code.

---

## TEST-5 — Client unit tests

* **Where:** `client/` has **no test runner at all**
* **Do:** add vitest (`npm i -D vitest @testing-library/react jsdom`), script `"test": "vitest run"`.

Cover the pure logic — fast, no browser:

| Module | Cases |
|---|---|
| `utils/variables.ts` | `{{var}}` resolution; precedence local > data > environment > collection > global; `$guid` / `$timestamp` / `$randomInt`; unresolved variables; nested and malformed braces |
| `utils/scripts.ts` (post-SEC-3) | Variable writes per scope; test result collection; console capture; error handling in a bad script |
| cURL parser (`routes/importExport.ts` logic, mirrored client-side) | Quoted headers; `--data-raw`; methods inferred from `-d`; multi-line with `\` |
| Raw HTTP parser | Request line; headers; blank-line body split; relative URL + `Host` |
| `CodeGenModal` generators | One snapshot per language |
| `requestStore` | openTab, closeTab with dirty, reorder, undo/redo, `partialize` strips secrets (SEC-4) |
| Response content-type detection | JSON, XML, HTML, image, PDF, octet-stream |

* **Done when:** `npm test --prefix client` runs in CI with a coverage floor on `client/src/utils` and
  `client/src/store`.

---

## TEST-6 — Scale and performance budgets

* **Where:** new `tests/perf/`, using the PERF-0 dataset
* **Do:** assert budgets, don't eyeball graphs. A budget that fails the build is the only kind that holds.

| Scenario | Budget |
|---|---|
| Open a workspace with 200 collections | 1 HTTP request, ≤ 3 DB queries, < 100 KB |
| Expand a collection with 500 requests | 1 HTTP request, < 50 KB, < 100 DOM rows |
| Reorder 500 items | ≤ 3 DB queries |
| List 50,000 history rows, page 500 | < 200 ms (cursor paging) |
| Global search across 100k requests | < 500 ms, ≤ 2 queries |
| 10,000 concurrent sockets | documented memory ceiling, p95 event delivery < 200 ms |
| Initial JS chunk | < 500 KB gzipped |

* **Done when:** the budgets run in CI and reintroducing a deliberate N+1 turns it red.

---

# UI — Client experience

## UI-1 — Replace native `prompt()` / `confirm()` with the app's own modals

* **Where (10 sites):** `Sidebar.tsx:58` (new workspace), `EnvironmentSidebar.tsx:19,44,55`,
  `AdminPage.tsx:68,462,555`, `HistorySidebar.tsx:141`, `UrlBar.tsx:367`, `RequestTabBar.tsx:83` —
  while `components/common/PromptModal.tsx` and `ConfirmModal.tsx` exist and are used elsewhere
* **Why:** unstyled, unthemeable, ignore the dark mode the rest of the app implements, block the Electron
  renderer, and cannot be labelled for accessibility. `tests/reqspace.spec.ts:32` has to install a native
  `dialog` handler to create a workspace, while the collection step immediately after drives the real modal.
* **Note:** `UrlBar.tsx:367` (the "a newer version exists — overwrite?" confirm) is replaced wholesale by
  the conflict UI in FEAT-5.6. Convert it to `ConfirmModal` now; replace it properly later.
* **Done when:** `grep -rn "window.prompt\|window.confirm\|[^.]\bconfirm(" client/src` returns nothing and
  the affected specs no longer register dialog handlers.

## UI-2 — One global feedback surface

* **Where:** ~32 components each hold their own `setError`; there is no toast anywhere
* **Do:** add `client/src/store/toastStore.ts` + a `<ToastHost/>` in `MainLayout`. Route API failures
  through it (from the axios interceptor, UI-3). Show success for save / delete / import, and a persistent
  banner while the socket is disconnected.
* **Done when:** a save that fails inside a modal that has already closed still surfaces a message.

## UI-3 — Handle 403 distinctly from 401

* **Where:** `client/src/api/axios.ts:8-17` — 401 only
* **Why:** a permission failure currently looks like a bug: the action simply does not happen.

```ts
api.interceptors.response.use(undefined, (error) => {
  const status = error.response?.status;
  if (status === 401) window.dispatchEvent(new CustomEvent('unauthorized'));
  if (status === 403) toast.error(error.response?.data?.message ?? "You don't have permission to do that in this workspace.");
  return Promise.reject(error);
});
```

Also remove the double `AuthGuard` on `/admin` (`App.tsx:228` wraps the route parent, `:230` wraps it again).

## UI-4 — Accessibility

* **Where:** the whole client — **zero** `aria-label` and **zero** `role=` attributes
  (`grep -rn "aria-label\|role=" client/src` → nothing but SVG assets)
* **Steps:**
  1. Every icon-only button gets an `aria-label` (the sidebar and tab bar are full of them).
  2. Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, a focus trap, `Escape` to close,
     focus restored to the trigger on close.
  3. The collection tree: `role="tree"` / `role="treeitem"`, arrow-key navigation, Enter to open, Space to
     expand.
  4. Visible focus rings (Tailwind `focus-visible:ring-2`), never `outline: none` without a replacement.
  5. Check contrast in **both** themes.
* **Bonus:** this is what lets Playwright use `getByRole(...)` instead of brittle `text=` selectors (TEST-3).
* **Done when:** an axe scan of the main screen, one modal and the admin page reports no critical violations.

## UI-5 — Style consistency

* **Where:** `client/src/App.tsx` uses inline `style={{}}` in ~20 places (lines 22-99, 193-198) where
  Tailwind is the convention
* **Do:** convert to Tailwind; extract the DB-error screen into `components/common/DbErrorScreen.tsx`.

## UI-6 — Fix stale copy

* **Where:** `client/src/pages/AdminPage.tsx:462` still warns that import will "overwrite system
  configuration"
* **Why:** the server stopped doing that; the warning now describes behaviour that no longer exists.

---

# FEAT — Features to build

Only these. Everything else from the parity list is in [`IGNORE.md`](IGNORE.md).

## FEAT-1 — WebSocket (ws / wss) client

* **Goal:** connect to a WebSocket endpoint, send and receive messages, read the transcript.
* **Transport note:** a browser **can** open a cross-origin WebSocket without CORS, so this works in the
  web build with no extension — unlike HTTP sending. Custom handshake headers are **not** possible from a
  page; Electron and the extension can add them. Disable that field in the plain-browser case with an
  explanation rather than silently dropping the headers.

#### Steps

1. **Tab type.** `requestStore` already has `tabType` (`'request' | 'environment'`). Add `'websocket'`, so
   the whole tab machinery — open, close, dirty, reorder, persistence — comes for free.
2. **Data model.** Store it as a request-like document so it lives in a collection and is shareable:
   `{ type: 'ws', url, subprotocols: string[], headers: KeyValue[], settings: { autoReconnect, maxRetries, pingIntervalMs } }`.
3. **Connection panel.** URL with `{{variable}}` resolution, subprotocols, headers, Connect / Disconnect,
   auto-reconnect toggle, and a status pill: `connecting` / `open` / `closing` / `closed(code, reason)` / `error`.
4. **Message composer.** Text / JSON / binary(base64); JSON gets Monaco with validation; `{{variable}}`
   resolution; a send-history dropdown (last 20).
5. **Transcript pane.** Columns: direction (`↑`/`↓`), timestamp, size, preview. Expand a row for the full
   payload with JSON pretty-print. Filter by direction and substring. Clear. Export as JSON.
   **Virtualise it** — a chatty socket produces thousands of rows in seconds (PERF-3).
6. **Lifecycle correctness.** Close codes matter: show `1000` (normal) differently from `1006` (abnormal).
   On auto-reconnect use exponential backoff with a cap and a visible retry count.
7. **Cleanup.** Close the socket when the tab closes and when the app unmounts. A leaked WebSocket per
   closed tab is the classic bug here.

* **Done when:** a Playwright test starts a local echo server, connects, sends `hello`, asserts the echo
  appears in the transcript, disconnects, and asserts the status shows a clean `1000` close.

---

## FEAT-2 — Socket.IO client

* **Goal:** the same, with Socket.IO semantics.

#### Steps

1. Reuse FEAT-1's tab type and transcript. Add Socket.IO-specific fields: `path` (default `/socket.io`),
   `transports` (`polling`, `websocket`), `auth` payload object, `namespace`, reconnection options.
2. **Named events** — this is the substance of the feature:
   * *Listeners*: a user-managed list of event names to subscribe to, plus a catch-all via `onAny` so
     unexpected events are still visible.
   * *Emit*: event name + JSON payload.
   * *Acknowledgements*: if the user requests an ack, pass a callback and render the ack payload as a
     paired row in the transcript.
3. Show the engine.io transport upgrade (polling → websocket) as a transcript entry — it is the first
   thing anyone debugs.
4. Surface connection errors distinctly: `connect_error` with the server's message, auth rejection,
   namespace not found.

* **Done when:** a test connects to the app's own `/ws` path, emits `join:workspace`, and asserts a
  subsequent `collection:created` broadcast appears in the transcript.

---

## FEAT-3 — Server-Sent Events (SSE)

* **Goal:** subscribe to a `text/event-stream` endpoint and watch events arrive.

#### Steps

1. Tab type `sse`. URL + headers (Electron/extension only — a page's `EventSource` supports **no** custom
   headers at all; say so in the UI).
2. Stream pane: one row per event with `event`, `id`, `data`, `retry`; JSON pretty-print; auto-scroll with
   a pause toggle; virtualised.
3. Honour `Last-Event-ID` on reconnect and show reconnect attempts with the server-advertised `retry`
   interval.
4. Stop / resume; export the stream as JSON or NDJSON.
5. Handle the non-obvious failure: a server that returns `text/event-stream` but never flushes. Show
   "connected, no events yet" rather than a spinner that looks hung.

* **Done when:** a test subscribes to a local SSE endpoint emitting three named events and asserts all
  three render with their event names and ids.

---

## FEAT-4 — Kafka events

* ⚠️ **Constraint — decide and record before coding.** Kafka speaks a binary protocol over raw TCP.
  Neither a page nor a Chrome extension can open a TCP socket (`chrome.sockets` is ChromeOS-app only), so
  SEC-0.7's extension does **not** cover this. The options are the Electron main process, a local agent, or
  a server-side bridge — and a server-side bridge contradicts SEC-0. **Recommended: Electron only for v1**,
  with the local agent as the later web answer.

#### Steps

1. **Connection profile.** Brokers (list), client id, SASL mechanism (`plain`, `scram-sha-256`,
   `scram-sha-512`), username/password, SSL on/off + CA, consumer group id. Credentials follow SEC-4 —
   never in `localStorage`; use the OS keychain in Electron.
2. **Produce.** Topic, key, value (text / JSON / raw), headers, explicit partition or `null` for the
   partitioner. Show the broker's ack: partition, offset, timestamp.
3. **Consume.** Subscribe to one or more topics; `fromBeginning` vs latest; a live list showing topic,
   partition, offset, key, headers, timestamp and value; JSON pretty-print; filter by key or value
   substring; **virtualised** (a busy topic produces thousands of rows per second); pause / resume;
   explicit commit-offset control with the current committed offset visible.
4. **Topic browser.** List topics, partition count, and per-partition high/low watermarks.
5. **Persistence.** Save the connection profile into a collection like any other request so it is
   shareable — with credentials stripped from any export or share (SEC-0.6).
6. **Error surfaces.** Broker unreachable, SASL failure, unknown topic, group rebalance in progress,
   deserialisation failure. Each needs a distinct message; "connection failed" is useless for Kafka.
7. Library: `kafkajs` in the Electron main process. Never bundle it into the renderer.

* **Done when:** a test against a containerised Kafka produces a message to a test topic and consumes it
  back through the UI, with the correct partition and offset shown.

---

## FEAT-5 — Collaboration

Build in this order. Each step is usable on its own; each later step depends on the earlier ones.

### FEAT-5.1 — Collection-level RBAC *(parity item 28)*

* **Goal:** a member's workspace role can be **narrowed** (never widened) on a specific collection.

```ts
interface CollectionAcl { collectionId: string; userId: string; role: UserRole; }
// indexes: (collectionId), (userId, collectionId) unique
```

* **The rule, in one place, used everywhere:**
  `effectiveRole = min(workspaceRole, collectionRole ?? workspaceRole)` by `ROLE_RANK`.
  A collection ACL can only reduce access. Write it once in `middleware/rbac.ts` and call it from
  `checkPermission` (`routes/collections.ts:40-54`) so folders and requests inherit it automatically.
* **UI:** a "Permissions" entry in the collection context menu listing workspace members with a role
  dropdown limited to their workspace role or lower.
* **Cache** with PERF-5; invalidate on any ACL change.
* **Done when:** API tests prove a workspace `editor` narrowed to `viewer` on one collection gets 403
  there and 2xx on a sibling collection.

### FEAT-5.2 — `@` mentions in comments *(parity item 33)*

* **Where:** `components/common/UserAutocomplete.tsx` exists but is used **only** in
  `WorkspaceSettingsModal.tsx:165` (the invite field); `components/request/CommentsEditor.tsx` has no
  mention support.
* **Steps:** trigger the autocomplete on `@` inside the comment editor; restrict candidates to workspace
  members; store mentions **structurally** (`mentions: [{ userId, offset, length }]`), not by parsing text
  later; render as chips that link to the member; create a notification row for the mentioned user.
* **Done when:** a test mentions a member and asserts that member sees it in their notifications, and that
  a non-member cannot be mentioned.

### FEAT-5.3 — Fork a collection *(parity item 29)*

* **Steps:** deep-copy a collection — folders (preserving nesting), requests, variables, scripts — into a
  workspace the actor may write to. Record `forkedFrom: { collectionId, versionId, forkedAt }`. Show a
  "forked from X" badge linking to the origin. Forbid forking a collection the actor cannot read
  (FEAT-5.1). Copy in batches; a 5,000-request collection must not be 5,000 inserts.
* **Done when:** a test forks a collection, edits the fork, and asserts the origin is byte-for-byte unchanged.

### FEAT-5.4 — Collection versioning *(prerequisite for merge)*

* **Steps:** an append-only `CollectionVersion { collectionId, contentHash, snapshot, authorId, createdAt,
  message? }`. Write a version on save **only when `contentHash` changes**, so repeated saves don't create
  noise. A version list in the collection panel; "restore this version" writes a *new* version rather than
  rewriting history. Prune to the last N per collection (configurable) so 100k collections don't become
  millions of snapshots.
* **Done when:** a test makes three edits, restores the first version, and asserts the content matches
  exactly and a fourth version was created.

### FEAT-5.5 — Pull requests *(parity item 30)*

```ts
interface PullRequest {
  id: string;
  sourceCollectionId: string;     // the fork
  targetCollectionId: string;     // the origin
  baseVersionId: string;          // the version the fork branched from
  status: 'open' | 'merged' | 'closed';
  title: string; description: string;
  authorId: string; reviewers: string[]; approvals: string[];
  createdAt: Date; mergedAt?: Date;
}
```

* **Diff view:** added / removed / changed folders and requests; for a changed request, a field-level diff
  (method, URL, headers, body, scripts) with the script diff rendered in Monaco's diff editor.
* Only a **target-workspace `editor`** may merge. The author may close their own PR.
* **Done when:** a test opens a PR from a fork, asserts a non-empty diff, merges it, and asserts the target
  collection now contains the change.

### FEAT-5.6 — Merge and conflict resolution *(parity item 31)*

* **Algorithm:** three-way merge against `baseVersionId`.
  * Changed on one side only → take it.
  * Changed identically on both → take it.
  * Changed differently on both → **conflict**.
  * Deleted on one side, edited on the other → **conflict** (never silently drop an edit).
* **UI:** a list of conflicting items; per item, *mine* / *theirs* / *edit manually* in a diff editor.
  Merge stays blocked while any conflict is unresolved.
* This also replaces the blunt `window.confirm('A newer version of this request exists… overwrite?')` at
  `UrlBar.tsx:367` with real conflict handling.
* **Done when:** a test creates a genuine conflict (both sides edit the same request's URL differently),
  resolves it by choosing one side, and asserts the merged result — and a second test asserts an
  unresolved conflict blocks the merge.

### FEAT-5.7 — Partner workspaces *(parity item 27)*

* **Goal:** a visibility tier between private and public — named external users or organisations get
  read-or-comment access to **selected collections only**.
* **Depends on FEAT-5.1** (collection-level ACL is the mechanism).
* Every partner grant is explicit, time-boundable, and audit-logged. A partner sees only granted
  collections and 403s on everything else in the workspace — including the workspace member list.
* **Done when:** a test grants a partner one collection and asserts they can read it, cannot read a
  sibling, and cannot enumerate members.

---

## FEAT-6 — Scope resolution visualizer *(parity item 56)*

* **Goal:** show which scope a `{{variable}}` resolved from.
* **Where:** `client/src/utils/variables.ts`, `client/src/components/common/VariableInput.tsx:12-20`
* **Why it needs a refactor first:** resolution currently merges arrays and returns a **string**
  (`VariableInput.tsx:20` spreads `globalEnvironment?.variables` into a flat list). The origin is lost at
  the moment of resolution, so there is nothing to visualise until the return type changes.

```ts
export type VariableScope = 'local' | 'data' | 'environment' | 'collection' | 'global' | 'dynamic';

export interface Resolution {
  key: string;
  value: string | undefined;
  scope: VariableScope | 'unresolved';
  definedIn?: string;                  // environment or collection name
  shadowed: Array<{ scope: VariableScope; value: string; definedIn?: string }>;
  isSecret: boolean;
}

export function resolveWithProvenance(text: string, ctx: VariableContext): {
  result: string;
  resolutions: Resolution[];
}
```

Precedence, highest first: `local` (`pm.variables.set`) → `data` (runner data file) → `environment` →
`collection` → `global` → `dynamic` (`$guid` etc.). Document it in the code, because the UI must match it.

**UI:**
1. Hover a `{{var}}` chip → popover with the resolved value (masked when `isSecret`), the winning scope,
   and the shadowed definitions in precedence order.
2. Colour-code the chip by scope; render **unresolved** variables in red — today they pass through as
   literal text, which is the single most common user confusion.
3. A "Variables" tab on the response showing every resolution used for that send.

* **Done when:** a test defines `token` in both global and environment scope, asserts the popover names
  the environment as the winner and lists the global as shadowed, and asserts an undefined `{{nope}}`
  renders as unresolved.

---

## FEAT-7 — Split pane *(parity item 65)*

* **Goal:** two tabs visible side by side.

```ts
interface PaneState { id: string; tabIds: string[]; activeTabId: string | null; }
interface LayoutState { panes: PaneState[]; layout: 'single' | 'vertical' | 'horizontal'; ratio: number; }
```

#### Steps

1. Move tab ownership from a flat `tabs` array into panes. Keep a single `tabsById` map so nothing else
   has to change — `requestStore.ts:101-102` currently holds `tabs` + `activeTabId`, so this is the
   invasive part; do it first and separately.
2. Max two panes. Drag a tab onto the other pane to move it; drag to the window edge to split.
3. Draggable divider, ratio persisted; collapse back to `single` when a pane empties.
4. Keyboard: focus-follows-pane, a shortcut to toggle split, a shortcut to move the active tab across.
5. **Each pane keeps its own scroll position and response state.** Sending in one pane must not touch the
   other — `activeRequest` is currently a single global (`requestStore.ts:185-211`), so it has to become
   per-pane.
6. Persist the layout (structure only — SEC-4).

* **Done when:** a test opens two requests side by side, sends in the left pane, and asserts the right
  pane's response and scroll position are unchanged.

---

## FEAT-8 — Restore closed tabs *(parity item 69)*

* **Goal:** `Ctrl/Cmd+Shift+T` reopens the tab you just closed, with unsaved edits intact.

#### Steps

1. A bounded stack (25) of closed-tab snapshots in `requestStore`, pushed in `closeTab`
   (`requestStore.ts:83`).
2. Shortcut registered alongside the existing shortcuts in `settingsStore`.
3. A "Recently closed" list in the tab bar's overflow menu, showing name and method.
4. Restore puts the tab back **at its original index**, not at the end.
5. Survives reload — but per SEC-4 the persisted snapshot carries structure only, so a restored tab marks
   credential fields as needing re-entry.
6. Clear the stack on logout.

* **Done when:** a test edits a request without saving, closes the tab, presses the shortcut, and asserts
  the edit and the tab position are both restored.

---

## FEAT-9 — Response size limits *(parity item 88)*

* **Goal:** a huge response never takes the app down.
* **Why now:** the old server proxy read the entire body into memory with `arrayBuffer()`
  (`proxy.ts:125`) before any size check. The new transport must not repeat that.

#### Steps

1. **Setting:** global default (50 MB) in `settingsStore`, per-request override in `RequestSettings.tsx`,
   and an admin-enforced ceiling in `SystemConfig` that a user override cannot exceed.
2. **Enforce while streaming**, in every transport:

```ts
async function readCapped(stream: ReadableStream<Uint8Array>, cap: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0, truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) { truncated = true; await reader.cancel(); break; }   // stop pulling bytes
    chunks.push(value);
  }
  return { bytes: concat(chunks), total, truncated };
}
```

3. **Viewer:** render the truncated body with a clear banner ("showing the first 50 MB of N MB") and a
   "download full response" action that streams to disk instead of into memory.
4. Never call `arrayBuffer()` / `text()` on an unbounded body anywhere.
5. Apply the same cap to the history write (SEC-0.3) — the existing per-user quota already truncates, but
   it must never receive a 200 MB string in the first place.

* **Done when:** a test requests a 200 MB response with a 10 MB cap and asserts the UI stays responsive,
  shows the truncation banner, and the tab's memory does not grow by 200 MB.

---

## FEAT-10 — Server-side collection export/import (v2.1) *(parity item 59)*

* **Goal:** export and import work from the API, not only from the client's in-memory tree, in the same
  v2.1 format the client already produces.
* **Where:** `server/src/routes/importExport.ts` now has a real, role-checked, id-remapping
  `GET /collections/:id/export` and `POST /collections/import` (closed as part of SEC-2's holes #3/#4),
  but they use their own flat `{ version: 1, collection, folders, requests }` shape — **not** the nested
  v2.1 `item` tree the client already builds at
  `client/src/components/collection/CollectionExplorer.tsx:720+` (`exportCollection`). Nothing calls
  these two routes yet; the UI still only exports/imports through that client-side function.
* **Remaining steps:**
  1. Move the v2.1 serialiser into code both sides can import (e.g. `shared/collectionFormat.ts`, or
     duplicate deliberately with a shared test fixture if there is no shared build), and switch the two
     routes above to produce/consume it.
  2. **Stream** the export JSON (`res.write` per item) rather than building the whole string — a
     5,000-request collection must not be serialised into one buffer.
  3. Add Zod validation (SEC-9) and a size cap on import.
  4. **Strip secrets by default** on export: request `auth` blocks and headers matching the SEC-0.6
     denylist are replaced with placeholders. An explicit `?includeSecrets=true` is allowed for an
     `owner` and is **audit-logged**.
  5. Wire the UI to the server routes and delete the client-side duplicate, so there is one
     implementation.

* **Done when:** an API round-trip test exports a collection containing folders, scripts and variables in
  the v2.1 format, re-imports it into a different workspace, and asserts the tree matches — plus a test
  asserting a bearer token is absent from a default export and present with `includeSecrets=true` as an
  owner.

---

# CLEAN — Cleanup

| Item | Where | Action |
|---|---|---|
| Empty runner route | `server/src/routes/runner.ts`, mounted at `index.ts:171` | Delete both. The collection runner is a client feature |
| Duplicate admin bootstrap | `ensureDefaultAdmin` in `server/src/models/User.ts` vs `index.ts:220-249` | Keep the one in `index.ts`; delete the other |
| Broken emoji comments | `server/src/routes/share.ts:11,37` (`// ?? GET …`) | Fix or remove |
| Inconsistent naming | Repo folder `postman`, product Reqspace, Electron `appId: com.reqspaceclone.app`, default DB `postman_clone` | Pick one name and apply it |
| Dead dependencies | `server/package.json` | Check and drop: `multer` (1.4.5-lts.1 is end-of-life), `archiver`, `postman-collection`, `http-proxy-middleware` + `undici` (SEC-0.4), `ajv` (SEC-9) |
| Test husks | `tests/socket-sync.spec.ts`, `tests/massive-permissions.spec.ts` | Comment-only files kept because an earlier session could not delete files. Delete them |
| Stale doc references | `scripts/smoke-core.sh:5`, `tests/api-authorization.spec.ts:8` → removed `TESTING.md`; `server/src/tests/ssrf.test.ts:5` → removed `CODE_REVIEW.md` | Repoint at this file (or delete with SEC-0.4) |
