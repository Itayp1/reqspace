# Consolidation plan: tests/e2e/admin/

Scope: all `*.spec.ts` directly under `tests/e2e/admin/`. The folder holds **25** spec files (not 26) and **43** tests. Read-only analysis; no tests were run.

Login legend: **UI** = `loginAdminUi` or an inline admin form login; **API** = `apiAsAdmin()` / `apiAs(email)`; **NEW** = a fresh user registered in the test; **ANON** = no login.

## 1. Per-file inventory

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| admin-management.spec.ts | 9 | Super Admin users/workspaces/logs/errors/settings actions | `describe` **serial**; `ts`, `NAME`, `EMAIL` constants; local `openAdmin()`; `test.use({allowFpErrors:[/admin-errors-panel-probe/]})` only in nested `errors panel` describe (l.124) | UI (openAdmin, 6x), API, ANON register (l.31) |
| admin.spec.ts | 2 | Admin login + dashboard smoke; system-config save/revert | none; hard-coded `admin`/`admin123456`; handles forced password-change modal | UI inline |
| fix-A5.6.spec.ts | 1 | mustChangePassword session gets 403 on data APIs until password changed | `test.use({allowFpErrors:[/server-auth\|status code 40[013]/]})`; local `uniq`, `ip`, `anon` | API admin + NEW (anon login) |
| fix-I4.4.spec.ts | 1 | Blocked request explains mixed content | `page.route` rewrites Origin header; no describe-level setup | NEW (registerUser) |
| fix-I4.5.spec.ts | 1 | SSL failure explains SSL / Verify SSL hint | same Origin rewrite as I4.4 (copy-paste) | NEW |
| fix-Q1.1.spec.ts | 1 | users search + cursor paging returns only matches | none | API |
| fix-Q5.1.spec.ts | 1 | Workspaces table has Owner and size/request columns | `describe` | UI |
| fix-Q6.5.spec.ts | 1 | audit-log API response is not raw HTML | `describe`; local `seq`, `ip` | API admin + NEW (API register) |
| fix-Q7.2.spec.ts | 1 | errors: sort by count, date-range filter | `describe`; `test.use({allowFpErrors:[/q72-probe/]})`; local `day()` helper | UI + API (seed errors) |
| fix-Q7.7.spec.ts | 3 | (a) NUL ids on share/fork 4xx; (b) fork/PUT/DELETE bad input 4xx; (c) 40 concurrent `/api/admin/users` reads 200 | two describes; `test.setTimeout(120000)` in (b); local `idOf`; no allowFpErrors (guard applies) | ANON register (a,b); API admin (c) |
| fix-Q8.1.spec.ts | 1 | History max-records / retention-days persist | `describe`; try/finally restores config via API | API + UI |
| fix-Q8.6.spec.ts | 1 | allowPrivateTargets off blocks SMTP test; on reaches local SMTP stub | `describe`; local `net` SMTP server; try/finally restores config | API |
| fix-Q9.2.spec.ts | 1 | SMTP test refuses private target when off, fast (<3s) | `describe`; conditional restore | API |
| fix-Q9.6.spec.ts | 1 | Double-click Test Connection sends one request | `describe`; `page.route` mock of `/api/admin/test-smtp` | UI |
| QA-30-31-admin-users-and-logs.spec.ts | 2 | QA-30 no Revoke on own row; QA-31 audit Resource shows name | no describe; local `openAdminTab()` | UI + API (QA-31 creates ws) |
| admin-env-ux.spec.ts | 4 | Close button; Ctrl+Z/Ctrl+S settings; missing-variable modal; environment selector | `describe` | UI (1,2); NEW (3,4 registerUser) |
| admin-sees-all-workspaces.spec.ts | 1 | Admin list includes other users' private workspaces | none; IP 10.251.7.7 | ANON register + API owner + API admin |
| admin-user-search-wildcards.spec.ts | 1 | `_` and `%` in user search are literal | none | API |
| errors-console-and-auth-capture.spec.ts | 2 | console.error/warn stored as fault; 401 stored server+client | `describe`; `test.use({allowFpErrors:[/err1-console-probe\|responded 40[13]\|status code 40[13]/]})`; local `errorsSince()` | ANON (page on /login) + API admin |
| fperror-resolve-audit.spec.ts | 1 | DELETE errors group with 64-char fingerprint returns 200 | none | API |
| system-backup.spec.ts | 2 | Encrypted export/preview/import; wrong password 422; export password rules | `describe`; local `pw()`; `test.use({allowFpErrors:[/system\/export responded 401/]})` declared mid-describe (l.29), so it applies to test 1 too | API; test 2 also ANON `request` |
| toast-on-closed-modal.spec.ts | 1 | Failed save after modal closed still toasts | none; `page.route` delays and fails `/api/admin/users` | UI inline |
| admin-add-user-labels.spec.ts | 1 | Add User fields reachable by label | none | UI |
| admin-labels.spec.ts | 2 | Logs/Errors From/To labels visible; Settings checkbox label toggles | local `openTab()` | UI |
| admin-settings-text.spec.ts | 1 | Static check: AdminPage.tsx text does not claim to govern "Send" | reads `client/src/pages/AdminPage.tsx` via `fs`; no browser | none |

