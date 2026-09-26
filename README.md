# 🚀 Reqspace

> A modern, lightweight, and open-source web-based API testing platform.

Reqspace (formerly reqSpace Clone) is a comprehensive API testing environment designed to run natively in your browser. It provides all the essential features you need to design, test, and manage APIs, backed by a powerful Node.js server that supports multiple database types and robust authentication.

> **Planning lives in two files, not here.** Open work is in [`TODO.md`](TODO.md); everything we have
> decided *not* to build is in [`IGNORE.md`](IGNORE.md). This README describes what the project is and
> how to run it.

## ✨ Features

- **🌐 Complete API Client:** Send GET, POST, PUT, DELETE, PATCH, and OPTIONS requests with full control over headers, query parameters, and body payloads (JSON, Text, Form Data).
- **📂 Collections & Folders:** Organize your endpoints logically into collections and nested folders.
- **🔄 Dynamic Environments:** Create multiple environments (Local, Staging, Prod) and use {{variables}} seamlessly across your URLs, headers, and bodies.
- **🔐 Authentication:** Built-in JWT-based local authentication and **Google OAuth** integration. 
- **👥 Role-Based Access Control (RBAC):** Admin dashboard to manage users, permissions, and system configurations directly from the UI.
- **📜 History & Audit Logs:** Never lose a request. Everything is saved in your personal history, and system-wide changes are securely audited.
- **📦 Multi-Database Support:** Run it on your preferred database! Out-of-the-box support for **SQLite, PostgreSQL, and MySQL**.
- **🐳 Docker Ready:** Fully containerized with a lightweight multi-stage Docker build for easy deployment.


## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, TailwindCSS, Zustand (State Management), Vite/Rolldown
- **Backend:** Node.js, Express, TypeScript, Sequelize (SQL)
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

## 📦 Build & Deploy

### PM2 (the current local deployment)

The project runs under **PM2** via `ecosystem.config.js`, which executes `deploy.js`. That script builds
the client, builds the server (TypeScript), and serves everything on port 3005. PM2 watches for changes,
so a code change triggers a rebuild automatically.

```bash
pm2 logs reqspace      # live logs
pm2 restart reqspace   # restart
pm2 stop reqspace      # stop
pm2 list               # what's running
```

> **If you change code, the build must run before PM2 can serve it.** The server hosts the client bundle,
> so an un-built client means PM2 keeps serving the previous one.

### Manual build

```bash
cd client && npm install && npm run build     # → client/dist
cd ../server && npm install && npm run build  # → server/dist  (TypeScript)

# Run it (server/.env must be configured)
NODE_ENV=production node dist/index.js
```

The server serves the client bundle as well, so the two run as a single unit.

### Docker

```bash
docker-compose up --build -d
```

Builds client and server inside the image and brings up the local database alongside it.

## ⚙️ Configuration & Databases

Reqspace uses an intelligent database connector. You can easily switch your database by editing the DB_TYPE variable in your server/.env file:

```env
# Choose between: sqlite, postgres, mysql
DB_TYPE=sqlite

# If using postgres/mysql, provide the URI:
DB_URI=postgres://localhost:5432/reqspace
```

## 🧪 Running the Tests

The suite is Playwright (browser + API level) plus Jest for server units and DB repositories.

```bash
# Build client & server, then start the app
npm run build --prefix client
npm run build --prefix server
pm2 restart reqspace          # or: node server/dist/index.js

# Server units (SSRF parser, repositories, auth e2e)
npm test --prefix server

# Full Playwright suite
npx playwright test

# A single suite
npx playwright test tests/reqspace.spec.ts          # core E2E user journey
npx playwright test tests/comprehensive-permissions.spec.ts
npx playwright test tests/socket-realtime.spec.ts   # two-client realtime
npx playwright test tests/api-authorization.spec.ts # API-level authz

# Debug visually
npx playwright test --ui
```

The suite assumes a server is already running on `http://localhost:3005` (`webServer` is commented out in
`playwright.config.ts`). CI runs the build, the Jest suite and `scripts/smoke-core.sh` — **not** the
Playwright suite. What that leaves uncovered, and the rules any new test must follow, is in
[`TODO.md`](TODO.md) Stage 4.

