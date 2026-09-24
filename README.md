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

Every one of the 27 review findings is listed below, plus the cleanup items. Each task carries **Where** (the exact code to open) and **Do** (the change to make), so a task can be picked up without re-reading the review.

### 🔴 Stage 0 — Broken in place (small effort, high impact)

Not new features. Things the code already claims to do and does not. Do these first — several of them silently invalidate testing of the stages below.

* [ ] **Realtime sync is dead for collections / folders / requests** — `CR#9`
  * **Where:** `server/src/routes/collections.ts` (lines 64, 73, 111, 119, 177, 183), `server/src/middleware/rbac.ts:45`, `server/src/socketUtils.ts:11`
  * **Why it's dead:** the routes broadcast with `emitToWorkspace((req as any).resolvedWorkspaceId, ...)`, but **nothing in the codebase ever assigns `resolvedWorkspaceId`**. `rbac.ts` resolves the id into a local variable and discards it, and `emitToWorkspace` opens with `if (!workspaceId) return;`. All six broadcasts are silent no-ops.
  * **Do:** in `checkPermissionByItem`, assign the resolved id onto the request (`(req as any).resolvedWorkspaceId = workspaceId`) before calling `next()`. Add a test asserting a second connected client receives `request:updated`.

* [ ] **The `size > 1` guard will break Redis mode before it ships**
  * **Where:** `server/src/socketUtils.ts:13-14`
  * **Why:** `io.sockets.adapter.rooms.get(room)?.size` counts **only sockets on the local node**. With a Redis adapter and two replicas holding one user each, both nodes see `size === 1` and broadcast nothing — exactly the case Redis is meant to solve.
  * **Do:** drop the guard, or replace it with the adapter-aware `await io.in(room).fetchSockets()`. Must land **before** the Redis task in Stage 3.

* [ ] **First-time Google sign-in fails validation** — `CR#15a`
  * **Where:** `server/src/models/User.ts:64` vs `server/src/routes/auth.ts:210`
  * **Why:** the model declares `authType: { enum: ['password', 'header'] }`; the OAuth route creates users with `authType: 'sso'`. Mongoose rejects the document, so account creation via Google cannot succeed — despite Google OAuth being a headline feature.
  * **Do:** add `'sso'` to the enum and to the `AuthType` union at `User.ts:39`.

* [ ] **`clearCookie('token')` may not log users out** — `CR#16`
  * **Where:** the logout handler in `server/src/routes/auth.ts`, compared against `setCookieToken`
  * **Do:** pass the identical `secure` / `sameSite` / `path` options to `clearCookie` that were used to set it. Browsers treat a mismatch as a different cookie and leave the session alive.

* [ ] **Unescaped regex in workspace member invite (ReDoS)** — `CR#10`
  * **Where:** `server/src/routes/workspaces.ts` — `{ name: { $regex: new RegExp(`^${email}$`, 'i') } }`
  * **Do:** port the escaping helper already used in `server/src/routes/users.ts`, or match on an exact string instead of a regex.

* [ ] **Port mismatch across the stack** — `CR#17`
  * **Where:** server default `3000`, `Dockerfile` `EXPOSE 3005`, k8s `containerPort: 3000`, Electron `3005`
  * **Do:** pick one port, drive it from a single `PORT` env var, and align `Dockerfile`, `k8s/`, and `main.js`.

### 🟠 Stage 1 — Make the README true

The Features list at the top of this file promises things the server does not deliver.

* [ ] **Multi-database support is advertised but non-functional** — `CR#1` · *largest item on this list*
  * **Where:** 11 files still call Mongoose models directly — `middleware/auth.ts`, `middleware/rbac.ts`, and `routes/{admin,capture,collections,environments,history,importExport,share,users,workspaces}.ts`
  * **Why it's fatal:** `middleware/auth.ts` calls `User.findOne`, and `middleware/rbac.ts` gates on `mongoose.isValidObjectId`, which rejects SQL UUIDs outright. **Login cannot succeed on SQL at all** — and Electron ships with `DB_TYPE=sqlite`, so the desktop build is affected.
  * **Do:** route every DB access through the existing repositories; replace `isValidObjectId` with a dialect-agnostic id check. Suggested order: `middleware/auth.ts` → `middleware/rbac.ts` → routes. Land a smoke test that logs in and creates a collection under `DB_TYPE=sqlite`.

