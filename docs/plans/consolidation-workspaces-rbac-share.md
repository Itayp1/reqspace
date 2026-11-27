# Consolidation plan: tests/e2e/workspaces-rbac-share/

Scope: all `*.spec.ts` directly under `tests/e2e/workspaces-rbac-share/`. The folder holds **19** spec files and **42** tests. Read-only analysis; no tests were run and no file was changed except this report.

Login legend: **UI** = `registerUser` / `loginUi` / inline form; **API** = `apiAs()` / `apiAsAdmin()` / raw `pwRequest` context with `register`+`login`; **ANON** = no session; **ADMIN** = `loginAdminUi`.

Allow-list legend: the fperrors guard (`tests/e2e/fixtures.ts:120`) fails a test on any new error group. Client `axios.ts:28-29` reports only 401/403 API failures and 5xx/no-response, so 400/404/409/410 are not reported client-side. Server `index.ts:280-290` records 5xx always, and 401/403 as `server-auth` while `captureAuthFailures` is on (default `true`, `SystemConfigRepository.ts:106`). So a deliberate 401/403 needs an allow-list entry.

## 1. Per-file inventory

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| QA-28-workspace-plural.spec.ts | 1 | Admin Workspaces table says "1 member" (singular) for count 1 (l.5) | none; `goto('about:blank')` + `clearCookies` before admin login (l.7-8) | UI register + ADMIN |
| QA-47-viewer-readonly-editor.spec.ts | 1 | Viewer gets read-only URL bar and "View only" note; role faked by route mock of `/api/workspaces` (l.5, l.11-15) | none | UI registerUser |
| QA-76-permissions-modal-escape.spec.ts | 1 | Escape closes admin Manage Permissions modal, inner confirm first (l.5) | none | API admin (create ws) + ADMIN |
| app-shell.spec.ts | 4 | DB-outage screen (l.16); unknown path lands on app (l.41); `{{$guid}}` etc. resolve (l.50); owner changes member role (l.68) | `describe('App shell')` l.9; nested `describe('database outage')` l.10 with `test.use({allowFpErrors:['/api/health']})` l.14 (applies to test 1 only) | UI registerUser; test 4 uses 2 contexts |
| fix-M1.4.spec.ts | 1 | Share link exposes no server-side execution (no proxy routes) (l.23) | `test.use({allowFpErrors:[/server-auth\|status code 40[013]/]})` l.6; local `anon()`, `ip()`, `idOf()` | API only (anon register) |
| fork.spec.ts | 2 | Smart fork from shared ws into personal ws; live socket sync (l.5); fork action hidden in personal ws (l.111) | `describe` l.4; no test.use; no helper | UI register inline, 2 pages in test 1 |
| input-validation-nul-ids.spec.ts | 2 | NUL/bad ids on share/fork/PUT/DELETE return 4xx not 500 (l.12, l.32) | 2 separate `describe`s; no allowFpErrors | ANON API ctx (test 1 sends an unauthenticated fork POST, l.20); test 2 registers via API |
| permission-toast.spec.ts | 1 | Viewer rename gets explicit "requires editor role" toast (l.15) | `test.use({allowFpErrors:[/server-auth\|status code 40[013]/]})` l.5; route mock of `/api/workspaces` | UI register x2 (2 contexts) |
| qa-115-permissions-role-help.spec.ts | 1 | Manage Permissions dialog explains Viewer/Editor/Owner (l.5) | none | API admin + ADMIN |
| rbac.spec.ts | 1 | Viewer cannot see Save; after promotion to editor Save appears (l.5) | `describe('RBAC Roles')` l.4; no test.use | UI register x2 (2 contexts) |
| share-mtls-copy.spec.ts | 1 | Share dialog states what is and is not shared (QA-56) (l.5). File name is misleading | none | UI registerUser |
| share-page-fork.spec.ts | 5 | Public share page lists/runs requests (l.32); two-row run fills only its row (l.82); revoked link error page (l.130); viewer Ctrl+S fork offer (l.161); fork with copy-vars + copy-env (l.221) | `describe` l.18 with `test.describe.configure({mode:'serial'})` l.19; local `register()` l.23; `ts` at describe scope | UI. Tests 2-3 log in by the email from test 1 (state dependency). Tests 4-5 use their own owner. Anon via `context.browser()!.newContext()` |
| share.spec.ts | 1 | Link generated; anon JSON strips auth token and scripts; revoke gives 404 (l.5) | none; inline register | UI register; anon via `context.request` |
| user-directory-privacy.spec.ts | 1 | Search hides strangers; invite gives same reply whether or not the account exists (l.23) | none; local `register(prefix)` l.12 | API only (anon register + `apiAs`) |
| user-search-full-email.spec.ts | 1 | Registered user found by typing full email (as admin) (l.10) | none | API anon register + `apiAsAdmin` |
| workspace-duplicate.spec.ts | 1 | Duplicate copies content and members; opt-outs honoured; only owners (l.17) | `test.use({allowFpErrors:[/server-auth\|status code 403/]})` l.4; local `user()` l.9 with `REQSPACE_API_URL` | API only |
| workspace-invite-links.spec.ts | 14 | Email invites (validation, owner role, promote, revoke) l.53-123; invite-links API l.146-240; invite-links UI + picker join l.266-332 | `test.use({allowFpErrors:[/server-auth\|status code 4\d\d\|Request failed/i]})` l.7, **broad**; local `makeUser`, `makeWorkspace`, `createLink`, `members`, `openSettingsTab`; expiry test is `test.skip` unless SQLite, and writes the e2e DB file (l.205-224) | API (`makeUser`), UI in 3 tests |
| workspace-picker.spec.ts | 1 | Searchable workspace combobox filters, switches on pick, Escape, click-outside (l.5) | none | UI registerUser + `apiAs` |
| workspace.spec.ts | 2 | Workspace CRUD and switch and delete (l.12); removing a member revokes access (l.57) | `describe` l.7; `test.use({allowFpErrors:[/server-auth\|status code 40[013]/]})` l.5 | UI inline register, 2 contexts in test 2 |

