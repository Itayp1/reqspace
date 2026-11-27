# Consolidation plan: tests/e2e/realtime/ and tests/e2e/history-search/

Read-only analysis. All 21 spec files read in full. No tests run. Line numbers are `file:line` in the folder shown.

Totals: **realtime** 12 files, **28** tests. **history-search** 10 files, **18** tests. Combined 22 files, 46 tests.

Login legend: **UI** = form login/register in the browser; **API** = `apiAs*()` or `page.request`/`ctx.post` register; **NEW** = fresh user registered in the test.
Global facts: `playwright.config.ts` sets `workers: 1` and `fullyParallel: false`, so no cross-file races. The register rate limiter is off in tests (`SystemConfigRepository.ts:97` registerMax 1000 when `NODE_ENV=test`; `playwright.config.ts:19` DISABLE_RATE_LIMIT=true).

---

## Section A: realtime/ (12 files, 28 tests)

### A1. Per-file inventory

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| QA-26-conflict-dialog-detail.spec.ts | 1 (l.5) | Conflict dialog says "last saved" | none | NEW (registerUser) |
| QA-26-conflict-shows-updater.spec.ts | 1 (l.5) | Conflict dialog says "updated by Alice Editor" | none; setup via `page.request` | NEW + API |
| QA-46-comment-live-sync.spec.ts | 1 (l.5) | Comment from browser B shows live in open Comments tab of A | none; second `browser.newContext()` | NEW + UI (loginUi in B) |
| comments.spec.ts | 5 (l.29, 64, 85, 112, 175) | Comment persist, append, delete, teammate author/no-delete, tab stays clean after comment | `describe` **serial** (l.15); shared `OWNER` email/`COLLECTION` consts; local `openTheRequest()` (l.22). Test 1 registers, tests 2-5 log in by UI; state chained | NEW (l.29) then UI; teammate uses a 2nd context |
| conflict.spec.ts | 1 (l.5) | User B gets overwrite prompt on outdated save | `describe` (l.4), not serial; two contexts; inline register | inline UI register x2 |
| connections.spec.ts | 8 (l.52, 82, 93, 107, 130, 149, 171, 177) | WS / SSE / Kafka connection tabs (mocked) | `describe` **serial** (l.13); `beforeEach` (l.16) installs `routeWebSocket` mocks and registers a NEW user per test | NEW per test |
| realtime-move.spec.ts | 1 (l.10) | Moved request/folder shows once in new place for observer | none; two users; actor via `apiAs` | NEW x2 (registerUser, browser ctx) + API |
| sock1-no-refetch.spec.ts | 1 (l.8) | Rename by other user updates sidebar with zero collection HTTP requests | none; two contexts, inline register | inline UI x2 |
| socket-advanced.spec.ts | 1 (l.5) | Folder rename syncs (l.71-77) and global variables sync (l.79-90) | `describe` (l.4); two contexts, inline register | inline UI x2 |
| socket-events.spec.ts | 1 (l.5) | All 13 socket event families fire for workspace room | `describe` (l.4); no browser; `request` + `socket.io-client`; logs in as admin, uses `wsList[0]` (l.26) | API admin (cookie header) |
| socket-sync.spec.ts | 1 (l.5) | User B sees conflict indicator after A edits | `describe` (l.4); two contexts | inline UI x2 |
| socketio-connection.spec.ts | 6 (l.77, 100, 117, 132, 145, 157) | Socket.IO tab: connect, JSON payload, single log, namespace, disconnect, unreachable | helper `installSocketIoMock` (l.21); `describe` **serial** (l.61); `beforeEach` (l.64) installs mock + registers NEW user per test | NEW per test |

### A2. Proposed target spec files (11 files to 6, minus 1 deleted duplicate)

**R-T1 `realtime-conflict.spec.ts`** (3 tests after merge; 4 before)
- conflict.spec.ts l.5 (base)
- QA-26-conflict-dialog-detail.spec.ts l.5 and QA-26-conflict-shows-updater.spec.ts l.5: merge into one test that asserts both `last saved` and `updated by Alice Editor` (same dialog message, l.21 vs l.27). Medium confidence; see Section A4.
- socket-sync.spec.ts l.5: **DELETE**, duplicate (A4).

