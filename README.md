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

## 🔐 Secrets Inventory

Every credential the project needs, where it lives, and how to set it. **Names and locations only — no values are recorded here, and none should ever be added.** This repository is public; a value committed to it is disclosed the moment it is pushed, and rewriting history does not un-disclose it.

### Server environment

Set in `server/.env` locally (gitignored) and as a Kubernetes Secret in a cluster.

| Variable | Purpose | Notes |
|---|---|---|
| `JWT_SECRET` | Signs and verifies session JWTs | See the warning below — this one has a real failure mode today |
| `ADMIN_EMAIL` | Bootstrap superadmin identity | Defaults to `admin` |
| `ADMIN_PASSWORD` | Bootstrap superadmin password | Defaults to `admin`. The account is fully usable as superadmin between server start and first login |
| `DB_USER` / `DB_PASSWORD` | SQL credentials | `postgres`, `mysql`, `mssql` |
| `DB_CONNECTION_STRING` | SQL connection string | **Embeds the password** — treat the whole string as a secret |
| `MONGODB_URI` / `MONGO_URI` | Mongo connection string | Same: credentials are inline |

> ⚠️ **`JWT_SECRET` has a live defect.** `utils/jwtSecret.ts` rejects known placeholder values and falls back to generating a random secret **written to a local file** (`server/.jwt-secret.local`). On a single machine that is fine. Across replicas it is not: each pod generates its own, so a token signed by one pod is rejected by every other and sessions break at random. `k8s/secret.yaml` currently ships exactly such a placeholder — `JWT_SECRET` is the base64 of `change_me_in_production`, which is one of the values `jwtSecret.ts` refuses. Any multi-replica deployment needs one real shared value. Tracked as `CR#6`.

### Runtime configuration stored in the database

These are **not** environment variables. They live in the `SystemConfig` document (`_id: 'global'`) and are entered through the Admin Dashboard at runtime.

| Field | Purpose |
|---|---|
| `auth.googleOAuth.clientId` | Google OAuth application id |
| `auth.googleOAuth.clientSecret` | Google OAuth application secret |
| `auth.smtp.user` | SMTP account |
| `auth.smtp.pass` | SMTP password |
| `proxy.username` | Upstream proxy credentials |
| `proxy.password` | Upstream proxy credentials |

`GET /api/admin/config` masks these on read. Two paths do **not**: `GET /api/admin/export/:workspaceId` embeds the config, and `POST /api/admin/import/:workspaceId` will overwrite all of them from an uploaded file — see `CR#14`.

### Per-user secrets stored in the database

| Field | Purpose | Status |
|---|---|---|
| `User.clientCertificates[].passphrase` and key material | Client TLS certificates for mutual-auth requests | **Stored in plaintext.** Encrypt at rest or keep the material out of the DB — tracked in Stage 2 |
| `User.passwordHash` | bcrypt hash | Cost is inconsistent — 12 at registration, 10 at change-password and admin bootstrap (`CR#15`) |

Note that the client also persists credentials into browser `localStorage` — bearer tokens, basic-auth passwords and the local proxy password (`CR#21`). Those are secrets in the blast radius of any XSS, and today user scripts run unsandboxed on the same thread (`CR#5`).

### CI / CD

GitHub Actions repository secrets, used by `.github/workflows/docker-publish.yml`:

| Secret | Purpose |
|---|---|
| `DOCKERHUB_USERNAME` | Docker Hub login |
| `DOCKERHUB_TOKEN` | Docker Hub access token — use a scoped token, not an account password |

### Test-only

Optional. Read by `test-all-dbs.ps1`; when unset, that backend is skipped.

`TEST_DB_POSTGRES_URL` · `TEST_DB_MYSQL_URL` · `TEST_DB_MONGODB_URL`

### Where secret material is allowed to live