## 🔐 Secrets Inventory

Every credential the project needs, where it lives, and how to set it. **Names and locations only — no values are recorded here, and none should ever be added.** This repository is public; a value committed to it is disclosed the moment it is pushed, and rewriting history does not un-disclose it.

### Server environment

Set in `server/.env` locally (gitignored) and as a Kubernetes Secret in a cluster.

| Variable | Purpose | Notes |
|---|---|---|
| `JWT_SECRET` | Signs and verifies session JWTs | See the warning below |
| `ADMIN_EMAIL` | Bootstrap superadmin identity | Defaults to `admin` |
| `ADMIN_PASSWORD` | Bootstrap superadmin password | Defaults to `admin`; production refuses to bootstrap with that value |
| `DB_USER` / `DB_PASSWORD` | SQL credentials | `postgres`, `mysql`, `mssql` |
| `DB_CONNECTION_STRING` | SQL connection string | **Embeds the password** — treat the whole string as a secret |
| `HEADER_AUTH_TRUSTED_IPS` | Sources allowed to use `X-Auth-User` | Defaults to loopback |
| `GOOGLE_ALLOWED_REDIRECT_URIS` | OAuth redirect allowlist | Comma-separated |
| `ALLOW_EPHEMERAL_JWT_SECRET` | Permit a generated per-process secret in production | Single-node deployments only |

> ⚠️ **`JWT_SECRET` — read this before deploying.** `utils/jwtSecret.ts` rejects a list of known placeholder and publicly leaked values, requires at least 32 characters in production, and refuses to boot without a real `JWT_SECRET` there (opt out with `ALLOW_EPHEMERAL_JWT_SECRET=true` for a deliberate single-node deployment). Outside production it falls back to a random secret written to a local, gitignored file (`server/.jwt-secret.local`).
>
> `k8s/secret.yaml` used to ship `JWT_SECRET` as the base64 of `change_me_in_production`, and that string was *not* on the rejection list — so any cluster applying the manifest booted with a signing key published in this public repository. **The value is now removed from the manifest and rejected at startup.** Because it was committed, it is permanently burned: **if you ever deployed that manifest, rotate `JWT_SECRET` now.** Rotation invalidates every existing session automatically, which is the intended effect. History rewriting is *not* required and should not be attempted.

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

`GET /api/admin/config` and `PUT /api/admin/config` mask these on read.
`GET /api/admin/export/:workspaceId` no longer includes the config in its dump at all, so a workspace export
carries no instance-wide credentials. Import does not write them either.

### Per-user secrets stored in the database

| Field | Purpose | Status |
|---|---|---|
| `users.clientCertificates[].passphrase` and key material | Client TLS certificates for mutual-auth requests | **Encrypted with AES-256-GCM**, and excluded from `GET /api/auth/me`. |
| `users.passwordHash` | bcrypt hash, cost 12 everywhere | OK |

The client no longer persists request credentials to browser `localStorage`: bearer tokens, basic-auth
passwords, API keys and sensitive header values are stripped before every write, and a store migration wipes
what earlier builds had already saved. A reloaded tab therefore reopens on the right auth type with empty
fields, by design. **Still outstanding:** nothing. All noted items (SEC-3, SEC-4, SEC-8) have been completed.

### CI / CD

GitHub Actions repository secrets, used by `.github/workflows/docker-publish.yml`:

| Secret | Purpose |
|---|---|
| `DOCKERHUB_USERNAME` | Docker Hub login |
| `DOCKERHUB_TOKEN` | Docker Hub access token — use a scoped token, not an account password |

### Test-only

Optional. Read by `test-all-dbs.ps1`; when unset, that backend is skipped.

`TEST_DB_POSTGRES_URL` · `TEST_DB_MYSQL_URL`

### Where secret material is allowed to live

| Path | Tracked in git | Contains |
|---|---|---|
| `server/.env` | ❌ gitignored | Real values |
| `server/.jwt-secret.local` | ❌ gitignored | Auto-generated JWT secret |
| `server/.env.example` | ✅ tracked | Placeholders and documentation only |
| `k8s/secret.yaml` | ✅ tracked | Nothing — the `data:` block is deliberately empty. `deployment.yaml` consumes it via `envFrom: secretRef`, so the object must exist but may be empty. Real cluster values come from a sealed secret or an external secrets manager |