Non-admin content found inside this folder (see section 2): fix-I4.4, fix-I4.5, fix-A5.6, fix-Q7.7 tests (a) and (b), admin-env-ux tests 3 and 4.

## 2. Proposed target spec files

Six targets (five plus the untouched backup file). Test counts: 43 today, 43 after moves (2 dropped as duplicates, 7 relocated out, so 34 stay admin-specific; 9 relocated are listed as moves, not losses).

**T1 `admin-users.spec.ts`** (11 tests)
- admin-management.spec.ts: l.31 (setup), l.38 (promote/revoke), l.51 (suspend/reactivate), l.67 (own row; absorbs QA-30 after adding a search step), l.186 (delete)
- fix-Q1.1 (l.4), admin-user-search-wildcards (l.6), fix-Q7.7 concurrent reads (l.85)
- admin-add-user-labels (l.4), toast-on-closed-modal (l.10): both are the Add User modal
- admin-env-ux.spec.ts l.4: Close button (admin shell, nothing better fits)

**T2 `admin-workspaces-and-logs.spec.ts`** (7 tests)
- admin-management.spec.ts l.79 (Workspaces tab, Manage Permissions), fix-Q5.1 (l.4), admin-sees-all-workspaces (l.6)
- admin-management.spec.ts l.113 (audit names actor), QA-30-31 l.23 (QA-31), fix-Q6.5 (l.9)
- admin-labels.spec.ts l.10 (From/To labels, logs part)

**T3 `admin-errors.spec.ts`** (5 tests)
- admin-management.spec.ts l.126 (errors panel, Fixed)
- fix-Q7.2 (l.6), errors-console-and-auth-capture (l.8, both tests), fperror-resolve-audit (l.10)

**T4 `admin-settings.spec.ts`** (9 tests)
- admin.spec.ts l.4 (login/dashboard smoke) and l.49 (config save)
- admin-management.spec.ts l.148 (SMTP + Google save, Test Connection)
- fix-Q8.1 (l.4), fix-Q8.6 (l.6), fix-Q9.6 (l.4), fix-Q9.2 folded into Q8.6 as the timing assertion
- admin-env-ux.spec.ts l.12 (Ctrl+Z/Ctrl+S), admin-labels.spec.ts l.18 (checkbox label), admin-settings-text (l.8, static check)

**T5 `admin-backup.spec.ts`** (2 tests): system-backup.spec.ts unchanged.

