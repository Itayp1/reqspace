# Consolidation plan: tests/e2e/requests/

Scope: all 20 `*.spec.ts` directly under `tests/e2e/requests/` (repo root `C:\projects\reqspace`). Read-only analysis; no tests were run. Every file was read in full. Selectors and text were checked against `client/src` and `server/src`.

Login legend: **UI-admin** = `page.goto('/login')` with `admin` / `admin123456` (requests.spec only); **NEW** = `registerUser()` or inline register; **ANON** = no login.

Totals: **20 files, 42 tests**. Proposed: **7 target files, 41 tests kept, 1 deleted** (duplicate, medium confidence). No deprecated tests.

## 1. Per-file inventory

| File | Tests (line) | Purpose | File-level setup | Login |
|---|---|---|---|---|
| cookies-console.spec.ts | 5 (32, 77, 100, 127, 175) | Cookie manager adds/attaches, other-domain not sent, persists and deletes; Console logs script, auth, real URL, clear; form-data expands in Console | `describe` **serial** (l.13); local `registerAndOpenRequest()` (l.18): register, `PUT /api/auth/settings {sendCookies:true}`, open new request. No origin rewrite | NEW (UI register) |
| edgecases.spec.ts | 1 (4) | JSON comments stripped from raw body before send | none; `page.route('**/api')` glob (l.19); clipboard paste into Monaco | NEW (inline register) |
| editor-layout.spec.ts | 1 (4) | Request editor keeps usable height with Console open | none | NEW (`registerUser`) |
| editor-placeholder.spec.ts | 1 (4) | Empty raw body placeholder hides on typing | none | NEW (`registerUser`) |
| fix-D12.1.spec.ts | 1 (22) | Set-Cookie from response goes to jar, Cookies tab and next request | `addInitScript` fakes `window.electron.sendRequest` (l.23-47); `registerUser`; no `/api` origin rewrite | NEW |
| fix-I2.1.spec.ts | 2 (38, 64) | Response Headers tab: repeated headers one row each (fake electron); web transport lists CORS-exposed headers | `describe` (l.37); local `openRequest()` (l.22) with origin rewrite hard-coded to `localhost:5173` (l.23) | NEW + API seed |
| fix-I2.2.spec.ts | 1 (37) | Response Cookies tab matches the jar; leading-dot domain not duplicated; Max-Age=0 removes | no describe; `fakeExtension()` (l.17) PING/PONG + SEND/RESPONSE postMessage; origin rewrite `5173` (l.39); inline seed | NEW + API seed |
| fix-I2.4.spec.ts | 1 (15) | JSON Path filter: `$..id` and `$.a.b[*]` | no describe; local `mockServer()` (l.7); origin rewrite `5173` (l.17); inline seed | NEW + API seed |
| large-response.spec.ts | 2 (6, 53) | 100 MB response shows "Response too large", stays responsive, saves file (l.6, `setTimeout 240000` in body); 1 MB response stored in history as size note only (l.53) | no describe; real `http` server per test; origin rewrite `5173` (l.20, l.63) | NEW + API seed |
| cors-clear-message.spec.ts | 1 (7) | CORS-blocked request says "Blocked by CORS" and "Extension not installed" | no describe; real `http` server; origin rewrite `5173` (l.12); inline seed | NEW + API seed |
| qa15-ctrl-enter-sends-once.spec.ts | 1 (5) | Ctrl+Enter in URL bar sends once | no describe; `scene()` + `mockServer()` from `../scene.ts` | scene (NEW) |
| qa41-params-without-query.spec.ts | 1 (5) | Saved enabled params sent when URL has no `?` | no describe; `scene()` with params | scene (NEW) |
| qa50-form-data-content-type.spec.ts | 2 (11, 19) | form-data sent as multipart even with manual Content-Type; empty form-data sends no body | no describe; `scene()` | scene (NEW) |
| qa55-response-splitter-resizes.spec.ts | 1 (5) | Splitter drag makes response pane taller, selects no text | no describe; `scene()` | scene (NEW) |
| raw-json-body-content-type.spec.ts | 1 (7) | Raw JSON body sent with `Content-Type: application/json` by default | no describe; `registerUser`; `page.route('**/echo')` | NEW |
| send-cookies-default-off.spec.ts | 1 (5) | "Send Cookies Automatically" is off by default | no describe | NEW |
| requests.spec.ts | 10 (22, 41, 70, 100, 132, 167, 214, 250, 286, 321) | Request persistence: create workspace and collection, save GET, POST JSON send, bearer/basic/auth+body, raw JSON/form-data/urlencoded persist after save+reload, dirty state and undo/redo | `describe.configure serial` (l.5); `beforeEach` (l.12) logs in as `admin`; `workspaceId` shared from test 1 (l.10, l.28); unique `WORKSPACE_NAME` (l.9) | UI-admin (every test) |
| response.spec.ts | 2 (7, 55) | Test Results tab + code-gen modal (l.7, real httpbin.org); per-mode viewer for JSON/HTML/image/PDF and 504 (l.55, mocked) | `describe` (l.3) with describe-level `timestamp` (l.4-5); register via `page.fill` with password `password` | NEW |
| request-editor.spec.ts | 5 (10, 17, 25, 34, 40) | Tabs and snippet buttons exposed; unresolved variable is dashed not red; manual Content-Type + form body warning; URL-bar aria names; code-gen languages wrap | **file-level** `test.beforeEach` (l.5): `registerUser` + `new-tab-btn` (applies to all 5) | NEW |
| request-error-hints.spec.ts | 2 (26, 32) | I4.4: blocked http request mentions mixed content; I4.5: SSL failure explains SSL and Verify SSL hint | test 1 in `describe` (l.25); test 2 top-level (l.32); shared local `openSeededRequest()` (l.5) with origin rewrite `5173` (l.6) | NEW + API seed |

