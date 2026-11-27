# Inventory A (spec files 1-96 of `find tests/e2e -name '*.spec.ts' | sort`)

### tests/e2e/admin-management.spec.ts
- describes: Admin management; errors panel
- tests: 9 ; set up a user to manage; Make Admin and Revoke Admin flip super admin flag; Suspend locks out / Reactivate; admin cannot revoke/suspend self; Workspaces tab + Manage Permissions; audit log names actor and target; errors panel lists fault and Fixed removes it; SMTP and Google OAuth settings saved; Delete removes user and personal workspace
- fixture: both
- login: ui-login admin (loginAdminUi) + apiAsAdmin; creates a managed user via API
- state: admin user, a new unique user, global SMTP/OAuth config, error log rows, audit log; serial (describe-level `mode: serial`), order-dependent
- topic: admin

### tests/e2e/admin-settings-text.spec.ts
- describes: none
- tests: 1 ; Admin settings SSRF text does not claim to govern "Send"
- fixture: neither (reads source file via fs)
- login: none
- state: none (static text check)
- topic: admin

### tests/e2e/admin.spec.ts
- describes: Admin Features
- tests: 2 ; Admin login and dashboard; login + dashboard render only system config update
- fixture: page
- login: ui-login admin (seeded superadmin)
- state: reads admin dashboard and system config; no writes noted; parallel-safe
- topic: admin

### tests/e2e/api-authorization.spec.ts
- describes: TEST-4: API Authorization Layer
- tests: 2 literal (data-driven loops over endpoints x roles, so many runs) ; should return expected status for each role; mass-assignment / foreign access is blocked
- fixture: request
- login: other: API login per role (api/auth/login) with seeded superadmin plus registered users; beforeAll builds the role users
- state: new unique users per role, workspaces, mutating endpoints exercised; beforeAll setup; needs clean-ish DB for role fixtures, no serial mode
- topic: rbac

### tests/e2e/api-perf.spec.ts
- describes: Performance Tests
- tests: 1 ; API endpoints respond in under perfLimit ms
- fixture: request
- login: api register then api login (new unique user)
- state: one new user, reads workspaces; timing-sensitive
- topic: perf

