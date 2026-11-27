# Consolidation plan: tests/e2e/variables-environments/ and tests/e2e/scripts/

Scope: 15 spec files (30 tests) in `variables-environments/`, 6 spec files (14 tests) in `scripts/`. Read-only analysis; no tests were run. pm-api.spec.ts also runs many sub-checks from one test (parity test l.65 expands to `bothCount*2 + preCount + postCount` results); those are not counted separately.

Login legend: **UI** = `registerUser` or inline login through the form; **API** = `apiAs()` / `page.request`; **ADMIN** = `admin` / `admin123456` (seeded superadmin); **SCENE** = `scene()` from `tests/e2e/scene.ts` (registers user prefix `repro`).

Correction for the admin report: `admin-env-ux.spec.ts` no longer exists under `tests/e2e/admin/`. It lives here, now with 2 tests (not 4). Drop it from the admin plan.

## 1. Per-file inventory

### variables-environments/

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| QA-13-add-variable-focus.spec.ts | 2 | "Add variable" focuses the new key input, env editor (l.11) and profile editor (l.21) | `describe` l.5; `beforeEach` l.6 registers `qa13`, opens Environments tab | UI |
| QA-14-env-save-feedback.spec.ts | 1 | Env Save shows success toast and is disabled when clean (l.5) | none | UI (`qa14`) |
| admin-env-ux.spec.ts | 2 | Undefined `{{var}}` modal + "Run Anyway" remembered (l.5); env selector switches active env (l.21) | `describe` l.4 | UI (`missingvar`, `envsel`); mocks `mv.example.test` |
| env-key-suggestions.spec.ts | 1 | Variable-name autocomplete: own env first, then other sources, then dynamic; keyboard, mouse, Escape (l.4) | none; seeds 2 envs and a profile var via API (l.8-11) | UI + API (`keysug`) |
| env-quicklook-actions.spec.ts | 1 | Env quick look: owner edits inline (persists); viewer can copy, not edit (l.5) | `describe` l.4; second browser page (l.15) | UI + API, 2 users |
| environments-crud.spec.ts | 4 | Sidebar Duplicate (l.34), Rename+Delete persist (l.51), Copy-to-Workspace menu (l.69), editor's own Copy-to-Workspace (l.96) | `describe` l.9; helpers `envMenu` l.12, `createEnv` l.17; `beforeEach` l.30 registers `envcrud`; `let email` l.10 | UI; API in tests 1, 3, 4 |
| environments.spec.ts | 3 | Create workspace (l.25); create env + var + select (l.34); secret masking, globals-vs-env precedence, export (l.70) | `describe` l.4, **serial** l.6; `WORKSPACE_NAME` l.10 (`Date.now()`); `workspaceId` shared across tests; `beforeEach` l.15 logs in | ADMIN |
| missing-variable-target.spec.ts | 3 | Missing-var scope defaults to Personal (l.21); create in chosen env (l.27); create in Global (l.52) | no describe; helper `openMissingModal` l.5 (route `mvt.example.test`, collection `MVT Col`) | UI; API seeding in tests 2, 3 |
| missing-variable-viewer.spec.ts | 1 | Viewer's missing-var modal offers Personal only, with "view-only access" (l.4) | none; second browser page | UI + API, 2 users |
| profile-variables-cross-workspace.spec.ts | 4 | Profile var created in A (l.52), still there after switch (l.73), resolves in a request from B (l.83), edit in B visible in A (l.92) | `describe` l.9, **serial** l.10; shared `EMAIL`/`WS_A`/`WS_B`/`PHONE` l.12-16; `login()` l.18 | UI (test 1 registers; 2-4 login) |
| qa-73-env-vanishes-after-rename.spec.ts | 1 | Env created while Rename prompt is open stays in the list (l.6) | none; pushes env via `page.evaluate` fetch | UI (`qa73`) |
| qa66-undefined-variable-error.spec.ts | 1 | Response pane names the undefined variable `nohost` (QA-109, l.7) | file-level `test.use({allowFpErrors: [/Network Error\|Failed to fetch/]})` l.4 | SCENE |
| variable-context-edit.spec.ts | 1 | Right-click `{{var}}` shows its source scope, edits it there, lists shadowed global (l.9) | none; `page.request` API | UI + API (`varctx`) |
| variable-hover.spec.ts | 1 | Hover tooltip: value, source, secret `••••`, dynamic, undefined (l.6) | file-level `test.use({viewport: 1800x900})` l.4 | UI + API (`varhover`) |
| variable-scopes.spec.ts | 4 | Collection vars (l.28); collection var resolves in request (l.66); profile save/reload/resolve (l.88); profile beats collection (l.117) | `describe` l.13, **serial** l.14; `EMAIL` l.17; `login()` l.20 | UI (test 1 registers; 2-4 login) |