Scope notes:
- No file declares `test.use({ allowFpErrors })`. Every test runs under the fperrors guard (`tests/e2e/fixtures.ts` l.112-141).
- Only `cookies-console` (describe), `requests.spec` (describe), and `request-error-hints` (test 1) use a describe. The rest are top-level.
- `admin-settings-text`, `fix-I4.4`, `fix-I4.5` are NOT in admin/. `consolidation-admin.md` (section 1, rows fix-I4.4/fix-I4.5) and section 2 assume they are in `admin/`. They are here, in `request-error-hints.spec.ts`. Fix the admin plan.

## 2. Proposed target spec files

Seven targets (20 to 7, 35%). Each line is `file:line` of the source test.

**T1 `request-persistence.spec.ts`** (9 tests, `requests.spec.ts` renamed; keep as one serial file)
- requests.spec.ts:22 (create workspace), :41 (save GET), :100 (bearer), :132 (basic), :167 (auth + body), :214 (raw JSON persist), :250 (form-data persist), :286 (urlencoded persist), :321 (dirty and undo)
- Keep the file serial and keep :22 first. The later tests use `workspaceId` from :22 (l.28).
- Deleted: requests.spec.ts:70 (duplicate, see section 3).

**T2 `request-body-wire.spec.ts`** (5 tests): what the browser sends on the wire
- raw-json-body-content-type.spec.ts:7
- qa50-form-data-content-type.spec.ts:11, :19
- qa41-params-without-query.spec.ts:5
- edgecases.spec.ts:4

**T3 `response-viewer.spec.ts`** (8 tests)
- response.spec.ts:7 (Test Results half; it also covers code-gen, see section 6), :55 (per-mode viewer)
- fix-I2.4.spec.ts:15 (JSON Path filter)
- fix-I2.1.spec.ts:38 (repeated headers), :64 (web headers)
- large-response.spec.ts:6 (too large + save), :53 (size note; candidate to move to history-search, see section 6)
- qa55-response-splitter-resizes.spec.ts:5 (splitter)

**T4 `request-editor-ui.spec.ts`** (8 tests)
- request-editor.spec.ts:10 (tabs/aria), :17 (variables), :25 (Content-Type warning), :34 (aria names), :40 (code-gen wrap)
- editor-layout.spec.ts:4, editor-placeholder.spec.ts:4
- qa15-ctrl-enter-sends-once.spec.ts:5
- Scope the existing `beforeEach` (request-editor.spec.ts:5) to its own `describe`. Otherwise it also runs for editor-layout and editor-placeholder, which register on their own.