* [ ] **Import / Export / Runner are server-side stubs** — `CR#13`
  * **Where:** `server/src/routes/importExport.ts` (`GET /collections/:id/export` returns `{ item: [] }`), `server/src/routes/runner.ts` (near-empty)
  * **Why it matters:** real import happens client-side in `ImportModal`, so some flows skip server-side permission checks entirely.
  * **Do:** implement ReqSpace v2.1 export/import server-side with RBAC, or remove the entry points from the UI. Do not keep shipping buttons that resolve to nothing.

* [ ] **`sync({ alter: true })` runs on every boot** — `CR#18`
  * **Where:** `server/src/db/connect.ts:30`
  * **Why:** the live schema is mutated at startup — a standing data-loss risk on any SQL deployment.
  * **Do:** replace with real migrations (`umzug` or Sequelize CLI); allow `alter` only when `NODE_ENV !== 'production'`. Separately: `writeConfigFile` targets `db-config.json` and `index.ts` carves out an exception for an `/admin/db-config` route that **does not exist in the source** — either implement the route or remove the dead carve-out and the Admin UI switch.

### 🟡 Stage 2 — Security hardening (gate for SaaS launch)

Ordered by risk-to-effort. The principles are stated under *Security & Architecture Decisions* above; these are the concrete tasks.

**Authentication & access control**

* [ ] **Header auth allows impersonation** — `CR#2`
  * **Where:** `authenticate` in `server/src/middleware/auth.ts`, `header` / `both` modes
  * **Why:** an inbound `X-Auth-User` auto-creates a user and sets a cookie, with no proof the header came from a trusted proxy. If the app is internet-facing and the proxy doesn't strip it, anyone can impersonate any email.
  * **Do:** accept the header only when `req.ip` is in a configured `TRUSTED_PROXY` range; keep the mode off by default.

* [ ] **Share-proxy is an open proxy for anonymous users** — `CR#3`
  * **Where:** `server/src/routes/shareProxy.ts`, `server/src/routes/share.ts`
  * **Why:** `POST /api/share/:shortId/proxy` requires no login, so a link holder can make the server issue arbitrary HTTP requests. `GET /api/share/:shortId` returns every request **including headers, tokens and scripts**.
  * **Do:** restrict the public proxy to URLs present in the shared collection (or remove it); strip auth / cookies / variables from the public payload; block `localProxy` on the public path; widen `shortId` beyond 48 bits and rate-limit it.

* [ ] **OAuth: client-supplied `redirectUri`, no `state`** — `CR#4`
  * **Where:** `POST /api/auth/google` in `server/src/routes/auth.ts`
  * **Do:** hard-allowlist redirect URIs server-side; stop returning `details: tokenData` on error; issue a random `state` in a cookie and verify it on callback.

* [ ] **Default admin credentials, shared JWT secret, insecure TLS** — `CR#6`
  * **Where:** bootstrap in `server/src/index.ts` + `server/src/models/User.ts`, `k8s/secret.yaml`, `server/src/utils/jwtSecret.ts`, `server/src/db/connect.ts`
  * **Do:** refuse to bootstrap `admin`/`admin` when `NODE_ENV=production`; put a real `JWT_SECRET` in the k8s Secret (the current value is base64 of `change_me_in_production`, which `jwtSecret.ts` rejects — it then writes a **per-pod** secret to disk, so two replicas sign differently and sessions break); drop `tlsInsecure: true` from the Mongo connection.

* [ ] **Mass assignment and cross-workspace writes** — `CR#7`
  * **Where:** `PUT /collections/:id`, `PUT /folders/:id`, `PUT /requests/:id` (whole `req.body` → `findByIdAndUpdate`, so `workspaceId` / `collectionId` can be reassigned); `POST /api/history/:id/save` (no membership check); `POST /api/import/wsdl` (no `requireWorkspaceRole`); `PUT /api/auth/settings` (merges `req.body`, returns `err.message`)
  * **Do:** allowlist writable fields per route (see the Zod task below) and add the missing `requireWorkspaceRole` guards.

