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

Reqspace picks the database from the scheme of `DB_CONNECTION_STRING`: `postgres://`, `mysql://` or `mssql://`. Without it, SQLite is used. Set it in server/.env:

```env
# postgres, mysql or mssql. Leave unset for SQLite.
DB_CONNECTION_STRING=postgres://user:password@host:5432/reqspace
```

**What belongs in `.env` and what does not.** The `.env` file holds only what the server needs *before* the
database is reachable: the database connection, `REDIS_URL`, the secrets `JWT_SECRET` and `CERT_ENCRYPTION_KEY`,
and process parameters (`NODE_ENV`, `PORT`, `CLIENT_DIST_PATH`, `MAX_BODY_SIZE`). The admin account is
not configured here: on first start the app shows a setup screen to create it (see *First-run setup* below). **Every other setting is stored in the database and
edited by a super admin in Admin Dashboard → Settings** — no restart and no `.env` edit. That includes OAuth
providers (Google, GitHub, Microsoft, custom), SMTP, the HTTP proxy, history limits, and the *Server & Security*
card (cookie `Secure` flag, rate limits, trust proxy, allowed origins, OAuth redirect URIs, error-log options).

### Server & Security settings

Stored in the `server` section of `system_config`, edited in Admin → Settings → *Server & Security*, and picked up
by every instance within about 30 seconds.

| Setting | Default | Purpose |
|---|---|---|
| Session cookie `Secure` flag | Auto | Auto = secure in production only. *Never* is the opt-out for HTTP-only self-hosting (it also turns off HSTS / upgrade-insecure-requests) |
| Rate limiting on/off | On | Master switch for every limiter below |
| Login / registration per IP | 15 per 15 min / 10 per hour | Brute-force and signup-abuse throttles |
| Writes / reads per IP | 300 / 2000 per minute | General API ceilings |
| Shared-link views / error reports per IP | 100 per 15 min / 30 per minute | Public endpoints |
| Trust proxy | off | Hop count (`1`) or IP/CIDR list. **Behind a reverse proxy or ingress set this**, otherwise every visitor shares one IP and rate-limit bucket |
| Extra allowed origins | none | CORS and cross-origin check for extra dev/test clients; ignored in production |
| OAuth redirect URIs | localhost defaults | Must list every `<origin>/auth/<provider>/callback` you register with the providers |
| Error-log de-duplication window | 60000 ms | `0` records every occurrence |
| Record 401/403 responses | On | Include auth failures in the error log |

Stored credentials (OAuth client secrets, SMTP password, proxy password) are encrypted at rest with
`CERT_ENCRYPTION_KEY` (AES-256-GCM); migration `020` seals values written by older versions. If the key is
missing or wrong, the affected secret is treated as unset and must be re-entered.

## 🖥️ Desktop app (Electron)

A reqSpace server is always online and always requires sign-in. Single-user offline mode exists only in the
desktop app. On first launch it asks whether to connect to a server:

- **Yes** — enter the server URL; the app opens that server and you sign in as usual.
- **No** — the app starts its own embedded server on `127.0.0.1` with the `--offline` flag: no sign-in, one local user,
  data in a SQLite file (folder chosen on the setup screen, changeable under *File → Database location…*).

*File → Connect to a server… / Work offline instead…* returns to that question later. Offline mode is a command-line
flag passed by the desktop app, not an environment variable, so no `.env` can switch sign-in off on a server.
Switching an existing local install to offline signs in as a new local user (`local@reqspace.local`); accounts and data
created with sign-in are not shown there.

## 🧪 Running the Tests

The suite is Playwright (browser + API level) plus Jest for server units and DB repositories.

```bash
# Build client & server, then start the app
npm run build --prefix client
npm run build --prefix server
pm2 restart reqspace          # or: node server/dist/index.js

# Server units + server e2e (starts and stops its own server on :3005)
node scripts/run-server-e2e.js

# Full Playwright suite
npx playwright test

# A single suite (these four files did not exist; these are the real paths)
npx playwright test tests/e2e/requests.spec.ts           # core request journey
npx playwright test tests/e2e/rbac.spec.ts               # viewer vs editor in the UI
npx playwright test tests/e2e/socket-sync.spec.ts        # two-client realtime
npx playwright test tests/e2e/api-authorization.spec.ts  # API-level authz

# Debug visually
npx playwright test --ui
```

Every feature, and the tests that cover it, is listed in [`FEATURES.md`](FEATURES.md); the coverage audits
are in [`TEST_COVERAGE.md`](TEST_COVERAGE.md).