### scripts/

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| group-scripts-activity.spec.ts | 2 | Collection, folder and request test scripts all run for one request (l.29); workspace Activity tab lists audit entries (l.110) | `describe` l.13, **serial** l.14; `EMAIL` l.17; helpers `container` l.19, `openMenu` l.23 | UI register (l.29); test 2 logs in as the same `EMAIL` and depends on l.29 creating the request |
| pm-api.spec.ts | 5 | pm.request/pm.response parity in pre + test phase (l.65); negative control FAIL (l.90); runner pre-request addHeader/method/url (l.98), body + header value (l.119), iterationData vs env (l.137) | no describe; module-level `readFileSync` of `tests/e2e/fixtures/pm-api-all.js` and section counts (l.11-15); `stubTransport` l.17 stubs `window.electron` via `addInitScript` | SCENE |
| qa42-pm-response-to.spec.ts | 1 | `pm.response.to.have.status(200)` PASS, `404` FAIL in a test script (l.5) | none | SCENE + `mockServer` |
| qa43-request-headers-snippet.spec.ts | 1 | "Set request header (pre-request)" snippet is in the editor and the request sends the header (l.5) | none | SCENE + `mockServer` |
| scripts-scope.spec.ts | 1 | Pre-request at collection and folder level, plus request-level; `{{colVar}}/{{folderVar}}` resolve in the URL (l.5) | `describe` l.4; self-registers `scripts_<ts>`; `page.route('https://example.com/**')` | UI |
| scripts.spec.ts | 4 | Pre-request sets env var (l.32); failing assertion message (l.77); `pm.sendRequest` sets globals (l.111); script isolation (l.136) | **serial** at file top l.3; `describe` l.5; `beforeEach` l.6 registers a random user and routes `httpbin.org` l.19 | UI register per test |

## 2. Proposed target spec files

### variables-environments: 15 files to 6 (40%)

**V1 `environments-lifecycle.spec.ts`** (5 tests)
- environments-crud.spec.ts:34 (Duplicate), :51 (Rename + Delete), :69 (Copy to Workspace, menu), :96 (editor Copy control)
- qa-73-env-vanishes-after-rename.spec.ts:6

**V2 `environments-editor.spec.ts`** (7 tests). Keep two describes: the ADMIN serial block and the fresh-user block.
- environments.spec.ts:25, :34, :70 (ADMIN serial describe, unchanged)
- QA-13-add-variable-focus.spec.ts:11, :21 (fresh-user describe)
- QA-14-env-save-feedback.spec.ts:5
- admin-env-ux.spec.ts:21 (env selector)

**V3 `missing-variables.spec.ts`** (5 tests)
- missing-variable-target.spec.ts:21, :27, :52 (with helper `openMissingModal` l.5)
- missing-variable-viewer.spec.ts:4
- admin-env-ux.spec.ts:5 (Run Anyway remembered)

**V4 `variable-popovers.spec.ts`** (4 tests): all UI popups over `{{var}}`
- variable-hover.spec.ts:6
- variable-context-edit.spec.ts:9
- env-key-suggestions.spec.ts:4
- env-quicklook-actions.spec.ts:5

**V5 `variable-scopes.spec.ts`** (4 tests, existing name kept; serial kept)
- variable-scopes.spec.ts:28, :66, :88 (see D2), :117

**V6 `profile-variables.spec.ts`** (4 tests)
- profile-variables-cross-workspace.spec.ts:52, :73, :83, :92

**Relocated out of this world** (1 test):
- qa66-undefined-variable-error.spec.ts:7 to the **requests** world. It asserts the send-error text from `client/src/components/request/UrlBar.tsx:143` ("Variables not defined in the current environment"), not the variables UI. Its `allowFpErrors` must move with it.

Count check: 5 + 7 + 5 + 4 + 4 + 4 = 29 kept, + 1 relocated = 30.

### scripts: 6 files to 1 (per your request)