### tests/e2e/app-shell.spec.ts
- describes: App shell; database outage
- tests: 4 ; database outage shows database-error screen; unknown path lands on app or login; dynamic variables resolve fresh values; owner changes a member's role
- fixture: both
- login: ui-login new user (registerUser) + apiAs
- state: new unique users and workspaces; the DB-outage test simulates failure (may affect shared server state for the test's duration)
- topic: app-shell

### tests/e2e/auth-api.spec.ts
- describes: Auth API & Security Edge Cases
- tests: 2 ; config endpoint 403/401 for unauthorized users; identity headers (x-user-id / x-user-email) do not authenticate
- fixture: request
- login: none (unauthenticated requests, spoofed headers)
- state: none mutated
- topic: login

### tests/e2e/auth-types.spec.ts
- describes: Auth types
- tests: 7 ; set up collection/folder/requests; API key in header persists after reload; API key in query string persists; OAuth 2.0 token persists as bearer; collection auth persists after reload; inherit sends collection auth; folder auth overrides collection
- fixture: page
- login: ui-login new user (local login() with fixed EMAIL)
- state: one fixed-email user with a collection tree; serial, steps share the collection built in test 1
- topic: auth-types

### tests/e2e/auth.spec.ts
- describes: Authentication; sign-out
- tests: 6 ; login fails for non-existent user; register new user; login and logout; forced first-login password change; expired session handled; SSO option shown when enabled
- fixture: page
- login: ui-login (new user via API register in beforeAll, plus UI login/logout); also cookie injection for expired session test
- state: new unique users; toggles SSO/login settings (check); beforeAll registers user
- topic: login

### tests/e2e/collection-actions.spec.ts
- describes: Collection Actions
- tests: 5 ; set up two workspaces and documented collection; View Documentation renders every request; Copy to Workspace (collection); Copy to Workspace (single request); Export downloads collection JSON
- fixture: page
- login: ui-login new user (local login() helper, fixed EMAIL, password123)
- state: a new user with two workspaces, a collection, copies; serial, ordered (setup test builds data the rest use)
- topic: collection

### tests/e2e/collection-pin.spec.ts
- describes: Pinned collections
- tests: 1 ; pinned collection stays on top across sort modes
- fixture: page
- login: registerUser (new unique user)
- state: new unique user and collections; no serial
- topic: collection

### tests/e2e/collection-settings-gear.spec.ts
- describes: none
- tests: 1 ; gear next to a collection opens its settings
- fixture: page
- login: registerUser (new unique user)
- state: new unique user and collection
- topic: collection

### tests/e2e/collection-sort.spec.ts
- describes: Collection menu and sort
- tests: 2 ; collection menu drops New Request, Sort A-Z, Forward; collections sort by name, creation, manual order
- fixture: page
- login: registerUser (new unique user)
- state: new unique user with several collections; no serial
- topic: collection

### tests/e2e/collection.spec.ts
- describes: Collection Operations
- tests: 5 ; login and create workspace; create a collection; create folder inside collection; rename collection and delete folder; duplicate, move between folders, reorder survives reload
- fixture: page
- login: ui-login admin (inline login, admin / admin123456 seeded user)
- state: admin's workspaces and collections; serial (later tests use the collection built earlier)
- topic: collection

### tests/e2e/comments.spec.ts
- describes: Request comments
- tests: 5 ; comment survives reload and shows author; second comment appended; deleting a comment removes it server-side; teammate sees real author, cannot delete; posting comment leaves tab clean
- fixture: both
- login: ui-login owner (fixed account, password123) and a teammate
- state: fixed owner account plus teammate, shared workspace, request comments; serial, ordered
- topic: comments

### tests/e2e/concurrency.spec.ts
- describes: Concurrency & Tabs
- tests: 1 ; open multiple tabs, delayed request completes in background
- fixture: page
- login: ui register new user (inline register-email)
- state: one new unique user; no serial
- topic: concurrency

### tests/e2e/conflict.spec.ts
- describes: Conflict Resolution
- tests: 1 ; User B gets overwrite prompt when saving outdated request
- fixture: browser (two separate browser contexts, pages A and B)
- login: ui register two new unique users (inline register-email)
- state: two new users, shared workspace, one request; no serial
- topic: conflict

### tests/e2e/connections.spec.ts
- describes: Connection Tabs
- tests: 8 ; WebSocket connect/send/echo/disconnect; WebSocket Enter key connects; WebSocket server-side close reported; SSE receives pushed events; Kafka desktop-only message; WebSocket read/unread marks; WebSocket auth/SSL options desktop-only; connect failures for WS and SSE reported
- fixture: page
- login: ui register new unique user (inline register-email)
- state: new unique user; starts local WS/SSE servers in-test; serial
- topic: sockets

### tests/e2e/cookies-console.spec.ts
- describes: Cookies & Console
- tests: 5 ; cookie in manager attached to matching domain; cookie for different domain not attached; cookies survive reload, delete removes; Console logs script output and resolved auth; form-data request expanded in Console
- fixture: page
- login: ui register new unique user (inline register-email) and page.request PUT /api/auth/settings (sendCookies: true) for the session
- state: per-user cookie jar and global "sendCookies" user setting; serial
- topic: cookies

### tests/e2e/crud-rename.spec.ts
- describes: Full CRUD / Rename Matrix
- tests: 1 (single test with matrix steps; 2 `test(` tokens in file) ; Matrix Test: rename workspace, collection, request, variable, parameter
- fixture: both
- login: other: API register in beforeAll (new unique user), then UI login
- state: new unique user and workspace data; beforeAll setup
- topic: crud

### tests/e2e/curl-parser.spec.ts
- describes: cURL import parser
- tests: 4 ; BUG-05 --data-raw/--json/-F imply POST; BUG-06 --request DELETE honoured; BUG-07 -u becomes basic auth; BUG-08 URL without scheme kept
- fixture: neither
- login: none (pure parser)
- state: none
- topic: import

### tests/e2e/edgecases.spec.ts
- describes: Edge Cases
- tests: 1 ; strip JSON comments from request body
- fixture: page
- login: ui register new unique user (inline register-email)
- state: new unique user; no serial
- topic: request-body

### tests/e2e/editor-layout.spec.ts
- describes: none
- tests: 1 ; request editor keeps usable height with console open
- fixture: page
- login: registerUser (new unique user)
- state: new unique user
- topic: ui-layout

### tests/e2e/editor-placeholder.spec.ts
- describes: none
- tests: 1 ; empty raw body editor shows placeholder that disappears on typing
- fixture: page
- login: registerUser (new unique user)
- state: new unique user
- topic: ui-layout

### tests/e2e/electron-app.spec.ts
- describes: Electron desktop app
- tests: 8 ; second launch does not open second window; target=_blank opens system browser; window cannot navigate to foreign site; sign-in providers (Google / Microsoft) start; custom identity provider start; moving between IdP pages; "Work offline instead" on login; custom OAuth provider returns to app
- fixture: electron
- login: other: apiAsAdmin for custom IdP config plus mock IdP (mock-idp) for OAuth flows
- state: global OAuth/identity-provider config (admin), electron app instance; no serial declared
- topic: electron

### tests/e2e/electron-bridge.spec.ts
- describes: none
- tests: 1 ; test page is the target it claims to be (electron bridge present)
- fixture: electron (runs in the electron project; uses page)
- login: none
- state: none
- topic: electron

### tests/e2e/env-key-suggestions.spec.ts
- describes: none
- tests: 1 ; variable name field suggests current-environment names, then others
- fixture: page
- login: registerUser + apiAs (new unique user)
- state: new unique user, environments and variables; no serial
- topic: env-variables

### tests/e2e/env-quicklook-actions.spec.ts
- describes: Environment quick look: copy and inline edit
- tests: 1 ; owner edits value inline (persists); viewer can copy
- fixture: both
- login: registerUser + apiAs (owner and viewer, new unique users)
- state: two new users, shared workspace, environment with variables; no serial
- topic: environments

### tests/e2e/environments-crud.spec.ts
- describes: Environment sidebar actions
- tests: 4 ; Duplicate copies environment and variables; Rename and Delete persist; Copy to Workspace copies to other workspace; editor (test 4 title truncated in source)
- fixture: page
- login: registerUser + apiAs (new unique user)
- state: new user with two workspaces and environments; no serial
- topic: environments

### tests/e2e/environments.spec.ts
- describes: Environments Operations
- tests: 3 ; Login and create workspace; create environment, add variable, select and verify; secret masking, globals-vs-env precedence, export
- fixture: page
- login: ui-login admin (inline, admin / admin123456)
- state: admin's workspace and environments; serial, ordered
- topic: environments

### tests/e2e/escape-modals.spec.ts
- describes: none
- tests: 1 ; Escape closes collection runner and cancels confirm
- fixture: page
- login: registerUser (new unique user)
- state: new unique user; no serial
- topic: ui-modals

### tests/e2e/extension.spec.ts
- describes: none
- tests: 1 ; extension transport works
- fixture: both (context with the extension loaded, plus page)
- login: none found (hits /api/auth/me on localhost:3005 only)
- state: browser extension loaded into a persistent context
- topic: extension

### tests/e2e/first-run-setup.spec.ts
- describes: none
- tests: 1 ; first-run setup is closed once a superadmin exists
- fixture: request
- login: none (api auth config and setup endpoint; creates the superadmin via POST /api/auth/setup)
- state: global first-run state: needs a fresh DB where no superadmin exists yet; ordering matters (must run before other specs seed an admin; not serial-annotated)
- topic: first-run

### tests/e2e/fix-A5.6.spec.ts
- describes: A5.6 forced password change enforced server-side
- tests: 1 ; mustChangePassword session gets 403 on data APIs
- fixture: neither (args none; helpers use the API request)
- login: other: apiAsAdmin + API login (/api/auth/login) for a flagged user
- state: admin-created user flagged mustChangePassword; new unique user
- topic: admin

### tests/e2e/fix-D12.1.spec.ts
- describes: none
- tests: 1 ; Set-Cookie from a response is captured into the cookie jar
- fixture: page
- login: registerUser (new unique user)
- state: new user, cookie jar; no serial
- topic: cookies

### tests/e2e/fix-I2.1.spec.ts
- describes: [I2.1] response Headers tab
- tests: 2 ; repeated headers listed one per row; web transport lists CORS-exposed response headers
- fixture: page
- login: registerUser (new unique user)
- state: new user; no serial
- topic: response-viewer

### tests/e2e/fix-I2.2.spec.ts
- describes: none
- tests: 1 ; Cookies tab lists Set-Cookie cookies
- fixture: page
- login: registerUser (new unique user)
- state: new user, cookie jar; no serial
- topic: cookies

### tests/e2e/fix-I2.4.spec.ts
- describes: none
- tests: 1 ; JSON Path filter supports recursive and filter expressions
- fixture: page
- login: registerUser (new unique user)
- state: new user; no serial
- topic: response-viewer

### tests/e2e/fix-I4.4.spec.ts
- describes: I4.4 mixed content error explanation
- tests: 1 ; blocked plain-HTTP request mentions mixed content
- fixture: page
- login: registerUser (new unique user)
- state: new user; no serial
- topic: errors-ui

### tests/e2e/fix-I4.5.spec.ts
- describes: none
- tests: 1 ; SSL/certificate failure explains SSL and hint
- fixture: page
- login: registerUser (new unique user)
- state: new user; no serial
- topic: errors-ui

### tests/e2e/fix-K1.3.spec.ts
- describes: none
- tests: 1 ; history search filters by response status code
- fixture: page
- login: API register (new unique user) then addCookies / storageState injection
- state: new user with history rows; no serial
- topic: history

### tests/e2e/fix-K4.4.spec.ts
- describes: K — history
- tests: 1 ; Clear with active search removes only filtered rows
- fixture: page
- login: API register + cookie/storageState injection, plus loginUi
- state: new user with history rows; no serial
- topic: history

### tests/e2e/fix-K4.6.spec.ts
- describes: none
- tests: 1 ; DELETE /api/history requires workspaceId and not deleting all
- fixture: neither (args none; uses API)
- login: API register (new unique user)
- state: new user's history; no serial
- topic: history

### tests/e2e/fix-M1.4.spec.ts
- describes: none
- tests: 1 ; share link exposes no server-side request execution
- fixture: neither
- login: API register (new unique user)
- state: new user, share link; no serial
- topic: share

### tests/e2e/fix-P3.1.spec.ts
- describes: none
- tests: 2 ; configured proxy passed to transport; plain web build (no extension) app warns
- fixture: page
- login: registerUser (new unique user)
- state: new user, per-request proxy setting; no serial
- topic: proxy

### tests/e2e/fix-Q1.1.spec.ts
- describes: none
- tests: 1 ; admin users list: search combined with cursor paging
- fixture: neither
- login: apiAsAdmin (seeded admin, API)
- state: reads admin users list; creates users as needed; no serial
- topic: admin

### tests/e2e/fix-Q5.1.spec.ts
- describes: Q5.1 admin workspaces table
- tests: 1 ; admin Workspaces table shows Owner and requests
- fixture: page
- login: ui-login admin (loginAdminUi)
- state: reads admin workspaces; no writes; no serial
- topic: admin

### tests/e2e/fix-Q6.5.spec.ts
- describes: Q6.5 audit log escaping (API)
- tests: 1 ; audit-log response never carries raw HTML from user input
- fixture: neither
- login: apiAsAdmin + API register (new unique user to generate entries)
- state: writes audit-log entries; global audit log; no serial
- topic: admin

### tests/e2e/fix-Q7.2.spec.ts
- describes: Q7.2 errors dashboard
- tests: 1 ; errors can be sorted by count and bounded by a date range
- fixture: both
- login: ui-login admin (loginAdminUi)
- state: reads/sorts error rows; seeded fperrors reads; no serial
- topic: admin

### tests/e2e/fix-Q7.7.spec.ts
- describes: Q7.7 no internal 500s from malformed input; Q7.7 fork / request update-delete never answer 5xx
- tests: 3 ; NUL-byte ids on share/fork return 4xx; fork, PUT and DELETE reject bad input; concurrent /api/admin/users reads never answer 5xx
- fixture: neither
- login: apiAsAdmin + API register (new unique users)
- state: new user, workspace/request ids; concurrent admin reads; no serial
- topic: api-validation

### tests/e2e/fix-Q8.1.spec.ts
- describes: Q8.1 admin history limits
- tests: 1 ; System Settings has max-records and retention-days
- fixture: page
- login: ui-login admin (loginAdminUi) + expandAdminSections + apiAsAdmin
- state: global system config (history limits); reads/writes global settings; no serial
- topic: admin-settings

### tests/e2e/fix-Q8.6.spec.ts
- describes: Q8.6 allowPrivateTargets switch (SMTP test; the server no longer ...)
- tests: 1 ; SMTP Test Connection to a private address is blocked when the switch is off
- fixture: neither
- login: apiAsAdmin
- state: global config (allowPrivateTargets switch); toggles it and must restore; no serial
- topic: admin-settings

### tests/e2e/fix-Q9.2.spec.ts
- describes: Q9.2 SMTP Test Connection SSRF guard
- tests: 1 ; SMTP Test Connection refuses private targets when switch is off
- fixture: neither
- login: apiAsAdmin
- state: global SMTP/private-target config; no serial
- topic: admin-settings

### tests/e2e/fix-Q9.6.spec.ts
- describes: Q9.6 SMTP test connection double click
- tests: 1 ; double-clicking Test Connection sends a single request
- fixture: page
- login: ui-login admin (loginAdminUi) + expandAdminSections
- state: global SMTP settings screen; no writes beyond test call; no serial
- topic: admin-settings

### tests/e2e/fix-R2.5.spec.ts
- describes: R2.5 extension download; extension crx download; extension crx zip download
- tests: 3 ; reqspace-transport.zip served as zip; .crx is a CRX3 wrapper; crx zip holds the crx
- fixture: neither (plain HTTP GETs on the API server; check fixtures import only)
- login: none
- state: none (read-only static download)
- topic: extension-download

### tests/e2e/fix-R3.3.spec.ts
- describes: none
- tests: 1 ; migration 007 emits no double-quoted identifiers under mysql dialect
- fixture: neither (no fixtures import)
- login: none
- state: none (reads migration source / generated SQL)
- topic: migrations

### tests/e2e/fix-R3.3b.spec.ts
- describes: none
- tests: 2 ; migrations emit no double-quoted identifiers under mysql dialect; real migration chain still succeeds on sqlite
- fixture: neither
- login: none
- state: second test runs the real migration chain against a SQLite file (needs its own DB file, not shared)
- topic: migrations

### tests/e2e/fix-R3.3c.spec.ts
- describes: none
- tests: 1 ; migration 014 emits no double-quoted identifiers under mysql dialect
- fixture: neither
- login: none
- state: none (static migration check)
- topic: migrations

### tests/e2e/fix-R3.7.spec.ts
- describes: R3.7 concurrent migrations
- tests: 1 ; two processes migrating same SQLite DB concurrently both succeed
- fixture: neither
- login: none
- state: spawns two processes against one temp SQLite file; needs its own fresh DB; no serial
- topic: migrations

### tests/e2e/fix-R6.6.spec.ts
- describes: none
- tests: 1 ; initial JS (entry + preloads) stays under budget
- fixture: neither
- login: none
- state: none (reads build output / bundle sizes)
- topic: perf-bundle

### tests/e2e/fork.spec.ts
- describes: Smart Fork (collection fork + auto-sync)
- tests: 2 ; fork from shared workspace into personal workspace, see live update via socket; fork action not offered inside personal workspace
- fixture: both
- login: inline UI register (register-email) for two users (owner and forker)
- state: two new users, shared and personal workspaces, collection fork; no serial
- topic: fork

### tests/e2e/get-app-download.spec.ts
- describes: none
- tests: 2 ; Get app hidden inside desktop app; Get app button opens download modal with desktop and extension options
- fixture: page
- login: registerUser (new unique user)
- state: new user; no serial
- topic: app-download

### tests/e2e/global-search.spec.ts
- describes: Global Search
- tests: 5 ; builds searchable tree; Ctrl+K finds collections, folders, requests by name; matches request by URL; arrow keys move selection and Enter opens; clicking a result opens it, miss says so, Escape closes
- fixture: page
- login: ui register new unique user (inline register-email via /login)
- state: new user with a tree of collections, folders, requests; serial, ordered (builds tree in first test)
- topic: search

### tests/e2e/group-scripts-activity.spec.ts
- describes: Group test scripts & workspace activity
- tests: 2 ; collection, folder and request test scripts all run; Activity tab lists audit entries
- fixture: page
- login: ui-login new user (inline login with fixed EMAIL, password123)
- state: new user with collection/folder/request scripts and audit entries; serial
- topic: scripts

### tests/e2e/history-keyboard-actions.spec.ts
- describes: none
- tests: 2 ; history Save/Delete buttons visible when keyboard focus lands in row (+1 more)
- fixture: page
- login: registerUser (new unique user)
- state: new user with history rows; no serial
- topic: history

### tests/e2e/history.spec.ts
- describes: none (top-level test.describe.serial, flagged serial/beforeAll)
- tests: 4 ; request history is logged and replayable; search history; save to collection from history; quota: large response bodies truncated, not excluded
- fixture: both
- login: API register in beforeAll (new unique user), then UI login per test
- state: one new user with history; beforeAll + serial, ordered
- topic: history

### tests/e2e/import-export.spec.ts
- describes: Import / Export
- tests: 1 ; should export workspace data and import it successfully
- fixture: page
- login: ui-login admin (inline login as seeded admin admin / admin123456)
- state: admin's workspace export/import; creates data in the admin account; no serial
- topic: import-export

### tests/e2e/import.spec.ts
- describes: Import
- tests: 9 ; Postman collection imports with folders; exported collection imports back as identical copy; pasted OpenAPI spec becomes collection; cURL and raw HTTP open ready tab; non-collection file rejected with message; exported environment imports back with variables; JSON dropped anywhere opens Import; import shows detected name and imports under edited name; cURL rejects non-cURL input
- fixture: page
- login: registerUser (new unique users, about 10 calls)
- state: new unique users, imported collections and environments; no serial
- topic: import

### tests/e2e/large-response.spec.ts
- describes: none
- tests: 2 (plus one more `test(` title that spans lines, 3 registerUser calls) ; 100MB JSON response shows "too large" and keeps page; 1MB response not stored in history
- fixture: page
- login: registerUser (new unique user)
- state: new user; generates large responses via local server; no serial
- topic: large-response

### tests/e2e/load-test.spec.ts
- describes: Load Tester
- tests: 4 ; runs exactly configured iterations; failures counted separately; concurrency runs workers in parallel; Stop halts a run in progress
- fixture: page
- login: ui register new unique user (inline register-email)
- state: new user; starts local hit counter server; serial
- topic: load-test

### tests/e2e/manual-failed-abc.spec.ts
- describes: A — auth & accounts (UI / sockets); B — workspaces realtime / UI; C — collection tree
- tests: 19 ; A1.10 double-click Sign In sends single login; A1.11 signed-in user opening /login redirected; A4.6 logout offline clears session; A9.3 suspending user disconnects WebSocket; B1.7/B3.3 deleting workspace moves members; B2.1 rename updates other members live; B4.7 member search debounce; B6.2 removing member drops workspace; B6.6 removed member socket stops; C1.8 viewer not offered editing; C2.4 rename request updates open tab; C3.1 delete closes open tab; C7.1/C7.2 tree filter; C7.6 large tree filter responsive; C9.5 docs mask secrets; C10.4 duplicate twice distinct names; C10.5 Copy to Workspace partial failure; C10.6 Copy dialog warns about variables
- fixture: page
- login: registerUser (about 9 new users) plus cookie injection (6), apiAsAdmin and apiAs for setup
- state: many new users, workspaces, collections, sockets; admin suspend/delete actions; no serial
- topic: auth-realtime

### tests/e2e/manual-failed-api.spec.ts
- describes: A — auth & accounts (API); B — workspaces & members (API); C — tree (API); G/P — settings (API); K — history (API); Q — admin (API); R — server (API); settings keys
- tests: 39 ; A1.6 login trims email; A1.7 malformed email 400; A2.5 register validation; A2.7 concurrent registration same email; A4.2 logout revokes token; A5.2 same-password refused; A5.8 password change revokes sessions; A5.6 mustChangePassword blocked; A8.3 identity headers ignored; B1.5 personal workspace cannot be deleted; B2.2 public workspace listed; B5.3 last owner cannot demote; B5.5 role change in activity; B6.3 member can leave; B7.1/B7.2 activity log and paging; B8.1 viewer gets 403; C2.2 empty rename refused; C3.5 delete nested request; D6.3 stale save answers; D6.2 demotion 403; P2.2 negative settings rejected; K1.3/K4.4/K4.6 history API; Q1.5 no passwordHash; Q5.1/Q5.3 admin workspaces; Q6.5 audit escaping; Q7.5 errors rate-limited; Q8.3 system config validation; Q9.2/Q9.6 SMTP; R2.2 unknown /api JSON 404; R2.5 extension zip; R5.3 cross-origin POST refused; R5.5 spoofed X-Forwarded-For; R-CONC 20 parallel workspace creations; SETTINGS-KEYS PUT /auth/settings
- fixture: request (args none; helpers use API)
- login: apiAsAdmin (9 calls), API register (5), API login (4), plus cookie and storageState injection
- state: many new users, global admin config (system config, SMTP, settings), rate-limit buckets (login 15/15min, register 10/hour per IP per CLAUDE memory); changing global config and admin users; no serial
- topic: api-security

### tests/e2e/manual-failed-d.spec.ts
- describes: D - requests and HTTP (UI, failed-manual-test regressions)
- tests: 25 ; D1.3 fragment not leaked; D1.5 URL without scheme; D1.6 empty URL validation; D1.10 user:pass in URL sent as Basic; D1.11 autocomplete ArrowDown+Enter; D2.3 duplicate headers folded; D2.5 forbidden Host header visible; D2.6 Unicode header; D2.7 token in header resolved; D2.8 Console Content-Length; D3.1 JSON comments stripped; D3.4 form-data file field persists; D4.8 Verify SSL off warns; D4.9 local proxy unsupported flag; D8.3 user B gets saved changes; D10.3 viewer empty personal workspace; D-SETTINGS global settings save; D12.2 cookie path matching; D12.3 Secure cookies not sent over http; D12.4 cookie add/edit/delete; D12.7 auto-send setting off; D13.1 load test p95 report; D13.3 invalid iterations rejected; D13.4 5xx count as Failed; D13.6 load test resolves variables
- fixture: both
- login: registerUser (6 new users), cookie (30 calls), apiAs (4), beforeAll x2
- state: many new users, workspaces, cookie jars, global settings (D-SETTINGS, cookie auto-send), load-test runs; beforeAll setup; no serial
- topic: requests-http

### tests/e2e/manual-failed-efgi.spec.ts
- describes: E — auth tokens; F — scripts; G — variables and environments; I — response viewer
- tests: 21 ; E1.1 bearer resolves token from env; E4.2 custom bearer prefix; F1.1 variable scopes; F1.2 pm.request changes; F1.4 pm.environment.unset; F2.2 pm.response accessors; F4.6 console.log of circular objects; G1.1 env variables resolve; G1.5 selected env survives reload; G1.6 unsaved env edit flagged; G3.3 copy env twice; G4.2 secret values not returned; G5.2 collectionVariables set; G8.3 dynamic variable in env; I1.4 PDF and binary download; I3.4 Authorization masked in console; I3.5 console keeps 1000 entries; I3.6 unresolved variable flagged; I4.2 connection refused explained; I4.3 unreachable response explained; I4.6 Cancel aborts request
- fixture: page
- login: registerUser (2 new users), API register (1)
- state: new users, environments, collection and global variables, console entries; no serial
- topic: scripts-variables

### tests/e2e/manual-failed-jklm.spec.ts
- describes: J — runner; K — history; L — import / export; M — share & fork
- tests: 36 ; J1.4 iterations validation; J1.9 subset runner; J1.12 run recorded in History; J1.13 Export Results; J2.1 row per iteration; J2.2 CSV data file parse; J2.4 broken data file error; J2.6 remove data file; J3.1 Stop aborts in-flight request; J3.2 Stop interrupts delay; K1.4 history Load more; K1.7 network-failed request recorded; K1.9 history across tabs; K2.4 simultaneous history saves; K3.2 huge body truncated; K3.3 1MB file form-data not stored; K4.3 history switch off; L1.9 unique collection names on re-import; L1.10 multi-file import; L2.1 OpenAPI YAML; L2.3 securitySchemes mapped; L2.4 $ref in body; L3.1 cURL POST+header+JSON; L3.4 cURL -F; L3.5 cURL -u basic auth; L3.6 paste cURL into URL bar; L4.5 WSDL import; L5.3 workspace dump into non-empty workspace; L5.5 dump has no secrets; M1.2 public share no secrets; M1.3 anonymous share read-only; M1.3b share links listed; M1.7 invalid share ids; M1.14 share page Fork button; M2.6 second fork succeeds; M3.1 fork team to personal
- fixture: both (context and page)
- login: loginUi (11 calls), apiAsAdmin (4), register (1), cookie/storageState injection
- state: new users, workspaces, shares, forks, history rows, global history setting (K4.3); runner and realtime; no serial
- topic: runner-history-import-share

### tests/e2e/manual-failed-nop.spec.ts
- describes: N — realtime access changes; O — connections (real servers); P — search, settings, certs, theme; P2.4 offline; P3.1 desktop transport @electron
- tests: 33 ; N1.12 removed member pushed live; N1.12 role change pushed live; O1.4 WebSocket subprotocol; O1.8 connection settings survive reload; O1.9 {{var}} in WS URL; O2.1 Socket.IO namespace/path/auth; O2.2 Socket.IO listen filter; O2.3 Socket.IO emit array; O2.5 reserved event names refused; O2.8 closing Socket.IO tab; O3.1 SSE named events; O3.2 SSE custom headers; O3.3 SSE reconnect; O3.4 SSE HTTP status errors; O4.1 Kafka desktop-only; P1.2 global search path; P2.4 failed settings save rolls back; P2.5 per-request settings; P3.1 local proxy; P3.2 invalid proxy URL; P3.3 no-proxy field; P3.4 proxy password masked; P3.5 rebindable shortcuts; P3.7 reserved shortcuts; P4.2 mTLS server; P4.3 mTLS hostname matching; P4.4 invalid cert files; P4.8 duplicate hostname certificate; P4.10 plain browser no client cert; P5.2 prefers-color-scheme; P5.3 Monaco theme live; P6.1 first visit without extension prompts
- fixture: both (browser, page)
- login: registerUser (17 new users), apiAs (4), API register (1)
- state: new users, workspace members for N1.12 (realtime removals), websocket/SSE/Socket.IO servers started in-test, global settings (proxy, certificates, shortcuts, theme); no serial
- topic: realtime-connections-settings

### tests/e2e/manual-failed-qrsuv.spec.ts
- describes: Q — admin (API); Q7.4 dedupe; R — server / build; S — browser extension (static); V — cross-cutting UI
- tests: 21 ; Q2.5 two admins revoking each other; Q6.1 failed login in audit log; Q6.2 audit paging/filters; Q7.2 errors sorted; Q7.4 repeated client error deduped; Q8.1 system config history limits; Q8.6 allow private targets switch; Q9.1 SMTP detailed error; R1.1 DB connection failure screen; R3.3 migration 007 dialect quoting; R3.7 concurrent servers on one DB; R6.6 Monaco lazy; S2.3 options.js origin validation; S2.6 content.js silent on other pages; S3.3 DNR escaped regex; S3.5 binary response base64; S3.6 Set-Cookie via webRequest; S3.8 Cancel wired end to end; V3.4 ContextMenu closes on Escape; V3.5 Confirm modal Enter; V4.2 Back/Forward not blank
- fixture: page
- login: apiAsAdmin (9), API register (1), cookie (1), API login (1)
- state: admin global config (system config, SMTP, private targets), admin revoke races, audit log entries, error rows; R1.1 simulates a DB outage; R3.7 spawns servers on one DB; no serial
- topic: admin-server-extension-ui

### tests/e2e/manual-pass-bugs.spec.ts
- describes: Manual-pass bugs (regressions of bugs found by hand)
- tests: 4 ; BUG-01 superadmin; BUG-02 viewer not offered editor-only tree actions; BUG-03 existing share link still visible and revocable; BUG-04 SMTP Test Connection with empty host names the field
- fixture: both
- login: registerUser (4 new users), loginAdminUi (2), expandAdminSections, apiAsAdmin (2), apiAs (2)
- state: new users, admin config (SMTP), share links; no serial
- topic: regressions

### tests/e2e/missing-variable-target.spec.ts
- describes: none
- tests: 3 ; missing variable scope defaults to Personal; missing variable created in chosen environment; missing variable created in global environment
- fixture: page
- login: registerUser (4 new users), apiAs (3)
- state: new users, environments and global variables; no serial
- topic: env-variables

### tests/e2e/missing-variable-viewer.spec.ts
- describes: none
- tests: 1 ; viewer: missing-variable modal offers Personal only
- fixture: both (browser, page)
- login: registerUser (3 new users), apiAs (2)
- state: owner and viewer users, shared workspace; no serial
- topic: env-variables

### tests/e2e/oauth-custom.spec.ts
- describes: Custom OAuth2 / OIDC provider (mock identity provider)
- tests: 7 ; login page shows configured label and secret; allowed sign-in creates account; returning user same account; denied sign-in shows error; unverified email refused; provider with no email refused; admin API rejects non-http(s) provider URL
- fixture: page
- login: other: apiAsAdmin (3) to configure provider; sign-in via mock IdP (mock-idp); beforeAll starts mock IdP
- state: global OAuth provider config (admin), mock IdP server, new accounts created by sign-in; beforeAll; no serial declared, order-dependent on account reuse
- topic: oauth

### tests/e2e/oauth-providers.spec.ts
- describes: OAuth providers (GitHub, Microsoft) and removal of header auth
- tests: 5 ; admin stores GitHub and Microsoft config, secrets masked; optional per-provider proxy URL stored and validated; sign-in page offers each enabled provider; legacy X-Auth-User header no longer authenticates (+1 more)
- fixture: page
- login: apiAsAdmin (4); none for end users
- state: global OAuth provider config (GitHub/Microsoft secrets and proxy); no serial
- topic: oauth

### tests/e2e/perf-actions.spec.ts
- describes: Action latency under load
- tests: 5 ; drag request into folder shows within budget; duplicate request within budget; save clears unsaved marker within budget; switching tabs within budget; Duplicate Tab opens unsaved copy
- fixture: page
- login: ui-login (loginUi, 2 calls); seeded data from ./perf-seed
- state: seeded collection/folder/request tree with perf-seed; latency-sensitive; serial
- topic: perf

### tests/e2e/permission-toast.spec.ts
- describes: none
- tests: 1 ; viewer attempting editor-only action sees explanation toast
- fixture: browser (owner and viewer in separate browser contexts)
- login: inline UI register (register-email) for owner and viewer
- state: two new users, shared workspace with viewer role; no serial
- topic: rbac-toast

### tests/e2e/pm-api.spec.ts
- describes: none
- tests: 5 ; pm.request / pm.response: every member of API works; pm.response negative control shows Fail; Collection Runner applies pre-request changes (addHeader); runner applies pre-request body and header-values; pm.iterationData is the data row
- fixture: page
- login: cookie injection (1); none via UI; uses ./reproductions/scene helper
- state: collection and scripts; runner runs; no serial
- topic: scripts

### tests/e2e/primary-button-contrast.spec.ts
- describes: none
- tests: 1 ; primary submit button has >= 4.5:1 contrast for white text
- fixture: page
- login: none found (renders login/primary button page)
- state: none mutated
- topic: ui-theme

### tests/e2e/profile-variables-cross-workspace.spec.ts
- describes: Profile variables across workspaces
- tests: 4 ; set up two workspaces and profile variable in A; profile variable still there after reload; resolves in request from workspace B; edits made in B visible back in A
- fixture: page
- login: ui-login new user (inline login with fixed EMAIL, password123)
- state: one new user with two workspaces and profile variables; serial, ordered
- topic: env-variables

### tests/e2e/rbac.spec.ts
- describes: RBAC Roles
- tests: 1 ; Viewer cannot edit, Editor can edit
- fixture: browser (separate contexts for owner, editor, viewer)
- login: inline UI register (register-email) for each role
- state: new unique users, shared workspace with roles; no serial
- topic: rbac

### tests/e2e/realtime-move.spec.ts
- describes: none
- tests: 1 ; request and folder moved by teammate appear once
- fixture: both (browser, page)
- login: registerUser (3 new users), apiAs (2)
- state: two new users, shared workspace, realtime socket updates; no serial
- topic: realtime

### tests/e2e/redis-settings.spec.ts
- describes: Redis socket adapter settings
- tests: 1 ; test-connection and save accept reachable Redis, reject unreachable
- fixture: request (uses apiAsAdmin)
- login: apiAsAdmin (2)
- state: global Redis config (server.redis); changes and restores config (test asserts enabled=false after rejection); starts a local Redis-like server; no serial
- topic: admin-settings

### tests/e2e/reproductions/QA-10-first-run-screen.spec.ts
- describes: first-run setup screen
- tests: 2 ; does not offer the Register link; failed setup shows its error once inline only
- fixture: page
- login: none (first-run setup screen; setup state is global)
- state: global first-run state: needs DB without a superadmin; ordering-sensitive; no serial
- topic: first-run

### tests/e2e/reproductions/QA-13-add-variable-focus.spec.ts
- describes: Add variable focuses the key input
- tests: 2 ; environment editor; profile variables editor
- fixture: page
- login: registerUser (new unique user)
- state: new user, environment and profile variables; no serial
- topic: env-variables

### tests/e2e/reproductions/QA-14-env-save-feedback.spec.ts
- describes: none
- tests: 1 ; environment Save confirms with toast and is disabled after save
- fixture: page
- login: registerUser (new unique user)
- state: new user, environment; no serial
- topic: env-variables

### tests/e2e/reproductions/QA-14-request-save-feedback.spec.ts
- describes: none
- tests: 1 ; QA-14: saving a request shows success toast
- fixture: page
- login: registerUser (new unique user)
- state: new user, request; no serial
- topic: request-save

### tests/e2e/reproductions/QA-19-settings-escape.spec.ts
- describes: none
- tests: 1 ; Escape closes Global Settings
- fixture: page
- login: registerUser (new unique user)
- state: new user; no serial
- topic: ui-modals

### tests/e2e/reproductions/QA-20-rename-dirty-tab-not-conflict.spec.ts
- describes: none
- tests: 1 ; renaming a dirty request keeps the orange dirty dot (no conflict)
- fixture: page
- login: registerUser (new unique user)
- state: new user, request with unsaved edits; no serial
- topic: rename