**R-T2 `realtime-sync.spec.ts`** (4 tests)
- sock1-no-refetch.spec.ts l.8
- socket-advanced.spec.ts l.5: keep only folder-rename part (l.52-77). Global variables part (l.79-90) moves to `variables-environments` (see A5).
- realtime-move.spec.ts l.10
- socket-events.spec.ts l.5

**R-T3 `request-comments.spec.ts`** (6 tests)
- comments.spec.ts l.29, l.64, l.85, l.112, l.175: keep ONE serial `describe`, keep order. l.175 must stay last and in this file; it depends on the request and its comments created in l.29.
- QA-46-comment-live-sync.spec.ts l.5: put in its own `test.describe` (not serial) so a failure in the serial block does not cascade.

**R-T4 `connections-websocket.spec.ts`** (6 tests)
- connections.spec.ts l.52, l.82, l.93, l.149, l.171, l.177 (WS and SSE connect-failure test; keep it here, it is the WebSocket error path first).

**R-T5 `connections-sse-kafka.spec.ts`** (2 tests)
- connections.spec.ts l.107 (SSE), l.130 (Kafka).
- Shared `beforeEach` (connections.spec l.16-50) must be duplicated or moved into a helper, since it registers and installs the ws mock. Both files use the same mock on `localhost:9999`.

**R-T6 `socketio.spec.ts`** (6 tests)
- socketio-connection.spec.ts l.77, l.100, l.117, l.132, l.145, l.157, with its `installSocketIoMock` helper kept in the same file. No change.

Count check: after deleting socket-sync (D1) and merging the QA-26 pair (D2): 3 (R-T1) + 4 (R-T2) + 6 (R-T3) + 6 (R-T4) + 2 (R-T5) + 6 (R-T6) = **27** tests. Original 28, minus the deleted duplicate = 27 with the pair still separate, 26 after the QA-26 merge. Target file count is 6 of the 12 current files (50%), at the upper end of the one-third-to-a-half range.

### A3. DEPRECATED tests (evidence required)

**None found.** Every test relies on a testid, route, event or text that is present in `client/src` or `server/src`. Greps run from `C:\projects\reqspace`, with counts of matching files (`rg -l -F`):

- Conflict: `rg -l -F "conflict-indicator" client/src` = 1 (`RequestTabBar.tsx:176`). `rg -n -F "Conflict Detected" client/src` = `UrlBar.tsx:697` (title). `rg -n -F "newer version of this request" client/src` = 1 (`UrlBar.tsx:699` message text). `rg -n -F "last saved" client/src` = `UrlBar.tsx:699`. `rg -n -F "updated by" client/src` = `UrlBar.tsx:699`. `rg -n -F "updatedByName" server/src` = 2.
- Comments: `comment-item`, `comment-text`, `comment-author`, `comment-delete-btn`, `comment-input`, `comment-submit-btn` all in `client/src/components/request/CommentsEditor.tsx` (l.62-105). `dirty-indicator`: 1 file. `"No comments yet"`: 1 file. `req-tab-comments` is built by template at `RequestEditor.tsx:84` (`req-tab-${tab...}`) with `'Comments'` in the tab list at `RequestEditor.tsx:19`. Author text `'You'` at `CommentsEditor.tsx:65`.
- Socket events: `rg -a -n "emitToWorkspace\(.*'(collection|folder|request|workspace|environment):" server/src/routes` gives all 13 families: `collection:created/updated/deleted` (`collections.ts:149,209,219`), `folder:created/updated/deleted` (`collections.ts:238,276,301`), `request:created/updated/deleted` (`collections.ts:353,393,403`), `workspace:reordered` (`collections.ts:199`), `environment:created/updated/deleted` (`environments.ts:89,100,137`).
- Socket room join: `rg -a -n -F "join:workspace" server/src` = `server/src/index.ts:127`. (Note: `-a` is required because `index.ts` is flagged as binary by ripgrep; a plain search returns nothing.)
- Socket path: `client/src/components/common/SocketSync.tsx:24` uses `path: '/ws'`, which matches `socket-events.spec.ts` l.29 and `socketio-connection` route l.24.
- Connections: all testids used exist in `client/src/components/request/ConnectionEditor.tsx`: `connection-protocol-select` (l.446), `connection-url-input` (l.459), `connection-disconnect-btn` (l.470), `connection-connect-btn` (l.474), `connection-kafka-desktop-banner` (l.487), `connection-msg-${m.type}` (l.633, covers msg-info/sent/received/error), `connection-msg-read-toggle` (l.642), `connection-unread-count`, `connection-mark-all-read`, `connection-ws-desktop-note`, `connection-ws-auth-type`, `connection-event-name-input`, `connection-clear-btn`, all Kafka fields. Protocol values `'WS'`, `'SSE'`, `'SOCKETIO'`, `'KAFKA'` present. Desktop text `"Available only in the Electron desktop app"` (`ConnectionEditor.tsx:26`). Error strings `Socket.IO connect error`, `WebSocket closed`, `WebSocket error`, `SSE HTTP` present.
- Workspace and env UI: `new-workspace-btn`, `prompt-submit`, `workspace-settings-btn`, `workspace-members-tab`, `workspace-invite-role`, `workspace-invite-btn`, `invite-email`, `close-workspace-modal`, `user-autocomplete-input`, `tab-environments`, `env-globals-btn`, `add-env-var-btn`, `env-var-key-`, `env-save-btn`, `inline-rename-input`, `create-request-btn`, `new-tab-btn`, `request-save-btn`, `save-req-name-input` all present in `client/src`.
- Tree routes used by sock1 and realtime-move: `GET /workspaces/:workspaceId/tree` (`server/src/routes/collections.ts:126`), `PUT /collections/reorder` (l.156), `PUT /folders/:id` (l.243), `PUT /requests/:id` with `folderId` (emits at l.285).