**Relocate out of admin/** (7 tests, no loss):
- fix-Q7.7 l.13 and l.33 (share/fork/request NUL and bad input) to the collections/requests world
- fix-I4.4, fix-I4.5 to the request-errors / network world (same Origin-rewrite boilerplate; share one helper)
- fix-A5.6 to the auth world (forced password change, API-level block)
- admin-env-ux.spec.ts l.28 (missing-variable modal) to the request-send world
- admin-env-ux.spec.ts l.44 (environment selector) to the environments world

**Dropped as duplicates** (2): QA-30 (l.12, covered by admin-management l.67) and fix-Q9.2 (l.5, covered by fix-Q8.6 l.7). See section 3.

## 3. Duplicates

Only pairs whose assertions overlap were counted.

1. **HIGH: QA-30 vs admin-management "the admin cannot revoke or suspend their own account".**
   - `tests/e2e/admin/QA-30-31-admin-users-and-logs.spec.ts:12` "QA-30: no Revoke Admin button on the signed-in admin's own row"
   - `tests/e2e/admin/admin-management.spec.ts:67` "the admin cannot revoke or suspend their own account"
   - Both find the admin row by `cell name 'admin'` and assert zero "Revoke Admin" buttons. QA-30 is a strict subset.
   - Stronger: admin-management:67. Caveat: it has no search step, so it can miss the admin on page 2 of a shared DB. Add QA-30's `admin-user-search` fill before deleting QA-30.

2. **HIGH: fix-Q9.2 vs fix-Q8.6 (SMTP private-target guard, off state).**
   - `tests/e2e/admin/fix-Q9.2.spec.ts:5` "[Q9.2] SMTP Test Connection refuses private targets when allowPrivateTargets is off"
   - `tests/e2e/admin/fix-Q8.6.spec.ts:7` "[Q8.6] SMTP Test Connection to a private address is blocked when off and reaches the host when on"
   - Both PUT `allowPrivateTargets:false`, POST `/api/admin/test-smtp` to 127.0.0.1, expect 400 with `/private|blocked|internal/`.
   - Q9.2 only adds the `<3000 ms` timing check and uses port 25. Q8.6 also checks no connection was made (`hits===0`) and the on-path.
   - Stronger: Q8.6. Fold Q9.2's timing assertion into Q8.6, then delete Q9.2.

3. **MEDIUM: fix-Q8.1 vs admin.spec.ts "login + dashboard render only system config update".**
   - `tests/e2e/admin/fix-Q8.1.spec.ts:5` and `tests/e2e/admin/admin.spec.ts:49`
   - Both change a history/config field in Settings, click Save System Config, expect PUT 200, reload, and check the value persisted.
   - Different fields (Q8.1: max-records and retention-days; admin.spec: "Max Total History per User MB"), so the overlap is the save/reload path only.
   - Stronger: Q8.1 (asserts via API, restores the original values in `finally`). admin.spec:49 hard-codes the revert to `'20'`. Keep admin.spec's field only if it is unique coverage; otherwise fold it into Q8.1.

4. **MEDIUM: admin-management l.148 SMTP test vs fix-Q8.6 / fix-Q9.2 (UI layer of the same guard).**
   - `tests/e2e/admin/admin-management.spec.ts:148`
   - It clicks Test Connection to 127.0.0.1:1 and accepts `/SMTP connection failed|private network/`. The regex matches both guard-blocked and network-failed, so the test does not prove the guard.
   - Stronger: Q8.6. Keep l.148 for its save/reload coverage; treat its toast assertion as weak.

5. **LOW: admin.spec.ts:4 "Admin login and dashboard" vs the other UI-login tests.**
   - Its assertions (dashboard title, a users row, settings title) are reached by admin-management, admin-env-ux and admin-labels. Its unique value is the login-form path and the forced-password-change handling. Keep it.

6. **LOW: fix-Q1.1 vs admin-user-search-wildcards.**
   - Both call `GET /api/admin/users?search=` and check returned emails. Q1.1 covers cursor paging; wildcards covers `_`/`%` escaping. Not duplicates.

7. **LOW: fix-Q5.1 vs admin-management l.79 (Workspaces tab).**
   - Both open the Workspaces tab and check a row is visible. Q5.1 asserts headers and columns; l.79 asserts `1 member` and the permissions flow. Not duplicates.

8. **LOW: fperror-resolve-audit vs admin-management l.126 (Fixed).**
   - Both delete an error group. fperror uses a 64-char fingerprint via API, and its comment says the bug only shows on Postgres/MySQL. On SQLite this test cannot fail, so it is low value here, but it is not a duplicate of the UI test.

9. **NOT duplicates (checked, listed to stop re-checks):**
   - QA-31 (l.23) vs admin-management l.113: the first checks the Resource column is not an id; the second checks the actor and target and that no row says `undefined`.
   - fix-I4.4 vs fix-I4.5: same setup, different error message assertions. Shared boilerplate, not duplicate behaviour.
   - admin-add-user-labels vs toast-on-closed-modal: both open the Add User modal, with different assertions.
   - admin-labels l.18 vs admin-env-ux l.12: label-click toggle vs Ctrl+Z revert.
   - errors-console vs fix-Q7.2 vs admin-management l.126: all use the errors screen, with different assertions.

## 4. Merge risks per target

**Global state mutated by admin config** (most important):
- `proxy.allowPrivateTargets` is written by fix-Q8.6 and fix-Q9.2, and read by admin-management l.148 and the Q8.6 "on" path. Tests that share a worker and run in parallel can race: a test expecting "blocked" can see "allowed" mid-run. Keep Q8.6 and Q9.2 (or the folded version) in one serial describe, and run l.148 outside the window.
- `history.maxRecords` / `retentionDays` are written by fix-Q8.1 (restored in `finally`) and admin.spec:49 (reverted to the hard-coded `'20'`, which is not the original value). Restore the original in admin.spec:49 too.
- admin-management l.148 leaves SMTP host `127.0.0.1`, port `1` and `from` saved, and only unchecks `enabled`. Google `client-id` stays saved. Later tests that save the whole config (admin-env-ux l.12, Q8.1) will persist these. Clean up all fields, or use a `finally`.
- admin-env-ux l.12 saves the whole server-settings form (Ctrl+S). If a parallel test edits config, it can overwrite that edit. Keep it in the settings describe, serial.

**Serial order and shared entities** (T1, admin-management merge):
- admin-management l.31 must run first: it creates the user the rest use (`NAME`, `EMAIL`). Keep `describe.configure({mode:'serial'})` on that block only, or the merged file will break under `--grep` and retries.
- `ts`-based names (`Managed ${ts}`, `Admin Managed WS ${ts}`, `Private ${Date.now()}`, `QA31 Workspace ${Date.now()}`) are unique per run. Only same-ms collisions matter, which is unlikely. Keep them.
- admin-management l.186 deletes the user, so the delete must stay last in T1.

**Login method differences:**
- UI logins are `loginAdminUi` (admin123456, no forced change) except admin.spec.ts, which uses hard-coded credentials and handles the forced password-change modal. Do not move admin.spec's login into a shared helper without that modal handling, or other tests will hit it.
- Test 4 in admin-env-ux and the Q7.2 test use `loginAdminUi`; toast-on-closed-modal logs in inline. Standardise on `loginAdminUi`.
- Mixed API/UI in one test (admin-management l.79, QA-31, Q8.1) is fine, but each `apiAs` call creates its own context and random `X-Forwarded-For`, so no IP collision.

**allowFpErrors scoping** (highest silent-masking risk):
- fix-A5.6 applies a file-level allow list to its only test, which is fine. When it moves to the auth world, drop the file-level `server-auth` pattern if no other test needs it.
- errors-console's describe-level allow list covers `responded 40[13]` and `status code 40[13]`. Keep it scoped to the describe that needs it. Do not hoist it to the file.
- system-backup declares its allow list mid-describe (l.29), which applies to test 1 as well. Move the declaration to the top of the describe so the scope is explicit.
- admin-management's errors-panel allow list is nested. Keep that nesting when merging into T3.
- Q7.7 has no allow list, so the fperrors guard fails it on any 5xx. Keep that, including when it moves out.

**Fixtures and setup differences:**
- Q7.7 (b) sets `test.setTimeout(120000)`. Keep it on that test, not the describe, or the other fork/PUT tests inherit it.
- admin-settings-text reads `client/src/pages/AdminPage.tsx` by relative path. Moving the file changes the path. It is a static grep test: brittle, and it does not need the browser.
- Q7.2 and errors-console call `request`/`apiAsAdmin` with inline `X-Forwarded-For`. Keep the header values; the rate limiter is off in e2e (`DISABLE_RATE_LIMIT=true` in `playwright.config.ts`), so no collision risk.

**Setup duplication to fold into helpers (no behaviour change):**
- fix-I4.4 and fix-I4.5 have the same Origin-rewrite `page.route`, same registerUser, same workspace and collection setup. One helper when they move out.
- `openAdmin` (admin-management), `openAdminTab` (QA-30-31), `openTab` (admin-labels) and the inline logins in admin.spec/toast-on-closed are the same flow. Merging them into T1/T2/T4 should use `loginAdminUi` plus `page.getByTestId('admin-dashboard-link')`.
