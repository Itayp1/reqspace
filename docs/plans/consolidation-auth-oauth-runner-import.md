# Consolidation plan: tests/e2e/{auth,oauth,first-run,runner,import-export}/

Scope: every `*.spec.ts` in the five folders, read in full. Read-only analysis; no tests were run and no files were changed.
Totals: **28 files, 74 tests** (auth 8/24, oauth 8/21, first-run 2/3, runner 6/11, import-export 4/15).

Login legend: **UI** = form login in the test; **API** = `apiAsAdmin()` or `pwRequest` context; **NEW** = user registered in the test (`registerUser` or inline); **ANON** = no login; **MOCK-IDP** = `startMockIdp()` + `enableCustomProvider()`.

Line numbers are from the files as they stand.

---

## 1. Per-file inventory

### 1a. auth/ (8 files, 24 tests)

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| QA-54-65-form-validation-messages.spec.ts | 3 (l.7, 13, 19) | Empty login/register submit shows in-app text; short password names the rule | `test.use({allowFpErrors:[/status code 40[0139]/]})` l.5 | ANON |
| QA-75-register-double-submit.spec.ts | 1 (l.6) | Double-click Create Account sends one `/auth/register` (route mock) | `test.use({allowFpErrors:[/status code 400/]})` l.4 | ANON, mocked |
| auth-api.spec.ts | 2 (l.27, 33) | `/api/admin/config` 401 without login; identity headers do not authenticate | `test.use` l.24 (file-level) | ANON (`request`) |
| auth-forms.spec.ts | 3 (l.49, 55, 61) | 8-char hint present; dark variant of register and login error banners | `test.use({storageState:{cookies:[],origins:[]}})` l.47 (file-level) | ANON |
| auth-types.spec.ts | 7 (l.61, 93, 118, 146, 168, 194, 214) | API key (header/query), OAuth2 token, collection auth, `inherit`, folder override; all checked after reload | `describe.configure serial` l.23; `test.use` allowFpErrors `console.error: Network Error` l.5 (file-level); helpers `login`, `reloadAndOpen`; test 1 registers `EMAIL`, tests 2-7 depend on it | UI (inline `login()`), NEW in test 1 |
| auth.spec.ts | 6 (l.21, 29, 47, 66, 143, 163) | Wrong password fails; register; login/logout; forced-change modal (route mock); expired-session event; SSO Google button redirect (route mock) | `beforeAll` l.14 registers `loginEmail` via API (201/409 accepted); nested `describe('sign-out')` l.44 with `test.use` allowFpErrors `status code 401` l.45 | UI inline; API in beforeAll |
| forced-password-change.spec.ts | 1 (l.110) | A5.6: `mustChangePassword` session gets 403 from data APIs, can change password, then regains access | `test.use` allowFpErrors `server-auth\|status code 40[013]` l.92 (file-level); describe l.109 | API (admin creates user, `pwRequest` login) |
| login-session-cookie-blocked.spec.ts | 1 (l.75) | LOGIN1: `/auth/me` 401 after login shows "did not keep the session cookie" | describe l.72; `test.use` allowFpErrors `server-auth\|status code 401` l.73 | UI inline as `admin` (route mock on `/api/auth/me`) |