Unsure: **none**. `action-menu-new-folder` (socket-advanced l.60, realtime-move, global-search) is built by template at `CollectionExplorer.tsx:113` from label `New Folder`, so it exists.

### A4. DUPLICATES

**D1 (HIGH, delete): socket-sync.spec.ts l.5 `"User B sees conflict when User A edits request"` vs conflict.spec.ts l.5 `"User B gets overwrite prompt when saving an outdated request"`.**
- Both: register A and B, create workspace, invite B as editor, A creates and saves a request, B opens it, B types local edit, A saves, B sees the conflict.
- socket-sync's only assertion is `conflict-indicator` visible (socket-sync l.87). conflict.spec asserts the same at l.98, and also the overwrite prompt text (l.105) and cancel (l.106).
- The only difference is the entry point (`create-request-btn` l.57 vs `new-tab-btn` l.65 in conflict.spec). The test does not assert that entry point, so nothing unique is lost.
- Stronger: **conflict.spec.ts l.5**. No unique assertion of socket-sync needs folding in.

**D2 (MEDIUM, merge not delete): QA-26-conflict-dialog-detail.spec.ts l.5 vs QA-26-conflict-shows-updater.spec.ts l.5.**
- Both assert on the same `#confirm-modal-description` message (`UrlBar.tsx:699`). One checks `last saved` (detail l.21), the other checks `updated by Alice Editor` (updater l.27). These are two substrings of one message, not the same assertion.
- Before deleting either, fold the other's assertion into the survivor. The updater's extra setup (named editor, API-created request) is what makes the `updated by` clause appear, so the merged test should use it.
- Confidence medium because they are not strictly the same assertion. Do not auto-delete.

**D3 (LOW, no action): connections.spec.ts l.52 vs l.82** (both WebSocket connect and send). l.82 is the keyboard path (Enter in URL field and composer). Its unique assertion is the Enter key, so it is not a duplicate.

**Not duplicates (checked):**
- sock1-no-refetch (collection rename, zero HTTP) vs socket-advanced folder rename: different entity, and sock1 is the only one asserting zero requests.
- QA-46 (cross-browser live comment) vs comments.spec l.29 (comment shows after post): QA-46 asserts a second browser's live update, which l.29 does not.
- socketio l.117 (single log) vs l.77: unique assertion (no duplicate log).
- connections l.177 (WS and SSE connect failure) vs socketio l.157 (connect error): different protocols and error strings.

