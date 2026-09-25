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

## 🚨 Open critical finding — self-registration grants superadmin

`server/src/routes/auth.ts:54` creates every self-registered user with `isSuperAdmin: true`. Combined with
`allowSelfRegistration` defaulting to `true`, **anyone who can reach the login page can give themselves full
superadmin** — every workspace, the admin dashboard, user management, audit logs and system configuration.

Introduced in commit `c965de2` (2026-09-25). Verified by registering a new account and observing
`isSuperAdmin: true` in the response. The fix is one word (`true` → `false`); the bootstrap superadmin in
`server/src/index.ts` is the only account that should ever be created with that flag.

**Until it is fixed, either disable self-registration in the Admin Dashboard or do not expose the instance.**
Then audit `users` for unexpected superadmins — an account created while this was live still has the flag.

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
| `users.clientCertificates[].passphrase` and key material | Client TLS certificates for mutual-auth requests | **Stored in plaintext**, and `GET /api/auth/me` returns the whole array — [`TODO.md`](TODO.md) SEC-8 |
| `users.passwordHash` | bcrypt hash, cost 12 everywhere | OK |

The client no longer persists request credentials to browser `localStorage`: bearer tokens, basic-auth
passwords, API keys and sensitive header values are stripped before every write, and a store migration wipes
what earlier builds had already saved. A reloaded tab therefore reopens on the right auth type with empty
fields, by design. **Still outstanding:** the local proxy password in `reqspace-global-settings`
([`TODO.md`](TODO.md) SEC-4 note), and user scripts still run unsandboxed on the main thread
([`TODO.md`](TODO.md) SEC-3).

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

## ✅ Hardening completed on 2026-09-25

One pass, verified against a running instance and covered by tests (153 server tests pass). Full detail for
each item, including what was deliberately left, is in [`TODO.md`](TODO.md).

| Area | What changed |
|---|---|
| **JWT signing key** | `change_me_in_production` (and six other placeholders) rejected at startup; 32-character minimum enforced in production; the value stripped from `k8s/secret.yaml`. **Rotate if you ever deployed that manifest.** |
| **Credentials in `localStorage`** | Auth secrets and sensitive header values stripped before every persist, with a store migration that clears what earlier builds already wrote. Fake seed cookie removed |
| **Authorization** | `POST /api/history/:id/save` and `POST /api/import/wsdl` took a collection/workspace id straight from the request body and wrote into it with no membership check. Both now resolve the owning workspace and require `editor`; `GET /api/collections/:id/export` requires `viewer`. Guard extracted to `middleware/resolveWorkspace.ts` |
| **Database error disclosure** | The `/api` gate returned the raw driver message — which names host, database and user — to unauthenticated callers on every path. Masked in production, with the client's error screen updated so it still appears |
| **Search input** | `LIKE` wildcards escaped and terms capped, so `?q=%` no longer matches every row; an array-valued `?q[]=` no longer reaches the query. Orphaned `escapeRegex` util deleted (no `new RegExp` remains server-side) |
| **Realtime** | Environment create/update/delete events were emitted as `environment-created` while the client listened for `environment:created`, so environment changes never propagated. Renamed to the colon form used by the other ten emit sites |
| **Correctness** | History rows rendered `executedAt`, a field the server never sends — every row showed "Invalid Date". `GET /api/auth/config` hardcoded `allowSelfRegistration: true` while the register route enforced the real setting, so the client offered a form the server refused |
| **Deployment** | `ecosystem.config.js` had no `max_restarts` or `restart_delay`, so a build error became an unbounded PM2 restart loop — this took the deployment down twice. Capped with a back-off. Stub `runner.ts` and `POST /api/collections/import` routes deleted |

**Not done, deliberately:** OAuth `state`/CSRF (SEC-11) — the change is understood but a Google login cannot
be verified end-to-end here, and this repo deploys on push. CSP and rate limiting (SEC-10) — blocked on
bundling Monaco locally and self-hosting Handlebars, both of which the current CSP proposal would break.

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