**T5 `cookie-jar.spec.ts`** (6 tests)
- cookies-console.spec.ts:32 (attach), :77 (other domain not attached), :100 (persist and delete)
- send-cookies-default-off.spec.ts:5
- fix-D12.1.spec.ts:22 (Set-Cookie to jar to next request)
- fix-I2.2.spec.ts:37 (Cookies tab sync)

**T6 `console-drawer.spec.ts`** (2 tests)
- cookies-console.spec.ts:127 (Console logs and clear), :175 (form-data expand)
- Keep the describe-level `serial` only if it is needed. These two do not depend on each other.

**T7 `request-errors.spec.ts`** (3 tests)
- request-error-hints.spec.ts:26 (I4.4), :32 (I4.5)
- cors-clear-message.spec.ts:7
- One shared `seedRequest(page, prefix, url, beforeReload?)` helper (origin rewrite, register, seed, open) replaces `openSeededRequest` (request-error-hints.spec.ts:5) and the inline seeds in fix-I2.1, fix-I2.2, fix-I2.4, large-response and cors-clear-message. Put it in a non-spec helper file in the world folder, or in `tests/e2e/helpers.ts`.

Count check: 9 + 5 + 8 + 8 + 6 + 2 + 3 = 41 kept. Plus 1 deleted = 42.

## 3. Deprecated tests

**None.** Every selector, text, route and setting used by the 42 tests exists in the current source. Checks run:

1. `Grep` in `client/src` for the testids and texts (full pattern list, `-o` mode). Results with file:line:
   - `components/common/CookieManagerModal.tsx:72` `cookie-manager-modal`; `:96` `cookie-add-domain-toggle`; `:110` `cookie-new-domain-input`; `:127` `cookie-new-domain-submit`; `:150` `cookie-domain-${...}`; `:205` `cookie-add-btn`; `:221` `No cookies for`; `:240` `cookie-row`; `:244` `cookie-name-input`; `:255` `cookie-value-input`; `:267` `cookie-path-input`; `:307` `cookie-delete-btn`; `:333` `cookie-close-btn`.
   - `components/layout/TopBar.tsx:178` `Manage cookies` (aria-label); `components/response/ResponseViewer.tsx:512` and `components/request/UrlBar.tsx:839` `Manage Cookies`.
   - `components/layout/MainLayout.tsx:102` `console-toggle-btn`; `:106` `console-drawer`; `components/layout/ConsoleDrawer.tsx:98` `console-close-btn`; `:81` `console-reveal-btn`; `:89` `console-clear-btn`; `:113` `No logs yet`; `:119` `console-log-${log.type}` (types: `consoleStore.ts:6` `'request' | 'log' | 'error' | 'warn'`); `:165` `console-log-details`.
   - `components/response/ResponseViewer.tsx:249` `response-tab-${tab}` (tabs at `:244`: body, cookies, headers, test_results, visualizer); `:260` headers count; `:270` `response-status`; `:383` `response-body-viewer`; `:387` `Response too large`; `:393` `large-response-save`; `:367` `Filter JSON`; `:199` `Invalid JSON path`; `:201` `No match`; `:179` `not saved to history`; `:432` `Response HTML Preview`; `:572-577` `test-result-item`, `test-result-status`, `test-result-name`.
   - `components/request/CodeGenModal.tsx:22` `{ id: 'csharp' }`, `:19` `python-requests`, `:16` `curl`; `:94` `codegen-lang-${lang.id}`; `:76` `codegen-modal`; `:79` `Generate code`; `:110` `codegen-code-block`; `components/request/UrlBar.tsx:847` `codegen-btn`; `:879` `Save options`.
   - `components/request/BodyEditor.tsx:57-59` values `form-data`, `urlencoded`, `raw`; `:67` `body-mode-${m.value}`; `:83` `body-raw-language-select`; `:111` `body-content-type-warning`.
   - `components/request/RequestEditor.tsx:84` `req-tab-${tab.toLowerCase()...}`; `:17` `'Pre-request Script'`. `components/request/ScriptEditor.tsx:11` `Get Environment Variable`; `:18` `Set request header (pre-request)`.
   - `components/request/UrlBar.tsx:823` `request-url-input`; `:941` `request-send-btn`; `:150-151` `Extension not installed` / `Blocked by CORS`; `:145-161` mixed-content and `Verify SSL` text; `:592`, `:604` `Network Error`; `:371` `sendCookies` check; `:497` `set-cookie`.
   - `components/request/AuthEditor.tsx:52` `auth-type-select`; `:88` `auth-bearer-token`; `:116` `auth-basic-username` (and password).
   - `components/request/RequestTabBar.tsx:179` `dirty-indicator`; `:198` `new-tab-btn`; `:207` `new-connection-btn`; `:214` text `Connection`.
   - `components/request/KeyValueEditor.tsx:143` `kv-key-${i}`; `:189` `kv-val-${i}`.
   - `components/request/UrlBar.tsx:810` `method-select`; `components/request/LazyEditor.tsx:19` `editor-placeholder`; `components/common/VariableInput.tsx:223` `Undefined variable`.
   - `components/layout/Sidebar.tsx:162` `tab-history`; `components/history/HistorySidebar.tsx:228` `history-item`.
   - `pages/AppScreen.tsx:83` `response-splitter`; `:100` `response-pane`.
   - `components/common/GlobalSettingsModal.tsx:209` `Send Cookies Automatically`; `:214` `id="sendCookies"`; `store/settingsStore.ts:77` `sendCookies: false`.
   - `transport/extension.ts:60` `REQSPACE_PING`, `:92` `REQSPACE_SEND`, `:20` `reqspace-extension`; `transport/index.ts:19` `if ((window as any).electron) return new ElectronTransport()`.
   - `components/collection/CollectionExplorer.tsx:1176` `new-collection-empty-btn`; `:149` `testId="prompt-input"`; `:334` `node-${request.name}`; `components/common/WorkspacePicker.tsx:59` `workspace-select`; `pages/RegisterPage.tsx:76-121` `register-*`; `components/layout/Sidebar.tsx:105` `new-workspace-btn`.