* [ ] **History endpoints have no workspace RBAC** — `CR#11`
  * **Where:** `server/src/routes/history.ts:14` and `:65` — `GET`/`DELETE /workspaces/:workspaceId/history` carry **no `requireWorkspaceRole`** and filter on `userId` only
  * **Do:** add the membership guard. Also fix that deleting one workspace's history resets `historyUsedBytes` for the whole user, and that `mongoose.Types.ObjectId(workspaceId)` in the proxy path throws on SQL UUIDs.

* [ ] **Any viewer can delete anyone's comment** — `CR#12`
  * **Where:** `DELETE /requests/:id/comments/:commentId`
  * **Do:** require the comment author, or an editor/owner role.

* [ ] **Workspace import overwrites global system config** — `CR#14`
  * **Where:** `POST /api/admin/import/:workspaceId` calls `updateConfig` when `dump.config` is present
  * **Why:** importing a workspace can rewrite system-wide SMTP / OAuth secrets / proxy settings. `GET /api/admin/export/:workspaceId` also embeds the full config — verify whether it is masked there as it is in `GET config`.
  * **Do:** ignore `dump.config` on import; exclude config from the workspace export, or mask it.

* [ ] **Password policy is weak and inconsistent** — `CR#15b`
  * **Where:** change-password handler and registration in `server/src/routes/auth.ts`
  * **Do:** raise the 5-character minimum, require the current password on change, and use one bcrypt cost everywhere (registration uses 12; change-password and admin bootstrap use 10).

**Sandboxing & input validation**

* [ ] **User scripts run unsandboxed on the main thread** — `CR#5`, `CR#20`
  * **Where:** `client/src/utils/scripts.ts:131` and `:306` (`new Function(...)`); `client/src/sandbox/worker.ts` exists but is referenced **only from a comment** in `RunnerModal.tsx:16`; the visualizer iframe in `ResponseViewer.tsx` has no `sandbox` attribute and injects Handlebars output via `innerHTML` from a CDN
  * **Why:** scripts get `window`, `document`, `localStorage` and the app's authenticated axios instance — enough to read persisted bearer tokens and issue requests as the user.
  * **Do:** run scripts only in the Worker (or an iframe with `sandbox` and **without** `allow-same-origin`); expose `pm.sendRequest` through an allowlisted message channel rather than handing over `api`; add `sandbox` to the visualizer iframe and self-host Handlebars. Consolidate onto **one** sandbox implementation — the `scripts.ts` / `worker.ts` split is currently two half-built paths.

* [ ] **Zod is a dependency that is never imported** — `CR#19`
  * **Where:** `zod` and `ajv` in `server/package.json`; zero imports anywhere in `server/src`
  * **Do:** add request schemas route by route, starting with the mass-assignment routes above, then proxy / auth / admin bodies. While there, replace `req.user?: any` and the scattered `as any` casts with real types.

* [ ] **No baseline HTTP hardening** — `CR#8`
  * **Where:** `server/src/index.ts:106` — `express.json({ limit: '50mb' })`; no `helmet`, no `app.set('trust proxy')`, no CSP
  * **Why:** 50 MB bodies make the process trivial to OOM; client-supplied proxy timeouts have no ceiling; response bodies are buffered whole via `arrayBuffer`; the Load Test UI fires unlimited `POST /api/proxy` with no rate limit on that route. Behind an Ingress the missing `trust proxy` also breaks `req.ip`, rate limiting and `secure` cookies.
  * **Do:** add `helmet` + CSP, set `trust proxy`, lower the body limit, cap proxy timeout and response size, and rate-limit `/api/proxy`. Note the existing rate limiter is in-memory and will not hold across replicas — move it to a shared store alongside the Redis work.