### A5. MERGE RISKS per target

- **R-T1 (conflict):** Inline register, no serial order, unique emails via `Date.now()`. Safe. The merged QA-26 test uses `registerUser` with a random suffix, so no collision.
- **R-T2 (sync):** socket-events uses the **admin** account and its first workspace (`socket-events.spec.ts:26` `wsList[0]`). It creates and deletes environments and collections in that workspace. Admin-world tests that count admin workspaces, collections or environments may see these as leftovers (they run in the same single-worker run). Recommend: give socket-events its own registered user, or keep it isolated. sock1 counts requests with `pageB.on('request')` after `networkidle`; keep the counter registered after the initial load, as it is now.
- **R-T2 (sync), moved part:** the global variables block (socket-advanced l.79-90) writes global env vars in workspace WS_ts. Move it to the `variables-environments` world (see A6), not into R-T2.
- **R-T3 (comments):** serial chain. Test 2 needs test 1's comment; test 3 expects exactly 2 comments (l.91) and deletes the first; test 4 expects 2 comments after its own post (l.159); l.175 expects `Commented Request` and OWNER to exist. Keep the order, keep l.175 last, and do not split the block. QA-46 must be outside the serial block and must keep its own collection name (`QA46 Col`).
- **R-T4 and R-T5 (connections):** `page.routeWebSocket` must be installed before navigation (connections.spec l.19 comment). The `beforeEach` (l.16-50) is shared. If it moves into a second file, copy it or put it in a helper. The `localhost:9999` mock is per page, so the two files do not interfere. Each test registers a fresh user (8 registrations in connections, 6 in socketio, all from one IP with no `X-Forwarded-For` in the browser). The register limiter is off in tests, so no rate-limit risk.
- **R-T6 (socketio):** `installSocketIoMock` routes `localhost:\d+/ws/?EIO=` to a never-answering handler (l.24). If connections and socketio are ever in the same describe, the `/ws` handler must be the same one. Keep the mock in the socketio file.
- **Fresh-user dependency:** conflict.spec, socket-sync, sock1, socket-advanced, realtime-move all create workspaces in a fresh user. Safe, since they register new accounts.

### A6. Tests that belong in a different world

- **socket-advanced.spec.ts l.79-90 (Global variables sync)** belongs in `variables-environments`. It tests global env var propagation over sockets, not folder rename.
- **realtime-move.spec.ts l.10 (move request and folder)** could belong in `collections-tree`. It is kept in realtime because the assertion is the socket reducer (its header comment l.4-9 says so). Medium confidence; either home works.
- **comments.spec.ts l.175 (posting a comment leaves the tab clean, next save no conflict)** could belong in a `requests` world (dirty state and save). Kept in comments because it depends on comments.spec's serial state. Medium.
- **socket-events.spec.ts l.5 (API-level socket event contract)** could belong in `platform` (API contract). Kept here because it is about the realtime event list. Low.

---

## Section B: history-search/ (10 files, 18 tests)

### B1. Per-file inventory

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| fix-K1.3.spec.ts | 1 (l.16) | History search matches response status code | none; `pwRequest` API context with `X-Forwarded-For`; copies cookies into page; rewrites non-GET `/api/**` Origin | API register + storageState cookies |
| fix-K4.4.spec.ts | 1 (l.39) | "Clear" with active search removes only filtered entries | `describe` (l.38); local `newUser()` (l.17), `loginUi()` (l.27) with Origin rewrite | API register + cookies |
| fix-K4.6.spec.ts | 1 (l.31) | `DELETE /api/history` needs workspaceId, never wipes others | none; no `page` used; API only | API register |
| global-search-reveal-folder.spec.ts | 1 (l.5) | Picking a nested folder/collection result expands tree and closes modal | none | UI (registerUser) |
| global-search.spec.ts | 5 (l.42, 72, 94, 107, 140) | Ctrl+K builds tree, finds by name, URL, arrow keys, click/miss/Escape | `describe` **serial** (l.15); `beforeEach` (l.25) registers same email each test, falls back to login. Test 1 builds the tree the rest use | UI |
| history-binary-response.spec.ts | 2 (l.5, 19) | Binary response with NUL accepted (HIST1); NUL in workspace name refused | none; `apiAsAdmin()`, uses admin `workspaces[0]` (l.8) | API admin |
| history-keyboard-actions.spec.ts | 1 (l.4) | History Save/Delete become visible on keyboard focus | none; `registerUser`; route on `hist.example.test` | UI (NEW) |
| history-restore-raw-url.spec.ts | 1 (l.9) | Restore keeps `{{baseUrl}}` and names tab after request | none; route on `/api/` rewrites Origin (l.11); route on `qa-host` | UI (NEW) + API seed |
| history-workspace-cap.spec.ts | 1 (l.5) | History over per-workspace cap drops oldest; burst does not overshoot | none; mutates admin config `history.maxTotalPerWorkspaceMB=1` (l.7), restores to 10 in `finally` (l.34) | UI (NEW) + API admin |
| history.spec.ts | 4 (l.28, 70, 99, 143) | Log and replay, search, Save to Collection, large body quota | `describe` **serial** (l.4); `beforeAll` (l.11) API-registers; `beforeEach` (l.18) UI login; test 2 onward relies on `workspaceId` from test 1 (l.35) | API register + UI login |