### 1b. oauth/ (8 files, 21 tests)

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| oauth-concurrent-state.spec.ts | 2 (l.19, 34) | Two sign-ins keep separate state (OAUTH1); state endpoint `no-store` | `beforeAll` l.9 MOCK-IDP; `afterAll` l.13; describe l.18. No allowFpErrors | API (`page.request`) |
| oauth-custom-autocreate.spec.ts | 1 (l.24) | With self-registration off, SSO still creates the user; password register returns 403 | `test.use` allowFpErrors l.6 (file-level); `beforeAll` l.13 MOCK-IDP; `afterAll` l.17 sets `allowSelfRegistration: true` | UI via SSO, API admin |
| oauth-custom.spec.ts | 7 (l.30, 38, 58, 73, 85, 96, 106) | Custom provider: label and secret not public; allowed sign-in creates account and token exchange; returning user; deny; unverified email; no email; admin rejects `javascript:` URL | `test.use` allowFpErrors l.6 (file-level); `beforeAll` l.14, `afterAll` l.19, `beforeEach` l.24 resets `idp.mode`/`tokenRequests` | UI via SSO; API admin (l.106) |
| oauth-first-login-personal-workspace.spec.ts | 1 (l.16) | First SSO login creates a personal workspace, kept after re-login | `beforeAll` l.7, `afterAll` l.11 MOCK-IDP. No allowFpErrors | UI via SSO |
| oauth-google-icon.spec.ts | 1 (l.5) | Google button shows four-colour logo (OAUTH2) | none; test sets `googleOAuth` enabled l.7, disables in `finally` l.16 | API admin + ANON page |
| oauth-login-loads-workspaces.spec.ts | 1 (l.18) | Workspace Settings opens after SSO sign-in (OAUTH1 follow-up) | `beforeAll` l.9, `afterAll` l.13 MOCK-IDP. No allowFpErrors | UI via SSO |
| oauth-missing-config-hints.spec.ts | 2 (l.16, 29) | Admin screen lists missing Client Secret; half-configured sign-in names it | describe l.8; `test.use` allowFpErrors l.9 (describe-level); `afterEach` l.11 resets `githubOAuth` | UI admin (`loginAdminUi`) in test 1; API + ANON in test 2 |
| oauth-providers.spec.ts | 6 (l.15, 46, 61, 90 x2 via loop, 99) | Admin stores GitHub/Microsoft config, secrets masked; proxy URL validated and hidden; sign-in page redirects (route mocks); CSRF state rejected (github, microsoft); legacy `X-Auth-User` ignored | `test.use` allowFpErrors l.7 (file-level); `seq` + `anon()` helper l.10-12 (random `X-Forwarded-For`) | API admin; ANON; UI (l.61, route mocks) |

### 1c. first-run/ (2 files, 3 tests)

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| QA-10-first-run-screen.spec.ts | 2 (l.17, 22) | Setup screen has no Register link; a failed setup shows its error inline only (no toast) | `firstRunScreen()` helper l.5 (route mock sets `needsSetup:true`); describe l.14; `test.use` allowFpErrors `status code 40[0139]` l.15 | ANON, mocked |
| first-run-setup.spec.ts | 1 (l.5) | Setup is closed once a superadmin exists (`needsSetup` false; second POST returns 409) | none; relies on global-setup creating the superadmin | ANON (`request` fixture) |

### 1d. runner/ (6 files, 11 tests)

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| QA-35-runner-data-file-label.spec.ts | 1 (l.5) | Runner data-file picker shows English "Choose file" label | none | NEW (`registerUser` 'qa35') |
| qa-36-runner-passed-failed-hint.spec.ts | 1 (l.5) | Runner Passed/Failed boxes carry a `title` explaining the count | none; registers inline | NEW (inline register l.6-11) |
| runner-codegen-url.spec.ts | 3 (l.16, 36, 48) | Each runner row gets its own result, empty URL fails; empty URL refused and scheme-less URL gets http://; snippet includes url-encoded body | describe l.10; `beforeEach` l.11 `registerUser('rcu')` + route mock on `https://rcu.example.test/**`. No allowFpErrors | NEW |
| runner-iteration-data-vs-profile.spec.ts | 1 (l.34) | Iteration CSV row beats a profile variable of the same name (Finding 93) | module consts `ts` l.11, `ip()` l.12; helper `newUser()` l.14 (API register); `loginWithCookies()` l.23 copies cookies and rewrites non-GET `/api/**` Origin to `http://localhost:5173` (l.28) | API register, cookies copied into page |
| runner-missing-variables.spec.ts | 1 (l.4) | Runner asks to create missing variables, then runs; second run does not ask | none | NEW (`registerUser` 'mvr') |
| runner.spec.ts | 4 (l.5, 45, 98, 149) | Open and run modal; JSON data file drives 3 iterations; CSV same; Stop halts the run | describe l.4; no beforeEach; each test registers inline with its own email (`runner_*_${ts}`) | NEW (inline, UI) |

### 1e. import-export/ (4 files, 15 tests)