2. `Grep` in `server/src` for server-side strings: `routes/history.ts:74`, `:87` return `responseSnapshot`. `Response too large`, `Blocked by CORS`, `Verify SSL`, `Invalid JSON path` and `reqspace-extension` appear only in `client/src`, which is correct (they are UI-side). The server-side matches for `set-cookie`/`Max-Age` are only in `server/src/tests`, which is not what these specs test.

Notes that are not deprecation:
- `request-error-hints.spec.ts:28` expects `/mixed\s+content/i`. The text is at `UrlBar.tsx:158` ("Mixed content: if this app is opened over HTTPS ..."), which is printed for any plain-http URL, not only on an HTTPS page. The test is valid. If that branch changes, the test must change too.
- `request-error-hints.spec.ts:37` expects `turn off "Verify SSL"` (`UrlBar.tsx:161`). Matches the regex, which allows up to 2 characters (`"`) between "off" and "Verify".

## 4. Duplicates

1. **MEDIUM (delete after confirming): requests.spec.ts:70 "Create a POST request with JSON body, save and send" vs raw-json-body-content-type.spec.ts:7 "a raw JSON body is sent with Content-Type application/json by default".**
   - Both: type a raw JSON body in a POST request, send, check the send path.
   - raw-json:21 is stronger: it checks the exact header `application/json` and does not explicitly pick the `json` language, so it tests the default path.
   - requests.spec.ts:70 has no unique assertion except the status 200 from the real `https://httpbin.org/post` (l.81, l.97). That depends on the external network and is not in the test's name. Its title says "save" but it does not save.
   - Unique assertion to fold in before deleting: none. Optional: keep the 200 check in raw-json by adding `expect(response-status).toContainText('200')`.
   - Confidence: medium, because it is a flow duplicate and not a strict assertion duplicate.

2. **MEDIUM (assertion-level): editor-layout.spec.ts:10 `new-connection-btn` `toContainText('Conn')` vs request-editor.spec.ts:34 `toHaveText('Connection')`.**
   - The request-editor assertion is exact and stronger. Delete the line at editor-layout.spec.ts:10. Keep the test: its unique assertions (`kv-key-0` in viewport with the Console open, l.9) are the layout point.
   - Confidence: medium, because this is one line of a test, not a whole test.

