# Consolidation plan: tests/e2e/ui/

Scope: all `*.spec.ts` directly under `tests/e2e/ui/`. The folder holds **16** spec files and **31** tests. Read-only analysis; no tests were run and no file was changed.

Login legend: **REG** = inline `registerUser()` (helpers.ts:5) or an inline register form; **ADMIN** = admin login (`admin` / `admin123456`, inline or `loginAdminUi`); **ANON** = no login.

Evidence legend: `grep` counts are the number of files under `client/src` that contain the string (the grep was run with ripgrep-style `-rl`).

## 1. Per-file inventory

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| QA-19-settings-escape.spec.ts | 1 | Escape closes Global Settings (`settings-btn`) | none, no describe | REG (`qa19`) |
| console-resizable.spec.ts | 1 | Console drawer height changes by mouse drag on its top edge and by ArrowDown | none | REG |
| ctrl-s-saves-everywhere.spec.ts | 2 | Ctrl+S saves Profile variables (l.5) and Workspace Settings (l.17) | none | REG x2 |
| escape-modals.spec.ts | 1 | One test, two parts: Escape closes the collection runner (l.4-18) and Escape cancels a dirty-tab ConfirmModal (l.20-27) | none; l.7 `isVisible().catch()` branch on `new-collection-empty-btn`, no wait | REG (`esc_modals`) |
| modals-consistency.spec.ts | 2 | New Workspace is an inline field, no dialog (l.5); runner title `Run “X”` has no colon (l.17) | none; uses helpers `createCollectionUi`, `openNodeMenu` | REG x2 |
| primary-button-contrast.spec.ts | 1 | Login submit button has at least 4.5:1 contrast for white text | none; canvas colour probe | ANON, `/login` only |
| qa-11-empty-state-create-request-flow.spec.ts | 2 | Empty-state "Create a Request" asks for a name and saves into the first collection (l.5); with no collection it opens a draft (l.17) | none; uses `createCollectionUi` | REG x2 |
| qa-dialogs-escape-and-role.spec.ts | 1 | Global Settings has `role=dialog`; Escape closes it (opened via aria-label `Open general settings`) | none | REG (`qa19`) |
| r2-01-sidebar-logo-tooltip.spec.ts | 1 | Logo link has title `Reqspace home`; `import-btn` has title `Import` | none; **no helper**, raw register form, does not wait for `workspace-select` | manual register (`Date.now()` email) |
| settings-about-version.spec.ts | 1 | Global Settings About shows an `x.y.z` version | none | REG |
| settings-certs-admin.spec.ts | 5 | (l.24) client cert persists across reload, only metadata returned (SEC-8); (l.73) cert form requires hostname, cert and key; (l.92) admin creates a user who can then log in; (l.140) duplicate email shows an error in the modal; (l.159) extension prompt shows and dismissal is remembered | `test.use({allowFpErrors:[/server-auth\|status code 40[013]/]})` l.4 applies to **all 5** tests; `describe.configure serial` l.16; `const ts = Date.now()` at describe scope l.18; `test.skip(REQSPACE_TARGET!=='electron')` on l.25 and l.74 | l.24 and l.159 REG inline; l.92 and l.140 ADMIN inline (l.96-97, l.142-143); l.92 uses `browser` for a fresh context (l.122); **l.73 logs in as the user created in l.24** (cross-test dependency) |
| settings.spec.ts | 4 | Global Settings: request settings PUT and survive reload (l.22); configured timeout applied to a hanging request (l.52); local proxy config stored (l.73); rebound search shortcut replaces Ctrl+K (l.101) | `test.describe('Global Settings')` l.9 with `describe.configure serial` l.10; `beforeEach` l.12-20 registers a fresh user per test with an inline random email; no allowFpErrors | REG inline in beforeEach |
| tab-bar-scrollbar.spec.ts | 1 | Tab bar hides its scrollbar (`scrollbar-width: none`); tab names have a title tooltip | none | REG |
| tab-method-theme-color.spec.ts | 1 | Request tab `GET` label colour equals the `--color-get` theme token | none; `page.evaluate` probe element | REG |
| tabs-history-theme.spec.ts | 5 | Dirty-tab close asks first (l.27); tab context menu close others / right / left with confirmation (l.40); history delete one then clear all (l.66); "Save Request History" off stops logging (l.95); theme toggle survives reload (l.117) | `test.describe('Tabs, history and theme')` l.9; `beforeEach` l.10-12 registers `tabs_hist` per test; local helpers `openTabs` l.14, `tabs` l.24 | REG (beforeEach) |
| tabs.spec.ts | 2 | Drag-reorder tabs, reopen from sidebar, check order (l.23); drag-reorder keeps content per tab and shows unsaved indicator (l.90) | `test.describe('Tab Operations')` l.22; no beforeEach; each test registers inline with `Date.now()` emails; local `dragTabOnto` l.14 | REG inline x2 |