**S1 `scripts.spec.ts`** (12 tests, existing name kept; absorbs the other 5 files)
- Pre-request group: scripts-scope.spec.ts:5; scripts.spec.ts:32; pm-api.spec.ts:98, :119, :137 (runner pre-request)
- Test-script group: group-scripts-activity.spec.ts:29; qa42-pm-response-to.spec.ts:5; scripts.spec.ts:77, :111, :136
- pm API group: pm-api.spec.ts:65; qa43-request-headers-snippet.spec.ts:5
- Plus the folded assertion from D1 (inside qa42's test). pm-api.spec.ts:90 is deleted as a duplicate.

**Relocated out of this world** (1 test):
- group-scripts-activity.spec.ts:110 (workspace Activity tab, audit log) to **workspaces-rbac-share** (workspace settings). It asserts `WorkspaceSettingsModal.tsx:229` (`workspace-activity-tab`) and `:456` (`activity-log-entry`). It must create its own request first, since it currently depends on l.29.

Count check: 12 kept + 1 deleted (D1) + 1 relocated = 14.

## 3. DEPRECATED tests

**None found.** Every testid, route and text the specs rely on exists in `client/src` or `server/src`. Evidence (quoted grep and hit):

- `grep -rF "env-profile-variables-btn" client/src`: 1 hit (ProfileVariablesEditor entry point, TopBar).
- `grep -rF "env-active-select" client/src`: 1 hit. `grep -rn 'data-testid="env-select"' client/src`: `client/src/components/layout/TopBar.tsx:205`.
- `grep -rn "env-copy-target\|env-copy-btn" client/src`: `EnvironmentTabEditor.tsx:187, :197`. `copy-target-workspace-select`, `copy-submit-btn`: 1 hit each in `CopyToWorkspaceModal.tsx`.
- `/duplicate` route: `server/src/routes/environments.ts:108` `router.post('/environments/:id/duplicate', ...)` (exists, so the duplicate test is valid).
- Context-menu labels: `CollectionExplorer.tsx:281-288` ("Rename", "Duplicate", "Copy to Workspace", "Delete") and `:431`, `:670` ("Edit Settings"). `action-menu-${label}` kebab id at `CollectionExplorer.tsx:113` gives `action-menu-edit-settings`. `New Folder` at `:429`.
- Toasts: `CopyToWorkspaceModal.tsx:64` `Copied "${sourceName}"` (matches environments-crud:83). `EnvironmentTabEditor.tsx:147` `Environment copied to workspace successfully!` (substring "copied to workspace" in environments-crud:108 matches).
- `grep -rn "variable-hover" client/src`: `VariableInput.tsx:245`. Its text: `Source: <b>{scopeLabel(...)}</b>` and `overrides` (`:255-256`); `scopeLabel` at `:86` yields "Profile" / "Environment <name>" / "Global".
- Popover: `VariablePopover.tsx:44` (`variable-popover`), `:48` (`-source`), `:58` (`-input`), `:65` (`-shadowed`), `:73` (`-save`). `Not defined in any scope` at `:49`.
- Missing modal: `MissingVariablesModal.tsx:31` ("view-only access"), `:105` (view-only text), `:152` ("Run Anyway"), `:153` (`missing-variables-create`).
- Quick look: `TopBar.tsx:33` `aria-label={`Copy ${v.key} value`}`, `:38` `Edit ${v.key} value`.
- Activity: `WorkspaceSettingsModal.tsx:229, :452 ("No recent activity found."), :456`. `server/src/routes/workspaces.ts:84` `GET /:id/activity`. `server/src/routes/collections.ts:348` `logAudit(..., 'create_request', ...)` (matches group-scripts:128).
- Script snippets: `ScriptEditor.tsx:14` ("Check Status Code is 200"), `:18` ("Set request header (pre-request)"; comment "headers.add() is not supported").
- pm.response chain: `client/src/sandbox/pmApi.ts:346` and `:351` implement `pm.response.to.have.status`. So QA-42 is valid.
- Response testids: `ResponseViewer.tsx:249` `response-tab-${tab}` (covers `response-tab-test_results`). `RequestEditor.tsx:84` `req-tab-${tab}` (covers `req-tab-tests`, `req-tab-pre-request-script`).
- Stale comment (not a deprecated test): group-scripts-activity.spec.ts:53-55 says `pm.response.to.have.status(...)` "isn't implemented". `pmApi.ts:334-351` implements it. Fix the comment when merging.

Unsure: none.

## 4. DUPLICATES

1. **HIGH: pm-api.spec.ts:90 vs qa42-pm-response-to.spec.ts:5**
   - pm-api.spec.ts:90 "pm.response negative control: a wrong assertion shows FAIL" (`status(404)` FAIL, `to.be.ok` PASS).
   - qa42-pm-response-to.spec.ts:5 "QA-42: pm.response.to.have.status(200) passes, a wrong status fails, in a test script" (`status(200)` PASS, `status(404)` FAIL).
   - Same behaviour: a wrong status chain assertion is FAIL and a right one is PASS.
   - Stronger: QA-42 (named regression, UI snippet path). Fold into it before deleting pm-api:90: the `results[0].text` contains `'404'` check (pm-api.spec.ts:95), and a `pm.test` using `pm.response.to.be.ok` PASS (pm-api.spec.ts:92).

2. **MEDIUM: variable-scopes.spec.ts:88 vs profile-variables-cross-workspace.spec.ts:83**
   - variable-scopes.spec.ts:88 "profile variables save, reload and resolve in a request": add profile var, reload, send `{{profilehost}}`, exact URL `toBe('https://profile-host.example.com/ping')` (l.114).
   - profile-variables-cross-workspace.spec.ts:83 "the profile variable resolves in a request sent from the other workspace": `toContain('tel=…')` only, after a switch.
   - Overlap: profile var resolves in a request. Unique in scopes:88: exact-URL assertion, the `all workspaces` hint (l.97), and resolution in the default workspace (no switch).
   - Fold: exact-URL `toBe` (l.114) and the default-workspace path into profile-variables-cross-workspace.spec.ts:83. Then delete scopes:88.

3. **MEDIUM: environments.spec.ts:34 vs environments.spec.ts:70 (same file)**
   - :34 "Create an environment, add a variable, select and verify": its only assertions are `env-select` value matches `/^[a-zA-Z0-9-]+$/` (l.59) and the URL input equals what was typed (l.67). Both pass without app behaviour (the regex matches any alphanumeric word).
   - :70 creates, saves, selects and sends a request with the same variable pattern.
   - Unique in :34: `Staging` persisted with `baseUrl` (l.50-53), not checked anywhere else.
   - Fold: after l.53, assert `baseUrl` is in the saved env (`env-var-key-0` after reopening). Then delete the rest of :34.

4. **LOW: scripts.spec.ts:77 vs qa42:5 and group-scripts-activity:29 (FAIL rows)**. All check FAIL rows. Unique in :77: the failure message `expected 1 to deeply equal 2` (l.104). Keep.

5. **LOW: environments-crud.spec.ts:69 vs :96**. Two different Copy-to-Workspace UIs (`CopyToWorkspaceModal` vs `EnvironmentTabEditor.tsx:187-197`). Keep both.

6. **LOW: qa-73:6 vs environments-crud.spec.ts:51**. QA-73 covers a socket push during the Rename prompt. Keep.

7. **LOW (cross-world): scripts/pm-api.spec.ts:137 vs runner/runner-iteration-data-vs-profile.spec.ts:34**. Both assert iteration data beats another scope, but the layers differ (environment vs profile). Keep both. Runner world owns the second.

8. **LOW (cross-world): variables-environments/QA-14-env-save-feedback vs collections-tree/QA-14-request-save-feedback.spec.ts:5**. Same QA family, different entity (env vs request). Keep.

Checked and not duplicates: `runner-missing-variables.spec.ts:4` (runner entry point, not the modal in tests here), `ctrl-s-saves-everywhere.spec.ts:5` (keyboard save, different), `environments-crud:69` vs `:96` (see 5), `profile-variables:52` vs `:73` (create vs read after switch), `variable-hover` vs `variable-context-edit` (hover vs popover).

## 5. MERGE RISKS per target

**Retry hazard (all serial describes that register in test 1):** The `EMAIL` is module-level (`profile-variables-cross-workspace.spec.ts:13`, `variable-scopes.spec.ts:17`, `group-scripts-activity.spec.ts:17`). A serial retry re-runs test 1, which calls `/register` with the same email, and fails with "already exists". `environments.spec.ts` already handles this by selecting by id (l.11-12). Either set `retries: 0` on these describes or make registration tolerant (login if register fails).

**Global state:**
- No test in either world mutates server or admin config. `environments.spec.ts` writes Globals to its own workspace (`selectWorkspace(workspaceId)`), not server settings.
- Profile variables are per user. V5 (`varscope_`) and V6 (`profilews_`) use different users. Keep them as separate users, or they collide.
- `ADMIN` login in environments.spec.ts (l.19-20) depends on the seeded `admin / admin123456`. `fixtures.ts` `loginAsAdmin` uses the same password. Do not change one without the other.

**Serial order and shared entities:**
- environments.spec.ts: tests 2 and 3 need `workspaceId` from test 1 (l.31). Keep the serial describe and the `ADMIN` beforeEach; do not place it under the fresh-user `beforeEach` of QA-13.
- variable-scopes.spec.ts: test 4 (l.117) needs `Scoped Request` from test 2 (l.77) and the collection var `shadowed` from test 1 (comment l.123). Keep order; test 3 (l.88) is independent (`profilehost`).
- group-scripts-activity.spec.ts: test 2 (l.110) needs the request created in test 1 (l.80-82). If it moves to workspaces-rbac-share, it must create its own request.

**`test.use` / `allowFpErrors` scoping (highest silent-masking risk):**
- qa66-undefined-variable-error.spec.ts:4 file-level `allowFpErrors` (`Network Error|Failed to fetch`). Moves to requests with it. Do not hoist it into V3, or every missing-variable test can hide network faults.
- variable-hover.spec.ts:4 file-level `test.use({viewport})`. Must be scoped to the hover describe in V4. Otherwise the context popover and quick-look tests change layout.
- No other file declares `allowFpErrors`. Every test in these two worlds is guarded by the fperrors check.
- environments.spec.ts test 3 (l.110) hits real `https://httpbin.org/get`, with no `page.route` mock, and no allow list. It is network-dependent and can fail the fperrors guard if httpbin is unreachable. scripts.spec.ts:19 mocks httpbin for the same purpose. Mock it, or keep it as is and say so.

**Scripts merge (S1):**
- scripts.spec.ts:3 `test.describe.configure({mode:'serial'})` is at file top. Moving the other 5 tests into this file makes them serial too. Move the configure inside the `Script Execution` describe.
- scripts.spec.ts:6-30 `beforeEach` registers a user and routes httpbin for every test in its describe. Do not hoist it to the file. pm-api, qa42, qa43 and scripts-scope use `scene()` or their own registration.
- pm-api.spec.ts:11 `readFileSync(join(__dirname,'..','fixtures','pm-api-all.js'))` stays valid while the file sits in `tests/e2e/scripts/`. Stale path comments: pm-api.spec.ts:6 and fixtures/pm-api-all.js:2 ("tests/e2e/pm-api.spec.ts"). Update them.
- pm-api `stubTransport` (l.17-36) stubs `window.electron` via `addInitScript`. It is per page, so it is safe, but apply it only to the tests that need it.
- scripts-scope.spec.ts:105-106 and :112 use `console.log`. Drop the noise on merge; keep the assertions.

**Unique-name collisions:**
- Names are per user or per workspace, so no cross-test collisions within each user. Watch the shared `Scope Collection` (scripts-scope:26) vs `Col` (scene) only if both run in one user.
- environments-crud.spec.ts:70 and :97 use `Env Target ${Date.now()}` and `Env Target B ${Date.now()}`. Keep the distinct prefixes.

**Tests that need a fresh or empty workspace:**
- environments-crud.spec.ts:87 and :112 assert the target workspace's env list is exactly `['Portable (Copy)']` / `['From Editor (Copy)']`. They need the new workspace from the same test. Keep that creation inside each test.
- missing-variable-target.spec.ts:29 and missing-variable-viewer depend on `registerUser` giving a fresh user with only `Personal`.

**Fixture/setup duplication to fold (no behaviour change):**
- Login blocks: `loginUi` / `loginAdminUi` exist in `helpers.ts:17,25`. `login()` helpers in profile-variables:18 and variable-scopes:20 can use `loginUi(page, EMAIL, 'password123')`. Same for pm-api `scene` vs group-scripts `container/openMenu`.
- The `route` + `fulfill` mock for `*.example.test` is repeated across 6 files. Keep per-test hosts (they are unique per test).

## 6. Tests that belong in a different world

| Test | Current | Belongs in | Why |
|---|---|---|---|
| qa66-undefined-variable-error.spec.ts:7 | variables | requests (send errors) | asserts the send-error text (`UrlBar.tsx:143`); file-level `allowFpErrors` moves with it |
| group-scripts-activity.spec.ts:110 | scripts | workspaces-rbac-share | Workspace Activity tab (`WorkspaceSettingsModal.tsx:229, :456`), audit log; must create its own request |
| pm-api.spec.ts:98, :119, :137 | scripts | runner (optional) | Collection Runner pre-request; the user asked for all script tests in one scripts spec, so they stay in S1 |
| missing-variable-viewer.spec.ts:4 | variables | workspaces-rbac-share (optional) | viewer RBAC; it is about the missing-var modal, so it stays in V3 |
| environments.spec.ts:25 | variables | workspaces (optional) | workspace creation as serial prerequisite; kept with the serial block |
