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





## SEC-10.0 — Blockers (verified; clear these before enabling any policy)

1. **`new Function` is on two live paths.** `client/src/utils/scripts.ts:134` and `:312`, plus
   `client/src/sandbox/worker.ts:77`. The previously proposed `scriptSrc: ["'self'", "'wasm-unsafe-eval'"]`
   **does not permit `new Function`** — `'wasm-unsafe-eval'` covers WebAssembly compilation only. Scripts
   would throw `EvalError` under that policy. Either ship with `'unsafe-eval'` (still blocks injected
   remote scripts, inline handlers and plugins — most of the value) or block SEC-10 on SEC-3.
   **Recommended: ship with `'unsafe-eval'` and a comment naming SEC-3 as what removes it.** Never ship a
   policy that silently breaks scripts.
2. **Monaco is fetched from a CDN at runtime.** `client/package.json` depends on `@monaco-editor/react@^4.7.0`
   but **not** on `monaco-editor`, and `grep -rn "loader.config" client/src` finds nothing — so the loader
   pulls `https://cdn.jsdelivr.net/npm/monaco-editor@*/min/vs/...` on demand. `script-src 'self'` breaks
   **every** editor (`BodyEditor.tsx`, `ScriptEditor.tsx`, `ResponseViewer.tsx`). Fix it properly as part of
   this item: `npm --prefix client install monaco-editor`, then once in `client/src/main.tsx`:

   ```ts
   import { loader } from '@monaco-editor/react';
   import * as monaco from 'monaco-editor';
   loader.config({ monaco });
   ```

   This also removes a live supply-chain dependency and makes the app work offline. Expect a much larger
   bundle (Monaco is ~2-3 MB pre-gzip) — coordinate with PERF-7, which is the same file. Allowlisting
   jsdelivr in `script-src` instead keeps the CDN trust and is **not** recommended.
3. **The visualizer iframe needs the CDN and an inline script.**
   `client/src/components/response/ResponseViewer.tsx:537-560` builds the frame with **`srcDoc`**, which
   inherits the parent's CSP, and inside it loads `handlebars@latest` from jsDelivr plus an inline
   `<script>` that compiles the user's template. Under any reasonable policy it breaks twice. Fix: add
   `handlebars` as a client dependency, compile the template **in the parent**, and put only the resulting
   HTML into a `sandbox=""` iframe with no scripts at all. This is the same work as SEC-3 step 5 — do them
   together.
4. **Hotlinked Google favicon.** `client/src/pages/LoginPage.tsx:83` and `RegisterPage.tsx:111` use
   `https://www.google.com/favicon.ico`. Vendor a local `google.svg` into `client/public/` rather than
   widening `img-src`.
5. **Dev mode differs.** Vite's dev server uses inline scripts and a `ws://localhost:5173` HMR socket, and
   helmet runs in dev too. Gate the strict policy on `NODE_ENV === 'production'`.

### SEC-10.1 — CSP

Replace `index.ts:115`:

```ts
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-eval' is required by the script runner (client/src/utils/scripts.ts uses
      // new Function). SEC-3 is what removes it; 'wasm-unsafe-eval' does NOT cover new Function.
      scriptSrc: ["'self'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],          // Tailwind + inline <style> in App.tsx
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: isProd ? ["'self'"] : ["'self'", 'ws:', 'wss:', 'http://localhost:5173'],
      workerSrc: ["'self'", 'blob:'],
      frameSrc: ["'self'", 'blob:'],                    // srcDoc frames are opaque-origin
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  hsts: isProd ? { maxAge: 15552000, includeSubDomains: false } : false,
}));
```

**Ship it `reportOnly: true` first.** Click through every screen — editors, visualizer, runner, admin,
share page, OAuth — collect violations from the console, then flip to enforcing. This is the
highest-value step in the item.

HSTS: start at 180 days and leave `includeSubDomains` **off** for the first rollout. HSTS is cached by
browsers and cannot be undone remotely, and this deployment is reached over a Tailscale Funnel hostname
where a mistake is awkward to reverse. Raise it once the header has been live and stable.

### SEC-10.2 — Rate limiting beyond login

Add an optional `keyBy` to `rateLimit` (defaulting to the current `req.ip`), then in `index.ts`, after the
DB gate and before the route mounts:

```ts
const mutationLimiter = rateLimit({ windowMs: 60_000, max: 300, message: 'Too many requests — please slow down.' });
app.use('/api', (req, res, next) =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? mutationLimiter(req, res, next) : next());
```

* **Traps:**
  1. The previous revision proposed `keyBy: (req) => (req as AuthRequest).user?._id ?? req.ip` **at this
     mount point**. That cannot work: this middleware runs before any router's `authenticate`, so
     `req.user` is always `undefined` and the limiter silently degrades to IP-keying. Accept IP-keying here
     (`app.set('trust proxy', …)` is configured at `index.ts:109`, so `req.ip` is the real client IP), or
     mount a user-keyed limiter **inside** routers after `authenticate`. Never key by an unverified token
     claim — a forged `sub` would let an attacker choose someone else's bucket.
  2. **Validate the threshold against the collection runner before shipping.** It issues bursts of writes,
     and an office behind one NAT shares an IP. A limiter that fires on legitimate use gets ripped out
     wholesale in a panic, which is worse than not having one.
  3. In-memory means per-process. With `replicas: 2` the effective limit is double and inconsistent — the
     real fix shares SOCK-3's Redis.