| Path | Tracked in git | Contains |
|---|---|---|
| `server/.env` | ❌ gitignored | Real values |
| `server/.jwt-secret.local` | ❌ gitignored | Auto-generated JWT secret |
| `server/.env.example` | ✅ tracked | Placeholders and documentation only |
| `k8s/secret.yaml` | ✅ tracked | ⚠️ A placeholder `JWT_SECRET`. Real cluster values must come from a sealed secret or an external secrets manager — never from this file |

Before adding any new credential: put the name and a placeholder in `server/.env.example`, add a row to this table, and confirm the file holding the real value is gitignored.

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
  * **Remaining — Where:** `routes/{environments,history,admin,capture,importExport,share}.ts` still call Mongoose models directly and will fail under `DB_TYPE≠mongodb`. This also needs the `Environment` (single collection + `isGlobal`) vs SQL (`environments` + `global_environments` split) and `History` (`requestSnapshot`/`responseSnapshot` vs `requestData`/`responseData`) schemas reconciled.
  * **Do:** route those files through the repositories (extending `EnvironmentRepository`/`HistoryRepository` to the full shape) and fix `mongoose.Types.ObjectId(workspaceId)` in the proxy/history path, which throws on SQL UUIDs.

* [ ] **Import / Export / Runner are server-side stubs** — `CR#13`
  * **Where:** `server/src/routes/importExport.ts` (`GET /collections/:id/export` returns `{ item: [] }`), `server/src/routes/runner.ts` (near-empty)
  * **Why it matters:** real import happens client-side in `ImportModal`, so some flows skip server-side permission checks entirely.
  * **Do:** implement ReqSpace v2.1 export/import server-side with RBAC, or remove the entry points from the UI. Do not keep shipping buttons that resolve to nothing.

* [x] **`sync({ alter: true })` runs on every boot** — `CR#18`
  * ✅ **Done:** `server/src/db/connect.ts` only auto-`alter`s outside production (`sync({})` in production, non-destructive); the dead `/admin/db-config` carve-out was removed from the DB-down gate. (Full migrations via `umzug`/Sequelize-CLI are still a future improvement.)

### 🟡 Stage 2 — Security hardening (gate for SaaS launch)

Ordered by risk-to-effort. The principles are stated under *Security & Architecture Decisions* above; these are the concrete tasks.

**Authentication & access control**

* [x] **Header auth allows impersonation** — `CR#2`
  * ✅ **Done:** `X-Auth-User` is honoured only when the request source is trusted (`HEADER_AUTH_TRUSTED_IPS`, loopback by default) in `server/src/middleware/auth.ts`.

* [ ] **Share-proxy is an open proxy for anonymous users** — `CR#3`
  * **Where:** `server/src/routes/shareProxy.ts`, `server/src/routes/share.ts`
  * **Why:** `POST /api/share/:shortId/proxy` requires no login, so a link holder can make the server issue arbitrary HTTP requests. `GET /api/share/:shortId` returns every request **including headers, tokens and scripts**.
  * **Do:** restrict the public proxy to URLs present in the shared collection (or remove it); strip auth / cookies / variables from the public payload; block `localProxy` on the public path; widen `shortId` beyond 48 bits and rate-limit it.

* [ ] **OAuth: add `state`/CSRF** — `CR#4` (redirect-URI allowlist + no token leak done)
  * ✅ **Done:** `redirect_uri` is allowlisted server-side (`GOOGLE_ALLOWED_REDIRECT_URIS`) and the token-endpoint response is no longer echoed on error.
  * **Where:** `POST /api/auth/google` in `server/src/routes/auth.ts` (+ the client callback page)
  * **Do:** issue a random `state` in a cookie and verify it on callback (needs a matching client change).

* [x] **Default admin credentials, shared JWT secret, insecure TLS** — `CR#6`
  * ✅ **Done:** production refuses to bootstrap `admin`/`admin`; `jwtSecret.ts` refuses a per-pod ephemeral secret in production (require `JWT_SECRET`, opt out with `ALLOW_EPHEMERAL_JWT_SECRET`); Mongo `tlsInsecure` is opt-in via `MONGO_TLS_INSECURE`. (Populating a real value in `k8s/secret.yaml` remains a deploy-time action.)

