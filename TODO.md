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
   bottom, except where a task's own text says otherwise (e.g. SEC-0's execution order across its
   subtasks). SEC-10 and PERF-0, which used to carry ordering exceptions here, have both shipped — see
   Shipped.
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
| Browser e2e (Playwright, 25 spec files) | `tests/e2e/*.spec.ts` | ✅ (TEST-1 shipped) |
| Core smoke (bash + curl) | `scripts/smoke-core.sh` | ✅ |

CI is `.github/workflows/test.yml`: build server → build client → boot a real sqlite-backed
`node server/dist/index.js` on port 3005 → jest → smoke script. The live server matters:
`server/src/tests/auth.e2e.test.ts` makes real HTTP calls to `localhost:3005` and fails in isolation
without it. That is expected, not a regression.

---

# SEC — Security

## SEC-0 — Delete the server-side proxy entirely

* **Status: APPROVED, in progress.** The prior deferral is lifted — the owner asked for this to be built.
  Real progress already exists in the code (see per-subtask status below): the client transport module is
  built and 3 of 5 callers are migrated, and the Chrome extension has a skeleton. What's actually left is
  enumerated in the execution order.
* **Size:** L (down from XL) — SEC-0.6, and the self-registration bug and Zod-validation task that used to
  sit next to this section, are all shipped; see [Shipped (2026-09-26, audit pass 2)](#shipped-2026-09-26-audit-pass-2).
* **Execution order (do not reshuffle without a reason):**
  1. **SEC-0.0** — decision already made below (Electron + Chrome extension). Read-only context.
  2. **SEC-0.1** — inventory, already done. Just confirms scope.
  3. **SEC-0.2** — 3 of 5 callers already migrated to the transport module. Finish the remaining 2.
  4. **SEC-0.3** — move history writing to a client-driven endpoint. Still fully open.
  5. **SEC-0.4** — delete the old proxy routes and dead dependencies. Do this **last**, only once nothing
     calls them any more, or you delete a route still in use.
  6. **SEC-0.7** — the Chrome extension transport. Skeleton exists; finish hardening it.
* Each subtask below already has its own **Goal / Verified state / Change / Done when** — follow those, not
  a paraphrase of them.

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

Done — this is the verified output of (re-confirmed 2026-09-26; line numbers drift as the files change, the
call sites and verdicts don't):
`grep -rn "undiciFetch\|await fetch(\|ProxyAgent\|createSafeLookup\|assertSsrfSafe\|soap\." server/src`:

| Call site | Verdict | Reason |
|---|---|---|
| `routes/proxy.ts:7,77,85,123` | **move** | This *is* the user proxy |
| `routes/shareProxy.ts:5,55,56,77,84,88` | **move, then delete** | Anonymous user proxy |
| `routes/importExport.ts:12,137,139` (`soap.createClientAsync`) | **move** | Fetches a user-supplied WSDL URL |
| `routes/auth.ts:237,253` (Google token + userinfo) | **keep** | Server-to-Google, fixed hosts, server's own credentials |

Two rows from an older revision were wrong and are gone: `routes/capture.ts:140` (the file is deleted)
and "`routes/admin.ts` SMTP send", which never existed —
`grep -rn "nodemailer\|createTransport\|sendMail" server/src` returns nothing. The `SystemConfig.auth.smtp`
**config fields** exist, but nothing sends mail.

### SEC-0.2 — Build the client transport abstraction

* **Status:** mostly done, 2026-09-26. `client/src/transport/` already exists —
  `types.ts`, `index.ts`, `electron.ts`, `extension.ts`, `browser.ts` — with a working
  `getTransport()`/`sendRequest()`.
* **Goal:** one module decides *how* a request goes out, so no UI component knows or cares.
* **Already migrated:** `CollectionRunnerModal.tsx:103`, `scripts.ts:5,99`, `SharedCollectionPage.tsx:23`.
* **Still on the old path** — `grep -rn "api.post('/proxy'" client/src` returns exactly these 2:
  `client/src/components/request/UrlBar.tsx:263`,
  `client/src/components/request/LoadTestModal.tsx:57`.
* **Done when:** `grep -rn "api.post('/proxy'" client/src` returns nothing and a Playwright test sends a
  request through the abstraction with the transport stubbed.

### SEC-0.3 — Move history writing to a client-driven, server-validated endpoint

* **Status:** still fully open.
* **Goal:** history still works once the server never sees the response.
* **Where:** `server/src/routes/proxy.ts` around lines 140-160 (`shouldSaveHistory` at `:140`,
  `saveHistoryEntry(...)` at `:153-154`) writes history today from data only the server had.
* **Note:** the response-size cap (FEAT-9) applies here — the endpoint must never accept a 200 MB body.
* **Done when:** API tests prove a viewer can write their own history, a non-member gets 403, and an
  oversized body is rejected rather than truncated after the fact.

### SEC-0.4 — Delete the routes and everything that existed only for them

* **Status:** still fully open — `grep -rn "api/proxy\|shareProxy\|assertSsrfSafe\|createSafeLookup"
  server/src client/src` still returns many hits (proxy.ts, shareProxy.ts, ssrf.ts, and the mounts in
  `index.ts`).
* **Done when:** that grep returns nothing, and `undici` + `http-proxy-middleware` come out of
  `server/package.json`. (`undici` has **5** live usages today, not 3 — `proxy.ts:85,123` and
  `shareProxy.ts:55,77,88` — and is the one dead-looking dependency that must **not** be dropped before this
  lands — see CLEAN.)

### SEC-0.5 — ~~Decide the fate of traffic capture~~ — **removed, moot**

`server/src/routes/capture.ts` and `client/src/components/layout/CaptureTrafficModal.tsx` were both deleted
in commit `36b3331`. The stale copy this used to leave behind (`ssrf.ts`, `AdminPage.tsx` mentioning
"capture") is also fixed now — see Shipped. Nothing left to do here at all.

### SEC-0.7 — Build the Chrome extension transport

* **Status:** partially built — do not treat as greenfield. `extension/` now exists at the repo root
  (`background.js`, `content.js`, `manifest.json`, `options.html`, `options.js`) plus
  `tests/e2e/extension.spec.ts`. The manifest is MV3 with a background service worker, a content script, and
  `declarativeNetRequest`/`declarativeNetRequestWithHostAccess` permissions — **0.7.1 and 0.7.2 look done.**
* **Confirmed still open — 0.7.5:** `manifest.json` has `host_permissions: ["<all_urls>"]`, exactly the
  over-broad grant this subtask exists to remove.
* **Not verified either way, check before continuing:** 0.7.3 (header restoration), 0.7.4 (cookie policy),
  0.7.6 (app-side integration/install prompt), 0.7.7 (a spec file existing is not the same as a CI project
  that runs it and passes).
* Subtasks: **0.7.1** MV3 manifest and skeleton · **0.7.2** the request bridge · **0.7.3** restore the
  headers Chrome strips (`Origin`, `Referer`, `Cookie`, `Host`, `User-Agent`) via `declarativeNetRequest` ·
  **0.7.4** cookie policy — default `credentials: 'omit'`, because attaching ambient cookies silently turns
  every request into a potential CSRF · **0.7.5** harden the extension (origin allowlist, no `<all_urls>`
  beyond what is needed) · **0.7.6** app-side integration and install prompt · **0.7.7** build, test and
  ship, with a CI Playwright project that runs the core send flow through the extension.
* Read `IGNORE.md`'s "browser-extension traffic interceptor" row before starting: that declined feature is
  **not** this one, and the distinction is the permission surface.

---

# FIX — Broken in place

Numbering note: FIX-2, FIX-3, FIX-4 and FIX-5 are absent because they shipped. See
[Removed](#removed-on-2026-09-25). Their numbers are not reused, so old commit messages stay meaningful.

## FIX-6 — Admin user row test id doesn't match the account's login identifier

* **Status:** verified real · **Size:** XS
* **Goal:** the Admin Dashboard's user-row test id is a stable identifier, not the mutable display name.
* **Verified state:** `client/src/pages/AdminPage.tsx:132` — `data-testid={`user-row-${u.name}`}`. The seeded
  superadmin's `name` is `'Admin'` (capital A, set at bootstrap in `server/src/index.ts`), so the rendered
  id is `user-row-Admin`. `tests/e2e/admin.spec.ts:32` asserts `getByTestId('user-row-admin')` (lowercase)
  and never finds it — found while getting the Playwright suite running for TEST-1.
* **Why:** `name` is a free-text display field a user can change (or duplicate with another user), so it's
  the wrong thing to build a test id from regardless of the casing mismatch; two users named the same thing
  collide on the same test id today.
* **Change:** `data-testid={`user-row-${u._id}`}` (or the email, which is unique and stable), and update
  `admin.spec.ts:32` to match.
* **Done when:** `admin.spec.ts`'s "Admin login and dashboard" test passes.

## FIX-7 — Monaco's background worker fails to load (broken independently of CSP)

* **Status:** verified real · **Size:** S
* **Goal:** Monaco's editor worker (syntax highlighting, validation, language features) actually starts.
* **Verified state:** `client/src/main.tsx:8` — `loader.config({ monaco })` bundles Monaco's core locally
  (real, this part of PERF-7/SEC-10's "blocker 2" is done — `monaco-editor` is a genuine dependency and the
  client build emits its per-language chunks), but nothing sets `self.MonacoEnvironment.getWorker` /
  `getWorkerUrl`. Reproduced live: open the body editor (`monaco-editor-container`) in a built, served
  (production-mode) client and the console shows `Failed to resolve module specifier
  "../../../base/common/worker/webWorkerBootstrap.js". Invalid relative url or base scheme isn't
  hierarchical.` — Monaco's default worker bootstrap tries to `import()` a relative module from inside a
  `data:` URL, which has no base to resolve against. **Confirmed independent of CSP**: identical error with
  `contentSecurityPolicy: false`. Do not spend SEC-10 effort on this — it is not a CSP problem, and adding
  `data:` to `worker-src`/`child-src` (tried, then reverted) does not fix it.
* **Why:** without its worker, Monaco falls back to (or simply lacks) syntax highlighting, diagnostics and
  language features in `BodyEditor.tsx`, `ScriptEditor.tsx` and `ResponseViewer.tsx` — it degrades to a
  plain textarea with Monaco's styling, silently, with no error surfaced to the user.
* **Change:** configure `self.MonacoEnvironment` in `main.tsx` (or a Vite plugin like
  `vite-plugin-monaco-editor`) to serve real bundled worker files via `new Worker(new URL(...), {type:
  'module'})` per language (json/typescript/css/html + the default editor worker), instead of relying on
  Monaco's AMD-style default bootstrap.
* **Done when:** the same reproduction (open the body editor, watch the console) shows no worker-load error,
  and a test asserts Monaco's language service actually responds (e.g. a JSON syntax error is underlined).

## FIX-8 — User search returns nothing for any email containing `_`, on SQLite

* **Status:** verified real · **Size:** S
* **Goal:** `GET /api/users/search` matches on SQLite the same way it does on Postgres/MySQL.
* **Verified state:** `server/src/utils/escapeLike.ts` escapes `_`/`%` as `\_`/`\%` for a Sequelize `Op.like`
  (`UserRepository.search`, `server/src/repositories/UserRepository.ts:120-134`). Postgres and MySQL both
  default `LIKE`'s escape character to `\`, so this works there. **SQLite has no default `LIKE` escape
  character at all** — without an explicit `ESCAPE '\'` clause (which Sequelize's `Op.like` never adds),
  SQLite reads `\_` as two literal characters, a backslash then a wildcard `_`, not an escaped literal
  underscore. Reproduced directly against a live sqlite-backed server: `?q=viewer` (name match, no
  underscore) → 1 result; `?q=viewer_` (a valid literal prefix of a real user's email) → `[]`. Found
  independently twice — once verifying UI-3, once by the UI-1 migration subagent hitting it via
  `user-autocomplete-input` in `conflict.spec.ts`/`rbac.spec.ts`/`socket-advanced.spec.ts`/`socket-sync.spec.ts`.
* **Why:** almost every email contains `_` or is likely to. On the default database backend, workspace
  member invite search, and anything else built on `UserRepository.search`, silently returns nothing for
  most real inputs.
* **Change:** add the dialect-appropriate `ESCAPE` clause. Sequelize doesn't expose this via `Op.like`
  directly — either drop to `sequelize.literal`/a raw `WHERE ... LIKE ? ESCAPE '\'` for the sqlite/postgres/
  mysql path (keep `escapeLike`'s existing mssql bracket-form branch as is, it doesn't use backslash), or
  find whichever Sequelize option surfaces the escape clause per dialect.
* **Done when:** `UserRepository.search('someone_with_underscore')` finds an exact match on all three
  supported SQL backends, not just Postgres/MySQL.

## FIX-9 — Switching workspaces can silently show the wrong (or no) collections

* **Status:** verified real, still open as of 2026-09-26 (re-checked after the SOCK-1 commit touched this
  file — SOCK-1 added a local-first Dexie read as a new first step, it did not add any concurrency guard).
* **Goal:** the collection tree shown always corresponds to the currently-selected workspace.
* **Verified state:** `client/src/store/collectionStore.ts`'s `fetchCollectionsData` (now ~lines 153-199)
  still does `set({ collections: serverCols })` (line ~173) and later `set({ folders: allFolders, requests:
  allRequests })` (line ~190) unconditionally, with no check that `workspaceId` still matches the
  currently-active workspace and no request cancellation. In dev (`<StrictMode>`) this effect runs twice per
  change, and on a workspace switch there is a brief window where a fetch for the *previous* workspace is
  still in flight alongside the new one — whichever response resolves last wins, regardless of which
  workspace it was for. Reproduced directly: logged the actual network responses during a real
  invite-then-switch flow — a fetch for the *old* workspace (correctly empty) sometimes resolves after the
  fetch for the newly-selected one (correctly populated), and the tree is left showing "No collections yet"
  for a workspace that has one.
* **Why:** a real user switching workspaces in quick succession (or right after being invited to one) can
  see a wrong, silently-stale collection tree with no indication anything is wrong.
* **Change:** guard the `set()` calls in `fetchCollectionsData` on the active workspace id. Note
  `collectionStore.ts` does not itself track `activeWorkspaceId` (that lives in `useAuthStore`), so the fix
  needs to either thread the target workspace id through the call and compare against the store at
  `useAuthStore.getState()` at the time the response lands, or use an AbortController per call and cancel the
  previous one on a new call.
* **Done when:** a test switches workspaces twice in quick succession and asserts the tree always matches
  the *last* selection, never an intermediate one.

## FIX-10 — Renaming a workspace right after creating it can silently revert the name

* **Status:** verified real (found by a subagent while migrating tests/e2e off native dialogs) · **Size:** S
* **Verified state:** `client/src/components/workspace/WorkspaceSettingsModal.tsx`'s mount `useEffect` GETs
  the workspace and calls `setName(res.data.name)` after the modal opens. If a test (or a fast user) types a
  new name into the name field before that GET resolves, the GET's `setName` fires afterward and stomps the
  typed value back to the original — the ensuing Save then saves the *old* name. Reproduced deterministically
  in both `workspace.spec.ts` and `crud-rename.spec.ts` (both rename a workspace immediately after creating
  it): the workspace stays unrenamed after Save + Close.
* **Why:** a real user who edits the name field quickly after opening workspace settings can have their edit
  silently discarded.
* **Change:** only apply the GET's `setName` if the field hasn't been touched yet (e.g. track a `dirty`
  flag, or skip the GET's own `setName` once the user's input differs from the initial value), or fetch
  before rendering the field instead of after.
* **Done when:** a test types a new workspace name immediately (no artificial wait) after opening settings,
  saves, and asserts the new name persisted.

## FIX-11 — Saving an edited request can 400 on the request's own save payload

* **Status:** verified real (found by a subagent while migrating tests/e2e off native dialogs) · **Size:** M
* **Verified state:** `UrlBar.tsx`'s `handleSaveClick` sends the in-memory `activeRequest` object straight to
  `PUT /requests/:id`. That object carries client-only fields (`_id`, `collectionId`, `tabId`, `isDirty`,
  …) alongside the real update. Reproduced directly: the server responds `400 {"message":"Invalid request
  body","issues":[...\"Unrecognized key(s)…'_id','collectionId','tabId','isDirty'\"]}` — the `.strict()` Zod
  schema (SEC-9) rejects them. This blocks the conflict-resolution scenario in `conflict.spec.ts`,
  `socket-sync.spec.ts` and `socket-advanced.spec.ts` from ever reaching the point of producing a real
  conflict, since the *first* save in the scenario already 400s.
* **Why:** this isn't just a test problem — it means saving an edited request from the UI can fail outright
  depending on which fields happen to be present on `activeRequest` client-side, most likely intermittently
  as the client state shape evolves.
* **Change:** build the `PUT /requests/:id` payload as an explicit allowlist of writable fields (matching
  the pattern already used elsewhere, e.g. `routes/requests.ts`'s own handlers), not a spread of the whole
  client-side request object.
* **Done when:** saving an edited request whose in-memory object carries `_id`/`collectionId`/`tabId`/
  `isDirty` succeeds, and a test asserts the exact payload sent has none of the client-only fields.

## FIX-12 — Creating a request inside a folder doesn't refresh the sidebar tree

* **Status:** verified real, but the root cause has moved since this was first written — **re-diagnosed
  2026-09-26, read this before touching the store.**
* **Verified state:** the store-side half of the original bug is already fixed: `createRequest`
  (`collectionStore.ts:326-335`) does call `get().applyRequestUpserted(res.data)`, so the new request is
  present in the `requests` array right after a folder-scoped create. The symptom persists for a different
  reason: in `CollectionExplorer.tsx`, `FolderNode` keeps its own local `isOpen` state (line ~268), and
  children only render under `{isOpen && (...)}`  (line ~378). The folder's "New Request" action-menu handler
  (line ~320, `createRequest(collectionId, name, folder._id)`) never calls `setIsOpen(true)` — only the
  drag-and-drop handlers do (lines ~300, ~303). So the request exists in state but the folder stays visually
  collapsed. Confirmed against `tests/e2e/scripts-scope.spec.ts:61-69`, which creates "Scope Request" via
  `action-menu-new-request` without expanding the folder first, then expects `node-Scope Request` visible —
  this still fails today.
* **Why:** a real user creating a request inside a collapsed folder sees nothing happen and has no reason to
  suspect the create actually succeeded.
* **Change:** in the folder's "new request" (and "new folder") action-menu handler in `CollectionExplorer.tsx`,
  call `setIsOpen(true)` on the `FolderNode` the same way the drag-and-drop handlers already do — do **not**
  touch `collectionStore.ts`'s request-creation logic, it's not the bug.
* **Done when:** `scripts-scope.spec.ts`'s folder-scoped request creation passes without manually expanding
  the folder first.

## FIX-13 — Deleting a folder only cascades one level server-side

* **Status:** verified real (found while designing SOCK-1's `applyFolderDeleted` reducer) · **Size:** S
* **Verified state:** the delete-folder route removes the folder's own direct child folders and direct
  child requests, but does not recurse into a grandchild sub-folder's own children — a folder nested two or
  more levels deep survives the delete of its grandparent, orphaned (no longer reachable from any tree
  fetch by `collectionId`+`folderId`, but still present in the DB with its old `parentFolderId` pointing at
  a folder that no longer exists).
* **Why:** silent orphaned rows accumulate on every nested-folder delete; they never surface in the UI (the
  tree can't reach them) but stay in the DB forever, and a future feature that lists "all folders in a
  collection" regardless of nesting would show ghosts.
* **Change:** make the delete cascade recursive (walk `parentFolderId` transitively, or add an
  `ON DELETE CASCADE`/recursive CTE at the DB layer) so deleting a folder removes every descendant folder
  and request, not just direct children.
* **Traps:** SOCK-1's client-side `applyFolderDeleted` reducer (`collectionStore.ts`) currently mirrors this
  same one-level-only behavior deliberately, to stay consistent with what the server actually does. Fixing
  this server-side needs a matching client fix (make `applyFolderDeleted` filter transitively too), or the
  two will disagree once this is fixed.
* **Done when:** deleting a folder three levels deep removes every descendant folder/request, verified by
  querying the DB directly (not just checking the UI tree, which already hides orphans either way).

## FIX-14 — A collection/request that arrives via socket while collapsed stays invisible

* **Status:** verified real (found while regression-checking SOCK-1 against `socket-sync.spec.ts`) · **Size:** S
* **Verified state:** `openCollectionIds` (`client/src/store/collectionStore.ts`) is a client-only `Set`
  that starts empty and is only ever added to by the local user clicking to expand a collection
  (`toggleCollectionOpen`/`openCollection`). `CollectionExplorer.tsx:986` renders a collection's children
  only when `openCollectionIds.has(collection._id)` (or a search filter is active). When another user
  creates a brand-new collection, it arrives via `collection:created` and renders as a row, but its id was
  never added to `openCollectionIds` for any *other* viewer — the row stays collapsed and nothing inside it
  (folders, requests) is ever visible until someone manually clicks to expand it. This reproduces
  identically whether the tree was populated by a full refetch or an incrementally-applied socket event —
  confirmed by checking that `fetchCollectionsData` never touches `openCollectionIds` either, so SOCK-1 did
  not introduce this.
* **Why:** defeats the point of realtime sync for exactly the case it matters most — a collaborator
  creating something new is the one piece of state guaranteed to be collapsed for everyone else, so nobody
  sees it without knowing to go click around.
* **Change:** when `applyCollectionUpserted` (or the folder equivalent) receives an entity whose id is not
  yet in `openCollectionIds`/known to the viewer, add it to `openCollectionIds` so a genuinely new node
  auto-expands. Needs care to only do this for *creates*, not every update (an update to a collection the
  viewer deliberately collapsed should stay collapsed).
* **Traps:** `tests/e2e/socket-sync.spec.ts`'s "User B opens the request" step asserts
  `getByTestId('node-Shared Request')` is visible without ever expanding "Shared Collection" — that
  assertion cannot pass until this is fixed (it is also independently blocked by FIX-8's email-search bug
  earlier in the same test). Fixing FIX-8 alone is not enough to make that test pass.
* **Done when:** a two-client test has user A create a brand-new collection (not previously known to B) and
  asserts B sees its children (a request inside it) without manually clicking to expand.

# PERF — Efficiency at 10k workspaces / 100k collections / 100k requests

Every item below is a measured defect at the target scale. Each task must report a number: queries issued,
rows touched, bytes transferred, milliseconds.

## PERF-1 — Opening a workspace issues 1 + 2×N HTTP requests

* **Status:** verified real, half-built and unused · **Size:** M · **The single worst performance defect in
  the product.**
* **Verified state:** `client/src/store/collectionStore.ts`'s `fetchCollectionsData` still fetches the
  collection list, then runs a `Promise.all` over every collection issuing **two** requests each —
  `api.get('/collections/:id/folders')` and `/requests`. A workspace with 200 collections therefore still
  fires **401 HTTP requests** on open. **Someone already started the fix but didn't finish or wire it up:**
  `GET /workspaces/:workspaceId/tree` now exists at `server/src/routes/collections.ts:62-70` — but it's a
  half-fix, not the real batched endpoint this task asks for: it does
  `Promise.all(ids.map(id => FolderRepository.findByCollection(id)))`, i.e. still one query **per collection
  id**, just moved server-side instead of eliminated. `FolderRepository.findByCollections(ids)` /
  `RequestRepository.findByCollections(ids)` (plural, real batched `Op.in` queries) still do not exist.
  Worse: `grep -rn "/tree" client/src` returns nothing — **nothing calls this route**. It's dead code sitting
  next to the bug it was meant to fix.
* **Change — part 1:** write the real batched `findByCollections(ids)` on both `FolderRepository` and
  `RequestRepository` (with an empty-array guard before the `Op.in`), have the existing `/tree` route use
  them instead of its per-id loop, and — the actually-missing step — point the client at it:

  ```ts
  // client/src/store/collectionStore.ts, replacing the Promise.all loop
  const res = await api.get(`/workspaces/${workspaceId}/tree`);
  ```

* **Change — part 2:** PERF-2. Part 1 alone still ships the whole tree; it is a bridge, not the destination.
* **Done when:** `measure.ts` shows opening a workspace with 200 collections issuing **1** HTTP request and
  **≤ 3** DB queries — today it's still 401 requests, unchanged, because the client never calls the endpoint
  that already exists for this.

---

## PERF-2 — Lazy-load the tree

* **Status:** verified real · **Size:** L · Do PERF-1 part 1 first.
* **Goal:** opening a workspace fetches collections only; children load on expand.
* **Verified state:** `client/src/store/collectionStore.ts:36-37` holds flat `folders: Folder[]` and
  `requests: ApiRequest[]` arrays rather than per-node maps. `openCollectionIds` already exists (`:38`,
  `:78`), so expansion state is in the right place already.
* **Change:** move to `foldersByCollection` / `requestsByFolder` maps whose values are
  `Folder[] | 'loading' | undefined`, with `loadWorkspace` (collections page only),
  `loadCollectionChildren` (once per collection, guarded on the `'loading'` state) and
  `loadFolderChildren`. Show a skeleton row while `'loading'`. Keep the Dexie offline cache
  (`collectionStore.ts:101-113`) but make it per-node and treat it as a **hint** — paint from cache, then
  reconcile with the server. Delete `fetchCollectionsData` once nothing references it.
* **Traps:** SOCK-1's reducers write into these same structures. Design the shape once, with both tasks in
  mind, or you will rewrite it twice.
* **Done when:** with the PERF-0 dataset, opening a workspace with 500 collections issues one request and
  transfers under 100 KB, and expanding one collection issues exactly one more.

---

## PERF-3 — Paginate everything that returns a list

* **Status:** verified real, scaffolding exists but nothing uses it · **Size:** L
* **Verified state:**
  * `server/src/routes/collections.ts:60` (collections), `:108` (folders), `:154` (requests) take **no**
    pagination parameters at all.
  * `server/src/routes/history.ts:14-32` is the only real pagination, and it is offset-based
    (`:26 offset: (+page-1)*+limit`) with **no server-side cap** — `?limit=999999` is honoured — plus a
    `COUNT(*)` on every page (`:30`).
  * `server/src/routes/admin.ts:12-25` is **fake** pagination: `UserRepository.list()` loads every row, then
    the response reports `{ total: users.length, page: 1, limit: 50 }`.
  * **New since last pass:** `server/src/utils/pagination.ts` (`decodeCursor`/`encodeCursor`/`getCursorWhere`)
    now exists — someone built the cursor helpers this task asks for — but `history.ts` only imports it
    (line 1) and never calls it. It's unused scaffolding, not a partial fix; wire it in rather than writing
    a second implementation.
* **Why offsets are not enough:** `skip((page-1)*limit)` on page 500 makes the database walk 25,000 rows it
  then discards.
* **Change:** cursor pagination everywhere. Cursor = the last item's sort key, base64url-encoded; for tree
  nodes `(order, id)`. Fetch `limit + 1` to know whether a next page exists without a `COUNT`. Response
  shape everywhere: `{ items, nextCursor }`. Cap `limit` server-side at 200 regardless of what the client
  asks for.

  ```ts
  const where = cursor
    ? { collectionId, [Op.or]: [{ order: { [Op.gt]: o } }, { order: o, id: { [Op.gt]: id } }] }
    : { collectionId };
  const items = await SqlRequest.findAll({ where, order: [['order','ASC'], ['id','ASC']], limit: limit + 1 });
  ```

* **Traps:**
  1. The previous revision specified the history cursor as `(executedAt, _id)` and an index on
     `executedAt`. **That column does not exist** — the model and route use `createdAt` (see FIX-4). Use
     `(createdAt, id)`.
  2. The compound indexes for tree nodes already shipped in migration `001-indexes.ts`
     (`idx_requests_collection_folder_order`, `idx_collections_workspace_order`). The history one did
     **not**: `idx_history_user_workspace` is `(userId, workspaceId)` only. A `(userId, workspaceId,
     createdAt)` index is part of this task — add it as a new migration, never by editing `001`.
* **Done when:** `measure.ts` shows every list endpoint answering in constant time at 100k rows, and no
  response carries more than 200 items.

---

## PERF-4 — Kill the N+1 queries

* **Status:** verified real — all seven sites confirmed · **Size:** L · Fix with a batched query, never a
  loop.

| # | Where (verified) | What it does now | Fix |
|---|---|---|---|
| 1 | `routes/collections.ts:266-300` `PUT /reorder` | Sequential `for` loop calling `resolveWorkspaceId` **per item** (1-2 reads each), then `Promise.all` of N updates. **No cap on `items.length`.** | One query to load all items, one bulk write, and a length cap |
| 2 | `routes/collections.ts:40-54` `checkPermission` → `resolveWorkspaceId:17-32` | 2 sequential reads on every mutating call for a folder or request | Denormalise `workspaceId` onto folders and requests, or cache (PERF-5) |
| 3 | `routes/history.ts:159-165` GC loop | `while` loop doing `findOne(order ASC)` + `destroy` one row at a time | One ranged delete with a computed cutoff |
| 4 | `routes/history.ts:77-80` workspace clear | `findAll` loads **every** matching row into memory to `reduce` byte sums, then deletes | Aggregate the sum in the database |
| 5 | `routes/admin.ts:12-24` user list | Full table load, then `users.length` as the "total" | Cursor paging (PERF-3) |
| 6 | `middleware/rbac.ts:18` | `WorkspaceRepository.findById` loads the whole workspace **including the full `members` array** to read one role | Project the matching member only, or cache (PERF-5) |
| 7 | `repositories/RequestRepository.ts:101` `searchInWorkspace` | Takes `collectionIds: string[]` → at 100k collections that is a 100k-element `Op.in` | Denormalised `workspaceId`, or search per page of collections — **but see SEC-6: this method is dead code.** Decide whether to delete it instead |

* **Traps:**
  1. The previous revision's reorder snippet used a `CASE` expression with double-quoted `"order"`. That is
     Postgres/sqlite syntax and **fails on MySQL**, which needs backticks — and `DB_TYPE` supports both.
     Use `bulkCreate(rows, { updateOnDuplicate: ['order'] })`, or switch the quoting on the dialect. Note
     `order` is a reserved word in every dialect, so it always needs quoting of some form.
  2. Item 5's description in the previous revision mentioned a `countDocuments` call. There isn't one — the
     defect is a full table load, which is worse.
* **Done when:** `measure.ts` reports a reorder of 500 items in ≤ 3 queries (from ~1,500), and no endpoint
  above issues a query per row.

---

## PERF-5 — Cache RBAC and system config

* **Status:** verified real — **the cache got built but never plugged in.** · **Size:** S now (down from M —
  the hard part is already done).
* **Verified state:** `server/src/utils/cache.ts` **now exists** (`TtlCache` + a `roleCache` instance, 30s
  TTL) — this task's original "does not exist" claim is stale. But it's dead weight today:
  `server/src/middleware/auth.ts:91` still calls `SystemConfigRepository.getConfig()` unconditionally on
  every authenticated request. `server/src/middleware/rbac.ts:18` still loads the full workspace row
  (including the whole `members` array) per permission check, uncached. `roleCache` is imported in
  `server/src/index.ts:88` but never called anywhere — a dead import.
* **Change:** wrap `SystemConfigRepository.getConfig()` in `auth.ts` with the existing cache, and wrap the
  (user, workspace) role lookup in `rbac.ts` with the existing `roleCache` — SOCK-4 needs this exact same
  role cache for its own `join:workspace` handler, do both call sites in one pass.
* **Done when:** `measure.ts` shows one `SystemConfig` read per 30 s under sustained load instead of one
  per request, and an admin config save takes effect immediately (proving invalidation works).

---

## PERF-7 — Client bundle weight

* **Status:** verified real — **except the Monaco claim, which was backwards** · **Size:** M
* **Verified state:** `client/package.json` ships **both** `moment ^2.30.1` (imported in 2 files) and
  `date-fns ^4.4.0`; `lodash ^4.18.1` is whole-imported (only 1 site now, `client/src/sandbox/worker.ts:2` —
  down from 2, but still whole-imported rather than per-function); `chai ^6.2.2` and `crypto-js ^4.2.0`
  are runtime dependencies. `@types/chai`, `@types/js-yaml` and `@types/uuid` sit in `dependencies` rather
  than `devDependencies`. **Re-measured 2026-09-26:** `npm run build --prefix client` now emits a single
  **4.75 MB** JS chunk (**1.23 MB gzipped**) — substantially bigger than the ~985 KB/289 KB this section
  previously cited, confirming bundle weight has only gotten worse since. The build also warns
  `[INEFFECTIVE_DYNAMIC_IMPORT]` for `toastStore.ts`, `axios.ts`, `environmentStore.ts` and `dialog.tsx` —
  each is both statically and dynamically imported somewhere, so code-splitting buys nothing for them; worth
  fixing alongside the lazy-loading work below since it's the same root cause (inconsistent import style).
* **Correction (2026-09-26):** both the original claim and this section's own prior correction are now
  stale. `monaco-editor` **is** a bundled dependency (`client/src/main.tsx:3-8`,
  `client/package.json:31`) — someone bundled it since this note was written, and SEC-10 (verified done)
  confirms it. The client build already emits its per-language chunks (`tsMode-*.js`, `jsonMode-*.js`,
  `pgsql-*.js`, …), so the "substantially bigger bundle" this section warned about sequencing after SEC-10
  is already the current, measured baseline — set the budget from what the build emits today, not from an
  assumption that Monaco is still to be added. Separately, its worker doesn't actually load correctly
  (FIX-7) — irrelevant to bundle size, but don't be surprised the feature is half-broken while sizing it.
* **Change:** drop `moment` in favour of `date-fns` (or the reverse — pick one), import `lodash` per
  function or replace the few uses outright, move the `@types/*` packages to `devDependencies`, lazy-load
  the editors and the runner modal, and set a CI budget on the initial chunk.
* **Done when:** the initial chunk is under the agreed budget with Monaco bundled, and CI fails on a
  regression.

---

# SOCK — Realtime

## SOCK-2 — Cover every emit site with a two-client test

* **Status:** verified real — **and the previous revision's coverage table was false** · **Size:** M
* **Goal:** every `emitToWorkspace` call site has a test where the *observer* is the assertion subject.
* **Verified state:** `grep -rn "socket.io-client" tests/` still returns nothing — no test connects a raw
  socket client directly; every existing realtime test still goes through a second browser context. What
  exists is now **three** two-context UI tests, not two: `tests/e2e/socket-sync.spec.ts` (conflict-on-edit),
  `tests/e2e/socket-advanced.spec.ts` (folder rename + globals), and a new
  `tests/e2e/sock1-no-refetch.spec.ts` added alongside the SOCK-1 commit. None of the 13 event names has a
  test asserting on its payload — the new spec is still UI-observation, same category as the other two.
* **Why:** coverage of one event in a family proves nothing about the others, because each one obtains its
  payload differently. SOCK-1 turns all 13 into reducers, and a reducer with no test is a silent data-loss
  bug — the observer's tree just quietly drifts from the server's.
* **Change:** one spec per event family, asserting on the observer. Prefer a direct `socket.io-client`
  connection over a second browser context where the assertion is about the payload rather than the UI —
  it is faster and the failure message is readable.
* **Traps:** the CI guard the previous revision proposed (fail if an event name does not appear under
  `tests/`) fails immediately for **all 13** names. Land the guard *after* the tests exist, in its own
  commit, or CI goes red on an unrelated change.
* **Done when:** every emit site has a named test and the guard passes in CI.

---

## SOCK-3 — Redis adapter and horizontal scaling

* **Status:** the adapter itself is already built — **remaining scope is k8s + a CI test, not application
  code.** · **Size:** S now (down from M).
* **Goal:** an event emitted on pod A reaches a socket held by pod B.
* **Verified state:** `server/package.json` already has `@socket.io/redis-adapter ^8.3.0` and
  `ioredis ^6.0.0`, and `server/src/index.ts:5-6,64-68` already wires `createAdapter`, gated on `REDIS_URL`
  exactly as this task prescribes — the core fix is done. What's still missing: `k8s/` has **no Redis
  service/deployment at all** (`grep -rln redis k8s/` returns nothing), so the adapter has nothing to connect
  to in the actual cluster manifests. `k8s/ingress.yaml` still has **no `annotations:` block**, so there are
  still no sticky sessions for Socket.IO's HTTP long-polling fallback. No CI test proves cross-process
  delivery.
* **Why:** the code fix without a Redis service in `k8s/` means this still doesn't work the moment it's
  actually deployed with `replicas: 2` — it's only tested (if at all) with `REDIS_URL` unset, i.e. the
  single-node fallback path.
* **Change:** add a Redis service/deployment to `k8s/` and set `REDIS_URL` in the server's deployment env;
  add the ingress sticky-session annotation (or force `transports: ['websocket']` — decide explicitly, this
  is the classic half-fix if skipped).
* **Done when:** a CI test boots two server processes against one Redis, connects a client to each, and
  asserts an event emitted through process A arrives at the client on process B.

---

## SOCK-4 — Connection hygiene at 10k sockets

* **Status:** more done than the file previously claimed — **two of three sub-fixes already shipped,
  the DB-read-per-join problem is the one still real.** · **Size:** S now (down from M).
* **Goal:** 10,000 concurrent sockets within a documented memory ceiling, without a DB read per join.
* **Verified state:**
  * `server/src/index.ts:91` now does `socket.data.userId = getSocketUserId(socket)` — the old "nothing
    assigns `socket.data.userId`" claim is stale.
  * Periodic re-verification is **already implemented**: a `tokenInterval` (lines ~96-103, every 60s)
    re-checks the token and disconnects on mismatch — the old "no periodic re-check" claim is stale.
  * **Still open:** `join:workspace` (lines ~106-112) still does **two sequential DB reads** every time
    (`getUserWorkspaceRole` then `UserRepository.findById` for the superadmin check) — PERF-5's `roleCache`
    is imported (`index.ts:88`) but never called here, so the cache built for this exact purpose sits unused.
  * `MAX_ROOMS = 50` is declared (line ~93) but **never enforced anywhere** — dead constant, not a real cap.
* **Why:** at 10k sockets joining a handful of workspaces each, two uncached DB reads per join is tens of
  thousands of DB reads in a reconnect storm — and a reconnect storm is exactly what a deploy causes.
* **Change:** call PERF-5's `roleCache` inside `join:workspace` instead of hitting the DB directly (do PERF-5
  first, or in the same commit — they're now the same piece of unfinished wiring), and actually enforce
  `MAX_ROOMS` (reject or evict beyond the cap) instead of leaving it declared and unused.
* **Done when:** a load test holds 10k sockets under a documented memory ceiling with p95 delivery inside
  the budget, and a test proves a member removed mid-session stops receiving events (already covered by the
  existing `tokenInterval` — just needs a test asserting it).

---

# TEST — Coverage

## Rules every new test must follow

1. **Assert the effect, not the click.** A test that clicks Save and asserts the modal closed proves
   nothing about persistence. Reload and assert the value.
2. **Authorization is API-level.** A UI test cannot prove a permission check, because the UI hides the
   control. Use `request.*` and assert the status code.
3. **The observer is the subject.** In a realtime test, assert on the client that did *not* act.
4. **Use `getByTestId`.** The existing specs already do this widely; do not reintroduce
   `page.locator('input[type="text"]')`.
5. **Every test must fail against the pre-fix code.** Watch it fail before you fix anything.

## TEST-3 — Journey coverage, per feature area

* **Status:** real, and much larger than it looks · **Size:** XL · Do it area by area, one commit each.
* **Correction (2026-09-26, from TEST-1's first real CI run):** "partial" below meant *incomplete coverage*
  in areas that were assumed to pass. A full `--project=sqlite` run (once TEST-1's CI-blocking bugs were
  fixed) shows most of them don't: **23 of 35 tests failed, 6 didn't run, only 6 passed.** This section's
  job is still the same (write the missing assertions per area), but expect to find the *existing*
  assertions in most rows broken too, not just thin. Two causes already identified while running it: a
  native-dialog/`customPrompt` mismatch on workspace creation (breaks `collection.spec.ts`,
  `environments.spec.ts`, `requests.spec.ts` — see UI-1's correction) and the `user-row` test id using a
  mutable display name instead of a stable one (breaks `admin.spec.ts` — FIX-6). The rest of the 23 are not
  yet triaged row-by-row; do that before assuming the table below still describes today's actual failures.
* **Verified state:** 36 tests across 25 files. **No area is uncovered, and no area is complete** — every
  one is partial, and three are placeholders that assert almost nothing:

| # | Area | Verdict | Covering spec | Biggest gap |
|---|---|---|---|---|
| 1 | Auth | partial | `auth.spec.ts` (3), `auth-api.spec.ts` (2) | forced first-login change, expired session, SSO |
| 2 | Workspace | partial | `workspace.spec.ts`, `rbac.spec.ts` | removing a member does not assert lost access |
| 3 | Collection tree | partial | `collection.spec.ts` (4), `crud-rename.spec.ts` | duplicate, move between folders, reorder survives reload |
| 4 | Request editing | partial | `requests.spec.ts` (3), `edgecases.spec.ts` | body-mode and auth-type matrix, dirty state, undo/redo |
| 5 | Sending | partial | `response.spec.ts` | per-mode viewer, image/PDF, timeout and error paths |
| 6 | Environments | partial | `environments.spec.ts` (2) | secret masking, globals-vs-env precedence, import/export |
| 7 | Scripts | partial | `scripts.spec.ts`, `scripts-scope.spec.ts` | failing assertions, `pm.sendRequest`; sandbox isolation is shipped in code but no test asserts it |
| 8 | History | partial | `history.spec.ts` | search, save-to-collection, quota behaviour |
| 9 | Runner | partial | `runner.spec.ts` | iterations, CSV/JSON data files, stop mid-run |
| 10 | Import / Export | **placeholder** | `import-export.spec.ts` | only asserts buttons exist on AdminPage |
| 11 | Share | **placeholder** | `share.spec.ts` | only generates a link — never opens it anonymously; the route itself is already hardened in code (shipped), nothing tests it |
| 12 | Admin | **placeholder** | `admin.spec.ts` | login + dashboard render only |
| 13 | Tabs | partial | `tabs.spec.ts`, `concurrency.spec.ts` | drag-reorder only |
| 14 | Multi-user realtime | partial | `socket-sync.spec.ts`, `socket-advanced.spec.ts`, `sock1-no-refetch.spec.ts` | 3 UI-level tests for 13 events, none asserting directly on payload (SOCK-2) |

* **Why rows 10-12 matter most:** each one is a green tick that proves nothing. `share.spec.ts` in
  particular gave false confidence while the public share route was returning 401 to anonymous viewers
  because of a router mount-order bug — the test never opened the link.
* **Done when:** every area has real assertions and the suite passes on all three backends.

## TEST-4 — The API-authorization layer

* **Status:** verified real · **Size:** L · **Pairs with SEC-2 — write these tests first, as SEC-2's proof.**
* **Verified state:** `tests/api-authorization.spec.ts` **does not exist** (the previous revision's "2 tests
  today" was wrong). The closest thing is `tests/e2e/rbac.spec.ts` — one *UI* test ("Viewer cannot edit,
  Editor can edit"), which by this section's own Rule 2 cannot prove an authorization check. There is no
  anonymous/non-member matrix and no mass-assignment test anywhere in the repo.
* **Why:** every authorization hole found so far (SEC-2's four, and the share-route regression) was
  invisible to the UI suite by construction, because the UI does not offer the control that the API
  accepts.
* **Change:** one spec that, for each mutating endpoint, asserts the status code for: anonymous,
  authenticated non-member, viewer, editor, owner, superadmin. Table-driven, using `request.*` with no
  browser. Include a mass-assignment row per endpoint (post a foreign `workspaceId` / `collectionId` and
  assert 400 or 403, never 200).
* **Done when:** every case is covered and each one fails against the pre-SEC-2 code.

## TEST-5 — Client unit tests

* **Status:** the infra is now built; the actual tests still aren't written. **Size:** S now (down from M —
  the setup work is done).
* **Verified state:** `client/package.json` now has `"test": "vitest run"` plus `vitest ^5.0.2` and
  `jsdom ^30.1.1` in devDependencies — the old "no vitest, no test script" claim is stale, someone wired the
  harness. But `find client/src -iname "*.test.*" -o -iname "*.spec.*"` still returns **zero files** — no
  actual test exists yet for `variables.ts`, `scripts.ts`, or `requestStore.ts`.
* **Why:** the highest-risk pure logic in the product is client-side and completely untested — variable
  resolution and precedence (`client/src/utils/variables.ts`), the script runner
  (`client/src/utils/scripts.ts`), and the SEC-4 `stripSecrets` persistence filter in
  `client/src/store/requestStore.ts`, where a regression silently writes credentials back to
  `localStorage`.
* **Change:** just write the tests — start with those three modules, they're pure functions, no component
  rendering needed for the first pass. Do not re-set-up vitest, it's already there.
* **Done when:** `npm test --prefix client` runs in CI with real assertions and a coverage floor on
  `client/src/utils` and `client/src/store`.

## TEST-6 — Scale and performance budgets

* **Status:** verified real · **Size:** M (PERF-0 shipped, so a realistic dataset now exists to measure against).
* **Verified state:** `tests/perf/` does not exist. `tests/e2e/api-perf.spec.ts` asserts exactly **one**
  budget — `GET /api/workspaces` under `PERF_TIMEOUT` (100 ms, set at `playwright.config.ts:17`) — and it
  does so for a freshly registered user with **zero workspaces**, so it measures an empty query and can
  never catch a scale regression. It also logs registration time without asserting on it.
* **Change:** budgets that run against the PERF-0 dataset, asserting query counts as well as milliseconds
  (a query count is stable across machines; a millisecond figure is not — that is why the current 100 ms
  assertion is the wrong shape as well as the wrong scope).
* **Done when:** the budgets run in CI and reintroducing a deliberate N+1 turns it red.

## TEST-7 — `sec10.e2e.test.ts`'s flood pollutes every other jest suite that runs after it

* **Status:** verified real · **Size:** S
* **Goal:** running the full jest suite doesn't produce spurious 429s in unrelated tests.
* **Verified state:** `sec10.e2e.test.ts` fires up to 350 POST requests at `/api/workspaces` to trigger the
  global `mutationLimiter` (`index.ts:206`, 300/min, keyed by `req.ip`). Every other e2e suite shares the
  same server process and the same loopback IP, so its bucket is still full when they run next. Jest's
  default file order is lexicographic, which puts `sec10.e2e.test.ts` right before `sec11.e2e.test.ts` and
  `sec9.e2e.test.ts`/`share.e2e.test.ts` shortly after (`'1' < '9'` as characters) — both intermittently get
  a 429 where they expect a 403/400/200. Reproduced directly: `npm test` full run → 9 failures across 5
  suites, all "Received: 429"; the same run with `--testPathIgnorePatterns='sec10\.e2e'` → clean (only the
  3 pre-existing FEAT-10 failures). Found while verifying SEC-10 — not a SEC-10 defect, the limiter is
  working exactly as designed; the test that exercises it is the one leaking state.
* **Why:** this is exactly the kind of test-suite flakiness that makes people ignore real CI failures ("it's
  probably just that flaky rate-limit thing").
* **Change:** give `sec10.e2e.test.ts`'s flood request a distinguishing header/IP the limiter's `keyBy` can
  isolate on (the limiter already accepts a `keyBy` option), or run it in its own jest project/last, so its
  bucket exhaustion can't bleed into a sibling suite.
* **Done when:** the full suite passes twice in a row with no 429-related failure, run back to back without
  restarting the server.

## TEST-8 — Multi-`test()` spec files assume a shared login that Playwright doesn't give them

* **Status:** verified real (found by a subagent while migrating tests/e2e off native dialogs) · **Size:** M
* **Verified state:** several spec files split one scenario across multiple `test()` blocks with a comment
  like "Run serially to reuse state" (e.g. `collection.spec.ts`, `environments.spec.ts`, `requests.spec.ts`)
  — but Playwright gives every `test()` its own fresh, unauthenticated browser context by default; nothing
  shares cookies between them. Reproduced directly: after test 1 logs in and the block ends, test 2's page
  has zero cookies and `/` immediately redirects to `/login`. `test.describe.configure({ mode: 'serial' })`
  (present in some of these files) only orders execution — it does not share browser state.
* **Why:** these files' later tests in the sequence don't actually test what they claim to (continuing an
  authenticated session); they silently fail at the login boundary instead.
* **Change:** use Playwright's `storageState` (save it after test 1's login, load it for subsequent tests in
  the same file) or restructure each file's scenario into a single `test()`, matching what
  `permission-toast.spec.ts` and `conflict.spec.ts` already do with one long test per scenario.
* **Done when:** every multi-`test()` spec file in this state either shares login via `storageState` or is
  restructured into one test, and none of them redirect to `/login` partway through.

---

# UI — Client experience

## UI-4 — Accessibility

* **Status:** verified real, still open, but remediation has quietly started · **Size:** L
* **Verified state:** across `client/src/**/*.tsx` there is now **1** `aria-label`/`aria-modal`/`role=`
  attribute (not zero as previously claimed — still effectively unaddressed at this scale). `outline-none`/
  `focus:outline-none` is at **70** occurrences (was 73 — roughly unchanged). `focus-visible` now has **2**
  hits — `ToastContainer.tsx:25` (`focus-visible:ring-2 focus-visible:ring-white`) and `App.css:14`
  (`&:focus-visible`) — so this is no longer literally zero, but nowhere close to "every interactive control
  shows a focus ring."
* **Change:** restore a visible `focus-visible` ring as a global style **first** (extend what's already
  started in `App.css` app-wide) — it is the difference between "unusable by keyboard" and "usable" — then
  label controls, add `role`/`aria-modal` to the modals, and trap focus inside them.
* **Traps:** `@axe-core/playwright` is in neither `package.json`, so the "Done when" needs it added first.
* **Done when:** an axe scan of the main screen, one modal and the admin page reports no critical
  violations, and every interactive control shows a focus ring when tabbed to.

---

# FEAT — Features to build

Everything here was explicitly selected by the owner. Anything *not* here and not already built is in
`IGNORE.md` and must not be proposed.

## FEAT-5 — Collaboration

### FEAT-5.1 — Collection-level RBAC *(parity item 28)*

* **Status:** greenfield · **Size:** L · **Do this before 5.3-5.6** — they all assume per-collection access.
* **Verified state:** `server/src/middleware/rbac.ts` is workspace-granularity only: `UserRole` at `:3`,
  `ROLE_RANK` at `:7`, `getUserWorkspaceRole` at `:14`, `requireWorkspaceRole` at `:36`, and
  `canSave`/`canRun`/`canManageMembers` at `:72-81`. There is no collection ACL anywhere.
* **Goal:** a member's workspace role can be **narrowed** (never widened) on a specific collection.
* **Done when:** API tests prove a workspace `editor` narrowed to `viewer` on one collection gets 403 on
  that collection and 200 on another.

### FEAT-5.2 — `@` mentions in comments *(parity item 33)*

* **Status:** partial prior art · **Size:** M
* **Verified state:** `client/src/components/common/UserAutocomplete.tsx` exists but is used **only** at
  `WorkspaceSettingsModal.tsx:167`. `CommentsEditor.tsx` has zero mention handling.
* **Done when:** a test mentions a member, asserts that member sees a notification, and asserts a non-member
  cannot be mentioned.

### FEAT-5.3 — Fork a collection *(parity item 29)* · greenfield · **Size:** L
### FEAT-5.4 — Collection versioning *(prerequisite for merge)* · greenfield · **Size:** L
### FEAT-5.5 — Pull requests *(parity item 30)* · greenfield · **Size:** XL
### FEAT-5.6 — Merge and conflict resolution *(parity item 31)* · greenfield · **Size:** XL
### FEAT-5.7 — Partner workspaces *(parity item 27)* · greenfield · **Size:** L

* All five have **no prior art** in the repo. They are a single programme, not five independent tasks:
  5.4 must precede 5.5, which must precede 5.6. Do not start 5.5 before 5.3 and 5.4 are shipped and
  tested.
* Line-number correction for 5.6: the `confirm()` it cites in `UrlBar.tsx` is now at **`:387`**.

# CLEAN — Cleanup

| # | Item | Verified state | Action |
|---|---|---|---|
| 8 | Dead PowerShell script | `test-all-dbs.ps1` at the repo root was the manual substitute for a per-DB Playwright matrix. That matrix now exists for real (`playwright.config.ts` has `sqlite`/`postgres`/`mysql`/`extension` projects, wired into CI) — the script is now dead weight, not a fallback anyone needs | Delete `test-all-dbs.ps1` |

---

# Removed on 2026-09-25

Deleted from this file during the verification pass. Recorded once so nobody re-adds them from an old
diff, a stale review or a memory of "there was a task for that".

## Shipped

| Was | What shipped | Evidence |
|---|---|---|
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

| **FEAT-10** — Server-side collection export/import | Completed | `importExport.ts`, `feat10.e2e.test.ts`, `ImportModal.tsx` |
| **SEC-12** — Remove the NTLM auth option | Completed | `requestStore.ts`, `AuthEditor.tsx`, `UrlBar.tsx` |
| **SEC-11** — OAuth CSRF state | Completed | `server/src/routes/auth.ts` |
| **FEAT-1** — WebSocket client | Completed | ConnectionEditor.tsx |
| **FEAT-2** — Socket.IO client | Completed | ConnectionEditor.tsx |
| **FEAT-3** — Server-Sent Events | Completed | ConnectionEditor.tsx |
| **FEAT-4** — Kafka events | Completed | ConnectionEditor.tsx |
| **FEAT-6** — Scope resolution visualizer | Completed | |
| **FEAT-7** — Split pane | Completed | |
| **FEAT-8** — Restore closed tabs | Completed | |
| **FEAT-9** — Response size limits | Completed | |

## Shipped (2026-09-26)

| Was | What shipped | Evidence |
|---|---|---|
| **PERF-0** — establish a baseline dataset/measurements | SQLite baseline recorded: login 35ms/1 query, list workspaces 4ms/1 query, open workspace 9ms/5 queries, list history 3ms/1 query | this file's own now-removed PERF-0 section |
| **SEC-10** — baseline HTTP hardening | CSP (`helmet`) live with explicit directives, HSTS on in production, rate limiting on `/register`/`/login`/`/google`/public share GET plus a global mutation limiter; the three previously-claimed blockers (script runner, Monaco, Handlebars) are all cleared; iframes correctly sandboxed | `server/src/index.ts`, `middleware/rateLimit.ts`, `server/src/tests/sec10.e2e.test.ts` |
| **PERF-6** — trim what the wire carries | Summary-only `attributes` projections for the collection tree list endpoint, `compression` added and wired | `RequestRepository.ts` (`findSummaryByCollection`/`findSummaryByFolder`), `routes/collections.ts`, `server/src/tests/perf6.test.ts` |
| **TEST-1** — run the Playwright suite in CI | `test.yml` runs the full Playwright matrix (`--project=${{ matrix.db }}` + extension project); `docker-publish.yml` gates on it via `workflow_call`; `CERT_ENCRYPTION_KEY` fixed in CI, admin test-ordering/forced-password-change bug fixed | `.github/workflows/test.yml`, `tests/e2e/global-setup.ts` |
| **UI-1** — replace native `prompt()`/`confirm()`/`alert()` | All 8 real sites (across `AdminPage.tsx`, `HistorySidebar.tsx`, `Sidebar.tsx`, `RequestTabBar.tsx`, `UrlBar.tsx`, `EnvironmentSidebar.tsx`, `EnvironmentTabEditor.tsx`) migrated to the app's own modals/toasts; all 13 e2e specs' `page.on('dialog', ...)` listeners rewritten to drive the real modals | grep for `window.prompt`/`window.confirm`/bare `alert(`/`confirm(`/`prompt(` in `client/src` returns nothing |
| **UI-2** — one global feedback surface | The 6 modals that swallowed async errors into local `useState` now also route through `toastStore`; `GlobalSettingsModal`'s silent `console.error`-only delete failure now surfaces a toast | `client/src/store/toastStore.ts`, `ToastContainer.tsx`, `tests/e2e/toast-on-closed-modal.spec.ts` |

## Shipped (2026-09-26, audit pass 2)

Found by re-verifying every remaining open item against the actual running code, instead of trusting the
file's own prior text. All confirmed done by direct inspection (grep, reading the source, and — for the two
builds — actually running them).

| Was | What shipped | Evidence |
|---|---|---|
| **Self-registration silently granted superadmin** (the item formerly titled SEC-13) | `server/src/routes/auth.ts:56` now creates self-registered users with `isSuperAdmin: false` | `server/src/routes/auth.ts:56` |
| **SEC-0.6** — harden the public share-link route | `GET /:shortId` now returns only `{name, method, url, description}` per request plus filtered headers and `auth:{type}` — no tokens, body or scripts; `DELETE /:shortId` exists with an owner/superadmin check; rate limiting (`shareGetLimiter`) is applied; the mismatched-token bug is fixed (one `token` value generated and stored, not a fresh one returned) | `server/src/routes/share.ts` |
| **The script sandbox** (the item formerly titled SEC-3 in cross-references) | `client/src/utils/scripts.ts` no longer runs user scripts via `new Function` on the main thread — it now does `new SandboxWorker()` (Vite `?worker` import of `client/src/sandbox/worker.ts`) and communicates by `postMessage`; the HTML preview iframe is `sandbox=""` and the visualizer iframe is `sandbox="allow-scripts"` (never `allow-same-origin`), matching the target design exactly | `client/src/utils/scripts.ts:1,40`, `client/src/components/response/ResponseViewer.tsx:381,540` |
| **SEC-8** — encrypt client SSL certificates at rest | `server/src/utils/cryptoBox.ts` implements AES-256-GCM `seal`/`open` keyed from `CERT_ENCRYPTION_KEY`, with graceful fallback for pre-existing plaintext rows (`isEncrypted` check); `POST /certificates` seals `key`/`passphrase`; `GET /me` returns metadata only (`_id`, `hostname`, `createdAt`); `routes/proxy.ts` decrypts via `cryptoBox.open()` at the point of use | `server/src/utils/cryptoBox.ts`, `server/src/routes/auth.ts:135-151,335-341`, `server/src/routes/proxy.ts:79` |
| **SEC-9** — validate every request body with Zod | 10 files under `server/src/schemas/` plus `server/src/middleware/validate.ts`; every mutating route across admin/auth/collections/environments/history/importExport/localVariables/proxy/share/shareProxy has a matching `validate(...)` call (checked 1:1, zero gaps found); `ajv` fully removed from `server/package.json` | `server/src/middleware/validate.ts`, `server/src/schemas/*.ts` |
| **UI-3** — handle 403 distinctly from 401 | `client/src/api/axios.ts:9-22` now dispatches a toast on 403 alongside the existing 401 redirect | `client/src/api/axios.ts` |
| **UI-5** — style consistency | `client/src/App.tsx` no longer has any `style={{` occurrences (was 21) | `client/src/App.tsx` |
| **UI-6** — fix stale copy | `AdminPage.tsx`'s import-confirm text no longer mentions "overwrite system configuration"; the proxy-setting text no longer mentions "capture" | `client/src/pages/AdminPage.tsx` |
| **TEST-2** — the database matrix | `playwright.config.ts` now defines `sqlite`/`postgres`/`mysql`/`extension` projects wired into CI (`test.yml`'s `--project=${{ matrix.db }}`, confirmed under TEST-1); zero spec files under `tests/e2e/` hardcode `localhost:5173` any more (was 11) | `playwright.config.ts`, `tests/e2e/*.spec.ts` |
| **CLEAN rows 3, 4, 5, 6, 7** (naming, dead deps, stale capture copy, stale doc refs, `IGNORE.md` drift) | Naming is consistently `reqspace`/`reqSpace` now (`appId: com.reqspace.app`, default DB `reqspace`); `multer`/`archiver`/`postman-collection`/`http-proxy-middleware`/`ajv` and their `@types` are gone from `server/package.json`; `ssrf.ts`/`AdminPage.tsx` no longer mention "capture"; `smoke-core.sh`/`ssrf.test.ts` point at `TODO.md`, not the nonexistent `TESTING.md`/`CODE_REVIEW.md`; `IGNORE.md` section B already says "(formerly CaptureTrafficModal)" / "(formerly capture.ts)" | `package.json`, `server/package.json`, `server/src/utils/ssrf.ts`, `IGNORE.md` |
| **Build health** (not a numbered task, but directly relevant to this file's own "a build error is a production outage" warning) | Both builds pass clean as of 2026-09-26: `npm run build --prefix server` (tsc, no errors) and `npm run build --prefix client` (vite, "✓ built", no type/compile errors — only a chunk-size warning and `INEFFECTIVE_DYNAMIC_IMPORT` notices, both now tracked under PERF-7) | direct run, 2026-09-26 |

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
| "Monaco is loaded eagerly" (PERF-7) | Superseded twice: first corrected to "not bundled at all, fetched from jsDelivr", then (2026-09-26, SEC-10) found bundled locally after all — someone shipped it in between. Re-verify against the code, not either past claim, before touching PERF-7 |
| UI-1 covers 10 native dialog sites | 22 — the 12 `alert()` calls were missed entirely |
| UI-3: "remove the double `AuthGuard` on /admin" | **Dangerous.** The inner guard at `App.tsx:229` carries the superadmin check. Removing it exposes the admin page to any logged-in user |
| SEC-9: add `params: Record<string, string>` to `AuthRequest` | Already present at `middleware/auth.ts:15` |
| SEC-2 has four authorization holes | Six candidates; four are real, and two (`/requests/import/curl`, `/requests/import/raw-http`) never write anything and are not holes |
| "Shipped" table (2026-09-25) lists FEAT-10 as Completed | Not true as of 2026-09-26: `server/src/routes/importExport.ts:19-24` is a one-line dummy — `res.json({ info: { name: collection?.name }, item: [] })` — and no `POST /collections/import` route exists at all. `feat10.e2e.test.ts` fails 3/3. README already correctly shows FEAT-10 `[ ]`; only this file's changelog was wrong |

## Working-tree state

At the time of this pass, `git status` showed four files modified and uncommitted, belonging to a parallel
session — `server/src/routes/auth.ts` (the `if (false)` → real `allowSelfRegistration` check, which is half
of FIX-5) and three `tests/e2e/*.spec.ts` files swapping the `uuid` import for `crypto.randomUUID`. Check
`git status` before editing those files, and do not revert or commit them as part of an unrelated task.
