# 🚀 Reqspace

> A modern, lightweight, and open-source web-based API testing platform.

Reqspace (formerly reqSpace Clone) is a comprehensive API testing environment designed to run natively in your browser. It provides all the essential features you need to design, test, and manage APIs, backed by a powerful Node.js server that supports multiple database types and robust authentication.

## ✨ Features

- **🌐 Complete API Client:** Send GET, POST, PUT, DELETE, PATCH, and OPTIONS requests with full control over headers, query parameters, and body payloads (JSON, Text, Form Data).
- **📂 Collections & Folders:** Organize your endpoints logically into collections and nested folders.
- **🔄 Dynamic Environments:** Create multiple environments (Local, Staging, Prod) and use {{variables}} seamlessly across your URLs, headers, and bodies.
- **🔐 Authentication:** Built-in JWT-based local authentication and **Google OAuth** integration. 
- **👥 Role-Based Access Control (RBAC):** Admin dashboard to manage users, permissions, and system configurations directly from the UI.
- **📜 History & Audit Logs:** Never lose a request. Everything is saved in your personal history, and system-wide changes are securely audited.
- **📦 Multi-Database Support:** Run it on your preferred database! Out-of-the-box support for **SQLite, PostgreSQL, MySQL, and MongoDB**.
- **🐳 Docker Ready:** Fully containerized with a lightweight multi-stage Docker build for easy deployment.

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, TailwindCSS, Zustand (State Management), Vite/Rolldown
- **Backend:** Node.js, Express, TypeScript, Sequelize (SQL), Mongoose (NoSQL)
- **Containerization:** Docker, GitHub Actions

## 🐳 Quick Start (Docker)

The fastest way to get Reqspace running is via Docker. The image is automatically built and published.

```bash
# Run the application on port 3005
docker run -p 3005:3005 -d itayp/reqspace:latest
```
Access the application at http://localhost:3005.

## 💻 Local Development

If you want to contribute or run the project locally:

### Prerequisites
- Node.js (v20+ or v22+ recommended)
- A supported database (or just use the default SQLite!)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Itayp1/reqspace.git
   cd reqspace
   ```

2. **Install Dependencies:**
   ```bash
   # Install Server dependencies
   cd server
   npm install

   # Install Client dependencies
   cd ../client
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file in the server directory:
   ```bash
   cd server
   cp .env.example .env
   ```
   *By default, Reqspace uses a local SQLite database requiring zero configuration!*

4. **Run the Application (Development Mode):**
   ```bash
   # In one terminal window (Start Server)
   cd server
   npm run dev

   # In another terminal window (Start Client)
   cd client
   npm run dev
   ```

## ⚙️ Configuration & Databases

Reqspace uses an intelligent database connector. You can easily switch your database by editing the DB_TYPE variable in your server/.env file:

```env
# Choose between: sqlite, postgres, mysql, mongodb
DB_TYPE=sqlite

# If using postgres/mysql/mongodb, provide the URI:
DB_URI=mongodb://localhost:27017/reqspace
```

## 🔑 Google OAuth Setup