* [ ] **SSRF: gaps in coverage** — `CR#25`
  * **Where:** `server/src/utils/ssrf.ts` (good baseline, including a DNS-pinned lookup), `server/src/routes/proxy.ts`, `server/src/routes/capture.ts`
  * **Do:** extend address parsing to NAT64 (`64:ff9b:`), alternate IPv4-mapped forms, integer/hex literals (`0x7f000001`) and trailing-dot hosts; assert `http:`/`https:` before fetching in `proxy.ts`; make capture forwarding use `createSafeLookup` instead of global `fetch` (it currently calls `assertSsrfSafe` beforehand only, which is TOCTOU / DNS-rebind vulnerable); add a test that a redirect to a private host is refused.

* [ ] **Secrets persisted to `localStorage`** — `CR#21`
  * **Where:** `client/src/store/requestStore.ts` (persists all tabs including `auth.bearer.token`, basic passwords, bodies), `client/src/store/cookieStore.ts` (also ships a dummy `sess_default_123`), `client/src/store/settingsStore.ts` (local proxy password)
  * **Do:** strip credential fields from the persisted slice; keep them in memory or in the OS keychain for the Electron build. This is a prerequisite for the sandbox work to mean anything.

* [ ] **Information disclosure and open registration** — `CR#24`
  * **Where:** `GET /api/health` (returns raw `dbError`, sometimes a connection string) and `GET /api/auth/config`
  * **Do:** return a generic message in production; note `allowSelfRegistration` defaults to **true**, which means a fresh deployment is open to public signup — make the default `false`.

* [ ] **Client certificates stored in plaintext** — *P3*
  * **Where:** client-certificate records in the DB hold private keys as clear text
  * **Do:** encrypt at rest with a server-held key, or store a reference and keep the material out of the DB.

### 🔵 Stage 3 — Scale (blocked on Stage 0)

* [ ] **Optional Redis Concurrency Mode:** Implement an optional Redis adapter for Socket.io to support horizontal scaling out-of-the-box.
  * **Configurable:** Driven by an environment variable (e.g., `REDIS_URL=redis://localhost:6379`). If absent, the server gracefully falls back to single-node (in-memory) mode.
  * **Server Startup:** The server will automatically detect the variable and attach the adapter during boot.
  * **Admin UI Indicator:** The Admin Dashboard will feature a clear visual indicator showing whether "Redis Concurrency Mode" is currently Active or Inactive.
  * ⚠️ **Prerequisite:** both realtime defects in Stage 0. Horizontally scaling a broadcast path that currently emits nothing yields a feature that cannot be validated.
  * **Also needs:** sticky sessions on the Ingress (k8s currently runs `replicas: 2` + HPA **without** them), and the shared rate-limit store from `CR#8`.

* [ ] **Granular delta updates instead of full refetch** — `CR#22`
  * **Where:** `client/src/components/common/SocketSync.tsx`
  * **Why:** every structural event — and every window focus — triggers `fetchCollectionsData` for the entire workspace tree. At 400k workspaces this dominates load far more than the adapter does. The socket URL is also derived via `api.defaults.baseURL?.replace('/api', '')`, which breaks on a versioned base URL such as `http://host/api/v1`.
  * **Do:** apply the received document to the store directly; derive the socket URL from an explicit config value.

* [ ] **Foreign-key indexes are documented but not enforced**
  * **Where:** the Sequelize model definitions under `server/src/db/sql-models/`
  * **Do:** add the `indexes` array described in the *Scalability* section above for `workspaceId`, `collectionId`, `folderId`, plus compound indexes on `order` and `parentFolderId`. Cheap, and it decides whether a 20M-row `requests` table is usable at all.

* [ ] **Lazy loading and cursor pagination** — from the *Scalability* section; not started. Endpoints still return whole trees.

* [ ] **RBAC and config caching** — from the *Scalability* section; not started. Membership and system config are re-read from the DB on every proxy call.

### ⚪ Stage 4 — Quality, tests and cleanup