Before adding any new credential: put the name and a placeholder in `server/.env.example`, add a row to this table, and confirm the file holding the real value is gitignored.

## 🔑 Google OAuth Setup

You can enable Google Authentication without touching the code!
1. Log in to Reqspace with an Admin account.
2. Go to the **Admin Dashboard** -> **Settings**.
3. Toggle "Enable Google OAuth" and enter your Client ID and Secret.
4. Save, and the "Continue with Google" button will instantly appear on the login screen.

### Getting a Client ID/Secret

Google has no API for creating a standard OAuth 2.0 Web application client —
it's Console UI only ([APIs & Services → Credentials → Create Credentials →
OAuth client ID](https://console.cloud.google.com/apis/credentials)). Add the
app's origin(s) (dev, any tunnel, prod) to Authorized JavaScript origins, and
`<origin>/auth/google/callback` to Authorized redirect URIs — this app uses
the authorization-code flow (`POST /auth/google` exchanges a `code` for
tokens server-side), not just an ID-token button, so both are required and
`GOOGLE_ALLOWED_REDIRECT_URIS` (see Secrets Inventory above) must list every
redirect URI you register.

### Setting it headlessly (no admin login needed)

Steps 1-4 above assume an interactive admin session. Since this config lives
in `system_config.auth.googleOAuth` (see *Runtime configuration stored in the
database* above) rather than an env var, you can set it directly against the
database instead — useful for scripted/CI setup: read the row, JSON-merge in
`{ enabled: true, clientId, clientSecret }`, write it back. Same effect as
the admin form. Treat this like any other write to a production database —
credentials belong in gitignored files or a secrets manager, never inline in
a script or committed anywhere.

## 📋 Task Board

The single place to see what is done and what is left. [`TODO.md`](TODO.md) holds the full spec for every
open item — verified state, exact files and line numbers, the traps, and the test that proves it. This board
is the index; `TODO.md` is the detail.

**Status key**

| Mark | Meaning |
|---|---|
| `[x]` | Done and verified |
| `[ ]` | Open — spec is in `TODO.md` |
| `[~]` | Partially done — see the note |
| `[-]` | Deliberately deferred by the owner — do not start without asking |

**Working rules**

1. **Tick the box here in the same commit that completes the work**, and delete the task from `TODO.md`.
   One task per commit, with the id in the message: `SEC-9: validate auth bodies`.
2. **Every task ships a test** that fails before the change and passes after.
3. **Build both sides before committing** — `npm run build --prefix server && npm run build --prefix client`.
   PM2 runs `deploy.js`, which rebuilds on every push; a type error becomes a restart loop and takes the
   deployment down. Restarts are now capped (`ecosystem.config.js`), so a bad push leaves the app **down**
   rather than thrashing.
4. **Do not mark something done you have not run.** If you cannot verify it (an external login, a real
   cluster), mark it `[~]` and say what is unverified.

### 🔐 Security — SEC

| Done | ID | Task | Size | Notes |
|---|---|---|---|---|
| `[-]` | SEC-0 | Delete the server-side proxy; Chrome extension transport | XL | Deferred by the owner. SEC-0.6 (strip the public share payload, revocable links) is independent and still worth doing |
| `[x]` | SEC-1 | Rotate and remove the committed JWT secret | S | **Operational step outstanding: rotate `JWT_SECRET` in any cluster that applied the old `k8s/secret.yaml`** |
| `[x]` | SEC-2 | Close the authorization holes on client-supplied parent ids | M | |
| `[x]` | SEC-3 | Sandbox user scripts | L | `new Function` now only inside `client/src/sandbox/worker.ts` — that one is by design |
| `[x]` | SEC-4 | Stop persisting credentials to `localStorage` | S | Local proxy password in `reqspace-global-settings` still persists — depends on SEC-0 |
| `[x]` | SEC-5 | Stop exporting unmasked secrets | — | Was already correct; no change needed |
| `[x]` | SEC-6 | Escape user input that reaches a query pattern | S | |
| `[x]` | SEC-7 | Stop leaking `dbError` to anonymous callers | S | |
| `[x]` | SEC-8 | Encrypt client certificates at rest | M | `server/src/utils/cryptoBox.ts` |
| `[~]` | SEC-9 | Validate every request body with Zod | L | `middleware/validate.ts` + 5 schema files exist. **Verify coverage across all 33 POST/PUT/PATCH routes before ticking** |
| `[ ]` | SEC-10 | CSP, HSTS and rate limiting beyond login | M-L | **Read SEC-10.0 first** — the obvious CSP breaks Monaco, the visualizer and the script runner |
| `[x]` | SEC-11 | OAuth `state` / CSRF | S-M | **Unverified end-to-end** — a real Google login was never exercised. Confirm before trusting it |
| `[~]` | SEC-12 | Remove the NTLM auth option | S | Owner deferred. Still referenced in `AuthEditor.tsx` and `collections.schemas.ts` |
| `[x]` | SEC-13 | Self-registration granted superadmin | XS | `auth.ts` now creates users with `isSuperAdmin: false`. **Audit the `users` table** — accounts created while this was live keep the flag |

### 🔧 Broken in place — FIX

| Done | ID | Task | Size | Notes |
|---|---|---|---|---|
| `[x]` | FIX-1 | Admin export threw; import orphaned every child row | M | |
| `[x]` | FIX-3 | Real migrations (`umzug`) | M | |
| `[x]` | FIX-4 | History rows rendered "Invalid Date" | XS | |
| `[x]` | FIX-5 | `/api/auth/config` advertised self-registration the server refused | XS | |

### ⚡ Performance — PERF

| Done | ID | Task | Size | Notes |
|---|---|---|---|---|
| `[x]` | PERF-0 | Scale harness and baseline | M | Baseline recorded in `TODO.md` |
| `[~]` | PERF-1 | Opening a workspace issues 1 + 2×N HTTP requests | M | Batched tree endpoint in progress — verify the client actually uses it |
| `[ ]` | PERF-2 | Lazy-load the tree | L | |
| `[~]` | PERF-3 | Paginate everything that returns a list | L | Cursor helpers exist (`utils/pagination.ts`); confirm every list endpoint uses them and caps `limit` |
| `[~]` | PERF-4 | Kill the N+1 queries | L | Reorder rewritten to `bulkCreate`; the other six sites need checking |
| `[~]` | PERF-5 | Cache RBAC and system config | M | |
| `[ ]` | PERF-6 | Trim what the wire carries | M | |
| `[ ]` | PERF-7 | Client bundle weight | M | **Sequence after SEC-10** — bundling Monaco locally makes the bundle bigger, so a budget set now would be wrong |

### 🔌 Realtime — SOCK

| Done | ID | Task | Size | Notes |
|---|---|---|---|---|
| `[x]` | SOCK-0 | Environment events never reached the client | XS | |
| `[ ]` | SOCK-1 | Apply deltas instead of refetching the tree | L | Preserve the last-write-wins conflict branch in `SocketSync.tsx` |
| `[ ]` | SOCK-2 | Cover every emit site with a two-client test | M | Land the CI guard *after* the tests, or CI goes red immediately |
| `[x]` | SOCK-3 | Redis adapter and horizontal scaling | M | `replicas: 2` today with no shared adapter — roughly half of all events are lost |
| `[ ]` | SOCK-4 | Connection hygiene at 10k sockets | M | |

### 🧪 Tests — TEST

| Done | ID | Task | Size | Notes |
|---|---|---|---|---|
| `[x]` | TEST-1 | Run the Playwright suite in CI | M | **Highest leverage here.** CI runs jest + a smoke script only; no browser test has ever run in CI |
| `[x]` | TEST-2 | The database matrix | M | CI is sqlite-only; 11 specs hardcode `localhost:5173` |
| `[ ]` | TEST-3 | Journey coverage, per feature area | XL | 14 areas, all partial; Import/Export, Share and Admin are placeholders that assert almost nothing |
| `[ ]` | TEST-4 | The API-authorization layer | L | Pairs with SEC-2 — a UI test cannot prove an authz check |
| `[x]` | TEST-5 | Client unit tests | M | Test files appeared under `client/src`; confirm a runner and a `test` script are actually wired up |
| `[ ]` | TEST-6 | Scale and performance budgets | M | Assert query counts, not milliseconds |

### 🎨 Interface — UI

| Done | ID | Task | Size | Notes |
|---|---|---|---|---|
| `[x]` | UI-1 | Replace native `prompt` / `confirm` / `alert` | M | **22 sites**, including 12 `alert()` calls. Playwright specs install dialog handlers that must be replaced in the same commit |
| `[x]` | UI-2 | One global feedback surface (toasts) | M | Do this before UI-1 |
| `[x]` | UI-3 | Handle 403 distinctly from 401 | S | **Do not remove the inner `AuthGuard` on `/admin`** — it carries the superadmin check |
| `[ ]` | UI-4 | Accessibility | L | Zero `aria-label`/`role`, and 73 `outline-none` with no `focus-visible` — start by restoring a focus ring |
| `[x]` | UI-5 | Style consistency | S | 21 inline `style={{}}` blocks in `App.tsx` |
| `[x]` | UI-6 | Fix stale copy | XS | `AdminPage.tsx` still mentions config overwrite and traffic capture |

### ✨ Features — FEAT

| Done | ID | Task | Size | Notes |
|---|---|---|---|---|
| `[x]` | FEAT-1 | WebSocket (ws / wss) client | L | |
| `[x]` | FEAT-2 | Socket.IO client | M | |
| `[x]` | FEAT-3 | Server-Sent Events | M | |
| `[x]` | FEAT-4 | Kafka events | L | |
| `[ ]` | FEAT-5.1 | Collection-level RBAC | L | **Do before 5.3-5.6** — they all assume per-collection access |
| `[ ]` | FEAT-5.2 | `@` mentions in comments | M | |
| `[ ]` | FEAT-5.3 | Fork a collection | L | |
| `[ ]` | FEAT-5.4 | Collection versioning | L | Prerequisite for 5.5 |
| `[ ]` | FEAT-5.5 | Pull requests | XL | Needs 5.3 + 5.4 shipped first |
| `[ ]` | FEAT-5.6 | Merge and conflict resolution | XL | Needs 5.5 |
| `[ ]` | FEAT-5.7 | Partner workspaces | L | |
| `[x]` | FEAT-6 | Scope resolution visualizer | L | |
| `[x]` | FEAT-7 | Split pane | XL | |
| `[x]` | FEAT-8 | Restore closed tabs | M | |
| `[x]` | FEAT-9 | Response size limits | M | |
| `[ ]` | FEAT-10 | Server-side collection export/import (v2.1) | L | Reuses FIX-1's id remapping. Fix the fabricated `schema.getreqSpace.com` URL while moving the serialiser |

### 🧹 Cleanup — CLEAN

| Done | ID | Task | Notes |
|---|---|---|---|
| `[x]` | CLEAN-1 | Stub runner route deleted | |
| `[x]` | CLEAN-2 | PM2 restart caps | |
| `[ ]` | CLEAN-3 | Inconsistent naming | `com.reqspaceclone.app`, default DB `postman_clone`, repo folder `postman`, product Reqspace |
| `[x]` | CLEAN-4 | Dead dependencies | `multer`, `archiver`, `postman-collection`, `http-proxy-middleware`, `ajv` — droppable now. **Keep `undici`** until SEC-0.4 |
| `[x]` | CLEAN-5 | Stale traffic-capture copy | `utils/ssrf.ts:6`, `AdminPage.tsx:391` |
| `[x]` | CLEAN-6 | Stale doc references | `smoke-core.sh` → `TESTING.md`, `ssrf.test.ts` → `CODE_REVIEW.md`; neither file exists |
| `[x]` | CLEAN-7 | `IGNORE.md` drift | Section B cites three deleted files |
| `[x]` | CLEAN-8 | Scratch files committed to the repo | `server/patch_*.js` (six tracked) and `collections.ts.bak`. `.gitignore` has `/patch_*.js` — the leading slash anchors it to the repo root, so anything under `server/` slips through. Drop the anchor and untrack them |

### ➕ Adding a task

Append a row to the right table above, then write the spec in [`TODO.md`](TODO.md) under the matching
section. A task nobody can act on is worse than no task, so a new entry needs all five of these:

```markdown
## <ID> — <one line, what is wrong or missing>

* **Status:** verified real / greenfield · **Size:** XS | S | M | L | XL
* **Goal:** what "working" means, in one sentence.
* **Verified state:** exact `file:line`, and what the code there does **today**. Quote it.
* **Why:** the concrete failure. Never "best practice".
* **Change:** the actual code, query or command.
* **Traps:** what breaks if you do it the obvious way.
* **Done when:** the test that proves it.
```

Use the next free number in the series (`CLEAN-9`, `UI-7`, …). **Never reuse a retired id** — old commit
messages reference them.

### 🩺 Known state of the working tree

Written 2026-09-26. Check `git status` before trusting it.

* **The server build is currently broken** on uncommitted work:
  `src/routes/collections.ts(242,9): error TS2684` — `modelMap[type]` hands `bulkCreate` a union of three
  model classes, which gives it an unresolvable `this`. Narrowing per branch (`if (type === 'collection')
  await SqlCollection.bulkCreate(...)`) compiles. Fix this before anything else; nothing deploys until it
  does.
* Uncommitted PERF work is in flight across `routes/collections.ts`, `routes/admin.ts` and three
  repositories. Coordinate before editing those files.

## 🏛️ Architecture Decisions

Standing principles. The concrete work they imply is in [`TODO.md`](TODO.md).

1. **Client-side scripts are sandboxed.** Pre-request and test scripts belong in a Web Worker or a
   sandboxed iframe — never on the main thread with `window`, `localStorage` and the app's authenticated
   HTTP client in scope.
2. **Header authentication is opt-in and source-restricted.** `X-Auth-User` is honoured only from
   trusted sources (`HEADER_AUTH_TRUSTED_IPS`), on the assumption of a reverse proxy that strips it.
3. **Strict input validation.** `zod` schemas on every endpoint that accepts a body — no `req.body`
   spread into a model.
4. **Proxying is not the central server's job.** Long-term, proxy requests are executed by external
   proxies or from the client station, not by the shared Reqspace server.
5. **SSRF to private networks is a feature, not a bug** — local network development is the point of an
   API client. It stays gated behind an explicit admin setting (`proxy.allowPrivateTargets`).
6. **SQL is first-class.** All DB access goes through repositories.
7. **The database is a test-matrix axis.** Anything that touches persistence is expected to run against
   every supported backend.

## 📈 Scalability Targets

The working targets are **10,000 workspaces, 100,000 collections, 100,000+ requests** (design headroom to
20M) and **10,000 concurrent sockets**. They drive five requirements — indexing on every foreign key, cursor
pagination with lazy-loaded tree nodes, granular socket deltas instead of whole-tree refetches, cached RBAC
and system config, and a Redis adapter with sticky sessions.

Indexing shipped (migrations `001`-`003`, applied through `umzug` on boot). The other four have not:
opening a workspace still issues 1 + 2×N HTTP requests, nothing but history paginates and it uses offsets
with no cap, socket events trigger whole-tree refetches, and there is no Redis adapter behind
`replicas: 2`. Status and remaining work: [`TODO.md`](TODO.md) `PERF` and `SOCK`.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
Feel free to check [issues page](https://github.com/Itayp1/reqspace/issues).

Before proposing a feature, check [`IGNORE.md`](IGNORE.md) — it records what we have already decided not
to build, and why. Open work is in [`TODO.md`](TODO.md).

### Working on this repo (humans and agents)

* **Build after changing code.** PM2 serves the built output — see *Build & Deploy* above.
* **Never leave background processes running.** Kill any dev server, test runner or watcher you started
  before you finish.
* **No DB access outside a repository.** `server/src/repositories/*` is the only place allowed to import
  a Sequelize model.
* **Every change ships a test** that fails before it and passes after.

## 📝 License

This project is open-source and available under the [ISC License](LICENSE).