Count check: 1+1+2+1+2+1+2+1+1+1+5+4+1+1+5+2 = **31**.

## 2. Proposed target spec files

Six targets (16 files down to 6, about 38 %). Retained tests: **22** of the 31 (21 whole tests kept, plus the kept half of `escape-modals`). Dropped: 1 (duplicate). Relocated out of ui: 8 whole tests and 1 half-test.

**T1 `ui/global-settings.spec.ts`** (6 tests)
- settings.spec.ts l.4 (describe block l.9, serial l.10, beforeEach l.12): all 4 tests (l.22, l.52, l.73, l.101), kept as a nested `describe` so the serial mode does not leak.
- settings-about-version.spec.ts l.4
- qa-dialogs-escape-and-role.spec.ts l.5 (the surviving Escape test; see dup 1)

**T2 `ui/global-settings-certificates.spec.ts`** (2 tests, desktop only)
- settings-certs-admin.spec.ts l.24 and l.73
- Keep `describe.configure serial`, the two `test.skip(...electron)` lines, and their own `ts`. Do not use the file-level allowFpErrors (no 4xx is expected in these two tests).

**T3 `ui/extension-install-prompt.spec.ts`** (1 test)
- settings-certs-admin.spec.ts l.159
- Recommended destination: `platform/` (see section 6). Keep as a standalone file until that decision is made.

**T4 `ui/tab-bar.spec.ts`** (7 tests)
- tabs.spec.ts l.23 and l.90 (both tests, `describe('Tab Operations')`)
- tabs-history-theme.spec.ts l.27 (dirty close) and l.40 (context menu)
- tab-bar-scrollbar.spec.ts l.5
- tab-method-theme-color.spec.ts l.5
- escape-modals.spec.ts l.20-27 (the confirm half only, rewritten as its own test)
- Keep the `beforeEach` (tabs-history l.10) inside its own `describe`, so it does not register a second user for tabs.spec tests.

**T5 `ui/history-and-theme.spec.ts`** (3 tests)
- tabs-history-theme.spec.ts l.66 (history delete and clear all), l.95 (save-history toggle), l.117 (theme toggle)
- The two history tests belong to the history-search world (see section 6). Move them there when that world is consolidated; the theme test stays.

**T6 `ui/keyboard-and-modals.spec.ts`** (3 tests)
- ctrl-s-saves-everywhere.spec.ts l.5 and l.17 (both tests)
- modals-consistency.spec.ts l.5 (New Workspace inline field)

