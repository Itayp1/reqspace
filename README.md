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
- **📦 Multi-Database Connector:** The server can boot on **MongoDB (default), SQLite, PostgreSQL, MySQL, or MSSQL**. Environments, history, sharing, capture, admin, and import/export go through repositories, so those routes no longer call Mongoose directly.
- **🐳 Docker Ready:** Multi-stage image. It does not bundle a database; pass `DB_TYPE=sqlite` for a single-container run, or point it at MongoDB.

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, TailwindCSS, Zustand (State Management), Vite/Rolldown
- **Backend:** Node.js, Express, TypeScript, Sequelize (SQL), Mongoose (NoSQL)
- **Containerization:** Docker, GitHub Actions

## 🐳 Quick Start (Docker)

Images are published to `itayp/reqspace` on pushes to `master` and `main`. The `latest` tag moves only when `main` is pushed; a `master` build is tagged with the short commit SHA.

The image does not include MongoDB. With no `DB_TYPE` it tries `mongodb://localhost:27017/reqspace-web` inside the container and will not come up. SQLite needs no extra service:

```bash
docker run -p 3005:3005 -e DB_TYPE=sqlite -d itayp/reqspace:latest
```

Access the application at http://localhost:3005. SQLite data lives in the container unless you mount a volume (the file defaults to `data.sqlite` in the server working directory, or the OS user-data dir when `NODE_ENV=production`, which the image sets).

## 💻 Local Development

If you want to contribute or run the project locally:

### Prerequisites
- Node.js (v20+ or v22+ recommended)
- MongoDB, unless you set `DB_TYPE` to `sqlite` or another supported engine

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
   From the repo root (step 2 leaves you in `client/`):
   ```bash
   cd ../server
   cp .env.example .env
   ```
   `.env.example` sets `MONGO_URI` and does not set `DB_TYPE`, so the server uses **MongoDB**. For a file database with nothing else running, add `DB_TYPE=sqlite` to `server/.env`.

4. **Run the Application (Development Mode):**
   ```bash
   # Terminal 1 — API on http://localhost:3005
   cd server
   npm run dev

   # Terminal 2 — Vite UI (default http://localhost:5173), proxying /api and /ws to port 3005
   cd client
   npm run dev
   ```
   Open the Vite URL. Port 3005 serves the built client only after `npm run build` in `client/` (that is what Docker and production do).

## ⚙️ Configuration & Databases

`getDbConfig()` reads `DB_TYPE` first, then `db-config.json`, and otherwise uses **mongodb**. There is no `DB_URI` variable.

```env
# mongodb | sqlite | postgres | mysql | mssql
DB_TYPE=mongodb

# MongoDB (either name works). Default if both are unset:
# mongodb://localhost:27017/reqspace-web
MONGO_URI=mongodb://localhost:27017/reqspace-web
# MONGODB_URI=

# SQLite file. Dev default is ./data.sqlite (cwd of the server process).
# DB_TYPE=sqlite
# DB_STORAGE_PATH=./data.sqlite

# Postgres / MySQL / MSSQL — connection string, or discrete fields.
# DB_CONNECTION_STRING=postgres://user:pass@localhost:5432/reqspace
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=reqspace
# DB_USER=root
# DB_PASSWORD=
```

Default ports when `DB_PORT` is omitted: MySQL `3306`, PostgreSQL `5432`, MSSQL `1433`. The SQL database name falls back to `reqspace`.

## 🔑 Google OAuth Setup