* [ ] **Mass assignment and cross-workspace writes** — `CR#7` (main routes done)
  * ✅ **Done:** `PUT` on collections/folders/requests/workspaces and `PUT /api/auth/settings` now allowlist writable fields (no `workspaceId`/`collectionId` reassignment) and no longer leak `err.message`.
  * **Do:** `POST /api/history/:id/save` still creates a request in a client-supplied `collectionId` with no membership check, and `POST /api/import/wsdl` still has no `requireWorkspaceRole` — add the guards.

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
  * **Where:** `client/src/utils/scripts.ts:131` and `:306` (`new Function(...)`); `client/src/sandbox/worker.ts` exists but is referenced **only from a comment** in `RunnerModal.tsx:16`; the visualizer iframe in `ResponseViewer.tsx` has no `sandbox` attribute and injects Handlebars output via `innerHTML` from a CDN
  * **Why:** scripts get `window`, `document`, `localStorage` and the app's authenticated axios instance — enough to read persisted bearer tokens and issue requests as the user.
  * **Do:** run scripts only in the Worker (or an iframe with `sandbox` and **without** `allow-same-origin`); expose `pm.sendRequest` through an allowlisted message channel rather than handing over `api`; add `sandbox` to the visualizer iframe and self-host Handlebars. Consolidate onto **one** sandbox implementation — the `scripts.ts` / `worker.ts` split is currently two half-built paths.

* [ ] **Zod is a dependency that is never imported** — `CR#19`
  * **Where:** `zod` and `ajv` in `server/package.json`; zero imports anywhere in `server/src`
  * **Do:** add request schemas route by route, starting with the mass-assignment routes above, then proxy / auth / admin bodies. While there, replace `req.user?: any` and the scattered `as any` casts with real types.

* [ ] **No baseline HTTP hardening** — `CR#8` (helmet/trust-proxy/body-limit done)
  * ✅ **Done:** `helmet`, `app.set('trust proxy')`, a `5mb` body cap (`MAX_BODY_SIZE`) and correct client-error statuses (413) are in place in `server/src/index.ts`.
  * **Do:** cap the proxy response size and client-supplied timeout, add a CSP, rate-limit `POST /api/proxy`, and move the in-memory rate limiter to a shared store (alongside the Redis work) so it holds across replicas.

* [ ] **SSRF: gaps in coverage** — `CR#25` (parser + proxy protocol check done)
  * ✅ **Done:** `ssrf.ts` now blocks NAT64 (`64:ff9b:`), IPv4-mapped forms, integer/hex/octal literals (`0x7f000001`) and trailing-dot hosts (offline unit tests in `server/src/tests/ssrf.test.ts`); `proxy.ts` asserts `http:`/`https:` before dispatching.
  * **Do:** make `server/src/routes/capture.ts` forward via `createSafeLookup` instead of the global `fetch` (currently only a pre-flight `assertSsrfSafe`, which is TOCTOU / DNS-rebind vulnerable); add a test that a redirect to a private host is refused.

* [ ] **Secrets persisted to `localStorage`** — `CR#21`
  * **Where:** `client/src/store/requestStore.ts` (persists all tabs including `auth.bearer.token`, basic passwords, bodies), `client/src/store/cookieStore.ts` (also ships a dummy `sess_default_123`), `client/src/store/settingsStore.ts` (local proxy password)
  * **Do:** strip credential fields from the persisted slice; keep them in memory or in the OS keychain for the Electron build. This is a prerequisite for the sandbox work to mean anything.

* [x] **Information disclosure and open registration** — `CR#24`
  * ✅ **Done:** `allowSelfRegistration` now defaults to **false**, and `GET /api/health` masks the raw `dbError` in production.