**Relocate out of ui/** (8 whole tests, 1 half-test; no coverage lost)
- qa-11-empty-state-create-request-flow.spec.ts l.5 and l.17 to `collections-tree/` (empty-state create-request flow)
- console-resizable.spec.ts l.5 to `requests/` (console drawer; sits with `requests/cookies-console.spec.ts` and `requests/editor-layout.spec.ts`, which also use `console-toggle-btn`)
- r2-01-sidebar-logo-tooltip.spec.ts l.4 to `workspaces-rbac-share/app-shell.spec.ts` (sidebar shell)
- primary-button-contrast.spec.ts l.8 to `auth/auth-forms.spec.ts` (login page)
- modals-consistency.spec.ts l.17 (runner title) to `runner/runner.spec.ts`
- escape-modals.spec.ts l.4-18 (runner half) to `runner/runner.spec.ts`; the confirm half is kept in T4 (split, so the file-level test count goes from 1 to 2 with no loss)
- settings-certs-admin.spec.ts l.92 (admin creates a user who can log in) and l.140 (duplicate email error) to `admin/admin-users.spec.ts`. Both use the ADMIN login. `admin/admin-users.spec.ts` already exists from the admin consolidation.

**Dropped as duplicate** (1): QA-19-settings-escape.spec.ts l.5 (see section 3, dup 1).

## 3. Duplicates

1. **HIGH: QA-19 vs qa-dialogs (Escape closes Global Settings).**
   - `tests/e2e/ui/QA-19-settings-escape.spec.ts:5` "Escape closes Global Settings"
   - `tests/e2e/ui/qa-dialogs-escape-and-role.spec.ts:5` "Global Settings is a dialog and Escape closes it"
   - Both register a user, open Global Settings, assert the close button is visible, press Escape, and assert the close button count is 0. Same assertions. QA-19 uses `settings-btn`; qa-dialogs uses the aria label and additionally asserts `role=dialog`.
   - Stronger: qa-dialogs (superset). Unique assertion of the weaker one: opening by `settings-btn`. That is still covered by settings.spec.ts l.29 (`settings-btn` in every test), so nothing is lost.
   - Action: delete QA-19 (only automatic deletion, see confidence).

2. **MEDIUM: extension prompt in ui vs `legacy-manual/manual-failed-nop.spec.ts:625` (P6.1).**
   - `tests/e2e/ui/settings-certs-admin.spec.ts:159` "the extension prompt appears in a plain browser and stays dismissed"
   - `tests/e2e/legacy-manual/manual-failed-nop.spec.ts:625` "[P6.1] first visit without the extension prompts, and the Download link serves a real zip"
   - Both assert `extension-install-prompt` is visible after register. The ui test is stronger for the prompt (text, How to install, dismiss, remembered). P6.1's unique assertion is the zip download (keep it, it is not in ui).
   - Action: when the legacy world is consolidated, delete only the prompt lines of P6.1. Not deleted here. Confidence medium because they are in different worlds.

3. **MEDIUM: dirty-tab close confirm in tabs-history vs `escape-modals.spec.ts:20-27`.**
   - `tests/e2e/ui/tabs-history-theme.spec.ts:27` "closing a dirty tab asks first; Cancel keeps it, confirming closes it"
   - `tests/e2e/ui/escape-modals.spec.ts:4` "Escape closes the collection runner and cancels a confirm dialog" (second half)
   - Both open a dirty tab, close it, assert `confirm` appears, cancel, and assert the tab is kept.
   - Stronger: tabs-history:27 (Cancel and confirm paths). Unique assertion of the weaker one: pressing Escape cancels the confirm.
   - Fold before deleting: add `await page.keyboard.press('Escape')` and the `toBeHidden` assertion as a second step at the end of tabs-history:27. Then delete the confirm half of escape-modals. Confidence medium, so not auto-deleted.

4. **LOW: tabs.spec l.23 vs l.90 (drag reorder).** Both drag tab 2 onto tab 1 and assert order. l.90 is stronger (checks content follows the tab and the unsaved indicator). l.23 unique: sidebar reopen and collection save. Not a duplicate; keep both.

5. **LOW: tabs-history l.66 (history delete and clear all) vs `history-search/fix-K4.4.spec.ts` (Clear All with a filter).** Different assertions (K4.4 checks that Clear All only clears the filtered rows). Partial overlap on the clear path. Keep; move with the history tests (section 6).

6. **LOW: settings.spec l.52 (timeout applied) vs nothing in ui.** Not a duplicate, but a weak assertion: it only checks that `response-status` appears within 15 s, which a network error would also satisfy. Note for the owner; not a deletion candidate.

7. **NOT duplicates (checked, listed to stop re-checks):**
   - settings.spec l.73 (proxy config stored) vs `platform/fix-P3.1.spec.ts:49` (`proxy-enable-checkbox`): P3.1 checks the transport receives the proxy. Different.
   - settings.spec l.101 (rebound Ctrl+K) vs `history-search/global-search.spec.ts` Ctrl+K tests: the ui test rebinds the shortcut in the user's settings. Different.
   - tabs-history l.117 (theme persists across reload) vs `legacy-manual/manual-failed-nop.spec.ts` P5.2 (theme follows prefers-color-scheme): P5.2 checks first-visit scheme. Different.
   - settings-certs-admin l.140 (duplicate email error) vs `admin/admin-users.spec.ts:113` (failed save toast after modal close, "Email already in use"): different path. Different.
   - Not checked in depth: modals-consistency l.5 (New Workspace inline) vs the workspace specs under `workspaces-rbac-share/`. Low risk; check during the workspaces world review.

## 4. Deprecated tests

**None found.** Every test id, route and text the ui specs rely on exists in `client/src`. Evidence (quoted greps, run with `-rl` on `client/src`):

| Used by test | String | Result |
|---|---|---|
| QA-19 l.7, qa-dialogs l.7, settings.spec l.29, others | `settings-btn` | 2 files |
| qa-dialogs l.7 | aria `Open general settings` | `client/src/components/layout/TopBar.tsx` |
| ctrl-s l.8, qa-11, tabs | `env-profile-variables-btn`, `profile-variables-editor` | 1 file each (`environment/ProfileVariablesEditor.tsx`) |
| ctrl-s l.14 | text `Profile variables saved` | `client/src/components/environment/ProfileVariablesEditor.tsx` |
| ctrl-s l.23 | text `Workspace settings saved`, `Loading details` | `client/src/components/workspace/WorkspaceSettingsModal.tsx` |
| r2-01 l.12 | aria `Reqspace home` (+ title) | `client/src/components/layout/Sidebar.tsx:76` |
| r2-01 l.13 | `import-btn` | 2 files |
| escape-modals l.6, qa-11 l.9, tabs | `new-collection-empty-btn`, `new-collection-btn`, `create-request-btn` | 1 file each |
| escape-modals l.14 | `action-menu-run-collection` | **generated**, not literal: `client/src/components/collection/CollectionExplorer.tsx:113` builds `action-menu-${opt.label.replace(/\s+/g,'-').toLowerCase()}` and the label `'Run Collection'` is at `CollectionExplorer.tsx:687`. Present. |
| escape-modals l.16, modals-consistency l.22 | `collection-runner-modal`, heading `Run “RunCol”` | `client/src/components/collection/CollectionRunnerModal.tsx:428` and `:436` |
| escape-modals l.24, tabs l.35 | `confirm-cancel-btn`, `confirm-btn` | `client/src/components/common/ConfirmModal.tsx` (plus `utils/dialog.tsx`) |
| tabs-history l.27, escape-modals l.23 | heading `Unsaved Changes` | `client/src/components/request/RequestTabBar.tsx:105,119` |
| modals-consistency l.7 | `new-workspace-btn` | 2 files |
| modals-consistency l.11 | accessible name `Workspace name` | `client/src/components/layout/Sidebar.tsx:127-128` |
| console-resizable l.9 | `console-resize-handle`, `console-drawer`, `console-toggle-btn` | 1 / 2 / 1 files |
| primary-button-contrast l.10 | `login-submit` | 1 file |
| settings.spec l.36-38 | `#followRedirects`, `#verifySsl`, `#requestTimeout` | `client/src/components/common/GlobalSettingsModal.tsx:188,201,244` |
| settings.spec l.30 | heading `Global Settings` | GlobalSettingsModal |
| settings.spec l.68 path | `response-status`, `request-send-btn` | 1 file each |
| settings.spec l.78-94 | `proxy-enable-checkbox`, `proxy-url-input`, `proxy-auth-checkbox`, `proxy-username-input`, `proxy-password-input` | 1 file each |
| settings.spec l.103 | `input[value="ctrl+k"]` | `ctrl+k` occurs in 5 client files (shortcut defaults) |
| settings.spec l.108 | dialog name `Global search` | `client/src/components/common/GlobalSearchModal.tsx:136` `aria-label="Global search"` |
| certs l.34, l.70 | text `No client certificates configured.` | `client/src/components/common/GlobalSettingsModal.tsx` |
| certs l.36-45 | `cert-add-btn`, `cert-hostname-input`, `cert-cert-input`, `cert-key-input`, `cert-passphrase-input`, `cert-save-btn`, `cert-row`, `cert-hostname`, `cert-delete-btn` | 1 file each |
| certs l.87 | text `Hostname, Cert, and Key are required` | `client/src/components/common/GlobalSettingsModal.tsx:68` |
| certs l.96-133 | `admin-dashboard-link`, `admin-dashboard-title`, `admin-add-user-btn`, `add-user-modal`, `add-user-name`, `add-user-email`, `add-user-password`, `add-user-submit-btn`, `user-row-` | 1 file each (`client/src/pages/AdminPage.tsx`, `client/src/components/admin/AddUserModal.tsx`) |
| certs l.129-133 | `new-password-input`, `confirm-password-input`, `change-password-submit` | 1 file each |
| certs l.168-183 | `extension-install-prompt`, text `Extension not active`, `Dismiss`, `How to install`, `Load unpacked` | `ExtensionInstallPrompt.tsx:56` and `ExtensionDownloadModal.tsx:106` |
| history-related (tabs-history l.66-93) | `tab-history`, `history-item`, `saveHistoryToggle`, `Clear All` | `Sidebar.tsx:163`, `HistorySidebar.tsx:228`, `:190`, `:164` |
| tabs-history l.120 | aria `Switch to light mode` / `Switch to dark mode` | **built from a template**, not a literal: `client/src/components/layout/TopBar.tsx:168` `aria-label={\`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode\`}`. Present. |
| tabs-history l.41-61 | `tab-menu-close-right`, `tab-menu-close-left`, `tab-menu-close-others` | `RequestTabBar.tsx:227-229` |
| tabs.spec l.58-63, tabs-history | `tab-${tab.tabId}` (tab testids), `close-tab-btn`, `new-tab-btn` | `RequestTabBar.tsx:138` and `Sidebar.tsx:141-163` (sidebar tabs have `role="tab"`, so `:not([role="tab"])` excludes them) |
| tab-method-theme-color l.9 | CSS token `--color-get` | `client/src/index.css` |
| tab-bar-scrollbar l.8 | class `scrollbar-hide` | `RequestTabBar.tsx` (and 3 more files) |
| certs l.49-55 (SEC-8) | response metadata only | server behaviour, not a string; not checked here |

Unsure: none.

## 5. Merge risks per target

**T1 global-settings**
- settings.spec.ts runs `describe.configure serial`. Keep it as a nested describe; merging it into the top level would serialise the other T1 tests.
- settings.spec `beforeEach` registers a user per test. Each test changes per-user settings (proxy, timeout, verifySsl) and never leaks into another test. Keep the per-test user.
- qa-dialogs uses `registerUser(page,'qa19')`; QA-19 used the same prefix. Only a cosmetic clash, unique by timestamp. Gone after QA-19 is deleted.
- settings-about-version and settings.spec depend on `settings-btn` only. No shared state.

**T2 global-settings-certificates** (desktop only)
- Both tests are `test.skip` unless `REQSPACE_TARGET=electron`. Test 2 logs in as the user test 1 creates (`cert_${ts}`). Keep them in one serial describe with the same skip, or test 2 fails on its own in electron-only runs.
- Each file has its own `ts`. Do not share it with the admin tests; that is what made them depend on each other before.
- The file-level `test.use({allowFpErrors})` must not move here. The cert tests produce no 4xx, so it is not needed; leaving it would hide future regressions.

**T3 extension-install-prompt**
- Test uses `page.waitForTimeout(2500)` (l.182), a fixed sleep for the 1500 ms probe. Replace with an expect that the prompt stays hidden, or keep it: it is a known risk, not a blocker.

**T4 tab-bar**
- tabs.spec tests have no beforeEach and register inline. tabs-history's beforeEach (l.10) must stay inside its own describe; otherwise the tabs.spec tests register twice.
- tabs.spec test 1 (l.39-45) uses `if (await createColBtn.isVisible())` with no wait. It can take the wrong branch on a slow render. Add a wait before merging.
- tabs.spec drag tests use `dragTabOnto` with `targetPosition`. Keep the helper local to the file, or move it to a shared helper with its comment (it documents a fixed app bug).
- escape-modals confirm half needs the dirty tab from its own `new-tab-btn` and `request-url-input` fill. Keep that setup in the split test.
- Test `Close All to the Right` (tabs-history l.44) opens a ConfirmModal and expects `confirm-btn`. Each tab in these tests is dirty (URL edited), so every close prompts. Keep the ordering (confirm after each close) when moving.
- `allowFpErrors`: none needed. All T4 tests are 2xx.

**T5 history-and-theme**
- tabs-history l.66 calls `page.route('https://hist.example.test/**')` and waits on POST `/history` and DELETE `/api/history/`. The DELETE wait uses a regex on `/api/history/`. Keep it inside the test.
- l.95 changes the per-user `saveHistoryToggle` and restores it at the end. If an assertion fails before the restore, the user is left with history off. The user is fresh per test, so no leak. Keep, but do not reuse this user.
- Theme test (l.117) toggles a page-wide dark class. Fresh context per test makes this safe.

**T6 keyboard-and-modals**
- ctrl-s l.23 `getByLabel('Workspace Name')` depends on `WorkspaceSettingsModal` label text. A rename there breaks this test silently. Note only.
- ctrl-s test 1 saves Profile variables; that save persists per user, so it is fresh per test. No leak.
- modals-consistency l.5 `expect(page.getByRole('dialog')).toHaveCount(0)` is global. Any other open dialog on the page breaks it. Safe on a fresh user.

**allowFpErrors scoping (all targets)**
- Only settings-certs-admin.spec.ts l.4 has a file-level allow list (`server-auth|status code 40[013]`). The ADMIN tests in it (l.92, l.140) trigger 401/400 on purpose (duplicate email is a 400). When they move to `admin/admin-users.spec.ts`, declare the allow list inside their describe there. Do not hoist it into the admin file.
- Nothing else in ui/ sets allowFpErrors. The default guard (fperrors table, see CLAUDE.md) applies to all other ui tests, which is the intended behaviour.

**Global state mutated**
- No ui test writes server-wide config. Every write goes to a fresh per-test user (settings, history, profile variables, cert, workspace). This is the safest group in the repo for merging.
- The one exception is the admin tests (l.92, l.140), which write users through the admin API. They must move to the admin world before merging with anything else, and their `created_${ts}` email is reused by l.140 (serial dependency inside the file). Keep both in the same serial describe in admin-users.

**Unique-name collisions**
- All `registerUser` emails include `Date.now()` and a random suffix (helpers.ts:6). No collision risk.
- r2-01 builds its email from `Date.now()` alone and skips the workspace wait. Fine alone; if merged into a describe with parallel workers, switch it to `registerUser` for consistency.

**Fresh user / empty workspace assumptions**
- Most tests assume a fresh user with an empty workspace: tabs.spec test 1 (`new-collection-empty-btn` visible), escape-modals (`new-collection-empty-btn`), qa-11 test 2 (`prompt-input` count 0 on empty state). These must stay on a fresh user, which `registerUser` guarantees. Do not share a user across T4 tests.

**Serial order**
- T2 requires serial order (l.73 after l.24). T1 settings.spec requires serial (nested describe). The other tests are independent.

## 6. Tests that belong in a different world

| Test | Current file | Move to | Reason |
|---|---|---|---|
| empty-state Create a Request (2 tests) | qa-11-empty-state-create-request-flow.spec.ts l.5, l.17 | `collections-tree/` | Collection tree create-request flow |
| console drawer drag and keyboard | console-resizable.spec.ts l.5 | `requests/` (with `cookies-console.spec.ts`, `editor-layout.spec.ts`) | Console is a request-screen feature |
| sidebar logo tooltip and Import icon | r2-01-sidebar-logo-tooltip.spec.ts l.4 | `workspaces-rbac-share/app-shell.spec.ts` | Sidebar shell |
| login submit contrast | primary-button-contrast.spec.ts l.8 | `auth/auth-forms.spec.ts` | Login page |
| runner title has no colon | modals-consistency.spec.ts l.17 | `runner/runner.spec.ts` | Runner dialog |
| Escape closes runner (half of escape-modals) | escape-modals.spec.ts l.4-18 | `runner/runner.spec.ts` | Runner dialog |
| admin creates user who can log in; duplicate email error | settings-certs-admin.spec.ts l.92, l.140 | `admin/admin-users.spec.ts` | ADMIN login; admin users world |
| extension install prompt | settings-certs-admin.spec.ts l.159 (T3) | `platform/` (`get-app-download.spec.ts` is the likely home) | Extension download and prompt; overlaps P6.1 in `legacy-manual/` |
| history delete and clear all; Save Request History toggle | tabs-history-theme.spec.ts l.66, l.95 | `history-search/history.spec.ts` | History feature; partial overlap with `fix-K4.4` and `history-keyboard-actions` |

The `history` and `extension` moves are recommendations. They are not required for this consolidation; the target files above keep them until those worlds are reviewed.