| File | Tests | Purpose | File-level setup | Login |
|---|---|---|---|---|
| curl-parser.spec.ts | 4 (l.7, 13, 18, 23) | Pure `parseCurl`: BUG-05 POST implied; BUG-06 `--request`/`-X`; BUG-07 `-u`; BUG-08 scheme-less URL | describe l.6; imports `server/src/utils/curlParser` directly (no browser) | none |
| import-curl-unclosed-quote.spec.ts | 1 (l.5) | QA-70: cURL import disabled with "Unclosed" error until quote closed | none; URL text contains `localhost:3205` (l.9, 13) | NEW (`registerUser` 'curl_bad') |
| import-export.spec.ts | 1 (l.5) | Admin "Export Data" downloads a workspace dump and re-imports it (append) | describe l.4; no allowFpErrors | UI inline as seeded `admin` / `admin123456` (l.9-12); shared admin account |
| import.spec.ts | 9 (l.44, 76, 103, 128, 147, 157, 186, 201, 215) | Postman file import; export→import round trip; OpenAPI paste; cURL and raw HTTP tabs; non-collection rejected; environment round trip; drop JSON opens Import; rename on import; cURL rejects non-cURL | describe l.14; helper `openImport()` l.39; `POSTMAN` const l.15 | NEW (`registerUser` per test) |

---

## 2. Proposed target spec files

Targets sit at about a third to a half of the current file count per world. Test counts are after moves, before dedupe.

### auth -> 4 files (from 8)

**A1 `auth-forms.spec.ts`** (7 tests)
- QA-54-65 l.7, l.13, l.19
- QA-75 l.6
- auth-forms l.49, l.55, l.61 (keep the empty `storageState` in a describe, not at file level, see section 5)

**A2 `auth-session.spec.ts`** (7 tests)
- auth.spec l.21 (wrong password), l.29 (register), l.47 (logout, keeps its allowFpErrors describe), l.143 (expired session), l.66 (forced-change modal, UI route mock)
- login-session-cookie-blocked l.75
- forced-password-change l.110 (A5.6, server-side)