Totals: 19 files, 42 tests. Files with a `describe.serial`: share-page-fork only.

## 2. Proposed target spec files

Eight targets (42% of 19 files). Stays: 34 tests. Relocated out: 8 tests. Nothing deleted in this world (see section 3).

**T1 `workspace-lifecycle.spec.ts`** (2)
- workspace.spec.ts:12 (create, edit, switch, delete)
- workspace-duplicate.spec.ts:17 (duplicate). Put its `403` pattern in a `describe` instead of the file-level pattern (see section 5).

**T2 `workspace-switcher.spec.ts`** (2)
- workspace-picker.spec.ts:5
- workspace-invite-links.spec.ts:332 (Join with Invite Link from the picker)

**T3 `members-invites.spec.ts`** (9)
- workspace-invite-links.spec.ts:53, :74, :81, :108, :123 (email invite validation, 400, owner invite and promote, owner role select, revoke invite)
- workspace.spec.ts:57 (member removal revokes access)
- app-shell.spec.ts:68 (owner changes member role)
- user-directory-privacy.spec.ts:23 (search hides strangers, invite reply)
- user-search-full-email.spec.ts:10 (full-email search)

**T4 `invite-links.spec.ts`** (8)
- workspace-invite-links.spec.ts:146, :175, :184, :205, :226, :240 (API: create/accept, owner link, single-use, expiry, revoke, role gating)
- workspace-invite-links.spec.ts:266, :318 (UI: owner creates and joiner accepts, error pages)

**T5 `roles-permissions.spec.ts`** (4)
- rbac.spec.ts:5 (viewer vs editor, real roles)
- QA-47-viewer-readonly-editor.spec.ts:5 (viewer read-only, mocked role)
- permission-toast.spec.ts:15 (viewer 403 toast)
- share-page-fork.spec.ts:161 (viewer Ctrl+S offers copy)

**T6 `share-links.spec.ts`** (3)
- share.spec.ts:5 (link, sensitive-data strip, revoke 404)
- share-mtls-copy.spec.ts:5 (share dialog exposure note). Rename the test to describe the QA-56 copy.
- fix-M1.4.spec.ts:23 (no server-side proxy)

