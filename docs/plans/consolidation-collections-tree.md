# Consolidation plan: tests/e2e/collections-tree/

Scope: all 18 `*.spec.ts` directly under `tests/e2e/collections-tree/`, 36 tests in total. Read-only analysis; no tests were run.

Login legend: **REG** = `registerUser()` helper (fresh user, empty workspace), **UI-REG** = inline `/register` form, **UI-ADMIN** = seeded `admin`/`admin123456`, **UI-LOGIN** = `/login` form with a known account, **API** = `apiAs`/`request` setup.

## 1. Per-file inventory

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| collection-actions.spec.ts | 5 (l.37 setup, l.93, l.120, l.158, l.183) | Documentation, Copy to Workspace (collection + request), Export | `describe` serial (l.11); consts `ts`, `EMAIL`, `SOURCE_WS`, `TARGET_WS`, `COLLECTION`; local `menuFor`, `openMenu`, `login` (l.19-35) | test 1 UI-REG; tests 2-5 UI-LOGIN (`login()`, `password123`) |
| collection.spec.ts | 5 (l.25, l.36, l.58, l.75, l.106) | Create workspace, collection, folder; rename collection + delete folder; duplicate/move/"reorder" + reload | `describe` serial (l.4-6); `let workspaceId` shared across tests (l.15); `beforeEach` UI-ADMIN login (l.17-23); no `test.use` | UI-ADMIN (every test) |
| crud-rename.spec.ts | 1 (l.17) | Matrix: rename workspace, collection, request, env variable, query param | `describe`, no serial; `beforeAll` API register with uuid email (l.10-15) | UI-LOGIN (test body) |
| QA-14-request-save-feedback.spec.ts | 1 (l.5) | Saving a request shows "Request saved" toast | none | REG |
| QA-20-rename-dirty-tab-not-conflict.spec.ts | 1 (l.8) | Renaming a dirty request keeps the orange dot, no conflict dot | none; `waitForTimeout(1500)` (l.24) | REG |
| QA-44-tree-drag-reorder.spec.ts | 1 (l.5) | Drag request onto sibling reorders and persists | none; API seeds 3 requests | REG + API |
| QA-64b-duplicate-keeps-raw-url.spec.ts | 1 (l.5) | Tree Duplicate and Duplicate Tab keep `{{baseUrl}}` | none | REG |
| QA-77-save-copy-default-collection.spec.ts | 1 (l.5) | Save dialog after Duplicate Tab defaults to original collection | none | REG |
| context-menu-stays-open.spec.ts | 1 (l.4) | Right-click menu closes on outside right-click and on window blur | none; API seed collection; `page.mouse` coords | REG + API |
| dirty-indicator-reverted-edits.spec.ts | 2 (l.5, l.16) | Request tab clean after revert of header; env tab clean after adding an unfilled row | none | REG (both) |
| qa-62-collection-menu-grouping.spec.ts | 1 (l.4) | Collection menu has ≥3 separators, "Edit Settings" named, no bare "Edit" | none | UI-REG (inline, `qa62_${ts}`) |
| qa02-new-request-opens.spec.ts | 1 (l.5) | Request created from collection menu opens in editor | none | REG |
| save-as.spec.ts | 2 (l.22, l.59) | New request creates collection+folder from Save modal; Save vs Save As... | `describe` serial (l.10); `beforeEach` UI-REG with random suffix (l.12-20) | UI-REG |
| tree-ops.spec.ts | 8 (l.25, l.49, l.84, l.96, l.112, l.134, l.150, l.166) | Delete request in folder; cascade folder delete; sidebar filter; re-open keeps edits; rejected save; folder DnD (folder, collection, subtree) | `test.use({allowFpErrors:[/Failed to update request .*status code 400/]})` at file level (l.5); `beforeEach` REG (l.21-23); `apiAs` in cascade test | REG (+ API) |
| tree-menu.spec.ts | 1 (l.5) | Long collection name has `title` tooltip; menu has Edit Settings, separator, opacity 1 | none | REG |
| collection-pin.spec.ts | 1 (l.5) | Pinned collection on top across sort modes and reload; unpin restores order | `describe` (not serial) | REG |
| collection-settings-gear.spec.ts | 1 (l.4) | Gear next to collection opens Edit collection dialog | none; API seed collection | REG + API |
| collection-sort.spec.ts | 2 (l.5 menu items, l.23 sort persistence) | Collection menu drops New Request/Sort A-Z/Fork; folder menu drops New Request/Sort; sort modes persist | `describe` (l.4, not serial) | REG (both) |