### B2. Proposed target spec files (10 files to 4)

**H-T1 `history.spec.ts`** (6 tests; the file is kept and absorbs two files)
- history.spec.ts l.28, l.70, l.99, l.143 (keep the serial chain; l.70 and l.99 need the `workspaceId` from l.28)
- history-restore-raw-url.spec.ts l.9 (independent NEW user; fits "history restore" with `history.spec` l.28)
- history-keyboard-actions.spec.ts l.4 (independent NEW user; history row UI)

**H-T2 `history-api.spec.ts`** (3 tests; API-driven)
- history-binary-response.spec.ts l.5 (admin workspace, see B4 risk)
- history-workspace-cap.spec.ts l.5 (mutates shared config; see B4 risk)
- fix-K4.6.spec.ts l.31 (API DELETE scope)
- history-binary-response.spec.ts l.19 (NUL name refused): **move to `platform`** (see B5), not here.

**H-T3 `history-search-and-clear.spec.ts`** (2 tests)
- fix-K1.3.spec.ts l.16
- fix-K4.4.spec.ts l.39

**H-T4 `global-search.spec.ts`** (6 tests)
- global-search.spec.ts l.42, l.72, l.94, l.107, l.140 (keep serial, keep test 1 first)
- global-search-reveal-folder.spec.ts l.5 (independent; put in its own non-serial `describe` so it does not share the serial block)

Count: 6 + 3 + 2 + 6 = 17 (the NUL-name test moved to `platform`). Target file count: 4 of 10 (40%), inside the one-third-to-a-half range.

### B3. DEPRECATED tests (evidence)

**None found.** Greps run from `C:\projects\reqspace`:

- History testids present: `rg -l -F "history-item" client/src` = 1 (`HistorySidebar.tsx`); `tab-history` = 1; `Search history...` placeholder = 1; `Save to Collection` title = 1 client, 1 server (the word appears in the UI only; server mention is a comment); `confirm-btn` = `ConfirmModal.tsx:81`; `title="Delete"` = 2 files.
- Clear button: `HistorySidebar.tsx:161` `title={isFiltered ? 'Clear the filtered entries' : 'Clear All'}` and `:164` label `Clear Filtered` / `Clear All`. Test uses `/^Clear/` (K4.4 l.53), which matches.
- Search filter: `HistorySidebar.tsx:150` `String(item.responseSnapshot?.status ?? item.statusCode ?? '').includes(q)`. Covers K1.3.
- Global search: `GlobalSearchModal.tsx:136` `aria-label="Global search"`, `:146` `role="combobox"`, `:166` listbox `Search results`, `:179` `role="option"`, `:184` `aria-label={`${item.type}: ${item.name}...`}`. Matches `folder: X` / `collection: X` / `request: X` in the tests. `TopBar.tsx:336` `aria-label="Global search (Ctrl+K)"` matches the button test (l.145). `"No results found for"` = 1 client file.
- Routes: `server/src/routes/history.ts` has `POST /workspaces/:workspaceId/history` (l.18), `GET /workspaces/:workspaceId/history` (l.54, returns `total`, l.74), `DELETE /history` requiring `workspaceId` returning 400 (l.113-115), `DELETE /workspaces/:workspaceId/history` (l.129).
- NUL guard: `server/src/index.ts:258-265` `hasNul` rejects NUL in body with 400 (`Invalid characters in request body`), and `index.ts:267-270` strips NUL from `responseBody` for history POST. Both binary-response tests match current behaviour.
- Quota config: `maxTotalPerWorkspaceMB` = `SystemConfigRepository.ts:33,222` and `AdminPage.tsx:794`. `maxRequestBodyKB` used in `history.ts:223`. Eviction logic in `history.ts:265-266`.