No other duplicates. Checked and NOT duplicates:
- raw-json-body-content-type:21 vs requests.spec.ts:214 (`content-type` check): requests.spec:223 explicitly selects `json` in the language dropdown, which the comment at raw-json:6 says is the only case that sets the header. requests:214 does not cover the default path. Keep both.
- qa50.spec.ts:16 vs requests.spec.ts:281 (multipart send): requests:281 is part of the persistence test (T1, `:250`), whose unique assertion is the persisted fields (l.274-275). Keep both.
- fix-I2.2.spec.ts:37 vs fix-D12.1.spec.ts:22 (jar sync): different assertions. I2.2 checks the leading-dot no-duplicate (l.62-64) and Max-Age=0 removal (l.72-82). D12.1 checks four cookies, path match and Secure not sent (l.74-88). Keep both.
- fix-I2.1.spec.ts:38 vs fix-D12.1.spec.ts:22: both fake `window.electron` with `set-cookie` arrays, but I2.1 asserts the Headers tab count and rows, D12.1 asserts the Cookies tab and the jar. Keep both.
- cors-clear-message.spec.ts:7 vs request-error-hints.spec.ts:32 (I4.5): both hit the network-failure branch of `UrlBar.tsx:132-165`, but on different branches (CORS vs SSL hint). Keep both.
- cookies-console.spec.ts:100 persist/delete vs fix-I2.2.spec.ts:72-82 delete: the first is the manager UI, the second is the response tab. Keep both.
- Unit tests outside e2e: `client/src/store/cookieStore.test.ts:35-42` covers the Max-Age=0 delete that fix-I2.2 tests end to end. Not an e2e duplicate. Do not delete.

## 5. Merge risks per target

**Global state and setup**
- **T1 serial chain:** `requests.spec.ts:22` must run first. Tests :41, :100, :132, :167, :214, :250, :286, :321 read `workspaceId` (l.10, set at l.28). Keep them in one serial describe. Splitting breaks them silently under `--grep` or retries.
- **T1 login as `admin`:** `beforeEach` (l.12) logs in with `admin` / `admin123456`. This works only because the seeded admin has no forced password change. Do not change it to `registerUser` without also changing the `workspaceId` flow.
- **T1 admin workspace accumulation:** each run creates a unique workspace (`WORKSPACE_NAME`, l.9), so names stay unique. The test `new-collection-empty-btn` (l.35) creates "Test Collection" in that new workspace each run. Keep the `Date.now()` suffix.
- **T5 and T6 serial:** `cookies-console.spec.ts` is one `serial` describe (l.14). Its tests use fresh users from `registerAndOpenRequest`, so they do not depend on each other. If T5/T6 split it, keep `serial` only on the file that needs it, or drop it.
- **T3 describe timestamp:** response.spec.ts l.4-5 computes `timestamp` and `testEmail` at collection time, shared by the describe. Only test 1 uses the describe-level one. Move it into test 1 when merging, so the file-level value cannot collide.

**Test.use and allowFpErrors**
- No test here uses `allowFpErrors`. Keep it that way: any merged file that hoists an allow list from another world would hide real faults here.
- The guard fails any server 5xx or client error group recorded during the test (`tests/e2e/fixtures.ts` l.7-11). Watch for failed `/api` calls in `request-error-hints` and `cors-clear-message` (the origin-rewrite route fulfils API calls, so they should stay clean).

**Timeouts**
- `large-response.spec.ts:7` `test.setTimeout(240_000)` is inside test 1, not the describe. Keep it that way in T3; otherwise every response test gets 240 s and a real hang would be masked.
- `large-response.spec.ts` test 1 waits 120 s for "Response too large" (l.37). Keep the test-level timeout.

**Origin rewrite and ports (CLAUDE.md: never hardcode ports)**
- Six files hard-code `origin: 'http://localhost:5173'` in `page.route(/\/api\//, ...)`: fix-I2.1 l.23, fix-I2.2 l.39, fix-I2.4 l.17, large-response l.20 and l.63, cors-clear-message l.12, request-error-hints l.6. The shared `scene.ts` (l.20) uses `new URL(page.url()).origin`. The shared helper in T7 must use that form, and the other targets should switch to it, or the tests break when `CLIENT_PORT` is not 5173.
- `edgecases.spec.ts:19` has no origin rewrite and uses a `'**/api'` glob that matches only `…/api` and not `/api/*`. Keep it that way, but note it when merging into T2.