* [ ] **Client certificates stored in plaintext** — *P3*
  * **Where:** client-certificate records in the DB hold private keys as clear text
  * **Do:** encrypt at rest with a server-held key, or store a reference and keep the material out of the DB.

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
  * ✅ **Done:** `.github/workflows/test.yml` (build + jest + auth-crossing smoke on sqlite) with `docker-publish` gated on it; `scripts/smoke-core.sh` (crosses the first authenticated request); `ssrf.ts` unit tests; a two-client `socket-realtime` spec (`collection:updated`/`:deleted`); an `api-authorization` spec (viewer → 403 via the API, non-member → 403 read); `global-setup` enables registration; the obsolete socket-sync suppression assertion was replaced; the deprecated `globals.ts-jest` config was migrated to `transform`.
  * **Do (remaining):**
    1. Route every spec through `baseURL` (currently hardcoded `http://localhost:3005`) and add one Playwright project per backend — the DB matrix (smoke on all four, full suite nightly).
    2. Cover the remaining `emitToWorkspace` call sites with two-client tests (folders, requests, environments, reorder — collections are covered).
    3. Add API-authz tests for the remaining bypass surfaces (`POST /api/admin/import`, WSDL import) and a logout-cookie-clearing test.

* [ ] **Client dependency weight** — `CR#23`
  * **Do:** `moment` **and** `date-fns` are both bundled; `lodash` is imported whole; `crypto-js` and `chai` ship to the browser for script support; Handlebars is fetched from jsDelivr at runtime (a third-party supply-chain and availability dependency). Consolidate on one date library, import lodash per-function, lazy-load the script-runtime libraries, and self-host Handlebars.

* [ ] **UI consistency** — `CR#27`
  * **Do:** `/admin` is wrapped in `AuthGuard` twice; `App.tsx` uses inline `style={{}}` where Tailwind is the convention; 401 and 403 are not handled distinctly. Unify.

* [x] **Dockerfile and k8s hygiene** — `CR#17`
  * ✅ **Done:** the Dockerfile uses `npm ci`, a multi-stage build-tool-free runtime image, and a non-root `USER`. (k8s sticky sessions for socket.io are tracked under the Redis task above.)

* [ ] **Dead code and naming** — *P3* (`server/dist` untracking done)
  * ✅ **Done:** `server/dist` is no longer committed (gitignored).
  * **Do:** `runner.ts` is nearly empty (folds into `CR#13`); `ensureDefaultAdmin` in `User.ts` duplicates the bootstrap in `index.ts`; `share.ts` has `??` placeholders where emoji were intended; check whether `multer`, `http-proxy-middleware`, `archiver` and `postman-collection` are still used and drop them if not. Naming is inconsistent — the repo folder is `postman`, the product is Reqspace, the Electron `appId` is `com.reqspaceclone.app`, and the default DB name is `postman_clone`.

* [ ] **Feature parity with upstream ReqSpace** — see [`reqspace_features_roadmap.md`](reqspace_features_roadmap.md) (100 items)
  * **Do:** that document is stale — a meaningful share is already built (code generation, collection runner UI, load testing, cURL import, context menus, global search, cookie manager, script editor, documentation modal, shared links). Audit it and mark what landed before using it to plan.

## 📋 UI/UX Todo List (Upcoming Features)

Based on our recent review, we are prioritizing the following advanced UI features to improve developer experience:

- [ ] **Multi-Tab Support**: Allow opening and working on multiple requests simultaneously in different tabs.
- [ ] **Split Pane**: Enable viewing two tabs side-by-side (e.g., comparing requests or environments).
- [ ] **Scope Resolution Visualizer**: Add a visual indicator to show exactly which scope (Global, Environment, Collection, etc.) a variable's value is being resolved from.

## 📝 License

This project is open-source and available under the [ISC License](LICENSE).
