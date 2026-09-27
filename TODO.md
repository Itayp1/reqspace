# TODO — Reqspace

Execution plan. Written for someone who has **not** seen the codebase or the discussion behind it.

**Re-verified against the source on 2026-09-27.** The 2026-09-25 revision had already drifted by this pass —
most of what it described as open work had actually shipped since (see
[Removed on 2026-09-27](#removed-on-2026-09-27)), and one item (SEC-0) turned out to be much further along
than its own "deferred, nothing built" status claimed. Anything genuinely large or multi-step that is still
open now lives in [`PLANTODO.md`](PLANTODO.md), with a correction note wherever the real code differed from
what was planned. This file now holds only what's still open and small, plus the standing rules. If you find
a claim here that does not match the code, the code wins — fix this file in the same commit.

Every task has:

* **Status** — verified real / partially done, and how big it is.
* **Goal** — what "working" means, in one sentence.
* **Verified state** — exact files and line numbers, and what the code there actually does today.
* **Why** — the concrete failure. Never "best practice".
* **Change** — the actual code, index, query or command. Copy it, adapt names, verify it compiles.
* **Traps** — what breaks if you implement it the obvious way. Read this before writing code.
* **Done when** — the test that proves it. No task is finished without one.

## Rules

1. **Do not invent scope.** If it is not in this file, not in [`PLANTODO.md`](PLANTODO.md), and not in
   [`IGNORE.md`](IGNORE.md), ask first.
2. **`IGNORE.md` is binding.** Do not build, plan or suggest anything listed there.
3. **Order:** within a section, top to bottom. `PLANTODO.md`'s items are independent of each other unless a
   note there says otherwise (see FEAT-5's internal ordering).
4. **One task per commit.** Commit message starts with the task id, e.g. `SEC-2: close the four authz holes`.
5. **Every task ships a test that fails before the change and passes after.** Write the test first, watch
   it fail.
6. **No new `any`.** All database access goes through `server/src/repositories/*.ts` — nothing else may
   import Sequelize models directly.
7. **Delete the task from this file (or from `PLANTODO.md`) in the same commit that completes it**, and add a
   line to this file's "Removed" section saying what shipped.

## Before you touch anything

* **A build error is a production outage.** `deploy.js` runs `npm run build` for `client/` then `server/`;
  `ecosystem.config.js` now caps restarts (`max_restarts: 10`, `restart_delay: 5000`, `min_uptime: 30000`), so
  a bad build no longer crash-loops forever, but it still takes the process down for that window. Run **both**
  builds before every commit.
* **The two tsconfigs differ.** `server/tsconfig.json` has no `noUnusedLocals`; `client/tsconfig.app.json`
  sets `noUnusedLocals` **and** `noUnusedParameters`. An unused import compiles on the server and fails the
  client build.
* **`server/src/index.ts` exports `app`** (`export { app };`) — a `supertest` test can import it directly.
  Note `bootstrap()` still runs at module scope on import — prefer extracting pure functions into
  `server/src/utils/` and unit-testing those where you can.
* **Router mount order is load-bearing.** `collectionsRouter`, `environmentsRouter` and `historyRouter` are
  mounted on the bare `/api` prefix and each calls `router.use(authenticate)` with no path, so they swallow
  every `/api/*` request that reaches them. Anything with a deliberately public route (today: `shareRouter`,
  `shareProxyRouter`) must be mounted **before** them.

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
| **Transport** | `client/src/transport/` — picks Electron IPC, the Chrome extension, or `fetch()`, in that order. The old server-side proxy (`routes/proxy.ts`) is being phased out; see `PLANTODO.md`'s SEC-0 entry for what's left. |
| **Two-client test** | A test with two connected socket clients where the *observer* (which did not act) is the subject of the assertion. |

## Where the tests actually live

| Suite | Path | Runs in CI? |
|---|---|---|
| Server unit + live-auth e2e (jest) | `server/src/tests/*.test.ts` | ✅ `npm test --prefix server` |
| Client unit (vitest) | `client/src/**/*.test.ts` | ✅ `npm test --prefix client` |
| Browser e2e (Playwright, per-`DB_TYPE` project + an `extension` project) | `tests/e2e/*.spec.ts` | ✅ |
| Core smoke (bash + curl) | `scripts/smoke-core.sh` | ✅ |

CI is `.github/workflows/test.yml`. It now runs Playwright as a matrix over `DB_TYPE` plus a dedicated
`extension` project on sqlite.

---

There is no open SEC, FIX, PERF, SOCK, TEST, UI, FEAT or CLEAN item left that is both **still real** and
**small enough to fix in one sitting** — see [Removed on 2026-09-27](#removed-on-2026-09-27) for what shipped
this pass, and [`PLANTODO.md`](PLANTODO.md) for everything still open. Check both before assuming there is
nothing to do.

---

# Removed on 2026-09-27

Deleted from this file during this pass, either because the underlying problem no longer exists in the code,
or because it was fixed as part of this same pass. Recorded once so nobody re-adds these from an old diff or
a memory of "there was a task for that". `PLANTODO.md` has its own set of **corrections** for items that
turned out to be *partially* shipped — those aren't repeated here, only the ones that are fully done.

| Was | What shipped | Evidence |
|---|---|---|
| **SEC (unnamed)** — self-registered users got `isSuperAdmin: true` | `server/src/routes/auth.ts:56` now creates users with `isSuperAdmin: false` | `server/src/routes/auth.ts:23,56` |
| **SEC-0.6** — share links leaked full credentials, no revoke, no rate limit | `server/src/routes/share.ts` now projects a safe view (`name`, `method`, `url`, filtered headers, `auth.type` only, no scripts), has `DELETE /:shortId` with an owner/superadmin check, and rate-limits the public `GET` | `server/src/routes/share.ts` |
| **SEC-3** — scripts ran on the main thread via `new Function`, with the user's session | `client/src/utils/scripts.ts` now runs scripts in a real Web Worker (`../sandbox/worker?worker`), message-passed, capped at 10 `sendRequest` calls per run; the visualizer iframe is `sandbox="allow-scripts"` (no `allow-same-origin`) and no longer loads Handlebars from a CDN; the HTML preview iframe is `sandbox=""` | `client/src/utils/scripts.ts`, `client/src/sandbox/worker.ts`, `client/src/components/response/ResponseViewer.tsx:381,540` |
| **SEC-8** — client certificate keys/passphrases stored and returned in clear text | `server/src/utils/cryptoBox.ts` seals `key`/`passphrase` with AES-256-GCM; `GET /api/auth/me` and `POST /certificates` return metadata only. **This pass also fixed a residual leak**: `DELETE /api/auth/certificates/:id` was still echoing the raw stored array (sealed blobs, plus the cert in clear) — it now returns the same metadata-only shape as the other two routes | `server/src/routes/auth.ts` |
| **SEC-9** — no request-body validation, hand-written allowlists only | `server/src/middleware/validate.ts` + per-resource `.strict()` Zod schemas in `server/src/schemas/` cover every route file except `users.ts` (which has no mutating routes to validate); `ajv` is gone from `server/package.json`; `AuthRequest.user` is a real `AuthUser`, not `any` | `server/src/middleware/validate.ts`, `server/src/schemas/*` |
| **FIX-1** — admin export threw a 500 (`SqlFolder`/`SqlRequest` have no `workspaceId` column) | `GET /api/admin/export/:workspaceId` now filters folders/requests by `collectionId` (via the workspace's collection ids), not by a nonexistent `workspaceId` column | `server/src/routes/admin.ts:59-70` |
| **PERF-0** — no realistic dataset or measurement tooling | `scripts/measure.ts` exists with recorded baseline numbers | `scripts/measure.ts` |
| **PERF-1** — opening a workspace issued 1+2×N HTTP requests | `GET /api/workspaces/:workspaceId/tree` batches collections+folders+requests in one call; `FolderRepository.findByCollections` and `RequestRepository.findByCollections` (with a `summaryOnly` projection) now exist; the client calls this endpoint | `server/src/routes/collections.ts:78`, `server/src/repositories/{Folder,Request}Repository.ts`, `client/src/store/collectionStore.ts:176` |
| **SOCK-1** — socket events triggered a full tree refetch | `SocketSync.tsx` now applies deltas via `applyCollectionUpserted/Deleted`, `applyFolderUpserted/Deleted`, `applyRequestUpserted/Deleted`, `applyWorkspaceReordered`, `applyEnvironmentUpserted/Deleted` for all structural events; refetch is reserved for reconnect and the `collection:fork-synced` event; the `request:updated` last-write-wins conflict handling is preserved | `client/src/components/common/SocketSync.tsx` |
| **SOCK-2** — no event-level test coverage | `tests/socket-events.spec.ts` and `tests/e2e/socket-events.spec.ts` connect via `socket.io-client` directly and assert on all 13 named events | `tests/socket-events.spec.ts`, `tests/e2e/socket-events.spec.ts` |
| **SOCK-3** — two replicas, no shared adapter, ~half of events lost | `@socket.io/redis-adapter` + `ioredis` wired in `server/src/index.ts`, gated on `REDIS_URL` | `server/src/index.ts:5,6,66-67` |
| **SOCK-4** — two DB reads per socket join, no room cap, no re-verification | `roleCache` (TTL cache) used on join, `socket.data.userId` set explicitly, `MAX_ROOMS = 50` cap, a periodic token re-check (`tokenInterval`) that disconnects on failure | `server/src/index.ts:90-118` |
| **TEST-1** — Playwright never ran in CI | `.github/workflows/test.yml` now runs `playwright test --project=${{ matrix.db }}` plus a dedicated `extension` project on sqlite | `.github/workflows/test.yml` |
| **TEST-2** — no per-backend matrix, 11 specs hardcoded `localhost:5173` | CI runs a Playwright project per `DB_TYPE`; the hardcodes are gone (one stray *comment*, not a live `page.goto`, remains in `tests/e2e/share.spec.ts:69` — cosmetic only) | `.github/workflows/test.yml`, `tests/e2e/share.spec.ts` |
| **TEST-4** — no table-driven API-authorization matrix | `tests/e2e/api-authorization.spec.ts` exists | `tests/e2e/api-authorization.spec.ts` |
| **TEST-5** — no client unit tests, no test runner | `vitest` wired in `client/package.json` (`"test": "vitest run"`) | `client/package.json` |
| **UI-1** — 22 native `prompt`/`confirm`/`alert` sites | `grep -rn "window.prompt\|window.confirm\|[^.]\balert(" client/src` returns nothing | — |
| **UI-2** — no shared feedback surface | `client/src/store/toastStore.ts` exists | `client/src/store/toastStore.ts` |
| **UI-3** — 403 responses were silently swallowed | `client/src/api/axios.ts:15` handles 403 distinctly from 401; the inner `AuthGuard requireSuperAdmin` on `/admin` was **not** removed | `client/src/api/axios.ts` |
| **UI-5** — 21 inline `style={{` blocks in `App.tsx` | `grep -c "style={{" client/src/App.tsx` returns 0 | — |
| **UI-6** — stale copy (import "overwrites config"; mentions of deleted "capture" feature) | Both strings gone from `client/src/pages/AdminPage.tsx` | — |
| **CLEAN** — inconsistent product naming (`postman_clone`, `com.reqspaceclone.app`, etc.) | Everything now consistently `reqspace` (`appId: com.reqspace.app`, `DB_NAME` default `reqspace`, data dir `reqspace`) | `package.json`, `server/src/db/dbConfig.ts` |
| **CLEAN** — dead dependencies (`multer`, `archiver`, `postman-collection`, `http-proxy-middleware`, `ajv`, plus their `@types`) | All gone from `server/package.json` | `server/package.json` |
| **CLEAN** — stale "capture" copy in `ssrf.ts` and `AdminPage.tsx` | Both strings gone | `server/src/utils/ssrf.ts`, `client/src/pages/AdminPage.tsx` |
| **CLEAN** — stale doc references to `TESTING.md`/`CODE_REVIEW.md` | Gone from `scripts/smoke-core.sh` and `server/src/tests/ssrf.test.ts` | — |
| **CLEAN** — `IGNORE.md` pointed at deleted files (`AuditLog.ts`, `routes/capture.ts`, `CaptureTrafficModal.tsx`) | No longer referenced in `IGNORE.md` | `IGNORE.md` |

## Working-tree state note (2026-09-25) — now moot

The previous revision flagged four uncommitted files from a parallel session (`auth.ts` and three
`tests/e2e/*.spec.ts` files). Current `git status` no longer shows those files as modified — they were
committed since. No action needed.