**T7 `share-page.spec.ts`** (3, keep serial)
- share-page-fork.spec.ts:32, :82, :130. Keep as one `describe` with `mode:'serial'`, in this order, with the shared `ts` and `register()`.

**T8 `smart-fork.spec.ts`** (3)
- fork.spec.ts:5 (fork to personal, live sync)
- fork.spec.ts:111 (fork not offered in personal)
- share-page-fork.spec.ts:221 (fork with copy-vars and copy-env)

**Relocate out of workspaces-rbac-share/** (8 tests, none lost):
- input-validation-nul-ids.spec.ts, 2 tests (l.12, l.32) to the **requests** world (PUT/DELETE `/api/requests/:id` and the fork route). The fork-body NUL case could also fit collections-tree. Keep the file whole.
- QA-28-workspace-plural.spec.ts (l.5) to the **admin** world. Target: `tests/e2e/admin/admin-workspaces-and-logs.spec.ts`, Workspaces tab test at l.38 (its row assertion at l.53 already checks `1 member`). Fold the QA-28 negative regexes (`not.toMatch(/\b1 members\b/)`, `1 collections`) into l.53 before dropping the file.
- QA-76-permissions-modal-escape.spec.ts (l.5) and qa-115-permissions-role-help.spec.ts (l.5) to the **admin** world, `admin-workspaces-and-logs.spec.ts` near the Manage Permissions test (l.38). Same setup, so they can share one workspace create.
- app-shell.spec.ts:16 (database outage screen, with its `/api/health` allow-list) to the **platform** world (health and infra).
- app-shell.spec.ts:41 (unknown path lands on app) to the **ui** world (routing).
- app-shell.spec.ts:50 (dynamic `{{$guid}}` etc. resolved on send) to the **variables-environments** world (`client/src/utils/dynamicVars.ts`).

Count check: 42 - 8 relocated = 34 stays = 2+2+9+8+4+3+3+3.

## 3. DEPRECATED tests

**None.** Every id, route and string the folder relies on still exists. Evidence (run on `client/src`, `server/src`, `extension`, `electron`):

- Test ids: `grep -rl -- "<id>" client/src server/src extension electron` returns at least one file for each of: `view-only-note`, `shared-collection-name`, `shared-collection-error`, `shared-request-row`, `shared-request-run-btn`, `shared-request-result`, `viewer-fork-modal`, `viewer-fork-cancel`, `viewer-fork-copy`, `copy-to-workspace-modal`, `copy-target-collection-select`, `fork-copy-vars-checkbox`, `fork-copy-env-select`, `fork-target-workspace`, `fork-name-input`, `fork-submit-btn`, `share-link-exposure`, `share-link-modal`, `share-link-revoke-btn`, `share-link-result`, `share-link-generate-btn`, `admin-perm-close`, `admin-perm-role-help`, `admin-workspace-row`, `admin-dashboard-link`, `workspace-join-link-btn`, `join-link-input`, `join-link-submit-btn`, `join-link-error`, `workspace-invite-email-error`, `invite-links-empty`, `invite-link-row`, `invite-link-revoke-btn`, `invite-link-url`, `invite-link-copy-btn`, `invite-link-dismiss-btn`, `invite-link-create-btn`, `invite-link-role`, `invite-link-result`, `invite-title`, `invite-error`, `invite-join-btn`, `invite-home-btn`, `invite-row`, `invite-cancel-btn`, `member-role-text`, `member-role-select`, `member-remove-btn`, `member-email`, `member-row`, `workspace-search`, `workspace-select`, `workspace-members-tab`, `workspace-invite-role`, `workspace-name-input`, `workspace-save-btn`, `env-node-`, `new-env-btn`, `tab-environments`, `group-edit-variables-tab`, `group-add-var-btn`, `group-var-key`, `group-var-val`, `group-edit-save-btn`, `request-send-btn`, `response-status`, `request-url-input`, `auth-type-select`, `auth-bearer-token`, `dirty-indicator`, `confirm-cancel-btn`, `context-menu-item`, `add-request-row`.
- Templated ids resolve through code that builds them: `admin-tab-${tab}` (`client/src/pages/AdminPage.tsx:189`, tab list at l.184 includes `workspaces`); `toast-${toast.type}` (`client/src/components/common/ToastContainer.tsx:13`); `action-menu-${label slug}` (`CollectionExplorer.tsx:113`, label `'Fork (Auto-sync)'` at l.679 and `'Share via Link'` at l.691, `'Edit Settings'` at l.431); `req-tab-${slug}` (`RequestEditor.tsx:84`, tabs `'Tests'`/`'Authorization'` at l.14-18); `env-node-${env.name}` (`EnvironmentSidebar.tsx:137`); `workspace-option-${id}` (WorkspacePicker).
- Strings: `grep -rn "Permission Denied"` -> `client/src/components/request/UrlBar.tsx:39`; `"Database Connection Error"`, `"How to fix this"`, `"Common fixes:"` -> `client/src/App.tsx:36,57,62`; `"Forked into"` -> `client/src/components/collection/ForkModal.tsx:63`; `"Requires editor role on the target collection"` -> `server/src/routes/collections.ts:117`; `"Shared: ... Not shared: ... environment values"` -> `client/src/components/collection/ShareLinkModal.tsx:86`; `"Enter a valid email address"` present in the invite UI (checked via `workspace-invite-email-error`).
- Routes: `/api/health` -> `server/src/index.ts:303`; `/api/users/search` -> `server/src/routes/users.ts:9`, mounted at `index.ts:363`; `/api/share/collection/:id` POST -> `share.ts:84`; `/api/share/:shortId/fork` -> `share.ts:148`; `DELETE /api/share/:shortId` -> `share.ts:191`; `/api/workspaces/:id/duplicate` -> `workspaces.ts:129`; invite-links -> `workspaces.ts:290,301,306` and `index.ts:352`; `PUT/DELETE /api/requests/:id` -> `collections.ts:367,399`; `POST /api/collections/:id/fork` -> `forks.ts:135`; `collection:fork-synced` -> `forks.ts:570`; `collection:created` -> `forks.ts:302`; `myRole` in `GET /api/workspaces` -> `workspaces.ts:51`.
- Route probes in M1.4 (`/api/share/:id/proxy|execute|run|send`): `grep -rn "proxy" server/src/routes/share.ts` returns nothing, and `grep -an "shareProxy" server/src/index.ts` returns nothing. The probed paths are absent on purpose. This is the decision the test pins (its own comment), so it is **not** deprecated. Keep as is.
- Unsure: none.

## 4. DUPLICATES

No HIGH-confidence duplicate. Nothing is auto-deleted from this folder.

1. **MEDIUM: QA-28 positive check vs admin Workspaces row.**
   - `QA-28-workspace-plural.spec.ts:5` "Admin workspaces table uses singular for a count of 1"
   - `admin-workspaces-and-logs.spec.ts:53` (in the test at l.38) asserts the row contains `1 member`.
   - Same positive assertion. QA-28 adds two negative regexes on the whole `tbody`, which l.53 lacks. Fold those negatives into l.53, then drop QA-28.

2. **MEDIUM (overlap, not duplicate): share revoke.**
   - `share.spec.ts:5` (DELETE returns 200, then API GET returns 404)
   - `share-page-fork.spec.ts:130` "a revoked link shows an error page, not a blank one" (DELETE 200, then the page shows `shared-collection-error`)
   - Both revoke with the same wait. Each has a unique assertion (API 404 vs UI error page). Keep both. Do not drop either.

3. **LOW: viewer Save hidden.**
   - `rbac.spec.ts:5` (`request-save-btn` hidden, then visible after editor promotion)
   - `share-page-fork.spec.ts:161` (`request-save-btn` hidden, then Ctrl+S opens the fork modal)
   - Shared assertion (Save hidden for viewer). rbac is stronger (also covers the promoted state). The unique part of share-page:161 is the fork modal. Keep both.

4. **LOW: role change takes effect.**
   - `app-shell.spec.ts:68` (PUT 200, select value, then API POST collection 201 as editor)
   - `rbac.spec.ts:5` (promotion, then Save appears in UI)
   - Both promote viewer to editor. Different checks (API write vs UI button). Keep both.

5. **LOW: one-time / revoked link error state.**
   - `workspace-invite-links.spec.ts:184` (second accept is 410, message `already used`) and `:226` (revoked is 410, message `revoked`)
   - `workspace-invite-links.spec.ts:266` (UI: `This invite was already used` on the page) and `:318` (UI: `This invite was revoked`)
   - API status is covered by the API tests. The UI copy is unique to the UI tests. Keep all.

6. **LOW: full-email search.**
   - `user-search-full-email.spec.ts:10` (admin finds a user by full email, global search)
   - `user-directory-privacy.spec.ts:23` (co-member searches are scoped; full-email lookup of a stranger is refused)
   - Different callers, so different code paths (`global` vs co-member scope, `users.ts:18-21`). Not a duplicate. Keep both.

7. **LOW: fork flow.**
   - `fork.spec.ts:5` (fork to personal, toast, live socket rename)
   - `share-page-fork.spec.ts:221` (fork with copy-vars and copy-env)
   - Shared path: fork from shared ws to personal. Unique: socket sync (fork.spec) and option copying (share-page). Keep both.

8. **NOT duplicates (checked):**
   - QA-76 (`admin-perm-close`, Escape) vs QA-115 (`admin-perm-role-help`): same setup and same modal, different assertions. Merge the setup; keep both assertions.
   - input-validation-nul-ids `[Q7.7]` vs `admin/admin-users.spec.ts:88` `[Q7.7] concurrent reads`: both tagged Q7.7, but different behaviour (NUL ids vs concurrent reads). No overlap.
   - share-mtls-copy vs share.spec:5: both open the share modal; the only overlap is opening it. The exposure note is unique.
   - permission-toast (UI 403 toast) vs `platform/api-authorization.spec.ts` (API 403 per role): different layers.
   - share-page-fork:161 (copy-to-workspace modal) vs `collections-tree/collection-actions.spec.ts:120` and `variables-environments/environments-crud.spec.ts:69`: both reach the copy-to-workspace modal. Share-page checks the pre-set request; collections-tree checks the copy itself. Not duplicate.
   - workspace-duplicate vs `variables-environments/environments-crud.spec.ts:34` (Duplicate): different features (workspace vs environment).

## 5. MERGE RISKS per target

**Allow-list scope (highest silent-masking and failure risk):**
- `workspace-invite-links.spec.ts:7` uses the broad `/server-auth|status code 4\d\d|Request failed/i`. It hides every 4xx in the file, including unexpected ones. When moving to T4/T3, narrow it to `/server-auth|status code 40[13]/` at describe level. That still covers the anon 401 (l.261) and the editor 403s (l.249-251). The client does not report 404/409/410 anyway.
- `permission-toast.spec.ts:5`, `fix-M1.4.spec.ts:6`, `workspace.spec.ts:5` put file-level patterns on every test. Once merged into T5/T6/T1, scope them per test or per describe so that a new test in the file does not inherit them.
- `workspace-duplicate.spec.ts:4` allows 403 only. Keep it narrower than the workspace.spec pattern.
- `app-shell.spec.ts:14` `/api/health` is scoped to a nested describe with one test. Keep the nesting when moving to platform.
- `input-validation-nul-ids.spec.ts` declares nothing, and **test 1 likely fails the guard**. Its unauthenticated `POST /api/collections/%00/fork` (l.20) hits `forks.ts:46` `router.use(authenticate)`, so the 401 is recorded as `server-auth` (`index.ts:280-290`). Add an allow-list for that one test, or send an authenticated request. Verify by running before the move. This is a bug in the current file, not only a merge risk.
- `share-page-fork.spec.ts` and `share.spec.ts` declare nothing. Their 404s are not reported, so this is fine.

**Serial order and shared state:**
- T7 (share-page-fork tests 32, 82, 130): tests 82 and 130 log in as the user created in test 32 and reuse `Public Collection`. Keep `mode:'serial'` and the order. Running `--grep` on 82 or 130 alone will fail.
- `share-page-fork` `ts` is `describe`-scoped (l.21). Do not move it into a shared helper with a different scope.
- T3 `user-directory-privacy.spec.ts:33,62`: the stranger prefix `dirstranger` (first 11 chars) has no timestamp. A retry in the same DB can match an older stranger; with a 10-result cap this can hide the current one. Low risk, but add a unique suffix to the prefix.

**Global state:**
- No test in this folder writes system config, so no `allowPrivateTargets`-style race. Only app-shell test 1 writes state: it deletes the `/api/health` errors group by fingerprint (l.37). If it moves to platform, a concurrent health test could lose its evidence. Keep it in its own describe.
- QA-28, QA-76 and QA-115 create public-or-private workspaces in the admin list. Moving them to admin keeps them out of the `workspace-picker` list (which filters by `ts`, l.20). Their names carry `Date.now()`, so no collision.
- `workspace-picker.spec.ts:39` uses `page.mouse.click(600, 400)` for click-outside. Coordinate-based; keep it in its own describe or file if the viewport changes.

**Login method differences:**
- T4 and T3 use `makeUser`/`apiAs` (API) and `registerUser` (UI) in the same file. That is fine: each uses its own API context and an `X-Forwarded-For` header, so no rate-limit collision.
- `workspace.spec.ts:57` and `app-shell.spec.ts:68` both use a second `browser.newContext()` for the member. When merged into T3, keep the context close and close it.
- Standardise on `registerUser` (UI) where the test drives UI; `makeUser` where it is API-only. T1 `workspace.spec` registers inline; swap to `registerUser` only if the test name/email assertion allows it.

**Fresh user / empty workspace:**
- `workspace-invite-links.spec.ts:108` (UI owner-role select) counts `member-role-select` as `toHaveCount(2)` within the new personal workspace. Fine per test, but it breaks if a merged test reuses the same user.
- `user-directory-privacy.spec.ts` and `user-search-full-email.spec.ts` assert on global search results. They depend on the DB holding no extra users with the same prefix (see serial note above).
- `invite-links` expiry test (l.205) needs `REQSPACE_E2E_DB_PATH` (`playwright.config.ts:29`), SQLite, and `server/node_modules/better-sqlite3`. Keep the `test.skip` guard inside the test, not at describe level, or it skips the others.

**Unique-name collisions:**
- `Fork Options's Workspace` (share-page-fork l.273) and `Fork User ${ts}'s Workspace` (fork.spec l.14) are derived from signup names. Unique per run. Do not rename either user to a shared name.
- `Test User` is the default name in `registerUser`. Only collides if a test searches by name.
- `Public Collection`, `Forkable Collection`, `Viewer Collection` are per-user, so safe.

**Other:**
- `share-mtls-copy.spec.ts` is misnamed (QA-56 share-dialog copy, not mTLS). Rename on move.
- `fix-M1.4.spec.ts` passes before and after any code change (its own header). Low value but no defect; keep.

## 6. Tests that belong in a different world

| Test | Current | Move to | Reason |
|---|---|---|---|
| input-validation-nul-ids: 2 tests (l.12, l.32) | this folder | requests (or collections-tree for fork body) | NUL-id 4xx on request PUT/DELETE and fork |
| QA-28-workspace-plural (l.5) | this folder | admin `admin-workspaces-and-logs.spec.ts` | Admin Workspaces table |
| QA-76-permissions-modal-escape (l.5) | this folder | admin `admin-workspaces-and-logs.spec.ts` | Admin Manage Permissions modal |
| qa-115-permissions-role-help (l.5) | this folder | admin `admin-workspaces-and-logs.spec.ts` | Admin Manage Permissions modal |
| app-shell l.16 (DB outage) | this folder | platform | `/api/health` infra |
| app-shell l.41 (unknown path) | this folder | ui | routing |
| app-shell l.50 (dynamic variables) | this folder | variables-environments | `client/src/utils/dynamicVars.ts` |

The shared `admin/admin-users.spec.ts:88` Q7.7 test is already in admin and is not a copy of the input-validation tests.

Cross-world overlaps that do not need moving: `platform/api-authorization.spec.ts` (API 403 per role) and `collections-tree/collection-actions.spec.ts:120` (Copy to Workspace). Keep both where they are.