**Init scripts**
- `addInitScript` in fix-D12.1 (l.23), fix-I2.2 (l.18) and fix-I2.1 (l.39) is per-test. Do NOT move it to a `beforeEach` in a merged file: it would leak `window.electron` and the fake extension into other tests (`transport/index.ts:19` checks `window.electron` to pick the transport).

**Helpers and unique names**
- `registerUser(page, prefix)` (tests/e2e/helpers.ts:5) makes unique emails from the prefix. Current prefixes: cookie, cookie_other, cookie_persist, console, console_form, layout, editor_ph, d121, i21, i22, i24, bigresp, midresp, cors1, rawjson, cookiedef, requx, i44, i45, repro (scene.ts). These do not collide. Keep each prefix unique when merging.
- `scene()` (scene.ts l.18) registers prefix `repro`. Tests that call it twice in one file would collide if they share a `Date.now()`. Current files call it once per test, so this is safe.

**Request-editor describe-level beforeEach**
- `request-editor.spec.ts:5` `test.beforeEach` registers a user and opens a new tab. In T4 it must sit inside its own `describe` block. Otherwise editor-layout (l.5) and editor-placeholder (l.5) register twice.

**External network**
- `response.spec.ts:27-30` sends to real `https://httpbin.org/get` and expects 200 at l.30 (15 s). `requests.spec.ts:47` fills httpbin but does not send. `requests.spec.ts:81` sends to httpbin (T1 test deleted, see section 4). If httpbin is down, response.spec test 1 fails with no app fault. Replace with `page.route('https://httpbin.org/get', ...)` in T3 (small change, same assertions).

**Monaco and clipboard**
- `edgecases.spec.ts:52` writes to `navigator.clipboard` and presses Ctrl+V. Needs clipboard permission. Keep this test alone or in T2 with the same permissions; do not hoist `permissions` to a file that does not need it.

## 6. Tests that belong in a different world

- **history-search world:** `large-response.spec.ts:53` "a 1MB response is not stored in history; history keeps only a size note". Its assertions are on `tab-history`, `history-item` and `GET /api/workspaces/:id/history` (l.79-85). Medium confidence. If moved, T3 loses 1 test and the history world gets it; keep the `allowFpErrors`-free setup.
- **variables-environments world:** `request-editor.spec.ts:17` "unresolved variable is not error-red: dashed underline plus tooltip". It tests `VariableInput` (`client/src/components/common/VariableInput.tsx:223`, `Undefined variable`). Medium confidence.
- **ui world** (if the ui folder owns layout and a11y): `editor-layout.spec.ts:4`, `editor-placeholder.spec.ts:4`, `qa55-response-splitter-resizes.spec.ts:5`, `request-editor.spec.ts:10` (tabs and snippet aria) and `:34` (aria names). Low-medium; keep in requests unless the ui world is already doing layout checks. In T3/T4 these are noted, not moved.
- **settings world (unsure):** `send-cookies-default-off.spec.ts:5`. It tests a global setting toggle. No settings world folder exists among the current worlds; keep it in T5 (cookie jar) until a settings world exists.
- **Not a move:** requests.spec.ts:100 and :132 (bearer/basic on a request) stay in requests. They are request-level auth, not the auth world (login/session), despite the folder name.
- **Correction to other plan:** `consolidation-admin.md` lists fix-I4.4 and fix-I4.5 as admin files to be moved to a "request-errors / network world". They are already in this folder (`request-error-hints.spec.ts`). Remove them from the admin move list. T7 here is their target.

## 7. Summary of changes proposed

- Rename `requests.spec.ts` to `request-persistence.spec.ts` (T1). Delete test l.70 (duplicate, medium).
- Delete `editor-layout.spec.ts` l.10 assertion (medium).
- Merge the other files into T2 to T7 as listed in section 2. Replace the six hard-coded origin rewrites with `new URL(page.url()).origin`. Scope the request-editor `beforeEach` to its describe. Keep the fperrors guard and no allowFpErrors.
- Optional: replace httpbin in response.spec test 1 with a route mock.