Test total check: 5+5+1+1+1+1+1+1+1+2+1+1+2+8+1+1+1+2 = 36.

## 2. Proposed target spec files

Seven targets (18 files → 7, about 39%). Counts sum to 36 with one test relocated to another world.

**T1 `collection-menu.spec.ts`** (5 tests)
- qa-62 l.4 (strongest menu test; keep)
- tree-menu l.5 (fold its tooltip `title` check and `opacity` check into qa-62, then delete the test; see dup #1)
- collection-sort l.5 (menu drops items)
- context-menu-stays-open l.4
- collection-settings-gear l.4

**T2 `collection-crud.spec.ts`** (6 tests)
- collection.spec l.25, l.36, l.58, l.75, l.106 (keep serial describe and `workspaceId`)
- crud-rename l.17, collection + request rename portion only. Its workspace, env-variable and query-param steps move to other worlds (section 6).

**T3 `collection-workspace-actions.spec.ts`** (5 tests): collection-actions.spec.ts unchanged in content, renamed only. Keep its serial describe.

**T4 `tree-ops.spec.ts`** (7 tests)
- tree-ops l.25, l.49, l.84, l.134, l.150, l.166 (6 tests)
- QA-44 l.5 (reorder; belongs with the tree-DnD tests)

**T5 `request-dirty-state.spec.ts`** (4 tests)
- QA-20 l.8
- dirty-indicator-reverted-edits l.5 (request tab only; env tab l.16 moves out, section 6)
- tree-ops l.96 (re-open keeps unsaved edits)
- tree-ops l.112 (rejected save leaves tab dirty). Needs `test.use` allowFpErrors for the 400 (see merge risks).

**T6 `request-save-flows.spec.ts`** (6 tests)
- QA-02 l.5, QA-14 l.5, QA-77 l.5, QA-64b l.5
- save-as l.22 and l.59 (keep serial describe and its `beforeEach`)

**T7 `collection-sort-pin.spec.ts`** (2 tests)
- collection-sort l.23 (sort modes persist)
- collection-pin l.5 (pin persists and unpins)

Mapping check: T1 5 + T2 6 + T3 5 + T4 7 + T5 4 + T6 6 + T7 2 = 35. The 36th test (dirty-indicator l.16, env tab) relocates to the variables-environments world.

## 3. DEPRECATED tests

**None found.** Every feature and testid these specs rely on exists in client/src.

Evidence:
- Collection menu items come from `client/src/components/collection/CollectionExplorer.tsx:695-703`: View Documentation, Copy to Workspace, Export, Pin to Top / Unpin, Edit Settings, Duplicate. The menu renders `data-testid={`action-menu-${label}`}` (l.113), so `action-menu-edit-settings`, `action-menu-view-documentation`, `action-menu-export`, `action-menu-unpin` and `action-menu-duplicate` all exist.
- Testids confirmed by grep (`data-testid` in client/src): `documentation-modal`, `doc-request-`, `doc-folder-`, `copy-to-workspace-modal`, `copy-target-collection-select`, `copy-submit-btn`, `pin-`, `settings-`, `collection-sort-select`, `group-edit-variables-tab`, `conflict-indicator`, `request-save-menu-btn`, `save-menu-save`, `save-menu-save-as`, `save-req-new-collection`, `save-req-new-folder`, `save-req-submit-btn`, `create-request-btn`, `tab-menu-duplicate`, `action-menu-separator`.
- Sort options: `CollectionExplorer.tsx:1146-1149` has `manual`, `created`, `updated`, `name`, so the `selectOption('created')` and `('manual')` calls are valid.
- Toast/text: `UrlBar.tsx:723` "Request saved"; `EnvironmentTabEditor.tsx:105` "Environment saved"; `UrlBar.tsx:658` and `ConnectionEditor.tsx:436` "Save failed: …"; `CollectionExplorer.tsx:947` "Delete Request"; `CollectionExplorer.tsx:1185` "No results for …"; `CollectionExplorer.tsx:865` placeholder "Filter requests...".
- Copy naming: `collectionStore.ts:626` "Copy of", `collectionStore.ts:794` and `CopyToWorkspaceModal.tsx:82` "(Copy)".
- Server routes: `server/src/routes/auth.ts:420` PUT `/api/auth/settings`; `collections.ts:126` GET `/workspaces/:workspaceId/tree` (with `?full=1`, l.123); `collections.ts:367` PUT and `:399` DELETE `/requests/:id`; `importExport.ts:26` GET `/collections/:id/export`.

**Negative assertions (not deprecated, but worth knowing):**
- collection-sort l.11-12 asserts `action-menu-sort-a-z`, `action-menu-fork-to-workspace`, `action-menu-duplicate-/-fork`, `action-menu-new-request` do not exist. Grep `Sort A-Z|sort-a-z|Fork to Workspace|fork-to-workspace|duplicate-/-fork|Duplicate / Fork` in client/src returned **No matches**. The assertions pass today and would catch a regression that re-adds the items, so keep them.

**Broken assertion (not deprecated, but a silent no-op):**
- crud-rename l.42: `await expect(page.getByText('Loading details...')).not.toBeVisible();`. The source is `client/src/components/workspace/WorkspaceSettingsModal.tsx:240`: `<span>Loading details…</span>` with a Unicode ellipsis (U+2026), not three dots. The locator never matches, so `not.toBeVisible()` returns immediately and the wait the comment describes (l.37-40) does not happen. The race it guards is real, so the test is flaky rather than wrong on every run. Fix when moving: wait on the real text or on the name input value. This is a bug to fix, not a reason to delete.

## 4. DUPLICATES

1. **MEDIUM: qa-62 vs tree-menu.**
   - `qa-62-collection-menu-grouping.spec.ts:4` "QA-62: collection menu is grouped with separators and Edit is named"
   - `tree-menu.spec.ts:5` "collection menu is grouped with separators and names Edit Settings"
   - Both assert a separator is visible and "Edit Settings" is a visible item on a collection menu.
   - qa-62 is stronger: it asserts ≥3 separators and that no bare "Edit" item exists.
   - tree-menu's unique assertions are `toHaveAttribute('title', name)` on the truncated node (tooltip) and `toHaveCSS('opacity','1')` on the menu. Fold both into qa-62, then delete tree-menu.
   - Confidence medium: the two tests are not strict subsets, so the fold must happen first.

2. **LOW (not for deletion): rename-collection step in collection.spec.ts:75 and crud-rename.spec.ts:17.**
   - Both rename a collection through the menu and assert the new name is visible.
   - Different users/data and crud-rename also covers requests. Keep both; if you want to drop one step, drop it from collection.spec (its unique value is folder delete).

3. **LOW (partial, not deletable): collection-pin.spec.ts:5 sort step vs collection-sort.spec.ts:23.**
   - Both PUT `/auth/settings`, clear localStorage, reload, and assert the name sort order persists.
   - collection-sort is stronger (covers `created` and `manual` too). The pin test's unique value is pin and unpin, so keep the test. Optionally drop its sort steps. Confidence low because it is a sub-step, not a whole test.

4. **NOT duplicates (checked, listed to stop re-checks):**
   - collection-sort.spec l.5 (menu items) vs qa-62: qa-62 checks separators and Edit name; collection-sort checks absence of items. Different assertions.
   - tree-ops l.96 (re-open keeps edits) vs dirty-indicator l.5 (revert leaves clean): different state checks.
   - QA-44 (drag reorder, `collection-sort`-independent) vs collection.spec l.106: collection.spec's title says "reorder survives reload", but it performs no reorder. Its real assertions are duplicate and move-by-drag. Not a duplicate, but the title is misleading; rename it when moving.
   - QA-77 (default collection in save dialog) vs save-as l.59 (Save vs Save As): different assertions.
   - collection-actions l.158 (copy request) vs QA-64b: different.

## 5. MERGE RISKS per target

**T2 collection-crud (serial chain):** collection.spec tests are serial and depend on each other. `workspaceId` (l.15) is set by test 1 and read by tests 2-5. Test 4 renames to "Renamed Collection", and test 5 (l.114) waits for it. The `beforeEach` UI-ADMIN login (l.17-23) runs before every test. Keep the serial `describe` and the `let` in that describe scope. Do not put these tests in a shared describe with other tests. Uses the seeded `admin` account, so forced-password or user-suspension tests in the admin world can break it (see section 6).

**T3 collection-workspace-actions (serial chain):** test 1 (l.37) registers `EMAIL` and creates `COLLECTION` with its folder and requests; tests 2-5 log in as that user and depend on that data. Keep serial and keep the file self-contained. Do not split it.

**T4 tree-ops:** `test.use({allowFpErrors:[/Failed to update request .*status code 400/]})` at l.5 applies to every test in the file. Once T5 takes the rejected-save test (l.112), the other tests in T4 do not need it. Move the allow list into the T5 file, scoped to the single test or its describe. QA-44 does no failing requests, so it needs no allow list. The cascade test (l.49) asserts the whole personal workspace tree is `[]`/`['Root Req']`. It relies on a fresh `registerUser` workspace, so it breaks if the test is moved into a shared-user describe.

**T5 request-dirty-state:** tree-ops l.112 uses `page.route` to force a 400 on PUT `/api/requests/*`. Keep the `page.unroute` before the retry (l.127). Timing: QA-20 uses `waitForTimeout(1500)` (l.24), which is flaky under load. Consider a socket-event wait, but do not change the assertion. The allow list (section above) must cover the 400 from l.112.

**T6 request-save-flows:** save-as's `beforeEach` (l.12-20) registers a user with a random suffix, so the two tests do not share data. Each test is independent apart from the `describe` serial mode. QA-77 is the only test here whose expected `bg-primary` class is styling-coupled; a class rename would break it, not behaviour.

**T1 collection-menu:** no shared state. Each test uses `registerUser` (fresh user). Test titles use `Menu Col` and `Col` in fresh users, so no collisions. collection-settings-gear uses `Col` and the gear testid `settings-Col` (CollectionExplorer.tsx:767), so keep the name per user.

**T7 collection-sort-pin:** both tests call `localStorage.clear()` and rely on the server-persisted `/auth/settings` PUT. Per-user, so safe. Both assert the full ordered name list via `names()` (`[data-testid="node-Bravo"], ...`), so any extra collection in a fresh user changes nothing, but a shared workspace with other collections named Bravo/Alpha/Charlie would break. Keep registerUser.

**Fresh user vs shared user:** tree-ops cascade (l.49), tree-ops filter (l.84, expects only "Filter One" and "Filter Two"), and tree-menu/collection-settings-gear (single collection) depend on an empty personal workspace. Do not merge them into a describe that shares a user.

**Helpers and login:** most tests use `registerUser` (`helpers.ts:5`). collection.spec uses UI-ADMIN, which is a different account. collection-actions registers inline and logs in with `password123`. Standardise on `registerUser` only where the test does not need the seeded admin, and keep collection.spec on the admin login.

**allowFpErrors scoping:** only tree-ops declares it, at file level (l.5). No other collections-tree file has a `test.use`. The fperrors guard fails any file-level or unscoped 4xx/5xx, so do not add a file-level allow list to T1 or T6.

**Unique-name collisions:** all names in collection.spec are fixed (`Test Collection`, `Test Folder`, `Renamed Collection`, `Sort Collection`). They are safe only because the workspace is per-run (`Date.now()` at l.11). Keep that. collection-actions uses `ts` in all names.

**Global settings mutated:** collection-pin and collection-sort write `/auth/settings` (sort mode, pinned list). These are per-user, so they are safe for fresh users. collection.spec and collection-actions log in as the seeded admin/fresh user; if an admin-world test changes admin's sort/pinned settings, collection-sort assertions could be affected. Low risk.

**Waits:** QA-20 (l.24), save-as l.76 (`waitForTimeout(600)`) use fixed sleeps. Keep them unchanged in the move.

## 6. Tests that belong in a different world

- **crud-rename.spec.ts**
  - l.19-50 "Rename Workspace": **workspaces** world.
  - l.52-72 "Create Environment, Variable, and Rename Variable": **variables-environments** world.
  - l.123-134 "Query parameter rename, URL update": **requests** world (request editor).
  - Only l.74-117 (collection and request rename) stays in T2.
- **dirty-indicator-reverted-edits.spec.ts l.16-26** "environment tab: adding a row and never filling it": **variables-environments** world.
- **QA-02, QA-14, QA-77, QA-64b, save-as l.22/l.59, tree-ops l.96/l.112, QA-20 and dirty-indicator l.5**: these test the request editor (tabs, save, Save modal), so they belong in the **requests** world. They are mapped to T5/T6 here so no coverage is lost. Move the whole T5/T6 files when the requests world is consolidated.
- **collection-actions.spec.ts l.158-181** (copy a request into a chosen collection) overlaps **workspaces-rbac-share** (`share-page-fork.spec.ts:214` uses `copy-to-workspace-modal`) and **legacy-manual** (`manual-failed-d.spec.ts:362`, `manual-failed-abc.spec.ts:383`). Cross-world overlap was located by grep only, not compared assertion by assertion.
- **collection-actions.spec.ts l.183-200** (Export) overlaps **import-export** (`import-export/import.spec.ts:87` uses `action-menu-export`). Cross-world overlap located by grep only.
- **QA-14 "Request saved" toast** also appears in `requests/requests.spec.ts` (grep hit). Not compared; check when the requests world is consolidated (possible duplicate, confidence unknown).