Unsure: none for deprecation. One note: `history.spec.ts` l.143 quota test header claims truncation, but the assertion (l.162-164) only checks the entry is visible. Not deprecated; see B4.

### B4. DUPLICATES

**D4 (MEDIUM, fold then delete the restore step): history.spec.ts l.28 `"Request history is logged and replayable"` vs history-restore-raw-url.spec.ts l.9 `"history restore keeps {{baseUrl}} and names the tab after the request"`.**
- Both click a history item and assert the URL input is restored (history.spec l.65 `toHaveValue("https://httpbin.org/get")` vs raw-url l.33 `toHaveValue('{{baseUrl}}/users')`).
- raw-url's assertion is stronger (it also checks variable preservation and tab naming, l.34-35). history.spec's restore step is a weaker version.
- Unique assertion of history.spec to keep: the history entry appears (l.55-57, `history-item:has-text("httpbin.org/get")`). Keep that, drop the restore step (l.59-67), or leave as-is (both are cheap). Do not delete the whole test.

**D5 (LOW, no action): global-search.spec.ts l.107 (arrow keys then Enter opens the request) vs l.140 (click opens the request).** Both assert `request-url-input` is restored after selecting a result. Unique parts: arrow navigation and Enter (l.107), miss message, toolbar button, Escape (l.140). Not duplicates; the shared "opens request" assertion is one line.

**Not duplicates (checked):**
- history.spec l.70 (text search `search1`) vs fix-K1.3 (search by status code): different field.
- fix-K4.4 (Clear with search) vs fix-K4.6 (API DELETE scope): UI vs API, different guarantee.
- history-workspace-cap vs admin `fix-Q8.1` (history max-records/retention): different config keys. Both mutate the admin config, see B5.
- global-search-reveal-folder vs global-search test 2 (Ctrl+K finds folder): reveal and tree expansion is unique.

No high-confidence duplicates in this world, so nothing is deleted automatically.

### B5. MERGE RISKS per target

- **H-T1 (history.spec):** serial state. Test 2 (search) and test 3 (save to collection) need the workspace created in test 1 (`workspaceId`, l.35). Keep order. `beforeAll` (l.11) API-registers `testEmail`; `beforeEach` logs in. Test 1 creates a **workspace** (`Hist WS ts`) that is visible to the user for the rest of the file. Fine if nothing else in this file uses that email.
- **history.spec network dependency:** tests at l.28, l.70 (no), l.143 send requests to **httpbin.org** (`l.39`, `l.45`, `l.75`, `l.79`, `l.153`). Only the send steps need the network; they are not mocked, unlike raw-url and keyboard tests. This is an external dependency in an otherwise hermetic world. Recommend mocking with `page.route` if the suite runs offline. Not a merge issue, but it affects whether H-T1 is green.
- **H-T1 (raw-url and keyboard absorbed):** both register NEW users and do not touch the serial chain. Safe to move. raw-url uses `page.route(/\/api\//)` to rewrite Origin (l.11). That route is per page and does not leak. keyboard test l.6 routes `hist.example.test` only.
- **H-T2 (history-api):**
  - **history-workspace-cap mutates the global admin config.** It sets `history.maxTotalPerWorkspaceMB=1` (l.7) and restores to hard-coded `10` in `finally` (l.34). It does not restore the original value. Admin tests that read or change this value (admin `admin-settings.spec.ts` l.117-135 changes "Max Total History per User MB" and expects `25`; admin `fix-Q8.1` changes history retention) must not run while it is 1. With `workers: 1` the order is fixed, so this is safe only if the suite runs files sequentially. Recommend: save the original value and restore it, not 10.
  - **history-binary-response.spec.ts l.8** uses the **admin's** `workspaces[0]`. It writes history into the admin's first workspace, which other admin-world tests may count (history totals or `total` assertions). Recommend a NEW user, as the other specs do.
  - The K4.6 test makes no browser calls, so it does not need the page fixture. It is still wrapped by the fperror guard (fine).
