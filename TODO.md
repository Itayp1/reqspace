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



* **Status:** verified real, **UNFIXED** · **Size:** XS (one word) · **Severity: critical — this is the most
  severe open item in this file.**
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

* **Status:** done · **Size:** M-L
* **Correction (2026-09-26):** this section's own text (`contentSecurityPolicy: false`, "three blockers",
  rate limiting on "exactly three routes") was stale — a casualty of the same scratch-script corruption
  CLEAN-8 fixed, describing a state that predates work already shipped. Verified live against the running
  server, not the old text:
  * **CSP is already on** — `server/src/index.ts:140-161`, a real `helmet({ contentSecurityPolicy: {...} })`
    with `useDefaults: false` and explicit directives (`default-src 'self'`, `script-src 'self'
    'unsafe-eval'`, `style-src`, `img-src`, `connect-src 'self'`, `worker-src`/`child-src 'self' blob:`,
    `frame-src 'self' data:`, `object-src 'none'`, `upgrade-insecure-requests` in prod). `hsts` is
    conditionally on in production (`maxAge: 31536000, includeSubDomains, preload`). Confirmed on a running
    production-mode server via `curl -I` — both headers present with the values above.
  * **Rate limiting already covers more than login.** `middleware/rateLimit.ts`'s limiter is applied to
    `/register`, `/login`, `/google` (`routes/auth.ts`), the public `GET /:shortId` share route
    (`routes/share.ts:12,14`), **and** a global `mutationLimiter` (`index.ts:206-208`) on every
    POST/PUT/PATCH/DELETE request app-wide (300/min per IP). `server/src/tests/sec10.e2e.test.ts` exercises
    the mutation limiter end to end (350 requests, asserts a 429).
  * **The three blockers a prior revision described are cleared**, verified live (headless Chromium against
    a built, `NODE_ENV=production` server, both with the real CSP and with it forced off, to isolate cause):
    1. **The script runner.** SEC-3 (shipped) moved `new Function` to `client/src/sandbox/worker.ts:100`
       only (`grep -rn "new Function" client/src` confirms). `'unsafe-eval'` stays in `script-src` — Chrome
       applies the creating document's CSP to same-origin blob/module workers too, so dropping it there
       would break the worker's own `new Function`, not just the main thread's (already-absent) use of it.
    2. **Monaco is bundled locally**, not fetched from jsDelivr — `client/src/main.tsx:3-8`
       (`import * as monaco from 'monaco-editor'; loader.config({ monaco })`) and the client build emits
       real per-language chunks (`tsMode-*.js`, `jsonMode-*.js`, `pgsql-*.js`, …). No CSP change needed here.
       (The "Claims that were simply wrong" table's Monaco row is itself now wrong — someone bundled it
       since that was written.) **Separately** (not a CSP issue — reproduced identically with CSP fully
       disabled): Monaco's background worker fails to load with or without CSP, because nothing configures
       `self.MonacoEnvironment`. Tracked as FIX-7; do not re-open it here.
    3. **The visualizer's Handlebars is already self-hosted** — `ResponseViewer.tsx:546`, `<script
       src="/handlebars.min.js">`, served from `client/public/handlebars.min.js`, not a CDN URL.
  * The iframes SEC-3 specified are correctly sandboxed: HTML preview `sandbox=""`
    (`ResponseViewer.tsx:381`), visualizer `sandbox="allow-scripts"` — never `allow-same-origin`
    (`ResponseViewer.tsx:540`).
* **Done when:** confirmed — `curl -I` on a production-mode server shows both headers with the directives
  above, `sec10.e2e.test.ts` passes, and the app's own console shows no CSP violations across login,
  workspace creation, the body editor and the visualizer (the one real error found, FIX-7, is independent
  of CSP).

# FIX — Broken in place

Numbering note: FIX-2, FIX-3, FIX-4 and FIX-5 are absent because they shipped. See
[Removed](#removed-on-2026-09-25). Their numbers are not reused, so old commit messages stay meaningful.


* **Status:** completed

## FIX-6 — Admin user row test id doesn't match the account's login identifier

* **Status:** verified real · **Size:** XS
* **Goal:** the Admin Dashboard's user-row test id is a stable identifier, not the mutable display name.
* **Verified state:** `client/src/pages/AdminPage.tsx:132` — `data-testid={`user-row-${u.name}`}`. The seeded
  superadmin's `name` is `'Admin'` (capital A, set at bootstrap in `server/src/index.ts`), so the rendered
  id is `user-row-Admin`. `tests/e2e/admin.spec.ts:32` asserts `getByTestId('user-row-admin')` (lowercase)
  and never finds it — found while getting the Playwright suite running for TEST-1.
* **Why:** `name` is a free-text display field a user can change (or duplicate with another user), so it's
  the wrong thing to build a test id from regardless of the casing mismatch; two users named the same thing
  collide on the same test id today.
* **Change:** `data-testid={`user-row-${u._id}`}` (or the email, which is unique and stable), and update
  `admin.spec.ts:32` to match.
* **Done when:** `admin.spec.ts`'s "Admin login and dashboard" test passes.

## FIX-7 — Monaco's background worker fails to load (broken independently of CSP)

* **Status:** verified real · **Size:** S
* **Goal:** Monaco's editor worker (syntax highlighting, validation, language features) actually starts.
* **Verified state:** `client/src/main.tsx:8` — `loader.config({ monaco })` bundles Monaco's core locally
  (real, this part of PERF-7/SEC-10's "blocker 2" is done — `monaco-editor` is a genuine dependency and the
  client build emits its per-language chunks), but nothing sets `self.MonacoEnvironment.getWorker` /
  `getWorkerUrl`. Reproduced live: open the body editor (`monaco-editor-container`) in a built, served
  (production-mode) client and the console shows `Failed to resolve module specifier
  "../../../base/common/worker/webWorkerBootstrap.js". Invalid relative url or base scheme isn't
  hierarchical.` — Monaco's default worker bootstrap tries to `import()` a relative module from inside a
  `data:` URL, which has no base to resolve against. **Confirmed independent of CSP**: identical error with
  `contentSecurityPolicy: false`. Do not spend SEC-10 effort on this — it is not a CSP problem, and adding
  `data:` to `worker-src`/`child-src` (tried, then reverted) does not fix it.
* **Why:** without its worker, Monaco falls back to (or simply lacks) syntax highlighting, diagnostics and
  language features in `BodyEditor.tsx`, `ScriptEditor.tsx` and `ResponseViewer.tsx` — it degrades to a
  plain textarea with Monaco's styling, silently, with no error surfaced to the user.
* **Change:** configure `self.MonacoEnvironment` in `main.tsx` (or a Vite plugin like
  `vite-plugin-monaco-editor`) to serve real bundled worker files via `new Worker(new URL(...), {type:
  'module'})` per language (json/typescript/css/html + the default editor worker), instead of relying on
  Monaco's AMD-style default bootstrap.
* **Done when:** the same reproduction (open the body editor, watch the console) shows no worker-load error,
  and a test asserts Monaco's language service actually responds (e.g. a JSON syntax error is underlined).

## FIX-8 — User search returns nothing for any email containing `_`, on SQLite

* **Status:** verified real · **Size:** S
* **Goal:** `GET /api/users/search` matches on SQLite the same way it does on Postgres/MySQL.
* **Verified state:** `server/src/utils/escapeLike.ts` escapes `_`/`%` as `\_`/`\%` for a Sequelize `Op.like`
  (`UserRepository.search`, `server/src/repositories/UserRepository.ts:120-134`). Postgres and MySQL both
  default `LIKE`'s escape character to `\`, so this works there. **SQLite has no default `LIKE` escape
  character at all** — without an explicit `ESCAPE '\'` clause (which Sequelize's `Op.like` never adds),
  SQLite reads `\_` as two literal characters, a backslash then a wildcard `_`, not an escaped literal
  underscore. Reproduced directly against a live sqlite-backed server: `?q=viewer` (name match, no
  underscore) → 1 result; `?q=viewer_` (a valid literal prefix of a real user's email) → `[]`. Found
  independently twice — once verifying UI-3, once by the UI-1 migration subagent hitting it via
  `user-autocomplete-input` in `conflict.spec.ts`/`rbac.spec.ts`/`socket-advanced.spec.ts`/`socket-sync.spec.ts`.
* **Why:** almost every email contains `_` or is likely to. On the default database backend, workspace
  member invite search, and anything else built on `UserRepository.search`, silently returns nothing for
  most real inputs.
* **Change:** add the dialect-appropriate `ESCAPE` clause. Sequelize doesn't expose this via `Op.like`
  directly — either drop to `sequelize.literal`/a raw `WHERE ... LIKE ? ESCAPE '\'` for the sqlite/postgres/
  mysql path (keep `escapeLike`'s existing mssql bracket-form branch as is, it doesn't use backslash), or
  find whichever Sequelize option surfaces the escape clause per dialect.
* **Done when:** `UserRepository.search('someone_with_underscore')` finds an exact match on all three
  supported SQL backends, not just Postgres/MySQL.

## FIX-9 — Switching workspaces can silently show the wrong (or no) collections

* **Status:** verified real · **Size:** S
* **Goal:** the collection tree shown always corresponds to the currently-selected workspace.
* **Verified state:** `client/src/components/collection/CollectionExplorer.tsx:646-650` —
  `useEffect(() => fetchCollectionsData(activeWorkspace._id), [activeWorkspace?._id])`. In dev
  (`<StrictMode>`, `client/src/main.tsx:11`) this effect runs twice per change, and on a workspace switch
  there is a brief window where a fetch for the *previous* workspace is still in flight alongside the new
  one; `fetchCollectionsData` (`client/src/store/collectionStore.ts:99-145`) does `set({ collections:
  serverCols })` unconditionally, with no check that `workspaceId` still matches the currently-active
  workspace and no request cancellation. Whichever response resolves last wins, regardless of which
  workspace it was for. Reproduced directly: logged the actual network responses during a real
  invite-then-switch flow — a fetch for the *old* workspace (correctly empty) sometimes resolves after the
  fetch for the newly-selected one (correctly populated), and the tree is left showing "No collections yet"
  for a workspace that has one. Not reproducible if the previous fetch is given time to fully settle before
  switching, which is what makes it intermittent rather than constant.
* **Why:** a real user switching workspaces in quick succession (or right after being invited to one) can
  see a wrong, silently-stale collection tree with no indication anything is wrong.
* **Change:** guard the `set()` calls in `fetchCollectionsData` on `workspaceId === get().activeWorkspaceId`
  (or thread an AbortController per call and cancel the previous one on a new call), so a stale response is
  dropped instead of applied.
* **Done when:** a test switches workspaces twice in quick succession and asserts the tree always matches
  the *last* selection, never an intermediate one.

## FIX-10 — Renaming a workspace right after creating it can silently revert the name

* **Status:** verified real (found by a subagent while migrating tests/e2e off native dialogs) · **Size:** S
* **Verified state:** `client/src/components/workspace/WorkspaceSettingsModal.tsx`'s mount `useEffect` GETs
  the workspace and calls `setName(res.data.name)` after the modal opens. If a test (or a fast user) types a
  new name into the name field before that GET resolves, the GET's `setName` fires afterward and stomps the
  typed value back to the original — the ensuing Save then saves the *old* name. Reproduced deterministically
  in both `workspace.spec.ts` and `crud-rename.spec.ts` (both rename a workspace immediately after creating
  it): the workspace stays unrenamed after Save + Close.
* **Why:** a real user who edits the name field quickly after opening workspace settings can have their edit
  silently discarded.
* **Change:** only apply the GET's `setName` if the field hasn't been touched yet (e.g. track a `dirty`
  flag, or skip the GET's own `setName` once the user's input differs from the initial value), or fetch
  before rendering the field instead of after.
* **Done when:** a test types a new workspace name immediately (no artificial wait) after opening settings,
  saves, and asserts the new name persisted.

## FIX-11 — Saving an edited request can 400 on the request's own save payload

* **Status:** verified real (found by a subagent while migrating tests/e2e off native dialogs) · **Size:** M
* **Verified state:** `UrlBar.tsx`'s `handleSaveClick` sends the in-memory `activeRequest` object straight to
  `PUT /requests/:id`. That object carries client-only fields (`_id`, `collectionId`, `tabId`, `isDirty`,
  …) alongside the real update. Reproduced directly: the server responds `400 {"message":"Invalid request
  body","issues":[...\"Unrecognized key(s)…'_id','collectionId','tabId','isDirty'\"]}` — the `.strict()` Zod
  schema (SEC-9) rejects them. This blocks the conflict-resolution scenario in `conflict.spec.ts`,
  `socket-sync.spec.ts` and `socket-advanced.spec.ts` from ever reaching the point of producing a real
  conflict, since the *first* save in the scenario already 400s.
* **Why:** this isn't just a test problem — it means saving an edited request from the UI can fail outright
  depending on which fields happen to be present on `activeRequest` client-side, most likely intermittently
  as the client state shape evolves.
* **Change:** build the `PUT /requests/:id` payload as an explicit allowlist of writable fields (matching
  the pattern already used elsewhere, e.g. `routes/requests.ts`'s own handlers), not a spread of the whole
  client-side request object.
* **Done when:** saving an edited request whose in-memory object carries `_id`/`collectionId`/`tabId`/
  `isDirty` succeeds, and a test asserts the exact payload sent has none of the client-only fields.

## FIX-12 — Creating a request inside a folder doesn't refresh the sidebar tree

* **Status:** verified real (found by a subagent while migrating tests/e2e off native dialogs) · **Size:** S
* **Verified state:** reproduced directly while fixing `scripts-scope.spec.ts`'s folder/request creation
  flow: `POST /requests` (via the folder-scoped "new request" action) returns `201` with the correct
  `name`/`folderId`/`collectionId` every time, but the sidebar never renders the new node — `node-<name>`
  never appears, confirming the create succeeded server-side and the client simply doesn't reflect it for a
  folder-scoped creation. Collection-scoped request creation (not inside a folder) doesn't show this.
* **Why:** likely the same missing-refresh/stale-tree class of bug as FIX-9, scoped to whatever code path
  handles folder-nested request creation specifically — a real user creating a request inside a folder
  would not see it appear without a manual refresh.
* **Change:** find the folder-scoped "new request" handler (`CollectionExplorer.tsx`, the
  `action-menu-new-request`-style action under a folder node) and confirm it updates local/store state (or
  triggers a refetch) the same way collection-scoped creation does.
* **Done when:** a test creates a request inside a folder and asserts the node appears without a page reload.

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

* **Status:** verified real · **Size:** M · **The single worst performance defect in the product.**
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

* **Status:** done · **Size:** M
* **Verified state (accurate as found):** `RequestRepository.findByCollection` had no `attributes`
  projection, so every sidebar row carried `params`, `headers`, `auth`, `body`, both scripts and `comments`.
  `compression` was in neither `server/package.json` nor `index.ts`. This section's claims were correct —
  unlike most of what surrounded it in this file.
* **Change:**
  1. `RequestRepository.findSummaryByCollection` / `findSummaryByFolder`: `attributes: ['id',
     'collectionId', 'folderId', 'name', 'method', 'order']` — no `id` duplicate of `_id` (the tree/list
     views only ever key on `_id`; verified nothing reads the plain `.id` field client-side).
  2. `GET /collections/:collectionId/requests` (`routes/collections.ts:166-180`) — the route the client
     actually calls (`fetchCollectionsData`, `client/src/store/collectionStore.ts:117`) — now uses the
     summary methods. Opening a request already does its own fresh `GET /requests/:id` for the full record
     (`CollectionExplorer.tsx:191`), so the list no longer needing to carry everything doesn't cost a round
     trip that wasn't already happening.
  3. `compression` added as a dependency and wired in `index.ts` right after `helmet`.
  4. Left the `/workspaces/:workspaceId/tree` endpoint (Task 0) on the same summary method for consistency,
     though **it is currently dead code** — `grep -rn "/tree" client/src` returns nothing; nothing calls it.
* **Traps:**
  1. The raw (uncompressed) JSON for 500 realistic requests is genuinely large even summarized (~80 KB) —
     three UUID-shaped fields (`_id`, `collectionId`, and `folderId` when set) dominate the size at that row
     count, and none of the three can be dropped (the client re-groups a flattened cross-collection array
     by `collectionId`, and `_id` is load-bearing everywhere). **The 50 KB budget is a wire budget, met via
     gzip, not a raw-JSON budget** — measure the gzipped size, matching what `compression()` actually puts
     on the wire, not `JSON.stringify(...).length`.
  2. Don't let gzip's own effectiveness fool you into thinking the projection doesn't matter: a fixture
     whose 500 requests all share one repeated script string gzips the *full*, unprojected record set down
     to ~31 KB on its own — gzip crushes repeated substrings regardless of which fields carry them.
     Real, independent per-request bodies/scripts don't have that redundancy, so don't use "gzip already
     gets the full records under budget" as a reason to skip the projection — a fixture built to look
     realistic can still accidentally prove the wrong thing if every row is a copy of the same string.
* **Done when:** `server/src/tests/perf6.test.ts` — a 500-request collection's summary list, gzipped, is
  under 50 KB, and the same fixture's full records exceed 50 KB *uncompressed* (establishing the fixture
  itself is heavy, independent of what compression does to it).

---

## PERF-7 — Client bundle weight

* **Status:** verified real — **except the Monaco claim, which was backwards** · **Size:** M
* **Verified state:** `client/package.json` ships **both** `moment ^2.30.1` (imported in 2 files) and
  `date-fns ^4.4.0`; `lodash ^4.18.1` is whole-imported in 2 files; `chai ^6.2.2` and `crypto-js ^4.2.0`
  are runtime dependencies. `@types/chai`, `@types/js-yaml` and `@types/uuid` sit in `dependencies` rather
  than `devDependencies`. The current build emits a single ~985 KB JS chunk (289 KB gzipped).
* **Correction (2026-09-26):** both the original claim and this section's own prior correction are now
  stale. `monaco-editor` **is** a bundled dependency (`client/src/main.tsx:3-8`,
  `client/package.json:31`) — someone bundled it since this note was written, and SEC-10 (verified done)
  confirms it. The client build already emits its per-language chunks (`tsMode-*.js`, `jsonMode-*.js`,
  `pgsql-*.js`, …), so the "substantially bigger bundle" this section warned about sequencing after SEC-10
  is already the current, measured baseline — set the budget from what the build emits today, not from an
  assumption that Monaco is still to be added. Separately, its worker doesn't actually load correctly
  (FIX-7) — irrelevant to bundle size, but don't be surprised the feature is half-broken while sizing it.
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

* **Status:** done · **Size:** M · **Highest-leverage item in this section.**
* **Goal:** the browser suite runs on every push and a broken selector turns CI red.
* **Correction (2026-09-26):** the verified state below was wrong on two counts. `test.yml` already had a
  Playwright job (`Install Playwright & dependencies` + `Run Playwright E2E tests`, running
  `--project=${{ matrix.db }}` plus `--project=extension` on sqlite) — someone landed most of this task
  already, uncredited. And `docker-publish.yml` already calls `test.yml` via `uses:
  ./.github/workflows/test.yml` (a `workflow_call`), not duplicated inline steps — so it already can't
  publish without the whole thing passing. What was actually missing, found by trying to run it:
  1. **`CERT_ENCRYPTION_KEY` was never set** in the "Start server" step, so migration `004` refused to run
     and the server never came up — every matrix backend failed before Jest or Playwright ever started.
     Fixed: generates one with `openssl rand -hex 32` inline. Also added the var to `.env.example` (which
     had it too, but mangled — mixed UTF-16/UTF-8 bytes from whatever wrote it, see the file's history) and
     the README secrets table, per SEC-8's own note to do so.
  2. **Trap 1 (below) was real**, and its actual root cause was worse than described: `admin.spec.ts` runs
     first alphabetically and permanently changes the seeded admin's password via the UI, which broke
     `collection.spec.ts`/`environments.spec.ts`/`requests.spec.ts` (all hardcoded `admin`/`admin`) for the
     rest of the run. Fixing the ordering surfaced a real, separate bug: `changePasswordSchema`
     (`server/src/schemas/auth.schemas.ts`) required `currentPassword` unconditionally, so the forced
     first-login change returned 400 for *everyone* — including the real `ForcePasswordChangeModal.tsx`,
     which never sends it. That's not a test-only bug; it means no seeded/bootstrapped admin could ever
     complete a forced password change through the UI. Fixed: `currentPassword` is now `.optional()` (the
     route handler already only enforces it when `!mustChangePassword`, so this doesn't weaken the normal
     change path). `tests/e2e/global-setup.ts` now performs the forced change once via API before any spec
     runs, and the four specs that log in as the seeded admin use the resulting password.
* **Verified state (superseded, kept for the "why" below):** ~~`.github/workflows/test.yml` runs: build
  server → build client → boot a sqlite-backed `node server/dist/index.js` on 3005 → `npm test --prefix
  server` (jest) → `scripts/smoke-core.sh`. No Playwright step exists. `docker-publish.yml:10-40` duplicates
  the same steps inline as a `test` job that `build-and-push` depends on, so image publishing is gated on a
  suite that never opens a browser.~~ — see the correction above.
* **What a full local `--project=sqlite` run actually shows (2026-09-26, after both fixes above): 6 passed,
  23 failed, 6 did not run (of 35).** The 23 failures are pre-existing, unrelated bugs — a native-dialog/
  `customPrompt` mismatch (UI-1, see its correction), the `user-row` test id casing (FIX-6), and others not
  yet triaged — not selector breakage this task introduced. TEST-1's own goal (CI runs the suite, a broken
  selector turns it red, `docker-publish` can't publish past a failing one) is met and directly observed
  during this run. Getting the other 23 green is TEST-3's job, not this one's — do not expand this task to
  cover them.
* **Why:** 25 spec files covering auth, RBAC, share, runner, scripts, sockets and more exist; they need to
  actually run for a UI regression to be caught before it ships. The stale "~800 Playwright tests" claim
  from an earlier revision was also wrong — it's **36 `test()` calls across 25 files** (148 `expect()`s),
  from a stale comment at `playwright.config.ts:27` (already fixed, no longer present).
* **Traps (both real, see the correction above for what they actually took):**
  1. `globalSetup` was active, not commented out as an earlier revision claimed — but it did a MySQL wipe
     only, not the forced-password walk its own doc comment described. Fixed above.
  2. `workers: 1` and `retries: 2` on CI: 36 tests each doing real round-trips take minutes (the local sqlite
     run above took ~9 minutes). Budget for it.
* **Done when:** deliberately breaking a selector makes CI red, and `docker-publish.yml` cannot publish an
  image whose UI suite failed. Verified directly: this run's 23 real failures already do both.

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
* **Correction (2026-09-26, from TEST-1's first real CI run):** "partial" below meant *incomplete coverage*
  in areas that were assumed to pass. A full `--project=sqlite` run (once TEST-1's CI-blocking bugs were
  fixed) shows most of them don't: **23 of 35 tests failed, 6 didn't run, only 6 passed.** This section's
  job is still the same (write the missing assertions per area), but expect to find the *existing*
  assertions in most rows broken too, not just thin. Two causes already identified while running it: a
  native-dialog/`customPrompt` mismatch on workspace creation (breaks `collection.spec.ts`,
  `environments.spec.ts`, `requests.spec.ts` — see UI-1's correction) and the `user-row` test id using a
  mutable display name instead of a stable one (breaks `admin.spec.ts` — FIX-6). The rest of the 23 are not
  yet triaged row-by-row; do that before assuming the table below still describes today's actual failures.
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

## TEST-7 — `sec10.e2e.test.ts`'s flood pollutes every other jest suite that runs after it

* **Status:** verified real · **Size:** S
* **Goal:** running the full jest suite doesn't produce spurious 429s in unrelated tests.
* **Verified state:** `sec10.e2e.test.ts` fires up to 350 POST requests at `/api/workspaces` to trigger the
  global `mutationLimiter` (`index.ts:206`, 300/min, keyed by `req.ip`). Every other e2e suite shares the
  same server process and the same loopback IP, so its bucket is still full when they run next. Jest's
  default file order is lexicographic, which puts `sec10.e2e.test.ts` right before `sec11.e2e.test.ts` and
  `sec9.e2e.test.ts`/`share.e2e.test.ts` shortly after (`'1' < '9'` as characters) — both intermittently get
  a 429 where they expect a 403/400/200. Reproduced directly: `npm test` full run → 9 failures across 5
  suites, all "Received: 429"; the same run with `--testPathIgnorePatterns='sec10\.e2e'` → clean (only the
  3 pre-existing FEAT-10 failures). Found while verifying SEC-10 — not a SEC-10 defect, the limiter is
  working exactly as designed; the test that exercises it is the one leaking state.
* **Why:** this is exactly the kind of test-suite flakiness that makes people ignore real CI failures ("it's
  probably just that flaky rate-limit thing").
* **Change:** give `sec10.e2e.test.ts`'s flood request a distinguishing header/IP the limiter's `keyBy` can
  isolate on (the limiter already accepts a `keyBy` option), or run it in its own jest project/last, so its
  bucket exhaustion can't bleed into a sibling suite.
* **Done when:** the full suite passes twice in a row with no 429-related failure, run back to back without
  restarting the server.

## TEST-8 — Multi-`test()` spec files assume a shared login that Playwright doesn't give them

* **Status:** verified real (found by a subagent while migrating tests/e2e off native dialogs) · **Size:** M
* **Verified state:** several spec files split one scenario across multiple `test()` blocks with a comment
  like "Run serially to reuse state" (e.g. `collection.spec.ts`, `environments.spec.ts`, `requests.spec.ts`)
  — but Playwright gives every `test()` its own fresh, unauthenticated browser context by default; nothing
  shares cookies between them. Reproduced directly: after test 1 logs in and the block ends, test 2's page
  has zero cookies and `/` immediately redirects to `/login`. `test.describe.configure({ mode: 'serial' })`
  (present in some of these files) only orders execution — it does not share browser state.
* **Why:** these files' later tests in the sequence don't actually test what they claim to (continuing an
  authenticated session); they silently fail at the login boundary instead.
* **Change:** use Playwright's `storageState` (save it after test 1's login, load it for subsequent tests in
  the same file) or restructure each file's scenario into a single `test()`, matching what
  `permission-toast.spec.ts` and `conflict.spec.ts` already do with one long test per scenario.
* **Done when:** every multi-`test()` spec file in this state either shares login via `storageState` or is
  restructured into one test, and none of them redirect to `/login` partway through.

---

# UI — Client experience

## UI-1 — Replace native `prompt()` / `confirm()` / `alert()` with the app's own modals

* **Status:** done · **Size:** M
* **Correction (2026-09-26):** this section's site count and trap file list were both far more stale than
  the "9, not 10" correction above already flagged. Fresh grep at the time this was picked up (including
  bare `prompt(`, which the old grep pattern didn't match) found only **8 real sites** across 4 files —
  `AdminPage.tsx`, `HistorySidebar.tsx`, `Sidebar.tsx`, and most of the previously-listed `AdminPage.tsx`
  `alert()`s were *already* migrated to `customConfirm`/toasts and just never credited:
  `RequestTabBar.tsx:83` (confirm), `UrlBar.tsx:380` (confirm), `EnvironmentSidebar.tsx:19,44,55` (2×prompt,
  1×confirm), `EnvironmentTabEditor.tsx:76,98,102` (3×alert). All 8 fixed — the 3 confirms now use
  `customConfirm`, the 2 prompts `customPrompt`, the 3 alerts route through `toastStore` (UI-2).
  `grep -rn "window\.prompt\|window\.confirm\|[^.]\balert(\|[^.]\bconfirm(\|[^.]\bprompt(" client/src`
  (note the added bare-`prompt(` alternation — the original grep in "Done when" below would have missed
  `EnvironmentSidebar.tsx`'s two `prompt(...)` calls entirely) now returns nothing.
* **The much bigger discovery:** because collection/folder creation (`CollectionExplorer.tsx`) and workspace
  creation (`Sidebar.tsx`) were *already* migrated to real modals (`PromptModal`/`ConfirmModal`, both via
  `customPrompt`/`customConfirm` or `CollectionExplorer`'s own local `promptConfig`/`confirmConfig` state —
  same components, same test ids: `prompt-input`, `prompt-submit`, `prompt-cancel`, `confirm-btn`,
  `confirm-cancel-btn`), **every one of 13 spec files** still installed a `page.on('dialog', ...)`/
  `page.once('dialog', ...)` listener expecting a real browser dialog that no longer appears:
  `collection.spec.ts`, `conflict.spec.ts`, `crud-rename.spec.ts`, `environments.spec.ts`, `history.spec.ts`,
  `rbac.spec.ts`, `requests.spec.ts`, `scripts-scope.spec.ts`, `scripts.spec.ts`, `socket-advanced.spec.ts`,
  `socket-sync.spec.ts`, `tabs.spec.ts`, `workspace.spec.ts` — not the 3 files (`collection.spec.ts`,
  `conflict.spec.ts`, `crud-rename.spec.ts`) this section's old Trap 2 named. This is very likely a
  significant chunk of TEST-1's "23 of 35 failed" finding, not a separate issue — most specs bootstrap a
  workspace/collection first, and a silently-no-op dialog handler leaves the test operating on stale
  pre-existing state instead of what it thinks it just created.
* **Why:** unstyled/unthemeable native dialogs aside, the real cost turned out to be the test suite silently
  drifting out of sync with a migration that had already happened.
* **Change:** all 13 spec files' dialog interactions rewritten to drive the real modal (fill
  `prompt-input`/click `prompt-submit`, or click `confirm-btn`/`confirm-cancel-btn`) instead of a
  `page.on('dialog', ...)` handler. `conflict.spec.ts`'s one *real* dialog assertion (the request-overwrite
  conflict, now `UrlBar.tsx`'s `customConfirm` call) was rewritten to assert on the `ConfirmModal`'s message
  text and click `confirm-cancel-btn` (save as new), matching its original intent.
* **Done when:** the grep above returns nothing, and `grep -rln "on('dialog'\|once('dialog'" tests/e2e/`
  returns nothing outside of any site confirmed still genuinely native (none were found).

## UI-2 — One global feedback surface

* **Status:** done · **Size:** M
* **Correction (2026-09-26):** the infrastructure this section said didn't exist was already there —
  `client/src/store/toastStore.ts` (a zustand store, 5s auto-dismiss) and
  `client/src/components/common/ToastContainer.tsx`, mounted unconditionally in `App.tsx:176`. `api/axios.ts`
  already routes every `403` response through it globally. What was still real: 6 modal components
  (`ShareLinkModal`, `ImportModal`, `CopyToWorkspaceModal`, `AddUserModal`, `WorkspaceSettingsModal` — 4
  call sites, `GlobalSettingsModal`) caught their own async failures into local `useState`, which is gone
  the instant the component unmounts — the exact bug this task describes. `GlobalSettingsModal`'s
  `handleDelete` was worse: `console.error` only, no user-facing feedback at all, ever.
* **Change:** each of those catch blocks now also calls `useToastStore.getState().addToast('error',
  message)` alongside (not instead of) its existing `setError` — inline feedback while the modal is open,
  guaranteed feedback either way. Added `data-testid`s to `ToastContainer` (`toast-{type}`) and
  `AddUserModal`/its trigger button, neither of which had any.
* **Done when:** `tests/e2e/toast-on-closed-modal.spec.ts` — opens `AddUserModal`, submits, closes the modal
  before a deliberately delayed+failing mocked response lands, asserts the toast still appears with the
  right message. Fails against the pre-fix code (verified by temporarily reverting the fix), passes with it.

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
| "Monaco is loaded eagerly" (PERF-7) | Superseded twice: first corrected to "not bundled at all, fetched from jsDelivr", then (2026-09-26, SEC-10) found bundled locally after all — someone shipped it in between. Re-verify against the code, not either past claim, before touching PERF-7 |
| UI-1 covers 10 native dialog sites | 22 — the 12 `alert()` calls were missed entirely |
| UI-3: "remove the double `AuthGuard` on /admin" | **Dangerous.** The inner guard at `App.tsx:229` carries the superadmin check. Removing it exposes the admin page to any logged-in user |
| SEC-9: add `params: Record<string, string>` to `AuthRequest` | Already present at `middleware/auth.ts:15` |
| SEC-2 has four authorization holes | Six candidates; four are real, and two (`/requests/import/curl`, `/requests/import/raw-http`) never write anything and are not holes |
| "Shipped" table (2026-09-25) lists FEAT-10 as Completed | Not true as of 2026-09-26: `server/src/routes/importExport.ts:19-24` is a one-line dummy — `res.json({ info: { name: collection?.name }, item: [] })` — and no `POST /collections/import` route exists at all. `feat10.e2e.test.ts` fails 3/3. README already correctly shows FEAT-10 `[ ]`; only this file's changelog was wrong |

## Working-tree state

At the time of this pass, `git status` showed four files modified and uncommitted, belonging to a parallel
session — `server/src/routes/auth.ts` (the `if (false)` → real `allowSelfRegistration` check, which is half
of FIX-5) and three `tests/e2e/*.spec.ts` files swapping the `uuid` import for `crypto.randomUUID`. Check
`git status` before editing those files, and do not revert or commit them as part of an unrelated task.