**A3 `auth-api-security.spec.ts`** (3 tests; 2 after dedupe #6)
- auth-api l.27 (`/api/admin/config` 401)
- auth-api l.33 (identity headers) plus oauth-providers l.99 (`X-Auth-User`), folded into one test (dup #6)

**A4 `auth-request-types.spec.ts`** (7 tests, unchanged file contents)
- auth-types l.61, 93, 118, 146, 168, 194, 214
- Note: these test the request AuthEditor and collection/folder auth. They could move to a requests world. Kept here so the auth world stays whole.

Sum: 7 + 7 + 3 + 7 = 24.

### oauth -> 3 files (from 8)

**O1 `oauth-custom-signin.spec.ts`** (11 tests, MOCK-IDP, one shared `idp`)
- oauth-custom l.30, 38, 58, 73, 85, 96
- oauth-concurrent-state l.19, 34
- oauth-first-login-personal-workspace l.16
- oauth-login-loads-workspaces l.18
- oauth-custom-autocreate l.24 (put it in its own nested describe, see section 5)
- Relocated out: oauth-custom l.106 to the admin world.

**O2 `oauth-provider-config.spec.ts`** (4 tests)
- oauth-providers l.15, l.46 (admin config store and proxy URL)
- oauth-missing-config-hints l.16, l.29
- Alt: the two oauth-providers tests could go to the admin world (settings).

**O3 `oauth-sign-in-page.spec.ts`** (5 tests)
- oauth-providers l.61 (redirects, route mocks), l.89 loop (CSRF github and microsoft, 2 tests)
- oauth-google-icon l.5
- auth.spec l.163 (Google button redirect, route mock). Moved in from the auth world, since it is the same sign-in-page surface and the only Google redirect test.

Sum: 11 + 4 + 5 = 20. Folder count 21, minus 2 moved out (l.106 to admin, l.99 to auth), plus 1 moved in (auth.spec l.163) = 20.

### first-run -> 1 file (from 2)

**F1 `first-run-setup.spec.ts`** (3 tests)
- first-run-setup l.5
- QA-10 l.17, l.22 (keeps its describe-level allowFpErrors)
- Alt: QA-10 could move to the auth world (it is login-page form UI). Kept here per the assignment.

### runner -> 2 files (from 6)

**R1 `runner-modal.spec.ts`** (3 tests)
- runner.spec l.5 (open modal and click Run with no requests)
- QA-35 l.5 (English "Choose file" label, sr-only input)
- qa-36 l.5 (Passed/Failed `title`)

**R2 `runner-iterations.spec.ts`** (6 tests)
- runner.spec l.45 (JSON), l.98 (CSV), l.149 (Stop)
- runner-iteration-data-vs-profile l.34 (alt: variables world, since it is about variable precedence)
- runner-missing-variables l.4 (alt: variables world, since it is about the missing-variables modal)
- runner-codegen-url l.16 (every row gets its own result; this is a runner result test)

Relocated out of runner: runner-codegen-url l.36 (empty URL refused, scheme-less URL) to the **request-send** world; runner-codegen-url l.48 (url-encoded and form-data snippets) to the **codegen / snippets** world.

Sum: 3 + 6 + 2 moved out = 11.

### import-export -> 2 files (from 4)

**I1 `import-file.spec.ts`** (7 tests)
- import.spec l.44, 76, 103, 147, 157, 186, 201
- Alt: l.157 (environment round trip) and l.186 (drop environment) could go to the environments world.

**I2 `import-curl.spec.ts`** (3 tests)
- import.spec l.128 (cURL and raw HTTP tabs), l.215 (cURL rejects non-cURL)
- import-curl-unclosed-quote l.5 (remove the hard-coded `localhost:3205` in the input text when moving, see section 5)

Relocated out: import-export.spec l.5 to the **admin** world (system-backup target T5, since it is the admin Export Data button, `/api/admin/export/:workspaceId`).
Deleted as duplicates: curl-parser.spec (4 tests, see section 4). Three are high and one is medium.

Sum: 7 + 3 + 1 relocated + 4 curl-parser = 15.

---

## 3. DEPRECATED tests

**Result: none deprecated.** Every identifier, route and text these specs rely on exists in client/src or server/src. Each check below was a `rg -n -F` over `client/src server/src`.

Hits for the main identifiers (first match, all present):
- `login-error` / `login-submit` / `register-error` / `register-submit`: `client\pages\LoginPage.tsx:66`, `RegisterPage.tsx:67,121`
- `Enter your username or email and your password.`: `LoginPage.tsx:31`; `Enter a name, an email and a password.`: `RegisterPage.tsx:28`
- `Password must be at least 8 characters`: `server\schemas\auth.schemas.ts:7` and `server\routes\auth.ts:46`
- `register-password-hint` / `At least 8 characters.`: `RegisterPage.tsx:105`
- `did not keep the session cookie`: `client\utils\sessionCookie.ts:4`
- `Create the admin account`: `LoginPage.tsx:63`; `setup-name`: `LoginPage.tsx:82`; `/setup` route: `server\routes\auth.ts:235`; 409 when setup done: `auth.ts:236`
- `new-password-input` / `confirm-password-input` / `change-password-submit`: `components\auth\ForcePasswordChangeModal.tsx:58,73,86`
- `PASSWORD_CHANGE_REQUIRED`: `server\middleware\auth.ts:200`; `/change-password` route: `auth.ts:256`; `logged_in` cookie: `server\middleware\auth.ts:55`
- `unauthorized` event: `client\api\axios.ts:33`
- `oauth-${provider}` template: `components\common\OAuthButtons.tsx:54`; `Continue with ${label}`: `OAuthButtons.tsx:59`; Google label `'Google'`: `client\utils\oauth.ts:8`; `accounts.google.com`: `utils\oauth.ts:33`
- `OAuth Error`: `client\pages\OAuthCallbackPage.tsx:60`; `Failed to sign in with`: `server\routes\auth.ts:354`
- `admin-${provider}-missing` template with `Client Secret`: `client\pages\AdminPage.tsx:527,529`; `Client Secret` missing rule: `server\utils\oauthProviders.ts:48`
- `customOAuth` / `githubOAuth` / `microsoftOAuth` / `googleOAuth` config keys: `server\utils\oauthProviders.ts:39`, `server\routes\admin.ts:281`
- `/state` with `no-store`: `server\routes\auth.ts:295,299`; `/:provider` POST routes incl. `custom`: `auth.ts:417`, `oauthProviders.ts:7`
- `workspace-settings-btn`: `client\components\layout\Sidebar.tsx:114`; `Loading details…`: `WorkspaceSettingsModal.tsx:240`
- `s Workspace` name: `server\middleware\auth.ts:108`
- `/api/user-profile-variables` (runner-iteration): `server\routes\userProfileVariables.ts:21,36`
- `collection-runner-modal`, `collection-runner-data-file` (class `sr-only`), `Choose file`: `CollectionRunnerModal.tsx:428,498-500,543`
- `runner-passed` / `runner-failed` `title`s: `CollectionRunnerModal.tsx:591,595`
- `Enter a request URL`: `client\transport\index.ts:32`
- `missing-variables-modal`, `missing-var-value-${name}`, `missing-variables-create`: `components\collection\MissingVariablesModal.tsx:95,133,153`
- `codegen-btn`, `codegen-code-block`, `codegen-lang-${id}` (go), `body-mode-${value}` (urlencoded): `UrlBar.tsx:847`, `CodeGenModal.tsx:94,110`, `BodyEditor.tsx:67` (values `urlencoded` at `BodyEditor.tsx:58`)
- import: `import-btn` (`Sidebar.tsx:82`), `import-tab-${id}` with ids file/openapi/curl/raw (`ImportModal.tsx:423-426,453`), `import-file-input`, `import-detected-format` with `ReqSpace Environment` / `ReqSpace Collection` (`ImportModal.tsx:474,486`), `import-curl-error` with `Unclosed` (`ImportModal.tsx:113,549`), `import-name-${i}` (`ImportModal.tsx:506`), `import-error` (`ImportModal.tsx:465`), `Not a valid cURL command` (`ImportModal.tsx:380`), `Not a Postman/reqSpace collection` (`server\utils\postmanCollection.ts:254`)
- toast `Imported ${n} request(s) in ${m} folder(s)`: `ImportModal.tsx:199`
- environments: `new-env-btn` (`EnvironmentSidebar.tsx:75`), `add-env-var-btn` (`EnvironmentTabEditor.tsx:310`), `env-var-key-${i}` / `env-var-initial-${i}` (`EnvironmentTabEditor.tsx:264`), `env-save-btn` / `env-export-btn` (`EnvironmentTabEditor.tsx:208,217`), `tab-environments` (`Sidebar.tsx:152`)
- admin dump: `export-data-btn` (`client\pages\AdminPage.tsx:835`), `/api/admin/export/${workspaceId}` (`AdminPage.tsx:841`), `import-data-input` (`AdminPage.tsx:847`), `Import successful! Reloading…` (`AdminPage.tsx:873`), `mode=append` (`server\routes\admin.ts:491`)
- auth-types: `auth-type-select`, `auth-apikey-key`, `auth-apikey-value`, `auth-apikey-in-${opt}`, `auth-oauth2-token`, `auth-bearer-token`, `auth-basic-username`/`-password` (`client\components\request\AuthEditor.tsx`); `group-edit-auth-tab`, `group-auth-editor`, `group-edit-variables-tab`, `group-edit-save-btn` (`client\components\collection\GroupEditModal.tsx`); `action-menu-edit-settings` is generated from the label at `CollectionExplorer.tsx:169,431` (`action-menu-${label}`)
- curl parser: `--data-raw`, `--json`, `-F`, `-u`, `--request`, scheme-less URL all in `server\utils\curlParser.ts:54-56`
- Negative guards (still correct, not deprecated): `x-user-id` has no hit anywhere in src (`rg -n -F "x-user-id" client/src server/src` returned nothing). `auth-api.spec.ts:33` asserts 401 for those headers, which stays true. `X-Auth-User` header auth was removed (`server\repositories\SystemConfigRepository.ts:142,145` strips `mode` and `headerName`). `oauth-providers.spec.ts:99` asserts exactly that, so it is kept.

**Unsure: none.** Note that several ids are template-built and do not appear as literal strings (for example `oauth-google`, `import-tab-openapi`, `action-menu-export`). A literal grep alone would wrongly show them as absent. They were verified via their templates.

---

## 4. DUPLICATES

Compared by assertions. Confidence: HIGH is deleted automatically; MEDIUM and LOW are reported only.

1. **HIGH: curl-parser BUG-05 vs unit tests.**
   - `tests/e2e/import-export/curl-parser.spec.ts:7` "BUG-05: --data-raw, --json and -F imply POST"
   - `server/src/tests/curlParser.test.ts:12` `it.each(['--data-raw','--data-binary','--json','-d'])('%s implies POST')`, and `:27` "parses -F text and file fields as form-data" (asserts `method` POST)
   - Stronger: the unit file. It covers the same flags and more. The weaker one has no unique assertion. Delete.

2. **HIGH: curl-parser BUG-07 vs unit test.**
   - `curl-parser.spec.ts:18` "BUG-07: -u user:pass becomes basic auth"
   - `curlParser.test.ts:22` "turns -u into basic auth" (uses `user:p:ass`, which also checks the colon split)
   - Stronger: unit. Delete.

3. **HIGH: curl-parser BUG-08 vs unit test.**
   - `curl-parser.spec.ts:23` "BUG-08: a URL without a scheme is kept (normalised to http://)"
   - `curlParser.test.ts:16` "reads --request and a scheme-less URL" (asserts `http://api.test/del`)
   - Stronger: unit. Delete.

4. **MEDIUM: curl-parser BUG-06 vs unit test.**
   - `curl-parser.spec.ts:13` "BUG-06: --request DELETE is honoured (long form of -X)"
   - `curlParser.test.ts:16` (`--request DELETE`, same assertion)
   - Unique in the weaker one: `curl -XPUT ... -> PUT` (`curl-parser.spec.ts:15`). **Fold this line into `curlParser.test.ts:16` before deleting.** Medium because the unit file must run in CI for this to be safe.

5. **MEDIUM: runner.spec.ts:5 vs QA-35.**
   - `tests/e2e/runner/runner.spec.ts:5` "should open CollectionRunnerModal, configure and run"
   - `tests/e2e/runner/QA-35-runner-data-file-label.spec.ts:5` "Run Collection data-file picker shows an English 'Choose file' label"
   - Both open the runner from the collection menu and assert the modal is visible. The weaker (runner.spec) also clicks Run with force on zero requests. **Fold that click into QA-35 (no crash on zero requests), then delete runner.spec:5.** Medium.

6. **MEDIUM: identity-header tests.**
   - `tests/e2e/auth/auth-api.spec.ts:33` "identity headers (x-user-id / x-user-email) do not authenticate"
   - `tests/e2e/oauth/oauth-providers.spec.ts:99` "the legacy X-Auth-User header no longer authenticates, and header mode is not a setting"
   - Both assert `GET /api/auth/me` returns 401 with identity headers. Different header names; oauth-providers also checks `mode`/`headerName` are dropped. **Fold into one test with all three headers and the config check.** Medium.

7. **MEDIUM (cross-layer): runner-codegen-url:48 vs client unit test.**
   - `tests/e2e/runner/runner-codegen-url.spec.ts:48` "code snippets include url-encoded and form-data bodies"
   - `client/src/utils/codegen.test.ts:36-41` asserts `--data-urlencode 'a=1'` and Go `strings.NewReader("a=1&b=two%20words")`
   - The snippet output is already asserted at unit level. The e2e-only part is UI wiring (`body-mode-urlencoded`, `codegen-btn`, `codegen-lang-go`). **Keep for the wiring. Drop only the snippet-text assertions if the codegen world wants a single source.** Medium. Do not delete automatically.

**NOT duplicates (checked, to stop re-checks):**
- oauth-custom:38 vs oauth-custom-autocreate:24: both run full SSO and check `/api/auth/me` email. Autocreate adds self-registration off and the 403 on password register; oauth-custom:38 adds token exchange, name, `authType`. Keep both. LOW overlap.
- oauth-custom:85 "unverified" vs :96 "no email": both give OAuth Error and 401, but they are different branches (unverified email vs missing email). LOW, keep both.
- auth.spec:163 (Google button redirect) vs oauth-providers:61 (GitHub and Microsoft redirects): same route-mock pattern, different providers. Keep both.
- auth-forms:61 (login dark banner) vs QA-54-65:7 (login empty submit text): same trigger, different assertion. Keep both; could share a describe.
- import.spec:157 (environment round trip) vs import.spec:186 (drop environment): both assert "ReqSpace Environment" detection, but the triggers differ (file input vs drop). LOW.
- import-curl-unclosed-quote:5 vs import.spec:215: different error messages ("Unclosed" vs "Not a valid cURL command"). Not duplicates.
- runner.spec:45 (JSON) vs runner.spec:98 (CSV): different formats. Not duplicates.
- runner-iteration:34 vs runner.spec:98 (CSV): both substitute a CSV row, but runner-iteration asserts precedence over profile variables, which is unique. Not duplicates.
- import-export.spec:5 vs system-backup (admin world): different endpoint (`/api/admin/export/:id` vs `/api/admin/system/export`). Not duplicates.

---

## 5. MERGE RISKS per target

**Global state changed by these tests (most important):**
- **Custom SSO provider** (`enableCustomProvider` / `disableCustomProvider`, `tests/e2e/mock-idp.ts:53,69`) is one global config. Every oauth file toggles it. `playwright.config.ts` sets `workers: 1` and `fullyParallel: false`, so files do not race. The risk is ordering: a failed `afterAll` leaves the provider on. In O1, the nested describe for autocreate must restore `allowSelfRegistration: true` (currently l.19) and must not disable the provider for the other tests. Put it last, or give it its own describe with its own `beforeAll`/`afterAll`.
- **`allowSelfRegistration`**: global-setup sets it true (`tests/e2e/global-setup.ts:58`). autocreate sets it false and restores true in `afterAll`. Keep that restore in a `finally` if it moves.
- **OAuth provider config** (`githubOAuth`, `microsoftOAuth`, `googleOAuth`): oauth-providers l.15 enables GitHub and Microsoft and disables them at the end, but **not in a `finally`**. If it fails, `admin-github-missing` (missing-config test 1) and the sign-in buttons are affected. Move that cleanup into `finally` when merging into O2. google-icon l.7/16 already uses `finally`.
- **Admin config writes from oauth-providers l.51**: `githubOAuth.proxyUrl` is set and cleared at l.58, not in a `finally`. Same fix.
- **Dump export/import** (import-export.spec) runs as the shared seeded admin and creates a workspace and collection in that account. Later admin tests that count workspaces or collections could see extra rows. Keep it out of the auth/import file once it moves to the admin world.

**allowFpErrors scoping (highest silent-masking risk):**
- oauth-concurrent-state, oauth-first-login, oauth-login-loads-workspaces have **no** allowFpErrors. Putting the file-level list from oauth-custom (`/server-auth|status code 40[013]/`) on O1 would silently allow 4xx/5xx in those tests. **Scope the list to the describe that needs it.**
- auth-types has a file-level `console.error: Network Error` list, which only matters in that file. Keep it file-level inside A4 (no merge with others).
- auth.spec's `status code 401` list is inside the sign-out describe (l.45). Moving the logout test to A2 must keep that describe, or the expired-session test (l.143) loses its scope.
- login-session-cookie has `server-auth|status code 401` in its describe. Keep the describe when it moves into A2.
- forced-password-change uses file-level `server-auth|status code 40[013]` (l.92). Merging it into A2 with auth.spec's logout test would leak it to the others. Keep it in a describe.
- first-run-setup has **no** allowFpErrors even though it expects a 409. It passes today, so the 409 is not recorded. Do not add a file-level list to F1 that changes this.
- runner files: no allowFpErrors anywhere. Keep it that way.

**Serial order and shared entities:**
- auth-types is `describe.configure({mode:'serial'})` (l.23). Test 1 registers `EMAIL`, and tests 2-7 depend on it and on the `COLLECTION` created in test 1. Keep it in its own file with serial mode at describe level. Do not merge it into A1/A2. Running a single test with `--grep` breaks it.
- oauth-custom `beforeEach` (l.24) resets `idp.mode` and `tokenRequests`. Every test in O1 must keep that reset, or the `tokenRequests` length assertion (l.52) breaks when tests are reordered.
- oauth-custom l.52 expects exactly one token request. If O1 runs concurrent-state first, the count stays per-test because of the `beforeEach`. Keep it.
- forced-password-change changes its user's password to `password456` (l.138). The user is unique (`uniq()`), so it is safe.

**Fresh user / empty workspace assumptions:**
- oauth-first-login-personal-workspace asserts exactly one personal workspace (l.26). It relies on a fresh email (`Date.now()`). Keep the email unique.
- oauth-custom l.70 counts users by email. It relies on unique emails (`Date.now()`).
- runner-iteration: `ts` is set at module load (l.11), so the email is unique per file run. Merging into R2 is fine as long as this stays module-level.
- runner.spec, QA-35, qa-36, import.spec, runner-missing-variables and runner-codegen-url each register their own user in every test. Safe to merge. runner-codegen-url's `beforeEach` (l.11-14) must travel with tests 36 and 48 when they move out.
- import.spec tests each use `registerUser` with their own prefix, so no workspace collisions. The collection name `Imported Pets` repeats across tests, which is safe only because each test has its own user.

**Hard-coded ports and hosts (CLAUDE.md says never hardcode ports):**
- runner-iteration-data-vs-profile.spec.ts:28 hard-codes `http://localhost:5173` for the CSRF origin. When moving, read the client origin from the environment (`CLIENT_PORT`) or `baseURL`.
- import-curl-unclosed-quote.spec.ts:9 and :13 contain `localhost:3205`. This is only text for the parser, but it breaks the rule. Remove the port when moving to I2.

**Unique-name collisions:**
- auth.spec `loginEmail` uses `loginuser_${timestamp}` and the beforeAll 409 is accepted. Safe.
- oauth-providers `anon()` uses a random `X-Forwarded-For` (l.11-12). Keep it, since the login limiter is off in e2e but the header keeps budgets isolated.
- runner-iteration `ip()` (l.12) is random. Keep.

**Other:**
- auth.spec l.66 (forced-change modal) mocks `/api/auth/me` with a closure over `loggedIn` and mocks `/api/workspaces`. Route mocks are page-scoped, so they do not leak to other tests in the same file. Keep them inside the test.
- runner.spec l.149 (Stop) waits a fixed 2000 ms and checks `callCount < 5`. It is timing-sensitive. Not a merge problem, but a flake risk to note.
- runner.spec uses `input[type="number"]`.nth(1) and `input[type="file"]` (l.83-84, 134-135). Index-based selectors break if the modal gains an input. Keep as-is unless the runner world rewrites them.
- QA-35 and qa-36 have inconsistent file-name casing and numbering. Rename when moving.

---

## 6. Tests that belong in a different world

| Test | Current file:line | Belongs in | Why |
|---|---|---|---|
| "admin rejects a non-http(s) provider URL" | oauth/oauth-custom.spec.ts:106 | **admin** (settings, T4) | Pure admin config validation via `PUT /api/admin/config`. |
| "legacy X-Auth-User header no longer authenticates" | oauth/oauth-providers.spec.ts:99 | **auth** (A3) | Identity-header auth, not OAuth. Folded with auth-api:33 (dup #6). |
| "SSO login option shows Google and redirects" | auth/auth.spec.ts:163 | **oauth** (O3) | Sign-in button and provider redirect. Moved in. |
| "Admin Export Data (workspace dump) round trip" | import-export/import-export.spec.ts:5 | **admin** (T5 backup) | Admin Export Data button and `/api/admin/export/:id`. |
| "empty URL refused; scheme-less URL gets http://" | runner/runner-codegen-url.spec.ts:36 | **request-send** | Send button and transport validation. |
| "code snippets include url-encoded and form-data bodies" | runner/runner-codegen-url.spec.ts:48 | **codegen / snippets** | Codegen modal output. |
| "iteration data wins over a profile variable" | runner/runner-iteration-data-vs-profile.spec.ts:34 | **variables-environments** (alt; kept in R2 for now) | Variable precedence. |
| "runner asks to create missing variables" | runner/runner-missing-variables.spec.ts:4 | **variables-environments** (alt; kept in R2 for now) | `MissingVariablesModal` and profile variables. |
| "environment import / drop environment" | import-export/import.spec.ts:157, :186 | **environments** (alt; kept in I1) | Environment round trip. |
| "QA-10 setup screen" | first-run/QA-10-first-run-screen.spec.ts | **auth** (alt; kept in F1) | Login-page form UI. |
| "auth-types (API key, OAuth2, inherit)" | auth/auth-types.spec.ts | **requests** (alt; kept in A4) | Request AuthEditor and collection/folder auth. |

---

## Summary of counts after plan

- Files: 28 today, **10 targets** (auth 4, oauth 3, first-run 1, runner 2, import-export 2). Roughly 36 percent, within the third-to-half target.
- Tests: 74 today. Deletions after folding unique assertions (section 4): curl-parser.spec.ts (4 tests: 3 high, BUG-06 medium once `-XPUT` is folded), runner.spec.ts:5 (medium, fold the zero-request Run click into QA-35), and auth-api.spec.ts:33 / oauth-providers.spec.ts:99 merged into one test (medium). Net 6 tests removed, 0 coverage lost, given the folds.
