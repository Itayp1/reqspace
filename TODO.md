# TODO — Reqspace

Execution plan. Written for someone who has **not** seen the codebase or the discussion behind it.

**Every claim in this file was re-verified against the source on 2026-09-25.** The previous revision had
drifted badly — it described a ReDoS vulnerability that no longer existed, pointed at files that had been
deleted, and proposed a CSP that would have broken three features. Items that turned out to be already
done or no longer applicable were **deleted**, and are listed once in
[Removed on 2026-09-25](#removed-on-2026-09-25) at the end so nobody re-adds them. If you find a claim here
that does not match the code, the code wins — fix this file in the same commit.

Every task has:

* **Status** — verified real / partially done, and how big it is.
* **Goal** — what "working" means, in one sentence.
* **Verified state** — exact files and line numbers, and what the code there actually does today.
* **Why** — the concrete failure. Never "best practice".
* **Change** — the actual code, index, query or command. Copy it, adapt names, verify it compiles.
* **Traps** — what breaks if you implement it the obvious way. Read this before writing code.
* **Done when** — the test that proves it. No task is finished without one.

## Rules

1. **Do not invent scope.** If it is not in this file and not in [`IGNORE.md`](IGNORE.md), ask first.
2. **`IGNORE.md` is binding.** Do not build, plan or suggest anything listed there. (Its section B — "already
   built" — has its own drift: it still points at `server/src/models/AuditLog.ts`, `routes/capture.ts` and
   `CaptureTrafficModal.tsx`, all of which are deleted. Treat B as a hint, not a citation.)
3. **Order:** `SEC` → `FIX` → `PERF` → `SOCK` → `TEST` → `UI` → `FEAT` → `CLEAN`. Within a section, top to
   bottom. Two exceptions are called out in place: SEC-10 has a hard prerequisite, and PERF-0 must precede
   every other PERF item.
4. **One task per commit.** Commit message starts with the task id: `SEC-2: close the four authz holes`.
5. **Every task ships a test that fails before the change and passes after.** Write the test first, watch
   it fail.
6. **No new `any`.** All database access goes through `server/src/repositories/*.ts` — nothing else may
   import Sequelize models directly. (The old rule named `server/src/models/`, a Mongoose directory that no
   longer exists; Mongo was removed entirely in commit `36b3331`.)
7. **Delete the task from this file in the same commit that completes it**, and add a line to
   [Removed](#removed-on-2026-09-25) saying what shipped.

## Before you touch anything

* **A build error is a production outage.** `deploy.js` runs `npm run build` for `client/` then `server/`
  and PM2 restarts on any non-zero exit, with no `max_restarts` or `restart_delay` in
  `ecosystem.config.js`. A type error therefore becomes an instant crash loop. Run **both** builds before
  every commit. (Capping the restarts is a `CLEAN` item.)
* **The two tsconfigs differ.** `server/tsconfig.json` has no `noUnusedLocals`; `client/tsconfig.app.json`
  sets `noUnusedLocals` **and** `noUnusedParameters`. An unused import compiles on the server and fails the
  client build.
* **`server/src/index.ts` does not export `app`.** Any `supertest` test needs `export { app };` added
  first, and note `bootstrap()` runs at module scope on import — prefer extracting pure functions into
  `server/src/utils/` and unit-testing those.
* **Router mount order is load-bearing.** `collectionsRouter`, `environmentsRouter` and `historyRouter` are
  mounted on the bare `/api` prefix and each calls `router.use(authenticate)` with no path, so they
  swallow every `/api/*` request that reaches them. Anything with a deliberately public route (today:
  `shareRouter`) must be mounted **before** them — see the comment at `server/src/index.ts:162-165`.

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
| **Repository** | `server/src/repositories/*.ts`. The only place allowed to touch Sequelize. Every repository returns a plain record type. |
| **The three backends** | sqlite, postgres, mysql. Selected by `DB_TYPE`, which also still accepts `mssql`. |
| **Transport** | The thing that actually sends a user's HTTP request. Today it is the Reqspace server (`routes/proxy.ts`); SEC-0 is the decision to change that. |
| **Two-client test** | A test with two connected socket clients where the *observer* (which did not act) is the subject of the assertion. |

## Where the tests actually live

| Suite | Path | Runs in CI? |
|---|---|---|
| Server unit + live-auth e2e (jest) | `server/src/tests/*.test.ts` | ✅ `npm test --prefix server` |
| Browser e2e (Playwright, 25 spec files) | `tests/e2e/*.spec.ts` | ❌ **nothing runs them** — TEST-1 |
| Core smoke (bash + curl) | `scripts/smoke-core.sh` | ✅ |

CI is `.github/workflows/test.yml`: build server → build client → boot a real sqlite-backed
`node server/dist/index.js` on port 3005 → jest → smoke script. The live server matters:
`server/src/tests/auth.e2e.test.ts` makes real HTTP calls to `localhost:3005` and fails in isolation
without it. That is expected, not a regression.

---

# SEC — Security



* **Status:** completed
* **Goal:** a self-registered user is an ordinary user.
* **Verified state:** `server/src/routes/auth.ts:54` creates the user with
  `authType: 'password', isSuperAdmin: true`. Introduced in commit `c965de2` (2026-09-25). Confirmed
  empirically: registering `bob.outsider@example.com` against a fresh instance returned
  `"isSuperAdmin": true`. `allowSelfRegistration` defaults to `true`
  (`server/src/repositories/SystemConfigRepository.ts:57`).
* **Why:** anyone who can reach the login page can grant themselves full superadmin — every workspace, the
  admin dashboard, user management, audit logs and system configuration. It also silently defeats the whole
  RBAC layer, because `requireWorkspaceRole` and `requireRoleOnCollection` both short-circuit for
  superadmins, so no membership check applies to a self-registered account.
* **Change:** `isSuperAdmin: false`. The bootstrap superadmin in `server/src/index.ts:226-252` is the only
  account that should ever be created with that flag, and it already handles the "no admin exists yet" case.
* **Operational, alongside the code fix:** audit the `users` table for unexpected superadmins — any account
  created while this was live still carries the flag, and fixing the route does not revoke it. Until it is
  fixed, disable self-registration in the Admin Dashboard or do not expose the instance.
* **Done when:** an API test registers a user and asserts `isSuperAdmin` is false in the response **and** in
  the database, and asserts that user gets 403 from an admin-only route.

---

## SEC-0 — Delete the server-side proxy entirely

* **Status:** verified real, **deferred by the owner on 2026-09-25.** Nothing below is being built right
  now. It stays in this file because half the other tasks reference it and because the decision it records
  must not be re-litigated from scratch. **Do not start any SEC-0 subtask without saying so explicitly.**
* **Size:** XL — the largest item in this file by an order of magnitude.

**Owner's decision:** the Reqspace server must never issue an HTTP request on a user's behalf. Request
sending belongs to the client. This one change removes an entire class of vulnerability: the anonymous open
proxy, all SSRF surface, the proxy DoS vectors, the stored upstream-proxy credentials, and the server-side
response-handling path.

### SEC-0.0 — Transport decision (read before touching any code)

A web page **cannot** send arbitrary cross-origin HTTP requests. CORS forbids custom headers and non-simple
methods unless the *target* server opts in — and the target is a third-party API we do not control. Naively
moving sending into `fetch()` inside the SPA means **most requests stop working**. This is why every API
client has a proxy, an agent or an extension.

| Option | Where the request is made | Works in a browser tab? | Cost |
|---|---|---|---|
| **A. Electron** | Electron main process, over IPC | n/a — desktop build | Smallest change. No CORS at all. |
| **B. Chrome extension** | MV3 service worker with `host_permissions` | ✅ | Per-browser build, store review, install friction. |
| **C. Local agent** | A small binary on `localhost` called by the SPA | ✅ | A new artifact to build, ship, update, document. |

**Decision: A + B.** Electron uses its main process; the web build talks to a Chrome extension (SEC-0.7).
C is documented as a future fallback and is **not** built.

**Why the extension works:** an extension service worker granted `host_permissions` is not subject to the
page's CORS rules. It can `fetch` any origin, read the full body, and see response headers a page never
could. The page never makes the cross-origin call — it asks the extension to.

### SEC-0.1 — Inventory of server-side outbound calls

Done — this is the verified output of
`grep -rn "undiciFetch\|await fetch(\|ProxyAgent\|createSafeLookup\|assertSsrfSafe\|soap\." server/src`:

| Call site | Verdict | Reason |
|---|---|---|
| `routes/proxy.ts:5,75,82,93,120` | **move** | This *is* the user proxy |
| `routes/shareProxy.ts:4,54,55,76,83,87` | **move, then delete** | Anonymous user proxy |
| `routes/importExport.ts:8,132,134` (`soap.createClientAsync`) | **move** | Fetches a user-supplied WSDL URL |
| `routes/auth.ts:202,218` (Google token + userinfo) | **keep** | Server-to-Google, fixed hosts, server's own credentials |

Two rows from the previous revision were wrong and are gone: `routes/capture.ts:140` (the file is deleted)
and "`routes/admin.ts` SMTP send", which never existed —
`grep -rn "nodemailer\|createTransport\|sendMail" server/src` returns nothing. The `SystemConfig.auth.smtp`
**config fields** exist, but nothing sends mail.

### SEC-0.2 — Build the client transport abstraction

* **Goal:** one module decides *how* a request goes out, so no UI component knows or cares.
* **Where:** new `client/src/transport/` — `types.ts`, `index.ts`, `electron.ts`, `extension.ts`, `browser.ts`
* **Verified callers to migrate** — all five still call `POST /api/proxy`:
  `client/src/components/request/UrlBar.tsx:250`,
  `client/src/components/collection/CollectionRunnerModal.tsx:103`,
  `client/src/utils/scripts.ts:175`,
  `client/src/components/request/LoadTestModal.tsx`,
  `client/src/pages/SharedCollectionPage.tsx:19`.
* **Done when:** `grep -rn "api.post('/proxy'" client/src` returns nothing and a Playwright test sends a
  request through the abstraction with the transport stubbed.

### SEC-0.3 — Move history writing to a client-driven, server-validated endpoint

* **Goal:** history still works once the server never sees the response.
* **Where:** `server/src/routes/proxy.ts:149-170` writes history today from data only the server had.
* **Note:** the response-size cap (FEAT-9) applies here — the endpoint must never accept a 200 MB body.
* **Done when:** API tests prove a viewer can write their own history, a non-member gets 403, and an
  oversized body is rejected rather than truncated after the fact.

### SEC-0.4 — Delete the routes and everything that existed only for them

* **Done when:** `grep -rn "api/proxy\|shareProxy\|assertSsrfSafe\|createSafeLookup" server/src client/src`
  returns nothing, and `undici` + `http-proxy-middleware` come out of `server/package.json`. (`undici` has
  **3** live usages today and is the one dead-looking dependency that must **not** be dropped before this
  lands — see CLEAN.)

### SEC-0.5 — ~~Decide the fate of traffic capture~~ — **removed, moot**

`server/src/routes/capture.ts` and `client/src/components/layout/CaptureTrafficModal.tsx` were both deleted
in commit `36b3331`. Only stale *copy* remains, which is now a CLEAN row:
`server/src/utils/ssrf.ts:6` still says "share-proxy, capture, and WSDL-import routes", and
`client/src/pages/AdminPage.tsx:391` still tells admins the setting affects "every user's Send / share-link
/ capture requests".



* **Status:** verified real — and this one is worth doing **even though the rest of SEC-0 is deferred.**
  It is independent of the transport decision.
* **Verified state:** `server/src/routes/share.ts:9-31` — `GET /api/share/:shortId` returns the whole
  `collection` row plus whole `requests` rows: `auth`, `headers`, `body`, `preRequestScript` and
  `testScript`. The short id is `crypto.randomBytes(6)` at `:49`. The file contains **only two routes** —
  there is no DELETE, so a leaked link can never be killed. No rate limit either.
* **Why:** a share link is a public, unauthenticated URL. Today it hands every anonymous visitor the bearer
  tokens, basic-auth passwords and API keys saved on every request in the collection, plus any script the
  author wrote. One link posted in a ticket leaks the collection's credentials permanently.
* **Change:** project the response down to what a viewer needs (`name`, `method`, `url`, non-sensitive
  headers, `description`); strip `auth` to its type; drop both script fields entirely; add
  `DELETE /api/share/:shortId` with an owner check; rate-limit the public GET.
* **Traps:**
  1. The previous revision's fix snippet was **Mongoose** (`SharedLink.findOne({shortId})`, `deleteOne()`,
     `.lean()`). Mongoose is gone. Use `SqlSharedLink.findOne({ where: { shortId } })` and `.destroy()`.
  2. **Extra bug found while verifying:** `share.ts:62` returns
     `token: crypto.randomBytes(32).toString('hex')` — a *freshly generated* value, not the `link.token`
     stored at `:54`. The token handed to the client can never match the one in the database. Decide what
     `token` is for and either wire it correctly or delete the field; do not leave a credential-shaped
     value that means nothing.
  3. The route is mounted **before** the bare-`/api` routers on purpose (`server/src/index.ts:162-167`).
     Do not reorder it — that is what broke anonymous viewing once already.
* **Done when:** an API test creates a share link for a collection whose request carries a bearer token and
  a test script, fetches it anonymously, and asserts neither the token nor the script appears; and a
  revoked link returns 404.

### SEC-0.7 — Build the Chrome extension transport

* **Status:** greenfield, nothing exists (`extension/` and `client/src/transport/` are both absent).
* Subtasks, unchanged and still accurate: **0.7.1** MV3 manifest and skeleton · **0.7.2** the request
  bridge · **0.7.3** restore the headers Chrome strips (`Origin`, `Referer`, `Cookie`, `Host`,
  `User-Agent`) via `declarativeNetRequest` · **0.7.4** cookie policy — default `credentials: 'omit'`,
  because attaching ambient cookies silently turns every request into a potential CSRF · **0.7.5** harden
  the extension (origin allowlist, no `<all_urls>` beyond what is needed) · **0.7.6** app-side integration
  and install prompt · **0.7.7** build, test and ship, with a CI Playwright project that runs the core send
  flow through the extension.
* Read `IGNORE.md`'s "browser-extension traffic interceptor" row before starting: that declined feature is
  **not** this one, and the distinction is the permission surface.

---



* **Status:** verified real · **Size:** L · Also the prerequisite for dropping `'unsafe-eval'` in SEC-10.
* **Goal:** a pre-request or test script cannot read the user's session, tokens, cookies or DOM.
* **Verified state:**
  * `client/src/utils/scripts.ts:134` and `:312` run user scripts with
    `new Function('pm', 'reqSpace', '_', 'moment', 'CryptoJS', 'console', script)` — **on the main thread**,
    with `window`, `document` and `localStorage` in scope.
  * `scripts.ts:8` imports the app's authenticated axios instance and hands it to `pm.sendRequest` at
    `:175-178` (`api.post('/proxy', …)`). A script therefore has the user's session.
  * `client/src/sandbox/worker.ts` **already exists** — 95 lines, with a working `pm` shim (environment,
    globals, variables, request, response, test, expect, sendRequest) and its own `new Function` at `:77`.
    **Nothing instantiates it:** `grep "new Worker" client/src` returns nothing, and the only reference is
    a *comment* at `client/src/components/collection/RunnerModal.tsx:16`. It is dead code.
  * `client/src/components/response/ResponseViewer.tsx:377-381` — the HTML preview iframe has
    `sandbox="allow-same-origin"`. `:537-540` — the visualizer iframe has **no `sandbox` attribute at all**
    and loads `handlebars@latest` from jsDelivr.
* **Why:** a malicious test script in a shared collection can read whatever is in browser storage and issue
  requests as the user. Two half-built sandboxes (the dead worker and the live `new Function`) is how this
  gap survived.
* **Change:**
  1. **One sandbox, not two.** Keep `sandbox/worker.ts`, delete the `new Function` paths in `scripts.ts`.
  2. The worker receives **data only** — never a live object. Host→worker: `{type:'run', phase, script,
     request, response?, variables}`. Worker→host: `{type:'result', variableWrites, testResults,
     consoleLines, visualizer?}`. Async: `{type:'sendRequest', id, request}` answered with
     `{type:'sendRequestResult', id, response|error}`. The host validates scope and key before applying
     `variableWrites`; the worker never touches a store.
  3. `pm.sendRequest` becomes a message the host routes and caps (e.g. 10 requests per run) — an
     allowlisted channel, not a handed-over HTTP client.
  4. Visualizer iframe: add `sandbox="allow-scripts"` and **never** `allow-same-origin` — that combination
     gives an opaque origin, so Handlebars runs but `parent`, `localStorage` and cookies are unreachable.
  5. Self-host Handlebars instead of fetching `@latest` from a CDN on the render path (this is also SEC-10
     blocker 3 — do them together).
  6. HTML preview iframe: `sandbox="allow-same-origin"` → `sandbox=""`. Scripts are already blocked, so the
     grant buys nothing and becomes a real origin grant the day someone adds `allow-scripts`.
* **Traps:** there are **two** runner modals — `RunnerModal.tsx` and `CollectionRunnerModal.tsx`. The dead
  worker comment is in the former; the live runner that calls `POST /api/proxy` is the latter. Know which
  one you are editing. Note also that `server/src/routes/runner.ts` is a stub returning
  `'Run started (stub)'` — the runner is entirely client-side, so there is no server counterpart to
  sandbox.
* **Done when:** a test script running
  `pm.test('leak', () => pm.expect(typeof localStorage).to.equal('undefined'))` passes, a script touching
  `window.parent` fails, and a Playwright test asserts the visualizer frame cannot reach `parent`.

---



* **Status:** verified real · **Size:** M
* **Verified state:** `server/src/routes/auth.ts:294-314` stores `{hostname, cert, key, passphrase}` in
  clear text, and `:140` (`GET /api/auth/me`) returns the **whole array** — PEM private key and passphrase
  included — on every session check. Storage is the `users.clientCertificates` TEXT column
  (`server/src/db/sql-models/index.ts:200`, added by migration `002`).
* **Change:** a `server/src/utils/cryptoBox.ts` with AES-256-GCM `seal`/`open` keyed from
  `CERT_ENCRYPTION_KEY` (32 bytes as 64 hex chars, validated at use). `POST /certificates` seals `key` and
  `passphrase`; `GET /me` returns metadata only (`{ _id, hostname, createdAt }`) — never `cert`, `key` or
  `passphrase`. Add `CERT_ENCRYPTION_KEY` to `server/.env.example` and the README secrets inventory.
* **Traps:**
  1. The previous revision said "decrypt only at the moment a certificate is handed to the Electron
     transport" — **there is no Electron transport** (that is SEC-0.2, deferred). The only consumer today
     is `server/src/routes/proxy.ts:60` (`req.user?.clientCertificates`). So either add the decrypt call
     there now, or sequence SEC-8 after SEC-0.4 deletes that file. Decide before starting.
  2. Narrowing `GET /me` changes a shape the client already renders:
     `client/src/components/common/GlobalSettingsModal.tsx:11,28,40` reads `user.clientCertificates`. Update
     it in the same commit or the settings screen breaks.
  3. Existing rows are plaintext. The read path needs to tolerate both until a migration re-seals them —
     and that migration needs `CERT_ENCRYPTION_KEY` present, so it must fail loudly rather than silently
     skipping.
* **Done when:** a repository test asserts the stored `key` is not the plaintext PEM, and an API test
  asserts `GET /api/auth/me` contains no `-----BEGIN` string.

---

## SEC-9 — Validate every request body with Zod

* **Status:** verified real · **Size:** L (33 routes) · Roll out per route group, one commit each.
* **Verified state:** `zod` is at `server/package.json:73` and `grep "from 'zod'" server/src` returns
  **nothing**. `ajv ^6.15.0` sits at `:43`, also unused. There is no `server/src/middleware/validate.ts`
  (the middleware directory holds only `auth.ts`, `rateLimit.ts`, `rbac.ts`). The surface is **33**
  `POST`/`PUT`/`PATCH` routes across `server/src/routes/*.ts`. `AuthRequest.user?: any` is confirmed at
  `server/src/middleware/auth.ts:11`.
* **Why:** the mass-assignment fixes so far are hand-written allowlists scattered through handlers. One
  missed field is one privilege escalation.
* **Change:** a `validate(schema)` middleware whose whole point is the reassignment —

  ```ts
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid request body', issues: … });
  req.body = parsed.data;      // unknown keys are DROPPED, not merely ignored
  ```

  plus per-resource schemas in `server/src/schemas/`, each `.strict()` so a foreign `workspaceId` is
  **rejected** rather than silently dropped. Roll-out order: the SEC-2 routes → auth → admin →
  collections/environments/history. Replace `AuthRequest.user?: any` with a real `AuthUser` interface while
  you are in the file, then remove `ajv`.
* **Traps:** the previous revision also proposed adding `params: Record<string, string>` to `AuthRequest` —
  that is **already there** at `middleware/auth.ts:15`. Do not add it twice.
* **Done when:** a test walks the Express router stack and fails if any `POST`/`PUT`/`PATCH` route lacks
  `validate`, and posting `{ name: 'x', workspaceId: '<other>' }` to `PUT /api/collections/:id` returns 400.

---

## SEC-10 — Baseline HTTP hardening, the remaining half

* **Status:** verified real, **with three blockers that must be cleared first** · **Size:** M-L ·
  **Do this last in the SEC section** — it is the only item here that can break the UI.
* **Verified state:** `server/src/index.ts:115` is `app.use(helmet({ contentSecurityPolicy: false }))` —
  no CSP, no HSTS. `server/src/middleware/rateLimit.ts` is an in-memory fixed-window limiter keyed strictly
  by `req.ip`, applied to exactly three routes (`routes/auth.ts:14-15` → `/register`, `/login`,
  `/google`). Nothing else in the API is throttled.


* **Status:** completed


* **Status:** completed


* **Status:** completed


* **Status:** completed


* **Status:** completed

# FIX — Broken in place

Numbering note: FIX-2, FIX-3, FIX-4 and FIX-5 are absent because they shipped. See
[Removed](#removed-on-2026-09-25). Their numbers are not reused, so old commit messages stay meaningful.


* **Status:** completed

# PERF — Efficiency at 10k workspaces / 100k collections / 100k requests

Every item below is a measured defect at the target scale. Each task must report a number: queries issued,
rows touched, bytes transferred, milliseconds.

## PERF-0 - Completed

* **Status:** completed
* **Results (SQLite):**
  * Login: 35ms, 1 queries
  * List workspaces: 4ms, 1 queries
  * Open workspace: 9ms, 5 queries
  * List history: 3ms, 1 queries

## PERF-1 — Opening a workspace issues 1 + 2×N HTTP requests

* **Status:** completed
* **Verified state:** `client/src/store/collectionStore.ts:117` fetches the collection list, then `:127-130`
  runs a `Promise.all` over every collection issuing **two** requests each —
  `api.get('/collections/:id/folders')` and `/requests`. A workspace with 200 collections therefore fires
  **401 HTTP requests** on open, and again on every socket event and every window focus (SOCK-1). Each one
  runs `checkPermission` → `resolveWorkspaceId` → 1-2 DB reads (PERF-4 #2).
* **Change — part 1, one batched endpoint** (a stop-gap that is one line for the client):

  ```ts
  // server/src/routes/collections.ts
  router.get('/workspaces/:workspaceId/tree', requireWorkspaceRole('viewer'), async (req, res) => {
    const collections = await CollectionRepository.findByWorkspace(req.params.workspaceId, { limit: 200 });
    const ids = collections.map(c => c._id);
    const [folders, requests] = await Promise.all([
      FolderRepository.findByCollections(ids),
      RequestRepository.findByCollections(ids, { summaryOnly: true }),   // PERF-6 projection
    ]);
    return res.json({ collections, folders, requests });
  });
  ```

* **Change — part 2:** PERF-2. Part 1 alone still ships the whole tree; it is a bridge, not the destination.
* **Traps:** `FolderRepository.findByCollections` and `RequestRepository.findByCollections` **do not
  exist** — only the singular `findByCollection` (`server/src/repositories/RequestRepository.ts:51`). Write
  them as part of this task, with an empty-array guard before the `Op.in`.
* **Done when:** `measure.ts` shows opening a workspace with 200 collections issuing **1** HTTP request and
  **≤ 3** DB queries.

---

## PERF-2 — Lazy-load the tree

* **Status:** verified real · **Size:** L · Do PERF-1 part 1 first.
* **Goal:** opening a workspace fetches collections only; children load on expand.
* **Verified state:** `client/src/store/collectionStore.ts:36-37` holds flat `folders: Folder[]` and
  `requests: ApiRequest[]` arrays rather than per-node maps. `openCollectionIds` already exists (`:38`,
  `:78`), so expansion state is in the right place already.
* **Change:** move to `foldersByCollection` / `requestsByFolder` maps whose values are
  `Folder[] | 'loading' | undefined`, with `loadWorkspace` (collections page only),
  `loadCollectionChildren` (once per collection, guarded on the `'loading'` state) and
  `loadFolderChildren`. Show a skeleton row while `'loading'`. Keep the Dexie offline cache
  (`collectionStore.ts:101-113`) but make it per-node and treat it as a **hint** — paint from cache, then
  reconcile with the server. Delete `fetchCollectionsData` once nothing references it.
* **Traps:** SOCK-1's reducers write into these same structures. Design the shape once, with both tasks in
  mind, or you will rewrite it twice.
* **Done when:** with the PERF-0 dataset, opening a workspace with 500 collections issues one request and
  transfers under 100 KB, and expanding one collection issues exactly one more.

---

## PERF-3 — Paginate everything that returns a list

* **Status:** verified real · **Size:** L
* **Verified state:**
  * `server/src/routes/collections.ts:60` (collections), `:108` (folders), `:154` (requests) take **no**
    pagination parameters at all.
  * `server/src/routes/history.ts:14-32` is the only real pagination, and it is offset-based
    (`:26 offset: (+page-1)*+limit`) with **no server-side cap** — `?limit=999999` is honoured — plus a
    `COUNT(*)` on every page (`:30`).
  * `server/src/routes/admin.ts:12-25` is **fake** pagination: `UserRepository.list()` loads every row, then
    the response reports `{ total: users.length, page: 1, limit: 50 }`.
* **Why offsets are not enough:** `skip((page-1)*limit)` on page 500 makes the database walk 25,000 rows it
  then discards.
* **Change:** cursor pagination everywhere. Cursor = the last item's sort key, base64url-encoded; for tree
  nodes `(order, id)`. Fetch `limit + 1` to know whether a next page exists without a `COUNT`. Response
  shape everywhere: `{ items, nextCursor }`. Cap `limit` server-side at 200 regardless of what the client
  asks for.

  ```ts
  const where = cursor
    ? { collectionId, [Op.or]: [{ order: { [Op.gt]: o } }, { order: o, id: { [Op.gt]: id } }] }
    : { collectionId };
  const items = await SqlRequest.findAll({ where, order: [['order','ASC'], ['id','ASC']], limit: limit + 1 });
  ```

* **Traps:**
  1. The previous revision specified the history cursor as `(executedAt, _id)` and an index on
     `executedAt`. **That column does not exist** — the model and route use `createdAt` (see FIX-4). Use
     `(createdAt, id)`.
  2. The compound indexes for tree nodes already shipped in migration `001-indexes.ts`
     (`idx_requests_collection_folder_order`, `idx_collections_workspace_order`). The history one did
     **not**: `idx_history_user_workspace` is `(userId, workspaceId)` only. A `(userId, workspaceId,
     createdAt)` index is part of this task — add it as a new migration, never by editing `001`.
* **Done when:** `measure.ts` shows every list endpoint answering in constant time at 100k rows, and no
  response carries more than 200 items.

---

## PERF-4 — Kill the N+1 queries

* **Status:** verified real — all seven sites confirmed · **Size:** L · Fix with a batched query, never a
  loop.

| # | Where (verified) | What it does now | Fix |
|---|---|---|---|
| 1 | `routes/collections.ts:266-300` `PUT /reorder` | Sequential `for` loop calling `resolveWorkspaceId` **per item** (1-2 reads each), then `Promise.all` of N updates. **No cap on `items.length`.** | One query to load all items, one bulk write, and a length cap |
| 2 | `routes/collections.ts:40-54` `checkPermission` → `resolveWorkspaceId:17-32` | 2 sequential reads on every mutating call for a folder or request | Denormalise `workspaceId` onto folders and requests, or cache (PERF-5) |
| 3 | `routes/history.ts:159-165` GC loop | `while` loop doing `findOne(order ASC)` + `destroy` one row at a time | One ranged delete with a computed cutoff |
| 4 | `routes/history.ts:77-80` workspace clear | `findAll` loads **every** matching row into memory to `reduce` byte sums, then deletes | Aggregate the sum in the database |
| 5 | `routes/admin.ts:12-24` user list | Full table load, then `users.length` as the "total" | Cursor paging (PERF-3) |
| 6 | `middleware/rbac.ts:18` | `WorkspaceRepository.findById` loads the whole workspace **including the full `members` array** to read one role | Project the matching member only, or cache (PERF-5) |
| 7 | `repositories/RequestRepository.ts:101` `searchInWorkspace` | Takes `collectionIds: string[]` → at 100k collections that is a 100k-element `Op.in` | Denormalised `workspaceId`, or search per page of collections — **but see SEC-6: this method is dead code.** Decide whether to delete it instead |

* **Traps:**
  1. The previous revision's reorder snippet used a `CASE` expression with double-quoted `"order"`. That is
     Postgres/sqlite syntax and **fails on MySQL**, which needs backticks — and `DB_TYPE` supports both.
     Use `bulkCreate(rows, { updateOnDuplicate: ['order'] })`, or switch the quoting on the dialect. Note
     `order` is a reserved word in every dialect, so it always needs quoting of some form.
  2. Item 5's description in the previous revision mentioned a `countDocuments` call. There isn't one — the
     defect is a full table load, which is worse.
* **Done when:** `measure.ts` reports a reorder of 500 items in ≤ 3 queries (from ~1,500), and no endpoint
  above issues a query per row.

---

## PERF-5 — Cache RBAC and system config

* **Status:** verified real · **Size:** M
* **Verified state:** `server/src/middleware/auth.ts:89` calls `SystemConfigRepository.getConfig()` on
  **every authenticated request**, which is a `SqlSystemConfig.findOne()`
  (`server/src/repositories/SystemConfigRepository.ts:82-85`). `server/src/middleware/rbac.ts:18` loads a
  full workspace row per permission check. `server/src/utils/cache.ts` does not exist.
* **Change:** a small TTL cache in `server/src/utils/cache.ts`; wrap the system config (30 s is ample — it
  changes only from the admin screen, which can invalidate explicitly) and the (user, workspace) role
  decision. SOCK-4 needs the same role cache, and SEC-10's limiter store has the same multi-replica
  problem — design once.
* **Traps:** the previously proposed `TtlCache.set` did
  `this.map.delete(this.map.keys().next().value)`, where the argument is `string | undefined` and **will not
  typecheck** under this project's `strict` settings. Narrow it before calling `delete`.
* **Done when:** `measure.ts` shows one `SystemConfig` read per 30 s under sustained load instead of one
  per request, and an admin config save takes effect immediately (proving invalidation works).

---

## PERF-6 — Trim what the wire carries

* **Status:** verified real · **Size:** M
* **Verified state:** `RequestRepository.findByCollection` (`server/src/repositories/RequestRepository.ts:51-53`)
  has **no `attributes` projection**, so every sidebar row carries `params`, `headers`, `auth`, `body`,
  both scripts and `comments`. `GET /api/auth/me` returns the full `clientCertificates` array (see SEC-8).
  `compression` is neither in `server/package.json` nor used in `index.ts`.
* **Change:** a `summaryOnly` projection for tree/list reads (`id`, `collectionId`, `folderId`, `name`,
  `method`, `order`) — PERF-1 part 1 already needs it — and gzip via `compression` on the API.
* **Done when:** the tree payload for a 500-request collection is under 50 KB, asserted in a test.

---

## PERF-7 — Client bundle weight

* **Status:** verified real — **except the Monaco claim, which was backwards** · **Size:** M
* **Verified state:** `client/package.json` ships **both** `moment ^2.30.1` (imported in 2 files) and
  `date-fns ^4.4.0`; `lodash ^4.18.1` is whole-imported in 2 files; `chai ^6.2.2` and `crypto-js ^4.2.0`
  are runtime dependencies. `@types/chai`, `@types/js-yaml` and `@types/uuid` sit in `dependencies` rather
  than `devDependencies`. The current build emits a single ~985 KB JS chunk (289 KB gzipped).
* **Correction:** the previous revision said "Monaco is loaded eagerly". It is not bundled **at all** —
  `monaco-editor` is not a dependency, and `@monaco-editor/react` fetches it from jsDelivr at runtime. The
  action is therefore the **opposite** of trimming: SEC-10 blocker 2 requires bundling it locally, which
  makes the bundle substantially bigger. Sequence PERF-7 **after** SEC-10 and set the budget with the real
  Monaco payload included, or the budget will be wrong the day CSP lands.
* **Change:** drop `moment` in favour of `date-fns` (or the reverse — pick one), import `lodash` per
  function or replace the few uses outright, move the `@types/*` packages to `devDependencies`, lazy-load
  the editors and the runner modal, and set a CI budget on the initial chunk.
* **Done when:** the initial chunk is under the agreed budget with Monaco bundled, and CI fails on a
  regression.

---

# SOCK — Realtime

## SOCK-1 — Apply deltas instead of refetching the tree

* **Status:** verified real · **Size:** L · Blocked behind nothing, but PERF-1 makes the cost smaller.
* **Goal:** a socket event mutates the client's store in place. No HTTP.
* **Verified state:** `client/src/components/common/SocketSync.tsx:30-33` — `handleUpdate` is
  `fetchCollectionsData(...)`, wired to **nine** structural events at `:35-43`. It also refetches on
  window focus (`:104-112`) and on every reconnect (`:25`). There is no delta application anywhere in the
  client.
* **Why:** `fetchCollectionsData` is the 1 + 2N request storm described in PERF-1. One rename by one
  collaborator therefore costs every other viewer a full tree refetch — 401 HTTP requests in a
  200-collection workspace. At the target scale this is the single most expensive thing the app does, and
  it is triggered by other people.
* **Change:** each event carries the changed entity; apply it to the store directly. Add reducers to
  `collectionStore` (`applyCollectionUpserted`, `applyCollectionDeleted`, `applyFolder*`, `applyRequest*`)
  and have `SocketSync` call those instead of `handleUpdate`. Keep the refetch as an explicit
  "resync" path for reconnect only, where missed events make the local state genuinely unknown.
* **Traps:**
  1. The previous revision's event list was incomplete — it omitted `collection:created` and the three
     environment events. Enumerate the emit sites from the source before wiring reducers: **11 in
     `server/src/routes/collections.ts`** (folders at `:127,140,148`; requests at `:191,213,219`; reorder
     at `:300`) and **3 in `routes/environments.ts`** (and fix SOCK-0 first, or three of your reducers will
     look broken).
  2. `request:updated` already has last-write-wins conflict handling at `SocketSync.tsx:71-97`. **Preserve
     it.** Replacing that branch with a naive upsert reintroduces the conflict bug that
     `tests/e2e/socket-sync.spec.ts` covers.
  3. The socket URL is derived at `:16` as `api.defaults.baseURL?.replace('/api','')` — fragile, and worth
     replacing with an explicit value while you are in the file.
* **Done when:** a two-client test asserts the observer issues **zero** HTTP requests on receiving a
  rename, and its sidebar still shows the new name.

---

## SOCK-2 — Cover every emit site with a two-client test

* **Status:** verified real — **and the previous revision's coverage table was false** · **Size:** M
* **Goal:** every `emitToWorkspace` call site has a test where the *observer* is the assertion subject.
* **Verified state:** `grep -rl` for each of the 13 event names across `tests/` returns **zero files**.
  The three events previously marked "✅ Covered" are not covered at event level by anything.
  `tests/socket-realtime.spec.ts`, which the previous revision cited, **does not exist**. What exists is
  two two-context UI tests: `tests/e2e/socket-sync.spec.ts` (one test, conflict-on-edit) and
  `tests/e2e/socket-advanced.spec.ts` (one test, folder rename + globals). Neither imports
  `socket.io-client` — `grep -rn "socket.io-client" tests/` returns nothing.
* **Why:** coverage of one event in a family proves nothing about the others, because each one obtains its
  payload differently. SOCK-1 turns all 13 into reducers, and a reducer with no test is a silent data-loss
  bug — the observer's tree just quietly drifts from the server's.
* **Change:** one spec per event family, asserting on the observer. Prefer a direct `socket.io-client`
  connection over a second browser context where the assertion is about the payload rather than the UI —
  it is faster and the failure message is readable.
* **Traps:** the CI guard the previous revision proposed (fail if an event name does not appear under
  `tests/`) fails immediately for **all 13** names. Land the guard *after* the tests exist, in its own
  commit, or CI goes red on an unrelated change.
* **Done when:** every emit site has a named test and the guard passes in CI.

---

## SOCK-3 — Redis adapter and horizontal scaling

* **Status:** verified real · **Size:** M · Needed the moment there is more than one pod.
* **Goal:** an event emitted on pod A reaches a socket held by pod B.
* **Verified state:** `k8s/deployment.yaml:6` sets `replicas: 2` and `k8s/hpa.yaml:10-11` scales 2→10.
  There is no Redis package in `server/package.json` and no adapter in the code — only comments
  acknowledging the gap (`server/src/middleware/rateLimit.ts:14`, `server/src/utils/socketUtils.ts:8,13`).
  `k8s/ingress.yaml` has **no `annotations:` block at all**, so there are no sticky sessions either.
* **Why:** with two replicas and no shared adapter, roughly half of all realtime events are lost — whichever
  pod did not receive the write never emits to its own sockets. The feature appears intermittently broken,
  which is worse than being absent.
* **Change:** `@socket.io/redis-adapter` + `ioredis`, wired in `server/src/index.ts` next to the
  `SocketIOServer` construction. Gate on `REDIS_URL` so a single-node deployment keeps working unchanged.
  Add the Redis service to `k8s/`. The in-memory rate limiter (SEC-10) has the same problem and should move
  to the same store in the same pass.
* **Traps:** Socket.IO's HTTP long-polling fallback needs sticky sessions even *with* the Redis adapter;
  either add the ingress annotation or force `transports: ['websocket']`. Decide explicitly — this is the
  classic half-fix.
* **Done when:** a CI test boots two server processes against one Redis, connects a client to each, and
  asserts an event emitted through process A arrives at the client on process B.

---

## SOCK-4 — Connection hygiene at 10k sockets

* **Status:** verified real · **Size:** M
* **Goal:** 10,000 concurrent sockets within a documented memory ceiling, without a DB read per join.
* **Verified state:** `server/src/index.ts:84-85` — `join:workspace` issues **two** DB reads every time
  (`getUserWorkspaceRole` then `UserRepository.findById` for the superadmin check). `signToken`
  (`server/src/middleware/auth.ts:18-22`) signs `{ sub: userId }` only, so there is no `isSuperAdmin` claim
  to read instead. There are no caps on rooms per socket or sockets per user, and no periodic re-check of
  the token on a long-lived connection.
* **Why:** at 10k sockets joining a handful of workspaces each, that is tens of thousands of DB reads in a
  reconnect storm — and a reconnect storm is exactly what a deploy causes. A revoked member also keeps
  receiving events for as long as the socket lives, because authorization is checked once at join.
* **Change:** cache the role decision per (user, workspace) with a short TTL (share the PERF-5 cache),
  cap rooms per socket, and re-verify the token periodically, disconnecting on failure.
* **Traps:** the previous revision's snippet read `s.data.userId`, but `grep -n "socket.data"
  server/src/index.ts` returns nothing — `userId` is a closure const at `index.ts:79`. Assign
  `socket.data.userId = userId` first, or the code compiles and silently authorizes nobody.
* **Done when:** a load test holds 10k sockets under a documented memory ceiling with p95 delivery inside
  the budget, and a test proves a member removed mid-session stops receiving events.

---

# TEST — Coverage

## Rules every new test must follow

1. **Assert the effect, not the click.** A test that clicks Save and asserts the modal closed proves
   nothing about persistence. Reload and assert the value.
2. **Authorization is API-level.** A UI test cannot prove a permission check, because the UI hides the
   control. Use `request.*` and assert the status code.
3. **The observer is the subject.** In a realtime test, assert on the client that did *not* act.
4. **Use `getByTestId`.** The existing specs already do this widely; do not reintroduce
   `page.locator('input[type="text"]')`.
5. **Every test must fail against the pre-fix code.** Watch it fail before you fix anything.

## TEST-1 — Run the Playwright suite in CI

* **Status:** verified real · **Size:** M · **Highest-leverage item in this section.**
* **Goal:** the browser suite runs on every push and a broken selector turns CI red.
* **Verified state:** `.github/workflows/test.yml` runs: build server → build client → boot a sqlite-backed
  `node server/dist/index.js` on 3005 → `npm test --prefix server` (jest) → `scripts/smoke-core.sh`.
  **No Playwright step exists.** `docker-publish.yml:10-40` duplicates the same steps inline as a `test`
  job that `build-and-push` depends on, so image publishing is gated on a suite that never opens a browser.
* **Why:** 25 spec files covering auth, RBAC, share, runner, scripts, sockets and more exist and run only
  when somebody remembers to run them locally. Every UI regression ships.
* **Correction to the previous revision:** it claimed "~800 Playwright tests". The real number is **36
  `test()` calls across 25 files** (148 `expect()` calls). The 800 figure came from a stale comment in
  `playwright.config.ts:27`. This changes the cost of TEST-1 and TEST-3 completely — the suite is thin, not
  vast, and the work is mostly *writing* tests (TEST-3), not making an existing suite pass.
* **Change:** add a Playwright job. `playwright.config.ts` already has a working `webServer` block (two
  entries: server on 3005, client on 5173) and `baseURL`, so the job is roughly
  `npx playwright install --with-deps chromium` then `npx playwright test`. Fix the stale 800 comment while
  you are there. Then make `docker-publish.yml` depend on the new job rather than duplicating steps.
* **Traps:**
  1. `globalSetup` is **commented out** at `playwright.config.ts:21` while its own comment says it is
     required to walk the seeded superadmin through the forced password change. Un-commenting it may be
     necessary for a clean CI run — and may break local runs that rely on an already-initialised database.
     Resolve this before adding the CI job, not after.
  2. `workers: 1` and `retries: 2` on CI: 36 tests each doing real round-trips will still take minutes.
     Budget for it rather than discovering it in a PR.
* **Done when:** deliberately breaking a selector makes CI red, and `docker-publish.yml` cannot publish an
  image whose UI suite failed.

## TEST-2 — The database matrix

* **Status:** partially real — **two of its three "Where" claims were false** · **Size:** M
* **Goal:** the whole suite runs against sqlite, postgres and mysql.
* **Verified state:**
  * ❌ `baseURL` is **not** commented out — `playwright.config.ts` sets `http://localhost:5173`.
  * ❌ `webServer` is **not** commented out — it is active with two entries.
  * ❌ The API-URL refactor it asks for is **already done**: `grep -rn "localhost:3005" tests/` returns
    nothing; specs use relative paths (e.g. `tests/e2e/auth-api.spec.ts:6`
    `request.get('/api/admin/config')`).
  * ✅ **Eleven** spec files still hardcode `page.goto('http://localhost:5173/...')`: collection,
    concurrency, conflict, edgecases, environments, requests, scripts-scope, scripts, socket-advanced,
    socket-sync, tabs.
  * ✅ There is no per-backend harness and no per-DB Playwright project — only `chromium`.
    `test-all-dbs.ps1` still sits at the repo root as the manual substitute.
  * Server-side: `db.repositories.test.ts` and `db.sqlmodels.test.ts` run against **sqlite only** (via
    `server/src/tests/__mocks__/connect.ts`). `db.config.test.ts` covers postgres/mysql/mssql *config
    resolution* with no connection. CI is sqlite-only end to end.
* **Why:** the three backends differ in exactly the places this app is fragile — `LIKE` escaping (SEC-6),
  index creation (FIX-3's migrations), `JSON` column behaviour, and `Op.in` limits. A bug that only appears
  on mysql currently ships.
* **Change:** replace the 11 hardcoded `page.goto` URLs with `baseURL`-relative paths; add a Playwright
  project per `DB_TYPE` with the backend supplied as a service container; keep sqlite as the default local
  project so nobody needs Docker to run tests.
* **Done when:** `npx playwright test --project=postgres` runs the whole suite against a fresh Postgres and
  CI runs all three.

## TEST-3 — Journey coverage, per feature area

* **Status:** real, and much larger than it looks · **Size:** XL · Do it area by area, one commit each.
* **Verified state:** 36 tests across 25 files. **No area is uncovered, and no area is complete** — every
  one is partial, and three are placeholders that assert almost nothing:

| # | Area | Verdict | Covering spec | Biggest gap |
|---|---|---|---|---|
| 1 | Auth | partial | `auth.spec.ts` (3), `auth-api.spec.ts` (2) | forced first-login change, expired session, SSO |
| 2 | Workspace | partial | `workspace.spec.ts`, `rbac.spec.ts` | removing a member does not assert lost access |
| 3 | Collection tree | partial | `collection.spec.ts` (4), `crud-rename.spec.ts` | duplicate, move between folders, reorder survives reload |
| 4 | Request editing | partial | `requests.spec.ts` (3), `edgecases.spec.ts` | body-mode and auth-type matrix, dirty state, undo/redo |
| 5 | Sending | partial | `response.spec.ts` | per-mode viewer, image/PDF, timeout and error paths |
| 6 | Environments | partial | `environments.spec.ts` (2) | secret masking, globals-vs-env precedence, import/export |
| 7 | Scripts | partial | `scripts.spec.ts`, `scripts-scope.spec.ts` | failing assertions, `pm.sendRequest`, isolation (SEC-3) |
| 8 | History | partial | `history.spec.ts` | search, save-to-collection, quota behaviour |
| 9 | Runner | partial | `runner.spec.ts` | iterations, CSV/JSON data files, stop mid-run |
| 10 | Import / Export | **placeholder** | `import-export.spec.ts` | only asserts buttons exist on AdminPage |
| 11 | Share | **placeholder** | `share.spec.ts` | only generates a link — never opens it anonymously (SEC-0.6) |
| 12 | Admin | **placeholder** | `admin.spec.ts` | login + dashboard render only |
| 13 | Tabs | partial | `tabs.spec.ts`, `concurrency.spec.ts` | drag-reorder only |
| 14 | Multi-user realtime | partial | `socket-sync.spec.ts`, `socket-advanced.spec.ts` | 2 tests for 13 events (SOCK-2) |

* **Why rows 10-12 matter most:** each one is a green tick that proves nothing. `share.spec.ts` in
  particular gave false confidence while the public share route was returning 401 to anonymous viewers
  because of a router mount-order bug — the test never opened the link.
* **Done when:** every area has real assertions and the suite passes on all three backends.

## TEST-4 — The API-authorization layer

* **Status:** verified real · **Size:** L · **Pairs with SEC-2 — write these tests first, as SEC-2's proof.**
* **Verified state:** `tests/api-authorization.spec.ts` **does not exist** (the previous revision's "2 tests
  today" was wrong). The closest thing is `tests/e2e/rbac.spec.ts` — one *UI* test ("Viewer cannot edit,
  Editor can edit"), which by this section's own Rule 2 cannot prove an authorization check. There is no
  anonymous/non-member matrix and no mass-assignment test anywhere in the repo.
* **Why:** every authorization hole found so far (SEC-2's four, and the share-route regression) was
  invisible to the UI suite by construction, because the UI does not offer the control that the API
  accepts.
* **Change:** one spec that, for each mutating endpoint, asserts the status code for: anonymous,
  authenticated non-member, viewer, editor, owner, superadmin. Table-driven, using `request.*` with no
  browser. Include a mass-assignment row per endpoint (post a foreign `workspaceId` / `collectionId` and
  assert 400 or 403, never 200).
* **Done when:** every case is covered and each one fails against the pre-SEC-2 code.

## TEST-5 — Client unit tests

* **Status:** verified real, exactly as previously written · **Size:** M
* **Verified state:** `client/package.json` scripts are `dev`, `build`, `lint`, `preview` only; devDeps
  include `@playwright/test` but no vitest, jest, `@testing-library/*` or jsdom. There are **zero**
  `*.test.*` / `*.spec.*` files under `client/src`. The root `package.json` has no `test` script either.
* **Why:** the highest-risk pure logic in the product is client-side and completely untested — variable
  resolution and precedence (`client/src/utils/variables.ts`), the script runner
  (`client/src/utils/scripts.ts`), and the SEC-4 `stripSecrets` persistence filter in
  `client/src/store/requestStore.ts`, where a regression silently writes credentials back to
  `localStorage`.
* **Change:** add vitest + jsdom, a `test` script, and start with those three modules. They are pure
  functions — no component rendering needed for the first pass.
* **Done when:** `npm test --prefix client` runs in CI with a coverage floor on `client/src/utils` and
  `client/src/store`.

## TEST-6 — Scale and performance budgets

* **Status:** verified real · **Size:** M · **Blocked on PERF-0** (there is no realistic dataset to measure).
* **Verified state:** `tests/perf/` does not exist. `tests/e2e/api-perf.spec.ts` asserts exactly **one**
  budget — `GET /api/workspaces` under `PERF_TIMEOUT` (100 ms, set at `playwright.config.ts:17`) — and it
  does so for a freshly registered user with **zero workspaces**, so it measures an empty query and can
  never catch a scale regression. It also logs registration time without asserting on it.
* **Change:** budgets that run against the PERF-0 dataset, asserting query counts as well as milliseconds
  (a query count is stable across machines; a millisecond figure is not — that is why the current 100 ms
  assertion is the wrong shape as well as the wrong scope).
* **Done when:** the budgets run in CI and reintroducing a deliberate N+1 turns it red.

---

# UI — Client experience

## UI-1 — Replace native `prompt()` / `confirm()` / `alert()` with the app's own modals

* **Status:** verified real — **22 sites, not 10** · **Size:** M
* **Verified state:** the previous revision listed 10 `prompt`/`confirm` sites and **missed all 12
  `alert()` calls.** Every line number had drifted. Current, verified:

| Kind | Sites |
|---|---|
| `prompt` / `confirm` (10) | `Sidebar.tsx:60`, `EnvironmentSidebar.tsx:19,44,55`, `HistorySidebar.tsx:141`, `RequestTabBar.tsx:83`, `AdminPage.tsx:68,465,558`, `UrlBar.tsx:387` |
| `alert` (12) | `EnvironmentTabEditor.tsx:76,98,102`, `Sidebar.tsx:70`, `AdminPage.tsx:77,79,265,267,443,459,468,471` |

  `PromptModal.tsx` and `ConfirmModal.tsx` already exist, so this is migration work, not new components.
* **Why:** unstyled and unthemeable, they ignore the dark mode the rest of the app implements, and they
  block the Electron window rather than the page.
* **Change:** migrate all 22. The `alert()` calls are the ones that should become toasts (UI-2) rather than
  modals — a dismissible notification, not a dialog that demands a click. Do UI-2 first and this becomes
  mostly mechanical.
* **Traps:**
  1. The "Done when" grep must include `alert(` — the previous revision's did not, so it would have passed
     with 12 sites remaining.
  2. Playwright specs install dialog handlers to get past these today: `tests/e2e/collection.spec.ts:17`,
     `conflict.spec.ts:33,59,86`, `crud-rename.spec.ts:25,55`. Those handlers must be replaced with modal
     interactions in the same commit, or the tests will hang waiting for a dialog that never appears.
* **Done when:** `grep -rn "window.prompt\|window.confirm\|[^.]\balert(\|[^.]\bconfirm(" client/src` returns
  nothing, and the specs above drive the real modals.

## UI-2 — One global feedback surface

* **Status:** verified real · **Size:** M · Do this before UI-1.
* **Verified state:** `client/src/store/toastStore.ts` does not exist and there is no toast anywhere. ~32
  components each hold their own `setError` state.
* **Why:** an error raised by a request that finishes after its modal closed has nowhere to go, so it is
  swallowed entirely.
* **Done when:** a save that fails inside a modal that has already closed still surfaces a message.

## UI-3 — Handle 403 distinctly from 401

* **Status:** verified real · **Size:** S · **One instruction in the previous revision was dangerous —
  read the trap.**
* **Verified state:** `client/src/api/axios.ts:8-17` handles **401 only**. A 403 falls through, so the
  action simply does not happen and the UI says nothing.
* **Change:** on 403, surface a permission message through UI-2's toast; keep the 401 redirect as is.
* **Traps:** the previous revision also said to "remove the double `AuthGuard` on /admin". **Do not.**
  `client/src/App.tsx:227` is the authentication gate on `MainLayout`; `:229` is
  `<AuthGuard requireSuperAdmin>` on `AdminPage`, and **the inner one carries the superadmin check**.
  Removing it removes the privilege gate and hands the admin page to any logged-in user.
* **Done when:** a viewer attempting an editor-only action sees an explicit permission message, and a
  non-superadmin still cannot reach `/admin`.

## UI-4 — Accessibility

* **Status:** verified real, **worse than stated** · **Size:** L
* **Verified state:** across `client/src/**/*.tsx` there are **zero** `aria-label`, `aria-modal` and
  `role=` attributes — confirmed exactly as claimed. Additionally there are **73** occurrences of
  `outline-none` / `focus:outline-none` and **zero** `focus-visible`: focus rings are actively stripped
  app-wide with nothing put back, so the app cannot be navigated by keyboard at all.
* **Change:** restore a visible `focus-visible` ring as a global style **first** — it is one rule and it is
  the difference between "unusable by keyboard" and "usable" — then label controls, add `role`/`aria-modal`
  to the modals, and trap focus inside them.
* **Traps:** `@axe-core/playwright` is in neither `package.json`, so the "Done when" needs it added first.
* **Done when:** an axe scan of the main screen, one modal and the admin page reports no critical
  violations, and every interactive control shows a focus ring when tabbed to.

## UI-5 — Style consistency

* **Status:** verified real · **Size:** S
* **Verified state:** **21** `style={{` occurrences in `client/src/App.tsx` where the rest of the app uses
  Tailwind — principally `DbErrorScreen` and the loading screen. Both render before the app shell, which is
  presumably why they were written that way; confirm whether Tailwind is available at that point before
  converting.
* **Done when:** the inline blocks are Tailwind, or a comment explains why they cannot be.

## UI-6 — Fix stale copy

* **Status:** verified real · **Size:** XS
* **Verified state:** `client/src/pages/AdminPage.tsx:465` still warns that import will "overwrite system
  configuration". `POST /api/admin/import/:workspaceId` inserts collections, folders, requests and
  environments only — it never touches config. Also `client/src/pages/AdminPage.tsx:391` still describes the
  setting as affecting "every user's Send / share-link / **capture** requests", and capture no longer
  exists (see CLEAN).
* **Done when:** both strings describe what the code does.

---

# FEAT — Features to build

Everything here was explicitly selected by the owner. Anything *not* here and not already built is in
`IGNORE.md` and must not be proposed.

## FEAT-5 — Collaboration

### FEAT-5.1 — Collection-level RBAC *(parity item 28)*

* **Status:** greenfield · **Size:** L · **Do this before 5.3-5.6** — they all assume per-collection access.
* **Verified state:** `server/src/middleware/rbac.ts` is workspace-granularity only: `UserRole` at `:3`,
  `ROLE_RANK` at `:7`, `getUserWorkspaceRole` at `:14`, `requireWorkspaceRole` at `:36`, and
  `canSave`/`canRun`/`canManageMembers` at `:72-81`. There is no collection ACL anywhere.
* **Goal:** a member's workspace role can be **narrowed** (never widened) on a specific collection.
* **Done when:** API tests prove a workspace `editor` narrowed to `viewer` on one collection gets 403 on
  that collection and 200 on another.

### FEAT-5.2 — `@` mentions in comments *(parity item 33)*

* **Status:** partial prior art · **Size:** M
* **Verified state:** `client/src/components/common/UserAutocomplete.tsx` exists but is used **only** at
  `WorkspaceSettingsModal.tsx:167`. `CommentsEditor.tsx` has zero mention handling.
* **Done when:** a test mentions a member, asserts that member sees a notification, and asserts a non-member
  cannot be mentioned.

### FEAT-5.3 — Fork a collection *(parity item 29)* · greenfield · **Size:** L
### FEAT-5.4 — Collection versioning *(prerequisite for merge)* · greenfield · **Size:** L
### FEAT-5.5 — Pull requests *(parity item 30)* · greenfield · **Size:** XL
### FEAT-5.6 — Merge and conflict resolution *(parity item 31)* · greenfield · **Size:** XL
### FEAT-5.7 — Partner workspaces *(parity item 27)* · greenfield · **Size:** L

* All five have **no prior art** in the repo. They are a single programme, not five independent tasks:
  5.4 must precede 5.5, which must precede 5.6. Do not start 5.5 before 5.3 and 5.4 are shipped and
  tested.
* Line-number correction for 5.6: the `confirm()` it cites in `UrlBar.tsx` is now at **`:387`**.

# CLEAN — Cleanup

| # | Item | Verified state | Action |
|---|---|---|---|
| 3 | Inconsistent naming | `package.json:14` `appId: com.reqspaceclone.app`; `server/src/db/dbConfig.ts:78` default DB `postman_clone`; repo folder `postman`; product Reqspace; also `server/src/tests/db.connection.manual.ts:9-10` | Pick one name and apply it |
| 4 | Dead dependencies | Zero usages in `server/src` for `multer` (1.4.5-lts.1 is end-of-life), `archiver`, `postman-collection`, `http-proxy-middleware`, `ajv` — **all droppable now.** Also `@types/archiver`, `@types/multer`. `undici` has **3** live usages and must stay until SEC-0.4. `soap@^1.12.0` is live in `importExport.ts` — do not touch | Drop the five plus the two `@types` |
| 5 | Stale capture copy | `server/src/utils/ssrf.ts:6` says "share-proxy, capture, and WSDL-import routes"; `client/src/pages/AdminPage.tsx:391` says "every user's Send / share-link / capture requests". Capture was deleted in `36b3331` | Fix both strings (the second is also UI-6) |
| 6 | Stale doc references | `scripts/smoke-core.sh:4` points at `TESTING.md` and `server/src/tests/ssrf.test.ts:5` at `CODE_REVIEW.md`; **neither document exists** in the repo | Repoint both at this file |
| 7 | `IGNORE.md` drift | Its section B cites `server/src/models/AuditLog.ts`, `server/src/routes/capture.ts` and `CaptureTrafficModal.tsx`, all deleted | Repoint or drop those rows |

---

# Removed on 2026-09-25

Deleted from this file during the verification pass. Recorded once so nobody re-adds them from an old
diff, a stale review or a memory of "there was a task for that".

## Shipped

| Was | What shipped | Evidence |
|---|---|---|
| **SEC-4** — stop persisting credentials to `localStorage` | `stripSecrets()` strips auth secrets and sensitive header values before every persist; `version: 1` + `migrate` wipes what was already in users' browsers; the fake `sess_default_123` seed cookie is gone | `client/src/store/requestStore.ts`, `cookieStore.ts`, commit `ff0d60f` |
| **FIX-2** | Shipped before this pass; the section was already deleted. Its only trace was a dangling "see FIX-2 step 4" cross-reference, now removed | — |
| **FIX-3** — add real migrations | `umzug` wired into `connect.ts` with four migrations: `001-indexes` (all 13 indexes), `002-user-settings-columns`, `002-shared-link-columns`, `003-sync-missing-columns` (generic add-only column backfill), plus `npm run migrate` | `server/src/db/connect.ts`, `server/src/db/migrations/` |
| **SEC-1** — rotate and remove the committed JWT secret | Seven placeholder/leaked values rejected at startup, 32-char minimum in production, value stripped from the k8s manifest. **Operational step still outstanding: rotate `JWT_SECRET` in any cluster that applied the old manifest** | `server/src/utils/jwtSecret.ts`, `k8s/secret.yaml`, `server/src/tests/jwtSecret.test.ts` |
| **SEC-2** — authorization holes on client-supplied parent ids | `POST /history/:id/save` and `POST /import/wsdl` now resolve the owning workspace and require `editor`; `GET /collections/:id/export` requires `viewer`; the inert `POST /collections/import` stub deleted. Guard extracted, with an explicit id extractor because `req.params.id` means different things per route | `server/src/middleware/resolveWorkspace.ts`, `routes/history.ts`, `routes/importExport.ts` |
| **SEC-6** — escape user input reaching a query pattern | `escapeLike` (dialect-aware, mssql included) plus a 100-char cap, applied at the route and inside both repositories; array-valued `?q[]=` no longer reaches the query; orphaned `escapeRegex.ts` deleted | `server/src/utils/escapeLike.ts`, `routes/users.ts`, `UserRepository.ts`, `RequestRepository.ts` |
| **SEC-7** — stop leaking `dbError` to anonymous callers | Gate body masked in production via `dbDownBody`, and the client's 503 branch no longer requires the body to carry a message — without that half the DB-error screen would have silently stopped appearing | `server/src/utils/dbGate.ts`, `index.ts`, `client/src/App.tsx`, `tests/dbGate.test.ts` |
| **FIX-4** — history rows rendered "Invalid Date" | `item.executedAt` → `item.createdAt` | `client/src/components/history/HistorySidebar.tsx:191` |
| **FIX-5** — `/api/auth/config` advertised self-registration the server refused | Returns the real `config.auth.allowSelfRegistration`; the register route's half landed in `4f45c58` | `server/src/routes/auth.ts:152` |
| **SOCK-0** — environment events never reached the client | Three emits renamed from `environment-created` etc. to the colon form the client and the other ten emit sites use | `server/src/routes/environments.ts:39,49,58` |
| **CLEAN** — stub runner route; PM2 restart storm | `routes/runner.ts` and its mount deleted (also removing one blanket-`/api` auth router); `max_restarts: 10`, `restart_delay: 5000`, `min_uptime: 30000` added | `ecosystem.config.js` |

Two corrections that outlived FIX-3 and now live in the tasks that need them:

* FIX-3's own text said to wire `umzug.up()` **before** `sq.sync()`. The shipped code deliberately runs it
  **after**, so a fresh install's tables are created complete by `sync()` and migrations only backfill older
  databases. It also computes the migration glob from `__filename`'s extension rather than hardcoding
  `dist/`. Do not "fix" this backwards.
* `idx_history_user_workspace` is `(userId, workspaceId)` only. PERF-3's history cursor needs
  `(userId, workspaceId, createdAt)`, which does **not** exist — adding it is part of PERF-3, in a new
  migration, never by editing `001`.

| **FEAT-10** — Server-side collection export/import | Completed | `importExport.ts`, `feat10.e2e.test.ts`, `ImportModal.tsx` |
| **SEC-12** — Remove the NTLM auth option | Completed | `requestStore.ts`, `AuthEditor.tsx`, `UrlBar.tsx` |
| **SEC-11** — OAuth CSRF state | Completed | `server/src/routes/auth.ts` |
| **FEAT-1** — WebSocket client | Completed | ConnectionEditor.tsx |
| **FEAT-2** — Socket.IO client | Completed | ConnectionEditor.tsx |
| **FEAT-3** — Server-Sent Events | Completed | ConnectionEditor.tsx |
| **FEAT-4** — Kafka events | Completed | ConnectionEditor.tsx |
| **FEAT-6** — Scope resolution visualizer | Completed | |
| **FEAT-7** — Split pane | Completed | |
| **FEAT-8** — Restore closed tabs | Completed | |
| **FEAT-9** — Response size limits | Completed | |
## No longer applicable

| Was | Why it is gone |
|---|---|
| **SEC-5** — stop exporting unmasked secrets | `GET /api/admin/export/:workspaceId` (`admin.ts:55-66`) no longer includes `config` in its dump, so there is no instance-wide secret to leak. The masking helper `maskConfigSecrets` (`:28-35`) still guards `GET`/`PUT /config`, which is correct |
| **SEC-0.5** — decide the fate of traffic capture | `server/src/routes/capture.ts` and `client/src/components/layout/CaptureTrafficModal.tsx` were deleted in `36b3331`. Only two stale strings remain, now CLEAN row 5 |
| **SEC-6's ReDoS vulnerability** | `grep -rn "new RegExp" server/src` returns nothing — the Mongo removal deleted every `$regex` path. SEC-6 survives as a much smaller `LIKE`-escaping task |
| **CLEAN — duplicate admin bootstrap** | `ensureDefaultAdmin` lived in `server/src/models/User.ts`; `server/src/models/` no longer exists. The `index.ts` bootstrap is the only one |
| **CLEAN — broken emoji comments in `share.ts`** | The file contains no `//` comments at all now |
| **CLEAN — test husks** | `tests/socket-sync.spec.ts` and `tests/massive-permissions.spec.ts` at the repo root do not exist. `tests/e2e/socket-sync.spec.ts` is 86 lines with two real tests — not a husk, do not delete it |
| **Rule 6's `server/src/models/` ban** | The directory is gone. The rule now names the repositories instead |

## Claims that were simply wrong

Corrected in place, listed here because each one would have sent an implementer in the wrong direction:

| Claim | Reality |
|---|---|
| "~800 Playwright tests exist" | **36** `test()` calls across 25 files (148 `expect()`s). The figure came from a stale comment at `playwright.config.ts:27` |
| `playwright.config.ts` — `baseURL` and `webServer` are commented out | Both are **active**. `globalSetup` is the one that is commented out (`:21`) |
| Specs hardcode `localhost:3005` | `grep -rn "localhost:3005" tests/` returns nothing; API calls are already relative. Eleven specs do still hardcode `localhost:5173` |
| SOCK-2's table marks three `collection:*` events "✅ Covered" | Zero of the 13 event names appear anywhere under `tests/` |
| `tests/socket-realtime.spec.ts`, `tests/api-authorization.spec.ts` ("2 tests today"), `tests/reqspace.spec.ts` | None of these files exist |
| Admin export "always returns `[]`" | It **throws a 500** — `SqlFolder`/`SqlRequest` have no `workspaceId` column (FIX-1) |
| `routes/admin.ts` sends SMTP mail | Nothing does. `grep -rn "nodemailer\|createTransport\|sendMail" server/src` returns nothing; only the config fields exist |
| PERF-4 #5 does `find` + `countDocuments` | There is no count query; it loads the whole users table and reports `users.length`. Worse than described |
| History sorts by `executedAt` | That column does not exist. The model and route use `createdAt` (see FIX-4) |
| "Monaco is loaded eagerly" (PERF-7) | `monaco-editor` is not bundled at all — `@monaco-editor/react` fetches it from jsDelivr at runtime. The fix is the opposite: bundle it (SEC-10 blocker 2) |
| UI-1 covers 10 native dialog sites | 22 — the 12 `alert()` calls were missed entirely |
| UI-3: "remove the double `AuthGuard` on /admin" | **Dangerous.** The inner guard at `App.tsx:229` carries the superadmin check. Removing it exposes the admin page to any logged-in user |
| SEC-9: add `params: Record<string, string>` to `AuthRequest` | Already present at `middleware/auth.ts:15` |
| SEC-2 has four authorization holes | Six candidates; four are real, and two (`/requests/import/curl`, `/requests/import/raw-http`) never write anything and are not holes |

## Working-tree state

At the time of this pass, `git status` showed four files modified and uncommitted, belonging to a parallel
session — `server/src/routes/auth.ts` (the `if (false)` → real `allowSelfRegistration` check, which is half
of FIX-5) and three `tests/e2e/*.spec.ts` files swapping the `uuid` import for `crypto.randomUUID`. Check
`git status` before editing those files, and do not revert or commit them as part of an unrelated task.
