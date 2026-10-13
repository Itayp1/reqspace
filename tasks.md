# FP Errors: centralized error reporting

Goal: every fault that happens in the client (React app) or in the server gets written to a table `fperrors`, so incidents can be investigated later with SQL.

## Current state (verified in code)

- **DB layer is Sequelize.** `connectDb` (`server/src/db/connect.ts`) calls `sq.sync()` (`alter: true` outside production, `{}` in production, which creates missing tables) and then runs `server/src/db/migrations/*`.
- **The `mongodb` DB type is a stub.** `dbConfig.ts` defaults to `mongodb`, but `initSequelize` (`server/src/db/sequelize.ts`) returns `null` for it and no Mongo driver is installed. The fperrors table therefore goes into whichever SQL database is configured (`sqlite` in tests, via `DB_TYPE`). Mongo is out of scope, per the decision to use a table.
- **DB gate.** In `server/src/index.ts`, `app.use('/api', ...)` (around lines 210-223) returns 503 for every `/api` route while the DB is not `ok`. Reports must be accepted before this gate, otherwise they are lost exactly when the DB is down.
- **Global error handler** is at `server/src/index.ts` around lines 288-297. It logs with `console.error` and returns JSON. It records nothing.
- **Client has no global error capture.** `client/src/main.tsx` renders `<App/>` with no `ErrorBoundary`. There is no `window.onerror` or `unhandledrejection` listener.
- **Client API** is a single axios instance in `client/src/api/axios.ts`. Its response interceptor handles 401 and 403 only.
- **Rate limiting** uses `server/src/middleware/rateLimit.ts`. It is disabled when `DISABLE_RATE_LIMIT=true`, which PM2 sets.
- **Validation** uses zod with the `validate(schema)` middleware (`server/src/middleware/validate.ts`).

## Architecture

```
Browser                                  Server (Express)
-------                                  ----------------
window.onerror / unhandledrejection ─┐
ErrorBoundary.componentDidCatch    ──┼─> reportClientError()  ──POST /api/errors──┐
axios interceptor (5xx / network)  ──┘   (fetch, keepalive,                      │
                                          local dedupe, cap per page)            ▼
                                                                  errors route (before DB gate)
                                                                  rateLimit + zod validate
                                                                              │
Express error handler  ───────────────────┐                                   │
res.on('finish') for status >= 500 ───────┼─> recordError() <─────────────────┘
process uncaughtException / unhandledRejection ┘   - fingerprint + in-memory dedupe
                                                   - redact + truncate
                                                   - SqlFpError.create()  ──> table `fperrors`
                                                   - on failure: append JSONL to fallback file
```

### 1. Storage: table `fperrors`

Sequelize model `SqlFpError` in `server/src/db/sql-models/index.ts`, following the pattern of the existing `SqlUser` and `SqlFork*` models. Table name `fperrors`. Created by `sq.sync()`, so no migration is needed for creation.

| column | type | notes |
|---|---|---|
| `id` | STRING(36) PK | uuid, same as other models |
| `source` | STRING(10) | `client` or `server` |
| `kind` | STRING(40) | `window.error`, `unhandledrejection`, `react-boundary`, `api`, `server-exception`, `server-5xx`, `process` |
| `message` | TEXT | truncated to 2000 chars |
| `stack` | TEXT nullable | truncated to 10000 chars |
| `componentStack` | TEXT nullable | React only |
| `route` | STRING(500) nullable | client: `location.pathname` only. server: `req.path` only. No query strings. |
| `method` | STRING(10) nullable | HTTP method for `api` and server kinds |
| `status` | INTEGER nullable | HTTP status |
| `userId` | STRING(36) nullable | taken only from the verified auth cookie on the server, never from the body |
| `userAgent` | STRING(500) nullable | |
| `fingerprint` | STRING(64) | sha256 of `kind + message + first stack frame`, used to group incidents |
| `createdAt` | DATE | `updatedAt` disabled |

Indexes: `createdAt`, and `fingerprint`.

### 2. Server write path: `server/src/utils/errorReporter.ts`

`recordError(input): void` (fire-and-forget, never throws, never awaited by callers):

1. Build the fingerprint.
2. Dedupe in memory. If the same fingerprint was recorded in the last 60 seconds, drop it. This bounds floods such as a DB outage producing a 5xx on every request.
3. Redact sensitive patterns in `message` and `stack` (`token=...`, `Bearer ...`, `password=...`) and truncate all fields.
4. `SqlFpError.create(...)`.
5. On failure (DB down, insert rejected), append one JSON line to `server/logs/fperrors-fallback.jsonl` using `fs.appendFileSync`, and `console.error` a short line. The synchronous write is deliberate: it is the only path that survives `uncaughtException`.

No recursion: the reporter never calls the reporter. If its own write fails, it logs and stops.

### 3. Endpoint: `POST /api/errors`

- New router `server/src/routes/errors.ts`, mounted in `index.ts` **before** the DB gate (right after `/api/health`).
- Public, because the login page can throw too. No auth required.
- Dedicated limiter: 60 per minute per IP, using the existing `rateLimit` helper.
- Body validated by `server/src/schemas/errors.schemas.ts` (zod, strict, max lengths). Enums: `kind`, `source` (fixed to `client` by the route, never trusted from the body).
- Responds `204` immediately, then calls `recordError` without awaiting it.
- A rejected body returns 400, and the rate limiter returns 429.

### 4. Server capture points (`server/src/index.ts`)