You can enable Google Authentication without touching the code!
1. Log in to Reqspace with an Admin account.
2. Go to the **Admin Dashboard** -> **Settings**.
3. Toggle "Enable Google OAuth" and enter your Client ID and Secret.
4. Save, and the "Continue with Google" button will instantly appear on the login screen.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
Feel free to check [issues page](https://github.com/Itayp1/reqspace/issues).

## 🔒 Security & Architecture Decisions (Sept 2026)

Based on a recent security and architecture review, the following principles and fixes are actively being applied to the project:

1. **Client-Side Scripts Sandbox:** Pre-request and test scripts will be executed in a secure Sandbox (Web Worker or Sandboxed Iframe) to prevent XSS and secure local storage secrets.
2. **Strict Header Authentication:** Header-based authentication (`X-Auth-User`) is disabled by default and will only be allowed if explicitly enabled in the Admin Dashboard (assumed to be behind a trusted reverse proxy).
3. **Strict Input Validation:** We are rolling out strict `Zod` validation schemas across all API endpoints to prevent Mass Assignment and ensure data integrity.
4. **Client-Side Proxy Execution:** The proxy architecture is being redesigned so that the central Reqspace server does not execute proxy requests directly. Proxying will be handled by external proxies or directly from the Client station.
5. **SSRF Allowances:** The proxy natively allows internal network requests (SSRF) as it is a core feature of API testing tools for local network development.
6. **Cross-Database Compatibility:** The system is strictly designed to support **both SQL and MongoDB**. Any direct Mongoose usages outside of Repositories are being migrated to abstracted Repositories to ensure seamless SQL support.

## 🚀 Scalability & Performance (High-Scale Architecture)

To support enterprise-grade scale (e.g., **400k+ Workspaces, 2M+ Collections, 20M+ Requests**), the architecture incorporates the following principles:

1. **Database Indexing:** Strict enforcement of indexes on foreign keys (`workspaceId`, `collectionId`, `folderId`) and compound indexes for heavily queried fields (like `order` and `parentFolderId`). Without these, queries on a 20M row `requests` table would result in catastrophic full-table scans. 
   * **Cross-SQL Indexing Strategy:** Since Reqspace supports multiple SQL databases (PostgreSQL, MySQL, SQLite, MSSQL), the most efficient way to implement these indexes is to define them directly within the Sequelize model definitions (using the `indexes` array in `Model.init` options). Sequelize abstracts the underlying dialect, automatically generating the correct `CREATE INDEX` syntax for the chosen database type upon schema sync.
2. **Lazy Loading & Pagination:** The API and Client UI must avoid fetching entire workspace trees simultaneously. Endpoints will use cursor-based pagination, and the Client will lazy-load nested resources (Folders/Requests) only when expanded.
3. **Optimized Realtime Sync:** The WebSocket (`SocketSync`) architecture will move from "refetch everything on change" to **granular delta updates**. Clients will only receive the specific document that changed (e.g., `request:updated`) instead of querying the DB for the whole tree again.
4. **RBAC & Configuration Caching:** Frequently accessed data, such as workspace membership (roles) and system configurations, will be offloaded to an in-memory caching layer (or Redis) to reduce load on the primary relational/document database during heavy proxy traffic.
5. **High-Concurrency WebSockets (10,000+ Active Users):** To support 10k+ simultaneous live connections without CPU/Memory exhaustion on a single instance, the Socket.io implementation requires **Horizontal Scaling**. This means deploying multiple server replicas behind a Load Balancer (with Sticky Sessions) and using a **Redis Adapter**. The Redis Adapter ensures that a realtime event generated on Server Node A is seamlessly broadcasted to the relevant users connected to Server Node B.

## 🧪 Testing Strategy (target architecture)

> The direction below is a decision, not a suggestion: **UI-driven integration tests are the backbone of this suite, and the whole backbone runs against every supported database.** What exists today does neither — see [`TESTING.md`](TESTING.md#test-coverage-gaps--and-how-to-close-them) for how the current suite reported green on live defects.

### Why UI-first integration is the right default here

Drive a real browser against a real server against a real database, and assert on what the user sees. If a collection rename shows up in a second user's tree, then the route, the RBAC middleware, the repository, the DB dialect, the socket broadcast and the client store all worked. One assertion covers the entire stack, and it stays true when the internals are refactored.

This is not a theoretical preference. Of the three defects that shipped past the current suite, a UI-level integration test would have caught **two immediately**:

* the dead `:updated` / `:deleted` broadcasts — a second browser's tree visibly fails to refresh
* the SQL login defect — under `DB_TYPE=sqlite`, the UI dies on the first authenticated call after login

Both are invisible to the tests that exist, and neither needs a clever assertion — only a test that performs the ordinary action and looks at the screen.

### Rule 1 — two browser contexts, always, for anything realtime

A single-browser test **cannot** detect a dead broadcast. The client updates its own tree optimistically, so the acting user sees the change whether or not the server emitted anything; `emitToWorkspace` additionally suppresses emission entirely when the room holds one socket. A one-browser realtime test passes vacuously against completely broken code.

```ts
const alice = await browser.newContext();
const bob   = await browser.newContext();   // separate context, not a second tab
// alice renames a collection → assert bob's sidebar shows the new name
```

Every realtime scenario gets an observer that did **not** perform the action. Where the assertion is about a peer seeing a change, the peer is the subject of the assertion.

### Rule 2 — the UI cannot test authorization, so don't try

This is the one place where "if it works in the UI, the backend works" breaks down, and it breaks down badly.

The UI hides buttons a role may not use. So a UI test confirms the button is hidden — and **never sends the request**. An endpoint that accepts that request anyway is invisible to every UI test that will ever be written. That is precisely what happened: `comprehensive-permissions.spec.ts` covers the full role × action matrix through the interface, and every authorization hole in `CR#7`, `CR#11`, `CR#12` and `CR#14` sits underneath it untouched.

So the suite is **two layers, deliberately**:

| Layer | Tool | Covers | Size |
|---|---|---|---|
| Integration (backbone) | Playwright, real browser | Every user-facing flow, end to end, per DB | Large |
| API contract | Playwright `request` fixture, no browser | Authorization, SSRF, input validation, error codes | Small but non-negotiable |

The API layer's job is to send what the UI would never send: a viewer's cookie on a `DELETE`, a `workspaceId` the caller doesn't belong to, a body carrying fields the form doesn't expose. Same runner, same helpers, no browser. Rule of thumb — **if the UI can do it, test it through the UI; if the UI refuses to do it, that is exactly what the API test is for.**

### Rule 3 — the database is a test matrix axis, not a config file edit

Every supported backend must run the same tests. `getDbConfig()` reads `process.env.DB_TYPE` ahead of any config file, so a matrix leg is just a server process started with different environment variables — there is no need to rewrite `server/.env` and restart pm2, which is what `test-all-dbs.ps1` does today (it mutates a real config file, depends on a running pm2 daemon, and leaves the file rewritten if a run throws).

Each leg must get:

* its own environment — `DB_TYPE`, plus `DB_CONNECTION_STRING` / `MONGODB_URI` / `DB_STORAGE_PATH`
* a **clean database**, created and dropped by the harness. Tests that pass only against an accumulated dev database are not portable, and a leg that inherits another leg's rows proves nothing.
* its own `DB_CONFIG_FILE` path, so a stale `db-config.json` cannot leak settings across legs
* its own server process on its own port, so legs can run in parallel and a crash is attributable

Wire it as a Playwright project per backend, so one command runs the matrix and the report attributes each failure to a database:

```ts
// playwright.config.ts
projects: [
  { name: 'sqlite',   use: { baseURL: 'http://localhost:3011' } },
  { name: 'postgres', use: { baseURL: 'http://localhost:3012' } },
  { name: 'mysql',    use: { baseURL: 'http://localhost:3013' } },
  { name: 'mongodb',  use: { baseURL: 'http://localhost:3014' } },
]
```

Skip a leg when its connection string is absent rather than failing — contributors without a local MySQL should still get a useful run — but **CI must run all four**, and must fail if a leg was skipped there.

Note that `baseURL` is currently commented out in `playwright.config.ts` and specs hardcode `http://localhost:3005`. Moving to a matrix requires routing every spec through `baseURL` first; that refactor is a prerequisite, not an afterthought.

### Rule 4 — tier the matrix so it stays fast enough to run

The full suite × four backends is too slow to sit in front of every push. Split by what each layer is actually protecting:

| Tier | Scope | Runs against | When |
|---|---|---|---|
| Smoke | Register → login → **authenticated call** → workspace → collection → request → send → response | All 4 backends | Every push |
| Full integration | Everything in `tests/` | One backend (sqlite — no external service) | Every push |
| Full matrix | Everything in `tests/` | All 4 backends | Nightly, and before release |

The smoke tier is what the current `test-all-dbs.ps1` was reaching for and missed: it stops at login, which is a **public** route, so it never touches the dialect-specific code in `middleware/auth.ts` where the SQL defect lives. **The first authenticated request is the single most valuable assertion in the entire matrix** — it is where Mongoose-only code paths fail on SQL, and where `isValidObjectId` rejects a UUID. It must be in the smoke tier, and every backend must run it.

### Rule 5 — an integration test that passes before the fix is a bug

These tests exist to catch specific, known-reachable failures. Write the test, run it against unpatched code, watch it fail, then fix. A realtime test that goes green on today's `master` is asserting on the wrong thing — which is exactly how the existing socket specs came to cover only `collection:created`.

Corollary: never commit a passing placeholder. `socket-sync.spec.ts:3-29` records 18 tests that asserted `expect(true).toBe(true)` and reported real-time collaboration as verified. Use `test.fixme` for anything unwritten, so the runner reports it as outstanding.

### What still needs non-integration tests

Integration coverage does not remove the need for a small number of targeted tests where the failure is unreachable from a browser:

* **`ssrf.ts` parsing** — unit tests for NAT64, hex literals, trailing-dot hosts, IPv4-mapped forms. No UI path reaches these.
* **Multi-node broadcast** — the `size > 1` guard in `socketUtils.ts` reads only the local adapter room, so it is correct on one instance and wrong on two. Requires two server processes against one Redis, and cannot be observed on a single-node run at all.
* **SSO account creation** — needs a stub for Google's token endpoint.

## 📋 Active Tasks & Roadmap

Ordered by *what unblocks what*, not by ambition. The rule applied here: **fix what is silently broken, then make the advertised features true, then scale.** Findings referenced as `CR#n` come from [`CODE_REVIEW.md`](CODE_REVIEW.md) (2026-09-23; all items below re-verified against the source on 2026-09-24).

Every one of the 27 review findings is listed below, plus the cleanup items. Completed items are checked (`[x]`) with a **Done** note; partially-done items stay `[ ]` with a **Done** line covering what already landed and a **Do** line for what remains. Each open task carries **Where** (the exact code to open) and **Do** (the change to make).

### 🔴 Stage 0 — Broken in place (small effort, high impact)

Not new features. Things the code already claims to do and does not. Do these first — several of them silently invalidate testing of the stages below.

* [x] **Realtime sync is dead for collections / folders / requests** — `CR#9`
  * ✅ **Done:** `checkPermissionByItem` assigns `(req as any).resolvedWorkspaceId` (including on the superadmin path) so the `:updated`/`:deleted` broadcasts fire. Covered by a two-client test (`tests/socket-realtime.spec.ts`).

* [x] **The `size > 1` guard will break Redis mode before it ships**
  * ✅ **Done:** the local-node-only guard was removed from `server/src/socketUtils.ts`; `io.to(room).emit` is adapter-aware and safe under a Redis adapter.

* [x] **First-time Google sign-in fails validation** — `CR#15a`
  * ✅ **Done:** `'sso'` added to the `AuthType` union and the Mongoose `authType` enum in `server/src/models/User.ts`.

* [x] **`clearCookie('token')` may not log users out** — `CR#16`
  * ✅ **Done:** `clearAuthCookie` clears the cookie with the same `secure`/`sameSite`/`path` options used to set it; used by logout and by expired-session paths.

* [x] **Unescaped regex in workspace member invite (ReDoS)** — `CR#10`
  * ✅ **Done:** invite now looks up by exact email via `UserRepository`; the shared `escapeRegex` util (`server/src/utils/escapeRegex.ts`) is used where a regex is still needed (`users.ts` search).

* [x] **Port mismatch across the stack** — `CR#17`
  * ✅ **Done:** unified on **3005** across the server default, `server/.env.example`, `Dockerfile`, and `k8s/` (Electron already used 3005).

### 🟠 Stage 1 — Make the README true

The Features list at the top of this file promises things the server does not deliver.

* [ ] **Multi-database support — finish the remaining routes** — `CR#1` (core done)
  * ✅ **Done:** `middleware/auth.ts`, `middleware/rbac.ts` (dialect-agnostic id check in `utils/ids.ts`), `routes/workspaces.ts` and `routes/collections.ts` now go through the repositories. The authenticated core path (login → `/me` → workspace → collection → folder → request → comment → delete → logout) is verified on **both SQLite and MongoDB**.
  * **Remaining — Where:** `routes/{environments,history,admin,capture}.ts` and the `SharedLink` model in `routes/share.ts` still talk to Mongoose directly and will fail under `DB_TYPE≠mongodb`. `importExport.ts` and the collection/request reads inside `share.ts` now go through repositories. This also needs the `Environment` (single collection + `isGlobal`) vs SQL (`environments` + `global_environments` split) and `History` (`requestSnapshot`/`responseSnapshot` vs `requestData`/`responseData`) schemas reconciled, plus a SQL model for `SharedLink`.
  * **Do:** route the remaining files through the repositories and add a `SharedLink` repository. Fix `mongoose.Types.ObjectId(workspaceId)` in the proxy/history path, which throws on SQL UUIDs.

* [x] **Import / Export / Runner are server-side stubs** — `CR#13`
  * ✅ **Done:** `GET /collections/:id/export` returns a collection v2.1 document (folders + requests) and `POST /collections/import` writes it back, both through the repositories with viewer/editor checks. WSDL import uses the same repositories. `POST /runner/run` no longer pretends to start a run — it returns 410, because collection runs already execute in the in-app runner.

* [x] **`sync({ alter: true })` runs on every boot** — `CR#18`
  * ✅ **Done:** `server/src/db/connect.ts` only auto-`alter`s outside production (`sync({})` in production, non-destructive); the dead `/admin/db-config` carve-out was removed from the DB-down gate. (Full migrations via `umzug`/Sequelize-CLI are still a future improvement.)

### 🟡 Stage 2 — Security hardening (gate for SaaS launch)

Ordered by risk-to-effort. The principles are stated under *Security & Architecture Decisions* above; these are the concrete tasks.

**Authentication & access control**

* [x] **Header auth allows impersonation** — `CR#2`
  * ✅ **Done:** `X-Auth-User` is honoured only when the request source is trusted (`HEADER_AUTH_TRUSTED_IPS`, loopback by default) in `server/src/middleware/auth.ts`.

* [x] **Share-proxy is an open proxy for anonymous users** — `CR#3`
  * ✅ **Done:** the public proxy only forwards URLs that match a request in the shared collection, rejects `localProxy`, and is rate-limited. `GET /api/share/:shortId` strips auth, scripts, sensitive headers and variable values. New links use a 128-bit `shortId` (16 random bytes) and the public read is rate-limited.

* [x] **OAuth: add `state`/CSRF** — `CR#4`
  * ✅ **Done:** `redirect_uri` is allowlisted server-side (`GOOGLE_ALLOWED_REDIRECT_URIS`) and the token-endpoint response is no longer echoed on error. `GET /api/auth/google/state` sets an httpOnly `oauth_state` cookie; login/register send that value to Google and the callback must echo it or the exchange is rejected.

* [x] **Default admin credentials, shared JWT secret, insecure TLS** — `CR#6`
  * ✅ **Done:** production refuses to bootstrap `admin`/`admin`; `jwtSecret.ts` refuses a per-pod ephemeral secret in production (require `JWT_SECRET`, opt out with `ALLOW_EPHEMERAL_JWT_SECRET`); Mongo `tlsInsecure` is opt-in via `MONGO_TLS_INSECURE`. (Populating a real value in `k8s/secret.yaml` remains a deploy-time action.)

* [x] **Mass assignment and cross-workspace writes** — `CR#7`
  * ✅ **Done:** `PUT` on collections/folders/requests/workspaces and `PUT /api/auth/settings` allowlist writable fields. `POST /api/history/:id/save` checks editor membership on the target collection before touching the history row. `POST /api/import/wsdl` requires an editor in `workspaceId`.

* [x] **History endpoints have no workspace RBAC** — `CR#11`
  * ✅ **Done:** `GET`/`DELETE /workspaces/:workspaceId/history` now require `requireWorkspaceRole('viewer')`, and the workspace-scoped clear decrements `historyUsedBytes` by the bytes actually freed instead of zeroing the user's whole counter. (The `Types.ObjectId(workspaceId)` SQL issue folds into the `CR#1` follow-up for `history.ts`.)

* [x] **Any viewer can delete anyone's comment** — `CR#12`
  * ✅ **Done:** `DELETE /requests/:id/comments/:commentId` now requires the comment author or an editor/owner (or superadmin).

* [x] **Workspace import overwrites global system config** — `CR#14`
  * ✅ **Done:** `POST /api/admin/import/:workspaceId` ignores `dump.config`, so a workspace import can no longer rewrite system-wide SMTP/OAuth/proxy settings.

* [x] **Password policy is weak and inconsistent** — `CR#15b`
  * ✅ **Done:** minimum length raised to 8, current password required on a non-forced change, and bcrypt cost 12 everywhere (registration, change-password, admin bootstrap).

**Sandboxing & input validation**

* [ ] **User scripts run unsandboxed on the main thread** — `CR#5`, `CR#20`
  * ✅ **Done (visualizer):** the response visualizer iframe is `sandbox="allow-scripts"` (no `allow-same-origin`) and loads Handlebars from `client/public/vendor/handlebars.min.js` instead of jsDelivr. The HTML preview iframe no longer sets `allow-same-origin`.
  * **Where:** `client/src/utils/scripts.ts` still runs user code with `new Function` on the main thread; `client/src/sandbox/worker.ts` is referenced only from a comment in `RunnerModal.tsx` and its `pm.sendRequest` is a stub.
  * **Do:** run scripts only in the Worker; expose `pm.sendRequest` through an allowlisted message channel rather than handing over `api`. Consolidate onto one sandbox — `scripts.ts` and `worker.ts` are still two half-built paths. Credential stripping (`CR#21`) is in place, so a script can no longer read tokens that were persisted, but it can still read the in-memory session.

* [ ] **Zod is a dependency that is never imported** — `CR#19`
  * **Where:** `zod` and `ajv` in `server/package.json`; zero imports anywhere in `server/src`
  * **Do:** add request schemas route by route, starting with the mass-assignment routes above, then proxy / auth / admin bodies. While there, replace `req.user?: any` and the scattered `as any` casts with real types.

* [ ] **No baseline HTTP hardening** — `CR#8` (helmet/trust-proxy/body-limit done)
  * ✅ **Done:** `helmet`, `app.set('trust proxy')`, a `5mb` body cap (`MAX_BODY_SIZE`) and correct client-error statuses (413) are in place in `server/src/index.ts`.
  * ✅ **Done:** proxy and share-proxy cap the client timeout (`MAX_PROXY_TIMEOUT_MS`, default 120s) and the response body (`MAX_PROXY_RESPONSE_BYTES`, default 10MB, 413 when exceeded). `POST /api/proxy` is rate-limited (120/min/IP). Helmet now sends a CSP (Monaco still needs `unsafe-eval` and inline styles).
  * **Do:** move the in-memory rate limiter to a shared store so it holds across replicas — tracked with the Redis task below.

* [ ] **SSRF: gaps in coverage** — `CR#25` (parser + proxy protocol check done)
  * ✅ **Done:** `ssrf.ts` now blocks NAT64 (`64:ff9b:`), IPv4-mapped forms, integer/hex/octal literals (`0x7f000001`) and trailing-dot hosts (offline unit tests in `server/src/tests/ssrf.test.ts`); `proxy.ts` asserts `http:`/`https:` before dispatching.
  * ✅ **Done:** `capture.ts` forwards with undici and `createSafeLookup`, so the address is checked at connect time.
  * **Do:** add a test that a redirect to a private host is refused. The undici lookup pins the first resolution; a redirect to a new host should be re-checked by the same agent, and that needs a live assertion.

* [x] **Secrets persisted to `localStorage`** — `CR#21`
  * ✅ **Done:** the request-tab persist slice blanks bearer/basic/api-key/oauth/ntlm secrets and sensitive headers. The proxy password is omitted from the settings persist slice. The cookie jar is memory-only and the old `reqspace_cookies_v1` entry (including the dummy `sess_default_123`) is removed on load.

* [x] **Information disclosure and open registration** — `CR#24`
  * ✅ **Done:** `allowSelfRegistration` now defaults to **false**, and `GET /api/health` masks the raw `dbError` in production.

* [x] **Client certificates stored in plaintext** — *P3*
  * ✅ **Done:** cert, key and passphrase are sealed with AES-256-GCM (`enc:v1:`, key derived from `JWT_SECRET`) before they are stored. API responses return only hostname and id. The proxy decrypts at connect time and still accepts legacy plaintext rows.

### 🔵 Stage 3 — Scale (blocked on Stage 0)

* [ ] **Optional Redis Concurrency Mode:** Implement an optional Redis adapter for Socket.io to support horizontal scaling out-of-the-box.
  * **Configurable:** Driven by an environment variable (e.g., `REDIS_URL=redis://localhost:6379`). If absent, the server gracefully falls back to single-node (in-memory) mode.
  * **Server Startup:** The server will automatically detect the variable and attach the adapter during boot.
  * **Admin UI Indicator:** The Admin Dashboard will feature a clear visual indicator showing whether "Redis Concurrency Mode" is currently Active or Inactive.
  * ⚠️ **Prerequisite:** both realtime defects in Stage 0 (now fixed).
  * **Also needs:** sticky sessions on the Ingress (k8s currently runs `replicas: 2` + HPA **without** them), and the shared rate-limit store from `CR#8`.

* [ ] **Granular delta updates instead of full refetch** — `CR#22`
  * **Where:** `client/src/components/common/SocketSync.tsx`
  * **Why:** every structural event — and every window focus — triggers `fetchCollectionsData` for the entire workspace tree. At 400k workspaces this dominates load far more than the adapter does. The socket URL is also derived via `api.defaults.baseURL?.replace('/api', '')`, which breaks on a versioned base URL such as `http://host/api/v1`.
  * **Do:** apply the received document to the store directly; derive the socket URL from an explicit config value.

* [x] **Foreign-key indexes are documented but not enforced**
  * ✅ **Done:** `indexes` added to the Sequelize models under `server/src/db/sql-models/` for `workspaceId`, `collectionId`, `folderId` plus compound indexes on `order`/`parentFolderId` (and history `userId+workspaceId`, audit `targetId`).

* [ ] **Lazy loading and cursor pagination** — from the *Scalability* section; not started. Endpoints still return whole trees.

* [ ] **RBAC and config caching** — from the *Scalability* section; not started. Membership and system config are re-read from the DB on every proxy call.

### ⚪ Stage 4 — Quality, tests and cleanup

* [ ] **Test coverage gaps** — `CR#26` (CI + smoke + first-round specs done) · see [`TESTING.md`](TESTING.md#test-coverage-gaps--and-how-to-close-them)
  * ✅ **Done:** `.github/workflows/test.yml` (build + jest + auth-crossing smoke on sqlite) with `docker-publish` gated on it; `scripts/smoke-core.sh`; `ssrf.ts` unit tests; `secretAtRest` unit test; a two-client `socket-realtime` spec; `api-authorization` now also covers history-save, WSDL import and collection import/export; `global-setup` enables registration.
  * **Do (remaining):**
    1. Route every spec through `baseURL` (currently hardcoded `http://localhost:3005`) and add one Playwright project per backend — the DB matrix (smoke on all four, full suite nightly).
    2. Cover the remaining `emitToWorkspace` call sites with two-client tests (folders, requests, environments, reorder — collections are covered).
    3. Add API-authz tests for the remaining bypass surfaces (`POST /api/admin/import`, WSDL import) and a logout-cookie-clearing test.

* [ ] **Client dependency weight** — `CR#23`
  * ✅ **Done:** unused `date-fns` was removed (nothing imported it). Handlebars is self-hosted for the visualizer.
  * **Do:** `moment`, whole-package `lodash`, `crypto-js` and `chai` still ship in the script runtime (`scripts.ts` / `worker.ts`). Import lodash per function and lazy-load that runtime when the sandbox is consolidated (`CR#5`).

* [x] **UI consistency** — `CR#27`
  * ✅ **Done:** `/admin` uses a `SuperAdminOnly` gate inside the single `AuthGuard` (no nested guard). `App.tsx` no longer uses inline styles. A 401 still logs the user out; a 403 shows a dismissible notice and keeps the session.

* [x] **Dockerfile and k8s hygiene** — `CR#17`
  * ✅ **Done:** the Dockerfile uses `npm ci`, a multi-stage build-tool-free runtime image, and a non-root `USER`. (k8s sticky sessions for socket.io are tracked under the Redis task above.)

* [ ] **Dead code and naming** — *P3* (`server/dist` untracking done)
  * ✅ **Done:** `server/dist` is no longer committed (gitignored).
  * ✅ **Done:** `ensureDefaultAdmin` was removed (bootstrap lives in `index.ts` and refuses `admin`/`admin` in production). `multer`, `http-proxy-middleware`, `archiver` and `postman-collection` were unused and are no longer dependencies. The `??` placeholders in `share.ts` are gone. The runner stub returns 410 (`CR#13`).
  * **Do:** naming is still inconsistent — the repo folder is `postman`, the product is Reqspace, the Electron `appId` is `com.reqspaceclone.app`, and the default DB name is `postman_clone`. Rename those together so links and existing SQLite files are not orphaned.

* [ ] **Feature parity with upstream ReqSpace** — see [`reqspace_features_roadmap.md`](reqspace_features_roadmap.md) (100 items)
  * **Do:** that document is stale — a meaningful share is already built (code generation, collection runner UI, load testing, cURL import, context menus, global search, cookie manager, script editor, documentation modal, shared links). Audit it and mark what landed before using it to plan.

## 📝 License

This project is open-source and available under the [ISC License](LICENSE).