You can enable Google Authentication without touching the code!
1. Log in to Reqspace with an Admin account.
2. Go to the **Admin Dashboard** -> **Settings**.
3. Toggle "Enable Google OAuth" and enter your Client ID and Secret.
4. Save, and the "Continue with Google" button will instantly appear on the login screen.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
Feel free to check [issues page](https://github.com/Itayp1/reqspace/issues).

## 🔒 Security & Architecture (as of the code, Sept 2026)

What the server actually does today, versus what is still only a plan. Open items are tracked in [Active Tasks](#-active-tasks--roadmap).

1. **User scripts run in a sandboxed iframe.** Pre-request and test scripts execute in `/sandbox.html` with `sandbox="allow-scripts"` and without `allow-same-origin` (`client/src/utils/scripts.ts`, `client/src/sandbox/runtime.ts`). The iframe cannot read the app origin's document, cookies, or `localStorage`. `pm.sendRequest` is posted to the parent, which forwards only method, url, headers, and body to the proxy.
2. **Header authentication is off until an admin opts in, and then only from trusted IPs.** `auth.mode` defaults to `login`. Turning on **SSO Header (Reverse Proxy)** in Admin Settings is required, and `X-Auth-User` (or the configured header name) is accepted only when the request IP is in `HEADER_AUTH_TRUSTED_IPS` (loopback by default).
3. **Request bodies are not validated with Zod.** `zod` is installed and unused. Field allowlists exist on the main collection/folder/request/workspace updates; they are not a schema layer.
4. **The API server still sends proxied HTTP requests.** A redesign that would stop the central server from issuing those calls has not landed. `POST /api/proxy` runs on the server.
5. **The proxy blocks internal and private targets.** `server/src/utils/ssrf.ts` rejects loopback, RFC1918, link-local, NAT64, IPv4-mapped forms, and non-dotted IP literals. It does not leave SSRF open for local-network testing. An admin message in that module says a system setting can allow it; that allow-switch is not a reason to treat private URLs as permitted by default.
6. **SQL and MongoDB share a repository layer on the request path.** Environments, history, share, capture, admin, import/export, and the proxy history write go through repositories. `mongoose.Types.ObjectId(workspaceId)` is no longer used to address a workspace.

## 🚀 Scalability & Performance (High-Scale Architecture)

The numbers below (400k+ workspaces, 2M+ collections, 20M+ requests, 10k+ sockets) are a target, not a measured capacity. Indexing, realtime deltas, optional Redis concurrency, RBAC/config caching, and cursor pagination are implemented.

1. **Database Indexing (in place):** Sequelize models under `server/src/db/sql-models/` declare indexes on `workspaceId`, `collectionId`, and `folderId`, plus compound indexes on `order` / `parentFolderId`. Sequelize emits the dialect-specific `CREATE INDEX` on sync for PostgreSQL, MySQL, SQLite, and MSSQL.
2. **Lazy loading and cursor pagination:** `GET /workspaces/:id/collections`, `GET /collections/:id/folders`, and `GET /collections/:id/requests` accept `limit` (max 100) and `cursor`. The response is `{ items, nextCursor }`. Without `limit` they still return the full array. The sidebar loads 50 collections and asks for the next page. Folders and requests for a collection load when that collection is opened, 50 at a time.
3. **Realtime sync applies the event payload.** `SocketSync` writes the received collection, folder, request, environment, or reorder list into the store. It loads the full tree only when the socket connects. The socket origin is `VITE_SOCKET_URL`, or the page origin when that variable is unset.
4. **RBAC and config caching:** `getUserWorkspaceRole` and `SystemConfigRepository.getConfig` keep a 30-second in-process cache. Saving a workspace drops that workspace's role entries. Saving system config drops the config entry. When Redis is active, the drop is published so other replicas clear the same keys.
5. **Horizontal WebSockets:** When `REDIS_URL` is set and Redis answers, Socket.io uses the Redis adapter and rate limits share that store. Otherwise the process stays single-node. The Ingress pins a client with the `reqspace-route` cookie, and the Service uses `sessionAffinity: ClientIP`.

## 🧪 Testing Strategy (target architecture)

> Target, not the current suite: **UI-driven integration tests as the backbone, run against every supported database.** That matrix is not built. CI (`.github/workflows/test.yml`) builds client and server, runs Jest, and runs `scripts/smoke-core.sh` against SQLite only. [`TESTING.md`](TESTING.md) still describes the pre-fix defects (dead broadcasts, SQL login, no CI) and is out of date relative to this file.

### Why UI-first integration is the right default here

Drive a real browser against a real server against a real database, and assert on what the user sees. If a collection rename shows up in a second user's tree, then the route, the RBAC middleware, the repository, the DB dialect, the socket broadcast and the client store all worked. One assertion covers the entire stack, and it stays true when the internals are refactored.

Two defects that used to ship green are fixed, and a UI test would have seen both:

* `:updated` / `:deleted` broadcasts — fixed; `tests/socket-realtime.spec.ts` covers collection update and delete with two clients. Folder, request, environment, and reorder emits are still untested.
* SQL login — the core authenticated path is verified on SQLite and MongoDB. The old failure was the first call after login, which a public register/login test never hits.

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

`scripts/smoke-core.sh` already crosses the first authenticated request, but only on SQLite in CI. `test-all-dbs.ps1` still stops at `auth.e2e.test.ts` (register and login), rewrites `server/.env`, and depends on pm2. **The first authenticated request is the assertion the matrix has to keep** — Mongoose-only routes and `mongoose.Types.ObjectId` still reject SQL UUIDs. Every backend must run it.

### Rule 5 — an integration test that passes before the fix is a bug

These tests exist to catch specific, known-reachable failures. Write the test, run it against unpatched code, watch it fail, then fix. The old socket specs stayed green while `:updated` and `:deleted` were dead because they only listened for `collection:created`. That bug is fixed; a new realtime test that passes before the change it claims to lock in is still asserting on the wrong thing.

Corollary: never commit a passing placeholder. `tests/socket-sync.spec.ts` used to contain 18 tests that asserted `expect(true).toBe(true)`. Those assertions are gone; the file keeps one real peer-broadcast test and a comment listing the scenarios that are still unwritten. Use `test.fixme` for anything unwritten, so the runner reports it as outstanding.

### What still needs non-integration tests

Integration coverage does not remove the need for a small number of targeted tests where the failure is unreachable from a browser:

* **`ssrf.ts` parsing** — unit tests for NAT64, hex literals, trailing-dot hosts, IPv4-mapped forms. No UI path reaches these.
* **Multi-node broadcast** — the old `size > 1` guard was removed from `socketUtils.ts`. A Redis adapter is still not wired up. Proving a broadcast crosses processes needs two server processes against one Redis, which a single-node run cannot show.
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

* [x] **Multi-database support — finish the remaining routes** — `CR#1`
  * ✅ **Done:** `environments`, `history`, `admin`, `capture`, `importExport`, `share`, and `shareProxy` go through repositories. SQL environments carry `isGlobal` and `order`; the variables-only global row is still merged into the list. History snapshots are stored in Mongo as `requestSnapshot`/`responseSnapshot` and in SQL inside `requestData`/`responseData` plus the method/url/status columns. Proxy history writes pass string ids. `server/src/tests/db.repositories.test.ts` passes on SQLite (53 tests).

* [x] **Import / Export / Runner are server-side stubs** — `CR#13`
  * ✅ **Done:** `GET /api/collections/:id/export` builds a ReqSpace v2.1 document from the repositories and requires a workspace viewer. `POST /api/collections/import` writes that document back and requires an editor. The export button and collection import modal call those routes. The empty `POST /api/runner/run` stub and the unused mock `RunnerModal` are gone; runs go through `CollectionRunnerModal`, which sends each request.

* [x] **`sync({ alter: true })` runs on every boot** — `CR#18`
  * ✅ **Done:** `server/src/db/connect.ts` only auto-`alter`s outside production (`sync({})` in production, non-destructive); the dead `/admin/db-config` carve-out was removed from the DB-down gate. (Full migrations via `umzug`/Sequelize-CLI are still a future improvement.)

### 🟡 Stage 2 — Security hardening (gate for SaaS launch)

Ordered by risk-to-effort. The principles are stated under *Security & Architecture Decisions* above; these are the concrete tasks.

**Authentication & access control**

* [x] **Header auth allows impersonation** — `CR#2`
  * ✅ **Done:** `X-Auth-User` is honoured only when the request source is trusted (`HEADER_AUTH_TRUSTED_IPS`, loopback by default) in `server/src/middleware/auth.ts`.

* [x] **Share-proxy is an open proxy for anonymous users** — `CR#3`
  * ✅ **Done:** `POST /api/share/:shortId/proxy` only forwards a URL whose origin and path match a request in the shared collection, rejects `localProxy`, and is rate-limited (30/min per IP). `GET /api/share/:shortId` drops variables, scripts, auth, and credential headers. New links use a 128-bit `shortId`.

* [x] **OAuth: add `state`/CSRF** — `CR#4`
  * ✅ **Done:** `redirect_uri` is allowlisted (`GOOGLE_ALLOWED_REDIRECT_URIS`) and token errors are not echoed. `GET /api/auth/google/state` sets an httpOnly `oauth_state` cookie; login and register send that value to Google, and `POST /api/auth/google` rejects a callback whose `state` does not match the cookie.

* [x] **Default admin credentials, shared JWT secret, insecure TLS** — `CR#6`
  * ✅ **Done:** production refuses to bootstrap `admin`/`admin`; `jwtSecret.ts` refuses a per-pod ephemeral secret in production (require `JWT_SECRET`, opt out with `ALLOW_EPHEMERAL_JWT_SECRET`); Mongo `tlsInsecure` is opt-in via `MONGO_TLS_INSECURE`. (Populating a real value in `k8s/secret.yaml` remains a deploy-time action.)

* [x] **Mass assignment and cross-workspace writes** — `CR#7`
  * ✅ **Done:** `PUT` on collections/folders/requests/workspaces and `PUT /api/auth/settings` allowlist writable fields. `POST /api/history/:id/save` loads the collection and requires an editor role in its workspace. `POST /api/import/wsdl` uses `requireWorkspaceRole('editor')`, which reads `workspaceId` from the body. Environment updates only accept `name`, `variables`, `order`, and `isGlobal`.

* [x] **History endpoints have no workspace RBAC** — `CR#11`
  * ✅ **Done:** `GET`/`DELETE /workspaces/:workspaceId/history` now require `requireWorkspaceRole('viewer')`, and the workspace-scoped clear decrements `historyUsedBytes` by the bytes actually freed instead of zeroing the user's whole counter. (The `Types.ObjectId(workspaceId)` SQL issue folds into the `CR#1` follow-up for `history.ts`.)

* [x] **Any viewer can delete anyone's comment** — `CR#12`
  * ✅ **Done:** `DELETE /requests/:id/comments/:commentId` now requires the comment author or an editor/owner (or superadmin).

* [x] **Workspace import overwrites global system config** — `CR#14`
  * ✅ **Done:** `POST /api/admin/import/:workspaceId` ignores `dump.config`, so a workspace import can no longer rewrite system-wide SMTP/OAuth/proxy settings.

* [x] **Password policy is weak and inconsistent** — `CR#15b`
  * ✅ **Done:** minimum length raised to 8, current password required on a non-forced change, and bcrypt cost 12 everywhere (registration, change-password, admin bootstrap).

**Sandboxing & input validation**

* [x] **User scripts run unsandboxed on the main thread** — `CR#5`, `CR#20`
  * ✅ **Done:** pre-request and test scripts run in `/sandbox.html` inside an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`, so the script cannot read the app origin's `document`, `localStorage`, or cookies. `pm.sendRequest` is a postMessage to the parent, which forwards only `method`, `url`, `headers`, and `body` to `POST /api/proxy` and only for `http:`/`https:` URLs. Variable writes come back as mutation messages. The half-built `worker.ts` path is removed. A script that does not finish within 10s is discarded with the iframe. The visualizer iframe was already sandboxed the same way and loads Handlebars from this app (`CR#23`).

* [ ] **Zod is a dependency that is never imported** — `CR#19`
  * **Where:** `zod` and `ajv` in `server/package.json`; zero imports anywhere in `server/src`
  * **Do:** add request schemas route by route, starting with the mass-assignment routes above, then proxy / auth / admin bodies. While there, replace `req.user?: any` and the scattered `as any` casts with real types.

* [x] **No baseline HTTP hardening** — `CR#8` (helmet/trust-proxy/body-limit/proxy caps done)
  * ✅ **Done:** `helmet` sends a CSP (`script-src 'self'`; styles allow inline because the UI still uses some). `POST /api/proxy` is limited to 60 requests/minute/IP, client timeouts are capped at 120s, and proxy responses stop at `MAX_PROXY_RESPONSE_BYTES` (default 5 MB) with status 413. When `REDIS_URL` is set and Redis answers, every limiter uses that shared counter (`rl:<name>:<ip>`). With no Redis, the window stays in memory on this process.

* [x] **SSRF: gaps in coverage** — `CR#25`
  * ✅ **Done:** `ssrf.ts` blocks NAT64, IPv4-mapped forms, integer/hex/octal literals, and trailing-dot hosts. `proxy.ts` asserts `http:`/`https:` before dispatching. `capture.ts` forwards with undici and `createSafeLookup` (no global `fetch`, redirects are manual). `assertRedirectTargetSafe` refuses a `Location` that points at a private host; covered in `server/src/tests/ssrf.test.ts`.

* [x] **Secrets persisted to `localStorage`** — `CR#21`
  * ✅ **Done:** `request-storage` drops bearer/basic/api-key/oauth/ntlm secrets and credential headers before write. Cookie values are kept in memory only, and the dummy `sess_default_123` cookie is gone. The proxy username and password are omitted from `reqspace-global-settings`. They remain in memory until reload. An OS keychain for the Electron build is still future work; nothing secret is written by these stores.

* [x] **Information disclosure and open registration** — `CR#24`
  * ✅ **Done:** `allowSelfRegistration` now defaults to **false**, and `GET /api/health` masks the raw `dbError` in production.

* [x] **Client certificates stored in plaintext** — *P3*
  * ✅ **Done:** `UserRepository` seals `cert`, `key`, and `passphrase` with AES-256-GCM (`server/src/utils/secretBox.ts`) before write and opens them only in process. The key is `CERT_ENCRYPTION_KEY` (64 hex chars) or a SHA-256 of `JWT_SECRET`. `GET /api/auth/me` and the certificate routes return hostname and id only. Covered by `server/src/tests/secretBox.test.ts`. Legacy plaintext rows still decrypt.

### 🔵 Stage 3 — Scale (blocked on Stage 0)

* [x] **Optional Redis Concurrency Mode:** Implement an optional Redis adapter for Socket.io to support horizontal scaling out-of-the-box.
  * ✅ **Done:** `REDIS_URL` attaches `@socket.io/redis-adapter` during boot. If the variable is absent, or Redis does not answer, the server stays on the in-memory adapter and logs that. `GET /api/health` and `GET /api/admin/runtime` report `redisConcurrency` as `active` or `inactive`. The Admin Dashboard shows that state under the title. The Ingress sets nginx cookie affinity (`reqspace-route`) and the Service sets `sessionAffinity: ClientIP`. Rate limits use the same Redis when it is active (`CR#8`).

* [x] **Granular delta updates instead of full refetch** — `CR#22`
  * ✅ **Done:** `SocketSync` upserts or removes the document carried by `collection:*`, `folder:*`, `request:*`, and `environment:*`. Reorder events carry `{ type, items }` or `{ items }` and only those `order` fields change. Window focus no longer refetches the tree. A full load still runs once on socket connect, to cover time spent offline. The socket origin is `VITE_SOCKET_URL` when set, otherwise `window.location.origin` — it is not derived by stripping `/api` from the axios base URL.

* [x] **Foreign-key indexes are documented but not enforced**
  * ✅ **Done:** `indexes` added to the Sequelize models under `server/src/db/sql-models/` for `workspaceId`, `collectionId`, `folderId` plus compound indexes on `order`/`parentFolderId` (and history `userId+workspaceId`, audit `targetId`).

* [x] **Lazy loading and cursor pagination** — from the *Scalability* section
  * ✅ **Done:** collection, folder, and request list routes take `limit` and `cursor` and return `{ items, nextCursor }` (`server/src/utils/cursor.ts`). The sidebar requests 50 collections and shows “Load more collections” when `nextCursor` is set. Opening a collection loads its folders and requests; “Load more” fetches the next page. A call without `limit` still returns the whole array. Sidebar search only sees rows that have been loaded. Covered by `server/src/tests/cursor.test.ts` and a SQL page test in `db.repositories.test.ts`.

* [x] **RBAC and config caching** — from the *Scalability* section
  * ✅ **Done:** `getUserWorkspaceRole` and `SystemConfigRepository.getConfig` cache for 30 seconds. A workspace save drops that workspace's role cache. A config save drops the config cache. With Redis active, the drop is published on `reqspace:cache` so other replicas drop it too. Covered by `server/src/tests/cache.test.ts`.

### ⚪ Stage 4 — Quality, tests and cleanup

* [ ] **Test coverage gaps** — `CR#26` (CI + smoke + first-round specs done) · see [`TESTING.md`](TESTING.md#test-coverage-gaps--and-how-to-close-them)
  * ✅ **Done:** `.github/workflows/test.yml` (build + jest + auth-crossing smoke on sqlite) with `docker-publish` gated on it; `scripts/smoke-core.sh` (crosses the first authenticated request); `ssrf.ts` unit tests; a two-client `socket-realtime` spec (`collection:updated`/`:deleted`); an `api-authorization` spec (viewer → 403 via the API, non-member → 403 read); `global-setup` enables registration; the obsolete socket-sync suppression assertion was replaced; the deprecated `globals.ts-jest` config was migrated to `transform`.
  * **Do (remaining):**
    1. Route every spec through `baseURL` (currently hardcoded `http://localhost:3005`) and add one Playwright project per backend — the DB matrix (smoke on all four, full suite nightly).
    2. Cover the remaining `emitToWorkspace` call sites with two-client tests (folders, requests, environments, reorder — collections are covered).
    3. Add API-authz tests for the remaining bypass surfaces (`POST /api/admin/import`, WSDL import) and a logout-cookie-clearing test.

* [x] **Client dependency weight** — `CR#23`
  * ✅ **Done:** `date-fns` is removed (nothing imported it). `moment` is the only date library, and it loads with `lodash`, `crypto-js`, and `chai` inside the script sandbox bundle (`/vendor/sandbox-runtime.js`), not in the initial app bundle. User scripts still receive the full `_` object, because they can call any lodash method. Handlebars is copied from the `handlebars` package to `/vendor/handlebars.min.js` and the visualizer iframe no longer contacts jsDelivr. The iframe is `sandbox="allow-scripts"` (no `allow-same-origin`).

* [x] **UI consistency** — `CR#27`
  * ✅ **Done:** `/admin` sits inside the layout `AuthGuard` and adds only `SuperAdminGuard`. The database-error and loading screens in `App.tsx` use Tailwind. A 401 clears the session and returns to login; a 403 leaves the session in place and shows a dismissible notice.

* [x] **Dockerfile and k8s hygiene** — `CR#17`
  * ✅ **Done:** the Dockerfile uses `npm ci`, a multi-stage build-tool-free runtime image, and a non-root `USER`. (k8s sticky sessions for socket.io are tracked under the Redis task above.)

* [x] **Dead code and naming** — *P3*
  * ✅ **Done:** `server/dist` stays gitignored. `ensureDefaultAdmin` is gone; bootstrap lives in `index.ts`. `share.ts` no longer has `??` placeholders. `multer`, `http-proxy-middleware`, `archiver`, and `postman-collection` were unused and are removed. The Electron `appId` is `com.reqspace.app`. New SQL databases default to `reqspace`. (`runner.ts` was removed with `CR#13`.)

* [ ] **Feature parity with upstream ReqSpace** — see [`reqspace_features_roadmap.md`](reqspace_features_roadmap.md) (100 items)
  * **Do:** that document is stale — a meaningful share is already built (code generation, collection runner UI, load testing, cURL import, context menus, global search, cookie manager, script editor, documentation modal, shared links). Audit it and mark what landed before using it to plan.

## 📝 License

This project is open-source and available under the [ISC License](LICENSE).