- **Error handler** (around line 288): when `status >= 500`, call `recordError({source:'server', kind:'server-exception', ...})` and set `res.locals.errorRecorded = true`.
- **Non-throwing 5xx** (`res.status(500).json(...)` inside routes): a middleware registered before the routes adds `res.on('finish')`. If the status is 500 or higher and `res.locals.errorRecorded` is not set, it calls `recordError({kind:'server-5xx'})`. The 503 from the DB gate is included. The dedupe window keeps it from flooding.
- **Process level:** `process.on('uncaughtException')` and `process.on('unhandledRejection')` call `recordError({kind:'process'})`. The existing exit behaviour is kept. The uncaughtException path relies on the synchronous fallback file.
- Not in scope: socket.io handler errors, and errors from user scripts running in the sandbox worker. Those are user-authored code, not app faults.

### 5. Client capture

- **`client/src/utils/errorReporter.ts`**
  - `reportClientError(payload)` sends `POST /api/errors` with `fetch`, `keepalive: true`, and `credentials: 'same-origin'`. It does not use the axios instance, so its interceptor is not involved.
  - Local dedupe by fingerprint. Hard cap of 100 reports per page load.
  - Any failure of its own POST is swallowed. It never reports itself.
  - Strips query strings and fragments from URLs before sending. Never sends request or response bodies.
  - Ignores the known benign `ResizeObserver loop limit exceeded` event.
- **`installGlobalErrorHandlers()`** called from `main.tsx`: listeners for `window 'error'` and `'unhandledrejection'`.
- **`ErrorBoundary`** (class component, new file `client/src/components/common/ErrorBoundary.tsx`) wrapping `<App/>` in `main.tsx`. `componentDidCatch` calls `reportClientError({kind:'react-boundary', componentStack})`. The fallback UI is a short message with a reload button. React does not forward caught render errors to `window.onerror`, so the boundary is required.
- **Axios interceptor** in `client/src/api/axios.ts`: on `status >= 500` or on a network failure (no response), call `reportClientError({kind:'api', method, route, status})`. 4xx responses are not reported, because they are expected flows.

### 6. Retention and resolution

- **Retention: 30 days.** A purge runs at server boot and every 24 hours, deleting rows where `createdAt < now - 30d`.
- **Resolving an error deletes the row.** Once a fault is fixed, it is removed from `fperrors`. There is no status column and no history table.
- **Admin screen** (superadmin only, via `requireSuperAdmin`):
  - list with filters on `source`, `kind`, and a text search over `message`
  - group rows by `fingerprint` to see how often each fault occurs
  - detail view with message, stack, componentStack, route, user, and user agent
  - a "Fixed" button that deletes all rows with that fingerprint
- No kill switch env var.

### 7. Shared contract

The payload shape is defined once in the server zod schema, and the client type mirrors it. Fields: `kind`, `message`, `stack?`, `componentStack?`, `route?`, `method?`, `status?`, `userAgent?`.

## Implementation steps

1. Model `SqlFpError` + `init` in `server/src/db/sql-models/index.ts`. Check that `sq.sync()` creates the table on a fresh SQLite DB.
2. `server/src/utils/errorReporter.ts` (fingerprint, dedupe, redact, truncate, insert, fallback file).
3. `server/src/schemas/errors.schemas.ts` and `server/src/routes/errors.ts`. Mount before the DB gate in `index.ts`.
4. Server capture: error handler, `res.on('finish')` middleware, process handlers.
5. Client: `errorReporter.ts`, `ErrorBoundary.tsx`, global handlers in `main.tsx`, axios interceptor change.
6. Purge job (30 days) at boot and every 24h.
7. Admin API: `GET /api/admin/errors` (list, filter, group by fingerprint), `DELETE /api/admin/errors/:fingerprint` (fixed). Both behind `requireSuperAdmin`.
8. Admin screen in the client (superadmin only), reachable from the existing admin area.
9. Tests (below).
10. Run the suites and check the server log output for errors and warnings (`scripts/run-server-e2e.js`, the client unit tests, and Playwright). Fix what appears.

## Tests

- **Server unit** (`server/src/tests/errorReporter.test.ts`): dedupe within the window and re-record after it; truncation; redaction; insert rejects, so the fallback file gets a line and nothing throws.
- **Server e2e** (`server/src/tests/errors.e2e.test.ts`):
  - valid body returns 204 and a row appears in `fperrors`
  - invalid body returns 400
  - rate limit returns 429
  - the endpoint still returns 204 when `_setDbStatusForTest('error')` is set
  - a route forced to 500 creates a `server-5xx` row
- **Client unit** (vitest, as in `client/src/utils/*.test.ts`): reporter dedupe, per-page cap, no recursion when the POST fails, query string stripped; ErrorBoundary renders the fallback and calls the reporter.
- **Playwright**: throw from the page through a test hook and verify the row exists.

## Risks and decisions

- **Mongo is not used.** The `mongodb` type is still a stub and the default DB type is `mongodb`, so a fresh install without `DB_TYPE` set currently fails at startup. This plan does not change that. Fixing it is a separate task.
- **Storage while the DB is down** is the fallback JSONL file, which is only read by a human or a script. Reports are not in SQL during an outage.
- **PII.** `userAgent`, `route`, and stacks (which contain local file paths) are stored. Access is read-only through SQL for now. Nothing is exposed through the API.
- **Retention.** No purge job yet. Proposal: a 30-day purge at boot or on a schedule. Needs a decision.
- **Working tree.** Many files are already modified and uncommitted (including `server/src/index.ts` and `client/src/main.tsx`). These changes must be kept when the new code is added. Commit or stash the existing work before implementing, or the diff gets mixed up.

## Decisions (resolved)

- Retention: 30 days, purge job.
- Admin screen: yes, superadmin only.
- Fixing an error removes its rows from `fperrors`.
- No kill switch.