**Every Playwright test also checks the `fperrors` table.** `tests/e2e/fixtures.ts` asks the backend for any
fault recorded while the test ran (`GET /api/admin/errors?since=…`) and fails the test if there is one; at the
end of the run `tests/e2e/global-teardown.ts` reads the table directly and fails the run on anything no test
declared. New specs must import `test` / `expect` from `./fixtures`, not `@playwright/test`, and a test that
causes a fault on purpose declares it with `test.use({ allowFpErrors: [/pattern/] })`.

Locally, `playwright.config.ts`'s `webServer` starts both the API (`:3005`) and the client (`:5173`)
itself, with `reuseExistingServer: false` so a stale dev server from an earlier session is never silently
reused — if either port is still held, the run aborts rather than testing the wrong build. In CI that flag
flips, because the workflow pre-starts and health-checks its own server. CI runs the Jest suite,
`scripts/smoke-core.sh` **and** Playwright, as a matrix over the database backends plus a dedicated `extension`
project (TEST-1 / TEST-2). The rules any new test must follow are in [`TODO.md`](TODO.md).

**Test servers and runtime settings.** Rate limits, trust proxy, allowed origins and error-log options are database
settings, so a test run applies them through the admin API after the server is up: `tests/e2e/global-setup.ts` for
Playwright (limiters off unless `DISABLE_RATE_LIMIT=false`, the `@ratelimit` run, which is a *test-runner* switch and
not a server variable) and `scripts/apply-test-settings.js` for the Jest suite and CI. A server you start by hand for
the Jest suite needs `node scripts/apply-test-settings.js http://localhost:3005` once it is healthy.

## 🔐 Secrets Inventory

Every credential the project needs, where it lives, and how to set it. **Names and locations only — no values are recorded here, and none should ever be added.** This repository is public; a value committed to it is disclosed the moment it is pushed, and rewriting history does not un-disclose it.

### First-run setup

When the database has no superadmin, the login page becomes a "Create the admin account" form (name, username or
email, password of at least 8 characters). It is open to whoever reaches the server first, so complete it before
exposing the service. Once an admin exists, `POST /api/auth/setup` returns 409. To reset the admin, delete the
superadmin row from the users table; the setup form is offered again on the next page load, no restart needed.

### Server environment

Set in a `.env` file in the directory the server starts from (gitignored; `server/.env` when started from `server/`), or as a Kubernetes Secret / ConfigMap in a cluster. `NODE_ENV` and `PORT` are also set by the Dockerfile and `k8s/configmap.yaml`.

| Variable | Purpose | Notes |
|---|---|---|
| `NODE_ENV` | `production` enables production behaviour (secure cookies, CORS off, generic error messages) | Set to `production` in the Dockerfile and ConfigMap |
| `PORT` | API listen port | Default `3005` |
| `CLIENT_DIST_PATH` | Built client to serve | Relative to `server/`; default `../client/dist` |
| `MAX_BODY_SIZE` | Max JSON/form body size | Default `5mb` |
| `JWT_SECRET` | Signs and verifies session JWTs | Required. Generate on the login page or `openssl rand -hex 32`; see the warning below |
| `DB_STORAGE_PATH` | SQLite file path | Default: `./data.sqlite`; with `NODE_ENV=production`, `<APPDATA or ~/.config>/reqspace/data.sqlite` |
| `DB_CONNECTION_STRING` | SQL connection string (host, credentials, database) | Used for postgres, mysql and mssql. **Embeds the password** — treat the whole string as a secret |
| `REDIS_URL` | Shared rate-limit store | Optional; **may embed a password** |
| `CERT_ENCRYPTION_KEY` | 64-hex-char AES-256-GCM key sealing client-certificate keys and the credentials in Admin → Settings | Required for saving credentials in Settings. Generate on the login page or `openssl rand -hex 32`; losing it makes sealed values unreadable |

OAuth providers, SMTP, cookie security, rate limits, trust proxy, allowed origins, error-log options and the OAuth redirect allowlist are **not** environment variables: they live in the database and are edited in Admin → Settings (see *Server & Security settings* above).