- **H-T3 (search-and-clear):** K1.3 and K4.4 both use the Origin rewrite on `**/api/**` for non-GET requests (`fix-K1.3.spec.ts:28-31`, `fix-K4.4.spec.ts:30-33`). Their helper bodies are copy-paste. Merge the two helpers into one file-local helper. `seq` and `ip()` (`10.120+` and `10.200+` ranges) can collide if K1.3 and K4.4 run in the same process: they use different base ranges (120-149 vs 200-249), so no collision, but keep them distinct when merging.
- **H-T4 (global-search):** serial chain. Test 1 (l.42) builds the tree; tests 2-5 expect `node-${COLLECTION}`, `node-${REQUEST}` and the `UNIQUE_URL` to exist. Keep test 1 first. `beforeEach` (l.25) registers `search_${ts}` each test; in tests 2-5 this fails (duplicate email) and falls back to login. This is fragile: if `register` ever returns 201 on a repeat, the flow still works, but if the email ever differs it breaks. Keep as is.
- **H-T4 (reveal-folder):** independent (`registerUser` with random suffix). Put in its own `test.describe` so it is not part of the serial block.
- **Fresh user dependency:** global-search tests need a fresh user only once (test 1). Others assume test 1 succeeded. The reveal test uses a fresh user and `Control+k`. Keyboard shortcut `Control+k` in the reveal test (l.23) and in global-search (l.78) are both on `page`; no shared state.
- **Unique-name collisions:** global-search uses `ts` in names (`Search Collection ${ts}`) and in the URL (`unique-${ts}`); the reveal test uses fixed names (`ColReveal`, `OuterReveal`, `InnerReveal`) in a fresh user's workspace. No collision because workspaces are per user. Keep `ts` names if the reveal test ever moves into the global-search file.

### B6. Tests that belong in a different world

- **history-binary-response.spec.ts l.19 `"a NUL in an id or name is still refused"`** belongs in `platform` (API validation). It tests the global NUL guard (`server/src/index.ts:258-265`), not history. It is a 400 on `POST /api/workspaces`. Move it out; it has no history assertion.
- **history-restore-raw-url.spec.ts l.9** could belong in `variables-environments` (it checks `{{baseUrl}}` variable preservation). Kept in history because its subject is the restore flow. Medium.
- **global-search.spec.ts** could belong in a `ui` or `navigation` world (Ctrl+K modal). Kept here because the assignment says so. Low.
- **history-workspace-cap.spec.ts l.5** is a config-driven quota test; it also fits the `admin` world (it changes `SystemConfigRepository` settings). Kept in history because it asserts history eviction. Medium.

---

## Summary of actions for the consolidation

| Action | Test | Confidence |
|---|---|---|
| DELETE | realtime/socket-sync.spec.ts l.5 (duplicate of conflict.spec l.5) | high |
| MERGE | realtime QA-26 pair (`last saved` + `updated by`) into one test | medium |
| FOLD then trim | history.spec l.28 restore step (keep the logged-entry assertion) | medium |
| MOVE to `platform` | history-binary-response l.19 (NUL name refused) | medium |
| MOVE to `variables-environments` | realtime/socket-advanced.spec.ts l.79-90 (global variables sync) | medium |
| MOVE to `requests` (optional) | realtime/comments.spec.ts l.175 (kept here for serial state; move only if the world loses the serial dependency) | medium |
| FIX | history-workspace-cap restore to the original value, not hard-coded 10 | merge risk, not a deletion |
| FIX | history-binary-response l.8 use a NEW user, not admin `workspaces[0]` | merge risk, not a deletion |
| NOTE | history.spec l.28 and l.143 need httpbin.org (not mocked) | environment risk |