* [ ] **Test coverage gaps** — `CR#26` · **see [`TESTING.md`](TESTING.md#test-coverage-gaps--and-how-to-close-them) for the full analysis and per-test instructions**
  * **Why this is not a routine backlog item:** the ~300-scenario suite reported green on all three Stage 0/1 defects above. It was not bad luck — the suite's structure created the blind spot. Both socket specs (`socket-sync.spec.ts:62`, `socket-security.spec.ts:119`) assert on `collection:created`, the one event family whose workspace id arrives in the URL path and therefore cannot hit the `resolvedWorkspaceId` bug; nothing in `tests/` or `client/e2e/` references `:updated` or `:deleted` at all. Meanwhile `test-all-dbs.ps1:65` runs only `auth.e2e.test.ts` per backend — register, login, wrong-password — three **unauthenticated** routes that use `UserRepository` and so pass on SQL, while the SQL defect sits in `middleware/auth.ts:109` on the authenticated path the loop never calls.
  * **Target architecture:** see [*Testing Strategy*](#-testing-strategy-target-architecture) above — UI-driven integration as the backbone, a thin API layer for what the UI structurally cannot reach, and the database as a matrix axis.
  * **Do:**
    1. Add a CI workflow — the only workflow today is `docker-publish.yml`, so images ship without a test having run. Gate publishing on it.
    2. Route every spec through `baseURL` instead of the hardcoded `http://localhost:3005`, then add one Playwright project per backend. This is the prerequisite for the DB matrix.
    3. Build the smoke tier and run it on all four backends — critically including **the first authenticated request**, which is where the SQL defect lives and where the current loop stops short.
    4. Cover every `emitToWorkspace` call site with a **two-browser-context** test (10 events; 1 covered). Write each one against unpatched code and confirm it fails first.
    5. Add API-level authorization tests that call endpoints directly with a lower-privileged cookie — `CR#7`, `CR#11`, `CR#12`, `CR#14` are all reachable only by bypassing the UI, which is the only layer the permission specs check.
    6. Add unit tests for `ssrf.ts` (NAT64, hex literals, trailing-dot hosts, IPv4-mapped forms) and for logout cookie clearing.
    7. Replace the placeholder pattern documented at `socket-sync.spec.ts:3-29` — 18 tests that asserted `expect(true).toBe(true)` — with `test.fixme`, so unwritten scenarios report as outstanding instead of passing.
    8. Migrate the deprecated `globals.ts-jest` config to the `transform` form.

* [ ] **Client dependency weight** — `CR#23`
  * **Do:** `moment` **and** `date-fns` are both bundled; `lodash` is imported whole; `crypto-js` and `chai` ship to the browser for script support; Handlebars is fetched from jsDelivr at runtime (a third-party supply-chain and availability dependency). Consolidate on one date library, import lodash per-function, lazy-load the script-runtime libraries, and self-host Handlebars.

* [ ] **UI consistency** — `CR#27`
  * **Do:** `/admin` is wrapped in `AuthGuard` twice; `App.tsx` uses inline `style={{}}` where Tailwind is the convention; 401 and 403 are not handled distinctly. Unify.

* [ ] **Dockerfile and k8s hygiene** — `CR#17`
  * **Do:** `npm install` runs without the lockfile (use `npm ci`); the final image still carries `python`/`g++`; there is no non-root `USER`. Fix all three.

* [ ] **Dead code and naming** — *P3*
  * **Do:** `runner.ts` is nearly empty (folds into `CR#13`); `ensureDefaultAdmin` in `User.ts` duplicates the bootstrap in `index.ts`; `share.ts` has `??` placeholders where emoji were intended; check whether `multer`, `http-proxy-middleware`, `archiver` and `postman-collection` are still used and drop them if not; confirm `server/dist` is not committed. Naming is inconsistent across the project — the repo folder is `postman`, the product is Reqspace, the Electron `appId` is `com.reqspaceclone.app`, and the default DB name is `postman_clone`.
  * ✅ **Done:** the broken code fences throughout this README (a PowerShell `` `b `` escape had replaced each ` ``` ` with a backtick + `0x08`) are fixed.

* [ ] **Feature parity with upstream ReqSpace** — see [`reqspace_features_roadmap.md`](reqspace_features_roadmap.md) (100 items)
  * **Do:** that document is stale — a meaningful share is already built (code generation, collection runner UI, load testing, cURL import, context menus, global search, cookie manager, script editor, documentation modal, shared links). Audit it and mark what landed before using it to plan.

## 📝 License

This project is open-source and available under the [ISC License](LICENSE).