> ⚠️ **`JWT_SECRET` and `CERT_ENCRYPTION_KEY` — read this before deploying.** Both come from the environment only; the server never creates or stores them. If `JWT_SECRET` is missing, the API answers 503 until it is set. The login page shows which of the two are missing and has a **Generate** button for each: it creates the value in your browser, you copy the `NAME=value` line into the server's environment variables (a `.env` file works) and restart. The same two values must be set on every replica. `utils/secrets.ts` rejects a list of known placeholder and publicly leaked `JWT_SECRET` values, a `JWT_SECRET` shorter than 32 characters in production, and a `CERT_ENCRYPTION_KEY` that is not 64 hex characters. Keep a copy of both somewhere safe: a lost `CERT_ENCRYPTION_KEY` makes the sealed credentials unreadable, and a changed `JWT_SECRET` signs everyone out.
>
> `k8s/secret.yaml` used to ship `JWT_SECRET` as the base64 of `change_me_in_production`, and that string was *not* on the rejection list — so any cluster applying the manifest booted with a signing key published in this public repository. **The value is now removed from the manifest and rejected at startup.** Because it was committed, it is permanently burned: **if you ever deployed that manifest, rotate `JWT_SECRET` now.** Rotation invalidates every existing session automatically, which is the intended effect. History rewriting is *not* required and should not be attempted.

### Runtime configuration stored in the database

These are **not** environment variables. They live in the `system_config` row (`id: 'global'`; JSON columns `auth`, `history`, `proxy`, `server`) and are entered through the Admin Dashboard at runtime. The secrets below are stored encrypted (AES-256-GCM, `CERT_ENCRYPTION_KEY`).

| Field | Purpose |
|---|---|
| `auth.googleOAuth.clientId` | Google OAuth application id |
| `auth.googleOAuth.clientSecret` | Google OAuth application secret |
| `auth.githubOAuth.clientId` / `clientSecret` | GitHub OAuth app credentials (redirect `<origin>/auth/github/callback`) |
| `auth.microsoftOAuth.clientId` / `clientSecret` / `tenantId` | Microsoft Azure / Entra ID app registration (redirect `<origin>/auth/microsoft/callback`; scopes `openid email profile`) |
| `auth.customOAuth.*` | Any standard OAuth2/OIDC provider (Keycloak, Okta, Authentik, ...): `name` (button label), `clientId`, `clientSecret`, `authorizeUrl`, `tokenUrl`, `userinfoUrl` (must return a verified `email`), `scope`. Redirect `<origin>/auth/custom/callback` |
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
"OAuth redirect URIs" (Admin → Settings → Server & Security) must list every
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
| `[x]` | TEST-3 | Journey coverage, per feature area | XL | Audited 2026-10-07 — see [`TEST_COVERAGE.md`](TEST_COVERAGE.md) for the per-area matrix, the 11 defects it turned up, and the 7 areas still marked ⚠️/❌ |
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
| `[ ]` | FEAT-7 | Split pane | XL | Was ticked, but there is no code for it (checked 2026-10-14): the request/response divider is decorative |
| `[ ]` | FEAT-8 | Restore closed tabs | M | Was ticked, but there is no code for it (checked 2026-10-14) |
| `[x]` | FEAT-9 | Response size limits | M | |
| `[x]` | FEAT-10 | Server-side collection export/import (v2.1) | L | `server/src/utils/postmanCollection.ts`; the client's Export and Import > File both use it. Schema URL is the real Postman one |

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

Written 2026-10-14. Check `git status` before trusting it.

* Server and client both type-check (`npx tsc --noEmit -p server/tsconfig.json`, `npx tsc -b` in `client/`).
* Last verified runs (2026-10-14): server suite 226/227 (the one failure was a cache-timing assertion, since
  relaxed), client unit 21/21, Playwright full run **229/230 passed** (1 known-flaky tab-drag test that passed on retry), server suite 227/227, client unit 29/29, and the `fperrors` table ended the run empty.
* The manual browser pass (production build) is partly done: see the end of [`FEATURES.md`](FEATURES.md) for what was checked by hand and the bugs it found; the remaining rows are still `pending`.

## 🏛️ Architecture Decisions

Standing principles. The concrete work they imply is in [`TODO.md`](TODO.md).

1. **Client-side scripts are sandboxed.** Pre-request and test scripts belong in a Web Worker or a
   sandboxed iframe — never on the main thread with `window`, `localStorage` and the app's authenticated
   HTTP client in scope.
2. **Offline mode is loopback-only.** The `--offline` command-line flag (passed only by the desktop app; a server is always online and no env var can enable it) signs the local user in automatically, so the
   server binds to `127.0.0.1` and refuses any non-loopback peer. Header (`X-Auth-User`) authentication no longer exists.
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

## Test-plan fixes

Progress for the failed manual test plan is in [`test_plan_fix/README.md`](test_plan_fix/README.md).
All 32 tracked items are done. See [`test_plan_fix/README.md`](test_plan_fix/README.md).

## 📝 License

This project is open-source and available under the [ISC License](LICENSE).