* **Done when:** the CSP header is present in production, the console is violation-free across every screen
  listed above, Monaco loads with the network offline (proving it is bundled), the 301st write in a minute
  returns 429, and a full collection-runner execution does **not**.

---

## SEC-12 — Remove the NTLM auth option

* **Status:** verified real, **deferred by the owner on 2026-09-25** — the half-built UI stays for now.
  Recorded here so it is not rediscovered as a new finding. `IGNORE.md` lists NTLM as declined and points
  at this task as the removal.
* **Verified state:** the UI collects a domain username and password and sends them as
  `x-reqspace-ntlm-username` / `-password` / `-domain` / `-workstation` headers.
  **Nothing reads them** — `grep -ri ntlm server/src` returns no matches. The handshake never happens; the
  user's domain credentials are simply transmitted in clear custom headers to whatever host they typed.
* **Change when resumed:** drop `'ntlm'` from the `RequestAuth` union and delete the `ntlm?` field
  (`client/src/store/requestStore.ts:22,27`); remove the `AUTH_TYPES` entry and panel
  (`client/src/components/request/AuthEditor.tsx:13`, `:182-220`); delete the branch in
  `UrlBar.tsx:172-178`; and migrate on read — any stored request with `auth.type === 'ntlm'` becomes
  `{ type: 'none' }`, added to the existing `requestStore` persist migration (bump to `version: 2`).
* **Done when:** `grep -ri ntlm client/src server/src` returns nothing and a request saved with NTLM auth
  loads as "No Auth".

---

# FIX — Broken in place

Numbering note: FIX-2, FIX-3, FIX-4 and FIX-5 are absent because they shipped. See
[Removed](#removed-on-2026-09-25). Their numbers are not reused, so old commit messages stay meaningful.

## FEAT-10 — Server-side collection export/import (v2.1) *(parity item 59)*

* **Status:** verified real; line numbers exact · **Size:** L · Shares its id-remapping with FIX-1 — do
  FIX-1 first and reuse it.
* **Verified state:** `server/src/routes/importExport.ts:15-18` returns a `{info:{name}, item:[]}`
  placeholder and `:20-22` returns `'Import successful (stub)'`. The **working** implementation is
  client-side at `client/src/components/collection/CollectionExplorer.tsx:726` (`exportCollection`), with the
  v2.1 shape built at `:835`.
* **Change:** move the serialiser somewhere both sides can import; `GET /api/collections/:id/export` with
  `requireWorkspaceRole('viewer')` (SEC-2), **streaming** the JSON per item rather than building one buffer;
  `POST /api/collections/import` with `requireWorkspaceRole('editor')`, Zod validation (SEC-9), a size cap
  and FIX-1's remapping. **Strip secrets by default** — `auth` blocks and denylisted headers become
  placeholders; `?includeSecrets=true` is allowed for an `owner` and is audit-logged. Delete the client
  duplicate once the server path is proven.
* **Traps:** the existing client serialiser writes a **fabricated schema URL** —
  `https://schema.getreqSpace.com/json/collection/v2.1.0/collection.json`. That domain does not exist, and
  the value is what other tools read to identify the format. Decide what it should be (Postman's real v2.1
  schema URL, if interop is the goal) and fix it while moving the code.
* **Done when:** an API round-trip test exports a collection containing folders, scripts and variables,
  re-imports it into a different workspace and asserts the tree matches; plus a test asserting a bearer
  token is absent from a default export and present with `includeSecrets=true` as an owner.

---

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
| **FIX-1** — Admin workspace export throws, and import silently orphans everything | Updated dmin.ts to fetch children correctly, issue new UUIDs for collectionId, olderId, and parentFolderId, run everything inside a transaction, and manually validate parentFolderId. | server/src/routes/admin.ts, server/src/schemas/admin.schemas.ts, server/src/tests/fix1.e2e.test.ts |

| **SEC-3** — Sandbox user scripts | User scripts now execute inside `worker.ts` with no access to DOM or `localStorage`. `new Function` removed from main thread. Async `sendRequest` requests routed back to main thread and capped at 10. Added `sandbox="allow-scripts"` to visualizer iframe, removed `allow-same-origin` from preview iframe, self-hosted Handlebars. | `client/src/utils/scripts.ts`, `worker.ts`, `ResponseViewer.tsx`, `client/public/handlebars.min.js` |
| **SEC-8** — Encrypt client certificates at rest | Created `cryptoBox.ts` to seal/open with AES-256-GCM. Updated `POST /certificates` to encrypt private keys and passphrases. Updated `GET /me` to return only metadata without cert/keys. Created migration to seal existing certificates. Unsealed keys in `proxy.ts` on use. | `server/src/utils/cryptoBox.ts`, `server/src/routes/auth.ts`, `server/src/db/migrations/004-seal-client-certificates.ts`, `server/src/routes/proxy.ts`, `server/src/tests/auth.e2e.test.ts` |
| **SEC-0.6** — Strip the public share payload, and make links revocable | `auth` and `headers` fields stripped of sensitive data. `testScript` and `preRequestScript` removed entirely from response. Added `DELETE /api/share/:shortId`. Reused existing generated token. Added rate limit. | `server/src/routes/share.ts`, `server/src/tests/share.e2e.test.ts` |
| **SEC-13** — Self-registration grants superadmin | `isSuperAdmin` is set to `false` in `auth.ts` upon registration. Pre-existing unintended superadmins were remediated via db query. | `server/src/routes/auth.ts:54`, `server/src/tests/auth.e2e.test.ts` |
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
